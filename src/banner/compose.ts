// Make the banner for a draft from its saved choices (used by Publish to attach the banner as the Facebook picture).
import type { Draft } from '../drafts'
import { categoryIdOf } from './categories'
import { loadPhoto } from './photos'
import { renderBanner } from './renderBanner'
import { loadSettings } from './settings'
import { getSize } from './sizes'

export async function renderDraftBanner(draft: Draft, scale: 1 | 2 = 1): Promise<Blob> {
  const s = loadSettings(draft.id)
  const cat = categoryIdOf(draft.category)
  if (!draft.headline.trim()) throw new Error('Add a headline in Edit first.')
  if (!cat) throw new Error('Pick a category in Banner first.')
  const photo = await loadPhoto(draft.id)
  return renderBanner(
    { headline: draft.headline, category: cat, deck: draft.deck, highlight: s.highlight, hiStyle: s.hiStyle },
    photo,
    { width: getSize(s.size).w * scale, size: s.size, template: s.template, transform: s.transform, adjust: s.adjust },
  )
}
