import { CATEGORIES } from './tokens'

/** The draft stores the category's name; a value that is the site id ("01".."10") is accepted too. Empty if unknown. */
export function categoryIdOf(value: string): string {
  const c = CATEGORIES.find((x) => x.name === value || x.id === value)
  return c ? c.id : ''
}
