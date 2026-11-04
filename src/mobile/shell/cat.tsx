// The ESB desk categories as the phone shows them: a coloured dot with the desk number inside it, and the desk's name in
// its own colour. Colours come from the PC's CATEGORIES table (src/pc/core/tokens.ts); nothing here is invented.
import type { CSSProperties } from 'react'
import { CATEGORIES } from '../../pc/core/tokens'
import { Icon } from './ui'

export type Cat = (typeof CATEGORIES)[number]

/** A category from its number ("03") or its name ("Fossil Fuels & Commodities"), as the site's feed spells it. */
export const catOf = (v?: string | null): Cat | null => (v ? CATEGORIES.find((c) => c.id === v || c.name.toLowerCase() === v.trim().toLowerCase()) ?? null : null)

/** Black or white ink, whichever reads on this accent. */
function ink(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16)
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return l > 0.62 ? '#15151a' : '#ffffff'
}

export function CatDot({ cat, size = 22 }: { cat: Cat; size?: number }) {
  return <span className="cat-dot" style={{ '--cc': cat.accent, '--ci': ink(cat.accent), '--cs': size + 'px' } as CSSProperties} aria-hidden>{cat.id}</span>
}

export function CatName({ cat, className = '' }: { cat: Cat; className?: string }) {
  return <span className={'cat-name ' + className} style={{ '--cc': cat.accent } as CSSProperties}>{cat.name}</span>
}

/** Where a banner size is going: the platform's own mark, or the shape of the frame. */
export function FormatMark({ id, size = 20 }: { id: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const
  if (id === 'fb45' || id === 'social') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="12" fill="#1877f2" />
        <path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.6V13h2.7v8z" fill="#fff" />
      </svg>
    )
  }
  if (id === 'yt') {
    return (
      <svg {...common}>
        <rect x="1" y="5" width="22" height="14" rx="4.5" fill="#ff0033" />
        <path d="M10 9l5.5 3L10 15z" fill="#fff" />
      </svg>
    )
  }
  if (id === 'web') return <Icon name="globe" size={size} />
  const shape = id === 'story' ? { x: 7, y: 2.5, w: 10, h: 19 } : id === 'sq' ? { x: 4.5, y: 4.5, w: 15, h: 15 } : { x: 2.5, y: 6.5, w: 19, h: 11 }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx="2.4" />
    </svg>
  )
}

/** Phone / tablet / desktop, as the small line drawings the segmented control shows when they are not selected. */
export function DeviceMark({ kind, size = 20 }: { kind: 'mobile' | 'tablet' | 'desktop'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  if (kind === 'mobile') return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2.6" /><path d="M11 18.5h2" /></svg>
  if (kind === 'tablet') return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2.6" /><path d="M11 18h2" /></svg>
  return <svg {...common}><rect x="2.5" y="4" width="19" height="12.5" rx="2.2" /><path d="M8.5 20.5h7M12 16.5v4" /></svg>
}

/** The four posting channels, for the segmented control's unselected state. */
export function ChannelMark({ id, size = 20 }: { id: 'facebook' | 'x' | 'linkedin' | 'telegram'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const
  if (id === 'facebook') return <FormatMark id="fb45" size={size} />
  if (id === 'x') return <svg {...common} fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
  if (id === 'linkedin') {
    return (
      <svg {...common}>
        <rect x="1" y="1" width="22" height="22" rx="5" fill="#0a66c2" />
        <circle cx="7.4" cy="7.6" r="1.6" fill="#fff" />
        <rect x="5.9" y="10.2" width="3" height="7.6" fill="#fff" />
        <path d="M11 10.2h2.8v1.1c.5-.8 1.4-1.3 2.5-1.3 2.1 0 2.9 1.4 2.9 3.4v4.4h-3v-3.9c0-1-.3-1.6-1.1-1.6s-1.3.6-1.3 1.7v3.8H11z" fill="#fff" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="11" fill="#229ed9" />
      <path d="M5.6 11.9l11.7-4.5c.6-.2 1 .1.8.9l-2 9.3c-.1.7-.6.9-1.2.5l-3-2.2-1.5 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5c.2-.2 0-.3-.4-.1l-6.9 4.3-3-.9c-.6-.2-.6-.6.1-.9z" fill="#fff" />
    </svg>
  )
}

/** The role colours esbpowerline.com uses (as the PC's account sheet does), so the badge matches the site's own role badge. */
export const ROLE_COLOR: Record<string, string> = { SUPER_ADMIN: '#ff3b6f', ADMIN: '#8b5cf6', EDITOR: '#3b82f6', AUTHOR: '#10b981', CONTRIBUTOR: '#f59e0b' }
export const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super admin', ADMIN: 'Admin', EDITOR: 'Editor', AUTHOR: 'Author', CONTRIBUTOR: 'Contributor' }
export function RoleChip({ role }: { role?: string | null }) {
  if (!role) return null
  return <span className="role-chip" style={{ '--role': ROLE_COLOR[role] ?? '#6b7280' } as CSSProperties}><i aria-hidden />{ROLE_LABEL[role] ?? role}</span>
}
