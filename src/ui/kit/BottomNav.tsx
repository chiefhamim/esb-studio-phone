import { IconHome, IconEdit, IconBanner, IconPublish } from '../../shell/icons'
import type { Tab } from '../../shell/Nav'

interface BottomNavProps {
  tab: Tab
  onTab: (tab: Tab) => void
  badges?: Partial<Record<Tab, number | string>>
}

const TABS: Array<{ id: Tab; label: string; icon: typeof IconHome }> = [
  { id: 'stories', label: 'Home', icon: IconHome },
  { id: 'edit', label: 'Edit', icon: IconEdit },
  { id: 'banner', label: 'Banner', icon: IconBanner },
  { id: 'publish', label: 'Publish', icon: IconPublish }
]

export function BottomNav({ tab, onTab, badges = {} }: BottomNavProps) {
  return (
    <nav className="kit-bottomnav" aria-label="Main Navigation">
      {TABS.map((t) => {
        const active = tab === t.id
        const Icon = t.icon
        const badge = badges[t.id]
        return (
          <button
            key={t.id}
            type="button"
            className="kit-bottomnav-item"
            aria-current={active ? 'page' : undefined}
            onClick={() => onTab(t.id)}
          >
            <span className="kit-bottomnav-pill">
              <Icon />
              {badge !== undefined && badge !== 0 && (
                <span className="kit-bottomnav-badge" aria-label={`${badge} pending items`}>
                  {badge}
                </span>
              )}
            </span>
            <span>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
