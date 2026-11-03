// A document column: paragraphs you read like a page and edit one at a time. Tap a paragraph to select it (and edit it, for the
// English); the selected paragraph shows one row of icon tools (move, split, merge, add, delete). Enter starts a new paragraph,
// Backspace at the start of one joins it to the paragraph above, a blank line typed or pasted splits.
import { useRef, useState, type ReactNode } from 'react'
import { breakBlock, insertBlock, joinPrev, mergeUp, moveBlock, removeBlock, replaceBlock, setBlock, splitBlock } from './blocks'
import type { Span } from './factMap'
import { AutoTextarea, MarkedText, Tool, showInScroller } from './ui'

interface Props {
  idPrefix: string
  blocks: string[]
  onBlocks: (b: string[], key: string) => void
  /** text typed or pasted into one paragraph -> the paragraphs it now holds (1 = unchanged) */
  splitter: (text: string) => string[]
  lang: string
  /** English: tapping a paragraph edits it at once. Source: tapping selects it and offers Translate / Edit. */
  tapToEdit: boolean
  spansFor: (i: number, text: string) => Span[]
  onMark?: (i: number, markIndex: number) => void
  placeholder: string
  spell: boolean
  selected: number | null
  onSelect: (i: number | null) => void
  /** paragraph to flash (the spot a fact flag points at) */
  pulseIdx?: number | null
  belowFor?: (i: number) => ReactNode
  toolFor?: (i: number) => ReactNode
}

/** Character offset in `el`'s text under a screen point (so a tap puts the cursor where the finger was). */
function offsetAtPoint(el: HTMLElement, x: number, y: number): number | undefined {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null }
  let node: Node | null | undefined
  let off = 0
  if (d.caretPositionFromPoint) { const c = d.caretPositionFromPoint(x, y); node = c?.offsetNode; off = c?.offset ?? 0 }
  else if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); node = r?.startContainer; off = r?.startOffset ?? 0 }
  if (!node || !el.contains(node)) return undefined
  const r = document.createRange()
  r.selectNodeContents(el)
  r.setEnd(node, off)
  return r.toString().length
}

export default function ParagraphList(p: Props) {
  const { blocks, onBlocks, splitter, selected, onSelect } = p
  const eff = blocks.length ? blocks : ['']
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const ta = useRef<HTMLTextAreaElement | null>(null)
  const [caret, setCaret] = useState<number | undefined>(undefined)
  const hasBlocks = blocks.length > 0
  const sel = hasBlocks ? selected : null
  const editing = hasBlocks ? editIdx : 0 // the one empty paragraph is always an open field

  const pick = (i: number, at?: number) => {
    setCaret(at); onSelect(i); setEditIdx(p.tapToEdit ? i : (editIdx === i ? i : null))
    // keep the paragraph and its tool row clear of the next-step bar
    setTimeout(() => { const el = document.getElementById(`${p.idPrefix}-${i}`); if (el) showInScroller(el) }, 60)
  }
  const apply = (b: string[], key: string, nextSel: number | null, edit = false, at?: number) => {
    setCaret(at)
    onBlocks(b, key)
    onSelect(nextSel)
    setEditIdx(edit ? nextSel : null)
  }

  const typed = (i: number, v: string, composing: boolean, after: number) => {
    if (!composing) {
      const parts = splitter(v)
      if (parts.length > 1) { apply(replaceBlock(eff, i, parts), 'split', i + parts.length - 1, true, Math.max(0, parts[parts.length - 1].length - after)); return }
    }
    onBlocks(setBlock(eff, i, v), `${p.idPrefix}${i}`)
    if (!hasBlocks) { setCaret(undefined); onSelect(0); setEditIdx(0) } // the first characters typed into the empty story
  }

  const pasted = (i: number, cleaned: string, start: number, end: number) => {
    const cur = eff[i]
    const parts = splitter(cur.slice(0, start) + cleaned + cur.slice(end))
    apply(replaceBlock(eff, i, parts), 'paste', i + parts.length - 1, true, Math.max(0, parts[parts.length - 1].length - (cur.length - end)))
  }

  return (
    <div className="ed-plist" lang={p.lang}>
      {eff.map((text, i) => {
        const isSel = sel === i
        const isEdit = editing === i
        return (
          <div key={i} id={`${p.idPrefix}-${i}`} className={`ed-p${isSel ? ' is-sel' : ''}${p.pulseIdx === i ? ' is-pulse' : ''}`}>
            <span className="ed-pn" aria-hidden="true">{i + 1}</span>
            <div className="ed-pb">
              {isEdit ? (
                <AutoTextarea
                  className="ed-ptext ed-ptext-edit"
                  label={`Paragraph ${i + 1}`}
                  value={text}
                  lang={p.lang}
                  spell={p.spell}
                  placeholder={p.placeholder}
                  autoFocus={hasBlocks}
                  caret={caret}
                  inputRef={ta}
                  onText={(v, c, after) => typed(i, v, c, after)}
                  onPasteClean={(c, s, e) => pasted(i, c, s, e)}
                  // Enter in a paragraph that is still empty does nothing (a second Enter must not pile up empty paragraphs)
                  onEnter={hasBlocks ? (s, e) => { if (eff[i].trim() === '') return; apply(breakBlock(eff, i, s, e), 'split', i + 1, true, 0) } : undefined}
                  onBackspaceStart={i > 0 ? () => { const r = joinPrev(eff, i); if (r) apply(r.blocks, 'merge', i - 1, true, r.caret) } : undefined}
                />
              ) : (
                <div
                  className="ed-ptext ed-pread"
                  role="button"
                  tabIndex={0}
                  aria-label={`Paragraph ${i + 1}${isSel ? ', selected' : ''}`}
                  onClick={(e) => pick(i, offsetAtPoint(e.currentTarget, e.clientX, e.clientY))}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i) } }}
                >
                  {text ? <MarkedText text={text} spans={p.spansFor(i, text)} onMark={p.onMark ? (m) => p.onMark?.(i, m) : undefined} /> : <span className="ed-empty">Empty paragraph</span>}
                </div>
              )}
              {isSel && (
                // mouse-down is cancelled so tapping a tool does not take focus from the text (the keyboard stays open)
                <div className="ed-ptools" role="toolbar" aria-label={`Paragraph ${i + 1} tools`} onMouseDown={(e) => e.preventDefault()}>
                  {p.toolFor?.(i)}
                  {!isEdit && !p.tapToEdit && <Tool icon="edit" label="Edit text" onClick={() => { setCaret(undefined); setEditIdx(i) }} />}
                  {isEdit && !p.tapToEdit && <Tool icon="check" label="Done editing" onClick={() => setEditIdx(null)} />}
                  <Tool icon="up" label="Move paragraph up" disabled={i === 0} onClick={() => apply(moveBlock(eff, i, -1), 'move', i - 1)} />
                  <Tool icon="down" label="Move paragraph down" disabled={i >= eff.length - 1} onClick={() => apply(moveBlock(eff, i, 1), 'move', i + 1)} />
                  <Tool icon="split" label={isEdit ? 'Split paragraph at the cursor' : 'Split at the cursor (tap the text first, then the place to break)'} disabled={!isEdit} onClick={() => { const at = ta.current?.selectionStart ?? 0; const b = splitBlock(eff, i, at); if (b !== eff) apply(b, 'split', i + 1, true, 0) }} />
                  <Tool icon="merge" label="Merge with the paragraph above" disabled={i === 0} onClick={() => apply(mergeUp(eff, i), 'merge', i - 1, isEdit, eff[i - 1]?.replace(/\s+$/, '').length)} />
                  <Tool icon="plus" label="Add a paragraph below" onClick={() => apply(insertBlock(eff, i + 1), 'add', i + 1, true, 0)} />
                  <Tool icon="trash" danger label="Delete paragraph" onClick={() => apply(eff.length > 1 ? removeBlock(eff, i) : [], 'del', null)} />
                </div>
              )}
              {p.belowFor?.(i)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
