import { useEffect } from 'react'
import {
  IconHome,
  IconEdit,
  IconBanner,
  IconPublish,
  IconSettings,
  IconInfo,
  IconClose
} from '../../shell/icons'
import type { Tab } from '../../shell/Nav'

interface NavDrawerProps {
  open: boolean
  onClose: () => void
  activeTab: Tab
  onSelectTab: (tab: Tab) => void
  onOpenSettings: () => void
  cmsConnected?: boolean
}

export function NavDrawer({
  open,
  onClose,
  activeTab,
  onSelectTab,
  onOpenSettings,
  cmsConnected = true
}: NavDrawerProps) {
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
    <>
      <div className="kit-scrim" onClick={onClose} aria-hidden />
      <aside className="kit-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div className="kit-drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <img src="/brand/esb-logo.png" alt="ESB Power Line" width="291" height="101" decoding="async" />
            <button
              type="button"
              className="kit-iconbtn"
              onClick={onClose}
              aria-label="Close navigation menu"
            >
              <IconClose />
            </button>
          </div>
          <div style={{ marginTop: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: cmsConnected ? 'var(--success)' : 'var(--warning)',
                boxShadow: cmsConnected ? '0 0 0 2px var(--success-soft)' : '0 0 0 2px var(--warning-soft)'
              }}
            />
            <span style={{ font: 'var(--t-caption)', color: 'var(--text-secondary)' }}>
              {cmsConnected ? 'CMS: Connected' : 'CMS: Offline'}
            </span>
          </div>
        </div>

        <nav className="kit-drawer-body">
          <button
            type="button"
            className={`kit-drawer-item ${activeTab === 'stories' ? 'is-active' : ''}`}
            onClick={() => { onSelectTab('stories'); onClose() }}
          >
            <IconHome />
            <span>Home (Stories)</span>
          </button>

          <button
            type="button"
            className={`kit-drawer-item ${activeTab === 'edit' ? 'is-active' : ''}`}
            onClick={() => { onSelectTab('edit'); onClose() }}
          >
            <IconEdit />
            <span>Editorial Desk</span>
          </button>

          <button
            type="button"
            className={`kit-drawer-item ${activeTab === 'banner' ? 'is-active' : ''}`}
            onClick={() => { onSelectTab('banner'); onClose() }}
          >
            <IconBanner />
            <span>Graphics (Banners)</span>
          </button>

          <button
            type="button"
            className={`kit-drawer-item ${activeTab === 'publish' ? 'is-active' : ''}`}
            onClick={() => { onSelectTab('publish'); onClose() }}
          >
            <IconPublish />
            <span>Publish Desk</span>
          </button>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-2) 0' }} />

          <button
            type="button"
            className="kit-drawer-item"
            onClick={() => { onOpenSettings(); onClose() }}
          >
            <IconSettings />
            <span>Settings & Secrets</span>
          </button>

          <button
            type="button"
            className="kit-drawer-item"
            onClick={() => { onOpenSettings(); onClose() }}
          >
            <IconInfo />
            <span>About & Guidelines</span>
          </button>
        </nav>

        <div className="kit-drawer-footer">
          <div>ESB Studio Phone v0.1.0</div>
          <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>
            Bangladeshi Energy Newsroom Companion
          </div>
        </div>
      </aside>
    </>
  )
}
