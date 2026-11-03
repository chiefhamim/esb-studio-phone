import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { newDraft, type Draft } from './drafts'
import { countByFilter, FILTERS, visibleStories, type QueueFilter } from './shell/queue'
import StoryCard from './shell/StoryCard'
import NewStorySheet from './shell/NewStorySheet'
import Snackbar, { type Toast } from './shell/Snackbar'
import { IconPlus, IconSearch, IconStories } from './shell/icons'
import { useBackClose } from './shell/back'

interface Props {
  drafts: Draft[]
  currentId: string | null
  onOpen: (d: Draft) => void
  /** add a new draft and open it */
  onCreate: (d: Draft) => void
  /** add or restore a draft without opening it (Duplicate, Undo) */
  onAdd: (d: Draft) => void
  onRemove: (id: string) => void
}

/** Home: the story queue, newest first, with search, status filters, swipe actions and a New story sheet. */
export default function Stories({ drafts, currentId, onOpen, onCreate, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [sheet, setSheet] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const closeSheet = useCallback(() => setSheet(false), [])
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

  return (
    <div className="sh-home">
      <div className="sh-home-top">
        <div className="sh-title-row">
          <h1>Stories</h1>
          {drafts.length > 0 && <span className="sh-count">{counts.all}</span>}
        </div>
        {drafts.length > 0 && (
          <>
            <label className="sh-search">
              <IconSearch />
              <input type="search" enterKeyHint="search" autoComplete="off" placeholder="Search headline or text" aria-label="Search stories" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="sh-chips" role="group" aria-label="Filter stories">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className="sh-fchip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}<b>{counts[f.id]}</b>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="sh-scroll" onClick={(e) => { if (e.target === e.currentTarget) setOpenId(null) }}>
        {drafts.length === 0 ? (
          <div className="sh-empty">
            <span className="sh-empty-ico"><IconStories /></span>
            <h2>No stories yet</h2>
            <p>Start from a link or the article text. You can also share a link from another app to ESB Studio and it lands here.</p>
            <button type="button" className="sh-btn sh-btn-primary" onClick={() => setSheet(true)}><IconPlus /> New story</button>
          </div>
        ) : list.length === 0 ? (
          <div className="sh-empty">
            <h2>Nothing matches</h2>
            <p>{query ? `No story contains “${query}”` : 'No stories with this status'}{filter !== 'all' && query ? ' in this filter' : ''}.</p>
            <button type="button" className="sh-btn" onClick={() => { setQuery(''); setFilter('all') }}>Show all stories</button>
          </div>
        ) : (
          <ul className="sh-list">
            {list.map((d) => (
              <StoryCard key={d.id} draft={d} now={now} current={d.id === currentId} open={openId === d.id}
                onOpenChange={(o) => setOpenId(o ? d.id : (openId === d.id ? null : openId))}
                onOpen={() => onOpen(d)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} />
            ))}
          </ul>
        )}
      </div>

      {drafts.length > 0 && <button type="button" className="sh-fab" onClick={() => setSheet(true)}><IconPlus /><span>New story</span></button>}
      <Snackbar toast={toast} onDone={() => setToast(null)} />
      {sheet && <NewStorySheet onClose={closeSheet} onCreate={(d) => { setSheet(false); onCreate(d) }} />}
    </div>
  )
}
