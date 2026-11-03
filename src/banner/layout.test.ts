// Pure-logic tests for the redesigned banner desk: sizes, template geometry per size, photo transform maths, tone curve,
// key-phrase tapping and saved settings. No canvas (text.ts falls back to 8 px per character under node).
import { describe, expect, it } from 'vitest'
import { SIZES, templatesFor, getSize, exportSize } from './sizes'
import { buildScene, photoRectFor, fitHeadline, highlightRuns } from './template'
import { coverSource, transformedSource, panTransform, zoomTransform, clampTransform, NEUTRAL_TRANSFORM, MAX_ZOOM } from './photoMath'
import { toneLut, isNeutralAdjust, clampAdjust, colourPixel } from './photoEdit'
import { phraseFromRange, rangeOfPhrase, tapWord, wordsOf } from './highlight'
import { sanitizeSettings, DEFAULT_SETTINGS } from './settings'

describe('sizes', () => {
  it('has the four requested sizes with the right pixels', () => {
    expect(SIZES.map((s) => [s.id, s.w, s.h])).toEqual([['fb45', 1080, 1350], ['sq', 1080, 1080], ['fb191', 1200, 630], ['story', 1080, 1920]])
    expect(exportSize(getSize('story'), 2)).toEqual({ w: 2160, h: 3840 })
    expect(exportSize(getSize('fb191'), 1)).toEqual({ w: 1200, h: 630 })
  })
  it('offers the link pill only on stack sizes', () => {
    expect(templatesFor(getSize('fb45')).map((t) => t.id)).toEqual(['classic', 'link', 'overlay'])
    expect(templatesFor(getSize('fb191')).map((t) => t.id)).toEqual(['classic', 'overlay'])
  })
})

describe('template geometry per size and template', () => {
  for (const size of SIZES) {
    for (const t of templatesFor(size)) {
      it(`${size.id}/${t.id}: everything stays inside the canvas and the headline inside its band`, () => {
        const s = buildScene({ size: size.id, template: t.id, headline: 'word '.repeat(40), category: '02', date: '2026-11-03' })
        expect(s.headline.el.y).toBeGreaterThanOrEqual(s.bandRect.y - 0.01)
        expect(s.headline.el.y + s.headline.el.h).toBeLessThanOrEqual(s.bandRect.y + s.bandRect.h + 0.01)
        expect(s.headline.el.x).toBeGreaterThanOrEqual(s.bandRect.x - 0.01)
        expect(s.headline.el.x + s.headline.el.w).toBeLessThanOrEqual(size.w + 0.01)
        expect(s.chip.x + s.chip.w).toBeLessThanOrEqual(size.w)
        expect(s.chip.y + s.chip.h).toBeLessThanOrEqual(s.headerH + 0.01)
        expect(s.footerRect.y + s.footerRect.h).toBeCloseTo(size.h, 1)
        expect(s.photoRect.h).toBeGreaterThan(0)
        expect(s.photoRect.y).toBeCloseTo(s.headerH, 5)
        expect(photoRectFor(size.id, t.id)).toEqual(s.photoRect)
      })
    }
  }
  it('overlay runs the photo under the band; classic stops at it', () => {
    const o = photoRectFor('fb45', 'overlay')
    const c = photoRectFor('fb45', 'classic')
    expect(o.h).toBeGreaterThan(c.h)
    expect(o.y + o.h).toBeCloseTo(1350 - 60.83, 1)
  })
  it('link template puts the pill above the headline inside the band', () => {
    const s = buildScene({ size: 'sq', template: 'link', headline: 'Govt approves gas project', category: '03', date: '2026-11-03' })
    expect(s.pill).not.toBeNull()
    expect(s.pill!.rect.y + s.pill!.rect.h).toBeLessThanOrEqual(s.headline.el.y)
    expect(s.pill!.rect.y).toBeGreaterThanOrEqual(s.bandRect.y)
  })
  it('uses the per-size guideline headline sizes', () => {
    expect(fitHeadline('short', 300, 28, { x: 48, w: 984, sizes: [50, 45] }).size).toBe(50)
    expect(buildScene({ size: 'story', template: 'classic', headline: 'short', category: '01', date: '2026-11-03' }).headline.size).toBe(58)
  })
  it('colours the key phrase through runs', () => {
    const f = fitHeadline('Govt approves gas project', 300, 28, undefined, { highlight: 'gas project', hiColor: '#123456', hiStyle: 'marker' })
    expect(f.el.runs).toHaveLength(1)
    expect(f.el.runs[0]).toMatchObject({ start: 14, end: 25, style: 'marker' })
    expect(highlightRuns('Gas gas', 'gas', '#000')).toHaveLength(2)
  })
})

describe('photo transform maths', () => {
  const img = { w: 4000, h: 3000 }
  const box = { w: 1080, h: 719 }
  it('neutral transform equals the plain cover crop', () => {
    const a = transformedSource(img.w, img.h, box.w, box.h, NEUTRAL_TRANSFORM)
    const b = coverSource(img.w, img.h, box.w, box.h)
    expect(a.sx).toBeCloseTo(b.sx, 6); expect(a.sy).toBeCloseTo(b.sy, 6); expect(a.sw).toBeCloseTo(b.sw, 6); expect(a.sh).toBeCloseTo(b.sh, 6)
  })
  it('zoom shrinks the window and keeps it inside the photo', () => {
    for (const t of [{ zoom: 2, px: 1, py: 1 }, { zoom: 4, px: -1, py: -1 }, { zoom: 1.5, px: 0.3, py: -0.7 }]) {
      const s = transformedSource(img.w, img.h, box.w, box.h, t)
      expect(s.sx).toBeGreaterThanOrEqual(-1e-6); expect(s.sy).toBeGreaterThanOrEqual(-1e-6)
      expect(s.sx + s.sw).toBeLessThanOrEqual(img.w + 1e-6); expect(s.sy + s.sh).toBeLessThanOrEqual(img.h + 1e-6)
    }
    expect(transformedSource(img.w, img.h, box.w, box.h, { zoom: 2, px: 0, py: 0 }).sw).toBeCloseTo(coverSource(img.w, img.h, box.w, box.h).sw / 2, 6)
  })
  it('dragging right shows more of the photo on the left', () => {
    const t = panTransform(img.w, img.h, box.w, box.h, { zoom: 2, px: 0, py: 0 }, 100, 0)
    expect(t.px).toBeLessThan(0)
    const back = panTransform(img.w, img.h, box.w, box.h, t, -100, 0)
    expect(back.px).toBeCloseTo(0, 6)
  })
  it('a finger move equals the same movement of the picture in the frame', () => {
    const t0 = { zoom: 2, px: 0, py: 0 }
    const before = transformedSource(img.w, img.h, box.w, box.h, t0)
    const after = transformedSource(img.w, img.h, box.w, box.h, panTransform(img.w, img.h, box.w, box.h, t0, 54, 0))
    // 54 frame px at (sw / boxW) source px each
    expect(before.sx - after.sx).toBeCloseTo(54 * (before.sw / box.w), 4)
  })
  it('never pans past the edge and survives a photo with no room', () => {
    const t = panTransform(img.w, img.h, box.w, box.h, NEUTRAL_TRANSFORM, 99999, 99999)
    expect(Math.abs(t.px)).toBeLessThanOrEqual(1)
    expect(Math.abs(t.py)).toBeLessThanOrEqual(1)
    const same = panTransform(4000, 3000, 1200, 900, NEUTRAL_TRANSFORM, 99999, 99999)
    expect(same).toEqual(NEUTRAL_TRANSFORM) // zoom 1, same ratio: no room on either axis
    expect(panTransform(1000, 1000, 1000, 1000, NEUTRAL_TRANSFORM, 50, 50)).toEqual(NEUTRAL_TRANSFORM)
  })
  it('pinch keeps the point under the fingers fixed and clamps the zoom', () => {
    const t0 = { zoom: 2, px: 0.2, py: 0.1 }
    const fx = 0.25, fy = 0.6
    const s0 = transformedSource(img.w, img.h, box.w, box.h, t0)
    const t1 = zoomTransform(img.w, img.h, box.w, box.h, t0, 1.5, fx, fy)
    const s1 = transformedSource(img.w, img.h, box.w, box.h, t1)
    expect(t1.zoom).toBeCloseTo(3, 6)
    expect(s1.sx + fx * s1.sw).toBeCloseTo(s0.sx + fx * s0.sw, 4)
    expect(s1.sy + fy * s1.sh).toBeCloseTo(s0.sy + fy * s0.sh, 4)
    expect(zoomTransform(img.w, img.h, box.w, box.h, t0, 100).zoom).toBe(MAX_ZOOM)
    expect(zoomTransform(img.w, img.h, box.w, box.h, t0, 0.0001).zoom).toBe(1)
  })
  it('clamps junk', () => {
    expect(clampTransform({ zoom: NaN, px: 9, py: -9 })).toEqual({ zoom: 1, px: 1, py: -1 })
  })
})

describe('photo tone (desktop photoEdit pipeline)', () => {
  it('neutral is the identity', () => {
    const lut = toneLut({})
    expect([0, 64, 128, 255].map((i) => lut[i])).toEqual([0, 64, 128, 255])
    expect(isNeutralAdjust({})).toBe(true)
    expect(isNeutralAdjust({ contrast: 1 })).toBe(false)
  })
  it('exposure brightens, contrast spreads around mid-grey', () => {
    expect(toneLut({ exposure: 50 })[100]).toBeGreaterThan(100)
    expect(toneLut({ exposure: -50 })[100]).toBeLessThan(100)
    const c = toneLut({ contrast: 50 })
    expect(c[200]).toBeGreaterThan(200); expect(c[50]).toBeLessThan(50)
  })
  it('saturation -100 gives grey, warmth pushes red over blue', () => {
    const [r, g, b] = colourPixel(0.8, 0.4, 0.2, 0, -100)
    expect(r).toBeCloseTo(g, 6); expect(g).toBeCloseTo(b, 6)
    const w = colourPixel(0.5, 0.5, 0.5, 50, 0)
    expect(w[0]).toBeGreaterThan(w[2])
  })
  it('clamps and drops zero values', () => {
    expect(clampAdjust({ exposure: 500, contrast: 0, temp: -3.4 })).toEqual({ exposure: 100, temp: -3 })
  })
})

describe('key phrase by tapping words', () => {
  const words = wordsOf('Govt approves gas project, says minister')
  it('builds a phrase from a range without trailing punctuation', () => {
    expect(phraseFromRange(words, 2, 3)).toBe('gas project')
    expect(phraseFromRange(words, 3, 2)).toBe('gas project')
    expect(rangeOfPhrase(words, 'Gas Project')).toEqual([2, 3])
    expect(rangeOfPhrase(words, 'nothing')).toBeNull()
  })
  it('first tap starts, second closes, a tap inside clears', () => {
    const a = tapWord(words, '', null, 1)
    expect(a).toEqual({ phrase: 'approves', anchor: 1 })
    const b = tapWord(words, a.phrase, a.anchor, 3)
    expect(b).toEqual({ phrase: 'approves gas project', anchor: null })
    expect(tapWord(words, b.phrase, null, 2)).toEqual({ phrase: '', anchor: null })
  })
})

describe('saved banner settings', () => {
  it('falls back field by field and never trusts stored junk', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    const s = sanitizeSettings({ size: 'nope', template: 'overlay', scale: 1, transform: { zoom: 99, px: 'x' }, adjust: { exposure: 900 }, highlight: 5 })
    expect(s).toMatchObject({ size: 'fb45', template: 'overlay', scale: 1, highlight: '' })
    expect(s.transform).toEqual({ zoom: MAX_ZOOM, px: 0, py: 0 })
    expect(s.adjust).toEqual({ exposure: 100 })
  })
})
