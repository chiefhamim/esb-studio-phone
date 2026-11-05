// Danger actions (Sign out, Disconnect) need a 2-second hold: the button fills from left to right and counts down,
// letting go early cancels. A stray tap can no longer sign the editor out or drop the Facebook Page.
import { useEffect, useRef, useState } from 'react'
import { snack } from './core'

const HOLD_MS = 2000

export function HoldButton({ children, onConfirm, hint }: { children: string; onConfirm: () => void; hint?: string }) {
  const [p, setP] = useState(0)
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
    navigator.vibrate?.(10)
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0.current) / HOLD_MS)
      setP(v)
      if (v >= 1) { done.current = true; raf.current = 0; navigator.vibrate?.([15, 40, 20]); window.setTimeout(() => setP(0), 300); onConfirm(); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const end = () => {
    if (!raf.current) return
    const held = performance.now() - t0.current
    stop(); setP(0)
    if (!done.current && held < 400) snack(hint ?? `Hold for 2 seconds to ${children.toLowerCase()}`)
  }
  const left = Math.max(1, Math.ceil((1 - p) * (HOLD_MS / 1000)))
  return (
    <button type="button" className={'hold-danger' + (p > 0 ? ' is-holding' : '')} style={{ '--hold': p } as React.CSSProperties}
      onPointerDown={start} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} onContextMenu={(e) => e.preventDefault()}
      aria-label={`${children}: press and hold for 2 seconds`}>
      <span className="hold-danger-fill" aria-hidden />
      <span className="hold-danger-txt">{p > 0 && p < 1 ? `Keep holding · ${left}` : children}</span>
    </button>
  )
}
