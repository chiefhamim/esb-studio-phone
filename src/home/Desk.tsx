import { useState, type ReactNode } from 'react'
import { fetchArticle } from '../fetchArticle'
import { newDraft, type Draft } from '../drafts'
import { parseShared } from '../shareIntent'
import PublishedList from './PublishedList'
import {
  IconClipboard,
  IconGlobe,
  IconInbox,
  IconLink,
  IconNewspaper,
  IconPencilSquare,
  IconSparkle,
  IconUpload
} from '../shell/icons'

type Mode = 'link' | 'text' | 'published' | 'wire'

const TABS: { id: Mode; label: string; icon: ReactNode; planned?: boolean }[] = [
  { id: 'link', label: 'Story Link', icon: <IconLink /> },
  { id: 'text', label: 'Story Text', icon: <IconPencilSquare /> },
  { id: 'published', label: 'Published', icon: <IconGlobe /> },
  { id: 'wire', label: 'Wire', icon: <IconInbox />, planned: true }
]

/** Editorial Story Desk: mobile-first intake with auto-detecting clipboard paste. */
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
      const raw = await navigator.clipboard.readText()
      const s = parseShared(raw)
      if (!s) {
        setMsg('The clipboard is empty. Copy an article link or text first.')
        return
      }

      // Auto-detect link vs body text
      if (s.url && (s.url.startsWith('http://') || s.url.startsWith('https://'))) {
        setUrl(s.url)
        setMode('link')
        setLinkOnly(false)
        setMsg('Pasted article link from clipboard.')
      } else if (s.text) {
        setText(s.text)
        setMode('text')
        setMsg('Pasted story text from clipboard.')
      } else {
        setMsg('Clipboard content could not be recognized.')
      }
    } catch {
      setMsg('Permission needed to read clipboard. Long-press the field and tap Paste.')
    }
  }

  async function fetchAndProcess() {
    setMsg('')
    const u = url.trim()
    if (!u) return
    setBusy(true)
    const r = await fetchArticle(u)
    setBusy(false)
    if (!r.ok) {
      setMsg((r.reason ?? 'Could not fetch.').replace('Paste the article text below instead.', 'Use the Story Text tab instead, or start with the link only.'))
      setLinkOnly(true)
      return
    }
    onCreate(newDraft(u, r.text ?? ''))
  }

  function startFromText() {
    const t = text.trim()
    if (!t) { setMsg('Paste the article text first.'); return }
    onCreate(newDraft('', t))
  }

  const planned = TABS.find((t) => t.id === mode)?.planned

  return (
    <div className="hm-deskwrap" style={{ paddingBottom: 'calc(var(--sp-9) + var(--sp-6))' }}>
      <section className="hm-card" aria-labelledby="hm-desk-h">
        <div className="hm-hero2" style={{ padding: 'var(--sp-4) var(--sp-4) var(--sp-2)' }}>
          <h1 id="hm-desk-h" style={{ fontSize: 22, lineHeight: '28px', margin: 0 }}>Editorial Story Desk</h1>
          <p style={{ margin: 'var(--sp-1) 0 0', fontSize: 13, lineHeight: '18px', color: 'var(--text-secondary)' }}>
            Translate Bengali reporting into newsroom English, verify figures against the source, and publish.
          </p>
        </div>

        <div className="hm-tabs" role="tablist" aria-label="Intake mode" style={{ margin: '0 var(--sp-4) var(--sp-3)' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="hm-tab"
              aria-selected={mode === t.id}
              onClick={() => { setMode(t.id); setMsg(''); setLinkOnly(false) }}
              style={{ minHeight: 44 }}
            >
              {t.icon}<span>{t.label}</span>{t.planned && <small>Planned</small>}
            </button>
          ))}
        </div>

        {mode === 'link' && (
          <div className="hm-stage" style={{ padding: '0 var(--sp-4)' }}>
            <div className="hm-stage-text">
              <span className="hm-kicker">Article link</span>
              <h2 style={{ fontSize: 18, margin: '4px 0' }}>Paste a news story link</h2>
              <p className="hm-hint">Any Bengali or English energy news report.</p>
            </div>
            <div className="hm-row" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <label className="hm-field" style={{ minHeight: 48 }}>
                <IconLink />
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="off"
                  placeholder="https://..."
                  aria-label="Article link"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setLinkOnly(false); setMsg('') }}
                  style={{ fontSize: 16 }}
                />
                <button type="button" className="hm-paste" onClick={() => void clip()} aria-label="Paste from clipboard">
                  <IconClipboard />Paste
                </button>
              </label>

              <button
                type="button"
                className="kit-btn kit-btn-primary"
                style={{ width: '100%', minHeight: 48 }}
                disabled={!url.trim() || busy}
                onClick={() => void fetchAndProcess()}
              >
                <IconSparkle />
                <span>{busy ? 'Working…' : 'Fetch & Process'}</span>
              </button>

              {linkOnly && (
                <button
                  type="button"
                  className="kit-btn kit-btn-tonal"
                  style={{ width: '100%' }}
                  onClick={() => onCreate(newDraft(url.trim(), ''))}
                >
                  Start with the link only
                </button>
              )}
            </div>
            {msg && <p className="hm-msg" role="status" style={{ marginTop: 'var(--sp-2)' }}>{msg}</p>}
          </div>
        )}

        {mode === 'text' && (
          <div className="hm-stage" style={{ padding: '0 var(--sp-4)' }}>
            <div className="hm-stage-text">
              <span className="hm-kicker">Article text</span>
              <h2 style={{ fontSize: 18, margin: '4px 0' }}>Paste the story text</h2>
              <p className="hm-hint">Bengali or English. File import is Planned.</p>
            </div>
            <div className="hm-row" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <textarea
                className="kit-textarea"
                lang="bn"
                rows={7}
                aria-label="Article text"
                placeholder="এখানে সংবাদের মূল লেখা পেস্ট করুন (বাংলা বা ইংরেজি)"
                value={text}
                onChange={(e) => { setText(e.target.value); setMsg('') }}
                style={{ resize: 'none' }}
              />
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="kit-btn kit-btn-tonal"
                  style={{ flex: 1 }}
                  onClick={() => void clip()}
                >
                  <IconClipboard />Paste
                </button>
                <button
                  type="button"
                  className="kit-btn kit-btn-primary"
                  style={{ flex: 1.5 }}
                  disabled={!text.trim()}
                  onClick={startFromText}
                >
                  <IconSparkle />Start story
                </button>
              </div>
            </div>
            {msg && <p className="hm-msg" role="status" style={{ marginTop: 'var(--sp-2)' }}>{msg}</p>}
          </div>
        )}

        {mode === 'published' && <PublishedList onOpen={onCreate} />}

        {planned && (
          <div className="hm-planned" style={{ padding: 'var(--sp-5) var(--sp-4)', textAlign: 'center' }}>
            <strong>{TABS.find((t) => t.id === mode)?.label}: Planned</strong>
            <p className="hm-hint">Not built in the phone app yet. The desktop app has it.</p>
          </div>
        )}

        <ol className="hm-pipe" aria-label="What happens next" style={{ margin: 'var(--sp-5) var(--sp-4) var(--sp-4)' }}>
          <li className="parse"><span className="hm-pipe-ic"><IconNewspaper /></span><b>Parse</b><small>Text &amp; photos extracted</small></li>
          <li className="polish"><span className="hm-pipe-ic"><IconSparkle /></span><b>Polish</b><small>AI refines for newsroom</small></li>
          <li className="publish"><span className="hm-pipe-ic"><IconUpload /></span><b>Publish</b><small>Review &amp; go live</small></li>
        </ol>
      </section>
    </div>
  )
}
