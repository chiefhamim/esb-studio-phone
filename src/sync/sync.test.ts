// Tests for src/sync and the site connection. Every fetch is a mock: no network, no real credential, nothing is posted.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetMemoryForTests, getSecret, setSecret } from '../secure'
import { refreshSession } from '../publish/site'
import type { StaffSession } from '../publish/site'
import {
  _resetProbeForTests, cachedAvailability, fetchArticleViaSite, interpretProbe, mapEndpointError, probeFeature, revalidateSlugs,
  TTL_NO_MS, TTL_YES_MS, uploadPicture,
} from './endpoints'

// the test environment is plain Node: give the modules a small in-memory localStorage
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
})

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
    expect(calls).toHaveLength(3)
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

