// Small building blocks of the Edit desk: auto-growing text field, highlighted text, meter ring, bottom sheet, media hook.
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cleanPaste } from './editTools'
import { segmentize, type Span } from './factMap'

interface AutoProps {
  value: string
  /** `composing` is true while an IME (Bangla keyboard, S Pen handwriting) is still building a word */
  onText: (value: string, composing: boolean) => void
  label: string
  className?: string
  lang?: string
  placeholder?: string
  id?: string
  autoFocus?: boolean
  spell?: boolean
  /** replace the default clean-paste insert (used to turn a multi-paragraph paste into paragraphs) */
  onPasteClean?: (cleaned: string, start: number, end: number) => void
  inputRef?: RefObject<HTMLTextAreaElement | null>
  onFocus?: () => void
  singleLine?: boolean
}

/**
 * A textarea that grows with its text. It adds no key handlers, so keyboards, IME composition and the S Pen's
 * handwriting-to-text behave exactly as in any native field. Only paste is touched: pasted text is cleaned first.
 */
export function AutoTextarea({ value, onText, label, className, lang, placeholder, id, autoFocus, spell = true, onPasteClean, inputRef, onFocus, singleLine }: AutoProps) {
  const local = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = local.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  useEffect(() => {
    const el = local.current
    if (autoFocus && el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n) }
  }, [autoFocus])
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
      onFocus={onFocus}
      onChange={(e) => onText(singleLine ? e.target.value.replace(/\s*\n+\s*/g, ' ') : e.target.value, (e.nativeEvent as InputEvent).isComposing === true)}
      onPaste={(e) => {
        const raw = e.clipboardData.getData('text/plain')
        if (!raw) return
        let cleaned = cleanPaste(raw)
        if (singleLine) cleaned = cleaned.replace(/\s*\n+\s*/g, ' ')
        if (cleaned === raw && !cleaned.includes('\n\n')) return // already clean: the phone's own paste is fine
        e.preventDefault()
        const el = e.currentTarget
        const s = el.selectionStart, en = el.selectionEnd
        if (onPasteClean) onPasteClean(cleaned, s, en)
        else onText(value.slice(0, s) + cleaned + value.slice(en), false)
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
