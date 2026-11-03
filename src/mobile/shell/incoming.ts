// What other apps share INTO ESB Studio (links, text, pictures, PDFs/DOCX) waits here until the screen that handles
// it takes it: links/text/documents -> Editorial intake, pictures -> Graphics photos.
import { create } from 'zustand'
import type { SharedFile } from '../../native/shareIn'

export interface Incoming { id: number; url: string; text: string; files: SharedFile[]; at: number }
interface InboxState { pending: Incoming | null; put: (i: Omit<Incoming, 'id' | 'at'>) => void; take: () => Incoming | null }
let seq = 0
export const useIncoming = create<InboxState>((set, get) => ({
  pending: null,
  put: (i) => set({ pending: { ...i, id: ++seq, at: Date.now() } }),
  take: () => { const p = get().pending; set({ pending: null }); return p },
}))
