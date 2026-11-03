import { useEffect, useMemo, useRef, useState } from 'react'
import { newDraft, type Draft } from './drafts'
import { countByFilter, FILTERS, visibleStories, type QueueFilter } from './shell/queue'
import StoryCard from './shell/StoryCard'
import Launcher from './home/Launcher'
import Snackbar, { type Toast } from './shell/Snackbar'
import { IconFolder, IconPlus, IconSearch } from './shell/icons'
import { useBackClose } from './shell/back'
import { ExtendedFAB } from './ui/kit/ExtendedFAB'

interface Props {
  drafts: Draft[]
  currentId: string | null
  onOpen: (d: Draft) => void
  /** add or restore a draft without opening it (Duplicate, Undo) */
  onAdd: (d: Draft) => void
  onRemove: (id: string) => void
  /** Editorial tile: open the story desk (link or text intake) */
  onEditorial: () => void
  /** Graphics tile: start a blank banner story */
  onGraphics: () => void
}

/** Home: the launcher (Editorial, Graphics) and Recent stories, newest first, with search, status filters and swipe actions. */
export default function Stories({ drafts, currentId, onOpen, onAdd, onRemove, onEditorial, onGraphics }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  useBackClose(openId !== null, () => setOpenId(null))

  const counts = useMemo(() => countByFilter(drafts), [drafts])
  const list = useMemo(() => visibleStories(drafts, filter, query), [drafts, filter, query])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(t) }, [])
  const seq = useRef(0)
  const say = (text: string, undo?: () => void) => setToast({ id: ++seq.current, text, undo })

  function remove(d: Draft) {
    onRemove(d.id)
    say('Story deleted', () => onAdd(d))
  }
  function duplicate(d: Draft) {
    const c = { ...newDraft(d.sourceUrl, d.source), headline: d.headline, deck: d.deck, body: d.body, category: d.category, slug: '', translated: d.translated }
    onAdd(c)
    say('Story duplicated (the banner photo is not copied)')
  }

  const showSearchTools = drafts.length > 0 && (searchOpen || query.trim() !== '' || filter !== 'all')

  return (
    <div className="hm-home" onClick={(e) => { if (e.target === e.currentTarget) setOpenId(null) }}>
      <Launcher onEditorial={onEditorial} onGraphics={onGraphics} />

      <section className="hm-section" aria-labelledby="hm-recent-h">
        <div className="hm-sec-head">
          <h2 className="hm-sec-title" id="hm-recent-h">Recent stories</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            {drafts.length > 0 && <span className="hm-sec-count">{counts.all}</span>}
            {drafts.length > 0 && (
              <button
                type="button"
                className="kit-iconbtn"
                style={{ width: 36, height: 36 }}
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="Toggle search and filters"
              >
                <IconSearch />
              </button>
            )}
          </div>
        </div>

        {showSearchTools && (
          <div className="hm-tools">
            <label className="sh-search">
              <IconSearch />
              <input
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Search headline or text"
                aria-label="Search stories"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus={searchOpen}
              />
            </label>
            <div className="sh-chips" role="group" aria-label="Filter stories">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="sh-fchip"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}<b>{counts[f.id]}</b>
                </button>
              ))}
            </div>
          </div>
        )}

        {drafts.length === 0 ? (
          <div className="hm-empty">
            <IconFolder />
            <strong>Nothing started yet</strong>
            <span>Stories you start or share in from another app appear here.</span>
          </div>
        ) : list.length === 0 ? (
          <div className="hm-empty">
            <strong>Nothing matches</strong>
            <span>{query ? `No story contains “${query}”` : 'No stories with this status'}{filter !== 'all' && query ? ' in this filter' : ''}.</span>
            <button type="button" className="sh-btn" onClick={() => { setQuery(''); setFilter('all'); setSearchOpen(false) }}>Show all stories</button>
          </div>
        ) : (
          <ul className="sh-list" style={{ paddingBottom: 'calc(var(--sp-9) + var(--sp-4))' }}>
            {list.map((d) => (
              <StoryCard key={d.id} draft={d} now={now} current={d.id === currentId} open={openId === d.id}
                onOpenChange={(o) => setOpenId(o ? d.id : (openId === d.id ? null : openId))}
                onOpen={() => onOpen(d)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} />
            ))}
          </ul>
        )}
      </section>

      <ExtendedFAB
        icon={<IconPlus />}
        label="New story"
        onClick={onEditorial}
      />

      <Snackbar toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}
