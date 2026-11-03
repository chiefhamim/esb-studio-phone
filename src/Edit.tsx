import { useState } from 'react'
import type { Draft } from './drafts'

interface Props {
  draft: Draft | null
  onChange: (d: Draft) => void
}

export default function Edit({ draft, onChange }: Props) {
  const [showSource, setShowSource] = useState(false)
  if (!draft) return (<><h1>Edit</h1><p>Open or start a story in Stories first.</p></>)
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  return (
    <>
      <h1>Edit</h1>
      <p className="saved" role="status">Saved on this phone · {new Date(draft.updatedAt).toLocaleTimeString()}</p>
      <section className="card">
        <label htmlFor="ed-head">Headline</label>
        <input id="ed-head" value={draft.headline} onChange={(e) => set({ headline: e.target.value })} />
        <label htmlFor="ed-deck">Deck</label>
        <textarea id="ed-deck" rows={2} value={draft.deck} onChange={(e) => set({ deck: e.target.value })} />
        <label htmlFor="ed-body">Body</label>
        <textarea id="ed-body" rows={12} value={draft.body} onChange={(e) => set({ body: e.target.value })} />
        <p className="count">{draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0} words</p>
      </section>
      <button type="button" className="secondary" aria-expanded={showSource} onClick={() => setShowSource((v) => !v)}>
        {showSource ? 'Hide source' : 'Show source'}
      </button>
      {showSource && (
        <section className="card source" lang="bn">
          {draft.sourceUrl && <p className="note">{draft.sourceUrl}</p>}
          <textarea aria-label="Source text" rows={10} value={draft.source} onChange={(e) => set({ source: e.target.value })} />
        </section>
      )}
      <p className="note">Translation to English is Planned. Write or paste the English yourself for now.</p>
    </>
  )
}
