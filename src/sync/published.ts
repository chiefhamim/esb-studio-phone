// The "Published" tab: the site's recent stories, read with the editor's own token (so drafts show too), and opening
// one into a phone draft that UPDATES that same article instead of creating another.
// Origin: esb-banner-studio src/editorial/siteApi.ts findArticle / htmlToBody, adapted. Read-only; nothing is written
// to the site here. Saving back goes through saveArticle (updateId) and the confirm gate as for any story.
import { useCallback, useEffect, useRef, useState } from 'react'
import { newDraft } from '../drafts'
import type { Draft } from '../drafts'
import { ESB_CATEGORIES } from '../publish/categories'
import { SITE_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL, ensureFreshSession, mapSiteError } from '../publish/site'
import { setSent } from '../publish/state'

type Fetch = typeof fetch

export interface PublishedItem {
  id: string
  title: string
  slug: string
  status: 'DRAFT' | 'PUBLISHED' | string
  category: string
  imageUrl: string | null
  publishedAt: string | null
  updatedAt: string | null
  liveUrl: string | null
}

export type ListResult = { ok: true; items: PublishedItem[] } | { ok: false; error: string; offline?: boolean }

const LIST_SELECT = 'id,title,slug,status,category,imageUrl,publishedAt,updatedAt'
export const PAGE_SIZE = 30

interface Row { id: string; title: string; slug: string; status: string; category: string | null; imageUrl: string | null; publishedAt: string | null; updatedAt: string | null }

export function toItem(r: Row): PublishedItem {
  return {
    id: r.id, title: r.title, slug: r.slug, status: r.status, category: r.category ?? '', imageUrl: r.imageUrl,
    publishedAt: r.publishedAt, updatedAt: r.updatedAt,
    liveUrl: r.status === 'PUBLISHED' ? `${SITE_BASE_URL}/articles/${r.slug}` : null,
  }
}

/** The request for the list. Exported for tests: newest-edited first, trashed stories excluded, token only in the header. */
export function listRequest(token: string, limit = PAGE_SIZE, offset = 0): { url: string; init: RequestInit } {
  const q = `select=${LIST_SELECT}&editorTrash=eq.false&order=updatedAt.desc&limit=${limit}&offset=${offset}`
  return { url: `${SUPABASE_URL}/rest/v1/Article?${q}`, init: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Accept: 'application/json' } } }
}

export async function fetchPublished(limit = PAGE_SIZE, offset = 0, f: Fetch = fetch): Promise<ListResult> {
  const session = await ensureFreshSession(f)
  if (!session) return { ok: false, error: 'Sign in with your esbpowerline.com editor account (Settings) to see the site\'s stories.' }
  const { url, init } = listRequest(session.token, limit, offset)
  try {
    const res = await f(url, init)
    if (!res.ok) return { ok: false, error: mapSiteError(res.status, await res.text().catch(() => '')) }
    return { ok: true, items: ((await res.json()) as Row[]).map(toItem) }
  } catch {
    return { ok: false, error: 'Could not reach esbpowerline.com. Check the connection.', offline: true }
  }
}

// ---------- open one for update ----------

/** The site's HTML paragraphs back to blank-line-separated text. Copy of the desktop's htmlToBody. */
export function htmlToBody(html: string): string {
  const dec = (t: string) => t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  return html
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .split(/\n{2,}/)
    .map((p) => dec(p).trim())
    .filter(Boolean)
    .join('\n\n')
}

interface FullRow extends Row { excerpt: string | null; content: string; imageCredit: string | null }

export type OpenResult =
  | { ok: true; draft: Draft; liveUrl: string | null; imageUrl: string | null; imageCredit: string; status: string }
  | { ok: false; error: string }

/**
 * Read one story in full and turn it into a phone draft linked to it (`getSent(draft.id).articleId`), so Publish
 * updates the same article. The caller stores the draft (useDrafts().upsert) and opens it. A story the phone cannot
 * round-trip (body saved by the CMS editor as JSON, or a category this app does not know) is refused, not guessed.
 */
export async function openForUpdate(id: string, f: Fetch = fetch): Promise<OpenResult> {
  const session = await ensureFreshSession(f)
  if (!session) return { ok: false, error: 'Sign in with your esbpowerline.com editor account first.' }
  let row: FullRow | undefined
  try {
    const res = await f(`${SUPABASE_URL}/rest/v1/Article?id=eq.${encodeURIComponent(id)}&select=id,title,slug,status,excerpt,content,category,imageUrl,imageCredit,publishedAt,updatedAt&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.token}`, Accept: 'application/json' },
    })
    if (!res.ok) return { ok: false, error: mapSiteError(res.status, await res.text().catch(() => '')) }
    row = ((await res.json()) as FullRow[])[0]
  } catch {
    return { ok: false, error: 'Could not reach esbpowerline.com. Check the connection.' }
  }
  if (!row) return { ok: false, error: 'That story is no longer on esbpowerline.com.' }
  if (/^\s*[{[]/.test(row.content)) return { ok: false, error: 'This story was written in the site\'s rich editor. The phone can only edit plain stories; open it in the CMS or the desktop app.' }
  const category = row.category && ESB_CATEGORIES[row.category] ? row.category : ''
  const d = newDraft()
  const draft: Draft = { ...d, headline: row.title, deck: row.excerpt ?? '', body: htmlToBody(row.content), category, slug: row.slug }
  const item = toItem(row)
  setSent(draft.id, { articleId: row.id, slug: row.slug, status: row.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT', liveUrl: item.liveUrl, imageUrl: row.imageUrl, imageCredit: row.imageCredit ?? '' })
  return { ok: true, draft, liveUrl: item.liveUrl, imageUrl: row.imageUrl, imageCredit: row.imageCredit ?? '', status: row.status }
}

// ---------- hook for the Desk's Published tab ----------

export interface PublishedState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: PublishedItem[]
  error: string
  offline: boolean
  reload: () => void
  /** read one in full and make the linked phone draft; the caller stores it and opens it */
  open: (id: string) => Promise<OpenResult>
}

/** Pass `active` = true while the Published tab is showing; the list loads then and on reload(). */
export function usePublished(active: boolean): PublishedState {
  const [state, setState] = useState<Pick<PublishedState, 'status' | 'items' | 'error' | 'offline'>>({ status: 'idle', items: [], error: '', offline: false })
  const seq = useRef(0)
  const load = useCallback(() => {
    const mine = ++seq.current
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchPublished().then((r) => {
      if (mine !== seq.current) return // a newer request is in flight
      setState(r.ok ? { status: 'ready', items: r.items, error: '', offline: false } : { status: 'error', items: [], error: r.error, offline: !!r.offline })
    }).catch(() => { if (mine === seq.current) setState({ status: 'error', items: [], error: 'Could not load the site\'s stories.', offline: false }) })
  }, [])
  useEffect(() => { if (active) load() }, [active, load])
  return { ...state, reload: load, open: (id) => openForUpdate(id) }
}
