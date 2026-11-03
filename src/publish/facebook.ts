// Facebook Page posting from the phone.
// Origin: esb-banner-studio src/editorial/facebook.ts (commit 3884532): facebookError, verifyFacebook,
// postBannerToFacebook, commentOnPost, adapted: page id and token come from the Keystore (getSecret 'fb-page-id' /
// 'fb-page-token'), the token travels ONLY in the Authorization header, never in a URL, and a post needs a one-time
// Confirmation from the confirmation sheet; without one nothing is sent.

import { getSecret } from '../secure'
import { sanitizeFacebook } from './caption'
import { consumeConfirmation } from './confirm'
import type { Confirmation } from './confirm'

export const GRAPH = 'https://graph.facebook.com/v26.0'
type Fetch = typeof fetch

export interface FacebookConfig { pageId: string; token: string }

export async function loadFacebook(): Promise<FacebookConfig | null> {
  const [pageId, token] = await Promise.all([getSecret('fb-page-id'), getSecret('fb-page-token')])
  return pageId && /^\d{5,}$/.test(pageId.trim()) && token ? { pageId: pageId.trim(), token } : null
}

/** Graph API errors in words an editor can act on. */
export function facebookError(status: number, body: { error?: { message?: string; code?: number } } | null): string {
  const code = body?.error?.code
  if (code === 190 || status === 401) return 'Facebook rejected the token: it expired or was revoked. Create a new Page access token and enter it in Settings.'
  if (code === 200 || code === 10 || status === 403) return 'The token does not allow this. Posting needs pages_manage_posts and pages_read_engagement; commenting the article link needs pages_manage_engagement.' + (body?.error?.message ? ` Facebook's own words: ${body.error.message}` : '')
  if (code === 100) return 'Facebook could not find that Page ID, or the token is not for this Page.'
  if (code === 4 || code === 17 || code === 32) return 'Facebook is limiting requests right now. Wait a few minutes and try again.'
  return body?.error?.message ? `Facebook said: ${body.error.message}` : `Facebook answered HTTP ${status}.`
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const NET = 'Could not reach Facebook. Check the connection; the post is not confirmed.'

/** Read the Page the token belongs to: proves the ID and token pair works. Posts nothing. */
export async function verifyFacebook(cfg: FacebookConfig, f: Fetch = fetch): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    const res = await f(`${GRAPH}/${encodeURIComponent(cfg.pageId)}?fields=name`, { headers: auth(cfg.token) })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.name) return { ok: false, error: facebookError(res.status, body) }
    return { ok: true, name: String(body.name) }
  } catch {
    return { ok: false, error: 'Could not reach Facebook. Check the connection and try again.' }
  }
}

export interface FacebookPostInput {
  cfg: FacebookConfig
  photo: Blob
  caption: string
  /** the story's headline: the confirmation is tied to it */
  title: string
  confirmation?: Confirmation
  /** if set, added as the post's first comment (the caption itself carries no link) */
  commentLink?: string
}

export type FacebookPostResult =
  | { ok: true; postId: string; url: string; comment: { ok: true } | { ok: false; error: string } | null }
  | { ok: false; error: string }

/** Post the picture with the caption to the Page. Needs a Confirmation for this title. */
export async function postToFacebook(p: FacebookPostInput, f: Fetch = fetch): Promise<FacebookPostResult> {
  if (!consumeConfirmation(p.confirmation, { kind: 'facebook', title: p.title })) {
    return { ok: false, error: 'Posting to Facebook needs the confirmation step. Nothing was sent.' }
  }
  if (p.photo.type !== 'image/jpeg' && p.photo.type !== 'image/png') return { ok: false, error: 'Facebook posts take a JPEG or PNG picture.' }
  const caption = sanitizeFacebook(p.caption, p.title)
  if (!caption.trim()) return { ok: false, error: 'The caption is empty.' }
  try {
    const form = new FormData()
    form.append('source', p.photo, p.photo.type === 'image/png' ? 'banner.png' : 'banner.jpg')
    form.append('caption', caption)
    form.append('published', 'true')
    const res = await f(`${GRAPH}/${encodeURIComponent(p.cfg.pageId)}/photos`, { method: 'POST', headers: auth(p.cfg.token), body: form })
    const body = await res.json().catch(() => null)
    if (!res.ok || !(body?.post_id || body?.id)) return { ok: false, error: facebookError(res.status, body) }
    const postId = String(body.post_id || body.id)
    let comment: { ok: true } | { ok: false; error: string } | null = null
    if (p.commentLink && /^https:\/\//.test(p.commentLink)) {
      try {
        const cf = new FormData()
        cf.append('message', p.commentLink)
        const cr = await f(`${GRAPH}/${encodeURIComponent(postId)}/comments`, { method: 'POST', headers: auth(p.cfg.token), body: cf })
        const cb = await cr.json().catch(() => null)
        comment = cr.ok && cb?.id ? { ok: true } : { ok: false, error: facebookError(cr.status, cb) }
      } catch {
        comment = { ok: false, error: NET }
      }
    }
    return { ok: true, postId, url: `https://www.facebook.com/${postId}`, comment }
  } catch {
    return { ok: false, error: NET }
  }
}
