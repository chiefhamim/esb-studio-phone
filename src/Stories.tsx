import { useState } from 'react'
import { fetchArticle } from './fetchArticle'
import { newDraft, type Draft } from './drafts'

interface Props {
  drafts: Draft[]
  onOpen: (d: Draft) => void
  onCreate: (d: Draft) => void
  onRemove: (id: string) => void
}

export default function Stories({ drafts, onOpen, onCreate, onRemove }: Props) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function start() {
    setMsg('')
    let source = text.trim()
    if (!source && url.trim()) {
      setBusy(true)
      const r = await fetchArticle(url.trim())
      setBusy(false)
      if (!r.ok) { setMsg(r.reason ?? 'Could not fetch.'); return }
      source = r.text ?? ''
    }
    if (!source && !url.trim()) { setMsg('Paste a link or the article text first.'); return }
    onCreate(newDraft(url.trim(), source))
    setUrl(''); setText('')
  }

  return (
    <>
      <h1>Stories</h1>
      <section className="card">
        <label htmlFor="src-url">Link</label>
        <input id="src-url" type="url" inputMode="url" autoComplete="off" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        <label htmlFor="src-text">Or paste the article text</label>
        <textarea id="src-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" className="primary" onClick={start} disabled={busy}>{busy ? 'Fetching…' : 'Start a story'}</button>
        {msg && <p role="status" className="note">{msg}</p>}
      </section>
      <h2>Drafts</h2>
      {drafts.length === 0 && <p>No drafts yet.</p>}
      <ul className="drafts">
        {drafts.map((d) => (
          <li key={d.id}>
            <button type="button" className="draft-open" onClick={() => onOpen(d)}>
              <b>{d.headline || 'Untitled draft'}</b>
              <span>{new Date(d.updatedAt).toLocaleString()}</span>
            </button>
            <button type="button" className="draft-del" aria-label={`Delete draft ${d.headline || 'Untitled'}`} onClick={() => { if (confirm('Delete this draft?')) onRemove(d.id) }}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  )
}
