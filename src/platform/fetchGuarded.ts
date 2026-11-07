// fetchUrl / fetchImageData for the phone, matching the PC bridge's result shapes (electron/net-guard.cjs).
//
// KNOWN LIMIT (Android): in 'device' mode the native HTTP stack follows redirects itself and does not report the final address,
// so a public page that redirects to a private address cannot be refused AFTER the fact; only the address the editor pasted is
// checked. The reply goes to the editor's own screen and their chosen AI provider, never to a third party.
// Link fetching has two modes (Settings > Link fetching):
//   'device' (default): the phone's native HTTP stack (CapacitorHttp) fetches the public page itself, the way the PC's own
//            main process does, after the same URL checks as the PC's net-guard.
//   'site'   pages are read by esbpowerline.com's staff route POST /api/staff/fetch-article
//            (branch phone-bearer-api). Until that route is live the answer is an honest "not connected" error.
// esbpowerline.com's own public pages and feeds are always read directly (that is the site, not a third-party link).
import type { EsbFetchImageDataResult, EsbFetchUrlResult } from '../pc/esb'
import { ALLOWED_HTML_TYPES, ALLOWED_IMAGE_TYPES, MAX_HTML_BYTES, MAX_IMAGE_BYTES, checkPublicUrl, typeAllowed } from './netGuard'
import { cachedAvailability, fetchArticleViaSite, type FetchedArticle } from '../sync/endpoints'
import { pinStoryBody } from './storyData'

export type LinkFetchMode = 'site' | 'device'
const MODE_KEY = 'esb-phone/link-fetch-mode'
export function getLinkFetchMode(): LinkFetchMode { try { return localStorage.getItem(MODE_KEY) === 'site' ? 'site' : 'device' } catch { return 'device' } }
export function setLinkFetchMode(m: LinkFetchMode) { try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ } }

/** The page's own address after redirects, or '' when the response does not tell it (CapacitorHttp's interceptor). */
export function realUrl(u: string | null | undefined): string {
  if (!u) return ''
  try { const x = new URL(u); return x.hostname === 'localhost' || x.pathname.includes('_capacitor_') ? '' : u } catch { return '' }
}

const SITE_HOSTS = new Set(['esbpowerline.com', 'www.esbpowerline.com'])

type Fetch = typeof fetch

/** Unwrap Bing News click-through URLs and offline-decodable Google News CBMi... base64url tokens. */
export function unwrapFeedRedirectUrl(rawUrl: string): string {
  try {
    const u = new URL(String(rawUrl).trim())
    if (/(^|\.)bing\.com$/i.test(u.hostname) && /apiclick/i.test(u.pathname)) {
      const real = u.searchParams.get('url')
      if (real && /^https?:\/\//i.test(real)) return real
    }
    if (/(^|\.)news\.google\.com$/i.test(u.hostname)) {
      const m = u.pathname.match(/\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)/)
      if (m) {
        const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
        const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
        const bin = atob(pad)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const decoded = new TextDecoder('latin1').decode(bytes)
        const urlMatch = decoded.match(/https?:\/\/[^\x00-\x1f\x7f"'\s<>\\]+/)
        if (urlMatch && !/news\.google\.com/i.test(urlMatch[0])) return urlMatch[0]
      }
    }
  } catch { /* ignore */ }
  return rawUrl
}

/** Resolve modern Google News AU_yqL... article tokens via Google's Fbv4je batchexecute endpoint. */
export async function resolveGoogleNewsUrl(rawUrl: string, f: Fetch = fetch): Promise<string> {
  const syncUnwrapped = unwrapFeedRedirectUrl(rawUrl)
  if (syncUnwrapped !== rawUrl) return syncUnwrapped
  let token = ''
  try {
    const u = new URL(String(rawUrl).trim())
    if (!/(^|\.)news\.google\.com$/i.test(u.hostname)) return rawUrl
    const m = u.pathname.match(/\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)/)
    if (!m) return rawUrl
    token = m[1]
  } catch {
    return rawUrl
  }
  for (const prefix of ['https://news.google.com/rss/articles/', 'https://news.google.com/articles/']) {
    try {
      const res = await f(prefix + token, { headers: { Accept: 'text/html,application/xhtml+xml' } })
      const html = await res.text()
      const tsMatch = html.match(/data-n-a-ts=["'](\d+)["']/)
      const sgMatch = html.match(/data-n-a-sg=["']([^"']+)["']/)
      if (!tsMatch || !sgMatch) continue
      const inner = `["garturlreq",[["en-US","US",["FINANCE_TOP_INDICES","WEB_TEST_1_0_0"],null,null,1,1,"US:en",null,180,null,null,null,null,null,0,5],"en-US","US",1,[2,4,8],1,1,null,0,0,null,0],"${token}",${tsMatch[1]},"${sgMatch[1]}"]`
      const rpcPayload = JSON.stringify([[['Fbv4je', inner, null, 'generic']]])
      const body = `f.req=${encodeURIComponent(rpcPayload)}&`
      const postRes = await f('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      })
      const postTxt = await postRes.text()
      const unescaped = postTxt.replace(/\\"/g, '"').replace(/\\\//g, '/')
      const mUrls = [...unescaped.matchAll(/https?:\/\/[^\s"'<>\\,\]]+/g)]
        .map((x) => x[0])
        .filter((u) => !/google\.com|gstatic\.com|googleapis\.com/i.test(u))
      if (mUrls[0]) return mUrls[0]
    } catch { /* try next prefix */ }
  }
  return rawUrl
}

async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const len = Number(res.headers.get('content-length') ?? '0')
  if (len > max) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  return buf.byteLength > max ? null : buf
}

function decodeHtml(buf: Uint8Array, contentType: string | null): string {
  const m = /charset=([\w-]+)/i.exec(contentType ?? '')
  let cs = m?.[1]
  if (!cs) {
    const head = new TextDecoder('latin1').decode(buf.subarray(0, 2048))
    cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]
  }
  try { return new TextDecoder(cs || 'utf-8').decode(buf) } catch { return new TextDecoder('utf-8').decode(buf) }
}

export async function directFetchUrl(raw: string, opts: { timeoutMs?: number; allowedTypes?: string[] } = {}, f: Fetch = fetch): Promise<EsbFetchUrlResult> {
  let targetRaw = unwrapFeedRedirectUrl(raw)
  try {
    const u0 = new URL(targetRaw)
    if (/(^|\.)news\.google\.com$/i.test(u0.hostname)) {
      const resolved = await resolveGoogleNewsUrl(targetRaw, f)
      if (resolved && resolved !== targetRaw) targetRaw = resolved
    }
  } catch { /* ignore */ }
  const g = checkPublicUrl(targetRaw)
  if (!g.ok) return { ok: false, code: g.code, error: g.error }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000)
  try {
    let res: Response
    try {
      res = await f(g.url.toString(), { signal: ctrl.signal, redirect: 'follow', headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } })
    } catch (firstErr) {
      // Bare-domain fallback when www.<domain> fails TLS hostname verification (e.g. www.sangbad.net.bd)
      if (/^www\./i.test(g.url.hostname) && (firstErr as Error)?.name !== 'AbortError') {
        const bare = new URL(g.url.toString())
        bare.hostname = bare.hostname.replace(/^www\./i, '')
        res = await f(bare.toString(), { signal: ctrl.signal, redirect: 'follow', headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } })
      } else {
        throw firstErr
      }
    }
    if (!res.ok) return { ok: false, code: 'http_error', error: `HTTP ${res.status}`, url: realUrl(res.url) || g.url.toString() }
    // a redirect may have landed somewhere local: check the final address too
    // (CapacitorHttp reports its own https://localhost/_capacitor_http_interceptor_ address here: that is the app, not
    // the page, so only a real redirect target is checked)
    const finalUrl = realUrl(res.url)
    if (finalUrl) { const again = checkPublicUrl(finalUrl); if (!again.ok) return { ok: false, code: again.code, error: again.error } }
    const ct = res.headers.get('content-type')
    if (!typeAllowed(ct, opts.allowedTypes ?? ALLOWED_HTML_TYPES)) return { ok: false, code: 'bad_type', error: `That link is not a web page (${ct}).` }
    const buf = await readCapped(res, MAX_HTML_BYTES)
    if (!buf) return { ok: false, code: 'too_large', error: 'The page is larger than 5 MB.' }
    // sites that ship the story as data get their own story pinned as the article body (see storyData.ts)
    const html = pinStoryBody(decodeHtml(buf, ct))
    return { ok: true, html, body: html, url: realUrl(res.url) || g.url.toString() }
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError'
    return { ok: false, code: aborted ? 'timeout' : 'network_error', error: aborted ? 'The page took too long to answer.' : 'Could not reach that site. Check the connection.' }
  } finally { clearTimeout(timer) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The site route returns extracted text; the PC extractor reads HTML. Rebuild a minimal, faithful page from it. */
export function articleToHtml(a: FetchedArticle): string {
  const images = a.images ?? []
  const paragraphs = a.paragraphs ?? []
  const imgs = images.map((i) => `<figure><img src="${esc(i.src)}" alt="${esc(i.alt)}"></figure>`).join('')
  const meta = [`<meta property="og:title" content="${esc(a.title)}">`, a.deck ? `<meta property="og:description" content="${esc(a.deck)}">` : '', images[0] ? `<meta property="og:image" content="${esc(a.images[0].src)}">` : '', `<link rel="canonical" href="${esc(a.url)}">`].join('')
  const paras = (paragraphs.length ? paragraphs : (a.text ?? '').split(/\n{2,}/)).map((p) => `<p>${esc(p)}</p>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(a.title)}</title>${meta}</head><body><article><h1>${esc(a.title)}</h1>${a.deck ? `<p class="deck">${esc(a.deck)}</p>` : ''}${imgs}${paras}</article></body></html>`
}

export const SITE_FETCH_NOT_LIVE = 'Link fetching through esbpowerline.com is not live yet (site update needed). Paste the article text instead, or switch Link fetching to "This phone" in Settings.'

export async function fetchUrl(raw: string, opts: { timeoutMs?: number; allowedTypes?: string[] } = {}): Promise<EsbFetchUrlResult> {
  const g = checkPublicUrl(raw)
  if (!g.ok) return { ok: false, code: g.code, error: g.error }
  if (SITE_HOSTS.has(g.url.hostname) || getLinkFetchMode() === 'device') return directFetchUrl(raw, opts)
  // feeds (wire) are XML: the site route returns HTML pages only
  const wantsXml = (opts.allowedTypes ?? []).some((t) => /xml/.test(t)) && !(opts.allowedTypes ?? []).includes('text/html')
  if (wantsXml) return { ok: false, code: 'not_live', error: 'Feeds need Link fetching set to "This phone" (the site route reads web pages only).' }
  if (cachedAvailability('fetchArticle') === 'unavailable') return { ok: false, code: 'not_live', error: SITE_FETCH_NOT_LIVE }
  const r = await fetchArticleViaSite(g.url.toString())
  if (!r.ok) return { ok: false, code: r.offline ? 'network_error' : r.status === 404 || r.status === 405 ? 'not_live' : 'site_error', error: r.status === 404 || r.status === 405 ? SITE_FETCH_NOT_LIVE : r.error }
  const html = articleToHtml(r.data)
  return { ok: true, html, body: html, url: r.data.url }
}

export async function fetchImageData(raw: string, opts: { timeoutMs?: number } = {}, f: Fetch = fetch): Promise<EsbFetchImageDataResult> {
  const g = checkPublicUrl(raw)
  if (!g.ok) return { ok: false, error: g.error }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000)
  try {
    const res = await f(g.url.toString(), { signal: ctrl.signal })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const ct = res.headers.get('content-type')
    if (!typeAllowed(ct, ALLOWED_IMAGE_TYPES)) return { ok: false, error: `Not a picture (${ct}).` }
    const buf = await readCapped(res, MAX_IMAGE_BYTES)
    if (!buf) return { ok: false, error: 'The picture is larger than 25 MB.' }
    const mime = (ct ?? 'image/jpeg').split(';')[0].replace(/octet-stream$/, 'jpeg').replace(/^(application|binary)\//, 'image/')
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return { ok: true, dataUrl: `data:${mime};base64,${btoa(bin)}` }
  } catch {
    return { ok: false, error: 'Could not load the picture.' }
  } finally { clearTimeout(timer) }
}
