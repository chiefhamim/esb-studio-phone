// Quoted statements in a story: the quote finder from the desktop quote library (esb-banner-studio
// src/editorial/quoteLibrary.ts findQuotes, with its opensAt / closesAt helpers), copied unchanged. The desktop's saved
// library (IndexedDB, speakers, merge) is Planned on the phone; this module only lists the quotes of the story open now.

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}\p{M}]/u.test(c)
const DOUBLE_OPEN = '“"', SINGLE_OPEN = "‘'"

function opensAt(p: string, i: number): boolean {
  const c = p[i], prev = p[i - 1], next = p[i + 1]
  if (c === '“') return true
  if (c === '‘') return !isWordChar(prev)
  if (c === '"' || c === "'") return !isWordChar(prev) && !!next && !/\s/.test(next)
  return false
}

function closesAt(p: string, i: number, open: string): boolean {
  const c = p[i], prev = p[i - 1], next = p[i + 1]
  if (DOUBLE_OPEN.includes(open) ? c !== '”' && c !== '"' : c !== '’' && c !== "'") return false
  if (isWordChar(prev) && isWordChar(next)) return false // Bangladesh's, won’t
  if (!prev || /\s/.test(prev)) return false // a closing mark ends a word
  return !isWordChar(next)
}

export function findQuotes(text: string): { offset: number; raw: string; inner: string }[] {
  const out: { offset: number; raw: string; inner: string }[] = []
  for (const m of text.matchAll(/[^\n]+/g)) {
    const p = m[0], base = m.index ?? 0
    let i = 0
    while (i < p.length) {
      if (!(DOUBLE_OPEN + SINGLE_OPEN).includes(p[i]) || !opensAt(p, i)) { i++; continue }
      const open = p[i]
      const family = DOUBLE_OPEN.includes(open) ? DOUBLE_OPEN : SINGLE_OPEN
      let close = -1, restart = -1
      for (let j = i + 1; j < p.length; j++) {
        if (closesAt(p, j, open)) { close = j; break }
        if (family.includes(p[j]) && opensAt(p, j)) { restart = j; break }
      }
      if (close < 0) { i = restart >= 0 ? restart : i + 1; continue }
      const inner = p.slice(i + 1, close).trim()
      if (inner.length >= 8 && inner.length <= 160) out.push({ offset: base + i, raw: p.slice(i, close + 1), inner })
      i = close + 1
    }
  }
  return out
}

export interface StoryQuote { para: number; raw: string; inner: string }

/** Quotes of a story by paragraph. */
export function quotesByParagraph(paras: string[]): StoryQuote[] {
  const out: StoryQuote[] = []
  paras.forEach((p, para) => { for (const q of findQuotes(p)) out.push({ para, raw: q.raw, inner: q.inner }) })
  return out
}
