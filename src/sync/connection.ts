// The real CMS connection state for the status bar: signed in + session still accepted + site reachable.
// Read-only: three GETs/POSTs to the auth service and the public feed; nothing is written anywhere.
import { SITE_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL, loadSession, refreshSession } from '../publish/site'

type Fetch = typeof fetch

export type Connection = 'connected' | 'expired' | 'offline' | 'not-connected'

export const CONNECTION_LABEL: Record<Connection, string> = {
  connected: 'Connected',
  expired: 'Session expired',
  offline: 'Offline',
  'not-connected': 'Not connected',
}

async function withTimeout(f: Fetch, url: string, init: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try { return await f(url, { ...init, signal: c.signal }) } finally { clearTimeout(t) }
}

/**
 * not-connected: no saved sign-in.  offline: the site (or the auth service) cannot be reached.
 * expired: the site refused the refresh token or the access token.  connected: all three are fine.
 */
export async function checkConnection(f: Fetch = fetch): Promise<Connection> {
  const saved = await loadSession()
  if (!saved) return 'not-connected'
  try {
    const feed = await withTimeout(f, `${SITE_BASE_URL}/feed.xml`, { method: 'GET' }, 6000)
    if (!feed.ok) return 'offline'
  } catch {
    return 'offline'
  }
  const r = await refreshSession(f)
  if (r.state === 'none') return 'not-connected'
  if (r.state === 'expired') return 'expired'
  if (r.state === 'unavailable') return 'offline'
  try {
    const res = await withTimeout(f, `${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${r.session.token}` } }, 6000)
    if (res.ok) return 'connected'
    if (res.status === 401 || res.status === 403) return 'expired'
    return 'offline'
  } catch {
    return 'offline'
  }
}
