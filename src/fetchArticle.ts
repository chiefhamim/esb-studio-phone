// Article fetching. STUB: the staff-only endpoint on esbpowerline.com does not exist yet, so this never returns article text.
// It reports "not connected" honestly; the editor pastes the source text by hand until the endpoint is built.
export interface FetchResult {
  ok: boolean
  /** article text when ok */
  text?: string
  /** plain-words reason when not ok */
  reason?: string
}

export const FETCH_CONNECTED = false

export async function fetchArticle(url: string): Promise<FetchResult> {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'Only web links (http or https) can be fetched.' }
  } catch {
    return { ok: false, reason: 'That is not a valid link.' }
  }
  return { ok: false, reason: 'Link fetching is not connected yet. Paste the article text below instead.' }
}
