// Graphics screen hooks: base-asset loading with retry, PC portals inside the PC style scope, the Dock's tab.
import { useCallback, useEffect, useState } from 'react'
import { loadBaseAssets } from '../../pc/core/assets'
import type { Assets } from '../../pc/core/render'

// ---------------------------------------------------------------- base assets (fonts + logo) with retry
export type AssetState = { kind: 'loading' } | { kind: 'ready'; base: Assets } | { kind: 'error'; message: string }
export function useBaseAssets(): [AssetState, () => void] {
  const [state, setState] = useState<AssetState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setState({ kind: 'loading' })
    loadBaseAssets()
      .then((base) => { if (alive) setState({ kind: 'ready', base }) })
      .catch((e) => { if (alive) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }) })
    return () => { alive = false }
  }, [attempt])
  // the PC caches its font promise, a failed font load needs a fresh start of the page
  const retry = useCallback(() => { if (attempt > 0) window.location.reload(); else setAttempt((a) => a + 1) }, [attempt])
  return [state, retry]
}

// ---------------------------------------------------------------- PC popovers / dialogs portal into <body>
const PORTAL_CLASSES = ['popover', 'modal-bg', 'tooltip']

/** Marks every PC portal in <body> as a PC host (touch sizes included) while Graphics is mounted. */
export function usePcPortals() {
  useEffect(() => {
    // styling of portals comes from tools/pc-css-scope.ts (body scope); here they only get the touch sizes
    const mark = (n: Node) => {
      if (!(n instanceof HTMLElement) || n.classList.contains('gx-portal')) return
      if (PORTAL_CLASSES.some((c) => n.classList.contains(c))) n.classList.add('pc-host', 'pc-touch', 'gx-portal')
    }
    document.body.childNodes.forEach(mark)
    const mo = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(mark)))
    mo.observe(document.body, { childList: true })
    return () => mo.disconnect()
  }, [])
}

export function setDockTab(t: 'elements' | 'layers') { try { localStorage.setItem('esb-banner-studio/dock-tab', t) } catch { /* ignore */ } }
