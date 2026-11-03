// Translate ONE source paragraph to English (tap a source paragraph). Same newsroom rules as the whole-story translation
// (translate.ts BASE_PROMPT: facts, energy precision, attribution), shortened to a single paragraph. The answer is a
// DRAFT shown to the editor with the figures that the source does not contain; nothing is inserted until the editor taps.
import { AiError, NO_KEY_MESSAGE, geminiJson, type AiSchema } from '../aiProviders'
import { getSecret } from '../secure'
import { cleanParagraphLead } from '../translate'
import { factNotes } from '../facts'

export const PARAGRAPH_SCHEMA: AiSchema = {
  properties: {
    text: { description: 'The paragraph in English: every fact of the source paragraph, nothing added.' },
    notes: { description: 'Short lines, one per line: anything unclear or cut off in the source paragraph. Empty if none.' },
  },
  required: ['text', 'notes'],
}

const SYSTEM = `You are the senior editor of an English-language news site on Bangladesh's power, gas and energy sector. Turn ONE paragraph of a Bengali (or English) report into plain, accurate English.
FACTS
- Every figure, name, date, quote and claim must come from the paragraph. Never add, infer, round, convert or estimate. Keep every fact.
- Quotes stay in quotation marks, translated faithfully.
ENERGY PRECISION
- Keep units with every figure, with a space between number and unit (40 MW). Never mix up MW and MWh. Write "million" in full. Give lakh and crore a plain gloss, for example "Tk 592 crore (5.92 billion taka)". Do not convert currencies.
STYLE
- British spelling. Plain, active, specific. No hype, no em dashes, no newspaper names.
Reply with only the requested JSON fields. Never invent anything.`

/** The exact request (pure, so a test can read it). `before` is the previous paragraph, given only as context. */
export function buildParagraphRequest(paragraph: string, before = ''): { system: string; user: string; schema: AiSchema } {
  const ctx = before.trim() ? `Previous paragraph (context only, do not translate it):\n${before.trim()}\n\n` : ''
  return { system: SYSTEM, user: `${ctx}Paragraph to translate:\n${cleanParagraphLead(paragraph)}`, schema: PARAGRAPH_SCHEMA }
}

export interface ParagraphResult {
  text: string
  /** model remarks plus every figure in the English that the paragraph does not contain */
  notes: string[]
}

export async function translateParagraph(paragraph: string, opts?: { before?: string; signal?: AbortSignal }): Promise<ParagraphResult> {
  if (!paragraph.trim()) throw new AiError('bad-request', 'This paragraph is empty.')
  if (!(await getSecret('gemini-key'))) throw new AiError('no-key', NO_KEY_MESSAGE)
  const req = buildParagraphRequest(paragraph, opts?.before)
  const { data } = await geminiJson<Record<string, unknown>>({ ...req, signal: opts?.signal, maxTokens: 4000, timeoutMs: 60_000 })
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const text = str(data.text)
  if (!text) throw new AiError('bad-reply', 'Gemini returned no text. Try again.')
  const notes = str(data.notes).split(/\n+/).map((l) => l.trim()).filter(Boolean)
  notes.push(...factNotes(paragraph, text))
  return { text, notes }
}
