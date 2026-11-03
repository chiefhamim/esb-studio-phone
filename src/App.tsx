import { useEffect, useState } from 'react'
import { listenForShares } from './shareIntent'
import { newDraft } from './drafts'
import { useDrafts, type Draft } from './drafts'
import Stories from './Stories'
import Edit from './Edit'
import Settings from './Settings'
import Banner from './banner/Banner'
import Publish from './publish/Publish'

type Tab = 'stories' | 'edit' | 'banner' | 'publish'
const TABS: { id: Tab; label: string; note: string }[] = [
  { id: 'stories', label: 'Stories', note: '' },
  { id: 'edit', label: 'Edit', note: '' },
  { id: 'banner', label: 'Banner', note: 'The story banner, shared to WhatsApp or saved to the gallery.' },
  { id: 'publish', label: 'Publish', note: 'Review, then publish to esbpowerline.com and Facebook.' },
]

/** The phone shell. Stories and Edit work (drafts saved on every edit); Banner and Publish are Planned. */
export default function App() {
  const [tab, setTab] = useState<Tab>('stories')
  const { drafts, upsert, remove } = useDrafts()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const current = drafts.find((d) => d.id === currentId) ?? null

  const open = (d: Draft) => { setCurrentId(d.id); setTab('edit') }
  const create = (d: Draft) => { upsert(d); open(d) }
  useEffect(() => listenForShares((s) => create({ ...newDraft(s.url, s.text) })), []) // eslint-disable-line
  const [settings, setSettings] = useState(false)

  return (
    <div className="phone">
      <header className="phone-head"><b>ESB Studio</b><span>Phone</span><button type="button" className="head-btn" onClick={() => setSettings(true)}>Settings</button></header>
      <main className="phone-main">
        {tab === 'stories' && <Stories drafts={drafts} onOpen={open} onCreate={create} onRemove={(id) => { remove(id); if (id === currentId) setCurrentId(null) }} />}
        {tab === 'edit' && <Edit draft={current} onChange={upsert} onOpenSettings={() => setSettings(true)} />}
        {tab === 'banner' && <Banner draft={current} onChange={upsert} />}
        {tab === 'publish' && <Publish draft={current} onChange={upsert} />}
      </main>
      <nav className="phone-nav" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  )
}
