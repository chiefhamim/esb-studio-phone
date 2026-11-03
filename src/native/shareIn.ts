// Everything that comes INTO the app from other apps: shared text/links, pictures, PDFs, text files, selected text
// ("Send to ESB Studio" in the text toolbar) and launcher shortcuts. Native side: ShareTargetPlugin.java.
// Use this INSTEAD of the listener in src/shareIntent.ts (both read the same pending text; run only one of them).
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type ShareSource = 'send' | 'process-text' | null
export type ShortcutAction = 'new-story' | 'paste-link' | null

export interface SharedFile {
  name: string
  mime: string
  /** Absent when `error` is set. */
  size?: number
  /** Absolute path in the app cache. */
  path?: string
  /** file:// uri; read it with readSharedFile(). */
  uri?: string
  /** Content of a text/plain file up to 1 MB. */
  text?: string
  /** 'too-large' when over 25 MB (not copied). */
  error?: 'too-large'
}

export interface IncomingShare {
  text: string | null
  source: ShareSource
  action: ShortcutAction
  files: SharedFile[]
}

interface ShareApi {
  takeShare(): Promise<IncomingShare>
  clearCache(): Promise<void>
  addListener(event: 'shared', cb: () => void): Promise<PluginListenerHandle>
}
const ShareTarget = registerPlugin<ShareApi>('ShareTarget')

const isEmpty = (s: IncomingShare) => !s.text && !s.action && s.files.length === 0

/** Read and clear whatever is waiting. */
export async function takeIncoming(): Promise<IncomingShare | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const s = await ShareTarget.takeShare()
    const r: IncomingShare = { text: s.text ?? null, source: s.source ?? null, action: s.action ?? null, files: s.files ?? [] }
    return isEmpty(r) ? null : r
  } catch { return null }
}

/** `cb` runs for what arrived before start-up and for each later arrival. Returns a cleanup function. */
export function listenForIncoming(cb: (s: IncomingShare) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let handle: PluginListenerHandle | null = null
  let dead = false
  let busy = false
  const pull = async () => {
    if (busy) return
    busy = true
    try {
      const s = await takeIncoming()
      if (s && !dead) cb(s)
    } finally { busy = false }
  }
  void pull()
  void ShareTarget.addListener('shared', () => { void pull() }).then((h) => { if (dead) void h.remove(); else handle = h })
  return () => { dead = true; void handle?.remove() }
}

/** Load a shared picture or PDF as a Blob (for upload, canvas, pdf.js). */
export async function readSharedFile(f: SharedFile): Promise<Blob> {
  if (!f.uri) throw new Error('This shared file was not copied' + (f.error ? ` (${f.error})` : ''))
  const res = await fetch(Capacitor.convertFileSrc(f.uri))
  if (!res.ok) throw new Error('Could not read the shared file')
  return new Blob([await res.arrayBuffer()], { type: f.mime })
}

/** Delete the cached copies once the page has what it needs. */
export function clearSharedCache(): void {
  if (Capacitor.isNativePlatform()) void ShareTarget.clearCache().catch(() => {})
}
