// Find & replace over the story editor's document. A text block (paragraph, heading, cell…) is flattened to one string
// with a position map, so a match can run across bold/italic boundaries. Pure: tested without an editor.

export interface BlockPart { text: string; pos: number }
/** One text block: its characters and, for each character, the document position it sits at. */
export interface FlatBlock { text: string; posAt: number[] }
export interface Range { from: number; to: number }

export function flattenBlock(parts: BlockPart[]): FlatBlock {
  let text = ''
  const posAt: number[] = []
  for (const p of parts) for (let i = 0; i < p.text.length; i++) { text += p.text[i]; posAt.push(p.pos + i) }
  return { text, posAt }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every match of `query` (literal, case-insensitive unless asked) as document ranges, in document order. */
export function findInBlocks(blocks: FlatBlock[], query: string, caseSensitive = false): Range[] {
  if (!query) return []
  const re = new RegExp(escape(query), caseSensitive ? 'g' : 'gi')
  const out: Range[] = []
  for (const b of blocks) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(b.text)) !== null) {
      if (!m[0].length) { re.lastIndex++; continue }
      out.push({ from: b.posAt[m.index], to: b.posAt[m.index + m[0].length - 1] + 1 })
    }
  }
  return out
}

// ---------------------------------------------------------------- editor glue (ProseMirror doc shape, typed loosely)
interface PmNode { isTextblock: boolean; isText: boolean; text?: string | null; nodeSize: number; descendants: (f: (n: PmNode, pos: number) => boolean | void) => void; forEach: (f: (n: PmNode, offset: number) => void) => void }

/** Flatten every text block of a ProseMirror document (non-text inline nodes such as pictures break a match). */
export function blocksOf(doc: PmNode): FlatBlock[] {
  const blocks: FlatBlock[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const parts: BlockPart[] = []
    node.forEach((child, offset) => {
      const at = pos + 1 + offset
      parts.push(child.isText ? { text: child.text ?? '', pos: at } : { text: '￼', pos: at })
    })
    blocks.push(flattenBlock(parts))
    return false
  })
  return blocks
}
