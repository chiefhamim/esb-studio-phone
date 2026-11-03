import { useState } from 'react'

type Tab = 'stories' | 'edit' | 'banner' | 'publish'
const TABS: { id: Tab; label: string; note: string }[] = [
  { id: 'stories', label: 'Stories', note: 'Your drafts, and the link you paste or share to this app.' },
  { id: 'edit', label: 'Edit', note: 'Headline, deck and body in English, next to the Bangla source.' },
  { id: 'banner', label: 'Banner', note: 'The story banner, shared to WhatsApp or saved to the gallery.' },
  { id: 'publish', label: 'Publish', note: 'Review, then publish to esbpowerline.com and Facebook.' },
]

/** The phone shell. Every screen is Planned until it is built: nothing here pretends to work. */
export default function App() {
  const [tab, setTab] = useState<Tab>('stories')
  const cur = TABS.find((t) => t.id === tab)!
  return (
    <div className="phone">
      <header className="phone-head"><b>ESB Studio</b><span>Phone</span></header>
      <main className="phone-main">
        <h1>{cur.label}</h1>
        <p>{cur.note}</p>
        <p className="planned">Planned. Not built yet.</p>
      </main>
      <nav className="phone-nav" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
    </div>
  )
}
