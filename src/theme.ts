// Theme choice (auto / light / dark) kept in localStorage under THEME_KEY; the app shell reads the same key at start.
export type ThemeChoice = 'auto' | 'light' | 'dark'
export const THEME_KEY = 'esb-theme'

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch { return 'auto' }
}

/** Store the choice and apply it now. 'auto' follows the phone's own setting. */
export function applyTheme(choice: ThemeChoice): void {
  try { if (choice === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, choice) } catch { /* private mode: applies for this session only */ }
  const dark = choice === 'dark' || (choice === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

