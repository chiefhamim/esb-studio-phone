import { useEffect } from 'react'

export interface Toast { id: number; text: string; undo?: () => void }

/** Short message with an optional Undo. Dismisses itself after 6 s (Undo toasts) or 3 s. */
export default function Snackbar({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(onDone, toast.undo ? 6000 : 3000)
    return () => window.clearTimeout(t)
  }, [toast, onDone])
  if (!toast) return null
  return (
    <div className="sh-snack" role="status" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo && <button type="button" onClick={() => { toast.undo?.(); onDone() }}>Undo</button>}
    </div>
  )
}
