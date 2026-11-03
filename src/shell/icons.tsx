export const IconMenu = () => <I><path d="M4 7h16M4 12h16M4 17h16" /></I>
export const IconChevronRight = () => <I><path d="M9 6l6 6-6 6" /></I>
export const IconChevronDown = () => <I><path d="M6 9l6 6 6-6" /></I>
export const IconCheck = () => <I><path d="M5 13l4 4L19 7" /></I>
export const IconInfo = () => <I><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></I>
export const IconAlert = () => <I><path d="M12 3.5l9 16H3zM12 10v4M12 17h.01" /></I>
export const IconSparkles = () => <I><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2" /></I>

// Simple 24 px stroke icons (same line style as the desktop icon set: 1.8 stroke, round caps).
import type { ReactNode } from 'react'
import type { Category } from '../banner/tokens'
import type { CSSProperties } from 'react'

const I = ({ children, size = 24 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{children}</svg>
)

export const IconStories = () => <I><rect x="4" y="3.5" width="16" height="17" rx="3" /><path d="M8 8.5h8M8 12h8M8 15.5h5" /></I>
export const IconEdit = () => <I><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14 8l3 3" /></I>
export const IconBanner = () => <I><rect x="4" y="3.5" width="16" height="17" rx="3" /><circle cx="9" cy="9" r="1.6" /><path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 5 5" /></I>
export const IconPublish = () => <I><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></I>
export const IconSettings = () => <I><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></I>
export const IconSearch = () => <I><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></I>
export const IconPlus = () => <I><path d="M12 5v14M5 12h14" /></I>
export const IconClose = () => <I><path d="M6 6l12 12M18 6L6 18" /></I>
export const IconClipboard = () => <I><rect x="6" y="4.5" width="12" height="16" rx="2.5" /><path d="M9.5 4.5V4a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 4v.5M9 11h6M9 14.5h4" /></I>
export const IconLink = () => <I><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></I>
export const IconCopy = () => <I><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></I>
export const IconTrash = () => <I><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12M10 11v6M14 11v6" /></I>
export const IconSun = () => <I><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></I>
export const IconMoon = () => <I><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></I>
export const IconAuto = () => <I><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></I>

/** Category colour mark: the site's category icon on its own accent (origin: desktop src/editorial/CatMark.tsx). */
export function CatMark({ cat, size = 36 }: { cat: Category; size?: number }) {
  return (
    <span className="sh-cat" style={{ ['--cat' as string]: cat.accent, ['--cat-ink' as string]: cat.chipText, width: size, height: size } as CSSProperties} aria-hidden>
      <svg viewBox="0 0 26 26" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} fill="none" stroke="currentColor" strokeWidth="2.06" strokeLinecap="round" strokeLinejoin="round">
        {cat.icon.map((p, i) => <path key={i} d={p.d} />)}
      </svg>
    </span>
  )
}

// Launcher and desk icons (same 24 px line set).
export const IconHome = () => <I><path d="M4 11l8-7 8 7" /><path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1V9.5" /></I>
export const IconNewspaper = () => <I><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 12.5h8M8 16h5" /></I>
export const IconLayers = () => <I><path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" /><path d="M3.5 12.2l8.5 4.5 8.5-4.5" /><path d="M3.5 16.2l8.5 4.5 8.5-4.5" /></I>
export const IconSparkle = () => <I><path d="M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8z" /></I>
export const IconUpload = () => <I><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></I>
export const IconGlobe = () => <I><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5z" /></I>
export const IconInbox = () => <I><path d="M4 13l2.2-7a2 2 0 0 1 1.9-1.4h7.8a2 2 0 0 1 1.9 1.4L20 13v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20" /></I>
export const IconPencilSquare = () => <I><path d="M11 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-4" /><path d="M9 15l.6-3L18 3.6a1.8 1.8 0 0 1 2.4 2.4L12 14.4z" /></I>
export const IconFolder = () => <I><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.5l2 2.5H18A2.5 2.5 0 0 1 20.5 10v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17z" /></I>
export const IconLock = () => <I><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></I>
