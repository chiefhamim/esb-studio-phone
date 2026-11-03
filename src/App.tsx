import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { listenForShares } from './shareIntent'
import { newDraft, useDrafts, type Draft } from './drafts'
import Stories from './Stories'
import Edit from './Edit'
import Settings from './Settings'
import Banner from './banner/Banner'
import Publish from './publish/Publish'
import Header from './shell/Header'
import Nav, { type Tab } from './shell/Nav'
import { handleBack, useBackClose } from './shell/back'
import { useMedia } from './shell/hooks'

/** The phone shell: header, bottom bar (left rail when wide), and two panes (list + editor) from 900 px. */
export default function App() {
  const [tab, setTab] = useState<Tab>('stories')
  const { drafts, upsert, remove } = useDrafts()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const current = drafts.find((d) => d.id === currentId) ?? null
  const [settings, setSettings] = useState(false)
  const wide = useMedia('(min-width: 900px)')

  const open = (d: Draft) => { setCurrentId(d.id); setTab('edit') }
  const create = (d: Draft) => { upsert(d); open(d) }
  useEffect(() => listenForShares((s) => create({ ...newDraft(s.url, s.text) })), []) // eslint-disable-line

  useBackClose(settings, () => setSettings(false))
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
  const stories = (
    <Stories drafts={drafts} currentId={currentId} onOpen={open} onCreate={create} onAdd={upsert}
      onRemove={(id) => { remove(id); if (id === currentId) setCurrentId(null) }} />
  )

  return (
    <div className={`sh-app ${wide ? 'sh-wide' : ''}`}>
      <Header onOpenSettings={() => setSettings(true)} />
      <Nav tab={tab} onTab={setTab} />
      <div className="sh-panes">
        {wide && <section className="sh-pane-list" aria-label="Stories">{stories}</section>}
        {!wide && tab === 'stories' ? (
          <main className="sh-pane-main sh-page" key="stories">{stories}</main>
        ) : (
          <main className="sh-pane-main phone-main sh-page" key={shown}>
            {shown === 'edit' && <Edit draft={current} onChange={upsert} onOpenSettings={() => setSettings(true)} onGo={(t) => setTab(t)} />}
            {shown === 'banner' && <Banner draft={current} onChange={upsert} />}
            {shown === 'publish' && <Publish draft={current} onChange={upsert} />}
          </main>
        )}
      </div>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  )
}
