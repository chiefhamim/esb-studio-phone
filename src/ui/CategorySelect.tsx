import { useEffect, useId, useRef, useState } from 'react'
import { useBackClose } from '../shell/back'
import { Icon } from '../edit/icons'
import { categoryOf, categoryOptions, moveIndex } from './categoryLogic'
import './select.css'

const OPTIONS = categoryOptions()

/**
 * The category field of Edit and Banner: a 48 px select that opens a bottom-sheet listbox of the site's categories.
 * `value` / `onChange` use the draft's own format (the category name; '' for none).
 */
export function CategorySelect({ value, onChange, id, labelId }: { value: string; onChange: (name: string) => void; id?: string; labelId?: string }) {
  const [open, setOpen] = useState(false)
  const cur = categoryOf(value)
  const curIndex = Math.max(0, OPTIONS.findIndex((o) => (cur ? o.category?.id === cur.id : o.value === '')))
  const [active, setActive] = useState(curIndex)
  const btn = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLUListElement | null>(null)
  const listId = useId()
  const close = () => { setOpen(false); btn.current?.focus() }
  useBackClose(open, () => setOpen(false))

  useEffect(() => {
    if (!open) return
    setActive(curIndex)
    list.current?.focus({ preventScroll: true })
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' })
  }, [open, curIndex])

  const choose = (i: number) => { onChange(OPTIONS[i].value); close() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => moveIndex(a, 1, OPTIONS.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => moveIndex(a, -1, OPTIONS.length)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(OPTIONS.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active) }
  }

  return (
    <>
      <button ref={btn} id={id} type="button" className="cs-field" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-labelledby={labelId && id ? `${labelId} ${id}` : undefined} onClick={() => setOpen(true)}>
        <i className="cs-dot" style={cur ? { background: cur.accent } : undefined} aria-hidden="true" />
        <span className={cur ? 'cs-val' : 'cs-val cs-ph'}>{cur ? cur.name : 'Choose a category'}</span>
        <span className="cs-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>
      </button>
      {open && (
        <div className="cs-scrim" onClick={close}>
          <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="cs-grab" aria-hidden="true" />
            <h2 className="cs-title">Category</h2>
            <ul ref={list} id={listId} className="cs-list" role="listbox" aria-label="Category" tabIndex={0} aria-activedescendant={`${listId}-${active}`} onKeyDown={onKey}>
              {OPTIONS.map((o, i) => {
                const sel = i === curIndex
                return (
                  <li key={o.category?.id ?? 'none'} id={`${listId}-${i}`} role="option" aria-selected={sel} className={`cs-opt${i === active ? ' is-active' : ''}${sel ? ' is-sel' : ''}`} onClick={() => choose(i)}>
                    <i className="cs-dot" style={o.category ? { background: o.category.accent } : undefined} aria-hidden="true" />
                    <span className="cs-name">{o.label}</span>
                    {sel && <span className="cs-tick" aria-hidden="true"><Icon name="check" size={18} /></span>}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
