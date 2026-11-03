// Android back button: the most recently opened layer (sheet, settings) closes first; otherwise App decides.
import { useEffect, useRef } from 'react'

const stack: (() => void)[] = []

/** Closes the top layer. Returns false when there is none. */
export function handleBack(): boolean {
  const top = stack.pop()
  if (!top) return false
  top()
  return true
}

/** While `active`, the back button calls `close` (before anything else). */
export function useBackClose(active: boolean, close: () => void): void {
  const ref = useRef(close)
  useEffect(() => { ref.current = close })
  useEffect(() => {
    if (!active) return
    const fn = () => ref.current()
    stack.push(fn)
    return () => {
      const i = stack.lastIndexOf(fn)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}
