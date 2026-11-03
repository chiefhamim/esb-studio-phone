import type { ReactNode } from 'react'

interface ExtendedFABProps {
  icon: ReactNode
  label: string
  onClick: () => void
  ariaLabel?: string
}

export function ExtendedFAB({ icon, label, onClick, ariaLabel }: ExtendedFABProps) {
  return (
    <button
      type="button"
      className="kit-fab"
      onClick={onClick}
      aria-label={ariaLabel || label}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
