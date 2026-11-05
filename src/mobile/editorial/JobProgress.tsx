// The running job's steps with their own timers (the PC's TranslateProgress / PublishProgress, as an inline card), and
// the Activity sheet: every timed job of the story on the desk — translation, SEO, captions, publish — with the model
// that did it and how long each step took.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtDuration, useJobLog } from '../../pc/editorial/jobLog'
import type { Job, JobKind } from '../../pc/editorial/jobLog'
import { modelLabel } from '../../pc/editorial/aiProviders'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { Button, Chip, Empty, Icon, Sheet } from '../shell/ui'
import { cancelJob, canCancel, useDesk } from './deskStore'

function useTick(on: boolean, ms = 200) {
  const [, t] = useState(0)
  useEffect(() => { if (!on) return; const id = setInterval(() => t((n) => n + 1), ms); return () => clearInterval(id) }, [on, ms])
}

/** Step labels come from the shared job log, some written "Translating…". Shown without the trailing dots: the live step
 *  already says it is working (its ring pulses and its timer runs). */
export const cleanLabel = (s: string) => s.replace(/\s*(\.\.\.|…)\s*$/, '')

/** The steps as a timeline: done steps get a filled check, the running one a pulsing ring, a line joins them. The page
 *  follows the newest step as it appears (scrolls only when it would be off screen). */
export function Steps({ job, follow = true }: { job: Job; follow?: boolean }) {
  useTick(!job.end)
  const now = Date.now()
  const liveRef = useRef<HTMLLIElement>(null)
  const count = job.steps.length
  useEffect(() => {
    if (!follow || job.end) return
    const el = liveRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 140 || r.top < 120) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [count, follow, job.end])
  return (
    <ol className="jp-steps">
      {job.steps.map((st, i) => {
        const live = !st.end
        const bad = !!job.error && i === job.steps.length - 1 && !live
        return (
          <li key={i} ref={live ? liveRef : undefined} className={'jp-step ' + (live ? 'is-live' : bad ? 'is-bad' : 'is-done')}>
            <span className="jp-dot" aria-hidden>{live ? <span className="jp-ring" /> : <Icon name={bad ? 'alert' : 'check'} size={13} />}</span>
            <span className="jp-label">{cleanLabel(st.label)}</span>
            <span className="jp-time">{fmtDuration((st.end ?? now) - st.start)}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** The panel around the steps: title, total time, a slim live bar, the steps. Used by Engine and by Publish. */
export function JobPanel({ job, title, note, action, tone = 'work' }: { job?: Job; title: string; note?: string; action?: React.ReactNode; tone?: 'work' | 'publish' }) {
  useTick(!!job && !job.end)
  const now = Date.now()
  const running = !!job && !job.end
  const done = job?.steps.filter((s) => s.end).length ?? 0
  return (
    <section className={'jp jp-' + tone + (running ? ' is-running' : job?.error ? ' is-bad' : ' is-done')} aria-live="polite">
      <header className="jp-head">
        <span className="jp-badge" aria-hidden><Icon name={tone === 'publish' ? 'send' : 'sparkle'} size={18} /></span>
        <span className="jp-titles">
          <b>{title}</b>
          <small>{job ? (running ? `Step ${done + 1} · ${fmtDuration(now - job.start)}` : job.error ? 'Stopped' : `Done in ${fmtDuration((job.end ?? now) - job.start)}`) : 'Starting'}</small>
        </span>
        {action}
      </header>
      {running && <span className="jp-bar" aria-hidden><i /></span>}
      {job && <Steps job={job} />}
      {note && <p className="jp-note">{note}</p>}
    </section>
  )
}

/** The newest running story / SEO / social job, inline, with Cancel where cancelling is honest. */
export function JobProgress() {
  const busy = useDesk((s) => s.busy)
  const job = useJobLog((s) => s.jobs.find((j) => !j.end && j.kind !== 'publish'))
  return (
    <JobPanel job={job} title={cleanLabel(job?.title ?? 'Working')}
      action={canCancel(busy) ? <Button kind="text" onClick={cancelJob}>Cancel</Button> : undefined}
      note={busy === 'fetch' ? 'A link import finishes on its own, usually in under a minute.' : undefined} />
  )
}

const KINDS: { kind: JobKind | 'all'; label: string }[] = [{ kind: 'all', label: 'All' }, { kind: 'story', label: 'Story' }, { kind: 'seo', label: 'SEO' }, { kind: 'social', label: 'Social' }, { kind: 'publish', label: 'Publish' }]
const modelOf = (by: string) => { const i = by.indexOf(' · '); return i < 0 ? by : `${by.slice(0, i)} · ${modelLabel(by.slice(i + 3))}` }

export function ActivitySheet() {
  const all = useJobLog((s) => s.jobs)
  const activeId = useStoryQueue((s) => s.activeId)
  const jobs = useMemo(() => all.filter((j) => j.story === (activeId ?? '') || j.story === ''), [all, activeId])
  const [k, setK] = useState<JobKind | 'all'>('all')
  const [open, setOpen] = useState<number | null>(null)
  useTick(jobs.some((j) => !j.end))
  const shown = k === 'all' ? jobs : jobs.filter((j) => j.kind === k)
  const now = Date.now()
  return (
    <Sheet id="ed-activity" title="Activity" actions={jobs.some((j) => j.end) ? <Button kind="text" onClick={() => useJobLog.getState().clear(activeId ?? '')}>Clear</Button> : undefined}>
      <p className="me-hint">This story's runs: translation, SEO, captions and publishing, each with the model that did it and the time each step took.</p>
      {jobs.length > 1 && <div className="m-chips is-scroll">{KINDS.map((x) => <Chip key={x.kind} on={k === x.kind} onClick={() => setK(x.kind)}>{x.label}</Chip>)}</div>}
      {!jobs.length && <Empty icon="activity" title="Nothing timed yet" body="Translate a story, write SEO or captions with AI, or publish — each run is listed here." />}
      <div className="me-list">
        {shown.map((j) => (
          <section key={j.id} className={'me-job' + (!j.end ? ' is-live' : j.error ? ' is-bad' : '')}>
            <button type="button" className="me-job-head" aria-expanded={open === j.id} onClick={() => setOpen(open === j.id ? null : j.id)}>
              <span className="me-steps-mark" aria-hidden>{!j.end ? <span className="m-spin" /> : <Icon name={j.error ? 'alert' : 'check'} size={16} />}</span>
              <span className="me-job-t"><b>{j.title}</b><span>{KINDS.find((x) => x.kind === j.kind)?.label}{j.by ? ' · ' + modelOf(j.by) : ''}{j.error ? ' · failed' : ''}</span></span>
              <span className="me-steps-time">{fmtDuration((j.end ?? now) - j.start)}</span>
              <Icon name={open === j.id ? 'chevUp' : 'chevDown'} size={18} />
            </button>
            {j.error && <p className="me-meta is-bad">{j.error}</p>}
            {open === j.id && <Steps job={j} follow={false} />}
          </section>
        ))}
      </div>
    </Sheet>
  )
}
