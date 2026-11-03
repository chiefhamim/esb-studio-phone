// Tests for charBudgets, facts, aiProviders (mocked fetch only: no network) and translate. No real key is used.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUDGETS, checkBudgets, fitSlug } from './charBudgets'
import { bengaliToAsciiDigits, flagUnsupportedFacts } from './facts'
import { AiError, mapHttpError, parseJsonReply, pickFlashModel, testGeminiKey } from './aiProviders'
import { BASE_PROMPT, STORY_CATEGORIES, buildTranslationRequest, cleanSource, translateStory } from './translate'
import { _resetMemoryForTests, setSecret } from './secure'

const FAKE_KEY = 'test-key-not-real'

describe('char budgets', () => {
  it('passes fields at the limit and flags one over', () => {
    expect(checkBudgets({ headline: 'a'.repeat(104), deck: 'b'.repeat(200), slug: 'c'.repeat(80) })).toEqual([])
    const issues = checkBudgets({ headline: 'a'.repeat(105), deck: 'b'.repeat(201), slug: 'c'.repeat(81) })
    expect(issues.map((i) => [i.field, i.over])).toEqual([['headline', 1], ['deck', 1], ['slug', 1]])
    expect(BUDGETS.headline).toBe(104)
  })
  it('fits slugs to word boundaries', () => {
    const s = fitSlug('Petrobangla signs a long term gas supply agreement with a new supplier for the national grid and more words here')
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s).toMatch(/^[a-z0-9-]+$/)
    expect(s.endsWith('-')).toBe(false)
  })
})

describe('fact flagging', () => {
  it('reads Bengali digits', () => expect(bengaliToAsciiDigits('৫৯২')).toBe('592'))
  it('accepts figures that are in the source, Bengali or English digits', () => {
    expect(flagUnsupportedFacts('খরচ ৫৯২ কোটি টাকা, ৪০০ মেগাওয়াট, ২৩ অক্টোবর', 'Tk 592 crore, 400 MW on 23 October')).toEqual([])
  })
  it('flags invented currency, capacity, figure, year and month', () => {
    const f = flagUnsupportedFacts('খরচ ৫৯২ কোটি টাকা', 'Tk 700 crore, 450 MW, 12 percent, 1,500 workers in March 2031')
    const kinds = f.map((x) => x.kind)
    expect(kinds).toContain('currency')
    expect(kinds).toContain('capacity')
    expect(kinds).toContain('figure')
    expect(kinds).toContain('date')
    expect(f.some((x) => x.text === 'March')).toBe(true)
  })
  it('ignores single digits without units', () => expect(flagUnsupportedFacts('x', 'in 3 districts')).toEqual([]))
})

describe('prompt building', () => {
  it('forbids inventing facts, lists the site categories, and carries the source', () => {
    const r = buildTranslationRequest('SOURCE TEXT')
    expect(r.system).toMatch(/Never add, infer, round, convert or estimate/)
    expect(r.system).toMatch(/Never invent a fact/)
    for (const c of STORY_CATEGORIES) expect(r.system).toContain(c)
    expect(r.user).toContain('SOURCE TEXT')
    expect(r.schema.required).toContain('notes')
    expect(BASE_PROMPT).toMatch(/at most 104 characters/)
  })
  it('cleans boilerplate lines from the source', () => {
    const out = cleanSource('নিজস্ব প্রতিবেদক, ঢাকা: সরকার নতুন একটি বিদ্যুৎ কেন্দ্র অনুমোদন করেছে আজ।\n\nআরও পড়ুন: অন্য একটি খবর এখানে আছে\n\nসর্বস্বত্ব সংরক্ষিত')
    expect(out).toContain('সরকার নতুন')
    expect(out).not.toContain('আরও পড়ুন')
    expect(out).not.toContain('সর্বস্বত্ব')
  })
})

describe('provider error mapping', () => {
  it('maps statuses to typed errors', () => {
    expect(mapHttpError(429).code).toBe('quota')
    expect(mapHttpError(403).code).toBe('bad-key')
    expect(mapHttpError(400, true).code).toBe('bad-key')
    expect(mapHttpError(400).code).toBe('bad-request')
    expect(mapHttpError(503).code).toBe('server')
  })
  it('parses fenced JSON and rejects junk', () => {
    expect(parseJsonReply('```json\n{"a":"b"}\n```')).toEqual({ a: 'b' })
    expect(() => parseJsonReply('nope')).toThrow(AiError)
  })
  it('picks the newest stable flash model', () => {
    expect(pickFlashModel(['models/gemini-2.5-pro', 'models/gemini-2.5-flash', 'models/gemini-3-flash-preview', 'models/gemini-2.5-flash-lite'])).toBe('gemini-2.5-flash')
    expect(pickFlashModel([])).toBe('gemini-2.5-flash')
  })
})

describe('with mocked fetch', () => {
  const calls: { url: string; init: RequestInit }[] = []
  const reply = (status: number, body: unknown) => vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  })
  beforeEach(async () => { calls.length = 0; _resetMemoryForTests(); await setSecret('gemini-key', FAKE_KEY) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('no key gives a typed error and makes no request', async () => {
    _resetMemoryForTests()
    const f = reply(200, {})
    vi.stubGlobal('fetch', f)
    await expect(translateStory({ source: 'একটি দীর্ঘ বাক্য যা সংবাদের অংশ হিসেবে আছে এখানে।' })).rejects.toMatchObject({ code: 'no-key' })
    expect(f).not.toHaveBeenCalled()
  })
  it('testKey sends the key only in the header, never the URL', async () => {
    vi.stubGlobal('fetch', reply(200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }))
    const r = await testGeminiKey()
    expect(r.ok).toBe(true)
    expect(calls[0].url).not.toContain(FAKE_KEY)
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_KEY)
  })
  it('maps bad key, quota and offline', async () => {
    vi.stubGlobal('fetch', reply(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }))
    await expect(testGeminiKey()).rejects.toMatchObject({ code: 'bad-key' })
    vi.stubGlobal('fetch', reply(429, { error: { message: 'quota' } }))
    await expect(testGeminiKey()).rejects.toMatchObject({ code: 'quota' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(testGeminiKey()).rejects.toMatchObject({ code: 'offline' })
  })
  it('error messages never contain the key', async () => {
    vi.stubGlobal('fetch', reply(403, { error: { message: `bad ${FAKE_KEY}` } }))
    await expect(testGeminiKey()).rejects.toSatisfy((e: Error) => !e.message.includes(FAKE_KEY))
  })
  it('translates, validates category, flags budgets and invented figures', async () => {
    const model = { headline: 'H'.repeat(110), deck: 'Short deck.', slug: 'Some Slug Words', category: 'Not A Category', body: 'The plant has 999 MW capacity.\n\n\n\nSecond.', notes: 'Source cut off at the end' }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.includes(':generateContent')) return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(model) }] } }] }), { status: 200 })
      return new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash' }] }), { status: 200 })
    }))
    const r = await translateStory({ source: 'কেন্দ্রটির ক্ষমতা ৪০০ মেগাওয়াট বলে জানানো হয়েছে এই প্রতিবেদনে।' })
    expect(r.slug).toBe('some-slug-words')
    expect(r.category).toBe('')
    expect(r.body).not.toMatch(/\n{3}/)
    expect(r.notes.some((n) => n.includes('Source cut off'))).toBe(true)
    expect(r.notes.some((n) => n.includes('headline is 110'))).toBe(true)
    expect(r.notes.some((n) => n.includes('999 MW'))).toBe(true)
    expect(r.notes.some((n) => n.includes('category'))).toBe(true)
    expect(calls.every((c) => !c.url.includes(FAKE_KEY))).toBe(true)
  })
})
