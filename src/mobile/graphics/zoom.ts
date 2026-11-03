// Stage zoom for the phone: the zoom buttons and the pinch keep a screen point fixed (the PC Stage only does that for
// Ctrl+wheel). Uses the PC store's setZoom; the layout is flushed synchronously so the scroll correction is exact.
import { flushSync } from 'react-dom'
import { useStore } from '../../pc/store'
import { anchorScroll, zoomStep } from './pinch'
import type { Pt } from './pinch'

export const canvasRoot = () => document.querySelector<HTMLElement>('.gx-canvas')

export function origin(root: HTMLElement): Pt | null {
  const w = root.querySelector('.stage-wrap')
  if (!w) return null
  const r = w.getBoundingClientRect()
  return { x: r.left, y: r.top }
}

/** Zoom the stage keeping the screen point `at` (default: the canvas centre) fixed. Used by the zoom buttons and the pinch. */
export function zoomCanvas(scale: number | 'fit', at?: Pt, keep?: { m0: Pt; o0: Pt; s0: number }) {
  const root = canvasRoot()
  const st = useStore.getState()
  if (scale === 'fit' || !root) { st.setZoom(scale); return }
  const sc = root.querySelector<HTMLElement>('.stage-scroll')
  const before = origin(root)
  const box = root.getBoundingClientRect()
  const m = at ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  const ref = keep ?? (before ? { m0: m, o0: before, s0: st.scale } : null)
  flushSync(() => st.setZoom(scale))
  const after = origin(root)
  if (!sc || !ref || !after) return
  const d = anchorScroll(ref.m0, ref.o0, ref.s0, m, after, scale)
  sc.scrollLeft += d.x
  sc.scrollTop += d.y
}

export const zoomBy = (dir: 1 | -1) => zoomCanvas(zoomStep(useStore.getState().scale, dir))

