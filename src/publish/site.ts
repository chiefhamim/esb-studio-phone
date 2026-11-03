// esbpowerline.com from the phone: staff sign-in (Supabase Auth), session refresh, and saving an article.
// Origin: esb-banner-studio src/editorial/siteApi.ts (commit 3884532): authFetch, sessionFromTokens, authenticateStaff,
// ensureFreshSession, bodyToHtml, buildCmsArticlePayload and insertArticleToSupabase, adapted:
//  - the desktop keeps the session in localStorage; here only the token session goes to the Keystore through
//    setSecret('site-session', ...). The password is used for one request and never stored.
//  - every call is a plain fetch with `Authorization: Bearer <token>` and the public `apikey`; there is no cookie.
//  - saving defaults to DRAFT. PUBLISHED needs a one-time Confirmation from the confirmation sheet (confirm.ts).
// Picture upload, cache refresh and article fetch need the site's bearer-token branch (src/sync/endpoints.ts probes for it).
// See docs/SITE_CONNECTIVITY.md.

import type { Draft } from '../drafts'
import { deleteSecret, getSecret, setSecret } from '../secure'

/** The vendored PC's session key; src/platform/storage.ts routes it to the Keystore once the app has booted. */
const PC_SESSION_KEY = 'esb-banner-studio/site-session'
const routedSession = () => typeof window !== 'undefined' && (window as unknown as { __esbStorageRouted?: boolean }).__esbStorageRouted === true
import { authorFor, ESB_CATEGORIES } from './categories'
import { consumeConfirmation } from './confirm'
import type { Confirmation } from './confirm'
import { buildReadiness } from './readiness'

export const SITE_BASE_URL = 'https://esbpowerline.com'
export const SUPABASE_URL = 'https://sxgokpmrbgdndstygapc.supabase.co'
// The public (anon) key, as shipped in the site's own web bundle; it grants nothing without a staff token.
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4Z29rcG1yYmdkbmRzdHlnYXBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1ODk1ODEsImV4cCI6MjA5NzE2NTU4MX0.SwZbIiktG0pMwpgcLtAr6R5QOdU1M2ucRkbZZ3WIST8'

type Fetch = typeof fetch

/** A signed-in esbpowerline.com staff account. */
export interface StaffSession {
  email: string
  name: string
  role: string | null
  token: string
  refreshToken: string
  /** Unix seconds when the access token expires. */
  expiresAt: number
  userId: string
}

// ---------- error wording ----------

const AUTH_ERRORS: Array<[RegExp, string]> = [
  [/invalid login credentials|invalid_grant|user not found/i, 'Invalid email or password. Check your credentials and try again.'],
  [/email not confirmed/i, 'This address has not been confirmed yet. Check your inbox for the confirmation link.'],
  [/too many requests|rate limit|for security purposes/i, 'Too many attempts. Wait a minute and try again.'],
]
export function friendlyAuthError(raw: string): string {
  for (const [re, msg] of AUTH_ERRORS) if (re.test(raw)) return msg
  return 'Sign-in is temporarily unavailable. Please try again shortly.'
}

/** What the site's database said, in words an editor can act on. Never includes a token. */
export function mapSiteError(status: number, bodyText: string, slug = ''): string {
  let message = ''
  let details = ''
  let code = ''
  try {
    const p = JSON.parse(bodyText) as { message?: string; details?: string; code?: string }
    message = p.message ?? ''
    details = p.details ?? ''
    code = p.code ?? ''
  } catch { /* not JSON */ }
  if (message.includes('Article_slug_key') || code === '23505') {
    return `The web address "${slug}" is already used on esbpowerline.com. Change the slug, or open that article on the site.`
  }
  if (status === 401 || /jwt|token/i.test(message)) return 'The site no longer accepts this sign-in. Sign in again.'
  if (status === 403 || code === '42501') return 'This account is not allowed to write articles on esbpowerline.com.'
  if (status === 429) return 'The site is limiting requests. Wait a minute and try again.'
  if (status >= 500) return `esbpowerline.com had a problem (HTTP ${status}). Nothing was confirmed saved; check the site before trying again.`
  if (message) return `The site said: ${message}${details && !message.includes(details) ? ` (${details})` : ''}`
  return `The site answered HTTP ${status}.`
}

// ---------- sign-in ----------

const VALID_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'AUTHOR', 'CONTRIBUTOR', 'SUBSCRIBER'])
const normalizeRole = (v: unknown) => (typeof v === 'string' && VALID_ROLES.has(v.trim().toUpperCase()) ? v.trim().toUpperCase() : null)
/** Roles the site lets write articles. */
export const CMS_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'AUTHOR', 'CONTRIBUTOR'])

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  user?: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }
  error?: string
  error_description?: string
  msg?: string
  message?: string
}

async function authFetch(path: string, body: unknown, f: Fetch): Promise<{ ok: boolean; status: number; data: TokenResponse }> {
  const res = await f(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  return { ok: res.ok, status: res.status, data }
}

async function sessionFromTokens(t: TokenResponse, fallbackEmail: string, f: Fetch): Promise<{ session?: StaffSession; error?: string }> {
  const user = t.user
  if (!user?.id || !t.access_token || !t.refresh_token) return { error: 'Sign-in is temporarily unavailable. Please try again shortly.' }
  type ProfileRow = { role?: string | null; status?: string | null; full_name?: string | null }
  let profile: ProfileRow | null = null
  try {
    const res = await f(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status,full_name`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' },
    })
    if (res.ok) profile = ((await res.json()) as ProfileRow[])[0] ?? null
  } catch { /* the site still checks the role when a write is made */ }
  if (profile?.status === 'SUSPENDED') return { error: 'This account has been suspended. Contact an administrator.' }
  if (profile?.status === 'PENDING') return { error: 'This account is waiting for approval. Contact an administrator.' }
  const role = normalizeRole(profile?.role) ?? normalizeRole(user.app_metadata?.role)
  if (role === 'SUBSCRIBER') return { error: 'This is a member account, not a newsroom account. Use an editor login.' }
  const meta = user.user_metadata ?? {}
  const email = (user.email ?? fallbackEmail).toLowerCase()
  const name = (profile?.full_name || (typeof meta.full_name === 'string' ? meta.full_name : '') || (typeof meta.name === 'string' ? meta.name : '') || email.split('@')[0]).trim()
  return {
    session: {
      email,
      name,
      role,
      token: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: t.expires_at ?? Math.floor(Date.now() / 1000) + (t.expires_in ?? 3600),
      userId: user.id,
    },
  }
}

export async function loadSession(): Promise<StaffSession | null> {
  const raw = routedSession() ? localStorage.getItem(PC_SESSION_KEY) : await getSecret('site-session')
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Partial<StaffSession>
    if (typeof s.token === 'string' && typeof s.refreshToken === 'string' && typeof s.email === 'string') return s as StaffSession
  } catch { /* corrupt: treated as signed out */ }
  return null
}

async function storeSession(s: StaffSession): Promise<void> {
  if (!routedSession()) { await setSecret('site-session', JSON.stringify(s)); return }
  // one copy of the sign-in for the whole app: the vendored PC desk reads the same key (src/platform/storage.ts routes
  // it to the Keystore) and is told at once, so neither side ever re-uses a spent single-use refresh token
  const prev = (() => { try { return JSON.parse(localStorage.getItem(PC_SESSION_KEY) ?? 'null') as Record<string, unknown> | null } catch { return null } })()
  const merged = { ...(prev ?? {}), ...s, authType: 'supabase', authenticatedAt: (prev?.authenticatedAt as string | undefined) ?? new Date().toISOString() }
  localStorage.setItem(PC_SESSION_KEY, JSON.stringify(merged))
  try { window.dispatchEvent(new CustomEvent('esb-session', { detail: merged })) } catch { /* no window: tests */ }
}

/** Sign in with a staff account. The password goes to the site's auth service in this one request and is not kept. */
export async function signIn(email: string, password: string, f: Fetch = fetch): Promise<{ ok: true; session: StaffSession } | { ok: false; error: string }> {
  const normEmail = email.trim().toLowerCase()
  if (!normEmail || !password) return { ok: false, error: 'Email and password are required.' }
  try {
    const { ok, data } = await authFetch('token?grant_type=password', { email: normEmail, password }, f)
    if (!ok) return { ok: false, error: friendlyAuthError(data.error_description || data.msg || data.message || data.error || '') }
    const { session, error } = await sessionFromTokens(data, normEmail, f)
    if (!session) return { ok: false, error: error ?? 'Sign-in failed.' }
    await storeSession(session)
    return { ok: true, session }
  } catch {
    return { ok: false, error: 'Could not reach esbpowerline.com. Check the connection and try again.' }
  }
}

/**
 * A session good for at least five more minutes. A Supabase refresh token is SINGLE USE: refresh from the newest stored
 * copy, one refresh at a time (a second caller shares the first's result), and store the new tokens at once.
 */
export type RefreshOutcome =
  | { state: 'ok'; session: StaffSession }
  | { state: 'none' }
  /** the site refused the refresh token: the sign-in has ended and the editor must sign in again */
  | { state: 'expired' }
  /** the network or the auth service failed: the sign-in may still be good */
  | { state: 'unavailable' }

let refreshing: Promise<RefreshOutcome> | null = null
export async function refreshSession(f: Fetch = fetch): Promise<RefreshOutcome> {
  const session = await loadSession()
  if (!session) return { state: 'none' }
  if (session.expiresAt - Date.now() / 1000 > 300) return { state: 'ok', session }
  if (refreshing) return refreshing
  refreshing = (async (): Promise<RefreshOutcome> => {
    try {
      const { ok, status, data } = await authFetch('token?grant_type=refresh_token', { refresh_token: session.refreshToken }, f)
      if (!ok) return status === 429 || status >= 500 ? { state: 'unavailable' } : { state: 'expired' }
      const next = await sessionFromTokens(data, session.email, f)
      if (!next.session) return next.error ? { state: 'expired' } : { state: 'unavailable' }
      await storeSession(next.session)
      return { state: 'ok', session: next.session }
    } catch {
      return { state: 'unavailable' }
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** A session good for at least five more minutes, or null (signed out, ended, or the network is down). */
export async function ensureFreshSession(f: Fetch = fetch): Promise<StaffSession | null> {
  const r = await refreshSession(f)
  return r.state === 'ok' ? r.session : null
}

export async function signOut(f: Fetch = fetch): Promise<void> {
  const s = await loadSession()
  if (routedSession()) {
    localStorage.removeItem(PC_SESSION_KEY)
    try { window.dispatchEvent(new CustomEvent('esb-session', { detail: null })) } catch { /* no window */ }
  } else await deleteSecret('site-session')
  if (!s) return
  try { await f(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.token}` } }) } catch { /* already signed out here */ }
}

// ---------- article ----------

/** The site stores article bodies as HTML paragraphs. */
export function bodyToHtml(body: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return body
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

/** Same cuid-shaped id the desktop makes (the site's Prisma default). */
export function generateCuid(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
  return `cmv${timestamp}${randomPart}`.substring(0, 25)
}

export interface SaveOptions {
  /** false (the default) saves an unpublished DRAFT. true publishes live and needs `confirmation`. */
  publish?: boolean
  confirmation?: Confirmation
  /** an https link to an already-hosted picture (the phone cannot upload one to the site yet) */
  imageUrl?: string
  imageCredit?: string
  imageAlt?: string
  /** the id of the article this draft already created on the site, to update it instead of creating another */
  updateId?: string
  /** true when the site article is already live; a draft save must not unpublish it */
  knownLive?: boolean
}

export type SaveResult =
  | { ok: true; updated: boolean; articleId: string; slug: string; status: 'DRAFT' | 'PUBLISHED'; liveUrl: string | null }
  | { ok: false; error: string }

interface Row { id: string; status: string; publishedAt: string | null }

async function findArticle(f: Fetch, token: string, by: { id?: string; slug?: string }): Promise<Row | null> {
  const q = by.id ? `id=eq.${encodeURIComponent(by.id)}` : `slug=eq.${encodeURIComponent(by.slug ?? '')}`
  const res = await f(`${SUPABASE_URL}/rest/v1/Article?${q}&select=id,status,publishedAt&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(mapSiteError(res.status, await res.text().catch(() => ''), by.slug))
  return ((await res.json()) as Row[])[0] ?? null
}

/** The row sent to the site. Exported for tests. */
export function buildArticleRecord(draft: Draft, authorId: string, newsDesk: boolean, status: 'DRAFT' | 'PUBLISHED', opts: SaveOptions, id: string, nowIso: string) {
  const cat = ESB_CATEGORIES[draft.category]
  const headline = draft.headline.trim()
  const deck = draft.deck.trim()
  const words = draft.body.trim().split(/\s+/).filter(Boolean).length
  const imageUrl = opts.imageUrl && /^https:\/\//.test(opts.imageUrl) ? opts.imageUrl : null
  return {
    id,
    title: headline,
    shortTitle: headline.length > 60 ? headline.slice(0, 58) + '…' : null,
    slug: draft.slug.trim().toLowerCase(),
    excerpt: deck || null,
    content: bodyToHtml(draft.body),
    authorId,
    publishedAt: status === 'PUBLISHED' ? nowIso : null,
    status,
    category: cat.name,
    categoryId: cat.id,
    imageUrl,
    imageCredit: opts.imageCredit?.trim() || null,
    readTime: Math.max(1, Math.ceil(words / 200)),
    views: 0,
    likes: 0,
    isFeatured: false,
    isBreaking: false,
    isPinned: false,
    isTrending: false,
    postAsNewsDesk: newsDesk,
    tags: [] as string[],
    seo: { metaTitle: headline, metaDescription: deck, focusKeyword: '', heroImage: { alt: opts.imageAlt?.trim() || headline } },
    locale: 'en',
    version: 1,
    editorTrash: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

/**
 * Save the story to esbpowerline.com. By default it is an unpublished DRAFT. Going live (`publish: true`) needs a
 * one-time Confirmation for exactly this story, issued by the confirmation sheet; without one NOTHING is sent.
 */
export async function saveArticle(draft: Draft, opts: SaveOptions = {}, f: Fetch = fetch): Promise<SaveResult> {
  const publish = opts.publish === true
  const slug = draft.slug.trim().toLowerCase()
  const gate = buildReadiness(draft, { translationReviewed: true, hasPicture: true })
  if (gate.blockers.length) return { ok: false, error: `Not ready: ${gate.blockers[0].detail}` }
  if (publish && !consumeConfirmation(opts.confirmation, { kind: 'site', title: draft.headline.trim(), slug })) {
    return { ok: false, error: 'Publishing live needs the confirmation step. Nothing was sent.' }
  }
  if (!publish && opts.knownLive) {
    return { ok: false, error: 'This story is already live. Saving it as a draft would take it down, so it is not allowed here. Use "Publish live" to update it.' }
  }
  try {
    const session = await ensureFreshSession(f)
    if (!session) return { ok: false, error: 'Sign in with your esbpowerline.com editor account first.' }
    if (session.role && !CMS_ROLES.has(session.role)) return { ok: false, error: `A ${session.role.toLowerCase()} account cannot write articles.` }
    const author = await authorFor(session.email)
    if (!author) return { ok: false, error: `${session.email} is signed in, but this app does not know its author record on the site yet. Nothing was saved.` }

    const status = publish ? 'PUBLISHED' : 'DRAFT'
    const nowIso = new Date().toISOString()
    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }
    let res: Response
    let id: string
    if (opts.updateId) {
      id = opts.updateId
      const cur = await findArticle(f, session.token, { id })
      if (!cur) return { ok: false, error: 'That article is no longer on esbpowerline.com. Save it again as a new article.' }
      if (!publish && cur.status === 'PUBLISHED') return { ok: false, error: 'This story is already live on the site. Saving it as a draft would take it down, so it is not allowed here.' }
      const rec = buildArticleRecord(draft, author.id, !!author.newsDesk, status, opts, id, nowIso)
      const { id: _i, authorId: _a, createdAt: _c, views: _v, likes: _l, version: _ve, locale: _lo, editorTrash: _t, ...changes } = rec
      void [_i, _a, _c, _v, _l, _ve, _lo, _t]
      const patch: Record<string, unknown> = { ...changes, publishedAt: publish ? cur.publishedAt || nowIso : cur.publishedAt ?? null, updatedAt: nowIso }
      if (!rec.imageUrl) delete patch.imageUrl
      res = await f(`${SUPABASE_URL}/rest/v1/Article?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers, body: JSON.stringify(patch) })
    } else {
      id = generateCuid()
      const rec = buildArticleRecord(draft, author.id, !!author.newsDesk, status, opts, id, nowIso)
      res = await f(`${SUPABASE_URL}/rest/v1/Article`, { method: 'POST', headers, body: JSON.stringify(rec) })
    }
    if (!res.ok) return { ok: false, error: mapSiteError(res.status, await res.text().catch(() => ''), slug) }
    return { ok: true, updated: !!opts.updateId, articleId: id, slug, status, liveUrl: publish ? `${SITE_BASE_URL}/articles/${slug}` : null }
  } catch (err) {
    const m = err instanceof Error ? err.message : ''
    // findArticle throws already-worded site errors; anything else is the network
    return { ok: false, error: m && !/fetch|network|failed/i.test(m) ? m : 'Could not reach esbpowerline.com. Check the connection; nothing is confirmed saved.' }
  }
}
