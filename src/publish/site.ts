// esbpowerline.com from the phone: staff sign-in (Supabase Auth) and session refresh. (Saving and publishing go through the
// PC editor code, which the phone's esbShim wires to this session; the phone's own article-saving path was removed 2026-11-04.)
// Origin: esb-banner-studio src/editorial/siteApi.ts (commit 3884532): authFetch, sessionFromTokens, authenticateStaff,
// ensureFreshSession, bodyToHtml, buildCmsArticlePayload and insertArticleToSupabase, adapted:
//  - the desktop keeps the session in localStorage; here only the token session goes to the Keystore through
//    setSecret('site-session', ...). The password is used for one request and never stored.
//  - every call is a plain fetch with `Authorization: Bearer <token>` and the public `apikey`; there is no cookie.
// Picture upload, cache refresh and article fetch need the site's bearer-token branch (src/sync/endpoints.ts probes for it).
// See docs/SITE_CONNECTIVITY.md.

import { deleteSecret, getSecret, setSecret } from '../secure'

/** The vendored PC's session key; src/platform/storage.ts routes it to the Keystore once the app has booted. */
const PC_SESSION_KEY = 'esb-banner-studio/site-session'
const routedSession = () => typeof window !== 'undefined' && (window as unknown as { __esbStorageRouted?: boolean }).__esbStorageRouted === true

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
  const raw = routedSession() ? localStorage.getItem(PC_SESSION_KEY) : await getSecret('site-session').catch(() => null)
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
