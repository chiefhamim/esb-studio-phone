// Which Facebook post belongs to a published article.
//
// The site does not keep the Facebook post, and Publish showed it only once. Two ways to find it again:
//   1. Remembered: every post made from this phone is saved here (slug -> post link and picture) when it is made.
//   2. Looked up: the Page's own posts from around the article's publish time (Graph API /{page}/posts, the Page token in
//      the Authorization header, as facebook.ts does). A post counts only when its caption shares most of the headline's
//      words; otherwise nothing is claimed ("Never invent content": no guessing which post it was).
import { getFacebook } from '../../pc/editorial/facebook'
import type { LiveArticleSummary } from '../../pc/editorial/siteApi'

const GRAPH = 'https://graph.facebook.com/v26.0'
const KEY = 'esb-phone/fb-posts/v1'

export interface FbPost { url: string; image?: string; when?: string }

const loadAll = (): Record<string, FbPost> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }

/** Publish calls this right after a post is made, so the post is known for good. */
export function rememberFbPost(slug: string, post: FbPost) {
  if (!slug || !post.url) return
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadAll(), [slug]: post })) } catch { /* storage full: the lookup still works */ }
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2))

/** Share of the headline's words found in the caption (0..1). */
export function headlineMatch(headline: string, caption: string): number {
  const h = words(headline), c = words(caption)
  if (!h.size) return 0
  let n = 0
  for (const w of h) if (c.has(w)) n++
  return n / h.size
}

export type FbFind = { ok: true; post: FbPost; remembered: boolean } | { ok: false; reason: string }

export async function findFbPost(a: LiveArticleSummary): Promise<FbFind> {
  const known = loadAll()[a.slug]
  if (known) return { ok: true, post: known, remembered: true }
  const fb = getFacebook()
  if (!fb) return { ok: false, reason: 'Facebook is not connected on this phone.' }
  const t = Date.parse(a.publishedAt)
  if (!Number.isFinite(t)) return { ok: false, reason: 'The article has no publish time to look around.' }
  const since = Math.floor((t - 6 * 3600_000) / 1000), until = Math.floor((t + 36 * 3600_000) / 1000)
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(fb.pageId)}/posts?fields=message,permalink_url,created_time,full_picture&since=${since}&until=${until}&limit=50`,
      { headers: { Authorization: `Bearer ${fb.token}` } })
    if (!res.ok) return { ok: false, reason: `Facebook did not answer (${res.status}).` }
    const data = (await res.json()) as { data?: { message?: string; permalink_url?: string; created_time?: string; full_picture?: string }[] }
    let best: { score: number; post: FbPost } | null = null
    for (const p of data.data ?? []) {
      if (!p.permalink_url || !p.message) continue
      const score = Math.max(headlineMatch(a.title, p.message), a.description ? headlineMatch(a.description, p.message) * 0.9 : 0)
      if (!best || score > best.score) best = { score, post: { url: p.permalink_url, image: p.full_picture, when: p.created_time } }
    }
    if (!best || best.score < 0.6) return { ok: false, reason: 'No post on the Page matches this headline.' }
    rememberFbPost(a.slug, best.post)
    return { ok: true, post: best.post, remembered: false }
  } catch (e) {
    return { ok: false, reason: `Could not reach Facebook: ${(e as Error).message}` }
  }
}
