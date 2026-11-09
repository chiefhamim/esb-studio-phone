#!/usr/bin/env node
// Vendors the PC app's (ESB AI Studio, chiefhamim/esb-banner-studio) engine, stores and core components into src/pc/,
// verbatim, and writes src/pc/SYNC_MANIFEST.json (PC commit + sha256 of every file).
//
//   npm run sync:pc     copy from the PC repo (read-only: this script never writes there)
//   npm run check:pc    fail when a vendored file differs from the manifest (somebody edited src/pc by hand)
//   node tools/sync-pc.mjs only editorial/extract.ts …   re-vendor just these PC files (and their .test.ts), manifest updated
//   npm run sync:news   copy the shared news engine (NEWS_ENGINE) from the PC's src/news into src/mobile/watch
//   npm run check:news  fail when an engine file here differs from the PC's (or, without the PC, from ENGINE_MANIFEST.json)
//
// Never hand-edit src/pc/**. Phone behaviour goes in adapters around it (src/platform, src/mobile).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const PHONE = path.resolve(import.meta.dirname, '..')
const OUT = path.join(PHONE, 'src', 'pc')
const MANIFEST = path.join(OUT, 'SYNC_MANIFEST.json')
const PC = process.env.ESB_PC_REPO || ['C:/Users/hamim/esb-studio-pc', path.resolve(PHONE, '..', 'esb-studio-pc'), 'C:/Users/User/esb-banner-studio'].find((p) => fs.existsSync(path.join(p, 'src'))) || 'C:/Users/User/esb-banner-studio'
const PC_SRC = path.join(PC, 'src')

/** Entry points (relative to the PC's src/). Everything they import is followed transitively. */
export const ENTRIES = [
  // Graphics engine, store, export, project
  'core/render.ts', 'core/templates.ts', 'core/tokens.ts', 'core/elements.ts', 'core/collage.ts', 'core/photoEdit.ts',
  'store.ts', 'export.ts', 'project.ts', 'golden.ts', 'core/characterisation.test.ts',
  // Graphics components (logic is reused through hooks/props; desktop layout is not used as the phone UI)
  'components/Stage.tsx', 'components/Panels.tsx', 'components/PhotoEditor.tsx', 'components/FormatPicker.tsx',
  'components/ExportDialog.tsx', 'components/PreviewPanel.tsx',
  // Editorial
  'editorial/editorialStore.ts', 'editorial/RichBodyEditor.tsx', 'editorial/richBody.ts', 'editorial/seo.ts',
  'editorial/seoFix.ts', 'editorial/SeoPanel.tsx', 'editorial/socialChecks.ts', 'editorial/SocialCheckList.tsx',
  'editorial/readiness.ts', 'editorial/ignoredChecks.ts', 'editorial/siteApi.ts', 'editorial/siteConnect.ts',
  'editorial/FeaturedImage.tsx', 'editorial/PublishDialog.tsx', 'editorial/WireInbox.tsx', 'editorial/wire.ts',
  'editorial/extract.ts', 'editorial/siteAdapters.ts', 'editorial/importDocument.ts', 'editorial/aiProviders.ts',
  'editorial/aiDesk.ts', 'editorial/translator.ts', 'editorial/translateNet.ts', 'editorial/bannerLink.ts',
  'editorial/useBannerImage.ts', 'editorial/facts.ts', 'editorial/chart.ts', 'editorial/ChartDialog.tsx',
  'editorial/facebook.ts', 'editorial/facebookCaption.ts', 'editorial/FacebookDialog.tsx', 'editorial/publishImage.ts',
  'editorial/storyQueue.ts', 'editorial/quoteLibrary.ts', 'editorial/liveEdit.ts', 'editorial/fmtPublished.ts',
  'editorial/SitePreview.tsx', 'editorial/BannerPreviews.tsx', 'editorial/AiSettingsDialog.tsx',
  'editorial/TranslateProgress.tsx', 'editorial/imageTools.ts', 'editorial/blocks.ts', 'editorial/bengali.ts',
  'editorial/automation.ts', 'editorial/jobLog.ts',
  // Design system and types
  'fonts.css', 'styles/tokens.css', 'styles/base.css', 'styles/primitives.css', 'styles/studio.css', 'App.css',
  'editorial/editorial.css', 'editorial/site-preview.css', 'esb.d.ts', 'env.d.ts',
]

/** Whole folders copied as they are (fonts with their licences). */
const DIRS = ['assets/fonts']

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const rel = (abs) => path.relative(PC_SRC, abs).split(path.sep).join('/')

function resolveSpec(from, spec) {
  const base = path.resolve(path.dirname(from), spec.split('?')[0])
  for (const c of [base, base + '.ts', base + '.tsx', base + '.d.ts', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}

export function closure(entries = ENTRIES) {
  const seen = new Set()
  const missing = []
  const walk = (abs) => {
    if (seen.has(abs)) return
    seen.add(abs)
    if (!/\.(tsx?|css)$/.test(abs)) return
    const src = fs.readFileSync(abs, 'utf8')
    const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|@import\s+(?:url\()?['"]([^'"]+)['"]|url\(['"]?(\.[^'")]+)['"]?\)/g
    let m
    while ((m = re.exec(src))) {
      const s = m[1] || m[2] || m[3] || m[4] || m[5]
      if (!s || !s.startsWith('.')) continue
      const r = resolveSpec(abs, s)
      if (r) walk(r)
      else missing.push(`${rel(abs)} -> ${s}`)
    }
    // a module's own unit tests come with it, so the copy keeps its tests green
    const t = abs.replace(/\.tsx?$/, '.test.ts')
    if (t !== abs && fs.existsSync(t)) walk(t)
  }
  for (const e of entries) {
    const abs = path.join(PC_SRC, e)
    if (!fs.existsSync(abs)) throw new Error(`PC entry missing: ${e}`)
    walk(abs)
  }
  for (const d of DIRS) {
    const stack = [path.join(PC_SRC, d)]
    while (stack.length) {
      const p = stack.pop()
      for (const n of fs.readdirSync(p)) {
        const f = path.join(p, n)
        if (fs.statSync(f).isDirectory()) stack.push(f)
        else seen.add(f)
      }
    }
  }
  return { files: [...seen].map(rel).sort(), missing }
}

function pcCommit() {
  try {
    const head = execFileSync('git', ['-C', PC, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['-C', PC, 'status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim()
    return { commit: head, dirtySrc: dirty.length > 0 }
  } catch {
    return { commit: 'unknown', dirtySrc: true }
  }
}

function sync() {
  const { files, missing } = closure()
  if (missing.length) console.warn('Unresolved relative imports (not copied):\n  ' + missing.join('\n  '))
  const { commit, dirtySrc } = pcCommit()
  if (dirtySrc) console.warn('WARNING: the PC repo has uncommitted changes under src/; the manifest records HEAD only.')
  // replace the folder so files removed on the PC go away here too
  fs.rmSync(OUT, { recursive: true, force: true })
  const out = {}
  for (const f of files) {
    const buf = fs.readFileSync(path.join(PC_SRC, f))
    const dst = path.join(OUT, f)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.writeFileSync(dst, buf)
    out[f] = sha(buf)
  }
  const manifest = { source: 'chiefhamim/esb-banner-studio', commit, syncedAt: new Date().toISOString(), note: 'Generated by tools/sync-pc.mjs. Never edit src/pc by hand.', files: out }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`Vendored ${files.length} files from PC ${commit.slice(0, 9)} into src/pc/`)
}

function check() {
  if (!fs.existsSync(MANIFEST)) { console.error('src/pc/SYNC_MANIFEST.json missing: run npm run sync:pc'); process.exit(1) }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const bad = []
  for (const [f, h] of Object.entries(m.files)) {
    const p = path.join(OUT, f)
    if (!fs.existsSync(p)) bad.push(`missing  ${f}`)
    else if (sha(fs.readFileSync(p)) !== h) bad.push(`edited   ${f}`)
  }
  const listed = new Set(Object.keys(m.files))
  const stack = [OUT]
  while (stack.length) {
    const p = stack.pop()
    for (const n of fs.readdirSync(p)) {
      const f = path.join(p, n)
      if (fs.statSync(f).isDirectory()) { stack.push(f); continue }
      const r = path.relative(OUT, f).split(path.sep).join('/')
      if (r !== 'SYNC_MANIFEST.json' && !listed.has(r)) bad.push(`extra    ${r}`)
    }
  }
  if (bad.length) {
    console.error(`check:pc FAILED: ${bad.length} file(s) differ from the PC manifest (${m.commit.slice(0, 9)}):\n  ` + bad.join('\n  '))
    console.error('src/pc is vendored verbatim. Move phone changes into an adapter, then run npm run sync:pc.')
    process.exit(1)
  }
  console.log(`check:pc OK: ${listed.size} vendored files match PC ${m.commit.slice(0, 9)}`)
}

/** Re-vendor only the named PC files (relative to the PC's src/), plus each one's own .test.ts, keeping the rest as they are. */
function only(files) {
  if (!files.length) { console.error('usage: node tools/sync-pc.mjs only <file relative to PC src> …'); process.exit(2) }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const list = new Set()
  for (const f of files) {
    if (!fs.existsSync(path.join(PC_SRC, f))) throw new Error(`not in the PC: ${f}`)
    list.add(f)
    const t = f.replace(/\.tsx?$/, '.test.ts')
    if (t !== f && fs.existsSync(path.join(PC_SRC, t))) list.add(t)
  }
  for (const f of list) {
    const buf = fs.readFileSync(path.join(PC_SRC, f))
    const dst = path.join(OUT, f)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.writeFileSync(dst, buf)
    m.files[f] = sha(buf)
  }
  m.files = Object.fromEntries(Object.entries(m.files).sort(([a], [b]) => a.localeCompare(b)))
  m.partial = [...new Set([...(m.partial ?? []), ...list])].sort()
  m.partialFrom = pcCommit().commit
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n')
  console.log(`Re-vendored ${list.size} file(s) from PC ${m.partialFrom.slice(0, 9)}: ${[...list].join(', ')}`)
}

// ---------------------------------------------------------------- the shared news engine
// These files are the same in both apps (PC src/news, phone src/mobile/watch): pure logic, no store, no platform code.
// Platform differences live in each app's watchStore (the phone leaves out Bing feeds in isPhoneFeed; the fetch path).
export const NEWS_ENGINE = [
  'matcher.ts', 'matcher.test.ts', 'feedparse.ts', 'feedparse.test.ts', 'ewSources.ts', 'portalBrands.ts',
  'rangeSearch.ts', 'rangeSearch.test.ts', 'dates.ts', 'dates.test.ts', 'dedupe.ts', 'dedupe.test.ts',
  'pressParse.ts', 'pressParse.test.ts', 'headlineEn.ts', 'headlineEn.test.ts',
]
const WATCH = path.join(PHONE, 'src', 'mobile', 'watch')
const ENGINE_MANIFEST = path.join(WATCH, 'ENGINE_MANIFEST.json')
const PC_NEWS = path.join(PC_SRC, 'news')
/** Line endings differ between checkouts; the engine is compared as LF text. */
const textSha = (buf) => sha(Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n')))

function syncNews() {
  const out = {}
  // new files first, so a module that imports one never sees it missing (the dev server is live)
  const order = [...NEWS_ENGINE].sort((a, b) => Number(fs.existsSync(path.join(WATCH, b))) - Number(fs.existsSync(path.join(WATCH, a))))
  for (const f of order) {
    const buf = fs.readFileSync(path.join(PC_NEWS, f))
    const dst = path.join(WATCH, f)
    if (!fs.existsSync(dst) || textSha(fs.readFileSync(dst)) !== textSha(buf)) fs.writeFileSync(dst, buf)
    out[f] = textSha(buf)
  }
  const manifest = { source: 'esb-studio-pc src/news', commit: pcCommit().commit, note: 'Generated by tools/sync-pc.mjs news. The engine files are the same in both apps: edit them in the PC, then sync.', files: out }
  fs.writeFileSync(ENGINE_MANIFEST, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`News engine: ${NEWS_ENGINE.length} files in step with ${PC_NEWS}`)
}

function checkNews() {
  const bad = []
  const hasPc = fs.existsSync(PC_NEWS)
  const m = fs.existsSync(ENGINE_MANIFEST) ? JSON.parse(fs.readFileSync(ENGINE_MANIFEST, 'utf8')) : { files: {} }
  for (const f of NEWS_ENGINE) {
    const here = path.join(WATCH, f)
    if (!fs.existsSync(here)) { bad.push(`missing  ${f}`); continue }
    const h = textSha(fs.readFileSync(here))
    if (hasPc) {
      const there = path.join(PC_NEWS, f)
      if (!fs.existsSync(there)) bad.push(`not on PC ${f}`)
      else if (textSha(fs.readFileSync(there)) !== h) bad.push(`differs  ${f}`)
    } else if (m.files[f] !== h) bad.push(`edited   ${f}`)
  }
  if (bad.length) {
    console.error(`check:news FAILED (${hasPc ? 'against ' + PC_NEWS : 'against ENGINE_MANIFEST.json'}):\n  ` + bad.join('\n  '))
    console.error('The news engine is shared: change it in the PC (src/news), then npm run sync:news.')
    process.exit(1)
  }
  console.log(`check:news OK: ${NEWS_ENGINE.length} engine files match ${hasPc ? 'the PC' : 'the manifest'}`)
}

const cmd = process.argv[2]
if (cmd === 'check') check()
else if (cmd === 'sync') sync()
else if (cmd === 'only') only(process.argv.slice(3))
else if (cmd === 'news') syncNews()
else if (cmd === 'check-news') checkNews()
else if (cmd === 'list') console.log(closure().files.join('\n'))
else { console.error('usage: node tools/sync-pc.mjs sync|check|list|only|news|check-news'); process.exit(2) }
