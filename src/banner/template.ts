// The story banner, 4:5 ("fb45"), as plain geometry. Origin: esb-banner-studio src/core/templates.ts, buildStack('fb45') +
// newsHeadline + dateParts + headlineSize, ported with the same numbers (1080 x 1350, kh .74, kb .84, band 350, headline
// box x 48 / w 984, 58 px headline, 52 px when over 70 characters, line height 118 %, Bangla 140 %). Left out on purpose:
// the faded watermark icon, the link pill, highlight runs, label pill, photo credit and every override (not needed for the
// phone's first banner). Added here: fitHeadline, which shrinks the headline until it sits inside the band.
import { getMeasureCtx, layoutText } from './text'
import type { TextLayout } from './text'
import type { TextEl } from './types'
import { getCategory, INK, WEEKDAY_RED, FOOTER_TEXT } from './tokens'
import type { Category } from './tokens'

export const W = 1080
export const H = 1350
const KH = 0.74
const BAND_H = 350
const HEAD_X = 48
const HEAD_W = 984
const KF = W / 1598

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

/** Desktop guideline size for the 4:5 headline. */
export function headlineSize(chars: number): number {
  return chars > 70 ? 52 : 58
}

/** Geometry of the 4:5 stack, in banner units (1080 x 1350). */
export function geometry() {
  const headerH = Math.round(297 * KH)
  const footH = r2(90 * KF)
  const footTop = H - footH
  const bandTop = footTop - BAND_H
  const photoH = bandTop - headerH
  const stripeH = r2(22 * KH)
  return { W, H, headerH, footH, footTop, bandTop, bandH: BAND_H, photoH, stripeH, kh: KH, kf: KF }
}

export interface FittedHeadline { el: TextEl; layout: TextLayout; size: number; shrunk: boolean; truncated: boolean }

function headlineEl(text: string, size: number, bn: boolean): TextEl {
  return {
    kind: 'text', x: HEAD_X, y: 0, w: HEAD_W, h: 0, text, size, weight: bn ? 700 : 800,
    font: bn ? 'bengali' : undefined, ls: 0, lh: bn ? 140 : 118, align: 'center', fit: 'box', color: INK, runs: [],
  }
}

/**
 * The desktop layout (greedy word wrap) with a shrink loop: starts at the guideline size and goes down 2 px at a time until
 * the wrapped text fits the box (height at most maxH, no line wider than the box). At the minimum size, words are dropped
 * from the end and an ellipsis added, so the text can never leave the box.
 */
export function fitHeadline(raw: string, maxH = BAND_H - 40, minSize = 28): FittedHeadline {
  const text = raw.replace(/\s+/g, ' ').trim()
  const bn = BN_RE.test(text)
  const ctx = getMeasureCtx()
  const start = headlineSize(text.length)
  const fits = (l: TextLayout) => l.height <= maxH + 0.01 && l.width <= HEAD_W + 0.5
  const attempt = (t: string, size: number, shrunk: boolean, truncated: boolean): FittedHeadline | null => {
    const el = headlineEl(t, size, bn)
    const layout = layoutText(ctx, el)
    if (!fits(layout)) return null
    el.h = layout.height
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

export interface StoryScene {
  cat: Category
  g: ReturnType<typeof geometry>
  headline: FittedHeadline
  dateNum: TextEl
  dateMonth: TextEl
  dateWeekday: TextEl
  dateRule: { x: number; y: number; w: number; h: number }
  chipText: TextEl
  chip: { x: number; y: number; w: number; h: number }
  chipIcon: { x: number; y: number; size: number }
  logo: { x: number; y: number; w: number; h: number }
  footer: TextEl[]
}

function plain(x: number, y: number, text: string, size: number, weight: 500 | 700 | 800, ls: number, color: string): TextEl {
  const el: TextEl = { kind: 'text', x, y, w: 0, h: 0, text, size, weight, ls, lh: null, align: 'left', color, runs: [], fit: 'hug' }
  const lay = layoutText(getMeasureCtx(), el)
  el.w = lay.width
  el.h = lay.height
  return el
}

/** All positions for one story banner. Needs the fonts loaded first (text is measured here). */
export function buildStoryScene(story: { headline: string; category: string }, dateIso: string): StoryScene {
  const cat = getCategory(story.category)
  const g = geometry()
  const dp = dateParts(dateIso)
  const headline = fitHeadline(story.headline)
  // headline block centred in the band, same anchor as the desktop (157/304 of the band)
  headline.el.y = g.bandTop + g.bandH * (157 / 304) - headline.el.h / 2

  const R = W - 56 * KH
  const dateNum = plain(0, 52.5 * KH, dp.num, r2(112 * KH), 800, -2 * KH, INK)
  const dateMonth = plain(0, 80 * KH, dp.monthYear, r2(32 * KH), 800, 3 * KH, INK)
  const dateWeekday = plain(0, 127 * KH, dp.weekday, r2(28 * KH), 700, 5 * KH, WEEKDAY_RED)
  const stackX = R - Math.max(dateMonth.w, dateWeekday.w)
  dateMonth.x = stackX
  dateWeekday.x = stackX
  const dateRule = { x: stackX - 30 * KH, y: 78.34 * KH, w: 8 * KH, h: 84.32 * KH }
  dateNum.x = dateRule.x - 22 * KH - dateNum.w

  const chipText = plain(0, 208 * KH, cat.chip, r2(24 * KH), 800, 1.2 * KH, cat.chipText)
  const chipW = chipText.w + 84 * KH
  const chipX = R - chipW
  chipText.x = chipX + 60 * KH
  const chip = { x: chipX, y: 200.5 * KH, w: chipW, h: 44 * KH }
  const chipIcon = { x: chipX + 24 * KH, y: 209.5 * KH, size: 26 * KH }

  const logo = { x: 56 * KH, y: 51 * KH, w: 560 * KH, h: 195 * KH }

  const fy = (v: number) => g.footTop + (v - 1341) * KF
  const ft = (x: number, t: string) => plain(x * KF, fy(1364), t, r2(36 * KF), 500, 0, FOOTER_TEXT)
  const footer = [ft(132, 'esbpowerlineofficial'), ft(681, 'esbpowerline.com'), ft(1274, 'ESB Power Line')]

  return { cat, g, headline, dateNum, dateMonth, dateWeekday, dateRule, chipText, chip, chipIcon, logo, footer }
}
