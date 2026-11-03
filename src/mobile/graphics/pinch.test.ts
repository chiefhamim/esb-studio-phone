import { describe, expect, it } from 'vitest'
import { anchorScroll, boxAt, dist, mid, pinchScale, toDesign, TouchSet, zoomStep, ZOOM_MAX, ZOOM_MIN } from './pinch'

describe('pinch math', () => {
  it('distance and midpoint', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(mid({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 })
  })
  it('scales with the finger spread and clamps', () => {
    expect(pinchScale(0.5, 100, 200)).toBe(1)
    expect(pinchScale(0.5, 100, 50)).toBe(0.25)
    expect(pinchScale(1, 100, 10000)).toBe(ZOOM_MAX)
    expect(pinchScale(1, 100, 0.5)).toBe(ZOOM_MIN)
    // degenerate start distance: no change
    expect(pinchScale(0.7, 0, 100)).toBe(0.7)
  })
  it('keeps the design point under the fingers while zooming', () => {
    const m0 = { x: 200, y: 300 }, o0 = { x: 20, y: 40 }, s0 = 0.5
    // after zoom to 1× the artboard (unscrolled) sits at the same origin
    const d = anchorScroll(m0, o0, s0, m0, o0, 1)
    // design point under m0 before: ((200-20)/0.5, (300-40)/0.5) = (360, 520)
    const p = toDesign(m0, o0, s0)
    expect(p).toEqual({ x: 360, y: 520 })
    // scrolling by d moves the artboard origin by -d: the same design point is again under m0
    const after = toDesign(m0, { x: o0.x - d.x, y: o0.y - d.y }, 1)
    expect(after.x).toBeCloseTo(360)
    expect(after.y).toBeCloseTo(520)
  })
  it('pans when the midpoint moves without a zoom', () => {
    const d = anchorScroll({ x: 100, y: 100 }, { x: 0, y: 0 }, 1, { x: 130, y: 90 }, { x: 0, y: 0 }, 1)
    expect(d).toEqual({ x: -30, y: 10 })
  })
  it('zoom buttons step like the PC (×1.25 / ×0.8)', () => {
    expect(zoomStep(1, 1)).toBe(1.25)
    expect(zoomStep(1, -1)).toBe(0.8)
    expect(zoomStep(3.9, 1)).toBe(ZOOM_MAX)
  })
  it('finds the slot under a point', () => {
    const boxes = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }]
    expect(boxAt({ x: 15, y: 5 }, boxes)).toBe(1)
    expect(boxAt({ x: 50, y: 5 }, boxes)).toBe(-1)
  })
  it('tracks touches', () => {
    const t = new TouchSet()
    t.down(1, { x: 0, y: 0 })
    expect(t.pair()).toBeNull()
    t.down(2, { x: 10, y: 0 })
    expect(t.pair()).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    expect(t.move(3, { x: 1, y: 1 })).toBe(false)
    expect(t.move(2, { x: 20, y: 0 })).toBe(true)
    expect(t.pair()![1]).toEqual({ x: 20, y: 0 })
    t.up(1)
    expect(t.size).toBe(1)
  })
})
