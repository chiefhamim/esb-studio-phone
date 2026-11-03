// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkPublicUrl, isPrivateIPv4, isPrivateIPv6 } from './netGuard'
import { articleToHtml, directFetchUrl, fetchUrl, setLinkFetchMode } from './fetchGuarded'
import { aiSettingsFromPhoneKeys, migrateSecrets, upgradeSession } from './migrateSecrets'
import { _resetMemoryForTests, getSecret, setSecret } from '../secure'
import { parseArticleDocument } from '../pc/editorial/extract'

describe('netGuard (port of PC electron/net-guard.cjs)', () => {
  it('refuses private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1']) expect(isPrivateIPv4(ip)).toBe(true)
    expect(isPrivateIPv4('8.8.8.8')).toBe(false)
    for (const ip of ['::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::7f00:1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1']) expect(isPrivateIPv6(ip)).toBe(true)
    expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false)
  })
  it('accepts public news links and upgrades http to https', () => {
    const r = checkPublicUrl('http://www.prothomalo.com/bangladesh/abc')
    expect(r.ok && r.url.protocol).toBe('https:')
    for (const bad of ['file:///etc/passwd', 'https://localhost/x', 'https://192.168.0.1/', 'https://[::1]/', 'https://user:pw@example.com/', 'javascript:alert(1)', 'https://intranet/']) expect(checkPublicUrl(bad).ok).toBe(false)
  })
})

describe('link fetching', () => {
  beforeEach(() => localStorage.clear())
  it('device mode returns the page HTML in the PC bridge shape', async () => {
    const f = vi.fn(async () => new Response('<html><head><meta charset="utf-8"><title>T</title></head><body><p>খবর</p></body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }))
    const r = await directFetchUrl('https://example.com/a', {}, f as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    expect(r.html).toContain('খবর')
  })
  it('refuses a non-page content type and an HTTP error', async () => {
    const pdf = vi.fn(async () => new Response('x', { status: 200, headers: { 'content-type': 'application/pdf' } }))
    expect((await directFetchUrl('https://example.com/a.pdf', {}, pdf as unknown as typeof fetch)).code).toBe('bad_type')
    const e404 = vi.fn(async () => new Response('no', { status: 404 }))
    expect((await directFetchUrl('https://example.com/x', {}, e404 as unknown as typeof fetch)).error).toBe('HTTP 404')
  })
  it('site mode never pretends: with no sign-in it reports the route is not usable', async () => {
    setLinkFetchMode('site')
    const r = await fetchUrl('https://www.prothomalo.com/x')
    expect(r.ok).toBe(false)
    expect(r.html).toBeUndefined()
  })
  it('the site route answer is rebuilt into HTML the PC extractor reads', () => {
    const html = articleToHtml({ ok: true, url: 'https://ex.com/a', title: 'শিরোনাম', deck: 'ডেক', text: '', paragraphs: ['প্রথম অনুচ্ছেদ ১০০ মেগাওয়াট।', 'দ্বিতীয় অনুচ্ছেদ।'], images: [{ src: 'https://ex.com/p.jpg', alt: 'ছবি' }], method: 'structured' })
    const a = parseArticleDocument(html, 'https://ex.com/a')
    expect(a.title).toBe('শিরোনাম')
    expect(a.paragraphs.join(' ')).toContain('১০০ মেগাওয়াট')
  })
})

describe('secret migration (non-destructive)', () => {
  beforeEach(() => _resetMemoryForTests())
  it('adds authType to a phone sign-in, keeps every token', () => {
    const up = JSON.parse(upgradeSession(JSON.stringify({ email: 'e@x.com', token: 'T', refreshToken: 'R', expiresAt: 9 }), '2026-11-03T00:00:00Z')!)
    expect(up).toMatchObject({ email: 'e@x.com', token: 'T', refreshToken: 'R', expiresAt: 9, authType: 'supabase' })
    expect(upgradeSession(JSON.stringify(up))).toBeNull()
  })
  it('builds PC AI settings from the phone Gemini key and keeps the old secret', async () => {
    await setSecret('gemini-key', ' AIzaKEY ')
    await migrateSecrets()
    const s = JSON.parse((await getSecret('pc-ai-settings'))!)
    expect(s.provider).toBe('gemini')
    expect(s.keys.gemini).toBe('AIzaKEY')
    expect(await getSecret('gemini-key')).toBe(' AIzaKEY ')
    expect(aiSettingsFromPhoneKeys({})).toBeNull()
  })
  it('never overwrites PC settings the editor already has', async () => {
    await setSecret('pc-ai-settings', '{"provider":"anthropic"}')
    await setSecret('gemini-key', 'K')
    await migrateSecrets()
    expect(await getSecret('pc-ai-settings')).toBe('{"provider":"anthropic"}')
  })
})
