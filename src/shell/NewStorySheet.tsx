import { useState } from 'react'
import { FETCH_CONNECTED, fetchArticle } from '../fetchArticle'
import { newDraft, type Draft } from '../drafts'
import { parseShared } from '../shareIntent'
import { IconClipboard, IconClose, IconLink } from './icons'
import { useBackClose } from './back'

/** Bottom sheet for starting a story: paste from the clipboard, a link, or the article text. */
export default function NewStorySheet({ onClose, onCreate }: { onClose: () => void; onCreate: (d: Draft) => void }) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkOnly, setLinkOnly] = useState(false)
  useBackClose(true, onClose)

  async function paste() {
    setMsg('')
    try {
      const raw = await navigator.clipboard.readText()
      const s = parseShared(raw)
      if (!s) { setMsg('The clipboard is empty. Copy the article link or text first.'); return }
      if (s.url) setUrl(s.url)
      if (s.text) setText(s.text)
    } catch {
      setMsg('This phone did not allow reading the clipboard. Long-press in a field below and choose Paste.')
    }
  }

  async function start() {
    setMsg('')
    const u = url.trim()
    const t = text.trim()
    if (!u && !t) { setMsg('Paste a link or the article text first.'); return }
    if (!t && u) {
      setBusy(true)
      const r = await fetchArticle(u)
      setBusy(false)
      if (!r.ok) { setMsg(r.reason ?? 'Could not fetch.'); setLinkOnly(true); return }
      onCreate(newDraft(u, r.text ?? ''))
      return
    }
    onCreate(newDraft(u, t))
  }

  return (
    <div className="sh-scrim" onClick={onClose}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-labelledby="sh-new-h" onClick={(e) => e.stopPropagation()}>
        <div className="sh-grab" aria-hidden />
        <div className="sh-sheet-head">
          <h2 id="sh-new-h">New story</h2>
          <button type="button" className="sh-ibtn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <button type="button" className="sh-paste" onClick={paste}><IconClipboard /><span>Paste from clipboard</span></button>
        <label className="sh-field">
          <span><IconLink /> Article link</span>
          <input type="url" inputMode="url" autoComplete="off" placeholder="https://" value={url} onChange={(e) => { setUrl(e.target.value); setLinkOnly(false) }} />
        </label>
        {!FETCH_CONNECTED && <p className="sh-hint">Link fetching is not connected yet. A link is kept as the source, but paste the article text below to translate it.</p>}
        <label className="sh-field">
          <span>Article text</span>
          <textarea lang="bn" rows={5} placeholder="এখানে সংবাদের মূল লেখা পেস্ট করুন (বাংলা বা ইংরেজি)" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {msg && <p className="sh-msg" role="status">{msg}</p>}
        <div className="sh-sheet-actions">
          {linkOnly && <button type="button" className="sh-btn" onClick={() => onCreate(newDraft(url.trim(), ''))}>Start with the link only</button>}
          <button type="button" className="sh-btn sh-btn-primary" onClick={start} disabled={busy}>{busy ? 'Working…' : 'Start story'}</button>
        </div>
      </div>
    </div>
  )
}
