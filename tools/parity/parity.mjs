// PC <-> phone render parity, every format x every category.
//   PC:    the PC repo's own golden.html (src/golden.ts, its renderer) on a READ-ONLY dev server: PC_URL (default 5299)
//   phone: golden.html (the vendored src/pc/golden.ts) and export-parity.html (the phone export path) on PHONE_URL (5183)
// Start them:  (PC repo)    node node_modules/vite/bin/vite.js --port 5299 --host 127.0.0.1   [no predev; writes nothing]
//              (phone repo) npx vite --port 5183 --host 127.0.0.1
// Pass = every pair identical (pixelmatch threshold 0, 0 differing pixels). Diffs go to tools/out/parity/.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const PC = process.env.PC_URL || 'http://127.0.0.1:5299'
const PHONE = process.env.PHONE_URL || 'http://127.0.0.1:5183'
const FORMATS = ['fb45', 'story', 'sq', 'social', 'web', 'yt', 'lower-third', 'title-card', 'end-card']
const CATS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']
const OUT = path.resolve(import.meta.dirname, '../out/parity')
fs.mkdirSync(OUT, { recursive: true })

// software canvas: GPU rasterisation is not bit-stable between runs (anti-aliasing of a few edge pixels varies)
const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-gpu-rasterization'] })
const SELF = process.env.SELF // control run: the PC against itself, to prove the comparison is deterministic
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
async function grab(url) {
  await page.goto(url)
  await page.waitForFunction('window.__done === true', null, { timeout: 60000 })
  const err = await page.evaluate('window.__err')
  if (err) throw new Error(err)
  return PNG.sync.read(Buffer.from((await page.evaluate('window.__png')).split(',')[1], 'base64'))
}
let fails = 0, n = 0
for (const fmt of FORMATS) for (const cat of CATS) {
  const qs = `?fmt=${fmt}&cat=${cat}`
  const pc = await grab(`${PC}/golden.html${qs}`)
  const pairs = SELF ? [['pc-again', `${PC}/golden.html${qs}`]] : [['render', `${PHONE}/golden.html${qs}`], ['export', `${PHONE}/export-parity.html${qs}`]]
  for (const [kind, url] of pairs) {
    n++
    const ph = await grab(url)
    if (pc.width !== ph.width || pc.height !== ph.height) { fails++; console.log(`FAIL ${fmt}-${cat} ${kind}: size ${pc.width}x${pc.height} vs ${ph.width}x${ph.height}`); continue }
    const diff = new PNG({ width: pc.width, height: pc.height })
    const bad = pixelmatch(pc.data, ph.data, diff.data, pc.width, pc.height, { threshold: 0 })
    if (bad) { fails++; fs.writeFileSync(path.join(OUT, `${fmt}-${cat}-${kind}.diff.png`), PNG.sync.write(diff)); console.log(`FAIL ${fmt}-${cat} ${kind}: ${bad} px differ`) }
  }
  if (cat === '01') fs.writeFileSync(path.join(OUT, `${fmt}-01-pc.png`), PNG.sync.write(pc))
}
await browser.close()
console.log(fails ? `parity: ${fails} of ${n} differ` : `parity: all ${n} phone renders identical to the PC (${FORMATS.length} formats x ${CATS.length} categories x render+export)`)
process.exit(fails ? 1 : 0)
