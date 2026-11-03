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
export const IconSettings = () => <I><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></I>
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
