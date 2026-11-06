// Publish by holding the button for 3 seconds. While the finger is down, a calm countdown beats in the middle of the
// screen (3, 2, 1, each with a soft pulse and a haptic tick) and a ring fills around it; letting go before the end
// cancels. Only a full hold sends the story live. This replaces "tap twice": a deliberate act that a stray touch cannot do.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../shell/ui'

const HOLD_MS = 3000
const R = 54
const C = 2 * Math.PI * R

export function HoldToPublish({ label, sub, disabled, busy, busyLabel, onFire }: { label: string; sub: string; disabled?: boolean; busy?: boolean; busyLabel: string; onFire: () => void }) {
  const [p, setP] = useState(0)
  const raf = useRef(0)
  const t0 = useRef(0)
  const lastSec = useRef(3)
  const fired = useRef(false)
  const stop = () => { cancelAnimationFrame(raf.current); raf.current = 0 }
  useEffect(() => stop, [])

  const start = (e: React.PointerEvent) => {
    if (disabled || busy || (e.pointerType === 'mouse' && e.button !== 0)) return
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
      if (v >= 1) {
        fired.current = true
        raf.current = 0
        navigator.vibrate?.([20, 50, 30])
        window.setTimeout(() => setP(0), 900)
        // Paint the spinning "Publishing" dial first, then start the work: the session check, render and upload that
        // follow keep the page busy, and a frame not painted yet left a frozen full ring on screen.
        requestAnimationFrame(() => window.setTimeout(onFire, 0))
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const end = () => { if (!raf.current) return; stop(); if (!fired.current) setP(0) }

  const holding = p > 0
  const sec = Math.max(1, 3 - Math.floor(p * 3))
  return (
    <>
      <button type="button" className={'hp-btn' + (holding ? ' is-holding' : '') + (busy ? ' is-busy' : '')} style={{ '--hold': p } as React.CSSProperties}
        disabled={disabled && !busy} aria-label={busy ? busyLabel : `${label}: press and hold for 3 seconds`}
        onPointerDown={start} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} onContextMenu={(e) => e.preventDefault()}>
        <span className="hp-fill" aria-hidden />
        {busy ? <span className="hp-txt"><span className="m-spin" aria-hidden /><b>{busyLabel}</b></span>
          : <span className="hp-txt"><Icon name="upload" size={20} /><span className="hp-lines"><b>{holding ? 'Keep holding' : `Hold to ${label.toLowerCase()}`}</b><small>{sub}</small></span></span>}
      </button>
      {holding && createPortal(
        <div className="hp-overlay" aria-live="assertive">
          <div className={'hp-dial' + (p >= 1 ? ' is-go' : '')}>
            <svg viewBox="0 0 120 120" width="148" height="148" aria-hidden>
              <circle cx="60" cy="60" r={R} className="hp-track" />
              <circle cx="60" cy="60" r={R} className="hp-prog" strokeDasharray={C} strokeDashoffset={p >= 1 ? C * 0.72 : C * (1 - p)} transform="rotate(-90 60 60)" />
            </svg>
            <span key={p >= 1 ? 'go' : sec} className="hp-num">{p >= 1 ? <Icon name="check" size={44} /> : sec}</span>
          </div>
          <p className="hp-say">{p >= 1 ? `${label === 'Update' ? 'Updating' : 'Publishing'}` : 'Release to cancel'}</p>
        </div>,
        document.body,
      )}
    </>
  )
}
