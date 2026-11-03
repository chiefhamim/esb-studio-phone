// Pure-maths tests. Under vitest (node) there is no canvas: text.ts falls back to a fake measurer of 8 px per character,
// so these check the layout/fit logic and geometry, not real glyph widths. Canvas drawing, fonts, IndexedDB and the
// share/save plugins are NOT covered here; they need a device.
import { describe, expect, it } from 'vitest'
import { getMeasureCtx, layoutText } from './text'
import { buildStoryScene, dateParts, fitHeadline, geometry, headlineSize, todayIso } from './template'
import { coverSource, shrinkDims } from './photoMath'
import { fileStem } from './output'
import { CATEGORIES } from './tokens'
import { categoryIdOf } from './categories'
import type { TextEl } from './types'

const el = (text: string, w: number): TextEl => ({ kind: 'text', x: 0, y: 0, w, h: 0, text, size: 20, weight: 800, ls: 0, lh: 118, align: 'left', color: '#000', runs: [], fit: 'box' })

describe('text layout (desktop word wrap)', () => {
  it('wraps greedily at spaces', () => {
    const l = layoutText(getMeasureCtx(), el('aaaa bbbb cccc', 80)) // 10 chars per line
    expect(l.lines.map((x) => x.text)).toEqual(['aaaa bbbb', 'cccc'])
    expect(l.height).toBeCloseTo(2 * l.lineH)
  })
  it('breaks after a hyphen', () => {
    const l = layoutText(getMeasureCtx(), el('Battery-Powered grid', 100))
    expect(l.lines[0].text).toBe('Battery-')
  })
})

describe('headline fit', () => {
  it('uses the guideline sizes', () => {
    expect(headlineSize(70)).toBe(58)
    expect(headlineSize(71)).toBe(52)
  })
  it('keeps a short headline at full size', () => {
    const f = fitHeadline('Govt approves gas project')
    expect(f.size).toBe(58)
    expect(f.shrunk).toBe(false)
  })
  it('shrinks a long headline and never overflows the box', () => {
    const f = fitHeadline('word '.repeat(140))
    expect(f.size).toBeLessThan(52)
    expect(f.layout.height).toBeLessThanOrEqual(310 + 0.01)
    expect(f.layout.width).toBeLessThanOrEqual(984.5)
  })
  it('truncates with an ellipsis when even the smallest size cannot fit', () => {
    const f = fitHeadline('word '.repeat(2000))
    expect(f.truncated).toBe(true)
    expect(f.el.text.endsWith('…')).toBe(true)
    expect(f.layout.height).toBeLessThanOrEqual(310 + 0.01)
  })
  it('cuts a single huge word', () => {
    const f = fitHeadline('x'.repeat(5000))
    expect(f.layout.width).toBeLessThanOrEqual(984.5)
    expect(f.truncated).toBe(true)
  })
  it('uses the Bangla font and 140 % line height for Bangla text', () => {
    const f = fitHeadline('বিদ্যুৎ উৎপাদন বেড়েছে')
    expect(f.el.font).toBe('bengali')
    expect(f.el.lh).toBe(140)
  })
})

describe('template geometry (4:5)', () => {
  it('matches the desktop stack numbers', () => {
    const g = geometry()
    expect(g.headerH).toBe(220)
    expect(g.footH).toBeCloseTo(60.83, 2)
    expect(g.footTop + g.footH).toBeCloseTo(1350, 5)
    expect(g.bandTop).toBeCloseTo(g.footTop - 350, 5)
    expect(g.photoH).toBeCloseTo(g.bandTop - g.headerH, 5)
  })
  it('keeps the headline inside the band and the chip inside the header', () => {
    const s = buildStoryScene({ headline: 'word '.repeat(40), category: '02' }, '2026-11-03')
    const g = s.g
    expect(s.headline.el.y).toBeGreaterThanOrEqual(g.bandTop)
    expect(s.headline.el.y + s.headline.el.h).toBeLessThanOrEqual(g.footTop)
    expect(s.chip.x + s.chip.w).toBeLessThanOrEqual(1080)
    expect(s.chip.y + s.chip.h).toBeLessThanOrEqual(g.headerH)
    expect(s.dateNum.x).toBeGreaterThan(s.logo.x + s.logo.w * 0.5)
  })
  it('formats dates like the desktop', () => {
    expect(dateParts('2026-10-22')).toEqual({ num: '22', monthYear: 'OCTOBER 2026', weekday: 'THURSDAY' })
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('photo maths', () => {
  it('shrinks the long side to the limit and keeps the ratio', () => {
    const d = shrinkDims(16320, 12240, 2400)
    expect(d.w).toBe(2400)
    expect(d.h).toBe(1800)
    expect(shrinkDims(3000, 6000, 2400)).toMatchObject({ w: 1200, h: 2400 })
  })
  it('never scales up', () => {
    expect(shrinkDims(800, 600, 2400)).toEqual({ w: 800, h: 600, scale: 1 })
  })
  it('cover crop fills the box with the right ratio', () => {
    const c = coverSource(4000, 3000, 1080, 720)
    expect(c.sw / c.sh).toBeCloseTo(1080 / 720, 5)
    expect(c.sx).toBeCloseTo((4000 - c.sw) / 2, 5)
    expect(c.sw).toBeLessThanOrEqual(4000)
    expect(c.sh).toBeLessThanOrEqual(3000)
  })
})

describe('misc', () => {
  it('makes safe file names', () => {
    const s = fileStem('Govt: Tk 592 crore / gas!', new Date(2026, 10, 3, 9, 5, 7))
    expect(s).toBe('esb-Govt-Tk-592-crore-gas-20261103-090507')
    expect(fileStem('বাংলা', new Date(2026, 10, 3, 9, 5, 7))).toBe('esb-banner-20261103-090507')
  })
  it('resolves a stored category by name or id, empty otherwise', () => {
    expect(categoryIdOf(CATEGORIES[1].name)).toBe('02')
    expect(categoryIdOf('05')).toBe('05')
    expect(categoryIdOf('')).toBe('')
    expect(categoryIdOf('Sports')).toBe('')
  })
})
