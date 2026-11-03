import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'tonal' | 'outlined' | 'danger'
  leading?: ReactNode
  trailing?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'primary',
  leading,
  trailing,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`kit-btn kit-btn-${variant} ${className}`}
      {...rest}
    >
      {leading && <span className="kit-btn-icon" aria-hidden>{leading}</span>}
      <span>{children}</span>
      {trailing && <span className="kit-btn-icon" aria-hidden>{trailing}</span>}
    </button>
  )
}
