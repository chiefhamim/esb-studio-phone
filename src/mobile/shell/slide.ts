// Sideways page shifts: when you move between tabs or steps, the page you leave slides out while the next one slides in,
// in the direction you are moving (forward = from the right). Built on the View Transitions API: the browser snapshots the
// outgoing page, React swaps the content inside flushSync, and both halves move together on the compositor (transform only),
// so the shift stays smooth even while the new screen renders. Where the API is missing, or motion is reduced, the change
// simply happens.
import { flushSync } from 'react-dom'

let active: { skipTransition: () => void } | null = null

/** True while a slide is running: the screen-level slide in MobileApp stands aside so the two never stack. */
export const isSliding = () => active !== null

/** scope "steps": moving between the steps of one story; its header and footer stay put while only the content shifts. */
export function slideTo(dir: 1 | -1, update: () => void, scope?: 'steps') {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; skipTransition: () => void } }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return }
  active?.skipTransition() // a second tap mid-slide finishes the first one at once, then slides again
  const root = document.documentElement
  root.dataset.slide = dir > 0 ? 'fwd' : 'back'
  if (scope) root.dataset.slideScope = scope; else delete root.dataset.slideScope
  const vt = doc.startViewTransition(() => { flushSync(update) })
  active = vt
  const end = () => { if (active === vt) { active = null; delete root.dataset.slide; delete root.dataset.slideScope } }
  vt.finished.then(end, end)
}

/** Direction between two positions in an ordered list (unknown positions count as forward). */
export function dirOf<T>(order: readonly T[], from: T, to: T): 1 | -1 {
  const a = order.indexOf(from), b = order.indexOf(to)
  return a < 0 || b < 0 || b >= a ? 1 : -1
}
