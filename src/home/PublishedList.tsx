import { useState } from 'react'
import { usePublished } from '../sync/published'
import type { Draft } from '../drafts'
import { tap, warn } from '../native/haptics'

/** The Desk's Published tab: the site's recent stories (read through the signed-in session); open one to update it. */
export default function PublishedList({ onOpen }: { onOpen: (d: Draft) => void }) {
  const p = usePublished(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function open(id: string) {
    setMsg(''); setBusy(id); tap()
    const r = await p.open(id)
    setBusy(null)
    if (!r.ok) { warn(); setMsg(r.error); return }
    onOpen(r.draft)
  }

  return (
    <div className="hm-pub">
      {p.status === 'loading' && <p className="hm-hint" role="status">Loading the site's stories…</p>}
      {p.status === 'error' && (
        <div className="hm-planned" role="status">
          <strong>{p.offline ? 'Offline' : 'Could not load the stories'}</strong>
          <p className="hm-hint">{p.error}</p>
          <button type="button" className="hm-go alt" onClick={p.reload}>Try again</button>
        </div>
      )}
      {p.status === 'ready' && p.items.length === 0 && <p className="hm-hint">The site has no stories yet.</p>}
      {p.status === 'ready' && p.items.length > 0 && (
        <ul className="hm-publist">
          {p.items.map((it) => (
            <li key={it.id}>
              <button type="button" className="hm-pubitem" disabled={busy !== null} onClick={() => void open(it.id)}>
                <b>{it.title || 'Untitled'}</b>
                <span>
                  <i className={`hm-pubchip ${it.status === 'PUBLISHED' ? 'live' : ''}`}>{it.status === 'PUBLISHED' ? 'Live' : 'Draft'}</i>
                  {it.category}{it.updatedAt ? ` · ${new Date(it.updatedAt).toLocaleDateString()}` : ''}
                </span>
                {busy === it.id && <small>Opening…</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="hm-msg" role="status">{msg}</p>}
    </div>
  )
}
