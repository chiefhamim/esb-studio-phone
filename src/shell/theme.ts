// Theme: follows the system unless the editor picks Light or Dark in the header (stored in localStorage, not a secret).
export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'esb-theme'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function nextPref(p: ThemePref): ThemePref {
  return p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto'
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function setThemePref(p: ThemePref): void {
  try {
    if (p === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch { /* storage blocked: the choice lasts until the app closes */ }
  applyTheme(p)
}

/** Apply now and follow system changes while the preference is Auto. */
export function initTheme(): void {
  applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme())
}
