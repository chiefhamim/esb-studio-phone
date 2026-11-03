// Tests for src/sync and the site connection. Every fetch is a mock: no network, no real credential, nothing is posted.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetMemoryForTests, getSecret, setSecret } from '../secure'
import { fetchArticle } from '../fetchArticle'
import { refreshSession } from '../publish/site'
import type { StaffSession } from '../publish/site'
import { getSent } from '../publish/state'
import { checkConnection } from './connection'
import {
  _resetProbeForTests, cachedAvailability, fetchArticleViaSite, interpretProbe, mapEndpointError, probeFeature, revalidateSlugs,
  TTL_NO_MS, TTL_YES_MS, uploadPicture,
} from './endpoints'
import { fetchPublished, htmlToBody, listRequest, openForUpdate, toItem } from './published'

// the test environment is plain Node: give the modules a small in-memory localStorage
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
})

const realFetch = globalThis.fetch
const TOKEN = 'TOKEN-ABC.def.ghi'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const seed = async (expiresInSec = 3600): Promise<StaffSession> => {
  const s: StaffSession = { email: 't@example.com', name: 'T', role: 'EDITOR', token: TOKEN, refreshToken: 'REFRESH-1', expiresAt: Math.floor(Date.now() / 1000) + expiresInSec, userId: 'u1' }
  await setSecret('site-session', JSON.stringify(s))
  return s
}
type Call = { url: string; init?: RequestInit }
const recorder = (answer: (c: Call) => Response | Promise<Response>) => {
  const calls: Call[] = []
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { const c = { url: String(url), init }; calls.push(c); return answer(c) }) as unknown as typeof fetch
  return { f, calls }
}
const authOf = (c: Call) => (c.init?.headers as Record<string, string> | undefined)?.Authorization

beforeEach(() => { _resetMemoryForTests(); _resetProbeForTests(); localStorage.clear() })

describe('bearer header only', () => {
  it('sends the token in Authorization and never in the URL, for every staff call', async () => {
    await seed()
    const { f, calls } = recorder(() => json(200, { ok: true, url: 'https://esbpowerline.com/x.webp', title: 't', deck: null, text: 'body', paragraphs: [], images: [], method: 'paragraphs' }))
    await uploadPicture(new Blob(['x'], { type: 'image/jpeg' }), 'a.jpg', f)
    await revalidateSlugs(['a-story'], f)
    await fetchArticleViaSite('https://news.example/a', f)
    await fetchPublished(5, 0, f)
    expect(calls).toHaveLength(4)
    for (const c of calls) {
      expect(authOf(c)).toBe(`Bearer ${TOKEN}`)
      expect(c.url).not.toContain(TOKEN)
      expect(c.url).not.toMatch(/token|access_token|apikey=/i)
    }
  })

  it('builds the exact requests', async () => {
    await seed()
    const { f, calls } = recorder(() => json(200, { ok: true }))
    await revalidateSlugs(['Good-Slug', 'good-slug', 'bad slug!', 'two'], f)
    expect(calls[0].url).toBe('https://esbpowerline.com/api/cms/revalidate')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ slugs: ['good-slug', 'two'] })
    await fetchArticleViaSite('https://news.example/a', f)
    expect(calls[1].url).toBe('https://esbpowerline.com/api/staff/fetch-article')
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ url: 'https://news.example/a' })
  })

  it('refuses without a session, oversize and non-image files, with nothing sent', async () => {
    const { f, calls } = recorder(() => json(200, {}))
    expect((await revalidateSlugs(['a'], f)).ok).toBe(false) // signed out
    await seed()
    expect((await uploadPicture(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), 'big.jpg', f)).ok).toBe(false)
    expect((await uploadPicture(new Blob(['x'], { type: 'application/pdf' }), 'a.pdf', f)).ok).toBe(false)
    expect((await revalidateSlugs(['bad slug'], f)).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('does not trust an upload answer that is not an https link', async () => {
    await seed()
    const { f } = recorder(() => json(200, { url: 'http://insecure/x.jpg' }))
    expect((await uploadPicture(new Blob(['x'], { type: 'image/png' }), 'a.png', f)).ok).toBe(false)
  })
})

describe('feature probe and degrade', () => {
  it('reads 400 as live, everything else as not usable, 429 as no information', () => {
    expect(interpretProbe(400)).toBe('available')
    expect(interpretProbe(401)).toBe('unavailable') // the old site: bearer not understood
    expect(interpretProbe(404)).toBe('unavailable')
    expect(interpretProbe(500)).toBe('unavailable')
    expect(interpretProbe(429)).toBe('unknown')
  })

  it('remembers the answer and does not ask again inside the window', async () => {
    await seed()
    const { f, calls } = recorder(() => json(400, { error: 'x' }))
    expect(await probeFeature('revalidate', { f })).toBe('available')
    expect(await probeFeature('revalidate', { f })).toBe('available')
    expect(calls).toHaveLength(1)
    expect(cachedAvailability('revalidate')).toBe('available')
    expect(cachedAvailability('revalidate', Date.now() + TTL_YES_MS + 1000)).toBe('unknown')
  })

  it('degrades to unavailable on 401/404 and looks again after the short window', async () => {
    await seed()
    const { f } = recorder(() => json(404, {}))
    expect(await probeFeature('fetchArticle', { f })).toBe('unavailable')
    expect(cachedAvailability('fetchArticle')).toBe('unavailable')
    expect(cachedAvailability('fetchArticle', Date.now() + TTL_NO_MS + 1000)).toBe('unknown')
  })

  it('does not remember a network failure or a signed-out probe', async () => {
    const down = vi.fn(async () => { throw new TypeError('network') }) as unknown as typeof fetch
    expect(await probeFeature('upload', { f: down })).toBe('unknown') // signed out: no call at all
    await seed()
    expect(await probeFeature('upload', { f: down })).toBe('unknown')
    expect(cachedAvailability('upload')).toBe('unknown')
  })

  it('the probe is an empty request: no file, no slugs, no url', async () => {
    await seed()
    const { f, calls } = recorder(() => json(400, {}))
    await probeFeature('upload', { f })
    await probeFeature('revalidate', { f })
    await probeFeature('fetchArticle', { f })
    expect((calls[0].init?.body as FormData).has('file')).toBe(false)
    expect(calls[1].init?.body).toBe('{}')
    expect(calls[2].init?.body).toBe('{}')
  })

  it('fetchArticle says "not connected" until proved, and uses the site once proved', async () => {
    await seed()
    const old = recorder(() => json(401, {}))
    // fetchArticle uses the global fetch: stub it
    vi.stubGlobal('fetch', old.f)
    const r1 = await fetchArticle('https://news.example/a')
    expect(r1.ok).toBe(false)
    expect(r1.reason).toMatch(/not connected yet/)
    expect(old.calls.every((c) => c.url.includes('/api/staff/fetch-article'))).toBe(true)
    _resetProbeForTests()
    const live = recorder((c) => (JSON.parse(String(c.init?.body)).url ? json(200, { ok: true, url: 'https://news.example/a', title: 'T', deck: null, text: 'Story text here.', paragraphs: ['Story text here.'], images: [], method: 'paragraphs' }) : json(400, {})))
    vi.stubGlobal('fetch', live.f)
    const r2 = await fetchArticle('https://news.example/a')
    expect(r2).toMatchObject({ ok: true, text: 'Story text here.', title: 'T' })
    vi.stubGlobal('fetch', realFetch)
  })

  it('fetchArticle refuses non-https links without any call', async () => {
    const { f, calls } = recorder(() => json(200, {}))
    vi.stubGlobal('fetch', f)
    expect((await fetchArticle('http://news.example/a')).ok).toBe(false)
    expect((await fetchArticle('ftp://news.example/a')).ok).toBe(false)
    expect((await fetchArticle('nonsense')).ok).toBe(false)
    expect(calls).toHaveLength(0)
    vi.stubGlobal('fetch', realFetch)
  })
})

describe('error mapping', () => {
  it('words each answer for an editor and never echoes a token', () => {
    expect(mapEndpointError(401, '')).toMatch(/Sign in again/)
    expect(mapEndpointError(403, '')).toMatch(/not allowed/)
    expect(mapEndpointError(404, '')).toMatch(/not live/)
    expect(mapEndpointError(413, '')).toMatch(/4 MB/)
    expect(mapEndpointError(429, '')).toMatch(/limiting/)
    expect(mapEndpointError(502, '')).toMatch(/HTTP 502/)
    expect(mapEndpointError(422, JSON.stringify({ error: 'Only https links can be fetched.' }))).toBe('The site said: Only https links can be fetched.')
  })
  it('a 404 from a staff call drops the remembered "available"', async () => {
    await seed()
    const ok = recorder(() => json(400, {}))
    await probeFeature('revalidate', { f: ok.f })
    const gone = recorder(() => json(404, {}))
    const r = await revalidateSlugs(['a'], gone.f)
    expect(r.ok).toBe(false)
    expect(cachedAvailability('revalidate')).toBe('unavailable')
  })
})

describe('session refresh', () => {
  it('keeps a fresh session without a call, refreshes a near-expiry one and stores the new tokens', async () => {
    await seed(3600)
    const none = recorder(() => json(500, {}))
    expect((await refreshSession(none.f)).state).toBe('ok')
    expect(none.calls).toHaveLength(0)

    await seed(60)
    const r = recorder((c) => (c.url.includes('/auth/v1/token') ? json(200, { access_token: 'NEW.aaa.bbb', refresh_token: 'REFRESH-2', expires_in: 3600, user: { id: 'u1', email: 't@example.com' } }) : json(200, [{ role: 'EDITOR', status: 'ACTIVE', full_name: 'T' }])))
    const out = await refreshSession(r.f)
    expect(out.state).toBe('ok')
    expect(JSON.parse((await getSecret('site-session')) ?? '{}').refreshToken).toBe('REFRESH-2')
    expect(r.calls.find((c) => c.url.includes('grant_type=refresh_token'))).toBeTruthy()
  })

  it('tells an ended sign-in (expired) from a network failure (unavailable)', async () => {
    await seed(60)
    expect((await refreshSession(recorder(() => json(400, { error: 'invalid_grant' })).f)).state).toBe('expired')
    await seed(60)
    expect((await refreshSession(recorder(() => json(503, {})).f)).state).toBe('unavailable')
    await seed(60)
    expect((await refreshSession((async () => { throw new TypeError('network') }) as unknown as typeof fetch)).state).toBe('unavailable')
    _resetMemoryForTests()
    expect((await refreshSession(recorder(() => json(200, {})).f)).state).toBe('none')
  })
})

describe('connection state', () => {
  const site = (feed: number, user: number) => recorder((c) => (c.url.endsWith('/feed.xml') ? new Response('<rss/>', { status: feed }) : c.url.includes('/auth/v1/user') ? json(user, {}) : json(200, {})))
  it('not-connected when nothing is saved', async () => { expect(await checkConnection(site(200, 200).f)).toBe('not-connected') })
  it('connected when the site answers and the token is accepted', async () => { await seed(); expect(await checkConnection(site(200, 200).f)).toBe('connected') })
  it('expired when the token is refused', async () => { await seed(); expect(await checkConnection(site(200, 401).f)).toBe('expired') })
  it('expired when the refresh token is refused', async () => {
    await seed(60)
    const r = recorder((c) => (c.url.endsWith('/feed.xml') ? new Response('', { status: 200 }) : json(400, { error: 'invalid_grant' })))
    expect(await checkConnection(r.f)).toBe('expired')
  })
  it('offline when the site cannot be reached, or answers an error', async () => {
    await seed()
    expect(await checkConnection((async () => { throw new TypeError('network') }) as unknown as typeof fetch)).toBe('offline')
    expect(await checkConnection(site(503, 200).f)).toBe('offline')
  })
})

describe('published list', () => {
  it('asks for newest-edited, non-trashed rows with the token in a header', () => {
    const { url, init } = listRequest(TOKEN, 10, 20)
    expect(url).toContain('/rest/v1/Article?')
    expect(url).toContain('order=updatedAt.desc')
    expect(url).toContain('editorTrash=eq.false')
    expect(url).toContain('limit=10&offset=20')
    expect(url).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })
  it('maps rows and gives only live stories a public link', () => {
    const row = { id: '1', title: 'T', slug: 's', status: 'PUBLISHED', category: 'Power Generation', imageUrl: null, publishedAt: null, updatedAt: null }
    expect(toItem(row).liveUrl).toBe('https://esbpowerline.com/articles/s')
    expect(toItem({ ...row, status: 'DRAFT' }).liveUrl).toBeNull()
  })
  it('needs a session and reports the network honestly', async () => {
    expect((await fetchPublished(5, 0, recorder(() => json(200, [])).f)).ok).toBe(false)
    await seed()
    const down = (async () => { throw new TypeError('network') }) as unknown as typeof fetch
    expect(await fetchPublished(5, 0, down)).toMatchObject({ ok: false, offline: true })
  })
  it('opens a story into a draft linked to the same article', async () => {
    await seed()
    const row = { id: 'art1', title: 'Solar deal', slug: 'solar-deal', status: 'PUBLISHED', excerpt: 'Deck.', content: '<p>One &amp; two.</p>\n<p>Three.</p>', category: 'Power Generation', imageUrl: 'https://x.supabase.co/a.webp', imageCredit: 'Credit', publishedAt: null, updatedAt: null }
    const r = await openForUpdate('art1', recorder(() => json(200, [row])).f)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft).toMatchObject({ headline: 'Solar deal', deck: 'Deck.', body: 'One & two.\n\nThree.', category: 'Power Generation', slug: 'solar-deal' })
    expect(getSent(r.draft.id)).toMatchObject({ articleId: 'art1', status: 'PUBLISHED', imageUrl: 'https://x.supabase.co/a.webp', imageCredit: 'Credit' })
  })
  it('refuses a story the phone cannot round-trip', async () => {
    await seed()
    const row = { id: 'a', title: 'T', slug: 's', status: 'DRAFT', excerpt: null, content: '{"type":"doc"}', category: 'Nope', imageUrl: null, imageCredit: null, publishedAt: null, updatedAt: null }
    expect((await openForUpdate('a', recorder(() => json(200, [row])).f)).ok).toBe(false)
    expect((await openForUpdate('a', recorder(() => json(200, [])).f)).ok).toBe(false)
  })
  it('htmlToBody keeps paragraphs', () => { expect(htmlToBody('<p>a</p><p>b<br/>c</p>')).toBe('a\n\nb\nc') })
})
