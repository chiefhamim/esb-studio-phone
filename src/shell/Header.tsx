import { useState } from 'react'
import { IconAuto, IconMoon, IconSettings, IconSun } from './icons'
import { getThemePref, nextPref, setThemePref, type ThemePref } from './theme'
import { useOnline } from './hooks'

const THEME_LABEL: Record<ThemePref, string> = { auto: 'Theme: follows the phone', light: 'Theme: light', dark: 'Theme: dark' }

/** App header: the protected ESB Power Line logo (unchanged artwork on a light plate), save status, theme, Settings. */
export default function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [pref, setPref] = useState<ThemePref>(getThemePref)
  const online = useOnline()
  const cycle = () => { const n = nextPref(pref); setThemePref(n); setPref(n) }
  const status = online ? 'Saved on this phone' : 'Offline. Edits still save on this phone'
  return (
    <header className="sh-head">
      <span className="sh-logo"><img src="/brand/esb-logo.png" alt="ESB Power Line" width="291" height="101" decoding="async" /></span>
      <span className="sh-grow" />
      <span className="sh-sync" role="status" title={status}>
        <i className={online ? 'sh-dot sh-dot-ok' : 'sh-dot sh-dot-warn'} aria-hidden />
        <span className="sh-sync-text">{online ? 'Saved on phone' : 'Offline'}</span>
        <span className="sr-only">{status}</span>
      </span>
      <button type="button" className="sh-ibtn" onClick={cycle} aria-label={THEME_LABEL[pref] + '. Tap to change.'}>
        {pref === 'auto' ? <IconAuto /> : pref === 'light' ? <IconSun /> : <IconMoon />}
      </button>
      <button type="button" className="sh-ibtn" onClick={onOpenSettings} aria-label="Settings"><IconSettings /></button>
    </header>
  )
}
