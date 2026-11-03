// Share target helper: split text shared to this app from another app (Share > ESB Studio) into its link and the rest.
// Delivery from the native side is src/native/shareIn.ts.
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
