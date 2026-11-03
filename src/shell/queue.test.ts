import { describe, expect, it } from 'vitest'
import { newDraft, type Draft } from '../drafts'
import { countByFilter, isHorizontalSwipe, relativeTime, statusOf, swipeOffset, swipeSettles, titleOf, visibleStories } from './queue'

const mk = (p: Partial<Draft>): Draft => ({ ...newDraft(), ...p })

describe('statusOf', () => {
  it('draft until translated', () => expect(statusOf(mk({ headline: 'H', body: 'B' }))).toBe('draft'))
  it('translated without category is not ready', () => expect(statusOf(mk({ translated: true, headline: 'H', body: 'B' }))).toBe('translated'))
  it('ready needs headline, body and a category', () => {
    expect(statusOf(mk({ translated: true, headline: 'H', body: 'B', category: 'Power Generation' }))).toBe('ready')
    expect(statusOf(mk({ translated: true, headline: 'H', body: ' ', category: '02' }))).toBe('translated')
  })
})

describe('queue', () => {
  const a = mk({ id: 'a', headline: 'Solar plan', updatedAt: 100 })
  const b = mk({ id: 'b', translated: true, source: 'বিদ্যুৎ', updatedAt: 300 })
  const c = mk({ id: 'c', headline: 'Gas price', body: 'solar too', updatedAt: 200 })
  it('sorts recent first', () => expect(visibleStories([a, b, c], 'all', '').map((d) => d.id)).toEqual(['b', 'c', 'a']))
  it('filters by status', () => expect(visibleStories([a, b, c], 'translated', '').map((d) => d.id)).toEqual(['b']))
  it('searches headline, body and source, case-insensitive', () => {
    expect(visibleStories([a, b, c], 'all', 'SOLAR').map((d) => d.id)).toEqual(['c', 'a'])
    expect(visibleStories([a, b, c], 'all', 'বিদ্যুৎ').map((d) => d.id)).toEqual(['b'])
  })
  it('does not mutate input', () => {
    const l = [a, b, c]
    visibleStories(l, 'all', '')
    expect(l.map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
  it('counts', () => expect(countByFilter([a, b, c])).toEqual({ all: 3, draft: 2, translated: 1, ready: 0 }))
  it('title falls back to first source line', () => expect(titleOf(mk({ source: '\n  প্রথম লাইন\nদ্বিতীয়' }))).toBe('প্রথম লাইন'))
})

describe('relativeTime', () => {
  const now = new Date(2026, 10, 3, 12, 0, 0).getTime()
  it('buckets', () => {
    expect(relativeTime(now - 10_000, now)).toBe('Just now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(relativeTime(now - 3 * 3600_000, now)).toBe('3 h ago')
    expect(relativeTime(new Date(2026, 10, 2, 9).getTime(), now)).toBe('Yesterday')
    expect(relativeTime(new Date(2026, 10, 1, 9).getTime(), now)).toBe('2 days ago')
    expect(relativeTime(new Date(2026, 9, 12, 9).getTime(), now)).toBe('12 Oct')
    expect(relativeTime(new Date(2025, 9, 12, 9).getTime(), now)).toBe('12 Oct 2025')
  })
})

describe('swipe', () => {
  it('clamps right drag and resists past the tray', () => {
    expect(swipeOffset(false, 40)).toBe(0)
    expect(swipeOffset(false, -80)).toBe(-80)
    expect(swipeOffset(false, -240)).toBe(-160 + -80 * 0.25)
    expect(swipeOffset(true, 60)).toBe(-100)
  })
  it('settles by distance or flick', () => {
    expect(swipeSettles(-70, 0)).toBe(true)
    expect(swipeSettles(-50, 0)).toBe(false)
    expect(swipeSettles(-20, -0.8)).toBe(true)
    expect(swipeSettles(-150, 0.8)).toBe(false)
  })
  it('detects horizontal intent', () => {
    expect(isHorizontalSwipe(-30, 5)).toBe(true)
    expect(isHorizontalSwipe(-30, 30)).toBe(false)
    expect(isHorizontalSwipe(4, 0)).toBe(false)
  })
})
