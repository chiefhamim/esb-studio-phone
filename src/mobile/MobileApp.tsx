// ESB Studio Phone: the Android shell around the vendored PC engine and editor.
// Home · Editorial · Graphics (bottom bar on phones, navigation rail from 600 dp). Screens stay mounted so the editor,
// the canvas and their undo history survive switching. Android back: menu -> sheet -> dialog -> screen -> home ->
// minimise (never exits; work is autosaved, and an unfinished job asks first).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { useStore } from '../pc/store'
import { CATEGORIES } from '../pc/core/tokens'
import { useEditorialStore } from '../pc/editorial/editorialStore'
import { useStoryQueue } from '../pc/editorial/storyQueue'
import { listenForIncoming } from '../native/shareIn'
import { parseShared } from '../shareIntent'
import LockScreen from '../native/LockScreen'
import { useUi, confirmAsk, handleBack, snack, unsavedReason, useBackLayer, useSizeClass, watchKeyboard } from './shell/core'
import { useNav, type Route } from './shell/nav'
import { useDesk } from './editorial/deskStore'
import type { HomeTab } from './editorial/deskStore'
import { useIncoming } from './shell/incoming'
import { NavBar, UiHost, type NavItem } from './shell/ui'
import { dirOf, isSliding, slideTo } from './shell/slide'
import { UpdateDialog } from './shell/UpdateDialog'
import AccountSheet from './shell/AccountSheet'
import { startMobileCopy } from './shell/mobileCopy'
import { startSliderReset } from './shell/sliderReset'
import { startTouchGuards } from './shell/touchGuards'
import { startFullValue } from './shell/fullValue'
import { useShellStore } from '../pc/shell/shellStore'
import HomeScreen from './home/HomeScreen'
import EditorialScreen from './editorial/EditorialScreen'
import GraphicsScreen from './graphics/GraphicsScreen'
import SettingsScreen from './settings/SettingsScreen'
import './design.css' // last: the one design file (scales, look, motion, controls) every screen follows

// The bar reads left to right as the work does: find a story (Wire) -> start it (the raised Link button) -> work on it (Stories) -> done (Published).
// Graphics is not a place on its own: a banner belongs to a story, so it is a step inside the story (and a tile on Home); the tablet rail keeps a direct entry.
const NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'ed-wire', label: 'Wire', icon: 'inbox' },
  { id: 'add', label: 'Engine', icon: 'power', primary: true },
  { id: 'ed-stories', label: 'Stories', icon: 'newspaper' },
  { id: 'ed-published', label: 'Published', icon: 'globe' },
]
const RAIL: NavItem[] = [...NAV.filter((n) => !n.primary), { id: 'graphics', label: 'Graphics', icon: 'layers' }]

export default function MobileApp() {
  const size = useSizeClass()
  const route = useNav((s) => s.route)
  const go = useNav((s) => s.go)
  const settingsOpen = useNav((s) => s.settingsOpen)
  const closeSettings = useNav((s) => s.closeSettings)
  const rail = size !== 'compact'
  // a story open on the Editorial desk, and the Graphics workspace, are detail screens: the bottom bar steps aside (Back and the system gesture return)
  const deskView = useDesk((s) => s.view)
  const homeTab = useDesk((s) => s.homeTab)
  const navValue = route === 'editorial' ? 'ed-' + homeTab : route
  // page transitions: the screen you leave slides away while the new one slides in like a card (sideways between destinations, up/down into and out of a detail)
  const ORDER: Route[] = ['home', 'editorial', 'graphics']
  const prevRoute = useRef(route)
  // the heavy part of a screen (canvas fit, connection checks) switches on only after the slide, so the slide itself is never starved of frames
  const [liveRoute, setLive] = useState<Route>(route)
  const screenEls = useRef<Record<Route, HTMLDivElement | null>>({ home: null, editorial: null, graphics: null })
  const dimEl = useRef<HTMLDivElement | null>(null)
  const running = useRef<{ done: () => void } | null>(null)
  // Driven straight from the layout effect with the Web Animations API (no second React render, compositor-only transform/opacity),
  // so the slide starts on the very next frame after a tap.
  useLayoutEffect(() => {
    const from = prevRoute.current
    if (from === route) return
    prevRoute.current = route
    running.current?.done()
    const inEl = screenEls.current[route], outEl = screenEls.current[from], dim = dimEl.current
    // a page shift (slideTo) is already moving the whole page: this screen-level slide stands aside
    if (!inEl || !outEl || !dim || isSliding() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setLive(route); return }
    const dir = route === 'graphics' && from === 'editorial' ? 'up' : from === 'graphics' && route === 'editorial' ? 'down' : ORDER.indexOf(route) > ORDER.indexOf(from) ? 'fwd' : 'back'
    const topIsIn = dir === 'fwd' || dir === 'up'
    const lay = (el: HTMLElement, z: number) => { el.style.cssText = 'opacity:1;position:absolute;inset:0;z-index:' + z + ';background:var(--surface-app);will-change:transform,opacity;' }
    lay(inEl, topIsIn ? 3 : 1); lay(outEl, topIsIn ? 1 : 3); dim.style.zIndex = '2'
    const vertical = dir === 'up' || dir === 'down'
    const o = { duration: vertical ? 340 : 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' as const }
    const T = (x: number, y: number, sc = 1) => 'translate3d(' + x + '%, ' + y + '%, 0) scale(' + sc + ')'
    const fx: Record<string, [Keyframe[], Keyframe[]]> = {
      fwd: [[{ transform: T(7, 0), opacity: 0 }, { transform: T(0, 0), opacity: 1 }], [{ transform: T(0, 0), opacity: 1 }, { transform: T(-7, 0), opacity: 0 }]],
      back: [[{ transform: T(-7, 0), opacity: 0 }, { transform: T(0, 0), opacity: 1 }], [{ transform: T(0, 0), opacity: 1 }, { transform: T(7, 0), opacity: 0 }]],
      up: [[{ transform: T(0, 100) }, { transform: T(0, 0) }], [{ transform: T(0, 0) }, { transform: T(0, -3, 0.95) }]],
      down: [[{ transform: T(0, -3, 0.95) }, { transform: T(0, 0) }], [{ transform: T(0, 0) }, { transform: T(0, 100) }]],
    }
    const anims = [
      inEl.animate(fx[dir][0], o), outEl.animate(fx[dir][1], o),
      dim.animate(!vertical ? [{ opacity: 0 }, { opacity: 0 }] : topIsIn ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], o),
    ]
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      anims.forEach((x) => x.cancel())
      inEl.style.cssText = ''; outEl.style.cssText = ''; dim.style.zIndex = ''
      running.current = null
      setLive(route)
    }
    running.current = { done }
    anims[0].finished.then(done, () => {})
  }, [route]) // eslint-disable-line react-hooks/exhaustive-deps
  const onNav = (id: string) => {
    // the whole page shifts toward the tab you tapped: right of where you are slides in from the right, left from the left
    const here = route === 'home' ? 'home' : route === 'editorial' ? (deskView === 'home' ? 'ed-' + homeTab : 'add') : 'add'
    const run = () => {
      if (id === 'add') { useNav.getState().intendEditorial('paste-link'); return }
      if (id.startsWith('ed-')) { useDesk.getState().set({ homeTab: id.slice(3) as HomeTab, view: 'home', writing: false }); go('editorial') } else go(id as Route)
    }
    if (id === here) { run(); return } // same tab: its own action (Engine focuses the link field), no shift
    slideTo(dirOf(NAV.map((n) => n.id), here, id), run)
  }
  const detail = (route === 'editorial' && deskView !== 'home') || route === 'graphics'
  // the desk colour is applied once the slide has finished: restyling the whole document mid-slide would stall its first frames
  const accentOn = (liveRoute === 'editorial' && deskView !== 'home') || liveRoute === 'graphics'
  // Like the PC: while a story is open, the app's accent (buttons, switches, selected chips) is the desk's colour.
  const catId = useStore((s) => s.doc.content.categoryId)
  useEffect(() => {
    const root = document.documentElement
    const names = ['--accent', '--on-accent', '--accent-soft']
    const clear = () => names.forEach((n) => root.style.removeProperty(n))
    const c = CATEGORIES.find((x) => x.id === catId)
    if (!accentOn || !c) { clear(); return }
    const paint = () => {
      const dark = root.getAttribute('data-theme') === 'dark'
      // light: the desk colour itself; dark: softened toward the surface so it keeps contrast (same recipe as the PC)
      const a = dark ? `color-mix(in oklab, ${c.accent} 62%, #c9c9d1)` : c.accent
      root.style.setProperty('--accent', a)
      root.style.setProperty('--on-accent', dark ? '#14141a' : c.chipText)
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${c.accent} ${dark ? 22 : 12}%, transparent)`)
    }
    paint()
    const mo = new MutationObserver(paint)
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mo.disconnect(); clear() }
  }, [accentOn, catId])

  useEffect(() => watchKeyboard(), [])
  useEffect(() => startSliderReset(), [])
  useEffect(() => startTouchGuards(), [])
  useEffect(() => startFullValue(), [])
  // the PC panels ask for Graphics through their own shell store ("Edit in Graphics"); the phone's navigation answers it
  useEffect(() => useShellStore.subscribe((s, prev) => {
    if (s.graphicsFocus && s.graphicsFocus !== prev.graphicsFocus) {
      s.consumeGraphicsFocus()
      useNav.getState().intendGraphics('photos')
    }
  }), [])
  useEffect(() => startMobileCopy(), []) // the PC panels' help text, in phone wording
  useBackLayer(route !== 'home', () => useNav.getState().back(), 'screen')
  useBackLayer(settingsOpen, closeSettings, 'dialog')

  // the PC Graphics store keeps its own theme for the canvas chrome; the phone's preference drives it
  useEffect(() => {
    const on = (e: Event) => { const t = (e as CustomEvent).detail as 'light' | 'dark'; if (useStore.getState().theme !== t) useStore.setState({ theme: t }) }
    window.addEventListener('esb-theme-applied', on)
    return () => window.removeEventListener('esb-theme-applied', on)
  }, [])

  // a background save that failed is said out loud (never a silent "saved")
  useEffect(() => {
    const on = (e: Event) => snack(`Could not save on the phone: ${String((e as CustomEvent).detail)}`, { tone: 'error', ms: 8000 })
    window.addEventListener('esb-storage-error', on)
    return () => window.removeEventListener('esb-storage-error', on)
  }, [])

  // Android back gesture / button
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const h = CapApp.addListener('backButton', async () => {
      if (handleBack()) return
      const why = unsavedReason()
      if (why && !(await confirmAsk({ title: 'Leave ESB Studio?', body: why, confirm: 'Leave', cancel: 'Stay' }))) return
      void CapApp.minimizeApp()
    })
    return () => { void h.then((x) => x.remove()) }
  }, [])

  // shared into the app from other apps
  useEffect(() => listenForIncoming((inc) => {
    const nav = useNav.getState()
    if (inc.action === 'new-story') { nav.intendEditorial('new'); return }
    if (inc.action === 'paste-link') { nav.intendEditorial('paste-link'); return }
    const s = parseShared(inc.text ?? '')
    const files = inc.files ?? []
    useIncoming.getState().put({ url: s?.url ?? '', text: s?.text ?? '', files })
    const onlyPictures = files.length > 0 && files.every((f) => f.mime.startsWith('image/')) && !s?.url && !s?.text
    if (onlyPictures) nav.intendGraphics('photos')
    else nav.intendEditorial('paste-link')
  }), [])

  // keep the editor's story in the queue when the app goes to the background
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'hidden') useStoryQueue.getState().saveActive() }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  // dev/test handle (never in a release build)
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __store: useStore, __editorialStore: useEditorialStore, __queue: useStoryQueue, __nav: useNav, __desk: useDesk, __ui: useUi })
  }, [])

  return (
    <div className={`m-app${rail ? ' has-rail' : ''}${detail && !rail ? ' m-nav-off' : ''}`} data-size={size}>
      {rail && <NavBar rail items={RAIL} value={navValue} onChange={onNav} />}
      <div className="m-screen m-screens">
        <div className={'m-screen' + (route === 'home' ? '' : ' is-off')} ref={(e) => { screenEls.current.home = e }} inert={route !== 'home'}><HomeScreen active={liveRoute === 'home'} /></div>
        <div className={'m-screen' + (route === 'editorial' ? '' : ' is-off')} ref={(e) => { screenEls.current.editorial = e }} inert={route !== 'editorial'}><EditorialScreen active={liveRoute === 'editorial'} /></div>
        <div className={'m-screen' + (route === 'graphics' ? '' : ' is-off')} ref={(e) => { screenEls.current.graphics = e }} inert={route !== 'graphics'}><GraphicsScreen active={liveRoute === 'graphics'} /></div>
      </div>
      {!rail && <NavBar items={NAV} value={navValue} onChange={onNav} />}
      {settingsOpen && <SettingsScreen onClose={closeSettings} />}
      <AccountSheet />
      <UiHost />
      <LockScreen />
      <UpdateDialog />
    </div>
  )
}
