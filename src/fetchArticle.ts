// Article fetching for a pasted link. The phone cannot read other sites' pages itself (browser CORS), so it asks the staff
// endpoint on esbpowerline.com (POST /api/staff/fetch-article, site branch `phone-bearer-api`) with the signed-in
// editor's bearer token. Until that route is live (src/sync/endpoints.ts probes for it) this reports "not connected"
// honestly and the editor pastes the text by hand.
import { cachedAvailability, fetchArticleViaSite, probeFeature } from './sync/endpoints'

export interface FetchResult {
  ok: boolean
  /** article text when ok */
  text?: string
  /** headline found on the page, when ok (a hint for the editor, not a translation) */
  title?: string
  /** https picture links found on the page, when ok */
  images?: Array<{ src: string; alt: string }>
  /** plain-words reason when not ok */
  reason?: string
}

export const NOT_CONNECTED = 'Link fetching is not connected yet. Paste the article text below instead.'

/** true only when the probe has proved the site route works with a bearer token (no network call). */
export function fetchConnected(): boolean { return cachedAvailability('fetchArticle') === 'available' }

export function checkLink(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only web links (http or https) can be fetched.'
    if (u.protocol === 'http:') return 'Only https links can be fetched. Try the https version of the link.'
  } catch {
    return 'That is not a valid link.'
  }
  return null
}

export async function fetchArticle(url: string): Promise<FetchResult> {
  const bad = checkLink(url)
  if (bad) return { ok: false, reason: bad }
  const a = await probeFeature('fetchArticle')
  if (a === 'unknown') return { ok: false, reason: 'Could not check the site connection. Sign in under Settings and check you are online, or paste the text below instead.' }
  if (a === 'unavailable') return { ok: false, reason: NOT_CONNECTED }
  const r = await fetchArticleViaSite(url.trim())
  if (!r.ok) return { ok: false, reason: r.error }
  if (!r.data.text.trim()) return { ok: false, reason: 'The page was read but no article text was found in it. Paste the text below instead.' }
  return { ok: true, text: r.data.text, title: r.data.title, images: r.data.images }
}
