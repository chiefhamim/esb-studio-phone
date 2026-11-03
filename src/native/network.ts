// Network status. Uses the Capacitor Network plugin on the phone and navigator.onLine in a browser.
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { Network } from '@capacitor/network'

export type ConnectionKind = 'wifi' | 'cellular' | 'none' | 'unknown'
export interface NetStatus { online: boolean; kind: ConnectionKind }

const fromPlugin = (s: { connected: boolean; connectionType: string }): NetStatus => ({
  online: s.connected,
  kind: s.connectionType === 'wifi' || s.connectionType === 'cellular' || s.connectionType === 'none' ? s.connectionType : 'unknown'
})
const fromBrowser = (): NetStatus => ({ online: navigator.onLine, kind: navigator.onLine ? 'unknown' : 'none' })

export async function getNetworkStatus(): Promise<NetStatus> {
  if (!Capacitor.isNativePlatform()) return fromBrowser()
  try { return fromPlugin(await Network.getStatus()) } catch { return fromBrowser() }
}

/** Calls `cb` on every change. Returns a cleanup function. */
export function onNetworkChange(cb: (s: NetStatus) => void): () => void {
  if (!Capacitor.isNativePlatform()) {
    const f = () => cb(fromBrowser())
    window.addEventListener('online', f)
    window.addEventListener('offline', f)
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f) }
  }
  let handle: PluginListenerHandle | null = null
  let dead = false
  void Network.addListener('networkStatusChange', (s) => cb(fromPlugin(s))).then((h) => { if (dead) void h.remove(); else handle = h })
  return () => { dead = true; void handle?.remove() }
}
