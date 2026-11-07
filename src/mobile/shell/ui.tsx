// Mobile component kit: Android patterns (Material 3 behaviour and motion) in ESB tokens (PC colours, Inter + Hind
// Siliguri, PC icon set). Every interactive element has a 48 px hit area.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './TablerIcon'
import { dismissSnack, useBackLayer, useUi, type Snack } from './core'

export { Icon, type IconName }

// ---------------------------------------------------------------- buttons
type BtnKind = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger'
export function Button({ kind = 'filled', icon, children, onClick, disabled, busy, type = 'button', className = '', label, wide }: {
  kind?: BtnKind; icon?: IconName; children?: ReactNode; onClick?: () => void; disabled?: boolean; busy?: boolean; type?: 'button' | 'submit'; className?: string; label?: string; wide?: boolean
}) {
  return (
    <button type={type} className={`m-btn m-btn-${kind}${wide ? ' m-btn-wide' : ''} ${className}`} onClick={onClick} disabled={disabled || busy} aria-label={label} aria-busy={busy || undefined}>
      {busy ? <span className="m-spin" aria-hidden /> : icon ? <Icon name={icon} size={18} /> : null}
      {children != null && <span className="m-btn-label">{children}</span>}
    </button>
  )
}

export function IconBtn({ icon, label, onClick, active, disabled, badge, className = '' }: { icon: IconName; label: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; active?: boolean; disabled?: boolean; badge?: string | number; className?: string }) {
  return (
    <button type="button" className={`m-iconbtn${active ? ' is-on' : ''} ${className}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active ?? undefined} title={label}>
      <Icon name={icon} size={22} />
      {badge != null && <span className="m-badge" aria-hidden>{badge}</span>}
    </button>
  )
}

// ---------------------------------------------------------------- top app bar (one row)
export function TopBar({ title, sub, leading, actions, overflow, under }: { title: ReactNode; sub?: ReactNode; leading?: ReactNode; actions?: ReactNode; overflow?: MenuItem[]; under?: ReactNode }) {
  return (
    <header className="m-topbar">
      <div className="m-topbar-row">
        {leading}
        <div className="m-topbar-title">
          <h1>{title}</h1>
          {sub && <div className="m-topbar-sub">{sub}</div>}
        </div>
        <div className="m-topbar-actions">
          {actions}
          {overflow && overflow.length > 0 && <MenuButton icon="more" label="More options" items={overflow} />}
        </div>
      </div>
      {under}
    </header>
  )
}

// ---------------------------------------------------------------- navigation: bottom bar (compact) / rail (medium+)
export interface NavItem { id: string; label: string; icon: IconName; badge?: string | number; /** the one raised action in the bar (it starts something, it is not a place) */ primary?: boolean; /** colour of the badge: the default is the accent */ tone?: 'ok' | 'warn' | 'bad' }
export function NavBar({ items, value, onChange, rail }: { items: NavItem[]; value: string; onChange: (id: string) => void; rail?: boolean }) {
  const found = items.findIndex((it) => it.id === value)
  const idx = Math.max(0, found)
  return (
    <nav className={(rail ? 'm-rail' : 'm-navbar') + (found < 0 ? ' no-sel' : '')} aria-label="Main" style={{ '--i': idx, '--n': items.length } as React.CSSProperties}>
      {!rail && <span className="m-nav-glide" aria-hidden />}
      {items.map((it) => (
        <button key={it.id} type="button" className={`m-nav-item${value === it.id ? ' is-on' : ''}${it.primary ? ' is-primary' : ''}`} aria-current={value === it.id ? 'page' : undefined} onClick={() => onChange(it.id)}>
          <span className="m-nav-pill"><Icon name={it.icon} size={24} filled={value === it.id} />{it.badge != null && <span className={'m-badge' + (it.tone ? ' is-' + it.tone : '')}>{it.badge}</span>}</span>
          <span className="m-nav-label">{it.label}</span>
        </button>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------- menu anchored to its button
export interface MenuItem { label: string; icon?: IconName; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string; checked?: boolean; divider?: boolean; /** short text drawn in the icon tile instead of an icon ("1h", a step number) */ lead?: string; /** tint the lead tile (a finished step) */ leadOn?: boolean }
export function MenuButton({ icon = 'more', label, items, children, className = '' }: { icon?: IconName; label: string; items: MenuItem[]; children?: ReactNode; className?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button type="button" className={children ? `m-btn m-btn-text ${className}` : `m-iconbtn ${className}`} aria-label={label} aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => setAnchor(e.currentTarget)} title={label}>
        <Icon name={icon} size={22} />{children}
      </button>
      {anchor && <Menu anchor={anchor} items={items} onClose={() => setAnchor(null)} />}
    </>
  )
}

export function Menu({ anchor, items, onClose }: { anchor: HTMLElement | null; items: MenuItem[]; onClose: () => void }) {
  useBackLayer(true, onClose, 'menu')
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const r = anchor?.getBoundingClientRect() ?? { left: window.innerWidth - 16, right: window.innerWidth - 16, bottom: 64, top: 64 }
    const w = m.offsetWidth, h = m.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight
    // Menus sit on the page's 16 px gutters: one that would end just short of the right gutter (a row's ⋯ button)
    // lines up with it, and one opened from the left never pokes past the left gutter.
    const G = 16
    let left = r.right - w
    if (left + w > vw - G - 24) left = vw - G - w
    left = Math.min(Math.max(G, left), vw - w - G)
    const below = vh - r.bottom - 8
    const top = below >= Math.min(h, 240) ? r.bottom + 4 : Math.max(8, r.top - h - 4)
    setPos({ top, left, maxH: vh - top - 8 })
  }, [anchor])
  return createPortal(
    <div className="m-menu-scrim" onClick={onClose}>
      <div ref={ref} role="menu" className="m-menu" style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxH } : { visibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        {items.map((it, i) => it.divider ? <div key={i} className="m-menu-div" role="separator" /> : (
          <button key={i} type="button" role="menuitem" className={`m-menu-item${it.danger ? ' is-danger' : ''}`} disabled={it.disabled} onClick={() => { onClose(); it.onClick() }}>
            {it.lead != null ? <span className={'m-menu-lead' + (it.leadOn ? ' is-on' : '')} aria-hidden>{it.lead}</span> : it.icon && <Icon name={it.icon} size={20} />}
            <span className="m-menu-text"><span>{it.label}</span>{it.hint && <small>{it.hint}</small>}</span>
            {it.checked && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- modal bottom sheet: drag handle, half/full states
export type SheetSnap = 'half' | 'full'
export function Sheet({ id, title, children, footer, actions, initial = 'half', onClosed, wide, label }: {
  id: string; title: ReactNode; children: ReactNode; footer?: ReactNode; actions?: ReactNode; initial?: SheetSnap; onClosed?: () => void; wide?: boolean; label?: string
}) {
  const open = useUi((s) => s.sheet === id)
  const closeSheet = useUi((s) => s.closeSheet)
  const [snap, setSnap] = useState<SheetSnap>(initial)
  const [drag, setDrag] = useState(0)
  const start = useRef<{ y: number; t: number } | null>(null)
  const close = useCallback(() => { closeSheet(id); onClosed?.() }, [closeSheet, id, onClosed])
  useBackLayer(open, close, 'sheet')
  useEffect(() => { if (open) { setSnap(initial); setDrag(0) } }, [open, initial])
  if (!open) return null

  const onDown = (e: React.PointerEvent) => { start.current = { y: e.clientY, t: performance.now() }; (e.target as HTMLElement).setPointerCapture(e.pointerId) }
  const onMove = (e: React.PointerEvent) => { if (start.current) setDrag(e.clientY - start.current.y) }
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return
    const dy = e.clientY - start.current.y
    const v = dy / Math.max(1, performance.now() - start.current.t)
    start.current = null
    setDrag(0)
    if (dy > 120 || v > 0.8) { if (snap === 'full' && dy < 320) setSnap('half'); else close() }
    else if (dy < -60 || v < -0.6) setSnap('full')
  }
  return createPortal(
    <div className="m-scrim" onClick={close}>
      <section role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} className={`m-sheet m-sheet-${snap}${wide ? ' m-sheet-wide' : ''}`} style={drag ? { transform: `translateY(${Math.max(-40, drag)}px)`, transition: 'none' } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => setSnap(snap === 'full' ? 'half' : 'full')}>
          <span className="m-sheet-handle" aria-hidden />
          <button type="button" className="m-sr" onClick={() => setSnap(snap === 'full' ? 'half' : 'full')}>{snap === 'full' ? 'Shrink sheet' : 'Expand sheet'}</button>
        </div>
        <header className="m-sheet-head">
          <h2>{title}</h2>
          <div className="m-sheet-actions">{actions}<IconBtn icon="x" label="Close" onClick={close} /></div>
        </header>
        <div className="m-sheet-body">{children}</div>
        {footer && <footer className="m-sheet-foot">{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- full-screen dialog (long forms: publish, export, source)
export function FullDialog({ open, title, onClose, primary, children, footer, under, sub, back }: { open: boolean; title: ReactNode; onClose: () => void; primary?: ReactNode; children: ReactNode; footer?: ReactNode; under?: ReactNode; sub?: ReactNode; back?: boolean }) {
  useBackLayer(open, onClose, 'dialog')
  if (!open) return null
  return createPortal(
    <div className="m-fulldialog" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <header className="m-topbar m-fulldialog-bar">
        <div className="m-topbar-row">
          <IconBtn icon={back ? 'chevLeft' : 'x'} label={back ? 'Back' : 'Close'} onClick={onClose} />
          <div className="m-topbar-title"><h1>{title}</h1>{sub && <div className="m-topbar-sub">{sub}</div>}</div>
          <div className="m-topbar-actions">{primary}</div>
        </div>
        {under}
      </header>
      <div className="m-fulldialog-body">{children}</div>
      {footer && <footer className="m-actionbar">{footer}</footer>}
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- snackbars + confirm host (mounted once by the app)
function SnackItem({ snack }: { snack: Snack }) {
  const [offsetX, setOffsetX] = useState(0)
  const [isDismissing, setIsDismissing] = useState(false)
  const [isSwiping, setIsSwiping] = useState(false)
  const pointerStart = useRef<{ x: number; y: number; time: number; active: boolean } | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    pointerStart.current = { x: e.clientX, y: e.clientY, time: Date.now(), active: true }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current?.active) return
    const dx = e.clientX - pointerStart.current.x
    const dy = e.clientY - pointerStart.current.y

    if (!isSwiping && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      pointerStart.current.active = false
      setOffsetX(0)
      return
    }

    if (!isSwiping && Math.abs(dx) > 4) {
      setIsSwiping(true)
    }

    // Swipe left only; damp rightward movement
    if (dx < 0) {
      setOffsetX(dx)
    } else {
      setOffsetX(Math.min(dx * 0.15, 16))
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current?.active) {
      setIsSwiping(false)
      return
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}

    const dx = e.clientX - pointerStart.current.x
    const dt = Math.max(1, Date.now() - pointerStart.current.time)
    const vx = dx / dt
    pointerStart.current = null
    setIsSwiping(false)

    // Swiped left threshold: moved left >= 45px or quick flick (vx < -0.3 px/ms)
    if (dx < -45 || (dx < -15 && vx < -0.3)) {
      setIsDismissing(true)
      setOffsetX(-Math.max(typeof window !== 'undefined' ? window.innerWidth : 360, 400))
      setTimeout(() => dismissSnack(snack.id), 200)
    } else {
      setOffsetX(0)
    }
  }

  const onPointerCancel = () => {
    pointerStart.current = null
    setIsSwiping(false)
    setOffsetX(0)
  }

  const handleDismiss = () => {
    setIsDismissing(true)
    setOffsetX(-Math.max(typeof window !== 'undefined' ? window.innerWidth : 360, 400))
    setTimeout(() => dismissSnack(snack.id), 200)
  }

  const style: React.CSSProperties = {
    transform: `translate3d(${offsetX}px, 0, 0)`,
    transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0, 0, 1), opacity 0.22s ease-out',
    opacity: isDismissing ? 0 : offsetX < 0 ? Math.max(0.1, 1 + offsetX / 250) : 1,
    touchAction: 'pan-y',
    userSelect: 'none',
  }

  return (
    <div
      className={`m-snack m-snack-${snack.tone ?? 'info'}${isSwiping ? ' is-swiping' : ''}${isDismissing ? ' is-dismissing' : ''}`}
      role={snack.tone === 'error' ? 'alert' : 'status'}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="m-snack-indicator" aria-hidden />
      <span className="m-snack-text">{snack.text}</span>
      {snack.action && (
        <button
          type="button"
          className="m-snack-action"
          onClick={(e) => {
            e.stopPropagation()
            snack.action!.run()
            dismissSnack(snack.id)
          }}
        >
          {snack.action.label}
        </button>
      )}
      <button
        type="button"
        className="m-iconbtn m-snack-x"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation()
          handleDismiss()
        }}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  )
}

export function UiHost() {
  const snacks = useUi((s) => s.snacks)
  const confirm = useUi((s) => s.confirm)
  const done = (ok: boolean) => { confirm?.resolve(ok); useUi.setState({ confirm: null }) }
  useBackLayer(!!confirm, () => done(false), 'dialog')
  return (
    <>
      <div className="m-snackbars" aria-live="polite">
        {snacks.map((s) => (
          <SnackItem key={s.id} snack={s} />
        ))}
      </div>
      {confirm && createPortal(
        <div className="m-scrim m-scrim-center" onClick={() => done(false)}>
          <div className="m-alert" role="alertdialog" aria-modal="true" aria-label={confirm.title} onClick={(e) => e.stopPropagation()}>
            <h2>{confirm.title}</h2>
            {confirm.body && <p>{confirm.body}</p>}
            <div className="m-alert-actions">
              <Button kind="text" onClick={() => done(false)}>{confirm.cancel ?? 'Cancel'}</Button>
              <Button kind={confirm.danger ? 'danger' : 'filled'} onClick={() => done(true)}>{confirm.confirm}</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ---------------------------------------------------------------- small pieces
export function Segmented<T extends string>({ value, options, onChange, label, compact }: { value: T; options: { value: T; label: string; icon?: IconName; node?: ReactNode }[]; onChange: (v: T) => void; label: string; compact?: boolean }) {
  return (
    <div className={'m-seg' + (compact ? ' m-seg-compact' : '')} role="radiogroup" aria-label={label} style={{ '--i': Math.max(0, options.findIndex((o) => o.value === value)), '--n': options.length } as React.CSSProperties}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`m-seg-item${value === o.value ? ' is-on' : ''}`} onClick={() => onChange(o.value)}>
          {compact ? (o.node ?? (o.icon && <Icon name={o.icon} size={20} />)) : <>{o.icon && <Icon name={o.icon} size={16} />}</>}<span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Chip({ on, onClick, children, icon, color }: { on?: boolean; onClick?: () => void; children: ReactNode; icon?: IconName; color?: string }) {
  return (
    <button type="button" className={`m-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick} style={color ? ({ '--chip-c': color } as React.CSSProperties) : undefined}>
      {on ? <Icon name="check" size={16} /> : icon ? <Icon name={icon} size={16} /> : color ? <span className="m-chip-dot" /> : null}
      <span>{children}</span>
    </button>
  )
}

export function Row({ title, meta, lead, trail, onClick, tall, ...rest }: { title: ReactNode; meta?: ReactNode; lead?: ReactNode; trail?: ReactNode; onClick?: () => void; tall?: boolean } & Omit<React.HTMLAttributes<HTMLElement>, 'title' | 'onClick'>) {
  const inner = (<>{lead && <span className="m-row-lead">{lead}</span>}<span className="m-row-text"><span className="m-row-title">{title}</span>{meta && <span className="m-row-meta">{meta}</span>}</span>{trail && <span className="m-row-trail">{trail}</span>}</>)
  return onClick
    ? <button type="button" className={`m-row${tall ? ' m-row-tall' : ''}`} onClick={onClick} {...rest}>{inner}</button>
    : <div className={`m-row${tall ? ' m-row-tall' : ''}`} {...rest}>{inner}</div>
}

export function Empty({ icon, title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return <div className="m-empty">{icon && <span className="m-empty-icon"><Icon name={icon} size={28} /></span>}<h3>{title}</h3>{body && <p>{body}</p>}{action}</div>
}

export function ErrorState({ title, body, onRetry }: { title: string; body?: ReactNode; onRetry?: () => void }) {
  return <div className="m-empty m-empty-error" role="alert"><span className="m-empty-icon"><Icon name="alert" size={28} /></span><h3>{title}</h3>{body && <p>{body}</p>}{onRetry && <Button kind="tonal" icon="refresh" onClick={onRetry}>Try again</Button>}</div>
}

export function Skeleton({ rows = 3, thumb }: { rows?: number; thumb?: boolean }) {
  return <div className="m-skel" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="m-skel-row">{thumb && <span className="m-skel-thumb" />}<span className="m-skel-lines"><span /><span /></span></div>)}</div>
}

export function Section({ title, children, trail, id }: { title?: ReactNode; children: ReactNode; trail?: ReactNode; id?: string }) {
  return <section className="m-section" id={id}>{title && <header className="m-section-head"><h2>{title}</h2>{trail}</header>}{children}</section>
}

/** Collapsible group (Inspector: Position · Size · Type …): common open, advanced one tap away. */
export function Collapse({ title, children, defaultOpen = false, sub, lead }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; sub?: ReactNode; lead?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`m-collapse${open ? ' is-open' : ''}`}>
      <button type="button" className="m-collapse-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {lead && <span className="m-collapse-lead">{lead}</span>}<span className="m-collapse-title">{title}{sub && <small>{sub}</small>}</span><Icon name={open ? 'chevUp' : 'chevDown'} size={20} />
      </button>
      {open && <div className="m-collapse-body">{children}</div>}
    </section>
  )
}

export function Banner({ tone = 'info', icon, children, action }: { tone?: 'info' | 'warn' | 'error' | 'success' | 'planned'; icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return <div className={`m-note m-note-${tone}`} role={tone === 'error' ? 'alert' : undefined}><Icon name={icon ?? (tone === 'success' ? 'check' : tone === 'info' || tone === 'planned' ? 'info' : 'alert')} size={18} /><div className="m-note-text">{children}</div>{action}</div>
}

/** "Planned" marker for anything not built yet (never a fake working control). */
export function Planned({ children }: { children?: ReactNode }) {
  return <span className="m-planned">Planned{children ? <> · {children}</> : null}</span>
}

// ---------------------------------------------------------------- dropdown: a labelled pill that opens a list under itself (never the platform's select)
export function Dropdown<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; hint?: string; lead?: ReactNode }[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  useBackLayer(open, () => setOpen(false), 'menu')
  const cur = options.find((o) => o.value === value)
  const r = open && ref.current ? ref.current.getBoundingClientRect() : null
  // Under the field when the list fits there; otherwise it rises from the bottom of the screen so it is never cut off by the edge.
  const below = r ? window.innerHeight - r.bottom - 6 - 12 : 0
  const panelStyle: React.CSSProperties | undefined = r
    ? below >= Math.min(options.length * 56 + 24, window.innerHeight * 0.5)
      ? { top: r.bottom + 6, maxHeight: `calc(${below}px - var(--m-safe-bottom))` }
      : { top: 'auto', bottom: 'calc(12px + var(--m-safe-bottom))', maxHeight: '72dvh', transformOrigin: 'bottom center' }
    : undefined
  return (
    <>
      <button ref={ref} type="button" className={'dd' + (open ? ' is-open' : '')} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        {cur?.lead && <span className="dd-lead" aria-hidden>{cur.lead}</span>}
        <span className="dd-txt"><small>{label}</small><b>{cur?.label ?? value}</b></span>
        <Icon name="chevDown" size={18} />
      </button>
      {open && r && createPortal(
        <div className="gx-dropscrim" onClick={() => setOpen(false)}>
          <div className="gx-droppanel dd-panel" role="listbox" aria-label={label} style={panelStyle} onClick={(e) => e.stopPropagation()}>
            {options.map((o) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} className={'dd-opt' + (o.value === value ? ' is-on' : '')} onClick={() => { onChange(o.value); setOpen(false) }}>
                <span className="dd-opt-c">{o.value === value && <Icon name="check" size={18} />}</span>
                {o.lead && <span className="dd-lead dd-opt-i" aria-hidden>{o.lead}</span>}
                <span className="dd-opt-l">{o.label}</span>
                {o.hint && <span className="dd-opt-h">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
