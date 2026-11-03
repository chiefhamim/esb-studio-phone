import type { ReactNode } from 'react'
import { IconBanner, IconEdit, IconHome, IconPublish } from './icons'

export type Tab = 'stories' | 'edit' | 'banner' | 'publish'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'stories', label: 'Home', icon: <IconHome /> },
  { id: 'edit', label: 'Edit', icon: <IconEdit /> },
  { id: 'banner', label: 'Banner', icon: <IconBanner /> },
  { id: 'publish', label: 'Publish', icon: <IconPublish /> },
]

/** Bottom bar on a phone, left rail when wide (CSS decides). One sliding indicator marks the active section. */
export default function Nav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const i = Math.max(0, TABS.findIndex((t) => t.id === tab))
  return (
    <nav className="sh-nav" aria-label="Sections" style={{ ['--i' as string]: i }}>
      <span className="sh-nav-ind" aria-hidden />
      {TABS.map((t) => (
        <button key={t.id} type="button" className="sh-nav-btn" aria-current={t.id === tab ? 'page' : undefined} onClick={() => onTab(t.id)}>
          <span className="sh-nav-ico">{t.icon}</span>
          <span className="sh-nav-lbl">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
