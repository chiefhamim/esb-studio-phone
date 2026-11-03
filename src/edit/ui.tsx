// Small building blocks of the Edit desk: auto-growing text field, highlighted text, meter ring, bottom sheet, media hook.
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cleanPaste } from './editTools'
import { Icon, type IconName } from './icons'
import { segmentize, type Span } from './factMap'

interface AutoProps {
  value: string
  /** `composing` is true while an IME (Bangla keyboard, S Pen handwriting) is still building a word. `after` = characters between the cursor and the end of the text. */
  onText: (value: string, composing: boolean, after: number) => void
  label: string
  className?: string
  lang?: string
  placeholder?: string
  id?: string
  autoFocus?: boolean
  /** where the cursor goes when the field takes focus on mount (default: the end) */
  caret?: number
  spell?: boolean
  /** replace the default clean-paste insert (used to turn a multi-paragraph paste into paragraphs) */
  onPasteClean?: (cleaned: string, start: number, end: number) => void
  /** Enter pressed (not during IME composition). Without it, a multi-line field keeps the new line and a single-line field ignores Enter. */
  onEnter?: (start: number, end: number) => void
  /** Backspace pressed with the cursor at the very start (not during IME composition) */
  onBackspaceStart?: () => void
  inputRef?: RefObject<HTMLTextAreaElement | null>
  onFocus?: () => void
  singleLine?: boolean
}

const oneLine = (v: string) => v.replace(/\s*\n+\s*/g, ' ')

/**
 * A textarea that grows with its text. Keys are only touched when the keyboard is not composing (Enter, Backspace at the start),
 * so IME composition and the S Pen's handwriting-to-text behave as in any native field. Pasted text is cleaned first.
 */
export function AutoTextarea({ value, onText, label, className, lang, placeholder, id, autoFocus, caret, spell = true, onPasteClean, onEnter, onBackspaceStart, inputRef, onFocus, singleLine }: AutoProps) {
  const local = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = local.current
    if (!el) return
    // Measuring needs the box collapsed for a moment; that shortens the page and the scroller would clamp its scroll position
    // (the page jumps while typing near the end). Put the scroll position back afterwards.
    const sc = el.closest('.phone-main') as HTMLElement | null
    const top = sc?.scrollTop ?? 0
    el.style.height = 'auto'
    const h = el.scrollHeight
    el.style.height = `${h}px`
    if (sc && sc.scrollTop !== top) sc.scrollTop = top
  }, [value])
  useEffect(() => {
    const el = local.current
    if (autoFocus && el) { el.focus({ preventScroll: true }); const n = Math.max(0, Math.min(caret ?? el.value.length, el.value.length)); el.setSelectionRange(n, n); showInScroller(el, false, false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- focus once, when the field appears
  return (
    <textarea
      ref={(el) => { local.current = el; if (inputRef) inputRef.current = el }}
      id={id}
      className={className}
      aria-label={label}
      lang={lang}
      placeholder={placeholder}
      rows={1}
      value={value}
      spellCheck={spell}
      autoCorrect={spell ? 'on' : 'off'}
      autoCapitalize={lang === 'bn' ? 'none' : 'sentences'}
      enterKeyHint={singleLine ? 'next' : 'enter'}
      onFocus={onFocus}
      onChange={(e) => {
        const el = e.currentTarget
        const raw = el.value
        const v = singleLine ? oneLine(raw) : raw
        const after = singleLine ? v.length - Math.min(v.length, oneLine(raw.slice(0, el.selectionStart)).length) : raw.length - el.selectionStart
        onText(v, (e.nativeEvent as InputEvent).isComposing === true, after)
      }}
      onCompositionEnd={(e) => {
        // a word finished: if it left a line break in the text (Enter during composition), handle it now
        const el = e.currentTarget
        if (!singleLine && /\n/.test(el.value)) onText(el.value, false, el.value.length - el.selectionStart)
      }}
      onKeyDown={(e) => {
        const ne = e.nativeEvent as KeyboardEvent
        if (ne.isComposing || ne.keyCode === 229) return
        const el = e.currentTarget
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
          if (onEnter) { e.preventDefault(); onEnter(el.selectionStart, el.selectionEnd) }
          else if (singleLine) e.preventDefault()
        } else if (e.key === 'Backspace' && onBackspaceStart && el.selectionStart === 0 && el.selectionEnd === 0) {
          e.preventDefault()
          onBackspaceStart()
        }
      }}
      onPaste={(e) => {
        const raw = e.clipboardData.getData('text/plain')
        if (!raw) return
        let cleaned = cleanPaste(raw)
        if (singleLine) cleaned = oneLine(cleaned)
        if (cleaned === raw && !cleaned.includes('\n\n')) return // already clean: the phone's own paste is fine
        e.preventDefault()
        const el = e.currentTarget
        const s = el.selectionStart, en = el.selectionEnd
        if (onPasteClean) onPasteClean(cleaned, s, en)
        else {
          const next = value.slice(0, s) + cleaned + value.slice(en)
          const at = s + cleaned.length
          onText(next, false, next.length - at)
          requestAnimationFrame(() => { try { el.setSelectionRange(at, at) } catch { /* the field is gone */ } })
        }
      }}
    />
  )
}

interface MarkedProps {
  text: string
  spans: Span[]
  onMark?: (markIndex: number) => void
  className?: string
  lang?: string
}
/** Text with highlighted pieces. A piece that has a markIndex is a button. */
export function MarkedText({ text, spans, onMark, className, lang }: MarkedProps) {
  const segs = segmentize(text, spans)
  return (
    <span className={className} lang={lang}>
      {segs.map((s, i) => s.cls === undefined
        ? <span key={i}>{s.text}</span>
        : s.markIndex !== undefined && onMark
          ? <button key={i} type="button" className={`ed-mark ${s.cls}`} onClick={(e) => { e.stopPropagation(); onMark(s.markIndex as number) }}>{s.text}</button>
          : <mark key={i} className={`ed-mark ${s.cls}`} data-pulse={s.cls.includes('ed-pulse') ? '1' : undefined}>{s.text}</mark>)}
    </span>
  )
}

/** A ring that fills with `value / max`. Green while inside, amber near the limit, red over it. */
export function MeterRing({ value, max, size = 44, label, children }: { value: number; max: number; size?: number; label: string; children?: ReactNode }) {
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  const ratio = max > 0 ? value / max : 0
  const tone = ratio > 1 ? 'bad' : ratio > 0.9 ? 'warn' : 'ok'
  return (
    <span className={`ed-ring ed-ring-${tone}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ed-ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ed-ring-fg" strokeDasharray={`${Math.min(1, ratio) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ed-ring-n">{children}</span>
    </span>
  )
}

/** A bottom sheet. Closes on the scrim, the Close button and Escape. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="ed-scrim" onClick={onClose}>
      <div className="ed-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="ed-sheet-head"><h2>{title}</h2><button type="button" className="ed-btn ed-btn-quiet" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  )
}

/** One 44 px button of the paragraph tool row. */
export function Tool({ icon, label, onClick, disabled, danger, text }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; text?: string }) {
  return (
    <button type="button" className={`ed-pt${danger ? ' ed-pt-danger' : ''}${text ? ' ed-pt-txt' : ''}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={20} />{text && <span>{text}</span>}
    </button>
  )
}


/**
 * Bring `el` into view by moving only the page scroller. scrollIntoView and focus() also scroll overflow:hidden ancestors, which
 * shoves the whole app (header, nav) up the screen on a phone. `center` puts it mid-screen, otherwise it moves just enough.
 */
export function showInScroller(el: HTMLElement, center = false, smooth = true): void {
  const sc = el.closest('.phone-main') as HTMLElement | null
  if (!sc) return
  const vv = window.visualViewport
  const sr = sc.getBoundingClientRect()
  const top = sr.top + 56 // the sticky strip
  let bottom = Math.min(sr.bottom, vv ? vv.offsetTop + vv.height : sr.bottom) - 16
  const bar = document.querySelector<HTMLElement>('.ed-actions') // the next-step bar covers the foot of the screen (display:none while typing)
  if (bar && bar.offsetParent !== null) bottom = Math.min(bottom, bar.getBoundingClientRect().top - 8)
  const r = el.getBoundingClientRect()
  let delta = 0
  if (center) delta = (r.top + r.height / 2) - (top + bottom) / 2
  else if (r.top < top) delta = r.top - top
  else if (r.bottom > bottom) delta = Math.min(r.bottom - bottom, r.top - top)
  if (Math.abs(delta) > 1) sc.scrollTo({ top: sc.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' })
}
