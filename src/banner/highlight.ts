// Choosing the key phrase of a headline by tapping words (a phone has no text-selection handles on a canvas).
export function wordsOf(headline: string): string[] {
  return headline.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}

/** The phrase for words a..b (inclusive, either order), without punctuation hanging off the end. */
export function phraseFromRange(words: string[], a: number, b: number): string {
  const lo = Math.max(0, Math.min(a, b))
  const hi = Math.min(words.length - 1, Math.max(a, b))
  if (lo > hi) return ''
  return words.slice(lo, hi + 1).join(' ').replace(/[,.;:!?]+$/, '')
}

/** Which words the stored phrase covers: [first, last] word index, or null. */
export function rangeOfPhrase(words: string[], phrase: string): [number, number] | null {
  const want = phrase.trim().toLowerCase()
  if (!want) return null
  for (let a = 0; a < words.length; a++) {
    for (let b = a; b < words.length; b++) {
      if (phraseFromRange(words, a, b).toLowerCase() === want) return [a, b]
    }
  }
  return null
}

/** One tap on word i. First tap starts a phrase (anchor); the second tap closes it; tapping inside the current phrase clears it. */
export function tapWord(words: string[], phrase: string, anchor: number | null, i: number): { phrase: string; anchor: number | null } {
  if (anchor !== null) return { phrase: phraseFromRange(words, anchor, i), anchor: null }
  const r = rangeOfPhrase(words, phrase)
  if (r && i >= r[0] && i <= r[1]) return { phrase: '', anchor: null }
  return { phrase: phraseFromRange(words, i, i), anchor: i }
}
