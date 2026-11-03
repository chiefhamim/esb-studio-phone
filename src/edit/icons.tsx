// Small line icons (24 px grid, 1.8 stroke) in the style of the desktop app's icon set. Decorative: the label next to them says what they do.
import type { ReactNode } from 'react'

const P: Record<string, ReactNode> = {
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  quote: <><path d="M4 18v-5a6 6 0 0 1 6-6" /><path d="M13 18v-5a6 6 0 0 1 6-6" /><path d="M4 18h5v-5H4zM13 18h5v-5h-5z" /></>,
  source: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  type: <><path d="M5 6V4h14v2M12 4v16M9 20h6" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 8" /></>,
  layout: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></>,
  size: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  download: <><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></>,
  upload: <><path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14" /></>,
  check: <><path d="m5 12 5 5 9-10" /></>,
  checks: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  send: <><path d="m22 2-11 11M22 2l-7 20-4-9-9-4z" /></>,
  sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3" /></>,
  facebook: <><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5A.5.5 0 0 1 14 8z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  move: <><path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></>,
  zoom: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  moon: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  up: <><path d="M12 19V5m0 0-6 6m6-6 6 6" /></>,
  down: <><path d="M12 5v14m0 0-6-6m6 6 6-6" /></>,
  split: <><path d="M12 9V3m0 0L9 6m3-3 3 3M12 15v6m0 0-3-3m3 3 3-3M3 12h3M10.5 12h3M18 12h3" /></>,
  merge: <><path d="M12 3v7m0 0L9 7m3 3 3-3M12 21v-7m0 0-3 3m3-3 3 3" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
}

export type IconName = keyof typeof P

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  )
}
