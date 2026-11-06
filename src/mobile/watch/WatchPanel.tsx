// Wire → EnergyWatch: the office news & official government press release watcher, run on the phone (see watchStore.ts).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Icon, IconBtn, MenuButton, Row, Segmented, Sheet } from '../shell/ui'
import type { MenuItem } from '../shell/ui'
import { snack, useUi } from '../shell/core'
import { platform } from '../../platform/platform'
import { relTime } from '../../pc/editorial/wire'
import { PORTALS, PRESS_OFFICES, isPhoneFeed, trendingTopics, useWatch, visibleItems, type WatchCat, type WatchItem } from './watchStore'
import { EW_FEEDS, EW_PRESS_SOURCES } from './ewSources'
import { MAX_RANGE_DAYS, checkRange, useRange } from './rangeSearch'
import { PORTAL_BRANDS } from './portalBrands'
import { YeasinName } from './HoldLink'
import { usePullRefresh } from './usePullRefresh'
import './watch.css'

const CAT_LABEL: Record<WatchCat, string> = {
  energy: 'Energy & Power',
  leadership: 'PM & President',
  press: 'Official Press',
}

/** A portal's or government office's own favicon (its letter on a grey tile when it has none). */
export function PortalIcon({ name, size = 16 }: { name: string; size?: number }) {
  const b = PORTAL_BRANDS[name]
  const tile = Math.round(size * 1.25)
  return (
    <span className={'ew-favicon' + (b?.icon ? '' : ' is-letter')} style={{ width: tile, height: tile, borderRadius: Math.round(tile * 0.28), fontSize: size * 0.7 }} aria-hidden>
      {b?.icon ? <img src={b.icon} width={size} height={size} alt="" loading="lazy" /> : name.slice(0, 1)}
    </span>
  )
}
/** The portal's or office's name in its own brand colour (ink when its mark is black or grey), after its favicon. */
export function PortalName({ name }: { name: string }) {
  const c = PORTAL_BRANDS[name]?.color
  return <span className={'ew-src' + (c ? '' : ' is-ink')} style={c ? ({ '--src': c } as React.CSSProperties) : undefined}><PortalIcon name={name} /><span className="ew-src-name">{name}</span></span>
}

/** EnergyWatch's own mark, as Yeasin drew it (public/favicon.svg and .brand-mark in app.css): a white bolt on a teal-to-navy tile. */
export function EwMark({ size = 44 }: { size?: number }) {
  return (
    <span className="ew-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }} aria-hidden>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.53)} height={Math.round(size * 0.53)}><path d="M13 3 6 14h5l-1 7 7-11h-5z" fill="#fff" /></svg>
    </span>
  )
}
/** The name as EnergyWatch writes it: "Energy" in ink, "Watch" in its teal. */
export const EwName = () => <span className="ew-name">Energy<span>Watch</span></span>

const fmtWhen = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).replace(',', '')
const WINDOWS = [1, 3, 6, 12, 24]
const windowLabel = (h: number) => (h === 1 ? 'Last hour' : `Last ${h} hours`)

/** Bangla letters: the headline gets lang="bn" so it is set in Hind Siliguri at Bangla line spacing (no clipped marks). */
const BN = /[ঀ-৿]/

const feedKind = (url: string) => /news\.google\./.test(url) ? 'Google News' : /bing\.com/.test(url) ? 'Bing News' : /\/site\/view\//.test(url) ? 'National Portal' : 'own feed'

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`m-switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}><span /></button>
}

function useAutoCheck(active: boolean) {
  const autoMin = useWatch((s) => s.prefs.autoMin)
  useEffect(() => {
    if (!active) return
    const tick = () => {
      const { lastRun, running, run } = useWatch.getState()
      if (document.visibilityState !== 'visible' || running) return
      const every = (useWatch.getState().prefs.autoMin || 0) * 60_000
      if (lastRun == null || (every > 0 && Date.now() - lastRun >= every)) void run()
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [active, autoMin])
}

export function WatchList({ onUse, active }: { onUse: (url: string) => void; active: boolean }) {
  const items = useWatch((s) => s.items)
  const hidden = useWatch((s) => s.hidden)
  const prefs = useWatch((s) => s.prefs)
  const running = useWatch((s) => s.running)
  const lastRun = useWatch((s) => s.lastRun)
  const newKeys = useWatch((s) => s.newKeys)
  const feeds = useWatch((s) => s.feeds)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const searchOpen = searching || !!q
  const [cat, setCat] = useState<'all' | WatchCat>('all')
  const [, tick] = useState(0)
  useAutoCheck(active)
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(id) }, [])

  const range = useRange((s) => s.range)
  const isNew = useMemo(() => new Set(range ? [] : newKeys), [newKeys, range])
  const effectivePrefs = useMemo(() => (range ? { ...prefs, maxAgeH: 24 * 365 } : prefs), [range, prefs])
  const sourcePool = range ? range.items : items

  // Unqueried pool for the active category so Trending pills show the top topics inside the selected category
  const catPoolNoQuery = useMemo(
    () => visibleItems(sourcePool, hidden, effectivePrefs, '', cat, isNew),
    [sourcePool, hidden, effectivePrefs, cat, isNew],
  )
  const trending = useMemo(() => trendingTopics(catPoolNoQuery, cat, 8), [catPoolNoQuery, cat])

  // Counts for each category chip (respecting active search/topic filter)
  const catCounts = useMemo(() => {
    const allList = visibleItems(sourcePool, hidden, effectivePrefs, q, 'all', isNew)
    const energyList = visibleItems(sourcePool, hidden, effectivePrefs, q, 'energy', isNew)
    const leadList = visibleItems(sourcePool, hidden, effectivePrefs, q, 'leadership', isNew)
    const pressList = visibleItems(sourcePool, hidden, effectivePrefs, q, 'press', isNew)
    return {
      all: allList.length,
      energy: energyList.length,
      leadership: leadList.length,
      press: pressList.length,
      byCat: { all: allList, energy: energyList, leadership: leadList, press: pressList },
    }
  }, [sourcePool, hidden, effectivePrefs, q, isNew])

  const shown = catCounts.byCat[cat]
  const now = Date.now()
  const fresh = shown.filter((x) => isNew.has(x.key)).length
  const off = new Set(prefs.portalsOff)
  const live = EW_FEEDS.filter((f) => isPhoneFeed(f) && !off.has(f.name))
  const failed = live.filter((f) => feeds[f.id] && !feeds[f.id].ok).length

  const markAll = () => {
    const before = useWatch.getState().newKeys
    useWatch.getState().markAllRead()
    snack(`${before.length} marked as read`, { action: { label: 'Undo', run: () => useWatch.setState({ newKeys: before }) }, tone: 'success' })
  }
  const ptr = usePullRefresh(() => (range ? useRange.getState().search(range.from, range.to) : check()), active)
  const check = async () => {
    const r = await useWatch.getState().run()
    if (!r) return
    if (r.failed > r.checked / 2) snack(`Most portals did not answer (${r.failed} of ${r.checked}). Check the connection.`)
    else snack(r.added ? `${r.added} new ${r.added === 1 ? 'headline' : 'headlines'}` : 'No new headlines', { icon: 'newspaper' })
  }
  // tapping the News tab again while it is open refreshes, like a pull-down: back to the top, then the same check
  // the refresh button runs (ignored while a check or a range search is already running)
  const refreshRef = useRef<() => void>(() => {})
  useEffect(() => { refreshRef.current = () => {
    if (range ? range.running : running) return
    const sc = ptr.host.current?.closest('.m-scroll') as HTMLElement | null
    sc?.scrollTo({ top: 0, behavior: 'smooth' })
    try { navigator.vibrate?.(10) } catch { /* no haptics */ }
    void (range ? useRange.getState().search(range.from, range.to) : check())
  } })
  useEffect(() => {
    if (!active) return
    const on = () => refreshRef.current()
    window.addEventListener('esb:news-refresh', on)
    return () => window.removeEventListener('esb:news-refresh', on)
  }, [active])
  const use = (x: WatchItem) => {
    useWatch.getState().markRead(x.key)
    onUse(x.link)
  }
  const menu = (x: WatchItem): MenuItem[] => [
    { label: 'Start a story from it', icon: 'filePlus' as const, onClick: () => use(x) },
    { label: 'Open in the browser', icon: 'externalLink', onClick: () => void platform().openExternal(x.link) },
    { label: 'Copy link', icon: 'copy', onClick: () => { void navigator.clipboard?.writeText(x.link).then(() => snack('Link copied'), () => snack('Could not copy')) } },
    ...(isNew.has(x.key) ? [{ label: 'Mark as read', icon: 'check' as const, onClick: () => useWatch.getState().markRead(x.key) }] : []),
    { label: 'Hide', icon: 'eyeOff', onClick: () => { useWatch.getState().hide(x.key); snack('Headline hidden', { icon: 'eyeOff', action: { label: 'Undo', run: () => useWatch.getState().unhide(x.key) } }) } },
  ]
  const cats: ('all' | WatchCat)[] = ['all', ...(['energy', 'leadership', 'press'] as WatchCat[]).filter((c) => prefs.show[c] !== false)]
  const inCat = (c: 'all' | WatchCat) => catCounts[c]
  const timeMenu: MenuItem[] = [
    ...WINDOWS.map((h) => ({ label: windowLabel(h), lead: `${h}h`, checked: !range && prefs.maxAgeH === h, onClick: () => { useRange.getState().clear(); useWatch.getState().setPrefs({ maxAgeH: h }) } })),
    { divider: true, label: '', onClick: () => {} },
    { label: 'Pick dates and times', icon: 'calendar', checked: !!range, onClick: () => useUi.getState().openSheet('ew-range') },
    { divider: true, label: '', onClick: () => {} },
    { label: 'Mark all as read', icon: 'checkDouble', disabled: !fresh, onClick: markAll },
  ]
  const pct = range && range.total ? Math.round((range.done / range.total) * 100) : 0

  return (
    <div className="ew" ref={ptr.host}>
      <section className="ew-head" aria-label="EnergyWatch">
        <div className="ew-head-top">
          <EwMark />
          <span className="ew-title"><span className="ew-title-row"><b><EwName /></b>
            {range ? (
              range.running ? <span className="ew-st"><i className="ew-live is-busy" aria-hidden />Searching {pct}%</span> : <span className="ew-st"><i className="ew-live" aria-hidden />{range.items.length} found{range.failed ? <> · <b className="ew-warn">{range.failed} failed</b></> : null}</span>
            ) : (
              <span className="ew-st"><i className={'ew-live' + (running ? ' is-busy' : failed ? ' is-warn' : '')} aria-hidden />
                {running ? <>Reading</> : lastRun ? <>{relTime(Math.min(lastRun, now), now)}{failed ? <> · <b className="ew-warn">{failed} down</b></> : null}</> : <>Not checked yet</>}
              </span>
            )}
            </span><small>by <YeasinName /></small></span>
          <IconBtn icon="sliders" label="EnergyWatch settings" onClick={() => useUi.getState().openSheet('ew-settings')} className="ew-ibtn" />
        </div>
        <div className="ew-bar2" role="status">
          <MenuButton icon="clock" label="Time range" items={timeMenu} className="ew-when">
            <span>{range ? 'Dates' : cat === 'press' ? 'Official releases' : prefs.maxAgeH === 1 ? '1 hour' : `${prefs.maxAgeH} hours`}</span><Icon name="chevDown" size={14} />
          </MenuButton>
          <span className="ew-grow" />
          {fresh > 0 && !running && !range && <button type="button" className="ew-new" onClick={markAll} aria-label={`${fresh} new: mark all as read`}>{fresh} new<Icon name="checkDouble" size={14} /></button>}
          <button type="button" className={'ew-tool' + (searchOpen ? ' is-on' : '')} aria-label="Search headlines" onClick={() => setSearching((v) => !v || !!q)}><Icon name="search" size={18} /></button>
          <button type="button" ref={ptr.ring} className={'ew-refresh' + ((range ? range.running : running) || ptr.busy ? ' is-busy' : '')} aria-label={range ? 'Search this range again' : 'Check now'}
            disabled={range ? range.running : running} onClick={() => void (range ? useRange.getState().search(range.from, range.to) : check())}>
            <Icon name="refresh" size={18} />
          </button>
        </div>
        {range && (
          <div className="ew-range">
            <button type="button" className="ew-range-txt" onClick={() => useUi.getState().openSheet('ew-range')}>
              <Icon name="calendar" size={16} /><span><b>{fmtWhen(range.from)}</b> to <b>{fmtWhen(range.to)}</b></span>
            </button>
            <IconBtn icon="x" label="Back to the latest" onClick={() => useRange.getState().clear()} className="ew-range-x" />
            {range.running && <span className="ew-bar" style={{ '--p': `${pct}%` } as React.CSSProperties} aria-hidden />}
          </div>
        )}
      </section>

      <div className="ew-tools">
        {cats.length > 1 && (
          <div className="ew-chips" role="group" aria-label="Categories">
            {cats.map((c) => (
              <button key={c} type="button" className={'ew-chip' + (cat === c ? ' is-on' : '') + (c !== 'all' ? ` is-${c}` : '')} aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c === 'leadership' && <Icon name="users" size={14} />}
                {c === 'press' && <Icon name="shield" size={14} />}
                {c === 'all' ? 'All headlines' : CAT_LABEL[c]}
                <small>{inCat(c)}</small>
              </button>
            ))}
          </div>
        )}
        {searchOpen && (
          <div className="ew-search">
            <Icon name="search" size={17} />
            <input type="search" autoFocus placeholder="Search headlines, topics or portals" aria-label="Search headlines" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="ew-search-x" aria-label="Close search" onClick={() => { setQ(''); setSearching(false) }}><Icon name="x" size={16} /></button>
          </div>
        )}
        {trending.length > 0 && (
          <div className="ew-trend" role="group" aria-label="Trending topics">
            <span className="ew-trend-h"><Icon name="trendingUp" size={14} />{cat === 'press' ? 'Offices' : 'Trending'}</span>
            {trending.map(([t, n]) => {
              const activeChip = q.trim().toLowerCase() === t.toLowerCase()
              return (
                <button key={t} type="button" className={'ew-trend-chip' + (activeChip ? ' is-on' : '')} aria-pressed={activeChip} onClick={() => setQ(activeChip ? '' : t)}>
                  {t}<small>{n}</small>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="me-list ew-list">
        {shown.map((x) => (
          <div key={x.key} className={'me-listrow' + (isNew.has(x.key) ? ' ew-is-new' : '')}>
            {isNew.has(x.key) && <span className="ew-ribbon" aria-label="New">NEW</span>}
            <Row title={<span className="ew-hl" lang={BN.test(x.title) ? 'bn' : 'en'}>{x.title}</span>} onClick={() => use(x)}
              meta={
                <span className="ew-meta">
                  <PortalName name={x.source} />
                  <span className="ew-time">{x.published ? (range || cat === 'press' ? fmtWhen(Date.parse(x.published)) : relTime(Math.min(Date.parse(x.published), now), now)) : `found ${relTime(Math.min(x.foundAt, now), now)}`}</span>
                  {x.categories.includes('press') && <span className="ew-tag is-press" title="Official Government Press Release" aria-label="Official Press"><Icon name="shield" size={12} /></span>}
                  {x.categories.includes('leadership') && <span className="ew-tag" title="PM & President" aria-label="PM & President"><Icon name="users" size={13} /></span>}
                </span>
              } />
            <MenuButton icon="more" label="More" items={menu(x)} className="ew-more" />
          </div>
        ))}
        {!shown.length && (
          <div className="wr-empty">
            <EwMark size={56} />
            <h3>{range?.running || (!range && running) ? 'Reading the portals' : catCounts.all || items.length || range ? 'Nothing matches' : <EwName />}</h3>
            <p>{range ? (range.running ? 'Headlines appear here as each portal answers.' : 'No Energy & Power or PM & President headlines in this range. Try a wider one.') : cat === 'press' && !items.some((x) => x.categories.includes('press')) ? 'Tap Check now to scan official Bangladesh government ministry & utility press wings.' : items.length ? 'Try another category, topic pill, or a longer time range.' : `Energy & Power, PM & President, and Official Press headlines from ${PORTALS.length} Bangladeshi portals and ${PRESS_OFFICES.length} government offices. Runs on this phone, anywhere with internet.`}</p>
            {(!items.length || (cat === 'press' && !items.some((x) => x.categories.includes('press')))) && !running && !range && <Button icon="refresh" wide onClick={() => void check()}>Check now</Button>}
          </div>
        )}
      </div>
    </div>
  )
}

function WordList({ title, help, words, onChange, placeholder }: { title: string; help: string; words: string[]; onChange: (w: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('')
  const add = () => { const t = v.trim(); if (!t) return; if (!words.some((w) => w.toLowerCase() === t.toLowerCase())) onChange([...words, t]); setV('') }
  return (
    <div className="ew-words">
      <h3 className="ew-h">{title}</h3>
      <p className="ew-help">{help}</p>
      <div className="ew-addfield">
        <input value={v} placeholder={placeholder} aria-label={title} enterKeyHint="done" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="ew-addbtn" disabled={!v.trim()} onClick={add} aria-label={`Add to ${title.toLowerCase()}`}><Icon name="plus" size={20} /></button>
      </div>
      {words.length > 0 && (
        <div className="ew-wordchips">
          {words.map((w) => <button key={w} type="button" className="ew-word" onClick={() => onChange(words.filter((x) => x !== w))} aria-label={`Remove ${w}`}>{w}<Icon name="x" size={14} /></button>)}
        </div>
      )}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const timeOf = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const at = (d: string, t: string) => (d ? new Date(`${d}T${t || '00:00'}`).getTime() : NaN)
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

function RangeSheet() {
  const range = useRange((s) => s.range)
  const open = useUi((s) => s.sheet === 'ew-range')
  const [fd, setFd] = useState(''), [ft, setFt] = useState(''), [td, setTd] = useState(''), [tt, setTt] = useState('')
  const fill = (from: number, to: number) => { setFd(dateOf(from)); setFt(timeOf(from)); setTd(dateOf(to)); setTt(timeOf(to)) }
  useEffect(() => {
    if (!open) return
    const now = Date.now()
    if (range) fill(range.from, range.to); else fill(now - 86400_000, now)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const from = at(fd, ft), to = at(td, tt)
  const err = fd && td ? checkRange(from, to) : 'Pick both a start and an end.'
  const now = Date.now()
  const presets: [string, () => void][] = [
    ['Today', () => fill(startOfDay(now), now)],
    ['Yesterday', () => fill(startOfDay(now) - 86400_000, startOfDay(now) - 60_000)],
    ['Last 3 days', () => fill(now - 3 * 86400_000, now)],
    ['Last 7 days', () => fill(now - 7 * 86400_000, now)],
  ]
  const go = () => { if (err) return; useUi.getState().closeSheet('ew-range'); void useRange.getState().search(from, to) }
  return (
    <Sheet id="ew-range" title="Pick dates and times" initial="full"
      footer={<Button kind="filled" icon="search" wide disabled={!!err} onClick={go}>Find headlines</Button>}>
      <div className="me-stack ew-settings">
        <p className="ew-help">Every Energy & Power and PM & President headline the portals published between these two moments, up to {MAX_RANGE_DAYS} days.</p>
        <div className="ew-presets">{presets.map(([l, f]) => <button key={l} type="button" className="ew-chip" onClick={f}>{l}</button>)}</div>
        <h3 className="ew-h">From</h3>
        <div className="ew-dt">
          <label className="ew-field"><Icon name="calendar" size={18} /><input type="date" value={fd} max={dateOf(now)} onChange={(e) => setFd(e.target.value)} aria-label="Start date" /></label>
          <label className="ew-field"><Icon name="clock" size={18} /><input type="time" value={ft} onChange={(e) => setFt(e.target.value)} aria-label="Start time" /></label>
        </div>
        <h3 className="ew-h">To</h3>
        <div className="ew-dt">
          <label className="ew-field"><Icon name="calendar" size={18} /><input type="date" value={td} max={dateOf(now)} onChange={(e) => setTd(e.target.value)} aria-label="End date" /></label>
          <label className="ew-field"><Icon name="clock" size={18} /><input type="time" value={tt} onChange={(e) => setTt(e.target.value)} aria-label="End time" /></label>
        </div>
        {!err && <p className="ew-sum"><Icon name="check" size={16} /><span><b>{fmtWhen(from)}</b> to <b>{fmtWhen(to)}</b></span></p>}
        {err && fd && td && <p className="ew-sum is-bad"><Icon name="alert" size={16} /><span>{err}</span></p>}
        <p className="ew-help">Older headlines are searched on Google News, portal by portal, and can start a story directly when tapped.</p>
      </div>
    </Sheet>
  )
}

export function WatchSettingsSheet() {
  return <><SettingsSheet /><RangeSheet /></>
}

function SettingsSheet() {
  const prefs = useWatch((s) => s.prefs)
  const setPrefs = useWatch((s) => s.setPrefs)
  const feeds = useWatch((s) => s.feeds)
  const off = new Set(prefs.portalsOff)
  const portalState = (name: string) => {
    const fs = EW_FEEDS.filter((f) => isPhoneFeed(f) && f.name === name)
    const st = fs.map((f) => feeds[f.id]).filter(Boolean)
    if (!st.length) return 'Not checked yet'
    const badFeeds = fs.filter((f) => feeds[f.id] && !feeds[f.id].ok)
    const bad = badFeeds.length
    const why = badFeeds.map((f) => `${feedKind(f.url)}: ${feeds[f.id].error}`).join(' · ')
    return bad === st.length ? `Not answering · ${why}` : bad ? `${fs.length - bad} of ${fs.length} feeds answer · ${why}` : `${fs.length} ${fs.length === 1 ? 'feed' : 'feeds'} · fine`
  }
  const pressState = (name: string, office: string) => {
    const ps = EW_PRESS_SOURCES.filter((s) => s.on && s.name === name)
    const st = ps.map((s) => feeds[s.id]).filter(Boolean)
    if (!st.length) return office
    const ok = st.filter((s) => s.ok).length
    return ok > 0 ? `${office} · active` : `${office} · waiting`
  }
  return (
    <Sheet id="ew-settings" title="EnergyWatch" initial="full">
      <div className="me-stack ew-settings">
        <div className="ew-credit"><EwMark /><span><b><EwName /></b><small>Made by <YeasinName /> for ESB Power Line</small></span></div>
        <p className="ew-help">The office news and official government press release watcher, running on this phone. Its portals, ministry press wings and keyword rules come from EnergyWatch; your changes here stay on this phone.</p>

        <h3 className="ew-h">Show</h3>
        <div className="ew-card">
          <Row title="Energy & Power" meta="Electricity, gas, fuel, LNG, LPG, power plants and utilities" trail={<Switch on={prefs.show.energy !== false} label="Energy & Power" onChange={(v) => setPrefs({ show: { ...prefs.show, energy: v } })} />} />
          <Row title="PM & President" meta="Bangladesh's Prime Minister and President (foreign leaders are left out)" trail={<Switch on={prefs.show.leadership !== false} label="PM and President" onChange={(v) => setPrefs({ show: { ...prefs.show, leadership: v } })} />} />
          <Row title="Official Press Releases" meta="Official press wings & notices from Power Division, EMRD, BERC, SREDA, PMO, Bangabhaban, BPDB, Petrobangla, BPC, BREB, PGCB & state offices" trail={<Switch on={prefs.show.press !== false} label="Official Press Releases" onChange={(v) => setPrefs({ show: { ...prefs.show, press: v } })} />} />
        </div>

        <h3 className="ew-h">Headlines from the last</h3>
        <Segmented label="Headlines from the last" value={String(prefs.maxAgeH)} onChange={(v) => { useRange.getState().clear(); setPrefs({ maxAgeH: Number(v) }) }}
          options={WINDOWS.map((h) => ({ value: String(h), label: h === 1 ? '1 hour' : `${h} hrs` }))} />

        <h3 className="ew-h">Check by itself while News is open</h3>
        <Segmented label="Check by itself" value={String(prefs.autoMin)} onChange={(v) => setPrefs({ autoMin: Number(v) })}
          options={[{ value: '0', label: 'Off' }, { value: '5', label: '5 min' }, { value: '10', label: '10 min' }, { value: '30', label: '30 min' }]} />

        <WordList title="Always show headlines with" help="Your own words, on top of EnergyWatch's list. English matches whole words; Bangla matches inside words, so বিদ্যুৎ also finds বিদ্যুতের."
          words={prefs.keep} onChange={(keep) => setPrefs({ keep })} placeholder="e.g. Rooppur, সৌরবিদ্যুৎ" />
        <WordList title="Never show headlines with" help="A headline with any of these is left out, whatever else it says."
          words={prefs.never} onChange={(never) => setPrefs({ never })} placeholder="e.g. cricket" />

        <h3 className="ew-h">Official Government Press Wings <small>{PRESS_OFFICES.filter((p) => !off.has(p.name)).length} of {PRESS_OFFICES.length} on</small></h3>
        <div className="ew-card">
          {PRESS_OFFICES.map((p) => (
            <Row key={p.name} lead={<PortalIcon name={p.name} size={24} />} title={p.name} meta={pressState(p.name, p.office)}
              trail={<Switch on={!off.has(p.name)} label={p.name} onChange={(v) => setPrefs({ portalsOff: v ? prefs.portalsOff.filter((n) => n !== p.name) : [...prefs.portalsOff, p.name] })} />} />
          ))}
        </div>

        <h3 className="ew-h">Media Portals <small>{PORTALS.filter((p) => !off.has(p.name)).length} of {PORTALS.length} on</small></h3>
        <div className="ew-card">
          {PORTALS.map((p) => (
            <Row key={p.name} lead={<PortalIcon name={p.name} size={24} />} title={p.name} meta={portalState(p.name)}
              trail={<Switch on={!off.has(p.name)} label={p.name} onChange={(v) => setPrefs({ portalsOff: v ? prefs.portalsOff.filter((n) => n !== p.name) : [...prefs.portalsOff, p.name] })} />} />
          ))}
        </div>
        <Button kind="text" icon="reset" onClick={() => { useWatch.getState().resetPrefs(); snack('EnergyWatch settings restored') }}>Restore EnergyWatch's settings</Button>
      </div>
    </Sheet>
  )
}
