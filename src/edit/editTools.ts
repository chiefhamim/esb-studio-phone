// Small pure editing helpers: find and replace, word count / read time, clean paste, Bangla clean-ups.
import { asciiToBengaliDigits, bengaliToAsciiDigits } from './bengali'
import { composeBengali } from '../translate'

export interface Match { start: number; end: number }

/** Every non-overlapping occurrence of `query` in `text`. An empty query matches nothing. */
export function findAll(text: string, query: string, caseSensitive = false): Match[] {
  if (!query) return []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: Match[] = []
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) out.push({ start: at, end: at + needle.length })
  return out
}

/** Replace every match; returns the new text and how many were replaced. */
export function replaceAll(text: string, query: string, by: string, caseSensitive = false): { text: string; count: number } {
  const ms = findAll(text, query, caseSensitive)
  if (!ms.length) return { text, count: 0 }
  let out = '', at = 0
  for (const m of ms) { out += text.slice(at, m.start) + by; at = m.end }
  return { text: out + text.slice(at), count: ms.length }
}

/** Replace only the match that starts at `start`. */
export function replaceAt(text: string, m: Match, by: string): string {
  return text.slice(0, m.start) + by + text.slice(m.end)
}

export const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Whole minutes to read at `wpm` words a minute (at least 1 for any text). */
export function readMinutes(words: number, wpm = 200): number {
  return words <= 0 ? 0 : Math.max(1, Math.round(words / wpm))
}

const chars = (codes: number[]) => String.fromCharCode(...codes)
/** zero-width space, word joiner, byte-order mark, soft hyphen (NOT the zero-width joiners Bangla uses) */
const INVISIBLE = new RegExp(`[${chars([0x200b, 0x2060, 0xfeff, 0xad])}]`, 'g')
/** no-break space, the en/em/thin space family, narrow no-break space, medium mathematical space, ideographic space */
const ODD_SPACES = new RegExp(`[${chars([0xa0, 0x2000])}-${chars([0x200a, 0x202f, 0x205f, 0x3000])}]`, 'g')

/**
 * Clean text that came from a web page, a PDF or a chat app: HTML tags and entities off, odd spaces and invisible
 * characters off, line endings and blank-line runs tidied. Zero-width joiner and non-joiner stay (Bangla needs them).
 */
export function cleanPaste(raw: string): string {
  let t = raw.replace(/\r\n?/g, '\n')
  if (/<\/?(?:p|div|span|br|a|b|i|strong|em|h[1-6]|ul|ol|li|table|tr|td)\b[^>]*>/i.test(t)) {
    t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, '\n\n').replace(/<[^>]+>/g, '')
    t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  }
  return t
    .replace(INVISIBLE, '')
    .replace(ODD_SPACES, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** Bangla clean-ups, each returning new text. They only change letters and digits' form, never a word. */
export const banglaTools = {
  /** Bengali digits to 0-9 (so figures can be compared with the English). */
  digitsToAscii: bengaliToAsciiDigits,
  /** 0-9 to Bengali digits. */
  digitsToBengali: asciiToBengaliDigits,
  /** Join ড় ঢ় য় typed as letter + nukta into the single letter. */
  composeLetters: composeBengali,
}

export const hasBengali = (s: string): boolean => /[ঀ-৿]/.test(s)
