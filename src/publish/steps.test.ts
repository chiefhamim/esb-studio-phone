// Tests for the Publish stepper numbers and the Facebook caption checks (copied rules from the desktop socialChecks).
import { describe, expect, it } from 'vitest'
import { newDraft } from '../drafts'
import { buildReadiness } from './readiness'
import { analyzeFacebook, socialFixList } from './socialChecks'
import { defaultCaption } from './caption'
import { formatArticleDate, readMinutes, ringStats, stepAt, stepIndex, STEPS } from './steps'

const ids = (cs: ReturnType<typeof analyzeFacebook>, status: string) => cs.filter((c) => c.status === status).map((c) => c.id)

describe('stepper', () => {
  it('has Check, Review, Send in order and clamps', () => {
    expect(STEPS.map((s) => s.label)).toEqual(['Check', 'Review', 'Send'])
    expect(stepAt(-3)).toBe('check'); expect(stepAt(1)).toBe('review'); expect(stepAt(9)).toBe('send')
    expect(stepIndex('send')).toBe(2)
  })
  it('ring counts required checks only', () => {
    const empty = buildReadiness(newDraft(), { translationReviewed: false, hasPicture: false })
    const r = ringStats(empty)
    expect(r.done).toBeLessThan(r.total)
    expect(r.fraction).toBeCloseTo(r.done / r.total, 6)
    const d = { ...newDraft(), headline: 'Govt approves gas project', deck: 'A short deck.', body: 'word '.repeat(60), category: 'Power Generation', slug: 'govt-approves-gas-project' }
    const ok = ringStats(buildReadiness(d, { translationReviewed: false, hasPicture: false }))
    expect(ok.fraction).toBe(1) // a missing picture is a quality note, not a required check
  })
  it('read time is whole minutes, at least one', () => {
    expect(readMinutes(0)).toBe(1); expect(readMinutes(450)).toBe(2)
  })
  it('formats the article date with the desktop wording', () => {
    expect(formatArticleDate(new Date('2026-11-03T06:30:00Z'))).toBe('Published on November 3, 2026 at 12:30 PM')
  })
})

describe('Facebook caption checks', () => {
  it('passes a short human caption with tags on the last line', () => {
    const c = analyzeFacebook('Gas project approved for Chattogram\n\n#Energy #Gas #Bangladesh #ESBPowerLine')
    expect(ids(c, 'good')).toEqual(['fb-nolink', 'fb-length', 'fb-lines', 'fb-tags', 'fb-brand', 'fb-human'])
  })
  it('flags a link as a blocker-level problem', () => {
    const c = analyzeFacebook('Read https://esbpowerline.com/x now #A #B #C #ESBPowerLine')
    expect(ids(c, 'bad')).toContain('fb-nolink')
  })
  it('flags long text, many lines, missing tags and hype', () => {
    const c = analyzeFacebook('BREAKING: ' + 'x'.repeat(130) + '\nline two\nline three')
    expect(ids(c, 'warn')).toEqual(expect.arrayContaining(['fb-length', 'fb-lines', 'fb-tags', 'fb-brand', 'fb-human']))
    expect(socialFixList(c).length).toBeGreaterThan(3)
  })
  it('an empty caption fails the length check', () => {
    expect(ids(analyzeFacebook(''), 'warn')).toContain('fb-length')
  })
  it('the default caption (headline plus brand tag) only misses the tag count', () => {
    const c = analyzeFacebook(defaultCaption('Gas project approved'))
    expect(ids(c, 'good')).toEqual(expect.arrayContaining(['fb-nolink', 'fb-length', 'fb-lines', 'fb-brand', 'fb-human']))
    expect(ids(c, 'warn')).toEqual(['fb-tags'])
  })
})
