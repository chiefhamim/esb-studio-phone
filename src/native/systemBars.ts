// Keeps the Android system bars and the window colour in step with the in-app theme (html[data-theme]).
// Call startSystemBars() once at start-up. Safe areas for the page come from CSS: padding with env(safe-area-inset-*)
// (the native SystemBars plugin also sets --safe-area-inset-top/right/bottom/left on :root).
import { Capacitor, registerPlugin } from '@capacitor/core'

interface AppChromeApi { apply(o: { dark: boolean; color: string }): Promise<void> }
const AppChrome = registerPlugin<AppChromeApi>('AppChrome')

const FALLBACK = { light: '#e9e9eb', dark: '#0d0d0f' } // --surface-app in src/ui/tokens.css

function colourNow(dark: boolean): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--surface-app').trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : dark ? FALLBACK.dark : FALLBACK.light
}

export function syncSystemBars(): void {
  if (!Capacitor.isNativePlatform()) return
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  void AppChrome.apply({ dark, color: colourNow(dark) }).catch(() => {})
  // Ensure safe-area-inset CSS custom properties have reliable values on Android native
  const top = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top').trim()
  if (!top || top === '0px' || top === '0') {
    document.documentElement.style.setProperty('--safe-area-inset-top', '44px')
  }
  const bottom = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom').trim()
  if (!bottom || bottom === '0px' || bottom === '0') {
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '16px')
  }
}

let started = false
/** Applies now and whenever the theme attribute changes. */
export function startSystemBars(): void {
  if (started || !Capacitor.isNativePlatform()) return
  started = true
  syncSystemBars()
  new MutationObserver(syncSystemBars).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}
