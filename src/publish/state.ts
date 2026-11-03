// What this phone has already sent for each draft (ids and links only, no secrets), so a second save updates the same
// site article instead of colliding on its slug, and a draft save can never take a live story down by accident.

const KEY = 'esb-phone-publish-v1'

export interface SentRecord {
  articleId?: string
  slug?: string
  status?: 'DRAFT' | 'PUBLISHED'
  liveUrl?: string | null
  fbUrl?: string
}

function readAll(): Record<string, SentRecord> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Record<string, SentRecord>) : {}
  } catch { return {} }
}

export function getSent(draftId: string): SentRecord { return readAll()[draftId] ?? {} }

export function setSent(draftId: string, patch: SentRecord): SentRecord {
  const all = readAll()
  const next = { ...all[draftId], ...patch }
  all[draftId] = next
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage full: the site still has the article */ }
  return next
}
