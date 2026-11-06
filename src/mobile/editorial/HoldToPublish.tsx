// Publish by holding the button for 3 seconds. While the finger is down, a calm countdown beats in the middle of the
// screen (3, 2, 1, each with a soft pulse and a haptic tick) and a ring fills around it; letting go before the end
// cancels. Only a full hold sends the story live. This replaces "tap twice": a deliberate act that a stray touch cannot do.
//
// The hand-off when the hold completes is one continuous gesture, not a cut (2026-11-06):
//   go   (0–720 ms)   the full ring turns green, the dial pops, a check springs in, the label becomes "Publishing…",
//                     then the ring opens into a spinning arc: the work has started
//   out  (720–1100)   the dial shrinks down into the button while the backdrop fades; the button takes the hand-off
//                     with a small press and shows its own spinner
// Every step is a transform/opacity animation, so it runs on the compositor and stays smooth while the publish keeps the
// page busy. The work itself starts one painted frame after the hold completes.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../shell/ui'

const HOLD_MS = 3000
const GO_MS = 720
const OUT_MS = 380
const R = 54
const C = 2 * Math.PI * R

type Phase = null | 'go' | 'out'

export function HoldToPublish({ label, sub, disabled, busy, busyLabel, onFire }: { label: string; sub: string; disabled?: boolean; busy?: boolean; busyLabel: string; onFire: () => void }) {
  const [p, setP] = useState(0)
  const [phase, setPhase] = useState<Phase>(null)
  const raf = useRef(0)
  const t0 = useRef(0)
  const lastSec = useRef(3)
  const fired = useRef(false)
  const timers = useRef<number[]>([])
  const btn = useRef<HTMLButtonElement>(null)
  const [drop, setDrop] = useState(0)
  const stop = () => { cancelAnimationFrame(raf.current); raf.current = 0 }
  useEffect(() => () => { stop(); timers.current.forEach(clearTimeout) }, [])

  const complete = () => {
    fired.current = true
    raf.current = 0
    navigator.vibrate?.([20, 50, 30])
    // where the dial travels on the way out: from the middle of the screen (the dial sits just above centre, above its
    // label) down to the button's centre
    const r = btn.current?.getBoundingClientRect()
    setDrop(r ? r.top + r.height / 2 - (window.innerHeight / 2 - 26) : window.innerHeight * 0.4)
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
    lastSec.current = 3
    navigator.vibrate?.(14)
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0.current) / HOLD_MS)
      const sec = Math.max(1, 3 - Math.floor((now - t0.current) / 1000))
      if (sec !== lastSec.current) { lastSec.current = sec; navigator.vibrate?.(14) }
      setP(v)
      if (v >= 1) { complete(); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const end = () => { if (!raf.current) return; stop(); if (!fired.current) setP(0) }

  const holding = p > 0 && !phase
  const shown = p > 0 || !!phase
  const sec = Math.max(1, 3 - Math.floor(p * 3))
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
        <div className={'hp-overlay' + (phase ? ` is-${phase}` : '')} style={{ '--drop': `${drop}px` } as React.CSSProperties} aria-live="assertive">
          <div className="hp-travel">
            <div className="hp-dial">
              <svg viewBox="0 0 120 120" width="148" height="148" aria-hidden>
                <circle cx="60" cy="60" r={R} className="hp-track" />
                <circle cx="60" cy="60" r={R} className="hp-prog" strokeDasharray={C} strokeDashoffset={phase ? C * 0.72 : C * (1 - p)} transform="rotate(-90 60 60)" />
              </svg>
              <span key={phase ? 'go' : sec} className={'hp-num' + (phase ? ' is-check' : '')}>{phase ? <Icon name="check" size={46} /> : sec}</span>
            </div>
          </div>
          <p key={phase ? 'go' : 'hold'} className="hp-say">{phase ? `${busyLabel}…` : 'Release to cancel'}</p>
        </div>,
        document.body,
      )}
    </>
  )
}
