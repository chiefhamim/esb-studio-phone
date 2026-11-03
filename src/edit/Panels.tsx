// Panels of the Edit desk: translate progress, fact check list, find and replace, quotes, readiness.
import { useState } from 'react'
import type { JobState } from './useTranslateJob'
import { phaseLabel } from './useTranslateJob'
import type { FactMark, SourceHit } from './factMap'
import type { Readiness } from '../publish/readiness'
import type { StoryQuote } from './quotes'
import { Sheet } from './ui'

// ---------------------------------------------------------------- translate progress

const STEPS: { id: JobState['phase'][]; label: string }[] = [
  { id: ['preparing'], label: 'Read the source' },
  { id: ['waiting'], label: 'Gemini writes the English' },
  { id: ['checking'], label: 'Compare figures with the source' },
  { id: ['done'], label: 'Draft ready to review' },
]
const ORDER: JobState['phase'][] = ['preparing', 'waiting', 'checking', 'done']

export function TranslateCard({ job, onCancel, onRetry, onSettings, onDismiss }: { job: JobState; onCancel: () => void; onRetry: () => void; onSettings: () => void; onDismiss: () => void }) {
  if (job.phase === 'idle') return null
  const at = ORDER.indexOf(job.phase)
  const running = at >= 0 && job.phase !== 'done'
  const keyProblem = job.error?.code === 'no-key' || job.error?.code === 'bad-key'
  return (
    <section className={`ed-card ed-job ed-job-${job.phase}`} aria-label="Translation" role="status">
      <ol className="ed-steps">
        {STEPS.map((s, i) => {
          const state = job.phase === 'error' || job.phase === 'cancelled' ? (i < Math.max(at, 1) ? 'done' : 'todo') : i < at ? 'done' : i === at ? (job.phase === 'done' ? 'done' : 'now') : 'todo'
          return <li key={i} className={`ed-step ed-step-${state}`}><span className="ed-dot" aria-hidden="true" />{s.label}</li>
        })}
      </ol>
      {running && <div className="ed-bar" aria-hidden="true"><span /></div>}
      <p className={job.phase === 'error' ? 'ed-err' : 'ed-note'}>{phaseLabel(job)}</p>
      <div className="ed-row">
        {running && <button type="button" className="ed-btn" onClick={onCancel}>Cancel</button>}
        {job.phase === 'error' && keyProblem && <button type="button" className="ed-btn ed-btn-primary" onClick={onSettings}>Open Settings</button>}
        {(job.phase === 'error' && !keyProblem) || job.phase === 'cancelled' ? <button type="button" className="ed-btn ed-btn-primary" onClick={onRetry}>Try again</button> : null}
        {job.phase === 'error' && keyProblem && <button type="button" className="ed-btn" onClick={onRetry}>Try again</button>}
        {!running && <button type="button" className="ed-btn ed-btn-quiet" onClick={onDismiss}>Dismiss</button>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- fact check

export interface FactEntry { where: string; mark: FactMark; hit: SourceHit | null }

export function FactPanel({ entries, unplaced, hasSource, onJump }: { entries: FactEntry[]; unplaced: string[]; hasSource: boolean; onJump: (e: FactEntry) => void }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<FactEntry | null>(null)
  const missing = entries.filter((e) => e.mark.status === 'missing')
  const found = entries.length - missing.length
  if (!entries.length && !unplaced.length) return null
  if (!hasSource) return <p className="ed-note">Fact check needs the source text. Paste the source to compare figures.</p>
  const sorted = [...missing, ...entries.filter((e) => e.mark.status === 'found')]
  return (
    <section className="ed-card ed-facts" aria-label="Fact check">
      <button type="button" className="ed-fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ed-fold-t">Figures against the source</span>
        <span className="ed-chip ed-chip-ok">{found} in source</span>
        <span className={`ed-chip ${missing.length + unplaced.length ? 'ed-chip-warn' : 'ed-chip-ok'}`}>{missing.length + unplaced.length} to check</span>
      </button>
      {open && (
        <>
          <p className="ed-note">Green: the same number or month is in the source. Amber: it is not. Green does not prove the sentence is right; read it against the source.</p>
          <ul className="ed-list">
            {sorted.map((e, i) => (
              <li key={i}>
                <button type="button" className={`ed-flag ed-flag-${e.mark.status}`} onClick={() => { if (e.mark.status === 'found' && e.hit) onJump(e); else setShown(e) }}>
                  <b>{e.mark.text}</b>
                  <span>{e.where}</span>
                  <span>{e.mark.status === 'found' ? (e.hit ? 'Show in source' : 'In source') : 'Not in source'}</span>
                </button>
              </li>
            ))}
            {unplaced.map((n, i) => <li key={`u${i}`} className="ed-note">{n}</li>)}
          </ul>
          {shown && <p className="ed-warn" role="status">&ldquo;{shown.mark.text}&rdquo; ({shown.where}) is not in the source. Check it against your reporting or remove it.</p>}
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- find and replace

export interface FindState { query: string; by: string; caseSensitive: boolean; scope: 'english' | 'source'; cur: number }

export function FindBar({ f, onChange, total, onStep, onReplace, onReplaceAll, onClose, lastMsg }: {
  f: FindState; onChange: (p: Partial<FindState>) => void; total: number; onStep: (d: 1 | -1) => void
  onReplace: () => void; onReplaceAll: () => void; onClose: () => void; lastMsg: string
}) {
  return (
    <section className="ed-card ed-find" aria-label="Find and replace">
      <div className="ed-row">
        <input className="ed-input" type="search" aria-label="Find" placeholder="Find" value={f.query} onChange={(e) => onChange({ query: e.target.value, cur: 0 })} autoCapitalize="none" />
        <button type="button" className="ed-btn" onClick={() => onStep(-1)} disabled={!total} aria-label="Previous match">Prev</button>
        <button type="button" className="ed-btn" onClick={() => onStep(1)} disabled={!total} aria-label="Next match">Next</button>
      </div>
      <div className="ed-row">
        <input className="ed-input" aria-label="Replace with" placeholder="Replace with" value={f.by} onChange={(e) => onChange({ by: e.target.value })} autoCapitalize="none" />
        <button type="button" className="ed-btn" onClick={onReplace} disabled={!total}>Replace</button>
        <button type="button" className="ed-btn" onClick={onReplaceAll} disabled={!total}>All</button>
      </div>
      <div className="ed-row ed-row-between">
        <span className="ed-note">{f.query ? (total ? `${Math.min(f.cur + 1, total)} of ${total}` : 'No matches') : 'Searches the story paragraphs. Headline and deck are not searched.'}</span>
        <label className="ed-check"><input type="checkbox" checked={f.caseSensitive} onChange={(e) => onChange({ caseSensitive: e.target.checked, cur: 0 })} /> Match case</label>
        <label className="ed-check"><input type="checkbox" checked={f.scope === 'source'} onChange={(e) => onChange({ scope: e.target.checked ? 'source' : 'english', cur: 0 })} /> In the source</label>
        <button type="button" className="ed-btn ed-btn-quiet" onClick={onClose}>Close</button>
      </div>
      {lastMsg && <p className="ed-note" role="status">{lastMsg}</p>}
    </section>
  )
}

// ---------------------------------------------------------------- quotes

export function QuotesSheet({ quotes, onClose, onJump }: { quotes: StoryQuote[]; onClose: () => void; onJump: (para: number) => void }) {
  const [copied, setCopied] = useState(-1)
  const copy = async (i: number, t: string) => {
    try { await navigator.clipboard.writeText(t); setCopied(i) } catch { setCopied(-2) }
  }
  return (
    <Sheet title="Quotes in this story" onClose={onClose}>
      {quotes.length ? (
        <ul className="ed-list">
          {quotes.map((q, i) => (
            <li key={i} className="ed-quote">
              <p>{q.raw}</p>
              <div className="ed-row">
                <span className="ed-note">Paragraph {q.para + 1}</span>
                <button type="button" className="ed-btn" onClick={() => { onJump(q.para); onClose() }}>Go to paragraph</button>
                <button type="button" className="ed-btn" onClick={() => copy(i, q.inner)}>{copied === i ? 'Copied' : 'Copy text'}</button>
              </div>
              {copied === -2 && i === 0 && <p className="ed-warn">Copy was blocked by the phone. Select the text instead.</p>}
            </li>
          ))}
        </ul>
      ) : <p className="ed-note">No quoted statements found in the English story.</p>}
      <p className="ed-note">Planned: the desktop's saved quote and statistic library (kept across stories, with speakers) is not on the phone yet. This list reads only the story open now.</p>
    </Sheet>
  )
}

// ---------------------------------------------------------------- readiness

export function ReadinessSheet({ r, extra, onClose, onFix, onBanner, onPublish }: {
  r: Readiness; extra: string[]; onClose: () => void; onFix: (id: string) => void; onBanner: () => void; onPublish: () => void
}) {
  const required = r.checks.filter((c) => c.group === 'Required' && c.id !== 'translation')
  return (
    <Sheet title="Is the story ready?" onClose={onClose}>
      <ul className="ed-checks">
        {required.map((c) => (
          <li key={c.id} className={`ed-check-${c.status}`}>
            <span className="ed-mk" aria-hidden="true">{c.status === 'ok' ? 'OK' : 'Fix'}</span>
            <span><b>{c.label}</b><br />{c.detail}</span>
            {c.status !== 'ok' && <button type="button" className="ed-btn" onClick={() => { onFix(c.id); onClose() }}>Go</button>}
          </li>
        ))}
        {extra.map((t, i) => <li key={`x${i}`} className="ed-check-warn"><span className="ed-mk" aria-hidden="true">Check</span><span>{t}</span></li>)}
      </ul>
      <p className="ed-note">The picture is chosen in Banner, and the &ldquo;I have read the translation&rdquo; tick is on Publish.</p>
      <div className="ed-row">
        <button type="button" className="ed-btn" onClick={() => { onClose(); onBanner() }}>Open Banner</button>
        <button type="button" className="ed-btn ed-btn-primary" onClick={() => { onClose(); onPublish() }}>Open Publish</button>
      </div>
    </Sheet>
  )
}
