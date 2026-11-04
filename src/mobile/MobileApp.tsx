// ESB Studio Phone: the Android shell around the vendored PC engine and editor.
// Home · Editorial · Graphics (bottom bar on phones, navigation rail from 600 dp). Screens stay mounted so the editor,
// the canvas and their undo history survive switching. Android back: menu -> sheet -> dialog -> screen -> home ->
// minimise (never exits; work is autosaved, and an unfinished job asks first).
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { useStore } from '../pc/store'
import { useEditorialStore } from '../pc/editorial/editorialStore'
import { useStoryQueue } from '../pc/editorial/storyQueue'
import { listenForIncoming } from '../native/shareIn'
import { parseShared } from '../shareIntent'
import LockScreen from '../native/LockScreen'
import { confirmAsk, handleBack, snack, unsavedReason, useBackLayer, useSizeClass, watchKeyboard } from './shell/core'
import { useNav, type Route } from './shell/nav'
import { useDesk } from './editorial/deskStore'
import type { HomeTab } from './editorial/deskStore'
import { useIncoming } from './shell/incoming'
import { NavBar, UiHost, type NavItem } from './shell/ui'
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
import './polish.css' // last: the polish layer wins ties over every screen's own CSS

// Five destinations: the Editorial desk's three lists are first-class (one tap each), Graphics keeps its own workspace.
const NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'ed-stories', label: 'Stories', icon: 'newspaper' },
  { id: 'ed-published', label: 'Published', icon: 'globe' },
  { id: 'ed-wire', label: 'Wire', icon: 'inbox' },
  { id: 'graphics', label: 'Graphics', icon: 'layers' },
]

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
  const onNav = (id: string) => {
    if (id.startsWith('ed-')) { useDesk.getState().set({ homeTab: id.slice(3) as HomeTab, view: 'home', writing: false }); go('editorial') } else go(id as Route)
  }
  const detail = (route === 'editorial' && deskView !== 'home') || route === 'graphics'

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
    if (import.meta.env.DEV) Object.assign(window, { __store: useStore, __editorialStore: useEditorialStore, __queue: useStoryQueue, __nav: useNav })
  }, [])

  return (
    <div className={`m-app${rail ? ' has-rail' : ''}${detail && !rail ? ' m-nav-off' : ''}`} data-size={size}>
      {rail && <NavBar rail items={NAV} value={navValue} onChange={onNav} />}
      <div className="m-screen m-screens">
        <div className="m-screen" hidden={route !== 'home'}><HomeScreen active={route === 'home'} /></div>
        <div className="m-screen" hidden={route !== 'editorial'}><EditorialScreen active={route === 'editorial'} /></div>
        <div className="m-screen" hidden={route !== 'graphics'}><GraphicsScreen active={route === 'graphics'} /></div>
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
