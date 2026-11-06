// Home: start work fast and get back to it. A compact hero (two primary starts + continue) that never pushes the
// recent stories below the fold: at 411×891 at least four recent stories are visible.
import { UserAvatar } from '../shell/avatar'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStoryQueue, storyTitle, STATUS_LABEL, type StoryItem } from '../../pc/editorial/storyQueue'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { aiFor, loadAiSettings, providerMeta } from '../../pc/editorial/aiProviders'
import type { ScreenProps } from '../shell/nav'
import { useNav } from '../shell/nav'
import { storyLocked, useDesk } from '../editorial/deskStore'
import { confirmAsk, snack, useOnline } from '../shell/core'
import { Button, Empty, Icon, Menu, Row } from '../shell/ui'
import { openAccount } from '../shell/AccountSheet'
import { ProviderMark, brandColor } from '../shell/marks'
import { ago } from '../editorial/useStory'
import './home.css'


/** The PC's story title, or (for a story that only has its source so far) the source's first words. */
export function phoneStoryTitle(s: StoryItem): string {
  const t = storyTitle(s.snapshot)
  if (t !== 'Untitled story') return t
  const raw = (s.snapshot.source?.rawText || s.snapshot.source?.paragraphs?.[0] || '').trim().replace(/\s+/g, ' ')
  return raw ? (raw.length > 90 ? raw.slice(0, 88).trimEnd() + '…' : raw) : t
}

/** Press opens; hold (500 ms, finger still) offers Remove, like a launcher shortcut. */
function useHold(onHold: (anchor: HTMLElement) => void) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const held = useRef(false)
  const stop = () => { if (t.current) clearTimeout(t.current); t.current = null; start.current = null }
  return {
    held,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      held.current = false
      start.current = { x: e.clientX, y: e.clientY }
      const el = e.currentTarget
      t.current = setTimeout(() => { held.current = true; onHold(el) }, 500)
    },
    onPointerMove: (e: React.PointerEvent) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) stop() },
    onPointerUp: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

export function StoryRow({ s, onOpen, active }: { s: StoryItem; onOpen: () => void; active?: boolean }) {
  const title = phoneStoryTitle(s)
  const bn = /[ঀ-৿]/.test(title)
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const hold = useHold(setMenuAt)
  const remove = async () => {
    if (s.id === useStoryQueue.getState().activeId && storyLocked()) return
    if (await confirmAsk({ title: 'Remove this story?', body: `"${title}" and its draft are deleted from this phone. An article already on esbpowerline.com is not touched.`, confirm: 'Remove', danger: true })) {
      useStoryQueue.getState().remove(s.id)
      snack('Story removed')
    }
  }
  return (
    <>
      <Row
        tall
        onClick={() => { if (!hold.held.current) onOpen() }}
        lead={<span className={`hm-stat is-${s.status}`} aria-hidden />}
        title={<span lang={bn ? 'bn' : undefined}>{title}</span>}
        meta={<>{STATUS_LABEL[s.status]} · {ago(s.updatedAt)}{active ? ' · on the desk' : ''}</>}
        trail={<Icon name="chevRight" size={20} />}
        {...hold}
      />
      {menuAt && <Menu anchor={menuAt} onClose={() => setMenuAt(null)} items={[
        { label: 'Open', icon: 'edit', onClick: onOpen },
        { label: 'Remove from this phone', icon: 'trash', danger: true, onClick: () => { void remove() } },
      ]} />}
    </>
  )
}

/** Continue where you left off. Tap to open; press and hold to show a delete button (tap the card again to hide it). */
function ContinueCard({ title, onOpen, onRemove }: { title: string; onOpen: () => void; onRemove: () => void }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef(0)
  const held = useRef(false)
  const down = () => { held.current = false; timer.current = window.setTimeout(() => { held.current = true; navigator.vibrate?.(15); setArmed(true) }, 480) }
  const up = () => window.clearTimeout(timer.current)
  return (
    <div className={'hm-cont-wrap' + (armed ? ' is-armed' : '')}>
      <button type="button" className="hm-continue hm-glass" onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (held.current) { held.current = false; return } if (armed) { setArmed(false); return } onOpen() }}>
        <span className="hm-continue-ico"><Icon name="edit" size={20} /></span>
        <span className="hm-continue-txt"><small>{armed ? 'Remove this story?' : 'Continue where you left off'}</small><strong lang={/[ঀ-৿]/.test(title) ? 'bn' : undefined}>{title}</strong></span>
        {!armed && <Icon name="chevRight" size={20} />}
      </button>
      {armed && <button type="button" className="hm-cont-del" aria-label="Remove this story" onClick={() => { setArmed(false); onRemove() }}><Icon name="trash" size={20} /></button>}
    </div>
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
  const recent = useMemo(() => [...stories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4), [stories])
  const current = stories.find((s) => s.id === activeId) ?? null
  // the story in "Continue" is not listed again under Recent
  const others = current ? recent.filter((s) => s.id !== current.id) : recent

  useEffect(() => { if (active) void checkConnection() }, [active, checkConnection])

  const open = (id: string) => { if (id !== activeId && storyLocked()) return; useStoryQueue.getState().switchTo(id); nav.intendEditorial('open') }
  const name = session ? (session.name || session.email).split(/[\s@]/)[0] : ''
  const siteState = !online ? { dot: 'off', text: 'Offline' } : !session ? { dot: 'warn', text: 'Not signed in' } : site.connected ? { dot: 'ok', text: 'Site connected' } : site.sessionEnded ? { dot: 'warn', text: 'Sign in again' } : { dot: 'warn', text: 'Site unreachable' }
  const ai = loadAiSettings()
  const aiOk = !ai.paused && !!aiFor('main')
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const toEditorial = () => { useDesk.getState().set({ homeTab: 'stories', view: 'home' }); nav.go('editorial') }

  return (
    <div className="hm-shell">
      <div className="hm-bg" aria-hidden />
      <header className="hm-bar">
        <span className="hm-today">{today}</span>
        <button type="button" className="hm-me" aria-label={session ? `Account: ${session.name || session.email}` : 'Account'} onClick={openAccount}>
          {session ? <UserAvatar name={name} className="hm-me-badge" /> : <Icon name="user" size={22} />}
        </button>
      </header>
      <div className="m-scroll hm-scroll">
        <div className="m-wrap hm">
          <section className="hm-hero" aria-label="ESB Power Line Ai Studio">
            <h1 className="hm-title" aria-label="ESB Power Line Ai Studio">
              <img className="hm-mark" src="./brand/esb-mark.png" alt="" draggable={false} />
              <span className="hm-stick" aria-hidden />
              <span className="hm-name"><span className="hm-ai">Ai</span> <span className="hm-studio">Studio</span></span>
            </h1>
            <p className="hm-tag">Where stories are written, imagination is designed and reality is cut</p>
            <div className="hm-chips">
              <button type="button" className={`hm-chip hm-chip-${siteState.dot === 'ok' ? 'ok' : 'bad'}`} onClick={openAccount}><span className={`m-dot m-dot-${siteState.dot}`} aria-hidden />{siteState.text}</button>
              <button type="button" className={`hm-chip hm-chip-ai${aiOk ? ' is-ok' : ''}`} style={aiOk ? ({ '--pc': brandColor(ai.provider) } as React.CSSProperties) : undefined} onClick={() => nav.openSettings('ai')}>{aiOk ? <ProviderMark id={ai.provider} size={16} /> : <Icon name="sparkle" size={15} />}{ai.paused ? 'AI paused' : aiOk ? providerMeta(ai.provider).name : 'AI needs a key'}</button>
            </div>
          </section>

          <nav className="hm-launch hm-glass" aria-label="Workspaces">
            <button type="button" className="hm-cell" onClick={() => nav.intendEditorial('paste-link')}>
              <span className="hm-cell-ico"><Icon name="power" size={22} /></span>
              <span className="hm-cell-name">Editorial</span>
              <span className="hm-cell-note">Paste a link, get English</span>
              <Icon name="chevRight" size={20} />
            </button>
            <button type="button" className="hm-cell" onClick={() => nav.go('graphics')}>
              <span className="hm-cell-ico"><Icon name="layers" size={22} /></span>
              <span className="hm-cell-name">Banner</span>
              <span className="hm-cell-note">Design in Graphics</span>
              <Icon name="chevRight" size={20} />
            </button>
          </nav>

          {current && <ContinueCard title={phoneStoryTitle(current)} onOpen={() => nav.intendEditorial('open')} onRemove={async () => {
            if (storyLocked()) return
            if (await confirmAsk({ title: 'Remove this story?', body: `"${phoneStoryTitle(current)}" and its draft are deleted from this phone. An article already on esbpowerline.com is not touched.`, confirm: 'Remove', danger: true })) {
              useStoryQueue.getState().remove(current.id); snack('Story removed')
            }
          }} />}

          {(stories.length === 0 || others.length > 0) && <section className="hm-sec" aria-labelledby="home-recent">
            <header className="hm-sech">
              <h2 className="hm-h has-icon" id="home-recent"><Icon name="newspaper" size={15} />Recent stories</h2>
              {stories.length > 0 && <button type="button" className="hm-link" onClick={toEditorial}>See all {stories.length}</button>}
            </header>
            {stories.length === 0
              ? (
                <Empty title="No stories yet" body="Paste a link from any Bengali or English news site and it becomes an English story, ready for review."
                  action={<Button icon="link" onClick={() => nav.intendEditorial('paste-link')}>Paste a news link</Button>} />
              )
              : <div className="m-list hm-glass">{others.map((s) => <StoryRow key={s.id} s={s} active={s.id === activeId} onOpen={() => open(s.id)} />)}</div>}
          </section>}

        </div>
      </div>
    </div>
  )
}
