// Mobile geometry + Android layout suite. Runs against the preview build:
//   npm run build && npx vite preview --port 4173 --host 127.0.0.1   then   node tools/e2e/geometry.mjs [--only=home,settings] [--shots]
// Edge (msedge), isMobile, hasTouch, DPR 2, every target size, light and dark, with simulated safe-area insets.
// FAILS on: horizontal overflow, clipped text (cut without an ellipsis), controls with a hit area under 48 px (44 px for
// vendored PC controls inside .pc-host), targets overlapping or closer than 8 px when under 48 px, input text under
// 16 px, dialogs/sheets/menus off screen, content outside the grid margins, chrome under the safe areas, a missing
// nav, and any of these at 130 % Android font scale. Screens are opened through the app's own UI.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const URL = process.env.URL || 'http://127.0.0.1:4173/'
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const ALL_SIZES = [[360, 800], [375, 812], [393, 852], [412, 915], [432, 960], [600, 960], [800, 1280], [915, 412], [1280, 800]]
const SIZES = args.sizes ? String(args.sizes).split(',').map((x) => x.split('x').map(Number)) : ALL_SIZES
const THEMES = args.themes ? String(args.themes).split(',') : ['light', 'dark']
const OUT = path.resolve(import.meta.dirname, '../../docs/screens/pc-clone/geometry')
if (args.shots) fs.mkdirSync(OUT, { recursive: true })
const SAFE = { top: 24, bottom: 16 }

/** Screens: how to reach each from a fresh load, through the UI. Editorial/Graphics screens add their own steps. */
const SCREENS = {
  home: async () => {},
  settings: async (p) => { await p.locator('button[aria-label="Settings"]').first().click(); await p.waitForSelector('.m-fulldialog') },
  editorial: async (p) => { await p.locator('.m-nav-item', { hasText: 'Editorial' }).click() },
  graphics: async (p) => { await p.locator('.m-nav-item', { hasText: 'Graphics' }).click() },
  // deeper states: each Graphics dock sheet, More, Export; an open story on every Editorial tab, the readiness sheet, Publish
  ...Object.fromEntries(['Story', 'Photos', 'Elements', 'Layers', 'Inspector'].map((t) => [`graphics-${t.toLowerCase()}`, async (p) => {
    await p.locator('.m-nav-item', { hasText: 'Graphics' }).click()
    const b = p.locator('.gx-dock-item', { hasText: t })
    if (!(await b.count())) throw new Error('skip: no ' + t + ' in the dock at this size')
    await b.first().click(); await p.waitForSelector('.m-sheet, .gx-side')
  }])),
  'graphics-more': async (p) => { await p.locator('.m-nav-item', { hasText: 'Graphics' }).click(); await p.locator('button[aria-label^="More"]:visible').last().click(); await p.waitForSelector('.m-sheet, .m-menu') },
  'graphics-export': async (p) => { await p.locator('.m-nav-item', { hasText: 'Graphics' }).click(); await p.locator('.gx-tools button', { hasText: 'Export' }).click(); await p.waitForSelector('.m-fulldialog') },
  ...Object.fromEntries(['Story', 'Details', 'SEO', 'Social', 'Preview'].map((t) => [`story-${t.toLowerCase()}`, async (p) => {
    await openStory(p)
    await p.locator('.me-tabs [role=tab]:visible', { hasText: t }).first().click()
  }])),
  'story-ready': async (p) => { await openStory(p); await p.locator('.me-ready:visible').first().click(); await p.waitForSelector('.m-sheet') },
  'story-publish': async (p) => { await openStory(p); await p.locator('button:visible', { hasText: /^(Publish|Update)$/ }).first().click(); await p.waitForSelector('.m-fulldialog, .m-sheet') },
}
async function openStory(p) {
  await p.locator('.m-home .m-row', { hasText: 'Grid operator' }).first().click()
  await p.waitForSelector('.me-tabs')
}

// ------------------------------------------------------------------ in-page audit
function audit({ safe, w, h }) {
  const issues = []
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null
    if (el.closest('[hidden], [aria-hidden="true"], .m-sr')) return null
    // under an open modal (full-screen dialog, sheet scrim, menu): only the topmost layer can be touched
    const layers = [...document.querySelectorAll('.m-fulldialog, .m-scrim, .m-menu-scrim')]
    const top = layers[layers.length - 1]
    if (top && !top.contains(el)) return null
    return r
  }
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.className || el.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 50)
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return p } return null }
  const clippedBy = (el, r) => { // fully hidden by an ancestor's overflow clip: not visible, not counted
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const pr = p.getBoundingClientRect(); if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) return true }
    }
    return false
  }

  // a target scrolled underneath a bar or sheet cannot be touched there: judged where it is visible, not here
  const occluded = (el, r) => {
    const x = Math.min(Math.max(r.left + r.width / 2, 0), w - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), h - 1)
    const top = document.elementFromPoint(x, y)
    return !!top && !el.contains(top) && !top.contains(el)
  }

  // 1. horizontal page overflow
  const se = document.scrollingElement
  if (se.scrollWidth > w + 1) issues.push(['overflow', `page scrolls sideways: ${se.scrollWidth}px > ${w}px`])
  for (const el of document.querySelectorAll('body *')) {
    const r = vis(el); if (!r) continue
    if ((r.right > w + 1 || r.left < -1) && !inScroller(el) && !clippedBy(el, r) && !el.closest('.gx-canvas, canvas')) { issues.push(['overflow', `off the side: ${label(el)} (${Math.round(r.left)}..${Math.round(r.right)})`]); break }
  }

  // 2. clipped text (cut without an ellipsis or line clamp)
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const r = vis(el); if (!r) continue
    const cs = getComputedStyle(el)
    const clipsX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis'
    const clipsY = cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none'
    if ((clipsX || clipsY) && !el.closest('textarea, [contenteditable=true], .m-scroll, .m-sheet-body')) issues.push(['clipped', `text cut: "${label(el)}"`])
  }

  // 3. targets: size, overlap, spacing
  const targets = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=radio], [role=menuitem], [role=checkbox]')]
    .map((el) => {
      // a checkbox/radio inside a <label> is tapped through the whole label
      const lab = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') : null
      return { el: lab ?? el, r: vis(lab ?? el) }
    }).filter((t) => t.r && !occluded(t.el, t.r) && !t.el.disabled && !t.el.closest('.m-sr') && !t.el.classList.contains('m-sr') && !clippedBy(t.el, t.r))
  const EXPANDS = ['m-chip', 'm-switch', 'm-hit-pad', 'tgl']
  for (const t of targets) {
    const pc = !!t.el.closest('.pc-host')
    const min = pc ? 44 : 48
    const grows = EXPANDS.some((c) => t.el.classList.contains(c))
    const hitW = grows ? Math.max(t.r.width, 48) : t.r.width, hitH = grows ? Math.max(t.r.height, 48) : t.r.height
    const inline = t.el.tagName === 'A' && getComputedStyle(t.el).display === 'inline'
    if (!inline && (hitW < min - 0.5 || hitH < min - 0.5) && !['TEXTAREA'].includes(t.el.tagName)) issues.push(['target', `${Math.round(t.r.width)}x${Math.round(t.r.height)} < ${min}: ${label(t.el)}${pc ? ' (pc)' : ''}`])
  }
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j]
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue
    const gx = Math.max(a.r.left - b.r.right, b.r.left - a.r.right), gy = Math.max(a.r.top - b.r.bottom, b.r.top - a.r.bottom)
    const gap = Math.max(gx, gy)
    if (gap < -1) {
      // layered (one scrolled under a bar or sheet) is not an overlap: at the shared area only one of them is on top
      const ix = (Math.max(a.r.left, b.r.left) + Math.min(a.r.right, b.r.right)) / 2, iy = (Math.max(a.r.top, b.r.top) + Math.min(a.r.bottom, b.r.bottom)) / 2
      const top = document.elementFromPoint(ix, iy)
      const inA = !!top && (a.el.contains(top) || top.contains(a.el)), inB = !!top && (b.el.contains(top) || top.contains(b.el))
      if (inA !== inB) continue
      issues.push(['target', `overlap: ${label(a.el)} / ${label(b.el)}`]); continue
    }
    const small = Math.min(a.r.width, a.r.height) < 48 || Math.min(b.r.width, b.r.height) < 48
    if (small && gap < 8 && gap >= -1 && !a.el.closest('.pc-host') && !b.el.closest('.pc-host') && !a.el.closest('.m-seg') && !a.el.closest('.m-chips')) issues.push(['spacing', `${Math.round(gap)}px apart: ${label(a.el)} / ${label(b.el)}`])
  }

  // 4. input text >= 16 px (WebView zooms on smaller)
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, select, [contenteditable=true]')) {
    if (!vis(el)) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs < 15.5) issues.push(['input', `${fs}px input text: ${label(el)}`])
  }

  // 5. dialogs, sheets, menus inside the screen
  for (const el of document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu]')) {
    const r = vis(el); if (!r) continue
    if (r.top < -1 || r.left < -1 || r.right > w + 1 || r.bottom > h + 1) issues.push(['dialog', `off screen: ${label(el)} (${Math.round(r.top)},${Math.round(r.bottom)})`])
  }

  // 6. grid margins: content blocks inside .m-wrap keep the side margins
  const margin = w >= 840 ? 32 : w >= 600 ? 24 : 16
  for (const wrap of document.querySelectorAll('.m-wrap')) {
    for (const el of wrap.children) {
      const r = vis(el); if (!r || clippedBy(el, r)) continue
      if (el.matches('.m-chips.is-scroll')) continue // full-bleed horizontal scroller (Material pattern): its content starts on the margin
      const wr = wrap.getBoundingClientRect()
      if (r.left < wr.left + margin - 1 || r.right > wr.right - margin + 1) issues.push(['grid', `outside the ${margin}px margins: ${label(el)} (${Math.round(r.left - wr.left)}px)`])
    }
  }

  // 7. safe areas: top bar content below the status bar, nav above the gesture bar
  for (const el of document.querySelectorAll('.m-topbar-row')) { const r = vis(el); if (r && r.top < safe.top - 1 && !el.closest('[hidden]')) issues.push(['safe', `top bar under the status bar (${Math.round(r.top)} < ${safe.top})`]) }
  const nav = document.querySelector('.m-navbar, .m-rail')
  if (!nav || !vis(nav)) { if (!document.documentElement.classList.contains('kb-open') && !document.querySelector('.m-fulldialog, .m-scrim')) issues.push(['nav', 'navigation missing']) }
  else if (nav.classList.contains('m-navbar')) for (const it of nav.querySelectorAll('.m-nav-item')) { const r = vis(it); if (r && r.bottom > h - safe.bottom + 1) issues.push(['safe', 'nav item under the gesture bar']) }
  return issues
}

function scaleText(factor) { // Android font size: WebView textZoom scales every text size
  for (const el of document.querySelectorAll('body *')) { const fs = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = `${fs * factor}px` }
}

// ------------------------------------------------------------------ run
const only = args.only ? String(args.only).split(',') : Object.keys(SCREENS)
const browser = await chromium.launch({ channel: 'msedge' })
let failures = 0
const summary = []
for (const [w, h] of SIZES) for (const theme of THEMES) {
  for (const name of only) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme })
    const page = await ctx.newPage()
    await page.addInitScript(({ t, b }) => { document.addEventListener('DOMContentLoaded', () => { const s = document.documentElement.style; s.setProperty('--safe-area-inset-top', t + 'px'); s.setProperty('--safe-area-inset-bottom', b + 'px') }) }, { t: SAFE.top, b: SAFE.bottom })
    // the phone's OLD draft format: the boot migration turns these into PC queue stories
    await page.addInitScript(() => {
      if (localStorage.getItem('esb-phone-drafts-v1')) return
      localStorage.setItem('esb-phone-drafts-v1', JSON.stringify([
        { id: 'g1', sourceUrl: 'https://www.prothomalo.com/x', source: 'খুলনায় ২৩০ কেভি লাইন উন্নয়নের পরিকল্পনা করছে পিজিসিবি।', headline: 'Grid operator plans 230 kV line upgrade in Khulna', deck: 'PGCB says the work will finish by June.', body: 'Power Grid Company of Bangladesh (PGCB) plans to upgrade the 230 kV line in Khulna, officials said on Tuesday.', category: 'Grid & Transmission', slug: 'grid-operator-230kv-khulna', translated: true, updatedAt: Date.now() - 3600e3 },
      ]))
    })
    await page.goto(URL)
    await page.waitForSelector('.m-app', { timeout: 20000 })
    try { await SCREENS[name](page) } catch (e) { if (String(e.message).startsWith('skip:')) { summary.push(`skip ${name} ${w}x${h} ${theme}`); await page.close(); await ctx.close(); continue } summary.push(`${name} ${w}x${h} ${theme}: could not open (${e.message.split('\n')[0]})`); failures++; await page.close(); await ctx.close(); continue }
    await page.waitForTimeout(500)
    const tag = `${name} ${w}x${h} ${theme}`
    const base = await page.evaluate(audit, { safe: SAFE, w, h })
    if (args.shots) await page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}-${theme}.png`) })
    await page.evaluate(scaleText, 1.3)
    await page.waitForTimeout(150)
    const big = (await page.evaluate(audit, { safe: SAFE, w, h })).filter(([k]) => k === 'overflow' || k === 'clipped' || k === 'dialog').map(([k, m]) => [k + '@130%', m])
    const all = [...base, ...big]
    const uniq = [...new Map(all.map((x) => [x.join(':'), x])).values()]
    if (uniq.length) { failures += uniq.length; summary.push(`FAIL ${tag}\n  ` + uniq.slice(0, 12).map(([k, m]) => `${k}: ${m}`).join('\n  ') + (uniq.length > 12 ? `\n  … ${uniq.length - 12} more` : '')) }
    else summary.push(`ok   ${tag}`)
    await page.close()
    await ctx.close()
  }
}
await browser.close()
console.log(summary.join('\n'))
console.log(failures ? `\ngeometry: ${failures} problem(s)` : '\ngeometry: all clear')
process.exit(failures ? 1 : 0)
