// The Editorial landing: start a story (link, text/file, blank), continue the one on the desk, and the three lists the
// PC desk keeps — the story queue (Draft / Needs check / Approved / Published), the articles live on esbpowerline.com
// (open one to update it, never a duplicate) and the Wire inbox of followed feeds.
import { useEffect, useMemo, useRef, useState } from 'react'
import { StepTrack } from './Pipeline'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { CatDot, CatName, catOf } from '../shell/cat'
import { useStoryQueue, storyTitle, STATUS_LABEL, STORY_STATUSES } from '../../pc/editorial/storyQueue'
import type { StoryItem, StoryStatus } from '../../pc/editorial/storyQueue'
import { CATEGORIES } from '../../pc/core/tokens'
import { useWire, filterItems, relTime, sourceStatus, DEFAULT_INTERVAL } from '../../pc/editorial/wire'
import type { LiveArticleSummary } from '../../pc/editorial/siteApi'
import { getLinkFetchMode } from '../../platform/fetchGuarded'
import { Banner, Button, Chip, Empty, ErrorState, IconBtn, Icon, MenuButton, Row, Segmented, Sheet, Skeleton, TopBar } from '../shell/ui'
import type { MenuItem } from '../shell/ui'
import { confirmAsk, snack, useOnline, useUi } from '../shell/core'
import { useNav } from '../shell/nav'
import { editLive, newStory, openStory, useDesk } from './deskStore'
import type { HomeTab } from './deskStore'
import { ago, hasStoryContent, hostOf } from './useStory'
import { syncPublished } from './publishedLive'
import { publishedParts } from './publishedDate'
import { WatchList, WatchSettingsSheet } from '../watch/WatchPanel'

export function StatusChip({ s }: { s: StoryStatus }) {
  return <span className={'me-status s-' + s}>{STATUS_LABEL[s]}</span>
}

function PubTime({ raw }: { raw?: string }) {
  const { rel, when } = publishedParts(raw)
  return <small className="pb-time">{rel && <span className="pb-ago">{rel}</span>}<span>{when}</span></small>
}

function Thumb({ src, cat }: { src?: string | null; cat?: string }) {
  const [bad, setBad] = useState(false)
  const c = CATEGORIES.find((x) => x.id === cat || x.name.toLowerCase() === (cat ?? '').toLowerCase())
  if (src && !bad && /^https?:|^blob:|^data:/.test(src)) return <img className="me-thumb" src={src} alt="" loading="lazy" onError={() => setBad(true)} />
  return <span className="me-thumb me-thumb-empty" style={c ? ({ '--thumb-c': c.accent } as React.CSSProperties) : undefined} aria-hidden><Icon name="newspaper" size={20} /></span>
}

export function homeMenu(): MenuItem[] {
  const nav = useNav.getState()
  return [
    { label: 'Activity', icon: 'activity', onClick: () => useUi.getState().openSheet('ed-activity') },
    { label: 'Quote & figure library', icon: 'quote', onClick: () => useUi.getState().openSheet('ed-library') },
    { divider: true, label: '', onClick: () => {} },
    { label: 'AI keys and providers', icon: 'sparkle', onClick: () => nav.openSettings('ai') },
    { label: 'Site sign-in', icon: 'user', onClick: () => nav.openSettings('site') },
    { label: 'Facebook Page', icon: 'link', onClick: () => nav.openSettings('facebook') },
  ]
}

function StoryRow({ s, active }: { s: StoryItem; active: boolean }) {
  const setStatus = useStoryQueue((q) => q.setStatus)
  const remove = useStoryQueue((q) => q.remove)
  const img = s.snapshot.source?.images?.[0]?.src
  const items: MenuItem[] = [
    { label: 'Open', icon: 'edit', onClick: () => openStory(s.id) },
    ...STORY_STATUSES.filter((v) => v !== 'published').map((v) => ({ label: `Mark ${STATUS_LABEL[v]}`, checked: s.status === v, onClick: () => setStatus(s.id, v) })),
    { label: 'Remove from this phone', icon: 'trash', danger: true, onClick: async () => {
      if (await confirmAsk({ title: 'Remove this story?', body: `"${storyTitle(s.snapshot)}" and its draft are deleted from this phone. An article already on esbpowerline.com is not touched.`, confirm: 'Remove', danger: true })) { remove(s.id); snack('Story removed') }
    } },
  ]
  return (
    <div className={'me-listrow' + (active ? ' is-active' : '')}>
      <Row tall onClick={() => openStory(s.id)} lead={<Thumb src={img} />} title={storyTitle(s.snapshot)}
        meta={<><StepTrack status={s.status} /><span>{hostOf(s.snapshot.source?.url)} · {ago(s.updatedAt)}</span></>} />
      <MenuButton label={`Story options: ${storyTitle(s.snapshot)}`} items={items} />
    </div>
  )
}

function StoriesList() {
  const stories = useStoryQueue((s) => s.stories)
  const activeId = useStoryQueue((s) => s.activeId)
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | StoryStatus>('all')
  const counts = useMemo(() => Object.fromEntries(STORY_STATUSES.map((s) => [s, stories.filter((x) => x.status === s).length])) as Record<StoryStatus, number>, [stories])
  const shown = stories.filter((s) => (f === 'all' || s.status === f) && (!q.trim() || storyTitle(s.snapshot).toLowerCase().includes(q.trim().toLowerCase()) || hostOf(s.snapshot.source?.url).includes(q.trim().toLowerCase())))
  if (!stories.length) return <Empty icon="layers" title="No stories yet" body="Start one from Engine (a link, a file or pasted text). Every story is kept here with its draft." />
  return (
    <>
      <label className="me-search"><Icon name="search" size={18} /><input type="search" className="m-input" placeholder="Search stories" aria-label="Search stories" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="m-chips is-scroll" role="group" aria-label="Filter by status">
        <Chip on={f === 'all'} onClick={() => setF('all')}>All <small>{stories.length}</small></Chip>
        {STORY_STATUSES.filter((s) => counts[s] > 0 || f === s).map((s) => <Chip key={s} on={f === s} onClick={() => setF(s)}>{STATUS_LABEL[s]} <small>{counts[s]}</small></Chip>)}
      </div>
      <div className="me-list">
        {shown.map((s) => <StoryRow key={s.id} s={s} active={s.id === activeId} />)}
        {!shown.length && <p className="me-hint">No stories match.</p>}
      </div>
    </>
  )
}

function PublishedList({ active }: { active: boolean }) {
  const live = useEditorialStore((s) => s.liveArticles)
  const online = useOnline()
  const busy = useDesk((s) => s.busy)
  const [state, setState] = useState<'idle' | 'loading' | 'done'>(live.length ? 'done' : 'idle')
  const [q, setQ] = useState('')
  // quiet on the automatic first load; a tap on sync always says what happened
  const load = async (said = false) => { setState('loading'); try { const r = await syncPublished(); if (said) snack(r.message, r.ok ? undefined : { tone: 'error' }) } finally { setState('done') } }
  // every visit refreshes quietly (at most every 20 s), so a story just published is there when you come back
  const lastLoad = useRef(0)
  useEffect(() => { if (active && online && state !== 'loading' && Date.now() - lastLoad.current > 20_000) { lastLoad.current = Date.now(); void load() } }, [active, online]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (a: LiveArticleSummary) => {
    if (await confirmAsk({ title: 'Open this article for editing?', body: `"${a.title}" opens as a story on the desk, linked to the live article: Publish will update it, never add a second copy. The story on the desk now stays in your list.`, confirm: 'Open for editing' })) void editLive(a)
  }
  const shown = live.filter((a) => !q.trim() || a.title.toLowerCase().includes(q.trim().toLowerCase()) || a.slug.includes(q.trim().toLowerCase()))
  if (!online && !live.length) return <ErrorState title="You are offline" body="Published stories load from esbpowerline.com when the phone is online." onRetry={() => void load()} />
  if (state === 'loading' && !live.length) return <Skeleton rows={5} thumb />
  if (state === 'done' && !live.length) return <ErrorState title="Could not load published stories" body="esbpowerline.com did not return its story feed. Check the connection and try again." onRetry={() => void load()} />
  return (
    <>
      {!online && <Banner tone="warn">Offline — this is the list from the last sync.</Banner>}
      <div className="me-searchrow">
        <label className="me-search"><Icon name="search" size={18} /><input type="search" className="m-input" placeholder="Search published" aria-label="Search published stories" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <IconBtn icon="refresh" label="Sync from esbpowerline.com" onClick={() => void load(true)} disabled={state === 'loading'} className={state === 'loading' ? 'me-spin' : ''} />
      </div>
      <div className="me-list">
        {shown.slice(0, 60).map((a) => {
          const c = catOf(a.category)
          return (
            <button key={a.slug || a.link} type="button" className="pb-row" onClick={() => { if (!busy) void open(a) }}>
              <Thumb src={a.imageUrl} cat={a.category} />
              <span className="pb-txt">
                <b className="pb-title" lang={/[ঀ-৿]/.test(a.title) ? 'bn' : undefined}>{a.title}</b>
                <span className="pb-meta">{c ? <><CatDot cat={c} size={20} /><CatName cat={c} /></> : <span>{a.category}</span>}</span>
                <PubTime raw={a.publishedAt} />
              </span>
              {busy === 'open' ? <span className="m-spin" aria-label="Opening" /> : <Icon name="chevRight" size={20} />}
            </button>
          )
        })}
        {!shown.length && <p className="me-hint">No published stories match.</p>}
      </div>
    </>
  )
}

function WireList({ onUse }: { onUse: (url: string) => void }) {
  const sources = useWire((s) => s.sources)
  const items = useWire((s) => s.items)
  const polling = useWire((s) => s.polling)
  const pollDue = useWire((s) => s.pollDue)
  const dismiss = useWire((s) => s.dismiss)
  const [q, setQ] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const now = Date.now()
  const phoneMode = getLinkFetchMode() === 'device'
  const shown = filterItems(items, q)
  const check = async () => {
    setNote(null)
    const r = await pollDue(Date.now())
    if (!r) { setNote('A check is already running.'); return }
    const parts = r.polled ? [`Checked ${r.polled} ${r.polled === 1 ? 'source' : 'sources'}`, `${r.added} new`] : [r.nextAt == null ? 'No source is switched on' : `Nothing due — next check ${relTime(r.nextAt, Date.now())}`]
    if (r.failed) parts.push(`${r.failed} failed`)
    setNote(parts.join(' · ') + '.')
  }
  return (
    <>
      {!phoneMode && (
        <Banner tone="planned" action={<Button kind="text" onClick={() => useNav.getState().openSettings('site')}>Settings</Button>}>
          Feeds are read only when Link fetching is set to “This phone” in Settings (the site route reads web pages, not feeds).
        </Banner>
      )}
      <div className="me-searchrow">
        <label className="me-search"><Icon name="search" size={18} /><input type="search" className="m-input" placeholder="Filter wire stories" aria-label="Filter wire stories" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <IconBtn icon="refresh" label="Check now" onClick={() => void check()} disabled={polling || !sources.length} className={polling ? 'me-spin' : ''} />
        <IconBtn icon="sliders" label="Feed sources" onClick={() => useUi.getState().openSheet('ed-wire-sources')} />
      </div>
      {note && <p className="me-hint" role="status">{note}</p>}
      {!sources.length ? (
        <div className="wr-empty">
          <span className="wr-empty-ico"><Icon name="inbox" size={28} /></span>
          <h3>No feed sources yet</h3>
          <p>Follow the sites you watch. New stories from them appear here.</p>
          <ol className="wr-steps">
            <li><i>1</i><span><b>Add a feed</b><small>RSS, Atom or a news sitemap address</small></span></li>
            <li><i>2</i><span><b>Check now</b><small>New stories are listed, newest first</small></span></li>
            <li><i>3</i><span><b>Tap a story</b><small>It opens as a new story to translate</small></span></li>
          </ol>
          <Button icon="plus" wide onClick={() => useUi.getState().openSheet('ed-wire-sources')}>Add a source</Button>
        </div>
      ) : (
        <div className="me-list">
          {shown.map((it) => (
            <div key={it.id} className="me-listrow">
              <Row title={it.title} meta={<span>{it.source} · {it.date ? relTime(Math.min(Date.parse(it.date), now), now) : `found ${relTime(Math.min(it.fetchedAt, now), now)}`}</span>} onClick={() => onUse(it.link)} />
              <IconBtn icon="x" label="Dismiss" onClick={() => dismiss(it.id)} />
            </div>
          ))}
          {!shown.length && <p className="me-hint">{items.length ? 'No stories match.' : 'No stories yet. Check now reads every source that is due.'}</p>}
        </div>
      )}
    </>
  )
}

export function WireSourcesSheet() {
  const sources = useWire((s) => s.sources)
  const add = useWire((s) => s.addSource)
  const update = useWire((s) => s.updateSource)
  const remove = useWire((s) => s.removeSource)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const now = Date.now()
  return (
    <Sheet id="ed-wire-sources" title="Feed sources" initial="half">
      <div className="me-stack">
        <p className="wr-help">Paste the RSS, Atom or news-sitemap address of a site you follow. New stories from it are listed in Wire, ready to start a story from.</p>
        <label className="m-field"><span className="m-field-label">Feed address (RSS, Atom or sitemap)</span><input type="url" inputMode="url" className="m-input" placeholder="https://site.com/feed.xml" value={url} onChange={(e) => { setUrl(e.target.value); setErr(null) }} spellCheck={false} /></label>
        <label className="m-field"><span className="m-field-label">Name (optional)</span><input type="text" className="m-input" placeholder="e.g. the site's name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {err && <Banner tone="error">{err}</Banner>}
        <Button icon="plus" disabled={!url.trim()} onClick={() => { const r = add({ url, name, intervalMin: DEFAULT_INTERVAL }); if (!r.ok) setErr(r.error); else { setUrl(''); setName('') } }}>Add source</Button>
        {sources.map((s) => {
          const st = sourceStatus(s, now)
          return (
            <div key={s.id} className="me-card">
              <div className="me-card-row"><b className="me-grow">{s.name || hostOf(s.url)}</b>
                <label className="me-switch"><input type="checkbox" role="switch" checked={s.enabled} onChange={(e) => update(s.id, { enabled: e.target.checked })} /><span>On</span></label>
                <IconBtn icon="trash" label={`Remove ${s.name || s.url}`} onClick={() => remove(s.id)} />
              </div>
              <p className="me-meta me-break">{s.url}</p>
              <label className="m-field"><span className="m-field-label">Check every (minutes, 15–360)</span>
                <input type="number" inputMode="numeric" className="m-input" min={15} max={360} step={5} defaultValue={s.intervalMin} onBlur={(e) => update(s.id, { intervalMin: Number(e.target.value) })} /></label>
              <p className={'me-meta' + (st.tone === 'warn' ? ' is-warn' : '')}>{st.text}</p>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

type WireSource = 'watch' | 'feeds'
const WIRE_SRC_KEY = 'esb-phone/wire/source'
function WireTab({ onUse, active }: { onUse: (url: string) => void; active: boolean }) {
  const [src, setSrc] = useState<WireSource>(() => (localStorage.getItem(WIRE_SRC_KEY) === 'feeds' ? 'feeds' : 'watch'))
  const pick = (v: WireSource) => { setSrc(v); try { localStorage.setItem(WIRE_SRC_KEY, v) } catch { /* not kept */ } }
  return (
    <div className="ew-tab">
      <div className="ew-source">
        <Segmented label="Wire source" value={src} onChange={pick} options={[{ value: 'watch', label: 'EnergyWatch' }, { value: 'feeds', label: 'My feeds' }]} />
      </div>
      {src === 'watch' ? <WatchList onUse={onUse} active={active} /> : <WireList onUse={onUse} />}
    </div>
  )
}

const TAB_TITLE: Record<HomeTab, string> = { stories: 'Stories', published: 'Published', wire: 'Wire' }

export function Landing({ active }: { active: boolean }) {
  const homeTab = useDesk((s) => s.homeTab)
  const set = useDesk((s) => s.set)
  const source = useEditorialStore((s) => s.source)
  const draft = useEditorialStore((s) => s.draft)
  const activeId = useStoryQueue((s) => s.activeId)
  const story = useStoryQueue((s) => s.stories.find((x) => x.id === s.activeId))
  const storyCount = useStoryQueue((s) => s.stories.length)
  const site = useEditorialStore((s) => s.siteStatus)
  const onDesk = hasStoryContent({ source, draft })
  const TABS3 = ['stories', 'published', 'wire']
  const lastTab = useRef(homeTab)
  const tabDir = lastTab.current === homeTab ? '' : TABS3.indexOf(homeTab) > TABS3.indexOf(lastTab.current) ? ' m-tab-fwd' : ' m-tab-back'
  useEffect(() => { lastTab.current = homeTab }, [homeTab])
  return (
    <>
      <TopBar title={TAB_TITLE[homeTab]} sub={site.connected ? undefined : <><i className="me-dot" aria-hidden />esbpowerline.com not reachable</>}
        actions={<IconBtn icon="activity" label="Activity" onClick={() => useUi.getState().openSheet('ed-activity')} />} overflow={homeMenu()} />
      <div className="m-scroll">
        <div className={'m-wrap me-home' + tabDir} key={homeTab}>
          {homeTab === 'stories' && (
            <>
              {onDesk && storyCount > 1 && (
                <section className="me-continue" aria-label="Continue editing">
                  <h2 className="me-h2">Continue editing</h2>
                  <Row tall onClick={() => set({ view: 'story' })} lead={<Thumb src={source?.images?.[0]?.src} />} title={draft.headline.trim() || source?.title || 'Untitled story'}
                    meta={<>{story && <StatusChip s={story.status} />}<span>{hostOf(source?.url)}{story ? ` · ${ago(story.updatedAt)}` : ''}</span></>} trail={<Icon name="chevRight" size={20} />} />
                </section>
              )}
              <h2 className="me-h2">All stories</h2>
              <StoriesList key={activeId ?? 'none'} />
              <Button kind="tonal" icon="plus" onClick={() => newStory('story')}>Write a blank story</Button>
            </>
          )}
          {homeTab === 'published' && <PublishedList active={active && homeTab === 'published'} />}
          {homeTab === 'wire' && <WireTab active={active} onUse={(u) => { newStory('intake'); set({ intakeTab: 'link', url: u, focusUrlAt: Date.now() }) }} />}
        </div>
      </div>
      <WireSourcesSheet />
      <WatchSettingsSheet />
    </>
  )
}
