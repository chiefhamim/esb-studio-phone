import { useEffect, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import { CATEGORIES } from '../banner/tokens'
import { categoryIdOf } from '../banner/categories'
import { loadPhoto } from '../banner/photos'
import { CatMark, IconCopy, IconTrash } from './icons'
import { isBangla, relativeTime, STATUS_LABEL, statusOf, SWIPE_ACTIONS_W, swipeOffset, swipeSettles, isHorizontalSwipe, titleOf } from './queue'

/** Banner photo for a draft, if one was saved (IndexedDB). The object URL is released when the card goes away. */
function useThumb(id: string, stamp: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let dead = false
    let made: string | null = null
    loadPhoto(id).then((b) => {
      if (dead || !b) return
      made = URL.createObjectURL(b)
      setUrl(made)
    }).catch(() => {})
    return () => { dead = true; if (made) URL.revokeObjectURL(made); setUrl(null) }
  }, [id, stamp])
  return url
}

interface Props {
  draft: Draft
  now: number
  current: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}

const LONG_PRESS_MS = 450

export default function StoryCard({ draft, now, current, open, onOpenChange, onOpen, onDuplicate, onDelete }: Props) {
  const cat = CATEGORIES.find((c) => c.id === categoryIdOf(draft.category))
  const status = statusOf(draft)
  const title = titleOf(draft)
  const thumb = useThumb(draft.id, draft.updatedAt)
  const cardRef = useRef<HTMLDivElement>(null)
  const g = useRef<{ x: number; y: number; t: number; lastX: number; lastT: number; v: number; drag: boolean; moved: boolean; timer: number } | null>(null)
  const swallow = useRef(false)

  const clearTimer = () => { if (g.current) { window.clearTimeout(g.current.timer); g.current.timer = 0 } }

  function down(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('.sh-more')) return
    clearTimer()
    const t = performance.now()
    const timer = window.setTimeout(() => {
      if (g.current && !g.current.drag && !g.current.moved) { swallow.current = true; navigator.vibrate?.(8); onOpenChange(true) }
    }, LONG_PRESS_MS)
    g.current = { x: e.clientX, y: e.clientY, t, lastX: e.clientX, lastT: t, v: 0, drag: false, moved: false, timer }
  }
  function move(e: React.PointerEvent) {
    const s = g.current
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.drag) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { s.moved = true; clearTimer() }
      if (!isHorizontalSwipe(dx, dy)) return
      s.drag = true
      e.currentTarget.setPointerCapture(e.pointerId)
      cardRef.current?.classList.add('sh-dragging')
    }
    const t = performance.now()
    if (t > s.lastT) s.v = (e.clientX - s.lastX) / (t - s.lastT)
    s.lastX = e.clientX; s.lastT = t
    if (cardRef.current) cardRef.current.style.transform = `translate3d(${swipeOffset(open, dx)}px,0,0)`
  }
  function up(e: React.PointerEvent) {
    const s = g.current
    g.current = null
    if (!s) return
    clearTimer()
    if (s.drag) {
      swallow.current = true
      const off = swipeOffset(open, e.clientX - s.x)
      const el = cardRef.current
      el?.classList.remove('sh-dragging')
      if (el) el.style.transform = ''
      onOpenChange(swipeSettles(off, s.v))
    }
  }
  function cancel() {
    clearTimer()
    g.current = null
    const el = cardRef.current
    el?.classList.remove('sh-dragging')
    if (el) el.style.transform = ''
  }
  function click() {
    if (swallow.current) { swallow.current = false; return }
    if (open) { onOpenChange(false); return }
    onOpen()
  }

  const lang = isBangla(title) ? 'bn' : 'en'
  return (
    <li className="sh-swipe" style={{ ['--tray' as string]: `${SWIPE_ACTIONS_W}px` }}>
      <div className="sh-tray" aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} onClick={() => { onDuplicate(); onOpenChange(false) }}><IconCopy /><span>Duplicate</span></button>
        <button type="button" tabIndex={open ? 0 : -1} className="sh-danger" onClick={() => { onDelete(); onOpenChange(false) }}><IconTrash /><span>Delete</span></button>
      </div>
      <div ref={cardRef} className="sh-card" data-open={open} data-current={current} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}>
        <button type="button" className="sh-card-main" onClick={click} aria-label={`Open story: ${title || 'Untitled draft'}`}>
          <span className="sh-card-lead">
            {thumb ? <img className="sh-thumb" src={thumb} alt="" loading="lazy" decoding="async" /> : null}
            {cat ? <CatMark cat={cat} size={thumb ? 24 : 40} /> : !thumb ? <span className="sh-cat sh-cat-none" aria-hidden /> : null}
          </span>
          <span className="sh-card-body">
            <span className={`sh-title ${title ? '' : 'sh-title-empty'}`} lang={lang}>{title || 'Untitled draft'}</span>
            <span className="sh-meta">
              <span className={`sh-chip sh-chip-${status}`}>{STATUS_LABEL[status]}</span>
              {cat && <span className="sh-catname">{cat.name}</span>}
              <span className="sh-time">{relativeTime(draft.updatedAt, now)}</span>
            </span>
          </span>
        </button>
        <button type="button" className="sh-more" aria-label="Story actions" aria-expanded={open} onClick={() => onOpenChange(!open)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden><circle cx="12" cy="5.5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="18.5" r="1.7" /></svg>
        </button>
      </div>
    </li>
  )
}
