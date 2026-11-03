// Readiness checklist for the Publish screen. The rules (headline <= 104, deck <= 200, slug <= 80, English only) and
// the Required/Quality split follow esb-banner-studio src/editorial/readiness.ts (commit 3884532); the inputs are the
// phone's own: a Draft plus what the Publish screen knows. Every blocker says what is wrong in plain words.

import type { Draft } from '../drafts'
import { ESB_CATEGORIES } from './categories'

export const LIMITS = { headline: 104, deck: 200, slug: 80, minWords: 40 } as const
const BENGALI = /[ঀ-৿]/
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type ReadyStatus = 'ok' | 'warn' | 'bad'
export interface ReadyCheck { id: string; group: 'Required' | 'Quality'; status: ReadyStatus; label: string; detail: string }

export interface ReadyExtras {
  /** the editor ticked "I have read the translation through" */
  translationReviewed: boolean
  /** a picture is chosen (a file on the phone, or an https link) */
  hasPicture: boolean
}

export interface Readiness {
  checks: ReadyCheck[]
  blockers: ReadyCheck[]
  warnings: ReadyCheck[]
  state: 'ready' | 'review' | 'blocked'
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Turn a headline into a url slug: lower case, a-z 0-9 and hyphens, at most 80 characters. Empty when nothing usable. */
export function slugFromHeadline(headline: string): string {
  return headline
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.slug)
    .replace(/-+$/, '')
}

export function buildReadiness(d: Draft, x: ReadyExtras): Readiness {
  const checks: ReadyCheck[] = []
  const add = (c: ReadyCheck) => checks.push(c)
  const h = d.headline.trim().length
  const dk = d.deck.trim().length
  const words = wordCount(d.body)
  const slug = d.slug.trim()

  add(!h
    ? { id: 'headline', group: 'Required', status: 'bad', label: 'Headline', detail: 'Write the headline in Edit. Readers see it first.' }
    : h > LIMITS.headline
      ? { id: 'headline', group: 'Required', status: 'bad', label: 'Headline', detail: `The headline is ${h} characters; the site takes ${LIMITS.headline}. Shorten it by ${h - LIMITS.headline}.` }
      : { id: 'headline', group: 'Required', status: 'ok', label: 'Headline', detail: `${h} of ${LIMITS.headline} characters.` })

  add(!dk
    ? { id: 'deck', group: 'Required', status: 'bad', label: 'Deck', detail: 'Write the one-line summary (deck) in Edit.' }
    : dk > LIMITS.deck
      ? { id: 'deck', group: 'Required', status: 'bad', label: 'Deck', detail: `The deck is ${dk} characters; the site takes ${LIMITS.deck}. Shorten it by ${dk - LIMITS.deck}.` }
      : { id: 'deck', group: 'Required', status: 'ok', label: 'Deck', detail: `${dk} of ${LIMITS.deck} characters.` })

  add(words < LIMITS.minWords
    ? { id: 'body', group: 'Required', status: 'bad', label: 'Story', detail: words ? `Only ${words} words so far; a story needs at least ${LIMITS.minWords}.` : 'The story is empty. Write or paste it in Edit.' }
    : { id: 'body', group: 'Required', status: 'ok', label: 'Story', detail: `${words} words.` })

  if (BENGALI.test(`${d.headline} ${d.deck} ${d.body}`)) {
    add({ id: 'bengali', group: 'Required', status: 'bad', label: 'English only', detail: 'Bengali text is still in the headline, deck or story. The site is English: translate it first.' })
  }

  add(!slug
    ? { id: 'slug', group: 'Required', status: 'bad', label: 'Web address (slug)', detail: 'The story has no web address yet. Tap "Make from headline" or type one.' }
    : slug.length > LIMITS.slug
      ? { id: 'slug', group: 'Required', status: 'bad', label: 'Web address (slug)', detail: `The web address is ${slug.length} characters; the site takes ${LIMITS.slug}.` }
      : !SLUG_RE.test(slug)
        ? { id: 'slug', group: 'Required', status: 'bad', label: 'Web address (slug)', detail: 'Use only lower-case letters, numbers and single hyphens.' }
        : { id: 'slug', group: 'Required', status: 'ok', label: 'Web address (slug)', detail: `${slug.length} of ${LIMITS.slug} characters.` })

  add(!d.category.trim()
    ? { id: 'category', group: 'Required', status: 'bad', label: 'Category', detail: 'Choose a category for the story.' }
    : !ESB_CATEGORIES[d.category]
      ? { id: 'category', group: 'Required', status: 'bad', label: 'Category', detail: `"${d.category}" is not one of the site's categories. Choose one from the list.` }
      : { id: 'category', group: 'Required', status: 'ok', label: 'Category', detail: d.category })

  if (d.translated) {
    add(x.translationReviewed
      ? { id: 'translation', group: 'Required', status: 'ok', label: 'Translation reviewed', detail: 'You confirmed you read the English through.' }
      : { id: 'translation', group: 'Required', status: 'bad', label: 'Translation reviewed', detail: 'This English came from a translation. Read it through, then tick the box below.' })
  }

  add(x.hasPicture
    ? { id: 'picture', group: 'Quality', status: 'ok', label: 'Picture', detail: 'A picture is chosen.' }
    : { id: 'picture', group: 'Quality', status: 'warn', label: 'Picture', detail: 'No picture yet. The story can go out without one; a Facebook post needs one.' })

  const blockers = checks.filter((c) => c.group === 'Required' && c.status !== 'ok')
  const warnings = checks.filter((c) => c.group === 'Quality' && c.status !== 'ok')
  return { checks, blockers, warnings, state: blockers.length ? 'blocked' : warnings.length ? 'review' : 'ready' }
}

/** Facebook adds its own needs on top: a picture file, a caption and a connected Page. */
export function facebookBlockers(x: { hasPictureFile: boolean; caption: string; connected: boolean }): string[] {
  const out: string[] = []
  if (!x.connected) out.push('Facebook is not connected. Add the Page ID and Page token in Settings.')
  if (!x.hasPictureFile) out.push('Choose a picture from the phone. A Facebook post is a picture with a caption.')
  if (!x.caption.trim()) out.push('Write a caption.')
  return out
}
