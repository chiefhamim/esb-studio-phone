import type { ReactNode } from 'react'
import { IconAuto, IconMoon, IconSun, IconMenu, IconSparkle } from '../../shell/icons'
import type { ThemePref } from '../../shell/theme'

interface TopAppBarProps {
  title?: string
  subtitle?: string
  leading?: ReactNode
  onOpenDrawer?: () => void
  onOpenSettings?: () => void
  onOpenAi?: () => void
  onCycleTheme?: () => void
  themePref?: ThemePref
  ai?: boolean
  aiPaused?: boolean
  aiLabel?: string
  trailing?: ReactNode
}

export function TopAppBar({
  title = 'ESB Studio',
  subtitle,
  leading,
  onOpenDrawer,
  onOpenSettings,
  onOpenAi,
  onCycleTheme,
  themePref = 'auto',
  ai = false,
  aiPaused = false,
  aiLabel = 'Gemini',
  trailing
}: TopAppBarProps) {
  return (
    <header className="kit-topbar">
      {leading ? (
        leading
      ) : onOpenDrawer ? (
        <button
          type="button"
          className="kit-iconbtn"
          onClick={onOpenDrawer}
          aria-label="Open navigation drawer"
        >
          <IconMenu />
        </button>
      ) : null}

      <div className="kit-topbar-titlebox">
        <h1 className="kit-topbar-title">{title}</h1>
        {subtitle && <p className="kit-topbar-sub">{subtitle}</p>}
      </div>

      {(onOpenAi || onOpenSettings) && (
        <button
          type="button"
          className={`kit-aichip ${aiPaused ? 'is-paused' : ai ? 'is-connected' : 'is-warn'}`}
          onClick={onOpenAi ?? onOpenSettings}
          aria-label={aiPaused ? 'AI is paused. Tap for AI settings' : ai ? `AI: ${aiLabel} ready. Tap for AI settings` : 'Connect AI. Tap for AI settings'}
        >
          <span className="kit-aichip-dot" aria-hidden />
          <IconSparkle />
          <span>{aiPaused ? 'Paused' : ai ? aiLabel : 'Connect AI'}</span>
        </button>
      )}

      {onCycleTheme && (
        <button
          type="button"
          className="kit-iconbtn"
          onClick={onCycleTheme}
          aria-label={`Theme: ${themePref}. Tap to cycle.`}
        >
          {themePref === 'auto' ? <IconAuto /> : themePref === 'light' ? <IconSun /> : <IconMoon />}
        </button>
      )}

      {trailing}
    </header>
  )
}
