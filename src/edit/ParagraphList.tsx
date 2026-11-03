// A document column: paragraphs you read like a page and edit one at a time. Tap a paragraph to select it (and edit it, for the
// English); the selected paragraph shows its tools (move, split, merge, add, delete). Typing a blank line starts a new paragraph.
import { useRef, useState, type ReactNode } from 'react'
import { insertBlock, mergeUp, moveBlock, removeBlock, replaceBlock, setBlock, splitBlock } from './blocks'
import type { Span } from './factMap'
import { AutoTextarea, MarkedText } from './ui'

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

export default function ParagraphList(p: Props) {
  const { blocks, onBlocks, splitter, selected, onSelect } = p
  const eff = blocks.length ? blocks : ['']
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const ta = useRef<HTMLTextAreaElement | null>(null)
  const sel = blocks.length ? selected : 0
  const editing = blocks.length ? editIdx : 0

  const pick = (i: number) => { onSelect(i); setEditIdx(p.tapToEdit ? i : (editIdx === i ? i : null)) }
  const apply = (b: string[], key: string, nextSel: number | null, edit = false) => {
    onBlocks(b, key)
    onSelect(nextSel)
    setEditIdx(edit ? nextSel : null)
  }

  const typed = (i: number, v: string, composing: boolean) => {
    if (!composing) {
      const parts = splitter(v)
      if (parts.length > 1) { apply(replaceBlock(eff, i, parts), 'split', i + parts.length - 1, true); return }
    }
    onBlocks(setBlock(eff, i, v), `${p.idPrefix}${i}`)
  }

  const pasted = (i: number, cleaned: string, start: number, end: number) => {
    const cur = eff[i]
    const parts = splitter(cur.slice(0, start) + cleaned + cur.slice(end))
    apply(replaceBlock(eff, i, parts), 'paste', i + parts.length - 1, true)
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
                  autoFocus
                  inputRef={ta}
                  onText={(v, c) => typed(i, v, c)}
                  onPasteClean={(c, s, e) => pasted(i, c, s, e)}
                />
              ) : (
                <div
                  className="ed-ptext ed-pread"
                  role="button"
                  tabIndex={0}
                  aria-label={`Paragraph ${i + 1}${isSel ? ', selected' : ''}`}
                  onClick={() => pick(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i) } }}
                >
                  {text ? <MarkedText text={text} spans={p.spansFor(i, text)} onMark={p.onMark ? (m) => p.onMark?.(i, m) : undefined} /> : <span className="ed-empty">Empty paragraph</span>}
                </div>
              )}
              {isSel && (
                <div className="ed-ptools" role="toolbar" aria-label={`Paragraph ${i + 1} tools`}>
                  {p.toolFor?.(i)}
                  {!isEdit && !p.tapToEdit && <button type="button" className="ed-btn" onClick={() => setEditIdx(i)}>Edit text</button>}
                  {isEdit && !p.tapToEdit && <button type="button" className="ed-btn" onClick={() => setEditIdx(null)}>Done</button>}
                  <button type="button" className="ed-btn" disabled={i === 0} onClick={() => apply(moveBlock(eff, i, -1), 'move', i - 1)} aria-label="Move paragraph up">Up</button>
                  <button type="button" className="ed-btn" disabled={i >= eff.length - 1} onClick={() => apply(moveBlock(eff, i, 1), 'move', i + 1)} aria-label="Move paragraph down">Down</button>
                  <button type="button" className="ed-btn" disabled={!isEdit} title={isEdit ? '' : 'Tap Edit text, put the cursor where the paragraph should break'} onClick={() => { const at = ta.current?.selectionStart ?? 0; const b = splitBlock(eff, i, at); if (b !== eff) apply(b, 'split', i + 1, true) }}>Split at cursor</button>
                  <button type="button" className="ed-btn" disabled={i === 0} onClick={() => apply(mergeUp(eff, i), 'merge', i - 1)}>Merge up</button>
                  <button type="button" className="ed-btn" onClick={() => apply(insertBlock(eff, i + 1), 'add', i + 1, true)}>Add below</button>
                  <button type="button" className="ed-btn ed-btn-danger" onClick={() => apply(eff.length > 1 ? removeBlock(eff, i) : [], 'del', null)}>Delete</button>
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
