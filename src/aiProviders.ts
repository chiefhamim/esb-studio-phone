// AI provider calls from the phone. Gemini over REST, with the editor's own key.
// ORIGIN: request shape, response parsing and model ranking from the desktop app (esb-banner-studio
// src/editorial/aiProviders.ts), rewritten without its SDKs and with the key ONLY in the x-goog-api-key header
// (the desktop puts it in the URL; the phone never does). The key is never logged and never appears in an error message.
// Claude and OpenAI are not wired on the phone yet: the AiProvider interface leaves room, but only Gemini exists.
import { getSecret } from './secure'

export type AiErrorCode = 'no-key' | 'bad-key' | 'quota' | 'offline' | 'timeout' | 'aborted' | 'blocked' | 'bad-reply' | 'server' | 'bad-request'

export class AiError extends Error {
  code: AiErrorCode
  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

export interface AiSchema { properties: Record<string, { description: string }>; required: string[] }

export interface AiJsonRequest {
  system: string
  user: string
  schema: AiSchema
  /** model id, or 'auto' for the newest Flash model this key can use */
  model?: string
  maxTokens?: number
  timeoutMs?: number
  signal?: AbortSignal
}

/** The interface other providers would implement. */
export interface AiProvider {
  id: 'gemini'
  json<T extends Record<string, unknown>>(req: AiJsonRequest): Promise<{ data: T; model: string }>
  testKey(signal?: AbortSignal): Promise<{ ok: true; message: string }>
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const NO_KEY_MESSAGE = 'No Gemini key yet. Open Settings and add your key.'

/** Maps an HTTP failure to a typed error with a plain message. Never includes the key or the provider's raw text. */
export function mapHttpError(status: number, keyInvalid = false): AiError {
  if (keyInvalid || status === 401 || status === 403) return new AiError('bad-key', 'Gemini did not accept this key. Open Settings and replace it. (The key may be wrong, revoked, or not allowed in your region.)')
  if (status === 400) return new AiError('bad-request', 'Gemini rejected the request. Try again; if it keeps happening, check the key in Settings.')
  if (status === 429) return new AiError('quota', 'Gemini says the quota or rate limit is used up. Wait a minute and try again, or check your plan in Google AI Studio.')
  if (status === 404) return new AiError('bad-request', 'Gemini does not know that model. Try again later.')
  if (status >= 500) return new AiError('server', 'Gemini is having trouble right now. Try again in a minute.')
  return new AiError('bad-request', `Gemini returned an unexpected error (HTTP ${status}).`)
}

/** Gemini answers a bad key with HTTP 400 and "API key not valid" (reason API_KEY_INVALID). */
async function keyInvalid(res: Response): Promise<boolean> {
  const body = await res.json().catch(() => null) as { error?: { message?: string; details?: { reason?: string }[] } } | null
  return /api key not valid|api_key_invalid/i.test(body?.error?.message ?? '') || !!body?.error?.details?.some((d) => d.reason === 'API_KEY_INVALID')
}

interface Init { method: 'GET' | 'POST'; body?: string; signal?: AbortSignal; timeoutMs: number }

async function request(path: string, init: Init, key: string): Promise<Response> {
  const c = new AbortController()
  let timedOut = false
  const t = setTimeout(() => { timedOut = true; c.abort() }, init.timeoutMs)
  const onAbort = () => c.abort()
  if (init.signal?.aborted) c.abort()
  init.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: { 'x-goog-api-key': key, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body,
      signal: c.signal,
    })
    if (!res.ok) throw mapHttpError(res.status, await keyInvalid(res))
    return res
  } catch (e) {
    if (e instanceof AiError) throw e
    if (timedOut) throw new AiError('timeout', 'Gemini took too long to answer. Try again; a long story can take a minute or two.')
    if (init.signal?.aborted) throw new AiError('aborted', 'Cancelled.')
    throw new AiError('offline', "Could not reach Gemini. Check the phone's internet connection and try again.")
  } finally {
    clearTimeout(t)
    init.signal?.removeEventListener('abort', onAbort)
  }
}

async function requireKey(): Promise<string> {
  const key = (await getSecret('gemini-key'))?.trim()
  if (!key) throw new AiError('no-key', NO_KEY_MESSAGE)
  return key
}

/** Newest first: version, then Pro over Flash over Flash-Lite, stable over preview (from the desktop rankGemini). */
export function rankGemini(id: string): number {
  const v = Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0)
  const tier = /pro/.test(id) ? 3 : /flash-lite/.test(id) ? 1 : /flash/.test(id) ? 2 : 0
  const stable = /preview|exp|latest/.test(id) ? 0 : 0.5
  return v * 10 + tier + stable
}

/** The best Flash model among the listed ids (fast enough for a phone), else a safe default. */
export function pickFlashModel(ids: string[]): string {
  const ok = ids
    .map((i) => i.replace(/^models\//, ''))
    .filter((id) => /^gemini-\d/.test(id) && !/(embedding|image|vision|audio|tts|live|native|thinking-exp|learnlm|aqa)/.test(id))
  const all = ok.filter((id) => /flash/.test(id) && !/lite/.test(id))
  const stable = all.filter((id) => !/preview|exp|latest/.test(id))
  const flash = (stable.length ? stable : all).sort((a, b) => rankGemini(b) - rankGemini(a))
  return flash[0] ?? 'gemini-2.5-flash'
}

export const toGeminiSchema = (s: AiSchema) => ({
  type: 'OBJECT',
  properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, { type: 'STRING', description: v.description }])),
  required: s.required,
})

/** Parses a JSON reply, tolerating a code fence or stray text around the object. */
export function parseJsonReply(text: string): Record<string, unknown> {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(t) as Record<string, unknown> } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown> } catch { /* fall through */ }
  }
  throw new AiError('bad-reply', 'Gemini did not answer in the expected form. Try again.')
}

async function listModelIds(key: string, signal?: AbortSignal): Promise<string[]> {
  const res = await request('/models?pageSize=200', { method: 'GET', signal, timeoutMs: 15_000 }, key)
  const data = await res.json().catch(() => null) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] } | null
  return (data?.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent') ?? true).map((m) => m.name ?? '').filter(Boolean)
}

export async function geminiJson<T extends Record<string, unknown>>(req: AiJsonRequest): Promise<{ data: T; model: string }> {
  const key = await requireKey()
  let model = req.model && req.model !== 'auto' ? req.model : ''
  if (!model) {
    // a listing failure that is not about the key, the quota or the network is not worth stopping for
    try { model = pickFlashModel(await listModelIds(key, req.signal)) } catch (e) {
      if (e instanceof AiError && ['bad-key', 'offline', 'aborted', 'quota', 'timeout'].includes(e.code)) throw e
      model = 'gemini-2.5-flash'
    }
  }
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: Math.max(req.maxTokens ?? 16000, 8192), responseMimeType: 'application/json', responseSchema: toGeminiSchema(req.schema) },
  })
  const res = await request(`/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body, signal: req.signal, timeoutMs: req.timeoutMs ?? 150_000 }, key)
  const data = await res.json().catch(() => null) as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] } | null
  if (data?.promptFeedback?.blockReason) throw new AiError('blocked', 'Gemini declined to process this text.')
  const cand = data?.candidates?.[0]
  if (cand?.finishReason === 'MAX_TOKENS') throw new AiError('bad-reply', 'The story was too long for one reply. Translate it in two parts.')
  if (cand?.finishReason && cand.finishReason !== 'STOP') throw new AiError('blocked', `Gemini stopped early (${cand.finishReason}). Try again.`)
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  if (!text.trim()) throw new AiError('bad-reply', 'Gemini returned nothing. Try again.')
  return { data: parseJsonReply(text) as T, model }
}

/** The cheapest real call that proves the key: list models (no text is generated, no tokens are used). */
export async function testGeminiKey(signal?: AbortSignal): Promise<{ ok: true; message: string }> {
  const key = await requireKey()
  const ids = await listModelIds(key, signal)
  return { ok: true, message: `Key works. ${ids.length} Gemini models available.` }
}

export const gemini: AiProvider = { id: 'gemini', json: geminiJson, testKey: testGeminiKey }

/** Plain message for any thrown value, safe to show. */
export function errorMessage(e: unknown): string {
  return e instanceof AiError ? e.message : 'Something went wrong. Try again.'
}
