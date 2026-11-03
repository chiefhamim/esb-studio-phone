import { useRef, useState } from 'react'
import type { Draft } from './drafts'
import { translateStory } from './translate'
import { errorMessage } from './aiProviders'
import { BUDGETS } from './charBudgets'

interface Props {
  draft: Draft | null
  onChange: (d: Draft) => void
  onOpenSettings: () => void
}

const over = (n: number, max: number) => n > max

export default function Edit({ draft, onChange, onOpenSettings }: Props) {
  const [showSource, setShowSource] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const abort = useRef<AbortController | null>(null)
  if (!draft) return (<><h1>Edit</h1><p>Open or start a story in Stories first.</p></>)
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })

  async function translate() {
    if (!draft) return
    if (!draft.source.trim()) { setMsg('There is no source text to translate. Open "Show source" and paste it.'); return }
    if ((draft.headline || draft.body).trim() && !confirm('Replace the current English with a new translation?')) return
    abort.current?.abort()
    const ac = new AbortController(); abort.current = ac
    setBusy(true); setMsg(''); setNotes([])
    try {
      const r = await translateStory({ source: draft.source, sourceUrl: draft.sourceUrl }, { signal: ac.signal })
      onChange({ ...draft, headline: r.headline, deck: r.deck, body: r.body, slug: r.slug, category: r.category || draft.category, translated: true })
      setNotes(r.notes)
      setMsg('Translated. This is a draft: read it against the source before publishing.')
    } catch (e) {
      setMsg(ac.signal.aborted ? 'Cancelled.' : errorMessage(e))
    } finally { setBusy(false) }
  }

  const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0
  return (
    <>
      <h1>Edit</h1>
      <p className="saved" role="status">Saved on this phone · {new Date(draft.updatedAt).toLocaleTimeString()}</p>
      <div className="row">
        <button type="button" className="primary" onClick={translate} disabled={busy}>{busy ? 'Translating…' : 'Translate to English'}</button>
        {busy && <button type="button" className="secondary" onClick={() => abort.current?.abort()}>Cancel</button>}
        <button type="button" className="secondary" onClick={onOpenSettings}>AI key</button>
      </div>
      {msg && <p role="status" className="note">{msg}</p>}
      {notes.length > 0 && (
        <section className="card warn" aria-label="Check these before publishing">
          <b>Check before publishing</b>
          <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}
      <section className="card">
        <label htmlFor="ed-head">Headline <span className={over(draft.headline.length, BUDGETS.headline) ? 'over' : 'count'}>{draft.headline.length}/{BUDGETS.headline}</span></label>
        <input id="ed-head" value={draft.headline} onChange={(e) => set({ headline: e.target.value })} />
        <label htmlFor="ed-deck">Deck <span className={over(draft.deck.length, BUDGETS.deck) ? 'over' : 'count'}>{draft.deck.length}/{BUDGETS.deck}</span></label>
        <textarea id="ed-deck" rows={2} value={draft.deck} onChange={(e) => set({ deck: e.target.value })} />
        <label htmlFor="ed-body">Body <span className="count">{words} words</span></label>
        <textarea id="ed-body" rows={12} value={draft.body} onChange={(e) => set({ body: e.target.value })} />
        <label htmlFor="ed-slug">Slug <span className={over(draft.slug.length, BUDGETS.slug) ? 'over' : 'count'}>{draft.slug.length}/{BUDGETS.slug}</span></label>
        <input id="ed-slug" value={draft.slug} autoCapitalize="none" autoCorrect="off" onChange={(e) => set({ slug: e.target.value })} />
      </section>
      <button type="button" className="secondary wide" aria-expanded={showSource} onClick={() => setShowSource((v) => !v)}>
        {showSource ? 'Hide source' : 'Show source'}
      </button>
      {showSource && (
        <section className="card source" lang="bn">
          {draft.sourceUrl && <p className="note">{draft.sourceUrl}</p>}
          <textarea aria-label="Source text" rows={10} value={draft.source} onChange={(e) => set({ source: e.target.value })} />
        </section>
      )}
    </>
  )
}
