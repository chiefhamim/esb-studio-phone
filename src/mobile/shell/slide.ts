// Sideways page shifts: when you move between tabs or steps, the page you leave slides out while the next one slides in,
// in the direction you are moving (forward = from the right). Built on the View Transitions API: the browser snapshots the
// outgoing page, React swaps the content inside flushSync, and both halves move together on the compositor (transform only),
// so the shift stays smooth even while the new screen renders. Where the API is missing, or motion is reduced, the change
// simply happens.
import { flushSync } from 'react-dom'
import { useSyncExternalStore } from 'react'

let active: { skipTransition: () => void } | null = null
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())

/** False while a page shift is running. Heavy work (banner previews) waits for it, so the slide keeps every frame. */
export function useSlideSettled(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => active === null)
}

/** True while a slide is running: the screen-level slide in MobileApp stands aside so the two never stack. */
export const isSliding = () => active !== null

const typing = () => { const el = document.activeElement as HTMLElement | null; return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName)) }

/** Close the keyboard first. Android resizes the window when the keyboard opens or closes, and the browser abandons a
 *  running page transition on any resize: leaving Engine with the link field focused cut every slide off after ~3 frames. */
function keyboardClosed(): Promise<void> {
  if (!typing()) return Promise.resolve()
  ;(document.activeElement as HTMLElement).blur()
  const start = window.innerHeight
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (done) return; done = true; window.removeEventListener('resize', onResize); setTimeout(resolve, 60) }
    const onResize = () => { if (window.innerHeight > start) finish() }
    window.addEventListener('resize', onResize)
    setTimeout(finish, 320) // no resize came (keyboard was not open, or already gone)
  })
}

const settledWaiters: (() => void)[] = []
/** Run once no page shift is moving (now, or as soon as the current one lands). */
export function afterSlide(fn: () => void) { if (active === null) fn(); else settledWaiters.push(fn) }

/** scope "flow": moving between the five steps. The title bar (back, menu, step label, track) and the action bar stay put;
 *  only the title text changes and the content slides, like iOS navigation. */
export function slideTo(dir: 1 | -1, update: () => void, scope?: 'flow') {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; skipTransition: () => void } }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return }
  active?.skipTransition() // a second tap mid-slide finishes the first one at once, then slides again
  void keyboardClosed().then(() => {
    const root = document.documentElement
    root.dataset.slide = dir > 0 ? 'fwd' : 'back'
    if (scope) root.dataset.slideScope = scope; else delete root.dataset.slideScope
    const vt = doc.startViewTransition!(() => { flushSync(update) })
    active = vt
    notify()
    const end = () => {
      if (active !== vt) return
      active = null; delete root.dataset.slide; delete root.dataset.slideScope; notify()
      settledWaiters.splice(0).forEach((f) => f())
    }
    vt.finished.then(end, end)
  })
}

/** Direction between two positions in an ordered list (unknown positions count as forward). */
export function dirOf<T>(order: readonly T[], from: T, to: T): 1 | -1 {
  const a = order.indexOf(from), b = order.indexOf(to)
  return a < 0 || b < 0 || b >= a ? 1 : -1
}
