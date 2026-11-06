// Snap the phone CSS onto one scale: spacing 4·8·12·16·24·32, corners 8·12·20·pill, text 11·13·15·17·22·28.
// Literal px values in padding/margin/gap, border-radius and font-size (also the size inside `font:`) become the
// tokens defined in src/mobile/design.css (--sp-*, --r-*, --fs-*), so the Layout Lab's Tokens tab tunes them app-wide.
//   node tools/layout-lab/snap-scale.mjs          rewrite src/mobile/**/*.css, print a summary
//   node tools/layout-lab/snap-scale.mjs --dry    summary only
// Left alone on purpose: 0, 1px and 2px nudges, negative margins, anything inside calc()/var(), spacing over 32
// (geometry such as divider insets), corners under 6 (hairline marks), text under 10 or over 30 (badges, display).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dry = process.argv.includes('--dry')

const SP = [[4, 'xs'], [8, 's'], [12, 'm'], [16, 'l'], [24, 'xl'], [32, '2xl']]
// ties go up (more air): 6→8, 10→12, 14→16, 20→24, 28→32
function space(n) {
  if (n <= 2 || n > 32) return null
  let best = SP[0]
  for (const s of SP) if (Math.abs(s[0] - n) < Math.abs(best[0] - n) || (Math.abs(s[0] - n) === Math.abs(best[0] - n) && s[0] > best[0])) best = s
  return `var(--sp-${best[1]})`
}
function radius(n) {
  if (n < 6) return null
  if (n >= 30) return null // pills (999, 50…) stay pills
  if (n < 10) return 'var(--r-sm)'
  if (n < 16) return 'var(--r-md)'
  return 'var(--r-lg)'
}
function fontSize(n) {
  if (n < 10 || n > 30) return null
  if (n < 12) return 'var(--fs-xs)'
  if (n < 14) return 'var(--fs-s)'
  if (n <= 16) return 'var(--fs-m)' // 16 joins body 15: 17 is the headline step
  if (n < 19.5) return 'var(--fs-l)'
  if (n < 25) return 'var(--fs-xl)'
  return 'var(--fs-2xl)'
}

const PX = /^(\d*\.?\d+)px$/
const stats = { space: 0, radius: 0, font: 0, files: 0 }
const seen = { space: new Map(), radius: new Map(), font: new Map() }
const note = (k, from, to) => { const key = `${from}→${to.replace(/var\(--|\)/g, '')}`; seen[k].set(key, (seen[k].get(key) || 0) + 1); stats[k]++ }

function mapParts(value, fn, kind) {
  const parts = value.trim().split(/\s+/)
  if (!parts.every((p) => PX.test(p) || p === '0' || p === 'auto')) return null
  let changed = false
  const out = parts.map((p) => {
    const m = p.match(PX)
    if (!m) return p
    const to = fn(parseFloat(m[1]))
    if (!to) return p
    changed = true; note(kind, m[1], to); return to
  })
  return changed ? out.join(' ') : null
}

function rewrite(css) {
  // declarations: prop: value [!important] ; or }
  return css.replace(/([{;\s])((?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap|border(?:-(?:top|bottom)-(?:left|right))?-radius|font-size|font)(\s*:\s*)([^;{}]+?)(\s*!important)?(\s*)(?=[;}])/g,
    (all, pre, prop, colon, value, imp = '', ws) => {
      if (/calc\(|var\(|\//.test(value) && prop !== 'font') return all
      let next = null
      if (prop === 'font') {
        const m = value.match(/(^|\s)(\d*\.?\d+)px(?=\s*\/|\s)/)
        if (m) { const to = fontSize(parseFloat(m[2])); if (to) { note('font', m[2], to); next = value.replace(m[0], m[1] + to) } }
      } else if (prop === 'font-size') {
        const m = value.trim().match(PX)
        if (m) { const to = fontSize(parseFloat(m[1])); if (to) { note('font', m[1], to); next = to } }
      } else if (prop.includes('radius')) next = mapParts(value, radius, 'radius')
      else next = mapParts(value, space, 'space')
      return next == null ? all : `${pre}${prop}${colon}${next}${imp}${ws}`
    })
}

function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.css')) {
      const src = readFileSync(p, 'utf8')
      // the scale itself is defined between these markers and must not be rewritten
      const out = src.replace(/(\/\* scale:begin \*\/[\s\S]*?\/\* scale:end \*\/)|([\s\S]+?)(?=\/\* scale:begin \*\/|$)/g, (m, keep, body) => keep ?? rewrite(body))
      if (out !== src) { stats.files++; if (!dry) writeFileSync(p, out) ; console.log('  ' + relative(root, p)) }
    }
  }
}
walk(join(root, 'src', 'mobile'))
console.log(stats)
for (const k of Object.keys(seen)) console.log(k, [...seen[k]].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ×${n}`).join('  '))
