// Where the editor is. Home · Editorial · Graphics are the three destinations (bottom bar on phones, rail from 600 dp).
import { create } from 'zustand'

export type Route = 'home' | 'editorial' | 'graphics'
export interface ScreenProps { active: boolean }

interface NavState {
  route: Route
  go: (r: Route) => void
  /** Where Graphics was entered from (the story editor), so Back returns there instead of to Home. */
  backTo: Route | null
  /** One step back from the current screen: to where it was entered from, else Home. */
  back: () => void
  settingsOpen: boolean
  openSettings: (section?: string) => void
  closeSettings: () => void
  settingsSection: string | null
  /** A request for the Editorial screen (e.g. Home's "Paste a link" opens Editorial intake with focus on the URL). */
  editorialIntent: { kind: 'new' | 'paste-link' | 'open'; at: number } | null
  graphicsIntent: { kind: 'new' | 'photos' | 'export'; at: number; format?: string } | null
  intendEditorial: (kind: 'new' | 'paste-link' | 'open') => void
  intendGraphics: (kind: 'new' | 'photos' | 'export', format?: string) => void
}

export const useNav = create<NavState>((set) => ({
  route: 'home',
  backTo: null,
  go: (route) => set((s) => ({ route, backTo: route === 'graphics' && s.route === 'editorial' ? 'editorial' : route === 'graphics' ? s.backTo : null })),
  back: () => set((s) => (s.route === 'graphics' && s.backTo ? { route: s.backTo, backTo: null } : { route: 'home', backTo: null })),
  settingsOpen: false,
  settingsSection: null,
  openSettings: (section) => set({ settingsOpen: true, settingsSection: section ?? null }),
  closeSettings: () => set({ settingsOpen: false, settingsSection: null }),
  editorialIntent: null,
  graphicsIntent: null,
  intendEditorial: (kind) => set({ route: 'editorial', editorialIntent: { kind, at: Date.now() } }),
  intendGraphics: (kind, format) => set((s) => ({ route: 'graphics', backTo: s.route === 'editorial' ? 'editorial' : s.backTo, graphicsIntent: { kind, at: Date.now(), format } })),
}))
