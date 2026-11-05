// Published list: how long ago a story went live (first, in its own chip), then the exact moment ("[1 h ago] 5 Nov 2026, 6:42 PM").
// The clock follows Settings → Time format (fmtTime). The relative part is the PC's fmtPublished, kept as it is.
import { fmtTime } from '../../pc/ui/time'
import { fmtPublished } from '../../pc/editorial/fmtPublished'

export function publishedParts(raw: string | undefined, now = Date.now()): { rel: string | null; when: string } {
  const t = raw ? Date.parse(raw) : NaN
  if (!Number.isFinite(t)) return { rel: null, when: 'Published' }
  const d = new Date(t)
  const when = `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${fmtTime(d)}`
  const rel = fmtPublished(raw, now)
  // fmtPublished gives a plain date for older stories: then there is no relative chip, only the date and time
  if (/ago|Just now/.test(rel)) return { rel, when }
  const day = rel.match(/^(Today|Yesterday)/)?.[1]
  return { rel: day ?? null, when }
}

/** One line of text (kept for anything that wants a string). */
export function fmtPublishedFull(raw: string | undefined, now = Date.now()): string {
  const { rel, when } = publishedParts(raw, now)
  return rel ? `${rel} · ${when}` : when
}
