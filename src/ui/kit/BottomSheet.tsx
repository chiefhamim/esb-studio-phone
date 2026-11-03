import { useEffect, type ReactNode } from 'react'
import { IconClose } from '../../shell/icons'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="kit-sheet-scrim" onClick={onClose} aria-hidden>
      <div
        className="kit-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kit-sheet-handle" aria-hidden />
        <div className="kit-sheet-header">
          <h2 className="kit-sheet-title">{title}</h2>
          <button
            type="button"
            className="kit-iconbtn"
            onClick={onClose}
            aria-label="Close sheet"
          >
            <IconClose />
          </button>
        </div>
        <div className="kit-sheet-content">
          {children}
        </div>
      </div>
    </div>
  )
}
