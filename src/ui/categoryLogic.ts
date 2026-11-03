import { CATEGORIES, type Category } from '../banner/tokens'
import { categoryIdOf } from '../banner/categories'

/** The category a draft's stored value points to (the draft stores the category name; a site id "01".."10" is accepted too). */
export function categoryOf(value: string): Category | null {
  const id = categoryIdOf(value)
  return CATEGORIES.find((c) => c.id === id) ?? null
}

/** Option list for the picker: index 0 is "No category" (empty value), then the 10 site categories in order. */
export function categoryOptions(): { value: string; label: string; category: Category | null }[] {
  return [{ value: '', label: 'No category', category: null }, ...CATEGORIES.map((c) => ({ value: c.name, label: c.name, category: c }))]
}

/** Keyboard move through the option list, clamped at both ends. */
export function moveIndex(i: number, delta: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i + delta))
}
