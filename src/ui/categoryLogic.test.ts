import { describe, expect, it } from 'vitest'
import { categoryOf, categoryOptions, moveIndex } from './categoryLogic'

describe('categorySelect', () => {
  it('resolves a stored name or site id, and nothing else', () => {
    expect(categoryOf('Power Generation')?.id).toBe('02')
    expect(categoryOf('02')?.name).toBe('Power Generation')
    expect(categoryOf('')).toBeNull()
    expect(categoryOf('Unknown')).toBeNull()
  })
  it('lists No category first, then the 10 site categories, writing the category name', () => {
    const o = categoryOptions()
    expect(o).toHaveLength(11)
    expect(o[0]).toMatchObject({ value: '', category: null })
    expect(o[2].value).toBe('Power Generation')
  })
  it('clamps keyboard moves', () => {
    expect(moveIndex(0, -1, 11)).toBe(0)
    expect(moveIndex(10, 1, 11)).toBe(10)
    expect(moveIndex(3, 1, 11)).toBe(4)
  })
})
