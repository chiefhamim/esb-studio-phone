import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { App } from '@capacitor/app'

export interface AvailableUpdate {
  version: string
  url: string
  checksum?: string
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

/** Check Capgo for available updates on the current channel. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const cur = await getCurrentBundle()
    const latest = await CapacitorUpdater.getLatest()
    if (!latest || !latest.url || !latest.version) return null
    // If already running this version, no update needed
    if (cur.version === latest.version || cur.id === latest.version) return null
    // Never offer a bundle that is not newer than what is running or than the installed app itself: an old bundle left on the
    // channel must not replace a newer install (it once offered v0.1.1 over a v0.3.0 app).
    const native = (await App.getInfo().catch(() => null))?.version ?? '0.0.0'
    const running = /^\d/.test(cur.version) ? cur.version : native
    if (!isNewer(latest.version, native) || !isNewer(latest.version, running)) return null

    return {
      version: latest.version,
      url: latest.url,
      checksum: latest.checksum,
      message: latest.message,
    }
  } catch (err) {
    console.warn('OTA update check failed:', err)
    return null
  }
}

/** Download a bundle and reload the WebView with the new code. */
export async function downloadAndApplyUpdate(
  update: AvailableUpdate,
  onProgress?: (percent: number) => void,
): Promise<void> {
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
