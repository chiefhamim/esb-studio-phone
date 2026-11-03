import { useState, type ReactNode } from 'react'
import { fetchArticle } from '../fetchArticle'
import { newDraft, type Draft } from '../drafts'
import { parseShared } from '../shareIntent'
import PublishedList from './PublishedList'
import { IconClipboard, IconGlobe, IconInbox, IconLink, IconNewspaper, IconPencilSquare, IconSparkle, IconUpload } from '../shell/icons'

type Mode = 'link' | 'text' | 'published' | 'wire'
const TABS: { id: Mode; label: string; icon: ReactNode; planned?: boolean }[] = [
  { id: 'link', label: 'Paste Story Link', icon: <IconLink /> },
  { id: 'text', label: 'Paste Text or File', icon: <IconPencilSquare /> },
  { id: 'published', label: 'Published', icon: <IconGlobe /> },
  { id: 'wire', label: 'Wire', icon: <IconInbox />, planned: true },
]

/** Editorial Story Desk: the desktop's intake card on a phone. Link fetching stays honest (src/fetchArticle.ts). */
export default function Desk({ onCreate }: { onCreate: (d: Draft) => void }) {
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkOnly, setLinkOnly] = useState(false)

  async function clip(): Promise<void> {
    setMsg('')
    try {
      const s = parseShared(await navigator.clipboard.readText())
      if (!s) { setMsg('The clipboard is empty. Copy the article link or text first.'); return }
      if (mode === 'link') { if (s.url) setUrl(s.url); else setMsg('No link found on the clipboard.') }
      else { if (s.text) setText(s.text); else setMsg('No text found on the clipboard.') }
      setLinkOnly(false)
    } catch {
      setMsg('This phone did not allow reading the clipboard. Long-press in the field and choose Paste.')
    }
  }

  async function fetchAndProcess() {
    setMsg('')
    const u = url.trim()
    if (!u) return
    setBusy(true)
    const r = await fetchArticle(u)
    setBusy(false)
    if (!r.ok) { setMsg((r.reason ?? 'Could not fetch.').replace('Paste the article text below instead.', 'Use the Paste Text or File tab instead, or start with the link only.')); setLinkOnly(true); return }
    onCreate(newDraft(u, r.text ?? ''))
  }

  function startFromText() {
    const t = text.trim()
    if (!t) { setMsg('Paste the article text first.'); return }
    onCreate(newDraft('', t))
  }

  const planned = TABS.find((t) => t.id === mode)?.planned

  return (
    <div className="hm-deskwrap">
      <section className="hm-card" aria-labelledby="hm-desk-h">
        <div className="hm-hero2">
          <h1 id="hm-desk-h">Editorial Story Desk</h1>
          <p>Translate Bengali reporting into newsroom English, check every figure against the source, and publish to esbpowerline.com.</p>
        </div>
        <div className="hm-tabs" role="tablist" aria-label="Where the story comes from">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className="hm-tab" aria-selected={mode === t.id} onClick={() => { setMode(t.id); setMsg(''); setLinkOnly(false) }}>
              {t.icon}<span>{t.label}</span>{t.planned && <small>Planned</small>}
            </button>
          ))}
        </div>

        {mode === 'link' && (
          <div className="hm-stage">
            <div className="hm-stage-text">
              <span className="hm-kicker">Article link</span>
              <h2>Paste a news story link</h2>
              <p className="hm-hint">Any Bengali or English news site. Paste it here.</p>
            </div>
            <div className="hm-row">
              <label className="hm-field">
                <IconLink />
                <input type="url" inputMode="url" autoComplete="off" autoCapitalize="off" placeholder="https://..." aria-label="Article link" value={url} onChange={(e) => { setUrl(e.target.value); setLinkOnly(false); setMsg('') }} />
                <button type="button" className="hm-paste" onClick={() => void clip()}><IconClipboard />Paste</button>
              </label>
              <button type="button" className="hm-go" disabled={!url.trim() || busy} onClick={() => void fetchAndProcess()}><IconSparkle />{busy ? 'Working…' : 'Fetch & Process'}</button>
              {linkOnly && <button type="button" className="hm-go alt" onClick={() => onCreate(newDraft(url.trim(), ''))}>Start with the link only</button>}
            </div>
            {msg && <p className="hm-msg" role="status">{msg}</p>}
          </div>
        )}

        {mode === 'text' && (
          <div className="hm-stage">
            <div className="hm-stage-text">
              <span className="hm-kicker">Article text</span>
              <h2>Paste the story text</h2>
              <p className="hm-hint">Bengali or English. File import is Planned.</p>
            </div>
            <div className="hm-row">
              <textarea className="hm-ta" lang="bn" rows={8} aria-label="Article text" placeholder="এখানে সংবাদের মূল লেখা পেস্ট করুন (বাংলা বা ইংরেজি)" value={text} onChange={(e) => { setText(e.target.value); setMsg('') }} />
              <button type="button" className="hm-go alt" onClick={() => void clip()}><IconClipboard />Paste from clipboard</button>
              <button type="button" className="hm-go" disabled={!text.trim()} onClick={startFromText}><IconSparkle />Start story</button>
            </div>
            {msg && <p className="hm-msg" role="status">{msg}</p>}
          </div>
        )}

        {mode === 'published' && <PublishedList onOpen={onCreate} />}

        {planned && (
          <div className="hm-planned">
            <strong>{TABS.find((t) => t.id === mode)?.label}: Planned</strong>
            <p className="hm-hint">Not built in the phone app yet. The desktop app has it.</p>
          </div>
        )}

        <ol className="hm-pipe" aria-label="What happens next">
          <li className="parse"><span className="hm-pipe-ic"><IconNewspaper /></span><b>Parse</b><small>Text &amp; photos are extracted</small></li>
          <li className="polish"><span className="hm-pipe-ic"><IconSparkle /></span><b>Polish</b><small>AI refines it for the newsroom</small></li>
          <li className="publish"><span className="hm-pipe-ic"><IconUpload /></span><b>Publish</b><small>Review &amp; publish right away</small></li>
        </ol>
      </section>
    </div>
  )
}
