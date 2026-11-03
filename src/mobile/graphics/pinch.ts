// Two-finger pinch / pan math for the Graphics canvas (pure: no DOM, unit-tested in pinch.test.ts).
// The PC Stage owns one-finger editing (select, move, resize, marquee, photo pan); the phone wrapper only adds the
// two-finger gesture on top: zoom the stage about the fingers' midpoint and pan with it, or zoom the photo in a slot.

export interface Pt { x: number; y: number }

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4
export const PHOTO_ZOOM_MIN = 0.1
export const PHOTO_ZOOM_MAX = 6

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** New zoom from the finger spread: start zoom × (current distance / start distance), clamped. */
export function pinchScale(start: number, d0: number, d: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  if (!(d0 > 1) || !(d > 0)) return clamp(start, min, max)
  return clamp(start * (d / d0), min, max)
}

/**
 * Scroll correction that keeps the design point that was under the start midpoint `m0` under the current midpoint `m`.
 * `o0`/`o` are the artboard's top-left on screen before/after the zoom (as laid out, before the correction), `s0`/`s`
 * the scales. Add the result to the scroller's scrollLeft/scrollTop. Moving the fingers together therefore also pans.
 */
export function anchorScroll(m0: Pt, o0: Pt, s0: number, m: Pt, o: Pt, s: number): Pt {
  const px = (m0.x - o0.x) / s0
  const py = (m0.y - o0.y) / s0
  return { x: o.x + px * s - m.x, y: o.y + py * s - m.y }
}

/** Screen point -> design (banner pixel) point for an artboard whose top-left is at `o` and scale `s`. */
export const toDesign = (p: Pt, o: Pt, s: number): Pt => ({ x: (p.x - o.x) / s, y: (p.y - o.y) / s })

/** One step of the zoom buttons (the PC's ×1.25 / ×0.8), clamped. */
export const zoomStep = (scale: number, dir: 1 | -1) => clamp(dir > 0 ? scale * 1.25 : scale * 0.8, ZOOM_MIN, ZOOM_MAX)

/** Index of the box that contains `p`, or -1. */
export function boxAt(p: Pt, boxes: { x: number; y: number; w: number; h: number }[]): number {
  return boxes.findIndex((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
}

/** A touch tracker: which pointers are down and where; decides when a two-finger gesture starts and ends. */
export class TouchSet {
  private pts = new Map<number, Pt>()
  get size() { return this.pts.size }
  down(id: number, p: Pt) { this.pts.set(id, p) }
  move(id: number, p: Pt): boolean { if (!this.pts.has(id)) return false; this.pts.set(id, p); return true }
  up(id: number): boolean { return this.pts.delete(id) }
  has(id: number) { return this.pts.has(id) }
  ids() { return [...this.pts.keys()] }
  /** The first two pointers (in the order they went down). */
  pair(): [Pt, Pt] | null {
    const v = [...this.pts.values()]
    return v.length >= 2 ? [v[0], v[1]] : null
  }
  clear() { this.pts.clear() }
}
