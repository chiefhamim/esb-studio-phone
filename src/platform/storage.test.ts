// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { flushStorage, hydrateStorage } from './storage'
import { getSecret, setSecret } from '../secure'
import { kvGet } from './kv'

describe('storage router for the vendored PC code', () => {
  it('moves secrets out of localStorage, routes large keys to the KV store, leaves preferences alone', async () => {
    localStorage.setItem('esb-banner-studio/ai-settings', '{"keys":{"gemini":"K"}}')
    localStorage.setItem('esb-banner-studio/doc/v1', '{"big":true}')
    await setSecret('site-session', '{"token":"T","email":"e@x.com","authType":"supabase"}')
    await hydrateStorage()

    // secrets: readable through localStorage (the PC code) but never stored there
    expect(localStorage.getItem('esb-banner-studio/ai-settings')).toBe('{"keys":{"gemini":"K"}}')
    expect(await getSecret('pc-ai-settings')).toBe('{"keys":{"gemini":"K"}}')
    expect(localStorage.getItem('esb-banner-studio/site-session')).toContain('"token":"T"')
    expect(Object.keys(localStorage)).not.toContain('esb-banner-studio/ai-settings')
    expect(Object.keys(localStorage)).not.toContain('esb-banner-studio/site-session')

    // large: moved to KV, served from memory
    expect(Object.keys(localStorage)).not.toContain('esb-banner-studio/doc/v1')
    expect(await kvGet('esb-banner-studio/doc/v1')).toBe('{"big":true}')
    localStorage.setItem('esb-banner-studio/doc/v1', '{"big":2}')
    expect(localStorage.getItem('esb-banner-studio/doc/v1')).toBe('{"big":2}')
    await flushStorage()
    expect(await kvGet('esb-banner-studio/doc/v1')).toBe('{"big":2}')

    // writes of a secret go to the Keystore
    localStorage.setItem('esb-banner-studio/facebook', '{"pageId":"123456","token":"X"}')
    await flushStorage()
    expect(await getSecret('pc-facebook')).toBe('{"pageId":"123456","token":"X"}')
    localStorage.removeItem('esb-banner-studio/facebook')
    await flushStorage()
    expect(await getSecret('pc-facebook')).toBeNull()

    // ordinary preference: plain localStorage
    localStorage.setItem('esb-banner-studio/theme', 'dark')
    expect(Object.keys(localStorage)).toContain('esb-banner-studio/theme')
  })
})
