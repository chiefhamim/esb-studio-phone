import { describe, expect, it } from 'vitest'
import { isBlankDraft, newDraft } from './drafts'

describe('isBlankDraft', () => {
  it('is true for a fresh draft and for one holding only whitespace', () => {
    expect(isBlankDraft(newDraft())).toBe(true)
    expect(isBlankDraft({ ...newDraft(), headline: '  \n ' })).toBe(true)
  })
  it('is false as soon as anything is filled in', () => {
    expect(isBlankDraft(newDraft('https://example.com/a'))).toBe(false)
    expect(isBlankDraft(newDraft('', 'বাংলা'))).toBe(false)
    expect(isBlankDraft({ ...newDraft(), headline: 'x' })).toBe(false)
    expect(isBlankDraft({ ...newDraft(), body: 'x' })).toBe(false)
    expect(isBlankDraft({ ...newDraft(), category: 'Power Generation' })).toBe(false)
  })
})
