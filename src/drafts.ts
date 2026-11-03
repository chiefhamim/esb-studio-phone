// Drafts: stored on the phone, saved on every edit (switching apps can kill the page). No secrets live here.
import { useEffect, useRef, useState } from 'react'

export interface Draft {
  id: string
  sourceUrl: string
  /** the source article text, as pasted or fetched (Bangla or English) */
  source: string
  headline: string
  deck: string
  body: string
  /** one of the site's story categories (empty until the editor picks) */
  category: string
  slug: string
  /** true once the English was produced by translation (still a draft until the editor reviews it) */
  translated: boolean
  updatedAt: number
}

const KEY = 'esb-phone-drafts-v1'

export function loadDrafts(): Draft[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? (v as Partial<Draft>[]).map((d) => ({ ...newDraft(), ...d }) as Draft) : []
  } catch {
    return []
  }
}

export function saveDrafts(list: Draft[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function newDraft(sourceUrl = '', source = ''): Draft {
  return { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sourceUrl, source, headline: '', deck: '', body: '', category: '', slug: '', translated: false, updatedAt: Date.now() }
}

/** A draft nothing has been typed into (no link, source, English or category). Starting a new graphic reuses one instead of piling up empties. */
export function isBlankDraft(d: Draft): boolean {
  return !d.sourceUrl.trim() && !d.source.trim() && !d.headline.trim() && !d.deck.trim() && !d.body.trim() && !d.category.trim() && !d.slug.trim()
}

/** Drafts list that writes through to storage on every change. */
export function useDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>(loadDrafts)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    saveDrafts(drafts)
  }, [drafts])
  const upsert = (d: Draft) => setDrafts((l) => [{ ...d, updatedAt: Date.now() }, ...l.filter((x) => x.id !== d.id)])
  const remove = (id: string) => setDrafts((l) => l.filter((x) => x.id !== id))
  return { drafts, upsert, remove }
}
