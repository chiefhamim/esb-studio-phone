// The story banner as plain geometry. Origin: esb-banner-studio src/core/templates.ts, buildStack() (4:5 "fb45", 1:1 "sq", 9:16
// "story") + newsHeadline + dateParts + headlineSize, ported with the same numbers; buildWeb() (split layout) re-fitted to
// 1200 x 630 for the phone ("fb191", adapted, not a desktop size). Templates: classic (desktop default), link (the red
// "news link in comment" pill) and overlay (photo under a dark translucent headline panel, desktop bandOpacity < 1 look).
// Left out on purpose: the faded watermark icon, label pill, photo credit and every per-element override.
// Added here: fitHeadline, which shrinks the headline until it sits inside the band.
import { getMeasureCtx, layoutText } from './text'
import type { TextLayout } from './text'
import type { TextEl, TextRun } from './types'
import { getCategory, darkAccent, INK, WEEKDAY_RED, FOOTER_TEXT, WEB_HEADER } from './tokens'
import type { Category } from './tokens'
import { getSize } from './sizes'
import type { SizeDef, SizeId, TemplateId } from './sizes'

export const W = 1080
export const H = 1350
const BAND_H = 350
const HEAD_X = 48
const HEAD_W = 984

const r2 = (v: number) => Math.round(v * 100) / 100

export const BN_RE = /[ঀ-৿]/

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/** Same output as the desktop dateParts (ISO yyyy-mm-dd). */
export function dateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return { num: String(dt.getDate()), monthYear: `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`, weekday: WEEKDAYS[dt.getDay()] }
}

export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Desktop guideline size for the headline (default: the 4:5 numbers). */
export function headlineSize(chars: number, sizes: [number, number] = [58, 52]): number {
  return chars > 70 ? sizes[1] : sizes[0]
}

/** Geometry of the 4:5 stack, in banner units (1080 x 1350). */
export function geometry() {
  return stackGeometry(getSize('fb45'))
}

/** Geometry of a stack-family size (fb45, sq, story). */
export function stackGeometry(s: SizeDef) {
  const kf = s.w / 1598
  const headerH = Math.round(297 * s.kh)
  const footH = r2(90 * kf)
  const footTop = s.h - footH
  const bandTop = footTop - s.bandH
  const photoH = bandTop - headerH
  const stripeH = r2(22 * s.kh)
  return { W: s.w, H: s.h, headerH, footH, footTop, bandTop, bandH: s.bandH, photoH, stripeH, kh: s.kh, kf }
}

/** Geometry of the split layout (fb191), Web layout numbers: x by W / 1920, y and text by H / 1080. */
export function splitGeometry(s: SizeDef) {
  const kx = s.w / 1920
  const k = s.h / 1080
  const headerH = r2(200 * k)
  const footH = r2(80 * k)
  const footTop = s.h - footH
  const panelX = r2(1280 * kx)
  return { W: s.w, H: s.h, kx, k, headerH, footH, footTop, panelX, panelEdge: r2(8 * k), photoH: footTop - headerH, stripeH: r2(14 * k) }
}

export interface FittedHeadline { el: TextEl; layout: TextLayout; size: number; shrunk: boolean; truncated: boolean }

export interface HeadSpec { x: number; w: number; sizes: [number, number] }
const DEFAULT_SPEC: HeadSpec = { x: HEAD_X, w: HEAD_W, sizes: [58, 52] }

export interface HeadStyle {
  ink?: string
  /** key phrase to colour */
  highlight?: string
  /** colour of the key phrase */
  hiColor?: string
  hiStyle?: 'colour' | 'marker' | 'underline'
}

function headlineEl(text: string, size: number, bn: boolean, spec: HeadSpec, ink: string): TextEl {
  return {
    kind: 'text', x: spec.x, y: 0, w: spec.w, h: 0, text, size, weight: bn ? 700 : 800,
    font: bn ? 'bengali' : undefined, ls: 0, lh: bn ? 140 : 118, align: 'center', fit: 'box', color: ink, runs: [],
  }
}

/** Origin: desktop highlightRuns (whole-word, case-insensitive match first, then a plain substring). */
export function highlightRuns(text: string, phrase: string, color: string): { start: number; end: number; color: string }[] {
  const needle = phrase.trim()
  if (!needle) return []
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const wordRe = new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'gi')
  const runs: { start: number; end: number; color: string }[] = []
  for (const m of text.matchAll(wordRe)) {
    if (m.index !== undefined) runs.push({ start: m.index, end: m.index + m[0].length, color })
  }
  if (runs.length) return runs
  const i = text.toLowerCase().indexOf(needle.toLowerCase())
  return i < 0 ? [] : [{ start: i, end: i + needle.length, color }]
}

/** Origin: desktop phraseRuns for one phrase: plain colour, highlighter band, or underline. */
export function phraseRuns(text: string, phrase: string, color: string, ink: string, style: HeadStyle['hiStyle'] = 'colour'): TextRun[] {
  return highlightRuns(text, phrase, color).map((r): TextRun => {
    if (style === 'marker') return { ...r, color: ink, style: 'marker', bg: `${color}66` }
    if (style === 'underline') return { ...r, style: 'underline' }
    return r
  })
}

/**
 * The desktop layout (greedy word wrap) with a shrink loop: starts at the guideline size and goes down 2 px at a time until
 * the wrapped text fits the box (height at most maxH, no line wider than the box). At the minimum size, words are dropped
 * from the end and an ellipsis added, so the text can never leave the box.
 */
export function fitHeadline(raw: string, maxH = BAND_H - 40, minSize = 28, spec: HeadSpec = DEFAULT_SPEC, style: HeadStyle = {}): FittedHeadline {
  const text = raw.replace(/\s+/g, ' ').trim()
  const bn = BN_RE.test(text)
  const ctx = getMeasureCtx()
  const ink = style.ink ?? INK
  const start = headlineSize(text.length, spec.sizes)
  const fits = (l: TextLayout) => l.height <= maxH + 0.01 && l.width <= spec.w + 0.5
  const attempt = (t: string, size: number, shrunk: boolean, truncated: boolean): FittedHeadline | null => {
    const el = headlineEl(t, size, bn, spec, ink)
    const layout = layoutText(ctx, el)
    if (!fits(layout)) return null
    el.h = layout.height
    if (style.highlight && style.hiColor) el.runs = phraseRuns(t, style.highlight, style.hiColor, ink, style.hiStyle)
    return { el, layout, size, shrunk, truncated }
  }
  for (let size = start; size >= minSize; size -= 2) {
    const hit = attempt(text, size, size < start, false)
    if (hit) return hit
  }
  // still too long at the smallest size: cut words from the end, then characters of a single huge word
  const words = text.split(' ')
  while (words.length > 1) {
    words.pop()
    const hit = attempt(`${words.join(' ')}…`, minSize, true, true)
    if (hit) return hit
  }
  const chars = [...(words[0] ?? '')]
  while (chars.length > 1) {
    chars.pop()
    const hit = attempt(`${chars.join('')}…`, minSize, true, true)
    if (hit) return hit
  }
  return attempt('', minSize, false, false) as FittedHeadline
}

export interface Rect { x: number; y: number; w: number; h: number }
export type IconPlace = { id: 'facebook' | 'website' | 'youtube'; x: number; y: number; w: number }

export interface StoryScene {
  size: SizeDef
  template: TemplateId
  cat: Category
  /** stack geometry (fb45 / sq / story); the split size carries the same field names so callers can stay generic */
  g: ReturnType<typeof stackGeometry>
  headline: FittedHeadline
  dateNum: TextEl
  dateMonth: TextEl
  dateWeekday: TextEl
  dateRule: Rect
  chipText: TextEl
  chip: Rect
  chipIcon: { x: number; y: number; size: number }
  logo: Rect
  footer: TextEl[]
  // ---- layout-neutral drawing data (the renderer reads these) ----
  headerH: number
  headerColor: string
  /** where the photo is drawn (clipped) */
  photoRect: Rect
  /** the headline band / panel */
  bandRect: Rect
  bandFill: { top: string; bottom: string; alpha: number }
  /** accent line on the band's top edge (stack) or the panel's left edge (split) */
  edgeRect: Rect
  stripes: { y: number; h: number }[]
  footerRect: Rect
  footerLine: Rect
  footerColor: string
  footerIcons: IconPlace[]
  pill: { rect: Rect; radius: number; icon: { x: number; y: number; w: number }; label: TextEl } | null
  /** pixel radius unit for the chip / rule (kh or k) */
  unit: number
}

function plain(x: number, y: number, text: string, size: number, weight: 500 | 700 | 800, ls: number, color: string): TextEl {
  const el: TextEl = { kind: 'text', x, y, w: 0, h: 0, text, size, weight, ls, lh: null, align: 'left', color, runs: [], fit: 'hug' }
  const lay = layoutText(getMeasureCtx(), el)
  el.w = lay.width
  el.h = lay.height
  return el
}

export interface SceneInput {
  size: SizeId
  template: TemplateId
  headline: string
  /** category id '01'..'10' */
  category: string
  date: string
  highlight?: string
  hiStyle?: HeadStyle['hiStyle']
}

/** All positions for one banner. Needs the fonts loaded first (text is measured here). */
export function buildScene(o: SceneInput): StoryScene {
  const size = getSize(o.size)
  const cat = getCategory(o.category)
  const dp = dateParts(o.date)
  const overlay = o.template === 'overlay'
  const ink = overlay ? '#ffffff' : INK
  const hi = overlay ? cat.accent : darkAccent(cat.accent)
  const style: HeadStyle = { ink, highlight: o.highlight, hiColor: hi, hiStyle: o.hiStyle }

  if (size.family === 'split') return buildSplit(size, o, cat, dp, style, overlay)

  const g = stackGeometry(size)
  const kh = size.kh
  const kb = size.kb
  const kf = g.kf
  const link = o.template === 'link'
  const dark = '#0b0f19'
  const pillH = r2(62 * kb)
  const gap = r2(22 * kb)
  const spec: HeadSpec = { x: size.headX, w: size.headW, sizes: size.headSizes }
  const headline = fitHeadline(o.headline, g.bandH - 40 - (link ? pillH + gap : 0), 28, spec, style)
  const groupH = (link ? pillH + gap : 0) + headline.el.h
  const groupTop = g.bandTop + g.bandH * (157 / 304) - groupH / 2
  headline.el.y = groupTop + (link ? pillH + gap : 0)

  let pill: StoryScene['pill'] = null
  if (link) {
    const label = plain(0, groupTop + 12 * kb, 'NEWS LINK IN COMMENT  ↓', r2(31 * kb), 800, 0, '#ffffff')
    const pillW = r2(543 * kb)
    const pillX = (size.w - pillW) / 2
    label.x = pillX + 74 * kb
    pill = { rect: { x: pillX, y: groupTop, w: pillW, h: pillH }, radius: 31 * kb, icon: { x: pillX + 26 * kb, y: groupTop + 14 * kb, w: 34 * kb }, label }
  }

  const R = size.w - 56 * kh
  const dateNum = plain(0, 52.5 * kh, dp.num, r2(112 * kh), 800, -2 * kh, INK)
  const dateMonth = plain(0, 80 * kh, dp.monthYear, r2(32 * kh), 800, 3 * kh, INK)
  const dateWeekday = plain(0, 127 * kh, dp.weekday, r2(28 * kh), 700, 5 * kh, WEEKDAY_RED)
  const stackX = R - Math.max(dateMonth.w, dateWeekday.w)
  dateMonth.x = stackX
  dateWeekday.x = stackX
  const dateRule = { x: stackX - 30 * kh, y: 78.34 * kh, w: 8 * kh, h: 84.32 * kh }
  dateNum.x = dateRule.x - 22 * kh - dateNum.w

  const chipText = plain(0, 208 * kh, cat.chip, r2(24 * kh), 800, 1.2 * kh, cat.chipText)
  const chipW = chipText.w + 84 * kh
  const chipX = R - chipW
  chipText.x = chipX + 60 * kh
  const chip = { x: chipX, y: 200.5 * kh, w: chipW, h: 44 * kh }
  const chipIcon = { x: chipX + 24 * kh, y: 209.5 * kh, size: 26 * kh }

  const logo = { x: 56 * kh, y: 51 * kh, w: 560 * kh, h: 195 * kh }

  const fy = (v: number) => g.footTop + (v - 1341) * kf
  const ft = (x: number, t: string) => plain(x * kf, fy(1364), t, r2(36 * kf), 500, 0, FOOTER_TEXT)
  const footer = [ft(132, 'esbpowerlineofficial'), ft(681, 'esbpowerline.com'), ft(1274, 'ESB Power Line')]
  const footerIcons: IconPlace[] = [
    { id: 'facebook', x: 56 * kf, y: fy(1356), w: 60 * kf },
    { id: 'website', x: 601 * kf, y: fy(1354), w: 64 * kf },
    { id: 'youtube', x: 1192 * kf, y: fy(1362.5), w: 66 * kf },
  ]

  const photoBottom = overlay ? g.footTop : g.bandTop
  return {
    size, template: o.template, cat, g, headline, dateNum, dateMonth, dateWeekday, dateRule, chipText, chip, chipIcon, logo, footer,
    headerH: g.headerH, headerColor: '#fdfbdc',
    photoRect: { x: 0, y: g.headerH, w: size.w, h: photoBottom - g.headerH },
    bandRect: { x: 0, y: g.bandTop, w: size.w, h: g.bandH },
    bandFill: overlay ? { top: dark, bottom: dark, alpha: 0.78 } : { top: cat.band, bottom: cat.band, alpha: 1 },
    edgeRect: { x: 0, y: g.bandTop - 10 * kh, w: size.w, h: 10 * kh },
    stripes: [{ y: 0, h: g.stripeH }, { y: g.headerH - g.stripeH, h: g.stripeH }],
    footerRect: { x: 0, y: g.footTop, w: size.w, h: g.footH },
    footerLine: { x: 0, y: g.footTop, w: size.w, h: 6 * kf },
    footerColor: cat.footer,
    footerIcons, pill, unit: kh,
  }
}

function buildSplit(size: SizeDef, o: SceneInput, cat: Category, dp: ReturnType<typeof dateParts>, style: HeadStyle, overlay: boolean): StoryScene {
  const s = splitGeometry(size)
  const { kx, k } = s
  const spec: HeadSpec = { x: r2(1328 * kx), w: r2(552 * kx), sizes: [Math.round(size.headSizes[0] * k), Math.round(size.headSizes[1] * k)] }
  const headline = fitHeadline(o.headline, 800 * k - 40 * k, 14, spec, style)
  headline.el.y = 600 * k - headline.el.h / 2

  const R = size.w - 56 * kx
  const dateNum = plain(0, 13.95 * k, dp.num, r2(86 * k), 800, -1.5 * k, INK)
  const dateMonth = plain(0, 29.5 * k, dp.monthYear, r2(30 * k), 800, 3 * k, INK)
  const dateWeekday = plain(0, 73.5 * k, dp.weekday, r2(24 * k), 700, 4.8 * k, WEEKDAY_RED)
  const stackX = R - Math.max(dateMonth.w, dateWeekday.w)
  dateMonth.x = stackX
  dateWeekday.x = stackX
  const dateRule = { x: stackX - 28 * k, y: 34.74 * k, w: 8 * k, h: 62.52 * k }
  dateNum.x = dateRule.x - 20 * k - dateNum.w

  const chipText = plain(0, 129.76 * k, cat.chip, r2(22 * k), 800, 1.1 * k, cat.chipText)
  const chipW = chipText.w + 76 * k
  const chipX = R - chipW
  chipText.x = chipX + 54 * k
  const chip = { x: chipX, y: 121.26 * k, w: chipW, h: 44 * k }
  const chipIcon = { x: chipX + 22 * k, y: 132.26 * k, size: 22 * k }
  const logo = { x: 56 * kx, y: 36 * k, w: 368 * k, h: 128 * k }

  const ft = (x: number, t: string) => plain(x * kx, 1025 * k, t, r2(28 * k), 500, 0, FOOTER_TEXT)
  const footer = [ft(118, 'esbpowerlineofficial'), ft(868, 'esbpowerline.com'), ft(1656, 'ESB Power Line')]
  const footerIcons: IconPlace[] = [
    { id: 'facebook', x: 56 * kx, y: 1018 * k, w: 48 * k },
    { id: 'website', x: 806 * kx, y: 1018 * k, w: 48 * k },
    { id: 'youtube', x: 1588 * kx, y: 1023 * k, w: 54 * k },
  ]
  const dark = '#0b0f19'
  const g = { W: size.w, H: size.h, headerH: s.headerH, footH: s.footH, footTop: s.footTop, bandTop: s.headerH, bandH: s.photoH, photoH: s.photoH, stripeH: s.stripeH, kh: k, kf: kx }
  return {
    size, template: o.template, cat, g, headline, dateNum, dateMonth, dateWeekday, dateRule, chipText, chip, chipIcon, logo, footer,
    headerH: s.headerH, headerColor: WEB_HEADER,
    photoRect: { x: 0, y: s.headerH, w: overlay ? size.w : s.panelX, h: s.photoH },
    bandRect: { x: s.panelX, y: s.headerH, w: size.w - s.panelX, h: s.photoH },
    bandFill: overlay ? { top: dark, bottom: dark, alpha: 0.78 } : { top: cat.panel[0], bottom: cat.panel[1], alpha: 1 },
    edgeRect: { x: s.panelX, y: s.headerH, w: s.panelEdge, h: s.photoH },
    stripes: [{ y: 0, h: s.stripeH }, { y: r2(186 * k), h: s.stripeH }],
    footerRect: { x: 0, y: s.footTop, w: size.w, h: s.footH },
    footerLine: { x: 0, y: s.footTop, w: size.w, h: r2(5 * k) },
    footerColor: cat.footer,
    footerIcons, pill: null, unit: k,
  }
}

/** The plain 4:5 classic banner (the first build's entry point, kept for its tests). */
export function buildStoryScene(story: { headline: string; category: string }, dateIso: string): StoryScene {
  return buildScene({ size: 'fb45', template: 'classic', headline: story.headline, category: story.category, date: dateIso })
}

/** The photo frame (in banner units) for a size and template, without needing fonts: used by the touch positioning maths. */
export function photoRectFor(sizeId: SizeId, template: TemplateId): Rect {
  const size = getSize(sizeId)
  const overlay = template === 'overlay'
  if (size.family === 'split') {
    const s = splitGeometry(size)
    return { x: 0, y: s.headerH, w: overlay ? size.w : s.panelX, h: s.photoH }
  }
  const g = stackGeometry(size)
  return { x: 0, y: g.headerH, w: size.w, h: (overlay ? g.footTop : g.bandTop) - g.headerH }
}
