// Fact marks for the Verified view: every figure in a paragraph of the English draft, marked as found in the source
// (verified) or not (unverified). Copied from the PC's EditorialWorkspace.tsx `parseParagraphWithFacts`
// (chiefhamim/esb-banner-studio, src/editorial/EditorialWorkspace.tsx) because that function is not exported there.
import type { FactItem } from '../../pc/editorial/facts'

export interface FactSpan {
  text: string
  isFact: boolean
  isVerified?: boolean
  sourceFact?: FactItem
  tooltip?: string
}

export function parseParagraphWithFacts(text: string, factTable: FactItem[], sourceAscii: string): FactSpan[] {
  if (!text) return []
  const pattern = /(?:(?:Tk\.?|৳|BDT|\$|USD)\s*)?[0-9]+(?:[,.][0-9]+)?\s*(?:crore|lakh|million|billion|MW|GW|KW|MMCFD|MMcfd|BCM|TCF|KV|KWH|%|percent)?(?:\s*(?:crore|lakh|Tk\.?|৳|BDT|\$|USD))?/gi
  const spans: FactSpan[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const matchStr = match[0].trim()
    if (!matchStr || !/[0-9]/.test(matchStr)) continue
    if (match.index > lastIndex) spans.push({ text: text.slice(lastIndex, match.index), isFact: false })
    const digitsOnly = matchStr.replace(/[^0-9]/g, '')
    const isTrivial = digitsOnly.length === 1 && parseInt(digitsOnly, 10) < 5 && !/(?:Tk|\$|MW|GW|MMCFD|crore|lakh|%)/i.test(matchStr)
    if (isTrivial) {
      spans.push({ text: match[0], isFact: false })
    } else {
      const isVerified = sourceAscii.includes(digitsOnly)
      const matchingFact = factTable.find((f) => {
        const fDigits = f.normalized.replace(/[^0-9]/g, '')
        return fDigits.length > 0 && (fDigits.includes(digitsOnly) || digitsOnly.includes(fDigits))
      })
      spans.push({
        text: match[0],
        isFact: true,
        isVerified,
        sourceFact: matchingFact,
        tooltip: isVerified ? `Found in the source${matchingFact ? ` (${matchingFact.raw})` : ''}` : `Not found in the source: "${matchStr}"`,
      })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) spans.push({ text: text.slice(lastIndex), isFact: false })
  return spans
}

/** Counts for a whole story: how many figures were checked and how many were not found in the source. */
export function factCounts(paragraphs: string[], factTable: FactItem[], sourceAscii: string): { checked: number; unverified: number } {
  let checked = 0, unverified = 0
  for (const p of paragraphs) for (const s of parseParagraphWithFacts(p, factTable, sourceAscii)) if (s.isFact) { checked++; if (!s.isVerified) unverified++ }
  return { checked, unverified }
}
