// Publish by holding the button for 3 seconds. While the finger is down a "Going to press" card rises in the middle of
// the screen: the ESB masthead stripe (green / red / orange) fills as the hold progresses, and the things that are about
// to go live tick off one by one (the story, the banners, esbpowerline.com, the Facebook Page), each with a light haptic
// tap. Letting go before the end cancels. Only a full hold sends the story live: a deliberate act that a stray touch
// cannot do. (2026-11-06: replaced the 3-2-1 dial, which said nothing about what was being sent.)
//
// The hand-off when the hold completes is one continuous gesture, not a cut:
//   go   (0–600 ms)   the last row is ticked, the stripe is whole, the card pops once, a green check springs into its
//                     badge and the title becomes "Publishing…"
//   out  (600–980)    the card shrinks down into the button while the backdrop fades; the button takes the hand-off
//                     with a small press and shows its own spinner
// Every step is a transform/opacity animation, so it runs on the compositor and stays smooth while the publish keeps the
// page busy. The work itself starts one painted frame after the hold completes.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../shell/ui'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// One crisp tap from the phone's haptic engine (a navigator.vibrate pattern buzzed twice and felt rough).
function tap(style: ImpactStyle, ms: number) {
  Haptics.impact({ style }).catch(() => { try { navigator.vibrate?.(ms) } catch { /* no haptics */ } })
}

const HOLD_MS = 3000
const GO_MS = 600
const OUT_MS = 380
// the rows tick across the first 88% of the hold, so the last one lands just before the hold completes
const TICK_SPAN = 0.88

export interface PressItem { label: string; sub?: string }
type Phase = null | 'go' | 'out'

export function HoldToPublish({ label, sub, items, disabled, busy, busyLabel, onFire }: {
  label: string; sub: string; items: PressItem[]; disabled?: boolean; busy?: boolean; busyLabel: string; onFire: () => void
}) {
  const [p, setP] = useState(0)
  const [phase, setPhase] = useState<Phase>(null)
  const raf = useRef(0)
  const t0 = useRef(0)
  const ticked = useRef(0)
  const fired = useRef(false)
  const timers = useRef<number[]>([])
  const btn = useRef<HTMLButtonElement>(null)
  const [drop, setDrop] = useState(0)
  const n = Math.max(1, items.length)
  const stop = () => { cancelAnimationFrame(raf.current); raf.current = 0 }
  useEffect(() => () => { stop(); timers.current.forEach(clearTimeout) }, [])

  const complete = () => {
    fired.current = true
    raf.current = 0
    tap(ImpactStyle.Medium, 24)
    // where the card travels on the way out: from the middle of the screen down to the button's centre
    const r = btn.current?.getBoundingClientRect()
    setDrop(r ? r.top + r.height / 2 - window.innerHeight / 2 : window.innerHeight * 0.4)
    setPhase('go')
    timers.current.push(
      window.setTimeout(() => setPhase('out'), GO_MS),
      window.setTimeout(() => { setPhase(null); setP(0) }, GO_MS + OUT_MS),
    )
    // paint the "go" frame first, then start the work (a frame not painted yet would sit frozen on screen)
    requestAnimationFrame(() => window.setTimeout(onFire, 0))
  }

  const start = (e: React.PointerEvent) => {
    if (disabled || busy || phase || (e.pointerType === 'mouse' && e.button !== 0)) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    fired.current = false
    t0.current = performance.now()
    ticked.current = 0
    tap(ImpactStyle.Light, 12)
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0.current) / HOLD_MS)
      const done = Math.min(n, Math.floor((v / TICK_SPAN) * n + 1e-6))
      if (done > ticked.current) { ticked.current = done; if (v < 1) tap(ImpactStyle.Light, 10) }
      setP(v)
      if (v >= 1) { complete(); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const end = () => { if (!raf.current) return; stop(); if (!fired.current) setP(0) }

  const holding = p > 0 && !phase
  const shown = p > 0 || !!phase
  const done = phase ? n : Math.min(n, Math.floor((p / TICK_SPAN) * n + 1e-6))
  const left = Math.max(1, Math.ceil((1 - p) * (HOLD_MS / 1000)))
  const cls = 'hp-btn' + (holding ? ' is-holding' : '') + (busy ? ' is-busy' : '') + (phase ? ' is-fired' : '') + (phase === 'out' ? ' is-land' : '')
  return (
    <>
      <button ref={btn} type="button" className={cls} style={{ '--hold': p } as React.CSSProperties}
        disabled={disabled && !busy} aria-label={busy ? busyLabel : `${label}: press and hold for 3 seconds`}
        onPointerDown={start} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} onContextMenu={(e) => e.preventDefault()}>
        <span className="hp-fill" aria-hidden />
        {busy ? <span key="busy" className="hp-txt is-swap"><span className="m-spin" aria-hidden /><b>{busyLabel}</b></span>
          : <span key="idle" className="hp-txt"><Icon name="upload" size={20} /><span className="hp-lines"><b>{holding ? 'Keep holding' : `Hold to ${label.toLowerCase()}`}</b><small>{sub}</small></span></span>}
      </button>
      {shown && createPortal(
        <div className={'hp-overlay hp-v2' + (phase ? ` is-${phase}` : '')} style={{ '--drop': `${drop}px`, '--hold': phase ? 1 : p } as React.CSSProperties} aria-live="assertive">
          <div className="hp-travel">
            <section className="hp-press" role="status">
              <div className="hp-rule" aria-hidden><i /></div>
              <header className="hp-head">
                <span key={phase ? 'go' : 'hold'} className={'hp-badge' + (phase ? ' is-go' : '')} aria-hidden>
                  {phase ? <Icon name="check" size={20} strokeWidth={2.6} /> : <b>{left}</b>}
                </span>
                <span className="hp-head-t">
                  <b>{phase ? `${busyLabel}…` : 'Going to press'}</b>
                  <small>{phase ? sub : 'Release to cancel'}</small>
                </span>
              </header>
              <ul className="hp-list">
                {items.map((it, i) => (
                  <li key={it.label} className={i < done ? 'is-done' : ''}>
                    <span className="hp-tick" aria-hidden><Icon name="check" size={14} strokeWidth={3} /></span>
                    <span className="hp-it"><b>{it.label}</b>{it.sub && <small>{it.sub}</small>}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
