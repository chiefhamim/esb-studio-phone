// Where the editor is. Home · Editorial · Graphics are the three destinations (bottom bar on phones, rail from 600 dp).
import { create } from 'zustand'

export type Route = 'home' | 'editorial' | 'graphics'
export interface ScreenProps { active: boolean }

interface NavState {
  route: Route
  go: (r: Route) => void
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
  go: (route) => set({ route }),
  settingsOpen: false,
  settingsSection: null,
  openSettings: (section) => set({ settingsOpen: true, settingsSection: section ?? null }),
  closeSettings: () => set({ settingsOpen: false, settingsSection: null }),
  editorialIntent: null,
  graphicsIntent: null,
  intendEditorial: (kind) => set({ route: 'editorial', editorialIntent: { kind, at: Date.now() } }),
  intendGraphics: (kind, format) => set({ route: 'graphics', graphicsIntent: { kind, at: Date.now(), format } }),
}))
