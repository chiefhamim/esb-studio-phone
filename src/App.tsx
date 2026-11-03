import { useState } from 'react'
import { useDrafts, type Draft } from './drafts'
import Stories from './Stories'
import Edit from './Edit'

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
  const cur = TABS.find((t) => t.id === tab)!

  return (
    <div className="phone">
      <header className="phone-head"><b>ESB Studio</b><span>Phone</span></header>
      <main className="phone-main">
        {tab === 'stories' && <Stories drafts={drafts} onOpen={open} onCreate={create} onRemove={(id) => { remove(id); if (id === currentId) setCurrentId(null) }} />}
        {tab === 'edit' && <Edit draft={current} onChange={upsert} />}
        {(tab === 'banner' || tab === 'publish') && (
          <>
            <h1>{cur.label}</h1>
            <p>{cur.note}</p>
            <p className="planned">Planned. Not built yet.</p>
          </>
        )}
      </main>
      <nav className="phone-nav" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
    </div>
  )
}
