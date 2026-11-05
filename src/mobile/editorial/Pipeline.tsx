// The work, as the app teaches it: Link -> Parse -> Banner -> Check -> Publish. Two small views of it:
//  - PipelineStrip: the five steps with a marker on where you are (the new-story screen).
//  - StepTrack: four segments for a story in the list, driven by its status (draft = writing, review = checking, approved = ready to publish).
import type { StoryStatus } from '../../pc/editorial/storyQueue'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { useState } from 'react'
import { Icon, Menu } from '../shell/ui'
import type { MenuItem } from '../shell/ui'
import { snack, useUi } from '../shell/core'
import { useDesk } from './deskStore'
import { hasStoryContent, useLeadPhoto, useReadiness } from './useStory'
import { slideTo } from '../shell/slide'
import { useNav } from '../shell/nav'

const STEPS = ['Engine', 'Parse', 'Banner', 'Check', 'Publish']

export function PipelineStrip({ at, busy }: { at: number; busy?: boolean }) {
  return (
    <ol className="me-strip" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? 'is-done' : i === at ? 'is-now' + (busy ? ' is-busy' : '') : ''} aria-current={i === at ? 'step' : undefined}>
          <i aria-hidden>{i < at ? <Icon name="check" size={12} /> : i + 1}</i>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  )
}

/** Where the story stands in the five steps, and how to move: one source for every view of the flow. */
function useFlow() {
  const d = useDesk()
  const headline = useEditorialStore((s) => s.draft.headline)
  const body = useEditorialStore((s) => s.draft.body)
  const source = useEditorialStore((s) => s.source)
  const story = useStoryQueue((s) => s.stories.find((x) => x.id === s.activeId))
  const photo = useLeadPhoto()
  const { t: ready } = useReadiness()
  const toCheck = ready.blockers > 0 ? ready.blockers : ready.warnings
  const onDesk = hasStoryContent({ source, draft: { headline, body } })
  // inside the banner editor (Graphics, opened from a story) the flow stands on Banner
  const inGx = useNav((s) => s.route) === 'graphics'
  // the Publish screen is step 5; any other step closes it and goes there
  const inPub = useUi((s) => s.sheet) === 'ed-publish'
  const checks = d.tab === 'seo' || d.tab === 'social' || d.tab === 'preview'
  const at = inPub ? 4 : inGx ? 2 : d.view === 'intake' ? 0 : d.view !== 'story' ? -1 : d.tab === 'story' ? 1 : d.tab === 'details' ? 2 : checks ? 3 : 1
  const done = [onDesk, !!headline.trim() && !!body.trim(), !!photo, ready.state === 'ready', story?.status === 'published']
  const go = (i: number) => {
    if (i === at) return
    const dir: 1 | -1 = at < 0 || i > at ? 1 : -1
    const leave = () => { if (inPub) useUi.getState().closeSheet('ed-publish'); if (inGx) useNav.setState({ route: 'editorial', backTo: null }) }
    const move = (fn: () => void) => slideTo(dir, () => { leave(); fn() }, !inGx && at >= 0 ? 'flow' : undefined)
    if (i === 0) { move(() => d.set({ view: 'intake', intakeTab: 'link', error: null, writing: false })); return }
    if (!onDesk) { snack('Bring a story in first: paste a link, a file or text in Engine.'); return }
    if (i === 4) {
      if (!headline.trim()) { snack('Write a headline first, then publish.'); d.set({ view: 'story', tab: 'story', writing: false }); return }
      move(() => { d.set({ view: 'story', writing: false }); useUi.getState().openSheet('ed-publish') }); return
    }
    move(() => d.set({ view: 'story', writing: false, tab: i === 1 ? 'story' : i === 2 ? 'details' : checks ? d.tab : 'seo' }))
  }
  const bad = ready.blockers > 0
  return { at, done, go, toCheck, bad, onDesk, busy: !!d.busy }
}

/** The whole flow as five tappable steps (kept for wide screens). */
export function FlowStrip({ compact }: { compact?: boolean }) {
  const { at, done, go, toCheck, bad, onDesk, busy } = useFlow()
  return (
    <ol className={'me-strip is-live' + (compact ? ' is-compact' : '')} aria-label="Steps">
      {STEPS.map((s, i) => {
        const now = i === at
        const dn = done[i] && !now
        return (
          <li key={s} className={(dn ? 'is-done' : now ? 'is-now' + (busy ? ' is-busy' : '') : '') + (!onDesk && i > 0 ? ' is-off' : '')}>
            <button type="button" onClick={() => go(i)} aria-current={now ? 'step' : undefined} aria-label={`${s}${dn ? ', done' : now ? ', current' : ''}${i === 3 && !dn && toCheck > 0 ? `, ${toCheck} to fix` : ''}`}>
              <i aria-hidden>{dn ? <Icon name="check" size={12} /> : i + 1}{i === 3 && onDesk && !dn && toCheck > 0 && <em className={'me-strip-badge is-' + (bad ? 'bad' : 'warn')}>{toCheck}</em>}</i>
              <span>{s}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Title-bar subtitle: "Step 3 of 5" with a pull-down of every step (ticks, the current one, the fix count). */
export function StepSub({ extra }: { extra?: string }) {
  const { at, done, go, toCheck, bad } = useFlow()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (at < 0) return extra ? <span>{extra}</span> : null
  const items: MenuItem[] = STEPS.map((s, i) => ({
    label: `${i + 1}  ${s}`,
    checked: i === at,
    icon: done[i] && i !== at ? 'check' : undefined,
    hint: i === at ? 'You are here' : i === 3 && toCheck > 0 ? `${toCheck} ${bad ? 'to fix' : 'to check'}` : done[i] ? 'Done' : undefined,
    onClick: () => go(i),
  }))
  return (
    <>
      <button type="button" className="me-stepsub" aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => setAnchor(e.currentTarget)}>
        <span>Step {at + 1} of {STEPS.length}</span>{extra && <span className="me-stepsub-x">· {extra}</span>}<Icon name="chevDown" size={14} />
      </button>
      {anchor && <Menu anchor={anchor} items={items} onClose={() => setAnchor(null)} />}
    </>
  )
}

/** The slim progress track along the foot of the title bar: five segments, filled to where you are, each one a jump. */
export function FlowTrack() {
  const { at, done, go, toCheck, bad, onDesk } = useFlow()
  if (at < 0) return null
  return (
    <ol className="me-track5" aria-label="Steps">
      {STEPS.map((s, i) => {
        const now = i === at
        const dn = (done[i] || i < at) && !now
        return (
          <li key={s} className={(now ? 'is-now' : dn ? 'is-done' : '') + (!onDesk && i > 0 ? ' is-off' : '') + (i === 3 && toCheck > 0 ? ' has-fix' + (bad ? ' is-bad' : '') : '')}>
            <button type="button" onClick={() => go(i)} aria-current={now ? 'step' : undefined} aria-label={`${s}${dn ? ', done' : now ? ', current' : ''}${i === 3 && toCheck > 0 ? `, ${toCheck} to fix` : ''}`}>
              <i />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Which of Story / Banner / Check / Publish a story in the queue is on, from its status. */
const STORY_AT: Record<StoryStatus, number> = { draft: 0, review: 2, approved: 3, published: 4 }
const NEXT: Record<StoryStatus, string> = { draft: 'Parse, then banner', review: 'Check it', approved: 'Ready to publish', published: 'Live' }

export function StepTrack({ status }: { status: StoryStatus }) {
  const at = STORY_AT[status]
  return (
    <span className="me-track" role="img" aria-label={NEXT[status]}>
      <span className="me-track-bars" aria-hidden>{[0, 1, 2, 3].map((i) => <b key={i} className={i < at ? 'is-done' : i === at ? 'is-now' : ''} />)}</span>
      <span className="me-track-l">{NEXT[status]}</span>
    </span>
  )
}
