import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { listenForIncoming } from './native/shareIn'
import LockScreen from './native/LockScreen'
import { warn } from './native/haptics'
import { isBlankDraft, newDraft, useDrafts, type Draft } from './drafts'
import Stories from './Stories'
import Edit from './Edit'
import Settings from './Settings'
import Banner from './banner/Banner'
import Publish from './publish/Publish'
import { parseShared } from './shareIntent'
import Desk from './home/Desk'
import StatusBar from './home/StatusBar'
import { useStatus, wordCount } from './home/useStatus'
import { handleBack, useBackClose } from './shell/back'
import { useMedia } from './shell/hooks'
import { watchKeyboard } from './shell/keyboard'
import { getThemePref, nextPref, setThemePref, type ThemePref } from './shell/theme'
import type { Tab } from './shell/Nav'
import { TopAppBar, BottomNav, NavDrawer, AiSheet } from './ui/kit'
import { IconChevronRight } from './shell/icons'
import { isAiPaused } from './aiState'

/** The mobile shell: TopAppBar, BottomNav, NavDrawer, and two panes from 900 px (DeX). */
export default function App() {
  const [tab, setTab] = useState<Tab>('stories')
  const { drafts, upsert, remove } = useDrafts()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const current = drafts.find((d) => d.id === currentId) ?? null
  const [settings, setSettings] = useState(false)
  const [desk, setDesk] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [aiSheet, setAiSheet] = useState(false)
  const [aiPaused, setAiPausedState] = useState(isAiPaused)
  const [themePref, setThemePrefState] = useState<ThemePref>(getThemePref)
  const wide = useMedia('(min-width: 900px)')
  const status = useStatus(settings)

  useEffect(() => {
    const onAiChange = () => setAiPausedState(isAiPaused())
    window.addEventListener('esb-ai-state-change', onAiChange)
    return () => window.removeEventListener('esb-ai-state-change', onAiChange)
  }, [])

  const cycleTheme = () => {
    const n = nextPref(themePref)
    setThemePref(n)
    setThemePrefState(n)
  }

  const open = (d: Draft) => { setDesk(false); setCurrentId(d.id); setTab('edit') }
  const create = (d: Draft) => { upsert(d); open(d) }

  /** Graphics tile: a blank story that opens on the Banner tab */
  const newGraphic = () => {
    const blank = drafts.find(isBlankDraft)
    const d = blank ?? newDraft()
    if (!blank) upsert(d)
    setDesk(false); setCurrentId(d.id); setTab('banner')
  }

  const goTab = (t: Tab) => {
    setDesk(false)
    setTab(t)
    // Edit / Banner / Publish need a story: fall back to the most recent one instead of a dead end
    if (t !== 'stories' && !currentId && drafts[0]) setCurrentId(drafts[0].id)
  }

  useEffect(() => listenForIncoming((inc) => {
    if (inc.action === 'new-story' || inc.action === 'paste-link') { setDesk(true); setTab('stories'); return }
    const s = parseShared(inc.text ?? '')
    if (s) { create({ ...newDraft(s.url, s.text) }); return }
    if (inc.files.length) warn() // shared pictures/PDFs: intake is Planned
  }), []) // eslint-disable-line

  useEffect(() => watchKeyboard(), [])
  useBackClose(drawer, () => setDrawer(false))
  useBackClose(aiSheet, () => setAiSheet(false))
  useBackClose(settings, () => setSettings(false))
  useBackClose(desk, () => setDesk(false))

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const h = CapApp.addListener('backButton', () => {
      if (handleBack()) return
      setTab((t: Tab) => {
        if (t !== 'stories') return 'stories'
        void CapApp.minimizeApp()
        return t
      })
    })
    return () => { void h.then((x) => x.remove()) }
  }, [])

  // Two-pane: the list stays on the left, so "Stories" shows the editor on the right.
  const shown: Tab = wide && tab === 'stories' ? 'edit' : tab
  const words = desk || shown === 'stories' || !current ? 0 : wordCount(current.body || current.source)

  const screenTitle = desk
    ? 'Editorial Story Desk'
    : shown === 'stories'
      ? 'ESB AI Studio'
      : shown === 'edit'
        ? (current?.headline?.trim() ? current.headline : 'Editorial Desk')
        : shown === 'banner'
          ? 'Banner Studio'
          : 'Publish Desk'

  const screenSubtitle = desk
    ? 'Paste link or text'
    : shown === 'stories'
      ? 'Bangladeshi Energy News'
      : shown === 'edit'
        ? (current?.category ? current.category : 'Drafting copy')
        : undefined

  const stories = (
    <Stories
      drafts={drafts}
      currentId={currentId}
      onOpen={open}
      onAdd={upsert}
      onEditorial={() => setDesk(true)}
      onGraphics={newGraphic}
      onRemove={(id) => { remove(id); if (id === currentId) setCurrentId(null) }}
    />
  )

  return (
    <div className={`sh-app ${wide ? 'sh-wide' : ''} ${!wide && tab === 'stories' && !desk ? 'hm-on' : ''}`}>
      <TopAppBar
        title={screenTitle}
        subtitle={screenSubtitle}
        leading={
          desk ? (
            <button
              type="button"
              className="kit-iconbtn"
              onClick={() => setDesk(false)}
              aria-label="Back to Home"
              style={{ transform: 'rotate(180deg)' }}
            >
              <IconChevronRight />
            </button>
          ) : undefined
        }
        onOpenDrawer={() => setDrawer(true)}
        onOpenSettings={() => setSettings(true)}
        onOpenAi={() => setAiSheet(true)}
        onCycleTheme={cycleTheme}
        themePref={themePref}
        ai={status.ai}
        aiPaused={aiPaused}
        aiLabel="Gemini"
      />

      <div className="sh-panes">
        {wide && <section className="sh-pane-list" aria-label="Stories">{stories}</section>}
        {!wide && tab === 'stories' && !desk ? (
          <main className="sh-pane-main sh-page" key="stories">{stories}</main>
        ) : desk ? (
          <main className="sh-pane-main phone-main sh-page hm-deskpane" key="desk"><Desk onCreate={create} /></main>
        ) : (
          <main className="sh-pane-main phone-main sh-page" key={shown}>
            {shown !== 'stories' && !current && (
              <div className="hm-noStory">
                <h1>{shown === 'edit' ? 'Edit' : shown === 'banner' ? 'Banner' : 'Publish'}</h1>
                <p>No story is open. Start one, then come back here.</p>
                <button type="button" className="hm-go" onClick={() => setDesk(true)}>Start a story</button>
              </div>
            )}
            {shown === 'edit' && current && <Edit draft={current} onChange={upsert} onOpenSettings={() => setSettings(true)} onGo={(t) => setTab(t)} />}
            {shown === 'banner' && current && <Banner draft={current} onChange={upsert} />}
            {shown === 'publish' && current && <Publish draft={current} onChange={upsert} onGo={(t) => setTab(t)} />}
          </main>
        )}
      </div>

      <StatusBar status={status} words={words} />

      <BottomNav
        tab={tab}
        onTab={goTab}
        badges={{
          publish: current && !current.headline ? '!' : undefined
        }}
      />

      <NavDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        activeTab={tab}
        onSelectTab={goTab}
        onOpenSettings={() => setSettings(true)}
        cmsConnected={status.connection === 'connected'}
      />

      <AiSheet
        open={aiSheet}
        onClose={() => setAiSheet(false)}
        onOpenSettings={() => {
          setAiSheet(false)
          setSettings(true)
        }}
      />

      <LockScreen />
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  )
}
