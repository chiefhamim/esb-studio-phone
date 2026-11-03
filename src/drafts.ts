// The Draft shape and its two pure helpers (the editorial desk keeps real stories in the PC story queue; this type is what the
// readiness checks and the old-draft migration read). No secrets live here.

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

export function newDraft(sourceUrl = '', source = ''): Draft {
  return { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sourceUrl, source, headline: '', deck: '', body: '', category: '', slug: '', translated: false, updatedAt: Date.now() }
}

/** A draft nothing has been typed into (no link, source, English or category). Starting a new graphic reuses one instead of piling up empties. */
export function isBlankDraft(d: Draft): boolean {
  return !d.sourceUrl.trim() && !d.source.trim() && !d.headline.trim() && !d.deck.trim() && !d.body.trim() && !d.category.trim() && !d.slug.trim()
}
