import { describe, expect, it } from 'vitest'
import { parseShared } from './shareIntent'

describe('parseShared', () => {
  it('empty shares are ignored', () => { expect(parseShared('   ')).toBeNull() })
  it('a bare link', () => { expect(parseShared('https://example.com/a?b=1')).toEqual({ url: 'https://example.com/a?b=1', text: '' }) })
  it('title plus link, trailing punctuation trimmed', () => {
    expect(parseShared('Big story https://example.com/x.')).toEqual({ url: 'https://example.com/x', text: 'Big story' })
  })
  it('plain text keeps no link', () => { expect(parseShared('just words')).toEqual({ url: '', text: 'just words' }) })
})
