// Optional biometric app lock. DEFAULT OFF. The lock only gates the screen: secrets stay in the Keystore (src/secure.ts).
// Native side: BiometricPlugin.java (AndroidX BiometricPrompt: fingerprint / face, or the screen lock on Android 11+).
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'

export type BiometricReason = 'none-enrolled' | 'no-hardware' | 'hardware-unavailable' | 'update-required' | 'unavailable'
export type BiometricError = 'cancelled' | 'lockout' | 'timeout' | 'failed' | BiometricReason

interface BiometricApi {
  isAvailable(o?: { allowDeviceCredential?: boolean }): Promise<{ available: boolean; reason?: BiometricReason }>
  authenticate(o?: { title?: string; subtitle?: string; cancelLabel?: string; allowDeviceCredential?: boolean }): Promise<{ success: boolean }>
}
const Bio = registerPlugin<BiometricApi>('Biometric')

const KEY = 'esb-app-lock' // a plain on/off flag, not a secret
const GRACE_MS = 30_000 // leaving the app for less than this does not lock it

export async function isBiometricAvailable(): Promise<{ available: boolean; reason?: BiometricReason }> {
  if (!Capacitor.isNativePlatform()) return { available: false, reason: 'unavailable' }
  try { return await Bio.isAvailable({ allowDeviceCredential: true }) } catch { return { available: false, reason: 'unavailable' } }
}

let lastError: BiometricError | null = null
/** Why the last authenticate() returned false ('cancelled', 'lockout', ...). */
export const getLastBiometricError = () => lastError

/** Shows the system prompt. Resolves true on success, false on cancel or failure. */
export async function authenticate(title = 'Unlock ESB Studio', subtitle?: string): Promise<boolean> {
  lastError = null
  if (!Capacitor.isNativePlatform()) { lastError = 'unavailable'; return false }
  try {
    const r = await Bio.authenticate({ title, subtitle, allowDeviceCredential: true })
    return r.success === true
  } catch (e) {
    lastError = ((e as { code?: string }).code as BiometricError) ?? 'failed'
    return false
  }
}

export function isAppLockEnabled(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

// ---- lock state (for the lock screen) ----
let locked = false
const subs = new Set<(l: boolean) => void>()
function setLocked(v: boolean) { if (locked !== v) { locked = v; subs.forEach((f) => f(v)) } }
export const isLocked = () => locked
export function onLockChange(cb: (locked: boolean) => void): () => void { subs.add(cb); return () => { subs.delete(cb) } }

/** Turning ON asks the phone to authenticate first (proves it works). Returns the resulting state. */
export async function setAppLockEnabled(on: boolean): Promise<boolean> {
  if (!on) {
    try { localStorage.removeItem(KEY) } catch { /* storage blocked */ }
    setLocked(false)
    return false
  }
  const a = await isBiometricAvailable()
  if (!a.available) return false
  if (!(await authenticate('Turn on app lock'))) return false
  try { localStorage.setItem(KEY, '1') } catch { return false }
  return true
}

/** Ask for the fingerprint or face. Clears the lock on success. Call from the lock screen on show and on its Unlock button. */
export async function unlock(): Promise<boolean> {
  const ok = await authenticate()
  if (ok) setLocked(false)
  return ok
}

let started = false
/** Call once at start-up. Locks at launch and after the app was in the background longer than 30 s, while enabled. */
export function startAppLock(): void {
  if (started || !Capacitor.isNativePlatform()) return
  started = true
  if (isAppLockEnabled()) setLocked(true)
  let hiddenAt = 0
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isAppLockEnabled()) return
    if (!isActive) hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > GRACE_MS) setLocked(true)
  })
}
