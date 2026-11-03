// Two approximate previews, drawn natively (no iframe, no site stylesheet): the esbpowerline.com article head as the desktop
// SitePreview shows it (category chip, title, deck, byline, hero) and the Facebook Page post as the desktop Facebook dialog
// describes it (Page name, caption with the "See more" fold, picture). They show only what the story holds; nothing is invented.
import { categoryIdOf } from '../banner/categories'
import { getCategory } from '../banner/tokens'
import { readMinutes } from './steps'
import { wordCount } from './readiness'

export function SitePreviewCard({ title, deck, slug, category, author, body, heroUrl, credit, dateLine }: {
  title: string; deck: string; slug: string; category: string; author: string | null; body: string; heroUrl: string | null; credit: string; dateLine: string
}) {
  const cat = categoryIdOf(category) ? getCategory(categoryIdOf(category)) : null
  return (
    <article className="pb-site" aria-label="Website page preview">
      {heroUrl ? <img className="pb-hero" src={heroUrl} alt="" /> : <div className="pb-hero pb-hero-none">No picture yet</div>}
      {credit.trim() && <p className="pb-credit">Photo: {credit.trim()}</p>}
      <div className="pb-site-body">
        {cat ? <span className="pb-chip" style={{ background: cat.accent, color: cat.chipText }}>{cat.chip}</span> : <span className="pb-chip pb-chip-none">No category</span>}
        <h3 className="pb-site-title">{title.trim() || 'Headline'}</h3>
        <p className="pb-site-deck">{deck.trim() || 'Deck'}</p>
        <p className="pb-meta">{author ? `By ${author} · ` : ''}{dateLine} · {readMinutes(wordCount(body))} min read</p>
        <p className="pb-url">esbpowerline.com/articles/{slug.trim() || '...'}</p>
      </div>
    </article>
  )
}

export function FacebookPreviewCard({ caption, imageUrl }: { caption: string; imageUrl: string | null }) {
  return (
    <article className="pb-fb" aria-label="Facebook post preview">
      <header className="pb-fb-head">
        <span className="pb-fb-avatar" aria-hidden="true">E</span>
        <span><b>ESB Power Line</b><small>Just now · Public</small></span>
      </header>
      <p className="pb-fb-cap">{caption || '(empty caption)'}</p>
      {imageUrl ? <img className="pb-fb-img" src={imageUrl} alt="" /> : <div className="pb-fb-img pb-hero-none">A Facebook post needs a picture</div>}
    </article>
  )
}
