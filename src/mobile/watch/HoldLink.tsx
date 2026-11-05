// Yeasin Fiyaz's name, as on EnergyWatch's own footer ("Made by: Yeasin Fiyaz" links to his portfolio). Here the link
// opens only after a 3-second press and hold, with a countdown ring, so a stray tap while scrolling never leaves the app.
import { useEffect, useRef, useState } from 'react'
import { snack } from '../shell/core'
import { platform } from '../../platform/platform'

export const YEASIN_PORTFOLIO = 'https://yeasinfiyaz.netlify.app'
const HOLD_MS = 3000
const R = 9
const C = 2 * Math.PI * R

export function YeasinName() {
  const [p, setP] = useState(0) // 0..1 while held
  const raf = useRef(0)
  const t0 = useRef(0)
  const done = useRef(false)
  const stop = () => { cancelAnimationFrame(raf.current); raf.current = 0 }
  useEffect(() => stop, [])

  const start = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    done.current = false
    t0.current = performance.now()
    navigator.vibrate?.(8)
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0.current) / HOLD_MS)
      setP(v)
      if (v >= 1) {
        done.current = true
        raf.current = 0
        navigator.vibrate?.([12, 40, 18])
        void platform().openExternal(YEASIN_PORTFOLIO)
        window.setTimeout(() => setP(0), 600)
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const end = () => {
    if (!raf.current) return
    const held = performance.now() - t0.current
    stop()
    setP(0)
    if (!done.current && held < 600) snack("Press and hold for 3 seconds to open Yeasin's portfolio")
  }

  const left = Math.ceil((1 - p) * (HOLD_MS / 1000))
  const holding = p > 0 && p < 1
  return (
    <button type="button" className={'ew-yeasin' + (holding ? ' is-holding' : '') + (p >= 1 ? ' is-done' : '')} style={{ '--hold': p } as React.CSSProperties}
      onPointerDown={start} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} onContextMenu={(e) => e.preventDefault()}
      aria-label="Yeasin Fiyaz: press and hold for 3 seconds to open his portfolio">
      <span className="ew-yeasin-name">Yeasin Fiyaz</span>
      {(holding || p >= 1) && (
        <span className="ew-ring" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22">
            <circle cx="12" cy="12" r={R} className="ew-ring-bg" />
            <circle cx="12" cy="12" r={R} className="ew-ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 12 12)" />
          </svg>
          <b>{p >= 1 ? '✓' : left}</b>
        </span>
      )}
    </button>
  )
}
