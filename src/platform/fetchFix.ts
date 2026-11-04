// Two fixes for fetch() on the phone, found by tracing a real translation on the S25 Ultra (2026-11-05):
//
// 1. Cancel and timeouts. On Android, fetch() goes through CapacitorHttp (the native stack). It honours an AbortSignal for
//    GET but IGNORES it for POST: an aborted POST keeps running until the server answers. Every AI call is a POST, so the
//    desktop code's 120 s timeout (and the Cancel button) never stopped a stalled Gemini request and the Engine waited
//    forever. Here every request that carries a signal is raced against it, so an abort always ends the call at once.
//
// 2. Gemini 3 speed. With no thinking level set, gemini-3.x models think adaptively: a one-word answer took ~9 s (from the
//    PC as well as the phone). thinkingLevel "low" answered the same request in ~1 s. A request that sets no thinking
//    config gets "low", which suits translation and structured jobs; one that sets its own is left alone.
//
// The desktop modules (src/pc) stay untouched: this wraps window.fetch once, at boot.

const GEMINI_GEN = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/(gemini-[3-9][^:/]*):generateContent/

function withThinkingLevel(url: string, init?: RequestInit): RequestInit | undefined {
  if (!init || typeof init.body !== 'string' || !GEMINI_GEN.test(url)) return init
  try {
    const body = JSON.parse(init.body) as { generationConfig?: { thinkingConfig?: unknown } }
    if (body.generationConfig?.thinkingConfig) return init
    body.generationConfig = { ...(body.generationConfig ?? {}), thinkingConfig: { thinkingLevel: 'low' } }
    return { ...init, body: JSON.stringify(body) }
  } catch {
    return init
  }
}

function abortError(signal: AbortSignal): Error {
  const r = signal.reason
  if (r instanceof Error) return r
  return new DOMException(typeof r === 'string' ? r : 'The request was cancelled', 'AbortError')
}

let installed = false

export function installFetchFix() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const base = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const req = withThinkingLevel(url, init)
    const signal = req?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (!signal) return base(input, req)
    if (signal.aborted) return Promise.reject(abortError(signal))
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(abortError(signal))
      signal.addEventListener('abort', onAbort, { once: true })
      base(input, req).then(
        (r) => { signal.removeEventListener('abort', onAbort); resolve(r) },
        (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
      )
    })
  }
}
