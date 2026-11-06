// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

describe('fetch on the phone', () => {
  it('sends AI-company calls through the WebView fetch and everything else through the native stack', async () => {
    const native = vi.fn(async () => new Response('n'))
    const web = vi.fn(async () => new Response('w'))
    window.fetch = native as unknown as typeof fetch
    ;(window as unknown as { CapacitorWebFetch: unknown }).CapacitorWebFetch = web
    const { installFetchFix, isAiRequest } = await import('./fetchFix')
    installFetchFix()

    for (const u of ['https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', 'https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/chat/completions', 'https://openrouter.ai/api/v1/chat/completions']) {
      expect(isAiRequest(u)).toBe(true)
    }
    expect(isAiRequest('https://sxgokpmrbgdndstygapc.supabase.co/auth/v1/token')).toBe(false)
    expect(isAiRequest('https://evil.example/https://api.openai.com/')).toBe(false)

    await window.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=k', { method: 'POST', body: JSON.stringify({ generationConfig: {} }) })
    expect(web).toHaveBeenCalledTimes(1)
    expect(native).not.toHaveBeenCalled()
    // the Gemini 3 thinking level is still added on this path
    const body = JSON.parse((web.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' })

    await window.fetch('https://esbpowerline.com/api/feed')
    expect(native).toHaveBeenCalledTimes(1)

    // an abort still ends the call at once
    web.mockImplementationOnce(() => new Promise<Response>(() => {}))
    const c = new AbortController()
    const p = window.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: c.signal })
    c.abort()
    await expect(p).rejects.toThrow()
  })
})
