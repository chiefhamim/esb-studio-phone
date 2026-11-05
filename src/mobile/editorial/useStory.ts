// Numbers read from the story on the desk, shared by every phone Editorial view: category, word count, tags, the 17 SEO
// checks, the readiness list (readiness.ts, the PC sidebar's "Before you publish") and the source's fact table.
import { useMemo } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { useStore } from '../../pc/store'
import { CATEGORIES } from '../../pc/core/tokens'
import { analyzeSeo } from '../../pc/editorial/seo'
import { buildReadiness, triage } from '../../pc/editorial/readiness'
import type { ReadyCheck, ReadyFix, Readiness, Triage } from '../../pc/editorial/readiness'
import { useIgnoredChecks } from '../../pc/editorial/ignoredChecks'
import { extractFactTable } from '../../pc/editorial/facts'
import { bengaliToAsciiDigits } from '../../pc/editorial/bengali'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { siteFeatureState } from '../../platform/esbShim'
import { leadPhotoUrl } from './publish'

export function useCategory() {
  const id = useStore((s) => s.doc.content.categoryId)
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]
}

export function useLeadPhoto(): string | null {
  // re-read whenever the banner's photos or format change
  useStore((s) => s.doc.photos)
  useStore((s) => s.images)
  useStore((s) => s.format)
  return leadPhotoUrl()
}

export function useStoryNumbers() {
  const body = useEditorialStore((s) => s.draft.body)
  const kw = useEditorialStore((s) => s.draft.focusKeywords)
  return useMemo(() => {
    const words = body.trim() ? body.trim().split(/\s+/).filter(Boolean).length : 0
    const paragraphs = body.trim() ? body.trim().split(/\n\n+/).filter(Boolean).length : 0
    const tags = kw.split(',').map((t) => t.trim()).filter(Boolean)
    return { words, paragraphs, readTime: Math.max(1, Math.ceil(words / 200)), tags }
  }, [body, kw])
}

export function useSeoChecks(hasImage: boolean) {
  const draft = useEditorialStore((s) => s.draft)
  const live = useEditorialStore((s) => s.liveArticles)
  return useMemo(() => analyzeSeo({
    headline: draft.headline, deck: draft.deck, body: draft.body, slug: draft.slug, metaTitle: draft.metaTitle, metaDescription: draft.metaDescription,
    keyphrase: draft.focusKeyphrase, tags: draft.focusKeywords.split(',').map((t) => t.trim()).filter(Boolean), hasImage, imageAlt: draft.imageAlt,
    publishedTitles: live.filter((a) => a.slug !== draft.slug).map((a) => a.title),
  }), [draft, hasImage, live])
}

/** What the button on an open item says (the PC sidebar's wording). */
export const FIX_LABEL: Record<ReadyFix, string> = { headline: 'Edit', deck: 'Edit', body: 'Open editor', facts: 'Review', seo: 'Open SEO', photo: 'Add photo', tags: 'Add tags', 'sign-in': 'Sign in', site: 'Check', bengali: 'Translate' }

/** The phone's own wording where the PC's would be wrong here (the upload item names the desktop app). */
export function detailOf(c: ReadyCheck): string {
  if (c.id === 'upload') return 'Planned: banner upload from the phone needs the site update. Until then the original photo link is used.'
  return c.detail
}

export function useReadiness(): { ready: Readiness; t: Triage; storyId: string } {
  const draft = useEditorialStore((s) => s.draft)
  const discrepancies = useEditorialStore((s) => s.discrepancies)
  const staff = useEditorialStore((s) => s.staffSession)
  const site = useEditorialStore((s) => s.siteStatus)
  const photo = useLeadPhoto()
  const { words, tags } = useStoryNumbers()
  const seo = useSeoChecks(!!photo)
  const storyId = useStoryQueue((s) => s.activeId) ?? 'draft'
  const ignored = useIgnoredChecks((s) => s.byStory[storyId])
  const ready = useMemo(() => buildReadiness({
    headline: draft.headline, deck: draft.deck, body: draft.body, words, hasImage: !!photo, imageAlt: draft.imageAlt, tagCount: tags.length,
    unverified: discrepancies.length, seo, signedIn: !!staff, siteOnline: site.connected, canUpload: siteFeatureState('upload') === 'live',
  }), [draft, words, photo, tags.length, discrepancies.length, seo, staff, site.connected])
  const t = useMemo(() => triage(ready, new Set(ignored ?? [])), [ready, ignored])
  return { ready, t, storyId }
}

export function useFacts() {
  const source = useEditorialStore((s) => s.source)
  return useMemo(() => {
    const full = [source?.title, source?.deck, ...(source?.paragraphs || [])].filter(Boolean).join(' ')
    return { factTable: extractFactTable(full), sourceAscii: bengaliToAsciiDigits(full) }
  }, [source])
}

export const hasStoryContent = (s: { source: unknown; draft: { headline: string; body: string } }) => !!(s.source || s.draft.headline.trim() || s.draft.body.trim())

export function hostOf(url: string | null | undefined): string {
  if (!url) return 'No source yet'
  if (url === 'pasted-text') return 'Pasted text'
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'Source' }
}

export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
