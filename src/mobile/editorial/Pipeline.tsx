// The work, as the app teaches it: Link -> Parse -> Banner -> Check -> Publish. Two small views of it:
//  - PipelineStrip: the five steps with a marker on where you are (the new-story screen).
//  - StepTrack: four segments for a story in the list, driven by its status (draft = writing, review = checking, approved = ready to publish).
import type { StoryStatus } from '../../pc/editorial/storyQueue'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { Icon } from '../shell/ui'
import { snack, useUi } from '../shell/core'
import { useDesk } from './deskStore'
import { hasStoryContent, useLeadPhoto, useReadiness } from './useStory'

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

/** The whole flow as five tappable steps, live from the story on the desk: tap any step to jump there, in either direction. */
export function FlowStrip({ compact }: { compact?: boolean }) {
  const d = useDesk()
  const headline = useEditorialStore((s) => s.draft.headline)
  const body = useEditorialStore((s) => s.draft.body)
  const source = useEditorialStore((s) => s.source)
  const story = useStoryQueue((s) => s.stories.find((x) => x.id === s.activeId))
  const photo = useLeadPhoto()
  const { t: ready } = useReadiness()
  const onDesk = hasStoryContent({ source, draft: { headline, body } })
  const checks = d.tab === 'seo' || d.tab === 'social' || d.tab === 'preview'
  const at = d.view === 'intake' ? 0 : d.view !== 'story' ? -1 : d.tab === 'story' ? 1 : d.tab === 'details' ? 2 : checks ? 3 : 1
  const done = [onDesk, !!headline.trim() && !!body.trim(), !!photo, ready.state === 'ready', story?.status === 'published']
  const go = (i: number) => {
    if (i === 0) { d.set({ view: 'intake', intakeTab: 'link', error: null, writing: false }); return }
    if (!onDesk) { snack('Bring a story in first: paste a link, a file or text in Engine.'); return }
    if (i === 4) {
      if (!headline.trim()) { snack('Write a headline first, then publish.'); d.set({ view: 'story', tab: 'story', writing: false }); return }
      d.set({ view: 'story', writing: false }); useUi.getState().openSheet('ed-publish'); return
    }
    d.set({ view: 'story', writing: false, tab: i === 1 ? 'story' : i === 2 ? 'details' : checks ? d.tab : 'seo' })
  }
  return (
    <ol className={'me-strip is-live' + (compact ? ' is-compact' : '')} aria-label="Steps">
      {STEPS.map((s, i) => {
        const now = i === at
        const dn = done[i] && !now
        return (
          <li key={s} className={(dn ? 'is-done' : now ? 'is-now' + (d.busy ? ' is-busy' : '') : '') + (!onDesk && i > 0 ? ' is-off' : '')}>
            <button type="button" onClick={() => go(i)} aria-current={now ? 'step' : undefined} aria-label={`${s}${dn ? ', done' : now ? ', current' : ''}`}>
              <i aria-hidden>{dn ? <Icon name="check" size={12} /> : i + 1}</i>
              <span>{s}</span>
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
