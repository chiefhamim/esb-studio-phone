// Tests for src/publish. Every fetch is a mock; no network call, no real credential, nothing is posted or saved.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetMemoryForTests, getSecret, setSecret } from '../secure'
import { newDraft } from '../drafts'
import type { Draft } from '../drafts'
import { emailKey, ESB_AUTHORS } from './categories'
import { _resetConfirmationsForTests, consumeConfirmation, issueConfirmation } from './confirm'
import { buildReadiness, facebookBlockers, slugFromHeadline } from './readiness'
import { ensureFreshSession, signIn, SUPABASE_URL } from './site'
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
