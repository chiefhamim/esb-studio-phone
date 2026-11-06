// Layout Lab server: `node tools/layout-lab/server.mjs` then open http://localhost:4300
//   /            the Lab (lab.html): the real app at phone size, live-editable spacing, corners and type
//   /gallery     the blueprint library from the phone (screenshots + measured values)
//   /app/        the built app (dist/; run `npm run build` first)
//   /phone/      the phone captures (Desktop/ESB Layout Blueprint/phone)
//   POST /save   writes the Lab's edits to tools/layout-lab/overrides.json and overrides.css (what Claude applies)
// Local only: it listens on 127.0.0.1.
import { createServer } from 'node:http'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join, normalize, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const PORT = Number(process.env.PORT || 4300)
const PHONE = process.env.BP_DIR || join(homedir(), 'Desktop', 'ESB Layout Blueprint', 'phone')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webp': 'image/webp', '.wasm': 'application/wasm', '.ico': 'image/x-icon' }

async function send(res, file) {
  try {
    const s = await stat(file)
    if (s.isDirectory()) return send(res, join(file, 'index.html'))
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(await readFile(file))
  } catch { res.writeHead(404); res.end('not found') }
}
const inside = (base, rel) => { const p = normalize(join(base, decodeURIComponent(rel))); return p.startsWith(base) ? p : null }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  if (req.method === 'POST' && p === '/save') {
    let body = ''
    for await (const c of req) { body += c; if (body.length > 2e6) { res.writeHead(413); return res.end() } }
    try {
      const data = JSON.parse(body)
      await writeFile(join(here, 'overrides.json'), JSON.stringify(data, null, 2))
      await writeFile(join(here, 'overrides.css'), String(data.css || ''))
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}')
    } catch (e) { res.writeHead(400); res.end(String(e)) }
    return
  }
  if (p === '/phone-list') {
    const { readdir } = await import('node:fs/promises')
    const names = (await readdir(PHONE).catch(() => [])).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5))
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(names))
  }
  if (p === '/' || p === '/lab') return send(res, join(here, 'lab.html'))
  if (p === '/gallery') return send(res, join(here, 'gallery.html'))
  if (p === '/blueprint.js' || p === '/overrides.json') return send(res, join(here, p.slice(1)))
  if (p.startsWith('/app/')) { const f = inside(join(root, 'dist'), p.slice(5) || 'index.html'); return f ? send(res, f) : (res.writeHead(403), res.end()) }
  if (p.startsWith('/phone/')) { const f = inside(PHONE, p.slice(7)); return f ? send(res, f) : (res.writeHead(403), res.end()) }
  res.writeHead(404); res.end('not found')
}).listen(PORT, '127.0.0.1', () => console.log(`Layout Lab: http://localhost:${PORT}  (gallery: /gallery)`))
