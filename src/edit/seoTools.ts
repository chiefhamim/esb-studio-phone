// SEO for the phone: the stored fields, a score, offline fix suggestions (no network), and an optional AI draft.
// The checks and builders are the desktop's seo.ts (copied as ./seo). The AI step follows the desktop seoFix.ts / aiDesk.ts
// rules: facts are untouchable, a keyphrase must already be in the story, lengths are capped, and nothing is applied until
// the editor taps Apply. Without a key everything except the AI draft still works.
import { analyzeSeo, buildMetaDescription, buildMetaTitle, buildSlug, countPhrase, effectiveDescription, suggestKeyphrases, headlineGram } from './seo'
import type { SeoCheck } from './seo'
import { AiError, NO_KEY_MESSAGE, geminiJson, type AiSchema } from '../aiProviders'
import { getSecret } from '../secure'

/** The SEO fields of a draft. They live on the draft object itself (draft.seo) so they are saved with it, instantly. */
export interface SeoFields {
  metaTitle: string
  metaDescription: string
  keyphrase: string
  tags: string[]
}
export const EMPTY_SEO: SeoFields = { metaTitle: '', metaDescription: '', keyphrase: '', tags: [] }

export interface SeoStory { headline: string; deck: string; body: string; slug: string }

/** The desk's checks, minus the photo check (the picture is chosen in Banner and Publish, not here). */
export function seoChecks(story: SeoStory, seo: SeoFields): SeoCheck[] {
  return analyzeSeo({ ...story, ...seo, hasImage: true, imageAlt: 'photo' }).filter((c) => c.id !== 'image')
}

export interface SeoScore { good: number; total: number; percent: number }
export function seoScore(checks: SeoCheck[]): SeoScore {
  const good = checks.filter((c) => c.status === 'good').length
  const total = checks.length
  return { good, total, percent: total ? Math.round((good / total) * 100) : 0 }
}

/** What one offline suggestion would change. `value` is shown to the editor before it is applied. */
export interface Suggestion {
  id: 'keyphrase' | 'metaTitle' | 'metaDescription' | 'slug' | 'tags'
  label: string
  value: string | string[]
}

export function bestKeyphrase(story: SeoStory): string {
  return suggestKeyphrases(story.headline, story.deck, story.body, 1)[0]?.phrase
    ?? headlineGram(story.headline, story.body)
}

/** Tags drawn from the story's own phrases (3 to 8), keyphrase first. Never invented. */
export function suggestTags(story: SeoStory, keyphrase: string, max = 6): string[] {
  const out: string[] = []
  for (const t of [keyphrase, ...suggestKeyphrases(story.headline, story.deck, story.body, 10).map((k) => k.phrase)]) {
    const c = t.trim()
    if (c && c.length <= 40 && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c)
    if (out.length >= max) break
  }
  return out
}

/** Offline repairs for the checks that fail: each is computed from the story, nothing is sent anywhere. */
export function offlineSuggestions(story: SeoStory, seo: SeoFields): Suggestion[] {
  const out: Suggestion[] = []
  if (!story.headline.trim() && !story.body.trim()) return out
  const kp = seo.keyphrase.trim() || bestKeyphrase(story)
  if (kp && kp !== seo.keyphrase.trim()) out.push({ id: 'keyphrase', label: 'Focus keyphrase', value: kp })
  const checks = seoChecks(story, { ...seo, keyphrase: kp })
  const failing = (id: string) => checks.some((c) => c.id === id && c.status !== 'good')
  if (story.headline.trim() && (failing('kp-title') || failing('title-len') || !seo.metaTitle.trim())) {
    const t = buildMetaTitle(story.headline, kp)
    if (t && t !== seo.metaTitle.trim()) out.push({ id: 'metaTitle', label: 'SEO title', value: t })
  }
  if (failing('kp-desc') || failing('desc-len') || failing('desc-own')) {
    const d = buildMetaDescription(story.deck, story.body, kp)
    if (d && d !== seo.metaDescription.trim()) out.push({ id: 'metaDescription', label: 'Meta description', value: d })
  }
  if (failing('kp-slug') || failing('slug')) {
    const s = buildSlug(story.headline, kp)
    if (s && s !== story.slug) out.push({ id: 'slug', label: 'URL slug', value: s })
  }
  if (failing('tags')) {
    const t = suggestTags(story, kp)
    if (t.length && t.join('|') !== seo.tags.join('|')) out.push({ id: 'tags', label: 'Tags', value: t })
  }
  return out
}

/** Apply one suggestion: returns the new SEO fields and, for the slug, the slug to set on the draft. */
export function applySuggestion(seo: SeoFields, s: Suggestion): { seo: SeoFields; slug?: string } {
  switch (s.id) {
    case 'keyphrase': return { seo: { ...seo, keyphrase: String(s.value) } }
    case 'metaTitle': return { seo: { ...seo, metaTitle: String(s.value) } }
    case 'metaDescription': return { seo: { ...seo, metaDescription: String(s.value) } }
    case 'tags': return { seo: { ...seo, tags: s.value as string[] } }
    case 'slug': return { seo, slug: String(s.value) }
  }
}

/** The description the site would show right now. */
export const snippetDescription = (deck: string, seo: SeoFields): string => effectiveDescription({ deck, metaDescription: seo.metaDescription })

// ---------------------------------------------------------------- optional AI draft (Gemini only)

export const AI_SEO_SCHEMA: AiSchema = {
  properties: {
    keyphrase: { description: '1 to 4 words a reader would search, and it must already appear in the story.' },
    metaTitle: { description: 'At most 60 characters, keyphrase early, no site name.' },
    metaDescription: { description: '120 to 160 characters, accurate, contains the keyphrase naturally.' },
    tags: { description: '3 to 8 comma-separated specific tags (organisations, projects, places, topic), most important first.' },
  },
  required: ['keyphrase', 'metaTitle', 'metaDescription', 'tags'],
}

export const AI_SEO_SYSTEM = `You are the SEO editor of esbpowerline.com, a Bangladesh energy and power news site. Write the search fields for the story you are given.
Rules (Google Search Central):
- Title: concise, descriptive, at most 60 characters, the focus keyphrase early, no keyword stuffing, no site name.
- Meta description: an accurate summary, 120 to 160 characters, contains the keyphrase naturally.
- Tags: 3 to 8 specific phrases the story itself uses (organisations, projects, places, topic).
- The focus keyphrase is 1 to 4 words a reader would search, and it must already appear in the story.
Facts are untouchable: use only what the story states. Never add a figure, name, date, quote or claim. British spelling.
Reply with only the requested JSON fields.`

export const aiSeoUser = (s: SeoStory) => `Headline: ${s.headline}\nDeck: ${s.deck}\n\nStory:\n${s.body}`

/** Hold a model answer to the rules: caps, a keyphrase the story really uses, tags no longer than 40 characters. Pure. */
export function sanitizeAiSeo(story: SeoStory, raw: Record<string, unknown>): SeoFields {
  const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
  const all = `${story.headline}\n${story.deck}\n${story.body}`
  let keyphrase = str(raw.keyphrase)
  if (!keyphrase || keyphrase.split(' ').length > 4 || countPhrase(all, keyphrase) === 0) keyphrase = bestKeyphrase(story)
  const tags: string[] = []
  for (const t of str(raw.tags).split(',')) {
    const c = t.replace(/^#/, '').trim()
    if (c && c.length <= 40 && !tags.some((x) => x.toLowerCase() === c.toLowerCase())) tags.push(c)
    if (tags.length >= 8) break
  }
  const title = str(raw.metaTitle).replace(/\s*[|\-–—]\s*ESB\s*Power\s*Line\s*$/i, '')
  const metaTitle = title.length > 60 ? buildMetaTitle(story.headline, keyphrase) : title
  const desc = str(raw.metaDescription)
  const metaDescription = desc.length > 160 ? buildMetaDescription(story.deck, story.body, keyphrase) : desc
  return { metaTitle, metaDescription, keyphrase, tags }
}

export async function aiSeoDraft(story: SeoStory, signal?: AbortSignal): Promise<SeoFields> {
  if (!(await getSecret('gemini-key'))) {
    throw new AiError('no-key', NO_KEY_MESSAGE)
  }
  const { data } = await geminiJson<Record<string, unknown>>({ system: AI_SEO_SYSTEM, user: aiSeoUser(story), schema: AI_SEO_SCHEMA, signal, maxTokens: 4000, timeoutMs: 90_000 })
  return sanitizeAiSeo(story, data)
}
