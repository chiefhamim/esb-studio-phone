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
import Header from './shell/Header'
import Nav, { type Tab } from './shell/Nav'
import { parseShared } from './shareIntent'
import Desk from './home/Desk'
import StatusBar from './home/StatusBar'
import { useStatus, wordCount } from './home/useStatus'
import { handleBack, useBackClose } from './shell/back'
import { useMedia } from './shell/hooks'
import { watchKeyboard } from './shell/keyboard'

/** The phone shell: header, bottom bar (left rail when wide), and two panes (list + editor) from 900 px. */
export default function App() {
  const [tab, setTab] = useState<Tab>('stories')
  const { drafts, upsert, remove } = useDrafts()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const current = drafts.find((d) => d.id === currentId) ?? null
  const [settings, setSettings] = useState(false)
  const [desk, setDesk] = useState(false)
  const wide = useMedia('(min-width: 900px)')
  const status = useStatus(settings)

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
    setDesk(false); setTab(t)
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
  useBackClose(settings, () => setSettings(false))
  useBackClose(desk, () => setDesk(false))
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const h = CapApp.addListener('backButton', () => {
      if (handleBack()) return
      setTab((t) => {
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
  const stories = (
    <Stories drafts={drafts} currentId={currentId} onOpen={open} onAdd={upsert} onEditorial={() => setDesk(true)} onGraphics={newGraphic}
      onRemove={(id) => { remove(id); if (id === currentId) setCurrentId(null) }} />
  )

  return (
    <div className={`sh-app ${wide ? 'sh-wide' : ''} ${!wide && tab === 'stories' && !desk ? 'hm-on' : ''}`}>
      <Header onOpenSettings={() => setSettings(true)} ai={status.ai} />
      <Nav tab={tab} onTab={goTab} />
      <StatusBar status={status} words={words} />
      <div className="sh-panes">
        {wide && <section className="sh-pane-list" aria-label="Stories">{stories}</section>}
        {!wide && tab === 'stories' && !desk ? (
          <main className="sh-pane-main sh-page" key="stories">{stories}</main>
        ) : desk ? (
          <main className="sh-pane-main sh-page hm-deskpane" key="desk"><Desk onCreate={create} /></main>
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
            {shown === 'publish' && current && <Publish draft={current} onChange={upsert} />}
          </main>
        )}
      </div>
      <LockScreen />
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  )
}
