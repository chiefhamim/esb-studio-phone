// Brings the phone's old drafts (localStorage 'esb-phone-drafts-v1', the pre-PC-clone editor) into the PC story queue
// (src/pc/editorial/storyQueue.ts), so they open in the PC editor with nothing lost.
//
// Non-destructive by design: the old key is NEVER deleted or changed; each old draft is copied once (its id is
// remembered in MIGRATED_KEY) and a later run never duplicates or overwrites a story the editor has since edited.
// Runs at boot, after storage is hydrated and BEFORE the PC modules load (pure JSON, no PC runtime imports).
import type { EditorialChecklist, EditorialDraft } from '../../pc/editorial/editorialStore'
import type { StoryItem } from '../../pc/editorial/storyQueue'

export const OLD_DRAFTS_KEY = 'esb-phone-drafts-v1'
/** An earlier phone build's key: {id,title,headline,body,source(url or text),category,highlight,...}. Also copied, never removed. */
export const LEGACY_DRAFTS_KEY = 'esb-drafts-v1'
export const QUEUE_KEY = 'esb-banner-studio/editorial/queue/v1'
export const MIGRATED_KEY = 'esb-phone/migrated-drafts/v1'
export const STORY_META_KEY = 'esb-phone/story-meta/v1'

export interface OldDraft {
  id: string; sourceUrl: string; source: string; headline: string; deck: string; body: string
  category: string; slug: string; translated: boolean; updatedAt: number
}
export interface StoryMeta { categoryName?: string; migratedFrom?: string }

const DRAFT_DEFAULTS: EditorialDraft = {
  headline: '', deck: '', slug: '', focusKeywords: '', focusKeyphrase: '', metaTitle: '', metaDescription: '', body: '', bodyHtml: '',
  chartIdeas: [], byline: '', postAsNewsDesk: false, credit: '', imageAlt: '', imageCaption: '', tags: [],
  social: { facebook: '', x: '', linkedin: '', telegram: '' },
}
const CHECKLIST_OFF: EditorialChecklist = { sourcesVerified: false, figuresChecked: false, quotesChecked: false, namesChecked: false, attributionKept: false, imagesCleared: false }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function readOldDrafts(raw: string | null): OldDraft[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((d) => d && typeof d.id === 'string').map((d) => ({
      id: d.id, sourceUrl: str(d.sourceUrl), source: str(d.source), headline: str(d.headline), deck: str(d.deck), body: str(d.body),
      category: str(d.category), slug: str(d.slug), translated: d.translated === true, updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
    }))
  } catch { return [] }
}

/** Drafts from the earlier build, in the OLD shape (ids prefixed so they never collide). */
export function readLegacyDrafts(raw: string | null): OldDraft[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((d) => d && typeof d.id === 'string').map((d) => {
      const src = str(d.source).trim()
      const isUrl = /^https?:\/\//i.test(src)
      return {
        id: `legacy-${d.id}`, sourceUrl: isUrl ? src : '', source: isUrl ? '' : str(d.source), headline: str(d.headline) || str(d.title), deck: str(d.deck), body: str(d.body),
        category: str(d.badge) || str(d.category), slug: str(d.slug), translated: false, updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
      }
    })
  } catch { return [] }
}

export const isEmptyOld = (d: OldDraft) => ![d.sourceUrl, d.source, d.headline, d.deck, d.body, d.slug].some((x) => x.trim())

/** One old draft as a PC queue story. Every typed character is kept: source text, headline, deck, body, slug. */
export function storyFromOld(d: OldDraft): StoryItem {
  const rawText = d.source.trim()
  const paragraphs = rawText ? rawText.split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter(Boolean) : []
  const source = rawText || d.sourceUrl.trim()
    ? { url: d.sourceUrl.trim() || null, title: '', deck: '', rawText: d.source, paragraphs, images: [], factTable: [] }
    : null
  const draft: EditorialDraft = { ...DRAFT_DEFAULTS, social: { ...DRAFT_DEFAULTS.social }, headline: d.headline, deck: d.deck, slug: d.slug, body: d.body }
  return {
    id: `m-${d.id}`,
    status: d.body.trim() ? 'review' : 'draft',
    createdAt: d.updatedAt,
    updatedAt: d.updatedAt,
    snapshot: { source, draft, checklist: { ...CHECKLIST_OFF }, deskAuto: !d.category, translationProvider: null, modelUsed: null },
  }
}

export interface MigrationResult { added: number; skipped: number; queue: { stories: StoryItem[]; activeId: string | null }; migrated: string[]; meta: Record<string, StoryMeta> }

/** Pure: given the stored values, what the queue, migrated list and story meta become. */
export function planMigration(oldRaw: string | null, queueRaw: string | null, migratedRaw: string | null, metaRaw: string | null, legacyRaw: string | null = null): MigrationResult {
  const olds = [...readOldDrafts(oldRaw), ...readLegacyDrafts(legacyRaw)]
  let queue: { stories: StoryItem[]; activeId: string | null } = { stories: [], activeId: null }
  try { const q = JSON.parse(queueRaw ?? 'null'); if (q && Array.isArray(q.stories)) queue = { stories: q.stories, activeId: q.activeId ?? null } } catch { /* keep empty */ }
  let migrated: string[] = []
  try { const m = JSON.parse(migratedRaw ?? '[]'); if (Array.isArray(m)) migrated = m.filter((x) => typeof x === 'string') } catch { /* none */ }
  let meta: Record<string, StoryMeta> = {}
  try { const m = JSON.parse(metaRaw ?? '{}'); if (m && typeof m === 'object') meta = m } catch { /* none */ }

  let added = 0, skipped = 0
  const have = new Set(queue.stories.map((s) => s.id))
  const fresh: StoryItem[] = []
  for (const d of olds) {
    if (migrated.includes(d.id)) { skipped++; continue }
    if (isEmptyOld(d)) { migrated.push(d.id); skipped++; continue }
    const item = storyFromOld(d)
    if (!have.has(item.id)) { fresh.push(item); added++ }
    migrated.push(d.id)
    meta = { ...meta, [item.id]: { ...(meta[item.id] ?? {}), migratedFrom: d.id, ...(d.category ? { categoryName: d.category } : {}) } }
  }
  const stories = [...queue.stories, ...fresh].sort((a, b) => b.updatedAt - a.updatedAt)
  return { added, skipped, queue: { stories, activeId: queue.activeId }, migrated, meta }
}

/** Run once at boot (storage router already installed: the queue key lives in IndexedDB). */
export function migrateOldDrafts(ls: Storage = localStorage): MigrationResult {
  const r = planMigration(ls.getItem(OLD_DRAFTS_KEY), ls.getItem(QUEUE_KEY), ls.getItem(MIGRATED_KEY), ls.getItem(STORY_META_KEY), ls.getItem(LEGACY_DRAFTS_KEY))
  if (r.added > 0) ls.setItem(QUEUE_KEY, JSON.stringify(r.queue))
  ls.setItem(MIGRATED_KEY, JSON.stringify(r.migrated))
  ls.setItem(STORY_META_KEY, JSON.stringify(r.meta))
  return r
}

export function readStoryMeta(id: string): StoryMeta {
  try { return (JSON.parse(localStorage.getItem(STORY_META_KEY) ?? '{}') as Record<string, StoryMeta>)[id] ?? {} } catch { return {} }
}
