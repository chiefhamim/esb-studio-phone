// Editorial on the phone: the PC Editorial desk's features (src/pc/editorial: stores, translation, checks, editor,
// publish logic), laid out one task per screen. Landing (stories, published, wire) -> Intake (link / text / file) ->
// the story (Story · Details · SEO · Social · Preview) -> Review & publish. Stays mounted while hidden, so the editor,
// its undo history and a running job survive switching to Graphics.
import { useEffect, useRef } from 'react'
import type { ScreenProps } from '../shell/nav'
import { useNav } from '../shell/nav'
import { useIncoming } from '../shell/incoming'
import { snack, useBackLayer, useUnsavedGuard } from '../shell/core'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { installBannerLink } from '../../pc/editorial/bannerLink'
import { useWirePoll } from '../../pc/editorial/wire'
import { readSharedFile } from '../../native/shareIn'
import { useDesk, newStory, readFile } from './deskStore'
import { isSliding } from '../shell/slide'
import { usePublish } from './publish'
import { Landing } from './Landing'
import { Intake } from './Intake'
import { StoryEditor } from './StoryEditor'
import { ActivitySheet } from './JobProgress'
import { LibrarySheet } from './LibrarySheet'
import { SourceReview } from './SourceReview'
import { PublishReview, ReadinessSheet } from './PublishReview'
import { hasStoryContent } from './useStory'
import './editorial.css'

installBannerLink()

/** Whatever another app shared in: a link fills the URL, text the paste box, a PDF/DOCX is read; pictures go to Graphics. */
async function takeShared() {
  const inc = useIncoming.getState().take()
  if (!inc) return
  const docs = inc.files.filter((f) => /pdf|officedocument\.wordprocessingml/.test(f.mime) || /\.(pdf|docx)$/i.test(f.name))
  const pics = inc.files.filter((f) => f.mime.startsWith('image/'))
  if (inc.url) useDesk.setState({ intakeTab: 'link', url: inc.url, focusUrlAt: Date.now() })
  else if (inc.text) useDesk.setState({ intakeTab: 'text', raw: inc.text })
  if (docs[0]) {
    if (docs[0].error) snack(`${docs[0].name} is over 25 MB and was not read`, { tone: 'error' })
    else {
      try {
        const blob = await readSharedFile(docs[0])
        await readFile(new File([blob], docs[0].name, { type: docs[0].mime }))
      } catch (e) { snack(`Could not read ${docs[0].name}: ${(e as Error).message}`, { tone: 'error' }) }
    }
  }
  if (pics.length) snack(`${pics.length} picture${pics.length === 1 ? '' : 's'} came with this share. Add them to the banner from Graphics → Photos.`, { action: { label: 'Graphics', run: () => useNav.getState().intendGraphics('photos') }, ms: 8000 })
}


export default function EditorialScreen({ active }: ScreenProps) {
  const view = useDesk((s) => s.view)
  const writing = useDesk((s) => s.writing)
  const intent = useNav((s) => s.editorialIntent)
  const checkConnection = useEditorialStore((s) => s.checkConnection)
  useWirePoll()

  // first launch: straight back into the story on the desk, else the landing
  useEffect(() => {
    const e = useEditorialStore.getState()
    if (hasStoryContent(e)) useDesk.setState({ view: 'story' })
    if (import.meta.env.DEV) Object.assign(window, { __desk: useDesk, __publish: usePublish })
  }, [])

  // requests from Home, launcher shortcuts and the share sheet
  useEffect(() => {
    if (!intent) return
    if (intent.kind === 'new') newStory('story')
    // Engine opens with an empty link box and no keyboard: nothing is read from the clipboard until the editor taps Paste
    else if (intent.kind === 'paste-link') { newStory('intake'); useDesk.setState({ intakeTab: 'link' }); void takeShared() }
    else useDesk.setState({ view: hasStoryContent(useEditorialStore.getState()) ? 'story' : 'home' })
  }, [intent])

  // The site status stays live while the desk is on screen. The PC re-checks every 20 s; on a phone each check downloads
  // the site feed and wakes the radio (measured 2026-11-06: 3 requests every 20 s, about 540 an hour). Here: once a minute
  // on Wi-Fi, every 3 minutes on mobile data or with Data Saver on, at once when the app comes back to the screen or the
  // network returns, and never while it is in the background. A publish checks the sign-in itself either way.
  useEffect(() => {
    if (!active) return
    type Conn = { type?: string; saveData?: boolean; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void }
    const conn = (navigator as unknown as { connection?: Conn }).connection
    const every = () => (conn?.saveData || conn?.type === 'cellular' ? 180_000 : 60_000)
    let t = 0
    const run = () => {
      window.clearTimeout(t)
      if (document.visibilityState === 'hidden') return
      void checkConnection()
      t = window.setTimeout(run, every())
    }
    run()
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', run); window.addEventListener('offline', run)
    conn?.addEventListener?.('change', run)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', run); window.removeEventListener('offline', run)
      conn?.removeEventListener?.('change', run)
    }
  }, [active, checkConnection])

  useBackLayer(active && view !== 'home', () => {
    const nav = useNav.getState()
    // opened from Home: one step back to Home (the desk's landing is not slid through on the way)
    if (nav.editorialFromHome) { useDesk.setState({ writing: false, editing: false }); nav.back(); return }
    useDesk.setState({ view: 'home', writing: false, editing: false })
  }, 'screen')
  useBackLayer(active && writing, () => useDesk.setState({ writing: false }), 'sheet')
  useUnsavedGuard(() => {
    const b = useDesk.getState().busy
    return b ? 'A translation or AI job is still running for this story.' : usePublish.getState().busy ? 'A publish is still running.' : null
  })

  const seen = useRef(view)
  // one direction rule for the whole app: deeper into the flow (stories → Engine → story) slides in from the right, back slides in from the left
  const DEPTH = { home: 0, intake: 1, story: 2 } as const
  // a change made inside a page shift is already moving: no second animation (it used to replay once the shift ended)
  const dir = seen.current === view || isSliding() ? '' : DEPTH[view] > DEPTH[seen.current] ? ' m-view-fwd' : ' m-view-back'
  useEffect(() => { seen.current = view }, [view])
  return (
    <div className="m-screen me-root">
      <div key={view} className={'m-view' + dir}>
        {view === 'home' && <Landing active={active} />}
        {view === 'intake' && <Intake />}
        {view === 'story' && <StoryEditor />}
      </div>
      <ActivitySheet />
      <LibrarySheet />
      <SourceReview />
      <PublishReview />
      <ReadinessSheet />
    </div>
  )
}
