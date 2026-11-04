import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { App } from '@capacitor/app'

/** Where updates are published (Cloudflare, tools/release.mjs). Not GitHub, not Capgo's service. */
export const UPDATE_HOST = 'https://esb-studio-updates.hamim2964.workers.dev'

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
  bundle?: { file: string; sha256: string }
  apk?: { file: string; sha256: string }
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
    if (!isNewer(m.version, native) || !isNewer(m.version, running)) return null
    const needsApk = !!m.minNative && isNewer(m.minNative, native)
    const file = needsApk ? m.apk : m.bundle
    if (!file) return null
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
  let sub: { remove: () => Promise<void> } | null = null
  if (onProgress) {
    sub = await CapacitorUpdater.addListener('download', (ev) => {
      onProgress(Math.round(ev.percent || 0))
    })
  }

  // An update replaces the whole web layer, which can read every secret the app holds: refuse one the server did not give a checksum for.
  if (!update.checksum) throw new Error('This update has no integrity checksum, so it was not installed.')
  try {
    const bundle = await CapacitorUpdater.download({
      url: update.url,
      version: update.version,
      checksum: update.checksum,
    })
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
