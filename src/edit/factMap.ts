// Fact marks: where the figures, amounts, capacities, years and months sit in a piece of English text, and whether the
// source contains them. green ('found') = the source has the same number or month; amber ('missing') = it does not.
// The verdict itself comes from facts.ts flagUnsupportedFacts (the one source of truth); this module only finds the
// positions so the editor can see and tap them, and finds the matching spot in the source. It never edits any text and
// a green mark means "this number appears in the source", not that the sentence around it is right.
import { bengaliToAsciiDigits, flagUnsupportedFacts } from '../facts'

export type MarkStatus = 'found' | 'missing'
export interface FactMark {
  start: number
  end: number
  text: string
  status: MarkStatus
  kind: 'figure' | 'currency' | 'date' | 'capacity'
  /** the plain number (commas out) or the month number, used to find the same spot in the source */
  key: string
}

const normNum = (s: string): string => {
  const n = s.replace(/,/g, '')
  return n.includes('.') ? n.replace(/0+$/, '').replace(/\.$/, '') : n
}

// Same patterns as facts.ts (kept in step by hand; facts.ts does not export them).
const UNIT = String.raw`(?:MW|GW|kW|KW|MWh|GWh|kWh|MMCFD|MMCF|BCM|TCF|kV|KV|MVAR|per\s*cent|percent|crore|lakh|million|billion|thousand|tonnes?|barrels?|units?|taka|Tk|BDT|USD|dollars?)\b`
const numRe = () => new RegExp(String.raw`(\$|Tk\.?\s*|BDT\s*|USD\s*|৳)?(\d[\d,]*(?:\.\d+)?)(\s*(?:${UNIT}|%))?`, 'gi')
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']

/**
 * Marks for every figure/currency/capacity/year/month in `text`, judged against `source`. Single digits without a unit
 * are not marked (as in facts.ts). "May" counts as a month only when capitalised and next to a number, so the verb is left alone.
 */
export function findFactMarks(text: string, source: string): FactMark[] {
  if (!text.trim()) return []
  const missing = new Set(flagUnsupportedFacts(source, text).map((f) => f.text.toLowerCase()))
  const out: FactMark[] = []
  for (const m of text.matchAll(numRe())) {
    const raw = m[0]
    const trimmed = raw.trim()
    const n = normNum(m[2])
    const cur = m[1], unit = m[3]
    if (!cur && !unit && /^\d$/.test(n)) continue
    const isCurrency = !!cur || /^\s*(?:taka|Tk|BDT|USD|dollars?|crore|lakh)/i.test(unit ?? '')
    const isCapacity = !!unit && /MW|GW|kW|MMCF|BCM|TCF|kV|MVAR|%|per\s*cent|percent/i.test(unit)
    const isYear = !cur && !unit && /^(?:19|20)\d{2}$/.test(n)
    const start = (m.index ?? 0) + raw.indexOf(trimmed)
    out.push({
      start, end: start + trimmed.length, text: trimmed,
      status: missing.has(trimmed.toLowerCase()) ? 'missing' : 'found',
      kind: isCurrency ? 'currency' : isCapacity ? 'capacity' : isYear ? 'date' : 'figure',
      key: n,
    })
  }
  for (const m of text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi)) {
    const idx = m.index ?? 0
    const word = m[1]
    if (!/^[A-Z]/.test(word)) continue
    if (word.toLowerCase() === 'may' && !/\d\s*$/.test(text.slice(Math.max(0, idx - 4), idx)) && !/^\s*\d/.test(text.slice(idx + 3, idx + 6))) continue
    const num = MONTH_NAMES.indexOf(word.toLowerCase()) + 1
    out.push({ start: idx, end: idx + word.length, text: word, status: missing.has(word.toLowerCase()) ? 'missing' : 'found', kind: 'date', key: `m${num}` })
  }
  // marks must not overlap (a month next to a year): earlier wins
  out.sort((a, b) => a.start - b.start || b.end - a.end)
  const clean: FactMark[] = []
  for (const k of out) if (!clean.length || k.start >= clean[clean.length - 1].end) clean.push(k)
  return clean
}

/** Flags facts.ts raised that no mark covers (e.g. a lower-case "may"). Shown as plain amber lines so nothing is hidden. */
export function unplacedFlags(source: string, text: string, marks: FactMark[]): string[] {
  const placed = new Set(marks.map((m) => m.text.toLowerCase()))
  return flagUnsupportedFacts(source, text).filter((f) => !placed.has(f.text.toLowerCase())).map((f) => f.note)
}

export interface SourceHit { para: number; start: number; end: number }

/** The first place in the source paragraphs that holds the same number (or month) as `mark`, or null when there is none. */
export function locateInSource(paras: string[], mark: Pick<FactMark, 'key' | 'text'>): SourceHit | null {
  if (mark.key.startsWith('m')) {
    const n = Number(mark.key.slice(1)) - 1
    const names = [MONTH_NAMES[n], BN_MONTHS[n]].filter(Boolean)
    for (let p = 0; p < paras.length; p++) {
      const lower = paras[p].toLowerCase()
      for (const name of names) {
        const at = lower.indexOf(name)
        if (at >= 0) return { para: p, start: at, end: at + name.length }
      }
    }
    return null
  }
  let best: SourceHit | null = null
  const wantUnit = /[A-Za-z%]+\s*$/.exec(mark.text)?.[0].trim().toLowerCase() ?? ''
  for (let p = 0; p < paras.length; p++) {
    const ascii = bengaliToAsciiDigits(paras[p]) // one character for one character, so offsets still fit the original
    for (const m of ascii.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      if (normNum(m[0]) !== mark.key) continue
      const start = m.index ?? 0
      const hit = { para: p, start, end: start + m[0].length }
      if (!best) best = hit
      // prefer a hit that also carries the same unit word right after it
      if (wantUnit && ascii.slice(hit.end, hit.end + 24).toLowerCase().includes(wantUnit)) return hit
    }
  }
  return best
}

export interface Seg { text: string; cls?: string; markIndex?: number }
export interface Span { start: number; end: number; cls: string; markIndex?: number }

/** Cut `text` into plain and highlighted pieces. Overlapping spans: the earlier one wins. */
export function segmentize(text: string, spans: Span[]): Seg[] {
  const sorted = [...spans].filter((s) => s.end > s.start && s.start >= 0 && s.start < text.length).sort((a, b) => a.start - b.start)
  const out: Seg[] = []
  let at = 0
  for (const s of sorted) {
    if (s.start < at) continue
    if (s.start > at) out.push({ text: text.slice(at, s.start) })
    const end = Math.min(s.end, text.length)
    out.push({ text: text.slice(s.start, end), cls: s.cls, markIndex: s.markIndex })
    at = end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

export interface FactSummary { found: number; missing: number }
export const summarize = (marks: FactMark[]): FactSummary => ({
  found: marks.filter((m) => m.status === 'found').length,
  missing: marks.filter((m) => m.status === 'missing').length,
})
