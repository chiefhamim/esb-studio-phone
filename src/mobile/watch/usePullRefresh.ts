// Pull down to refresh, as in most phone apps: at the top of the list, drag down; past the line, let go to refresh.
//
// Smoothness: nothing here re-renders React while the finger moves. The drag moves the list and turns the button's icon
// (transform only, one write per frame through requestAnimationFrame). On release the list springs straight back; the
// refresh runs with the button spinning in place, so no gap stays open above the list. The indicator is the card's own refresh button: it turns with the pull, goes teal past the
// line, and spins while the refresh runs (no second refresh icon). Only a mostly vertical drag that starts at the very top counts, so scrolling and sideways
// swipes are untouched.
import { useEffect, useRef, useState } from 'react'

export const PULL_TRIGGER = 72
const MAX_PULL = 130

export function usePullRefresh(onRefresh: () => Promise<unknown> | void, enabled = true) {
  const host = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const cb = useRef(onRefresh)
  useEffect(() => { cb.current = onRefresh }, [onRefresh])

  useEffect(() => {
    const el = host.current
    const scroller = el?.closest('.m-scroll') as HTMLElement | null
    if (!el || !scroller || !enabled) return
    let startY = 0, startX = 0, active = false, decided = false, dist = 0, frame = 0, armed = false

    const paint = (d: number, animate: boolean) => {
      el.style.transition = animate ? 'transform .45s cubic-bezier(.22, 1, .36, 1)' : 'none'
      el.style.transform = d ? `translate3d(0, ${d}px, 0)` : ''
      const icon = ring.current?.querySelector('svg') as SVGElement | null
      if (icon && !busy) {
        icon.style.transition = animate ? 'transform .42s cubic-bezier(.22, 1, .36, 1)' : 'none'
        icon.style.transform = d ? `rotate(${d * 3.2}deg)` : ''
      }
      ring.current?.classList.toggle('is-armed', d >= PULL_TRIGGER)
    }
    const down = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || scroller.scrollTop > 0) { active = false; return }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX; active = true; decided = false; dist = 0; armed = false
    }
    const move = (e: TouchEvent) => {
      if (!active) return
      const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return
        decided = true
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || scroller.scrollTop > 0) { active = false; return }
      }
      if (dy <= 0) { dist = 0; paint(0, false); return }
      e.preventDefault()
      // rubber band: easy at first, firmer the further it goes
      dist = MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6)))
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(dist, false) })
      if (dist >= PULL_TRIGGER && !armed) { armed = true; navigator.vibrate?.(10) }
      if (dist < PULL_TRIGGER) armed = false
    }
    const up = () => {
      if (!active) return
      active = false
      cancelAnimationFrame(frame); frame = 0
      if (dist >= PULL_TRIGGER) {
        setBusy(true)
        paint(0, true)
        Promise.resolve().then(() => cb.current()).catch(() => undefined).finally(() => { setBusy(false); paint(0, true) })
      } else paint(0, true)
      dist = 0
    }
    scroller.addEventListener('touchstart', down, { passive: true })
    scroller.addEventListener('touchmove', move, { passive: false })
    scroller.addEventListener('touchend', up)
    scroller.addEventListener('touchcancel', up)
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener('touchstart', down)
      scroller.removeEventListener('touchmove', move)
      scroller.removeEventListener('touchend', up)
      scroller.removeEventListener('touchcancel', up)
    }
  }, [enabled, busy])

  return { host, ring, busy }
}
