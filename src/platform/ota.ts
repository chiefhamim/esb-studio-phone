import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { App } from '@capacitor/app'

/** Where updates are published (Cloudflare, tools/release.mjs). Not GitHub, not Capgo's service. */
export const UPDATE_HOST = 'https://esb-studio-updates.hamim2964.workers.dev'

/** The release signing key (Ed25519, public half). The private half lives only on the release PC
 *  (~/.esb-ota/ed25519-private.pem, tools/release.mjs), never on the update host: whoever controls the host can swap a
 *  file and its sha256, but cannot sign it, so a swapped update is refused. */
const OTA_PUBLIC_KEY = '4OXe45T/O6IbbBYk++MoFqCEOG2rwbAKqa/xzJOdhnA='

/** The exact text a release signs (tools/release.mjs builds the same). */
export const signedText = (version: string, file: { file: string; sha256: string }) => `esb-ota-v1\n${version}\n${file.file}\n${file.sha256}`

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
async function signatureOk(text: string, sig: string | undefined): Promise<boolean> {
  if (!sig) return false
  try {
    const key = await crypto.subtle.importKey('raw', b64(OTA_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, b64(sig), new TextEncoder().encode(text))
  } catch {
    return false
  }
}

export interface AvailableUpdate {
  version: string
  url: string
  checksum?: string
  message?: string
  /** True when the installed app is too old for this release's native parts: the editor installs the full APK instead. */
  needsApk?: boolean
}

interface Manifest {
  version: string
  bundle?: { file: string; sha256: string; sig?: string }
  apk?: { file: string; sha256: string; sig?: string }
  /** Oldest installed app version that can take the web bundle; older installs need the APK. */
  minNative?: string
  message?: string
}

export interface CurrentBundle {
  version: string
  id: string
}

/** Notify native plugin that JavaScript loaded successfully. Prevents auto-rollback. */
export async function notifyAppReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await CapacitorUpdater.notifyAppReady()
  } catch (err) {
    console.warn('CapacitorUpdater.notifyAppReady failed:', err)
  }
}

/** Get info on the active running bundle. */
export async function getCurrentBundle(): Promise<CurrentBundle> {
  if (!Capacitor.isNativePlatform()) return { version: 'web', id: 'web' }
  try {
    const cur = await CapacitorUpdater.current()
    return {
      version: cur?.bundle?.version || 'builtin',
      id: cur?.bundle?.id || 'builtin',
    }
  } catch {
    return { version: 'builtin', id: 'builtin' }
  }
}

/** True when dotted version `a` is newer than `b` (non-numeric parts count as 0). */
export function isNewer(a: string, b: string): boolean {
  const n = (v: string) => v.split(/[.+-]/).map((x) => parseInt(x, 10) || 0)
  const [x, y] = [n(a), n(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

// The highest release this install ever accepted. Without it, after a rollback to the built-in bundle a compromised
// update host could replay an older (correctly signed, but vulnerable) release, since the check above only compares with
// what is running now. Not a secret, so plain storage; it is cleared only with the app's data.
const OTA_FLOOR_KEY = 'esb-phone/ota-floor'
export function otaFloor(): string {
  try { return localStorage.getItem(OTA_FLOOR_KEY) || '0.0.0' } catch { return '0.0.0' }
}
function raiseOtaFloor(v: string) {
  try { if (isNewer(v, otaFloor())) localStorage.setItem(OTA_FLOOR_KEY, v) } catch { /* not kept */ }
}

/** Look for a newer release on our own update host. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!Capacitor.isNativePlatform() || import.meta.env.VITE_NO_OTA) return null // cable builds (VITE_NO_OTA=1) never offer the web bundle
  try {
    const res = await fetch(`${UPDATE_HOST}/latest.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const m = (await res.json()) as Manifest
    if (!m.version || !/^\d/.test(m.version)) return null
    const cur = await getCurrentBundle()
    // Never offer a release that is not newer than what is running or than the installed app itself.
    const native = (await App.getInfo().catch(() => null))?.version ?? '0.0.0'
    const running = /^\d/.test(cur.version) ? cur.version : native
    raiseOtaFloor(running)
    if (!isNewer(m.version, native) || !isNewer(m.version, running) || !isNewer(m.version, otaFloor())) return null
    const needsApk = !!m.minNative && isNewer(m.minNative, native)
    const file = needsApk ? m.apk : m.bundle
    if (!file) return null
    // an unsigned or wrongly signed release is never offered (see OTA_PUBLIC_KEY)
    if (!/^[0-9a-f]{64}$/.test(file.sha256) || !(await signatureOk(signedText(m.version, file), file.sig))) {
      console.warn('Update refused: the release signature did not verify')
      return null
    }
    return { version: m.version, url: `${UPDATE_HOST}/${file.file}`, checksum: file.sha256, message: m.message, needsApk }
  } catch (err) {
    console.warn('Update check failed:', err)
    return null
  }
}

/** Download a bundle and reload the WebView with the new code. */
export async function downloadAndApplyUpdate(
  update: AvailableUpdate,
  onProgress?: (percent: number) => void,
): Promise<void> {
  // A native change cannot be swapped in silently: hand the APK to Android, which shows its own Install confirmation.
  if (update.needsApk) { window.open(update.url, '_system'); return }
  // An update replaces the whole web layer, which can read every secret the app holds: refuse one the server did not give a checksum for.
  if (!update.checksum) throw new Error('This update has no integrity checksum, so it was not installed.')
  let sub: { remove: () => Promise<void> } | null = null
  try {
    if (onProgress) sub = await CapacitorUpdater.addListener('download', (ev) => onProgress(Math.round(ev.percent || 0)))
    const bundle = await CapacitorUpdater.download({
      url: update.url,
      version: update.version,
      checksum: update.checksum,
    })
    raiseOtaFloor(update.version)
    await CapacitorUpdater.set({ id: bundle.id })
    await CapacitorUpdater.reload()
  } finally {
    if (sub) {
      await sub.remove().catch(() => undefined)
    }
  }
}

/** Subscribe to foreground app resume events to check for updates. */
export function watchForUpdatesOnResume(onFound: (update: AvailableUpdate) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}

  let checking = false
  const runCheck = async () => {
    if (checking) return
    checking = true
    try {
      const up = await checkForUpdate()
      if (up) onFound(up)
    } finally {
      checking = false
    }
  }

  const handle = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void runCheck()
  })

  // Initial check on boot
  void runCheck()

  return () => {
    void handle.then((h) => h.remove())
  }
}
