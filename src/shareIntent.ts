// Share target: text or a link shared to this app from another app (Share > ESB Studio).
// The native side (ShareTargetPlugin.java) keeps the text until the page asks for it.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface ShareTargetApi {
  getPending(): Promise<{ text: string | null }>
  addListener(event: 'shared', cb: (d: { text: string | null }) => void): Promise<PluginListenerHandle>
}
const ShareTarget = registerPlugin<ShareTargetApi>('ShareTarget')

export interface SharedStory { url: string; text: string }

/** Split shared text into the first web link and whatever else came with it (a title, a pasted paragraph). */
export function parseShared(raw: string): SharedStory | null {
  const s = raw.trim()
  if (!s) return null
  const m = s.match(/https?:\/\/[^\s<>"')\]]+/i)
  const url = m ? m[0].replace(/[.,;:!?]+$/, '') : ''
  const text = (m ? s.replace(m[0], '') : s).trim()
  return { url, text }
}

/** Calls `onShared` for a share that arrived before start-up and for every later one. Returns a cleanup function. */
export function listenForShares(onShared: (s: SharedStory) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let handle: PluginListenerHandle | null = null
  let dead = false
  const pull = async () => {
    const { text } = await ShareTarget.getPending().catch(() => ({ text: null }))
    const s = text ? parseShared(text) : null
    if (s && !dead) onShared(s)
  }
  void pull()
  void ShareTarget.addListener('shared', () => { void pull() }).then((h) => { if (dead) void h.remove(); else handle = h })
  return () => { dead = true; void handle?.remove() }
}
