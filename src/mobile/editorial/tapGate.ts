// The second-tap gate for anything that goes live (publish, update, Facebook post): the first tap only ARMS the
// button, a second, separate tap within the window executes. A double-tap faster than MIN_GAP_MS is treated as one
// tap (it stays armed and does not fire), so a stray double-tap can never publish. Pure; the hook wraps it for React.
import { useCallback, useEffect, useRef, useState } from 'react'

export const ARM_MS = 4000
export const MIN_GAP_MS = 350

export interface TapGate {
  /** 'armed' = this tap armed the gate (nothing happened yet); 'fire' = execute now; 'ignored' = too soon after arming. */
  tap(now?: number): 'armed' | 'fire' | 'ignored'
  reset(): void
  /** When the armed state expires (ms epoch), or null when not armed. */
  armedUntil(now?: number): number | null
}

export function createTapGate(windowMs = ARM_MS, minGapMs = MIN_GAP_MS): TapGate {
  let armedAt = 0
  let until = 0
  return {
    tap(now = Date.now()) {
      if (until && now <= until) {
        if (now - armedAt < minGapMs) return 'ignored'
        armedAt = 0
        until = 0
        return 'fire'
      }
      armedAt = now
      until = now + windowMs
      return 'armed'
    },
    reset() { armedAt = 0; until = 0 },
    armedUntil(now = Date.now()) { return until && now <= until ? until : null },
  }
}

/** React wrapper: `armed` is true while the button waits for its second tap; it disarms itself after the window. */
export function useTapGate(onFire: () => void, windowMs = ARM_MS): { armed: boolean; tap: () => void; reset: () => void } {
  const gate = useRef(createTapGate(windowMs))
  const fire = useRef(onFire)
  useEffect(() => { fire.current = onFire })
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reset = useCallback(() => { gate.current.reset(); setArmed(false); clearTimeout(timer.current) }, [])
  const tap = useCallback(() => {
    const r = gate.current.tap()
    if (r === 'armed') {
      setArmed(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { gate.current.reset(); setArmed(false) }, windowMs)
    } else if (r === 'fire') {
      clearTimeout(timer.current)
      setArmed(false)
      fire.current()
    }
  }, [windowMs])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { armed, tap, reset }
}
