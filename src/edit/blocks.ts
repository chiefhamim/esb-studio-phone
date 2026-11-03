// Paragraph blocks: the story body (and the source) as a list of paragraphs, with the operations the Edit desk needs.
// Pure and immutable: every function returns a new array. A body is paragraphs joined by a blank line.
// (The desktop edits rich HTML; the phone body is plain paragraphs, so this is the phone's own small module.)

export type Blocks = string[]

/** Body text to paragraphs. Blank lines separate paragraphs; single line breaks stay inside a paragraph. */
export function parseBody(text: string): Blocks {
  const t = text.replace(/\r/g, '')
  if (!t.trim()) return []
  return t.split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\n+$/g, ''))
}

/** Source text to paragraphs: every line break starts a new paragraph (pasted articles rarely use blank lines). */
export function parseSource(text: string): Blocks {
  return text.replace(/\r/g, '').split(/\n+/).map((p) => p.trim()).filter(Boolean)
}

export const joinBlocks = (b: Blocks): string => b.join('\n\n')

export const setBlock = (b: Blocks, i: number, text: string): Blocks => b.map((x, k) => (k === i ? text : x))

export function insertBlock(b: Blocks, at: number, text = ''): Blocks {
  const i = Math.max(0, Math.min(at, b.length))
  return [...b.slice(0, i), text, ...b.slice(i)]
}

export function removeBlock(b: Blocks, i: number): Blocks {
  return i < 0 || i >= b.length ? b : [...b.slice(0, i), ...b.slice(i + 1)]
}

/** Move paragraph `i` by `delta` places (negative = up). Out-of-range moves return the list unchanged. */
export function moveBlock(b: Blocks, i: number, delta: number): Blocks {
  const j = i + delta
  if (i < 0 || i >= b.length || j < 0 || j >= b.length || delta === 0) return b
  const out = [...b]
  const [x] = out.splice(i, 1)
  out.splice(j, 0, x)
  return out
}

/** Split paragraph `i` at character offset `at`; the two halves are trimmed of the cut spaces. No-op if either half would be empty. */
export function splitBlock(b: Blocks, i: number, at: number): Blocks {
  const t = b[i]
  if (t === undefined) return b
  const head = t.slice(0, at).replace(/\s+$/, '')
  const tail = t.slice(at).replace(/^\s+/, '')
  if (!head || !tail) return b
  return [...b.slice(0, i), head, tail, ...b.slice(i + 1)]
}

/** Merge paragraph `i` into the one above it (joined with one space). No-op for the first paragraph. */
export function mergeUp(b: Blocks, i: number): Blocks {
  if (i <= 0 || i >= b.length) return b
  const joined = `${b[i - 1].replace(/\s+$/, '')} ${b[i].replace(/^\s+/, '')}`.trim()
  return [...b.slice(0, i - 1), joined, ...b.slice(i + 1)]
}

/** Typing a blank line inside a paragraph starts a new one: returns the paragraphs the text now holds (1 = no split). */
export function splitOnBlankLine(text: string): Blocks {
  const parts = text.replace(/\r/g, '').split(/\n[ \t]*\n+/)
  return parts.length > 1 ? parts : [text]
}

/** Replace paragraph `i` with several (pasting multiple paragraphs). */
export function replaceBlock(b: Blocks, i: number, parts: Blocks): Blocks {
  if (i < 0 || i >= b.length) return b
  return [...b.slice(0, i), ...parts, ...b.slice(i + 1)]
}

/** Offsets of each paragraph inside `joinBlocks(b)`, for mapping a position in the whole text to (paragraph, offset). */
export function blockOffsets(b: Blocks): number[] {
  const out: number[] = []
  let at = 0
  for (const p of b) { out.push(at); at += p.length + 2 }
  return out
}
