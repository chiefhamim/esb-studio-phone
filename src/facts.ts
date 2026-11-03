// Fact flagging: lists figures, dates, currencies and capacities in the English draft that do NOT appear in the source.
// ORIGIN: idea and Bengali digit/month tables from the desktop app (esb-banner-studio src/editorial/facts.ts and
// bengali.ts), rewritten as a smaller pure module for the phone. It never edits the story; it only returns amber notes
// for the editor. A clean result does not prove the story is right, only that these checks found nothing.

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
export const bengaliToAsciiDigits = (t: string): string => t.replace(/[০-৯]/g, (c) => String(BN_DIGITS.indexOf(c)))

/** Month number by name, English and Bengali (English calendar in Bengali spelling). */
const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  'জানুয়ারি': 1, 'ফেব্রুয়ারি': 2, 'মার্চ': 3, 'এপ্রিল': 4, 'মে': 5, 'জুন': 6, 'জুলাই': 7, 'আগস্ট': 8,
  'সেপ্টেম্বর': 9, 'অক্টোবর': 10, 'নভেম্বর': 11, 'ডিসেম্বর': 12,
}
const EN_MONTH_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi

const normNum = (s: string): string => {
  const n = s.replace(/,/g, '')
  return n.includes('.') ? n.replace(/0+$/, '').replace(/\.$/, '') : n
}

const UNIT = '(?:MW|GW|kW|KW|MWh|GWh|kWh|MMCFD|MMCF|BCM|TCF|kV|KV|MVAR|per\\s*cent|percent|crore|lakh|million|billion|thousand|tonnes?|barrels?|units?|taka|Tk|BDT|USD|dollars?)\\b'
const NUM_RE = new RegExp(`(\\$|Tk\\.?\\s*|BDT\\s*|USD\\s*|৳)?(\\d[\\d,]*(?:\\.\\d+)?)(\\s*(?:${UNIT}|%))?`, 'gi')

export interface FactFlag {
  kind: 'figure' | 'currency' | 'date' | 'capacity'
  text: string
  note: string
}

/** Numbers in the source, as plain digits with commas removed (Bengali digits read as ASCII). */
function sourceNumbers(source: string): Set<string> {
  const set = new Set<string>()
  for (const m of bengaliToAsciiDigits(source).matchAll(/\d[\d,]*(?:\.\d+)?/g)) set.add(normNum(m[0]))
  return set
}

function sourceMonths(source: string): Set<number> {
  const set = new Set<number>()
  const lower = source.toLowerCase()
  for (const [name, n] of Object.entries(MONTHS)) if (lower.includes(name)) set.add(n)
  return set
}

/**
 * Flags in `english` every figure, currency amount, capacity/percentage, year and month that the `source` does not
 * contain. Single digits 0 to 9 are skipped unless they carry a unit or currency. Words ("three") are not checked.
 */
export function flagUnsupportedFacts(source: string, english: string): FactFlag[] {
  const known = sourceNumbers(source)
  const months = sourceMonths(source)
  const flags: FactFlag[] = []
  const seen = new Set<string>()
  const add = (f: FactFlag) => {
    const k = `${f.kind}|${f.text.toLowerCase()}`
    if (!seen.has(k)) { seen.add(k); flags.push(f) }
  }

  for (const m of english.matchAll(NUM_RE)) {
    const cur = m[1]
    const n = normNum(m[2])
    const unit = m[3]
    const text = m[0].trim()
    if (known.has(n)) continue
    const bare = !cur && !unit
    if (bare && /^\d$/.test(n)) continue
    const isCurrency = !!cur || /^\s*(?:taka|Tk|BDT|USD|dollars?|crore|lakh)/i.test(unit ?? '')
    const isCapacity = !!unit && /MW|GW|kW|MMCF|BCM|TCF|kV|MVAR|%|per\s*cent|percent/i.test(unit)
    const isYear = bare && /^(?:19|20)\d{2}$/.test(n)
    const kind: FactFlag['kind'] = isCurrency ? 'currency' : isCapacity ? 'capacity' : isYear ? 'date' : 'figure'
    const label = kind === 'date' ? 'Year' : kind === 'currency' ? 'Amount' : kind === 'capacity' ? 'Capacity or rate' : 'Figure'
    add({ kind, text, note: `${label} "${text}" is not in the source. Check it or remove it.` })
  }

  for (const m of english.matchAll(EN_MONTH_RE)) {
    const n = MONTHS[m[1].toLowerCase()]
    if (!months.has(n)) add({ kind: 'date', text: m[1], note: `Month "${m[1]}" is not in the source. Check the date.` })
  }
  return flags
}

/** Same flags as plain note lines for the editor's amber list. */
export function factNotes(source: string, english: string): string[] {
  return flagUnsupportedFacts(source, english).map((f) => f.note)
}
