// URL checks for fetches the phone makes on the editor's behalf (link extraction, feeds, remote pictures).
// Ported from the PC's electron/net-guard.cjs (isPrivateIPv4 / ipv6Groups / isPrivateIPv6, size and type lists).
// A WebView cannot resolve DNS itself, so literal-address hosts and local names are refused here; the native HTTP
// stack then enforces https-only (network_security_config.xml blocks cleartext).

export const MAX_HTML_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const ALLOWED_HTML_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain', 'application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml']
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/webp', 'image/gif', 'image/avif', 'application/octet-stream', 'binary/octet-stream']

export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => isNaN(n) || n < 0 || n > 255)) return true
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true
  if (p[0] === 169 && p[1] === 254) return true
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true
  if (p[0] === 192 && p[1] === 168) return true
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true
  if (p[0] === 192 && p[1] === 0 && (p[2] === 0 || p[2] === 2)) return true
  if (p[0] === 192 && p[1] === 88 && p[2] === 99) return true
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true
  if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true
  if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true
  return p[0] >= 224
}

function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().trim().replace(/%.*$/, '')
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const o = v4[1].split('.').map(Number)
    if (o.some((n) => n > 255)) return null
    s = s.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const all = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail]
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return all.map((g) => parseInt(g, 16))
}
const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

export function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().trim()
  const g = ipv6Groups(s)
  if (!g) return true
  const zero = (a: number, b: number) => g.slice(a, b).every((x) => x === 0)
  if (zero(0, 6) && (g[6] || g[7] > 1)) return isPrivateIPv4(v4Of(g[6], g[7]))
  if (zero(0, 5) && g[5] === 0xffff) return isPrivateIPv4(v4Of(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return isPrivateIPv4(v4Of(g[6], g[7]))
  if (g[0] === 0x2002) return isPrivateIPv4(v4Of(g[1], g[2]))
  if (zero(0, 8) || (zero(0, 7) && g[7] === 1)) return true
  if ((g[0] & 0xfe00) === 0xfc00) return true
  if ((g[0] & 0xffc0) === 0xfe80) return true
  if ((g[0] & 0xff00) === 0xff00) return true
  if (g[0] === 0x100 && zero(1, 4)) return true
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true
  return false
}

export type GuardResult = { ok: true; url: URL } | { ok: false; code: string; error: string }

/** Is this a public web address the phone may fetch for the editor? */
export function checkPublicUrl(raw: string): GuardResult {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return { ok: false, code: 'invalid_url', error: 'That is not a web address.' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, code: 'invalid_protocol', error: 'Only http and https links can be fetched.' }
  if (u.username || u.password) return { ok: false, code: 'credentials', error: 'Links with a user name or password are refused.' }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) {
    return { ok: false, code: 'private_address', error: 'Local network addresses are refused.' }
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIPv4(host)) return { ok: false, code: 'private_address', error: 'Local network addresses are refused.' }
  if (host.includes(':') && isPrivateIPv6(host)) return { ok: false, code: 'private_address', error: 'Local network addresses are refused.' }
  // Android blocks cleartext natively; upgrade so the request is not refused for a link pasted with http://
  if (u.protocol === 'http:') u.protocol = 'https:'
  return { ok: true, url: u }
}

export function typeAllowed(contentType: string | null, allowed: string[]): boolean {
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (!mime) return true
  return allowed.some((t) => mime === t || (t.endsWith('/*') && mime.startsWith(t.slice(0, -1))))
}
