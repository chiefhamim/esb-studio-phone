// Wrapper for vendored PC components: their stylesheets only apply inside .pc-host (see src/mobile/pcStyles.ts).
// `touch` enlarges the PC's dense desktop controls to phone touch sizes (src/mobile/pcHost.css).
import type { CSSProperties, ReactNode } from 'react'

export function PcHost({ children, className = '', touch = true, style }: { children: ReactNode; className?: string; touch?: boolean; style?: CSSProperties }) {
  return <div className={`pc-host${touch ? ' pc-touch' : ''} ${className}`} style={style}>{children}</div>
}
