// Quick screenshot helper: node tools/shot.mjs <name> [width] [height] [theme] [route] [js-to-run]
// Captures the preview build (npx vite preview --port 4173) as a touch phone at DPR 2 into docs/screens/pc-clone/.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const [name = 'shot', w = '412', h = '915', theme = 'light', route = 'home', js = ''] = process.argv.slice(2)
const out = path.resolve(import.meta.dirname, '../docs/screens/pc-clone')
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme === 'dark' ? 'dark' : 'light' })
const page = await ctx.newPage()
// SEED=1: six drafts in the phone's OLD format (pre PC clone), so the boot migration and the lists have content
if (process.env.SEED) await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  const now = Date.now()
  const d = (i, o) => ({ id: 'old' + i, sourceUrl: '', source: '', headline: '', deck: '', body: '', category: '', slug: '', translated: false, updatedAt: now - i * 3600e3, ...o })
  localStorage.setItem('esb-phone-drafts-v1', JSON.stringify([
    d(1, { source: 'দেশে ৫০০ মেগাওয়াট সৌরবিদ্যুৎ কেন্দ্র স্থাপনের পরিকল্পনা নিয়েছে সরকার।', sourceUrl: 'https://www.prothomalo.com/x', category: 'Renewables & Nuclear' }),
    d(2, { headline: 'Grid operator plans 230 kV line upgrade in Khulna', deck: 'PGCB says the work will finish by June.', body: 'Power Grid Company of Bangladesh (PGCB) plans...', category: 'Grid & Transmission' }),
    d(3, { headline: 'LNG imports rise to 12 cargoes in October', body: 'Petrobangla imported...' }),
    d(4, { headline: 'BERC hearing on bulk electricity tariff' }),
    d(5, { headline: 'Rooftop solar net metering reaches 100 MW' }),
    d(6, {}),
  ]))
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('http://127.0.0.1:4173/')
await page.waitForSelector('.m-app', { timeout: 20000 })
if (route !== 'home') await page.evaluate((r) => { const btn = [...document.querySelectorAll('.m-nav-item')].find((b) => b.textContent?.trim().toLowerCase() === r); btn?.click() }, route)
if (js) await page.evaluate(js)
if (process.env.STORY) { await page.locator('.m-home .m-row').first().click(); await page.waitForSelector('.me-tabs'); if (process.env.TAB) await page.locator('.me-tabs [role=tab]:visible', { hasText: process.env.TAB }).first().click() }
await page.waitForTimeout(900)
await page.screenshot({ path: path.join(out, `${name}.png`) })
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'))
console.log('saved', path.join(out, `${name}.png`))
await browser.close()
