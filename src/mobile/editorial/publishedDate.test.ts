import { describe, expect, it } from 'vitest'
import { fmtPublishedFull } from './publishedDate'

describe('Published date', () => {
  const now = Date.parse('2026-11-05T13:42:00Z')
  it('shows the date and time with how long ago', () => {
    const s = fmtPublishedFull('2026-11-05T12:42:00Z', now)
    expect(s).toMatch(/^1 h ago · 5 Nov 2026, .+$/)
  })
  it('keeps just the date and time for older stories', () => {
    expect(fmtPublishedFull('2026-10-21T08:00:00Z', now)).toMatch(/^21 Oct 2026, [^·]+$/)
  })
  it('says Published when there is no date', () => {
    expect(fmtPublishedFull(undefined, now)).toBe('Published')
  })
})
