// The running job's steps with their own timers (the PC's TranslateProgress / PublishProgress, as an inline card), and
// the Activity sheet: every timed job of the story on the desk — translation, SEO, captions, publish — with the model
// that did it and how long each step took.
import { useEffect, useMemo, useState } from 'react'
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

export function Steps({ job }: { job: Job }) {
  useTick(!job.end)
  const now = Date.now()
  return (
    <ol className="me-steps">
      {job.steps.map((st, i) => {
        const live = !st.end
        const bad = !!job.error && i === job.steps.length - 1 && !live
        return (
          <li key={i} className={live ? 'is-live' : bad ? 'is-bad' : 'is-done'}>
            <span className="me-steps-mark" aria-hidden>{live ? <span className="m-spin" /> : <Icon name={bad ? 'alert' : 'check'} size={16} />}</span>
            <span className="me-steps-label">{st.label}</span>
            <span className="me-steps-time">{fmtDuration((st.end ?? now) - st.start)}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** The newest running story / SEO / social job, inline, with Cancel where cancelling is honest. */
export function JobProgress() {
  const busy = useDesk((s) => s.busy)
  const status = useDesk((s) => s.status)
  const job = useJobLog((s) => s.jobs.find((j) => !j.end && j.kind !== 'publish'))
  return (
    <section className="me-card me-progress" aria-live="polite">
      <div className="me-card-row"><b className="me-grow">{job?.title ?? 'Working'}</b>{canCancel(busy) && <Button kind="text" onClick={cancelJob}>Cancel</Button>}</div>
      {job ? <Steps job={job} /> : <p className="me-meta">{status}</p>}
      {busy === 'fetch' && <p className="me-meta">A link import finishes on its own (usually under a minute); it cannot be stopped midway.</p>}
    </section>
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
            {open === j.id && <Steps job={j} />}
          </section>
        ))}
      </div>
    </Sheet>
  )
}
