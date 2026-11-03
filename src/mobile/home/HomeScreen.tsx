// Home: start work fast and get back to it. A compact hero (two primary starts + continue) that never pushes the
// recent stories below the fold: at 411×891 at least four recent stories are visible.
import { useEffect, useMemo } from 'react'
import { useStoryQueue, storyTitle, STATUS_LABEL, type StoryItem } from '../../pc/editorial/storyQueue'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { fmtTime } from '../../pc/ui/time'
import type { ScreenProps } from '../shell/nav'
import { useNav } from '../shell/nav'
import { useOnline } from '../shell/core'
import { Button, Empty, Icon, IconBtn, Row, TopBar } from '../shell/ui'
import './home.css'

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`
  return new Date(t).toLocaleDateString()
}

const STATUS_ICON = { draft: 'edit', review: 'alert', approved: 'check', published: 'globe' } as const

/** The PC's story title, or (for a story that only has its source so far) the source's first words. */
export function phoneStoryTitle(s: StoryItem): string {
  const t = storyTitle(s.snapshot)
  if (t !== 'Untitled story') return t
  const raw = (s.snapshot.source?.rawText || s.snapshot.source?.paragraphs?.[0] || '').trim().replace(/\s+/g, ' ')
  return raw ? (raw.length > 90 ? raw.slice(0, 88).trimEnd() + '…' : raw) : t
}

export function StoryRow({ s, onOpen, active }: { s: StoryItem; onOpen: () => void; active?: boolean }) {
  const title = phoneStoryTitle(s)
  const bn = /[ঀ-৿]/.test(title)
  return (
    <Row
      tall
      onClick={onOpen}
      lead={<span className={`m-thumb m-thumb-${s.status}`} aria-hidden><Icon name={STATUS_ICON[s.status]} size={22} /></span>}
      title={<span lang={bn ? 'bn' : undefined}>{title}</span>}
      meta={<>{STATUS_LABEL[s.status]} · {ago(s.updatedAt)}{active ? ' · on the desk' : ''}</>}
      trail={<Icon name="chevRight" size={20} />}
    />
  )
}

export default function HomeScreen({ active }: ScreenProps) {
  const stories = useStoryQueue((s) => s.stories)
  const activeId = useStoryQueue((s) => s.activeId)
  const session = useEditorialStore((s) => s.staffSession)
  const site = useEditorialStore((s) => s.siteStatus)
  const checkConnection = useEditorialStore((s) => s.checkConnection)
  const online = useOnline()
  const nav = useNav()
  const recent = useMemo(() => [...stories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8), [stories])
  const current = stories.find((s) => s.id === activeId) ?? null

  useEffect(() => { if (active) void checkConnection() }, [active, checkConnection])

  const open = (id: string) => { useStoryQueue.getState().switchTo(id); nav.intendEditorial('open') }
  const status = !online ? 'Offline · saved on the phone' : !session ? 'Not signed in' : site.connected ? (session.name || session.email) : site.sessionEnded ? 'Sign in again' : 'Site not reachable'
  const dot = !online ? 'off' : session && site.connected ? 'ok' : 'warn'

  return (
    <>
      <TopBar
        leading={<img className="m-brand" src="./brand/esb-logo.png" alt="ESB Power Line" />}
        title={<span className="m-sr">ESB Studio</span>}
        sub={<button type="button" className="m-status m-hit-pad" onClick={() => nav.openSettings('site')}><span className={`m-dot m-dot-${dot}`} aria-hidden />{status}</button>}
        actions={<IconBtn icon="sliders" label="Settings" onClick={() => nav.openSettings()} />}
      />
      <div className="m-scroll">
        <div className="m-wrap m-home">
          <section className="m-home-start" aria-label="Start">
            <button type="button" className="m-start m-start-primary" onClick={() => nav.intendEditorial('paste-link')}>
              <Icon name="link" size={22} /><span><strong>New story</strong><small>Paste a link, text or a PDF</small></span>
            </button>
            <button type="button" className="m-start" onClick={() => nav.intendGraphics('new')}>
              <Icon name="image" size={22} /><span><strong>New graphic</strong><small>Banner for all formats</small></span>
            </button>
          </section>
          {current && (
            <Button kind="tonal" icon="edit" wide className="m-continue" onClick={() => nav.intendEditorial('open')}>
              Continue: {phoneStoryTitle(current)}
            </Button>
          )}
          <section className="m-section" aria-labelledby="home-recent">
            <header className="m-section-head">
              <h2 id="home-recent">Recent stories</h2>
              {stories.length > 0 && <Button kind="text" onClick={() => nav.go('editorial')}>All {stories.length}</Button>}
            </header>
            {recent.length === 0
              ? <Empty icon="newspaper" title="No stories yet" body="Start with a link from any Bengali or English news site." />
              : <div className="m-list">{recent.map((s) => <StoryRow key={s.id} s={s} active={s.id === activeId} onOpen={() => open(s.id)} />)}</div>}
          </section>
          {site.checkedAt && <p className="m-home-foot">Site checked {fmtTime(site.checkedAt)}</p>}
        </div>
      </div>
    </>
  )
}
