// The PC Stage (src/pc/components/Stage.tsx) on a touch screen. The Stage itself does all one-finger editing with
// pointer events exactly as on the PC (select, move with snapping and guides, resize from the handles, marquee, pan a
// photo inside its slot). This wrapper adds the two-finger gesture in the capture phase, before the Stage sees it:
//   * two fingers on the canvas = pinch-zoom the stage about the fingers and pan with them;
//   * two fingers on a photo while the photo block is selected = zoom that photo inside its slot (the PC's wheel zoom).
// When the second finger lands, the one-finger edit the Stage had begun is cancelled (and undone if it had moved).
import { useEffect, useRef } from 'react'
import { Stage } from '../../pc/components/Stage'
import type { Assets } from '../../pc/core/render'
import { slotRects } from '../../pc/core/render'
import type { PhotosEl } from '../../pc/core/types'
import { imageAssets, useStore } from '../../pc/store'
import { boxAt, dist, mid, pinchScale, PHOTO_ZOOM_MAX, PHOTO_ZOOM_MIN, toDesign, TouchSet } from './pinch'
import { origin, zoomCanvas } from './zoom'
import type { Pt } from './pinch'

type Gesture =
  | { mode: 'stage'; m0: Pt; o0: Pt; s0: number; d0: number }
  | { mode: 'photo'; slot: number; z0: number; d0: number }

export function TouchStage({ base }: { base: Assets }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const touches = new TouchSet()
    let g: Gesture | null = null
    let swallow = false // a two-finger gesture happened: keep the Stage out until every finger is up
    let at: { doc: unknown; past: number } | null = null
    let synthetic = false
    let raf = 0
    const pt = (e: PointerEvent): Pt => ({ x: e.clientX, y: e.clientY })

    const begin = () => {
      const pair = touches.pair()
      const o0 = origin(root)
      if (!pair || !o0) return
      const [a, b] = pair
      const m0 = mid(a, b), d0 = dist(a, b)
      const st = useStore.getState()
      const photoEl = st.scene().elements.find((e): e is PhotosEl => e.kind === 'photos' && e.visible)
      if (photoEl && st.selectedIds.length === 1 && st.selectedId === photoEl.id) {
        const i = boxAt(toDesign(m0, o0, st.scale), slotRects(photoEl))
        const slot = st.doc.photos.slots[st.format][i]
        if (i >= 0 && slot?.src && imageAssets[slot.src]) {
          st.record('pinch-photo' + Date.now())
          st.selectSlot(i)
          g = { mode: 'photo', slot: i, z0: slot.zoom || 1, d0 }
          return
        }
      }
      g = { mode: 'stage', m0, o0, s0: st.scale, d0 }
    }

    const apply = () => {
      raf = 0
      const pair = touches.pair()
      if (!g || !pair) return
      const [a, b] = pair
      const d = dist(a, b)
      if (g.mode === 'photo') {
        useStore.getState().setSlot(g.slot, { zoom: pinchScale(g.z0, g.d0, d, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX) }, true)
        return
      }
      zoomCanvas(pinchScale(g.s0, g.d0, d), mid(a, b), g)
    }

    const onDown = (e: PointerEvent) => {
      if (synthetic || e.pointerType !== 'touch') return
      touches.down(e.pointerId, pt(e))
      if (touches.size === 1) {
        const s = useStore.getState()
        at = { doc: s.doc, past: s.past.length }
        return
      }
      e.stopPropagation()
      e.preventDefault()
      if (g || touches.size > 2) return
      // cancel the one-finger edit the Stage started with the first finger
      const first = touches.ids()[0]
      const ov = root.querySelector('.stage-overlay')
      if (ov) {
        synthetic = true
        try { ov.dispatchEvent(new PointerEvent('pointercancel', { pointerId: first, bubbles: true, pointerType: 'touch', isPrimary: true })) } finally { synthetic = false }
      }
      const st = useStore.getState()
      if (at && st.doc !== at.doc && st.past.length > at.past) st.undo()
      swallow = true
      begin()
    }
    const onMove = (e: PointerEvent) => {
      if (synthetic || e.pointerType !== 'touch') return
      if (!touches.move(e.pointerId, pt(e)) || !swallow) return
      e.stopPropagation()
      e.preventDefault()
      if (g && !raf) raf = requestAnimationFrame(apply)
    }
    const onUp = (e: PointerEvent) => {
      if (synthetic || e.pointerType !== 'touch') return
      const had = touches.up(e.pointerId)
      if (swallow && had) { e.stopPropagation(); e.preventDefault() }
      if (touches.size < 2) { if (raf) { cancelAnimationFrame(raf); apply() } g = null }
      if (touches.size === 0) { swallow = false; at = null }
    }
    const opts = { capture: true, passive: false } as const
    root.addEventListener('pointerdown', onDown, opts)
    root.addEventListener('pointermove', onMove, opts)
    root.addEventListener('pointerup', onUp, opts)
    root.addEventListener('pointercancel', onUp, opts)
    return () => {
      cancelAnimationFrame(raf)
      root.removeEventListener('pointerdown', onDown, opts)
      root.removeEventListener('pointermove', onMove, opts)
      root.removeEventListener('pointerup', onUp, opts)
      root.removeEventListener('pointercancel', onUp, opts)
    }
  }, [])

  return (
    <div ref={ref} className="gx-canvas" aria-label="Banner canvas">
      <Stage base={base} />
    </div>
  )
}
