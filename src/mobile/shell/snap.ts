// Magnetic lists (Home, Stories, Published, News). A fling keeps the WebView's own speed and momentum: there is no CSS
// scroll-snap, because Chrome shortens flings in a snapping scroller (mandatory held one to a row or two, proximity
// still felt slow). When the scroll comes to rest, the list eases to the nearest row edge, so a whole row sits at the
// top and never half of one.
// The far end of a list is rarely a row edge, so the bottom padding is stretched just enough that it is one.
// Both act on the scroller itself (no extra DOM node inside React's children).
import { useLayoutEffect, type RefObject } from 'react'

export function useSnapTail(ref: RefObject<HTMLElement | null>, itemSelector: string, deps: unknown[]): void {
  useLayoutEffect(() => {
    const sc = ref.current
    if (!sc) return

    /** Scroll positions that put a row's top at the scroller's top edge (0, the top of the list, is always one). */
    const stops = (): number[] => {
      const origin = sc.getBoundingClientRect().top - sc.scrollTop
      return [0, ...[...sc.querySelectorAll<HTMLElement>(itemSelector)].map((el) => el.getBoundingClientRect().top - origin)]
    }

    const fit = () => {
      if (sc.offsetParent === null) return // a hidden pane: its content resizes from 0 when it shows, which runs this again
      sc.style.removeProperty('padding-bottom')
      const base = parseFloat(getComputedStyle(sc).paddingBottom) || 0
      const max = sc.scrollHeight - sc.clientHeight
      if (max <= 0) return
      const next = stops().find((p) => p >= max - 1)
      if (next != null && next - max > 0.5) sc.style.setProperty('padding-bottom', `${base + Math.ceil(next - max)}px`, 'important')
    }

    // the settle: only after the finger is up and the momentum has run out
    let touching = false
    let idle = 0
    const settle = () => {
      if (touching || sc.offsetParent === null) return
      const max = sc.scrollHeight - sc.clientHeight
      if (max <= 0) return
      const at = sc.scrollTop
      let best = at, gap = Infinity
      for (const p of stops()) {
        const q = Math.min(Math.max(p, 0), max)
        if (Math.abs(q - at) < gap) { gap = Math.abs(q - at); best = q }
      }
      if (gap > 1) sc.scrollTo({ top: best, behavior: 'smooth' })
    }
    const hasScrollEnd = 'onscrollend' in window
    const onScroll = () => { window.clearTimeout(idle); idle = window.setTimeout(settle, 140) } // older WebViews without scrollend
    const down = () => { touching = true; window.clearTimeout(idle) }
    const up = () => { touching = false; if (!hasScrollEnd) onScroll() }

    fit()
    const ro = new ResizeObserver(fit)
    for (const c of sc.children) ro.observe(c)
    // the scroller's outer box too (a pane that slides in or a bar that changes height): its border box does not change
    // when fit() sets the padding, so this cannot loop
    ro.observe(sc, { box: 'border-box' })
    window.addEventListener('resize', fit)
    sc.addEventListener('touchstart', down, { passive: true })
    sc.addEventListener('touchend', up, { passive: true })
    sc.addEventListener('touchcancel', up, { passive: true })
    if (hasScrollEnd) sc.addEventListener('scrollend', settle)
    else sc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect(); window.removeEventListener('resize', fit); window.clearTimeout(idle)
      sc.removeEventListener('touchstart', down); sc.removeEventListener('touchend', up); sc.removeEventListener('touchcancel', up)
      sc.removeEventListener('scrollend', settle); sc.removeEventListener('scroll', onScroll)
      sc.style.removeProperty('padding-bottom')
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
