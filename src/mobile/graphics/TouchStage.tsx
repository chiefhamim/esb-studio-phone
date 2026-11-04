// The PC Stage (src/pc/components/Stage.tsx) on a touch screen. The Stage itself does all one-finger editing with
// pointer events exactly as on the PC (select, move with snapping and guides, resize from the handles, marquee, pan a
// photo inside its slot). This wrapper adds the two-finger gesture in the capture phase, before the Stage sees it:
//   * two fingers on the canvas = pinch-zoom the stage about the fingers and pan with them;
//   * two fingers on a photo while the photo block is selected = zoom that photo inside its slot (the PC's wheel zoom).
// One-finger editing is gated so a stray touch cannot move or resize anything: a quick tap selects; a finger that starts moving
// at once does nothing; to move, resize or pan, the finger rests a moment first ("hold, then drag"), with a small buzz when the
// Stage takes over. The gate withholds the pointerdown from the Stage and replays it (tap: down + up; hold: down) when due.
// When the second finger lands, the one-finger edit the Stage had begun is cancelled (and undone if it had moved).
import { useEffect, useRef } from 'react'
import { Stage } from '../../pc/components/Stage'
import type { Assets } from '../../pc/core/render'
import { slotRects } from '../../pc/core/render'
import type { PhotosEl } from '../../pc/core/types'
import { FORMATS } from '../../pc/core/tokens'
import { imageAssets, useStore } from '../../pc/store'
import { boxAt, dist, mid, pinchScale, PHOTO_ZOOM_MAX, PHOTO_ZOOM_MIN, toDesign, TouchSet } from './pinch'
import { origin, zoomCanvas } from './zoom'
import { snack } from '../shell/core'
import type { Pt } from './pinch'

// The PC Stage sizes its bitmap at scale x devicePixelRatio. On this phone (3.5) that is 18 megapixels at 100 % zoom and 40
// at 150 %, reallocated on every zoom step: a 430 ms hitch after zooming back out, and a pinch that crawls. The Stage reads
// window.devicePixelRatio on each draw, so give it a scale-aware value instead (src/pc is vendored and stays untouched):
// the bitmap never exceeds MAX_K canvas pixels per banner pixel (about 4 MP for a 1080x1350 banner), and at the fit zoom,
// where scale x dpr is already below that, nothing changes.
const MAX_K = 1.7
function capStageDpr(): () => void {
  const own = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
  const real = () => (own?.get ? (own.get.call(window) as number) : ((own?.value as number) ?? 1))
  // the store's scale lags one render behind the Stage's draw; the canvas's own layout width is already the new size
  const scaleNow = () => {
    const c = document.querySelector<HTMLCanvasElement>('.gx-canvas canvas.stage-canvas')
    const W = FORMATS[useStore.getState().format]?.w || 1080
    return c && c.offsetWidth > 0 ? c.offsetWidth / W : useStore.getState().scale || 1
  }
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => Math.min(real(), MAX_K / Math.max(0.05, scaleNow())) })
  return () => { if (own) Object.defineProperty(window, 'devicePixelRatio', own); else delete (window as unknown as { devicePixelRatio?: number }).devicePixelRatio }
}

const HOLD_MS = 190 // rest this long before a drag starts editing
const SLOP = 9 // px the finger may wander while resting
let hinted = false // the "hold, then drag" tip is shown once per session

type Gate = { id: number; x: number; y: number; target: Element; state: 'pending' | 'live' | 'dead'; timer: number }

type Gesture =
  | { mode: 'stage'; m0: Pt; o0: Pt; s0: number; d0: number }
  | { mode: 'photo'; slot: number; z0: number; d0: number }

export function TouchStage({ base }: { base: Assets }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => capStageDpr(), [])

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const touches = new TouchSet()
    let g: Gesture | null = null
    let swallow = false // a two-finger gesture happened: keep the Stage out until every finger is up
    let at: { doc: unknown; past: number } | null = null
    let synthetic = false
    let gate: Gate | null = null
    let raf = 0
    let pending: { s: number; m: Pt } | null = null
    const pt = (e: PointerEvent): Pt => ({ x: e.clientX, y: e.clientY })

    /** Hand a (held-back) touch to the Stage as if it had just happened. */
    const replay = (type: 'pointerdown' | 'pointerup', gt: Gate) => {
      synthetic = true
      try {
        gt.target.dispatchEvent(new PointerEvent(type, {
          pointerId: gt.id, pointerType: 'touch', isPrimary: true, clientX: gt.x, clientY: gt.y, bubbles: true, cancelable: true,
          composed: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, pressure: type === 'pointerdown' ? 0.5 : 0, width: 1, height: 1,
        }))
      } catch { /* a Stage handler that needs a live pointer may refuse: nothing to do */ } finally { synthetic = false }
    }
    const dropGate = () => { if (gate) { clearTimeout(gate.timer); gate = null } }

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
      // live: move the canvas with a GPU transform only; the real zoom (one re-render) happens when the fingers lift
      const s1 = pinchScale(g.s0, g.d0, d), m = mid(a, b)
      const wrap = root.querySelector<HTMLElement>('.stage-wrap')
      if (wrap) {
        const r = s1 / g.s0
        wrap.style.transformOrigin = '0 0'
        wrap.style.willChange = 'transform'
        wrap.style.transform = `translate3d(${m.x - g.o0.x - r * (g.m0.x - g.o0.x)}px, ${m.y - g.o0.y - r * (g.m0.y - g.o0.y)}px, 0) scale(${r})`
      }
      pending = { s: s1, m }
    }
    const commit = () => {
      if (!g || g.mode !== 'stage') return
      const wrap = root.querySelector<HTMLElement>('.stage-wrap')
      if (wrap) { wrap.style.transform = ''; wrap.style.transformOrigin = ''; wrap.style.willChange = '' }
      if (pending) zoomCanvas(pending.s, pending.m, g)
      pending = null
    }

    const onDown = (e: PointerEvent) => {
      if (synthetic || e.pointerType !== 'touch') return
      touches.down(e.pointerId, pt(e))
      if (touches.size === 1) {
        const s = useStore.getState()
        at = { doc: s.doc, past: s.past.length }
        // withhold the touch from the Stage until it is clearly a tap or a deliberate hold
        e.stopPropagation()
        const g1: Gate = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target as Element, state: 'pending', timer: 0 }
        g1.timer = window.setTimeout(() => {
          if (gate !== g1 || g1.state !== 'pending' || touches.size !== 1) return
          g1.state = 'live'
          try { navigator.vibrate?.(12) } catch { /* no haptics */ }
          replay('pointerdown', g1)
        }, HOLD_MS)
        gate = g1
        return
      }
      dropGate() // a second finger: this is a pinch, not an edit
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
      const known = touches.move(e.pointerId, pt(e))
      const gt = gate
      if (gt && gt.id === e.pointerId && gt.state !== 'live') {
        e.stopPropagation()
        if (gt.state === 'pending' && Math.hypot(e.clientX - gt.x, e.clientY - gt.y) > SLOP) {
          // the finger started travelling before the hold: a stray swipe, nothing is moved
          gt.state = 'dead'
          clearTimeout(gt.timer)
          if (!hinted) { hinted = true; snack('To move or resize, hold on it a moment, then drag') }
        }
        return
      }
      if (!known || !swallow) return
      e.stopPropagation()
      e.preventDefault()
      if (g && !raf) raf = requestAnimationFrame(apply)
    }
    const onUp = (e: PointerEvent) => {
      if (synthetic || e.pointerType !== 'touch') return
      const had = touches.up(e.pointerId)
      const gt = gate
      if (gt && gt.id === e.pointerId) {
        clearTimeout(gt.timer)
        gate = null
        if (gt.state !== 'live') {
          e.stopPropagation()
          // lifted before the hold and without travelling: a tap, so select what is under the finger
          if (gt.state === 'pending' && e.type === 'pointerup') { replay('pointerdown', gt); replay('pointerup', gt) }
        }
      }
      if (swallow && had) { e.stopPropagation(); e.preventDefault() }
      if (touches.size < 2) { if (raf) { cancelAnimationFrame(raf); apply() } commit(); g = null }
      if (touches.size === 0) { swallow = false; at = null }
    }
    const opts = { capture: true, passive: false } as const
    root.addEventListener('pointerdown', onDown, opts)
    root.addEventListener('pointermove', onMove, opts)
    root.addEventListener('pointerup', onUp, opts)
    root.addEventListener('pointercancel', onUp, opts)
    return () => {
      cancelAnimationFrame(raf)
      dropGate()
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
