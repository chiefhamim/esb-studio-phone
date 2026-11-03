// Story queue logic for the phone Home (pure, tested in queue.test.ts).
// Modelled on the desktop story queue (esb-banner-studio src/editorial/storyQueue.ts): a status per story, newest first.
// The phone draft has no "published" flag, so there is no "On site" status here: nothing is shown that the data cannot prove.
import type { Draft } from '../drafts'
import { categoryIdOf } from '../banner/categories'

export type StoryStatus = 'draft' | 'translated' | 'ready'
export type QueueFilter = 'all' | StoryStatus
export const STATUS_LABEL: Record<StoryStatus, string> = { draft: 'Draft', translated: 'Translated', ready: 'Ready' }
export const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'translated', label: 'Translated' },
  { id: 'ready', label: 'Ready' },
]

/** Ready = translated, has an English headline and body, and a category picked. Still a draft until the editor publishes. */
export function statusOf(d: Draft): StoryStatus {
  if (d.translated && d.headline.trim() && d.body.trim() && categoryIdOf(d.category)) return 'ready'
  return d.translated ? 'translated' : 'draft'
}

const BN = /[ঀ-৿]/
export const isBangla = (s: string) => BN.test(s)

/** English headline if there is one, else the first line of the source (often Bangla), else empty. */
export function titleOf(d: Draft): string {
  const h = d.headline.trim()
  if (h) return h
  const first = d.source.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
  return first.length > 140 ? first.slice(0, 140).trimEnd() + '…' : first
}

export function matchesQuery(d: Draft, q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return true
  return [d.headline, d.deck, d.body, d.source, d.sourceUrl].some((f) => f.toLowerCase().includes(n))
}

/** Filter by status and search text, newest first. Does not mutate the input. */
export function visibleStories(list: Draft[], filter: QueueFilter, query: string): Draft[] {
  return list.filter((d) => (filter === 'all' || statusOf(d) === filter) && matchesQuery(d, query)).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function countByFilter(list: Draft[]): Record<QueueFilter, number> {
  const c: Record<QueueFilter, number> = { all: list.length, draft: 0, translated: 0, ready: 0 }
  for (const d of list) c[statusOf(d)]++
  return c
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 45) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const a = new Date(then)
  const b = new Date(now)
  const days = Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return `${a.getDate()} ${MONTHS[a.getMonth()]}${a.getFullYear() === b.getFullYear() ? '' : ' ' + a.getFullYear()}`
}

// ---- swipe maths: the card slides left to reveal the action tray ----
export const SWIPE_ACTIONS_W = 160
/** Offset of the card while dragging: never right of rest, never past the tray, with a little resistance beyond it. */
export function swipeOffset(startOpen: boolean, dx: number, trayW = SWIPE_ACTIONS_W): number {
  const raw = (startOpen ? -trayW : 0) + dx
  if (raw > 0) return 0
  if (raw < -trayW) return -trayW + (raw + trayW) * 0.25
  return raw
}
/** Where the card settles on release: open if past 40% of the tray, or flicked left; a flick right closes it. */
export function swipeSettles(offset: number, velocityX: number, trayW = SWIPE_ACTIONS_W): boolean {
  if (velocityX < -0.5) return true
  if (velocityX > 0.5) return false
  return offset < -trayW * 0.4
}
/** A drag is a swipe (not a scroll or tap) once it moves 8 px and is mostly horizontal. */
export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5
}
