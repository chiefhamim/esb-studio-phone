// Character budgets for the site's story fields, with a pure checker. Limits match the desktop app (translator.ts:
// headline <= 104, deck <= 200; slug <= 80, the site's hard cap). Pure: no I/O.

export const BUDGETS = { headline: 104, deck: 200, slug: 80 } as const
export type BudgetField = keyof typeof BUDGETS

export interface BudgetIssue {
  field: BudgetField
  length: number
  max: number
  /** characters over the limit */
  over: number
}

/** Fields that are over their budget (empty list = all fine). Counts characters the way the editor sees them. */
export function checkBudgets(f: Partial<Record<BudgetField, string>>): BudgetIssue[] {
  const out: BudgetIssue[] = []
  for (const field of Object.keys(BUDGETS) as BudgetField[]) {
    const text = (f[field] ?? '').trim()
    const max = BUDGETS[field]
    const length = [...text].length
    if (length > max) out.push({ field, length, max, over: length - max })
  }
  return out
}

/** Plain-words line for a budget issue. */
export function describeIssue(i: BudgetIssue): string {
  return `The ${i.field} is ${i.length} characters, ${i.over} over the ${i.max} limit. Shorten it before publishing.`
}

/** Lowercase kebab-case slug, ASCII only, cut at a word boundary to at most `max` characters. */
export function fitSlug(text: string, max: number = BUDGETS.slug): string {
  const clean = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max + 1)
  const dash = cut.lastIndexOf('-')
  return (dash > 20 ? cut.slice(0, dash) : clean.slice(0, max)).replace(/-$/, '')
}
