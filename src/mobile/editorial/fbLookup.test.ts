import { describe, expect, it } from 'vitest'
import { headlineMatch } from './fbLookup'

describe('Facebook post lookup', () => {
  it('matches a caption that carries the headline', () => {
    expect(headlineMatch('Govt to drill 52 new wells to deal with gas crisis', 'Govt to drill 52 new wells to deal with gas crisis. Full story in comments')).toBeGreaterThan(0.9)
  })
  it('does not match an unrelated post', () => {
    expect(headlineMatch('Govt to drill 52 new wells to deal with gas crisis', 'BPC signs five-year deal with Pertamina to run SPM facility')).toBeLessThan(0.3)
  })
  it('works for Bangla', () => {
    expect(headlineMatch('ঈদে নিরবচ্ছিন্ন বিদ্যুৎ পেতে ডেসকোর নির্দেশনা', 'ঈদে নিরবচ্ছিন্ন বিদ্যুৎ পেতে ডেসকোর নির্দেশনা জারি')).toBeGreaterThan(0.9)
  })
})
