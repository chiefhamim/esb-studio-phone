// Platform in a plain browser (vite dev / preview, Playwright tests). Files download; there is no share sheet
// unless the browser has Web Share with files. Cross-origin pages are read through the dev server's /api/proxy
// (vite.config.ts) when it is there; otherwise the honest error.
import type { EsbFetchUrlResult } from '../pc/esb'
import { inputPick, type Platform } from './platform'
import { checkPublicUrl } from './netGuard'
import { fetchImageData as guardedImage, fetchUrl as guardedFetch, getLinkFetchMode } from './fetchGuarded'

function download(name: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function proxyFetch(url: string): Promise<EsbFetchUrlResult> {
  const g = checkPublicUrl(url)
  if (!g.ok) return { ok: false, code: g.code, error: g.error }
  try {
    const r = await fetch(`/api/proxy?url=${encodeURIComponent(g.url.toString())}`)
    if (!r.ok) return { ok: false, code: 'http_error', error: (await r.text()) || `HTTP ${r.status}` }
    const html = await r.text()
    return { ok: true, html, body: html, url: g.url.toString() }
  } catch { return { ok: false, code: 'network_error', error: 'Could not reach that site.' } }
}

export const webPlatform: Platform = {
  kind: 'web',
  pickFiles: ({ accept, multiple }) => inputPick(accept, !!multiple),
  async takePhoto() { return (await inputPick(['image/*'], false, 'environment'))[0] ?? null },
  async saveFile(f) { download(f.name, f.bytes, f.mime); return { ok: true, path: `Downloads/${f.name}` } },
  async shareFiles(files, title) {
    const list = files.map((f) => new File([f.bytes as BlobPart], f.name, { type: f.mime }))
    if (navigator.canShare?.({ files: list })) {
      try { await navigator.share({ files: list, title }); return 'shared' } catch { return 'cancelled' }
    }
    for (const f of files) download(f.name, f.bytes, f.mime)
    return 'shared'
  },
  async shareText(text, title) {
    if (navigator.share) { try { await navigator.share({ text, title }); return 'shared' } catch { return 'cancelled' } }
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    return 'shared'
  },
  async copyText(text) { try { await navigator.clipboard.writeText(text); return true } catch { return false } },
  async fetchUrl(url, opts) {
    if (getLinkFetchMode() === 'device' && import.meta.env.DEV) return proxyFetch(url)
    return guardedFetch(url, opts)
  },
  fetchImageData: (url, opts) => guardedImage(url, opts),
  async openExternal(url) { window.open(url, '_blank', 'noopener') },
}
