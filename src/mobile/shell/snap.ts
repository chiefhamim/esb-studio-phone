// Magnetic lists: a scroller with `scroll-snap-type: y mandatory` (design.css, "magnetic lists") settles with a whole row
// at its top edge. Its far end is rarely a row edge, so the last stop could still show a sliver of the row above.
// useSnapTail stretches the scroller's bottom padding just enough that the end of the scroll IS a row edge.
// It sets padding on the scroller itself (no extra DOM node inside React's children).
import { useLayoutEffect, type RefObject } from 'react'

export function useSnapTail(ref: RefObject<HTMLElement | null>, itemSelector: string, deps: unknown[]): void {
  useLayoutEffect(() => {
    const sc = ref.current
    if (!sc) return
    // Only the content and the window are watched, never the scroller's own box: changing its padding resizes that box
    // and would loop.
    const fit = () => {
      if (sc.offsetParent === null) return // a hidden pane: its content resizes from 0 when it shows, which runs this again
      sc.style.removeProperty('padding-bottom')
      const base = parseFloat(getComputedStyle(sc).paddingBottom) || 0
      const max = sc.scrollHeight - sc.clientHeight
      if (max > 0) {
        const pad = parseFloat(getComputedStyle(sc).scrollPaddingTop) || 0
        const origin = sc.getBoundingClientRect().top - sc.scrollTop
        const snaps = [...sc.querySelectorAll<HTMLElement>(itemSelector)].map((el) => el.getBoundingClientRect().top - origin - pad)
        const next = snaps.find((p) => p >= max - 1)
        if (next != null && next - max > 0.5) sc.style.setProperty('padding-bottom', `${base + Math.ceil(next - max)}px`, 'important')
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    for (const c of sc.children) ro.observe(c)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); sc.style.removeProperty('padding-bottom') }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
