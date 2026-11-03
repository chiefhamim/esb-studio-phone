// Tests for src/publish. Every fetch is a mock; no network call, no real credential, nothing is posted or saved.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetMemoryForTests, getSecret, setSecret } from '../secure'
import { newDraft } from '../drafts'
import type { Draft } from '../drafts'
import { defaultCaption, sanitizeFacebook } from './caption'
import { emailKey, ESB_AUTHORS } from './categories'
import { _resetConfirmationsForTests, consumeConfirmation, issueConfirmation } from './confirm'
import { facebookError, GRAPH, postToFacebook } from './facebook'
import { buildReadiness, facebookBlockers, slugFromHeadline } from './readiness'
import { buildArticleRecord, ensureFreshSession, mapSiteError, saveArticle, signIn, SUPABASE_URL } from './site'
import type { StaffSession } from './site'

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const good = (): Draft => ({ ...newDraft(), headline: 'A fine headline', deck: 'A short deck.', body: words(60), category: 'Power Generation', slug: 'a-fine-headline' })
const extras = { translationReviewed: false, hasPicture: true }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// a synthetic account, made known to the author table for the tests only
const TEST_EMAIL = 'tester@example.com'
async function seedSession(expiresInSec = 3600): Promise<StaffSession> {
  ESB_AUTHORS[await emailKey(TEST_EMAIL)] = { id: 'author-test', name: 'Test Author', role: 'EDITOR' }
  const s: StaffSession = { email: TEST_EMAIL, name: 'Test', role: 'EDITOR', token: 'TOKEN-ABC', refreshToken: 'REFRESH-1', expiresAt: Math.floor(Date.now() / 1000) + expiresInSec, userId: 'u1' }
  await setSecret('site-session', JSON.stringify(s))
  return s
}

beforeEach(() => { _resetMemoryForTests(); _resetConfirmationsForTests() })

describe('readiness', () => {
  it('is ready (or only warns) for a complete story', () => {
    expect(buildReadiness(good(), extras).state).toBe('ready')
    expect(buildReadiness(good(), { ...extras, hasPicture: false }).state).toBe('review')
  })
  it('blocks, in plain words, on each missing or over-long field', () => {
    const r = (p: Partial<Draft>) => buildReadiness({ ...good(), ...p }, extras)
    expect(r({ headline: '' }).blockers[0].detail).toMatch(/Write the headline/)
    expect(r({ headline: 'x'.repeat(105) }).blockers[0].detail).toMatch(/105 characters; the site takes 104/)
    expect(r({ headline: 'x'.repeat(104) }).state).toBe('ready')
    expect(r({ deck: '' }).state).toBe('blocked')
    expect(r({ deck: 'x'.repeat(201) }).blockers[0].detail).toMatch(/takes 200/)
    expect(r({ body: 'too short' }).state).toBe('blocked')
    expect(r({ slug: '' }).state).toBe('blocked')
    expect(r({ slug: 'a'.repeat(81) }).blockers[0].detail).toMatch(/takes 80/)
    expect(r({ slug: 'Bad Slug' }).state).toBe('blocked')
    expect(r({ category: '' }).blockers[0].detail).toMatch(/Choose a category/)
    expect(r({ category: 'Made Up' }).state).toBe('blocked')
    expect(r({ body: `পেট্রোবাংলা ${words(60)}` }).blockers.some((c) => c.id === 'bengali')).toBe(true)
  })
  it('needs the translation reviewed only when the draft was translated', () => {
    expect(buildReadiness({ ...good(), translated: true }, extras).blockers.map((c) => c.id)).toEqual(['translation'])
    expect(buildReadiness({ ...good(), translated: true }, { ...extras, translationReviewed: true }).state).toBe('ready')
  })
  it('makes slugs of at most 80 characters and facebook needs a page, a picture and a caption', () => {
    expect(slugFromHeadline('Petrobangla & LNG: 2 new wells!')).toBe('petrobangla-and-lng-2-new-wells')
    expect(slugFromHeadline('word '.repeat(40)).length).toBeLessThanOrEqual(80)
    expect(facebookBlockers({ hasPictureFile: false, caption: '', connected: false })).toHaveLength(3)
    expect(facebookBlockers({ hasPictureFile: true, caption: 'x', connected: true })).toEqual([])
  })
})

describe('caption', () => {
  it('strips links, keeps two lines within 125 characters and one hashtag line ending with the brand tag', () => {
    const c = sanitizeFacebook('Big news https://example.com/x\nsecond\nthird #LNG #ESBPowerLine #Energy')
    expect(c).not.toMatch(/https?:/)
    expect(c.split('\n\n')[1]).toBe('#LNG #Energy #ESBPowerLine')
    expect(sanitizeFacebook('x '.repeat(100)).split('\n\n')[0].length).toBeLessThanOrEqual(126)
  })
  it('defaults to the headline plus the brand tag, and to nothing when there is no headline', () => {
    expect(defaultCaption('A fine headline')).toBe('A fine headline\n\n#ESBPowerLine')
    expect(defaultCaption('  ')).toBe('')
  })
})

describe('confirmation gate', () => {
  const plan = { kind: 'site' as const, title: 'A fine headline', slug: 'a-fine-headline', destination: 'site', picture: 'none' }
  it('is one-time and tied to kind, title and slug', () => {
    const c = issueConfirmation(plan)
    expect(consumeConfirmation(c, { kind: 'site', title: 'A fine headline', slug: 'a-fine-headline' })).toBe(true)
    expect(consumeConfirmation(c, { kind: 'site', title: 'A fine headline', slug: 'a-fine-headline' })).toBe(false)
    const d = issueConfirmation(plan)
    expect(consumeConfirmation(d, { kind: 'facebook', title: 'A fine headline' })).toBe(false)
    expect(consumeConfirmation(undefined, { kind: 'site', title: 'x' })).toBe(false)
  })
  it('a live site publish without confirmation sends nothing', async () => {
    await seedSession()
    const f = vi.fn()
    const r = await saveArticle(good(), { publish: true }, f as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
    const wrong = issueConfirmation({ ...plan, title: 'Another story' })
    const r2 = await saveArticle(good(), { publish: true, confirmation: wrong }, f as unknown as typeof fetch)
    expect(r2.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('a facebook post without confirmation sends nothing', async () => {
    const f = vi.fn()
    const r = await postToFacebook({ cfg: { pageId: '1234567', token: 'FB-TOKEN' }, photo: new Blob(['x'], { type: 'image/jpeg' }), caption: 'Hi', title: 'T' }, f as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('saveArticle requests', () => {
  it('saves as an unpublished DRAFT by default, with the token in the header only', async () => {
    const s = await seedSession()
    const f = vi.fn(async () => new Response(null, { status: 201 }))
    const r = await saveArticle(good(), {}, f as unknown as typeof fetch)
    expect(r.ok && r.status).toBe('DRAFT')
    expect(r.ok && r.liveUrl).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/Article`)
    expect(url).not.toContain(s.token)
    expect(init.method).toBe('POST')
    const h = init.headers as Record<string, string>
    expect(h.Authorization).toBe(`Bearer ${s.token}`)
    expect(h.apikey).toBeTruthy()
    const body = JSON.parse(init.body as string)
    expect(body.status).toBe('DRAFT')
    expect(body.publishedAt).toBeNull()
    expect(JSON.stringify(body)).not.toContain(s.token)
  })
  it('publishes live only with a matching confirmation, then PUBLISHED with a time', async () => {
    await seedSession()
    const f = vi.fn(async () => new Response(null, { status: 201 }))
    const c = issueConfirmation({ kind: 'site', title: 'A fine headline', slug: 'a-fine-headline', destination: 'd', picture: 'none' })
    const r = await saveArticle(good(), { publish: true, confirmation: c }, f as unknown as typeof fetch)
    expect(r.ok && r.liveUrl).toBe('https://esbpowerline.com/articles/a-fine-headline')
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.status).toBe('PUBLISHED')
    expect(body.publishedAt).toBeTruthy()
  })
  it('refuses an unready story, a missing sign-in and an unknown author before any request', async () => {
    const f = vi.fn()
    expect((await saveArticle({ ...good(), headline: '' }, {}, f as unknown as typeof fetch)).ok).toBe(false)
    expect((await saveArticle(good(), {}, f as unknown as typeof fetch)).ok).toBe(false) // signed out
    await setSecret('site-session', JSON.stringify({ email: 'nobody@example.com', name: 'n', role: 'EDITOR', token: 't', refreshToken: 'r', expiresAt: Date.now() / 1000 + 3600, userId: 'u' }))
    const r = await saveArticle(good(), {}, f as unknown as typeof fetch)
    expect(!r.ok && r.error).toMatch(/does not know its author/)
    expect(f).not.toHaveBeenCalled()
  })
  it('never lets a draft save take a live story down', async () => {
    await seedSession()
    const f = vi.fn()
    const r = await saveArticle(good(), { knownLive: true }, f as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('only sends an https picture link', async () => {
    const rec = (url: string) => buildArticleRecord(good(), 'a', false, 'DRAFT', { imageUrl: url }, 'id', 'now')
    expect(rec('https://example.com/p.jpg').imageUrl).toBe('https://example.com/p.jpg')
    expect(rec('blob:abc').imageUrl).toBeNull()
  })
  it('maps errors to plain words and keeps tokens out of them', async () => {
    expect(mapSiteError(409, JSON.stringify({ message: 'duplicate key value violates unique constraint "Article_slug_key"' }), 'my-slug')).toMatch(/"my-slug" is already used/)
    expect(mapSiteError(401, '')).toMatch(/Sign in again/)
    expect(mapSiteError(403, '')).toMatch(/not allowed/)
    expect(mapSiteError(503, '')).toMatch(/HTTP 503/)
    await seedSession()
    const f = vi.fn(async () => json(409, { message: 'Article_slug_key' }))
    const r = await saveArticle(good(), {}, f as unknown as typeof fetch)
    expect(!r.ok && r.error).toMatch(/already used/)
    const down = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const r2 = await saveArticle(good(), {}, down as unknown as typeof fetch)
    expect(!r2.ok && r2.error).toMatch(/Could not reach/)
  })
})

describe('sign-in', () => {
  const tokenBody = { access_token: 'ACCESS-1', refresh_token: 'REFRESH-2', expires_in: 3600, user: { id: 'u1', email: TEST_EMAIL, user_metadata: { full_name: 'Test Author' } } }
  it('posts the password to the auth service only, stores the token session and never the password', async () => {
    const f = vi.fn(async (url: string) => (String(url).includes('/auth/v1/token') ? json(200, tokenBody) : json(200, [{ role: 'EDITOR', status: 'ACTIVE', full_name: 'Test Author' }])))
    const r = await signIn(TEST_EMAIL, 'pw-secret-123', f as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${SUPABASE_URL}/auth/v1/token?grant_type=password`)
    expect(url).not.toContain('pw-secret')
    expect(JSON.parse(init.body as string).password).toBe('pw-secret-123')
    const stored = (await getSecret('site-session')) ?? ''
    expect(stored).toContain('ACCESS-1')
    expect(stored).not.toContain('pw-secret-123')
  })
  it('says what went wrong for a bad password and refuses member accounts', async () => {
    const bad = vi.fn(async () => json(400, { error_description: 'Invalid login credentials' }))
    const r = await signIn(TEST_EMAIL, 'x', bad as unknown as typeof fetch)
    expect(!r.ok && r.error).toMatch(/Invalid email or password/)
    expect(await getSecret('site-session')).toBeNull()
    const member = vi.fn(async (url: string) => (String(url).includes('/auth/v1/token') ? json(200, tokenBody) : json(200, [{ role: 'SUBSCRIBER', status: 'ACTIVE' }])))
    const r2 = await signIn(TEST_EMAIL, 'x', member as unknown as typeof fetch)
    expect(!r2.ok && r2.error).toMatch(/member account/)
  })
  it('refreshes an expiring session once, stores the new tokens, and leaves a fresh one alone', async () => {
    await seedSession(60)
    const f = vi.fn(async (url: string) => (String(url).includes('grant_type=refresh_token') ? json(200, { ...tokenBody, access_token: 'ACCESS-NEW', refresh_token: 'REFRESH-NEW' }) : json(200, [{ role: 'EDITOR', status: 'ACTIVE' }])))
    const [a, b] = await Promise.all([ensureFreshSession(f as unknown as typeof fetch), ensureFreshSession(f as unknown as typeof fetch)])
    expect(a?.token).toBe('ACCESS-NEW')
    expect(b?.token).toBe('ACCESS-NEW')
    expect(f.mock.calls.filter((c) => String(c[0]).includes('refresh_token'))).toHaveLength(1)
    expect((await getSecret('site-session')) ?? '').toContain('REFRESH-NEW')
    const g = vi.fn()
    expect((await ensureFreshSession(g as unknown as typeof fetch))?.token).toBe('ACCESS-NEW')
    expect(g).not.toHaveBeenCalled()
  })
})

describe('facebook', () => {
  const cfg = { pageId: '1234567890', token: 'FB-TOKEN-XYZ' }
  const photo = () => new Blob(['img'], { type: 'image/jpeg' })
  it('posts a photo with the token only in the Authorization header', async () => {
    const f = vi.fn(async () => json(200, { id: '111', post_id: '1234567890_111' }))
    const c = issueConfirmation({ kind: 'facebook', title: 'A fine headline', destination: 'd', picture: 'p' })
    const r = await postToFacebook({ cfg, photo: photo(), caption: 'Headline https://example.com\n\n#ESBPowerLine', title: 'A fine headline', confirmation: c }, f as unknown as typeof fetch)
    expect(r.ok && r.postId).toBe('1234567890_111')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${GRAPH}/1234567890/photos`)
    expect(url).not.toContain('FB-TOKEN')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer FB-TOKEN-XYZ')
    const form = init.body as FormData
    expect(String(form.get('caption'))).not.toMatch(/https?:/)
    expect(form.get('published')).toBe('true')
    expect(JSON.stringify([...form.keys()])).not.toContain('token')
  })
  it('adds the link comment after a post and reports a failed comment honestly', async () => {
    const f = vi.fn(async (url: string) => (String(url).endsWith('/photos') ? json(200, { post_id: 'p_1' }) : json(403, { error: { code: 200, message: 'no' } })))
    const c = issueConfirmation({ kind: 'facebook', title: 'T', destination: 'd', picture: 'p' })
    const r = await postToFacebook({ cfg, photo: photo(), caption: 'Hi', title: 'T', confirmation: c, commentLink: 'https://esbpowerline.com/articles/x' }, f as unknown as typeof fetch)
    expect(r.ok && r.comment && !r.comment.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
    for (const call of f.mock.calls as unknown as [string][]) expect(call[0]).not.toContain('FB-TOKEN')
  })
  it('maps Graph errors and refuses a wrong picture type before any request', async () => {
    expect(facebookError(400, { error: { code: 190 } })).toMatch(/expired or was revoked/)
    expect(facebookError(400, { error: { code: 100 } })).toMatch(/Page ID/)
    expect(facebookError(500, null)).toBe('Facebook answered HTTP 500.')
    const f = vi.fn()
    const c = issueConfirmation({ kind: 'facebook', title: 'T', destination: 'd', picture: 'p' })
    const r = await postToFacebook({ cfg, photo: new Blob(['x'], { type: 'image/gif' }), caption: 'Hi', title: 'T', confirmation: c }, f as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})
