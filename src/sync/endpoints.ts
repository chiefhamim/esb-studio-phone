// The three esbpowerline.com routes that accept `Authorization: Bearer <staff access token>` once the site branch
// `phone-bearer-api` is live (docs/SITE_CONNECTIVITY.md): POST /api/upload, POST /api/cms/revalidate and
// POST /api/staff/fetch-article. Until then they answer 401/404 to a bearer call, so every feature here starts as
// "Planned" and turns on only when a probe proves the route exists AND accepts the token.
//
// The token goes ONLY in the Authorization header, never in a URL. Nothing here posts anything: the probe sends an
// empty request that each route rejects with 400 after authentication, before it does any work.
import { SITE_BASE_URL, ensureFreshSession } from '../publish/site'
import type { StaffSession } from '../publish/site'

type Fetch = typeof fetch

export type Feature = 'upload' | 'revalidate' | 'fetchArticle'
export type Availability = 'available' | 'unavailable' | 'unknown'

export const ENDPOINT_PATH: Record<Feature, string> = {
  upload: '/api/upload',
  revalidate: '/api/cms/revalidate',
  fetchArticle: '/api/staff/fetch-article',
}

const KEY = 'esb-phone-feature-probe-v1'
/** a working route is re-proved after a day; a missing one is looked at again after ten minutes (a deploy may land) */
export const TTL_YES_MS = 24 * 60 * 60 * 1000
export const TTL_NO_MS = 10 * 60 * 1000

interface Entry { available: boolean; at: number }

function read(): Partial<Record<Feature, Entry>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Partial<Record<Feature, Entry>>) : {}
  } catch { return {} }
}
function write(all: Partial<Record<Feature, Entry>>): void {
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage full: the probe just runs again */ }
}

/** What was last learned about a feature, without any network call. 'unknown' = never probed or the answer is stale. */
export function cachedAvailability(feature: Feature, now = Date.now()): Availability {
  const e = read()[feature]
  if (!e) return 'unknown'
  if (now - e.at > (e.available ? TTL_YES_MS : TTL_NO_MS)) return 'unknown'
  return e.available ? 'available' : 'unavailable'
}

export function _resetProbeForTests(): void { try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ } }

/** The probe body for each route: something the route rejects with 400 after it has authenticated the caller. */
function probeInit(feature: Feature, token: string): RequestInit {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (feature === 'upload') {
    const form = new FormData()
    form.append('folder', 'library') // no `file` part: the route answers 400 "No file provided." and stores nothing
    return { method: 'POST', headers, body: form }
  }
  headers['Content-Type'] = 'application/json'
  return { method: 'POST', headers, body: '{}' } // no slugs / no url: 400 before any work
}

/** 400 = route exists, authenticated us, and refused the empty request. 401/403/404/405/5xx = not usable. */
export function interpretProbe(status: number): Availability {
  if (status === 400 || status === 422) return 'available'
  if (status === 429) return 'unknown' // rate limited: says nothing about the route
  return 'unavailable'
}

/**
 * Ask the site whether a feature works with a bearer token, and remember the answer. A network failure is 'unknown'
 * and is NOT remembered (being offline is not the same as the route being missing).
 */
export async function probeFeature(feature: Feature, opts: { force?: boolean; f?: Fetch; session?: StaffSession | null } = {}): Promise<Availability> {
  const f = opts.f ?? fetch
  if (!opts.force) {
    const c = cachedAvailability(feature)
    if (c !== 'unknown') return c
  }
  const session = opts.session ?? (await ensureFreshSession(f))
  if (!session) return 'unknown'
  try {
    const res = await f(`${SITE_BASE_URL}${ENDPOINT_PATH[feature]}`, probeInit(feature, session.token))
    const a = interpretProbe(res.status)
    if (a !== 'unknown') write({ ...read(), [feature]: { available: a === 'available', at: Date.now() } })
    return a
  } catch {
    return 'unknown'
  }
}

// ---------- error wording ----------

/** What a staff-route answer means to an editor. Never includes a token. */
export function mapEndpointError(status: number, bodyText: string): string {
  let msg = ''
  try { msg = (JSON.parse(bodyText) as { error?: string }).error ?? '' } catch { /* not JSON */ }
  if (status === 401) return 'The site no longer accepts this sign-in. Sign in again.'
  if (status === 403) return 'This account is not allowed to do that on esbpowerline.com.'
  if (status === 404 || status === 405) return 'This feature is not live on esbpowerline.com yet.'
  if (status === 413) return 'That file is too large for the site (the limit is about 4 MB).'
  if (status === 429) return 'The site is limiting requests. Wait a minute and try again.'
  if (status >= 500) return `esbpowerline.com had a problem (HTTP ${status}). Check the site before trying again.`
  return msg ? `The site said: ${msg}` : `The site answered HTTP ${status}.`
}

export type Called<T> = { ok: true; data: T } | { ok: false; error: string; status?: number; offline?: boolean }

async function call<T>(feature: Feature, init: (token: string) => RequestInit, f: Fetch): Promise<Called<T>> {
  const session = await ensureFreshSession(f)
  if (!session) return { ok: false, error: 'Sign in with your esbpowerline.com editor account first.' }
  let res: Response
  try {
    res = await f(`${SITE_BASE_URL}${ENDPOINT_PATH[feature]}`, init(session.token))
  } catch {
    return { ok: false, error: 'Could not reach esbpowerline.com. Check the connection.', offline: true }
  }
  const text = await res.text().catch(() => '')
  if (res.status === 404 || res.status === 405 || (res.status === 401 && cachedAvailability(feature) === 'available')) {
    // the route vanished (or the token is refused): drop the remembered "available"
    write({ ...read(), [feature]: { available: false, at: Date.now() } })
  }
  if (!res.ok) return { ok: false, error: mapEndpointError(res.status, text), status: res.status }
  try { return { ok: true, data: JSON.parse(text) as T } } catch { return { ok: false, error: 'The site sent an answer this app could not read.', status: res.status } }
}

// ---------- the calls ----------

/** Picture upload into the site's media library. 4 MB cap is enforced here before anything is sent. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export async function uploadPicture(file: Blob, name: string, f: Fetch = fetch): Promise<Called<{ url: string }>> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'That picture is over 4 MB, which the site refuses. Choose a smaller one.' }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, error: 'Only JPEG, PNG or WebP pictures can be uploaded.' }
  const r = await call<{ url?: string }>('upload', (token) => {
    const form = new FormData()
    form.append('file', file, name || 'picture')
    form.append('folder', 'library')
    return { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  }, f)
  if (!r.ok) return r
  // the site must hand back an https link on its own storage; anything else is not trusted as the article image
  if (typeof r.data.url !== 'string' || !/^https:\/\//.test(r.data.url)) return { ok: false, error: 'The site did not return a picture link.' }
  return { ok: true, data: { url: r.data.url } }
}

/** Ask the site to refresh the public pages for just-published slugs. Best effort: failures never undo a publish. */
export async function revalidateSlugs(slugs: string[], f: Fetch = fetch): Promise<Called<{ ok: boolean }>> {
  const clean = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)))].slice(0, 5)
  if (!clean.length) return { ok: false, error: 'No valid slug to refresh.' }
  return call<{ ok: boolean }>('revalidate', (token) => ({
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slugs: clean }),
  }), f)
}

export interface FetchedArticle {
  ok: true
  url: string
  title: string
  deck: string | null
  text: string
  paragraphs: string[]
  images: Array<{ src: string; alt: string }>
  method: 'structured' | 'paragraphs' | 'metadata-only'
}
export async function fetchArticleViaSite(url: string, f: Fetch = fetch): Promise<Called<FetchedArticle>> {
  return call<FetchedArticle>('fetchArticle', (token) => ({
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }), f)
}
