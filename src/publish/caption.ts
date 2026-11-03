// Facebook Page caption rules.
// Origin: esb-banner-studio src/editorial/facebookCaption.ts (commit 3884532), copied unchanged except the added
// `defaultCaption` helper. The model-prompt strings (FACEBOOK_STYLE / FACEBOOK_FIELD) are not needed on the phone.

const URL_RE = /https?:\/\/\S+/gi
export const CAPTION_TEXT_LIMIT = 125

/** Hold a caption to the shape: no links, at most two lines of text within 125 characters, one hashtag line (3 to 5). */
export function sanitizeFacebook(raw: string, fallbackHeadline = ''): string {
  const cleaned = (raw ?? '').replace(URL_RE, ' ').replace(/\r/g, '')
  const tags: string[] = []
  for (const m of cleaned.matchAll(/#[\p{L}\p{N}_]+/gu)) {
    const t = m[0]
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t)
  }
  // the brand tag closes the line, and a line never carries more than five
  const brand = tags.filter((t) => t.toLowerCase() === '#esbpowerline')
  const rest = tags.filter((t) => t.toLowerCase() !== '#esbpowerline').slice(0, brand.length ? 4 : 5)
  const line = [...rest, ...(brand.length ? brand : [])].slice(0, 5).join(' ')

  const lines = cleaned
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  let body = lines.slice(0, 2).join('\n')
  if (!body) body = (fallbackHeadline ?? '').replace(/\s+/g, ' ').trim()
  if (body.length > CAPTION_TEXT_LIMIT) {
    // drop the second line first; if the first alone is still long, cut at a word
    if (lines[0] && lines[0].length <= CAPTION_TEXT_LIMIT) body = lines[0]
    else {
      // too long: end at the last clause that fits (a comma or semicolon), so the caption still reads as a whole thought;
      // only if there is no such place is it cut at a word
      const head = (lines[0] ?? body).slice(0, CAPTION_TEXT_LIMIT)
      const clause = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '))
      body = clause >= 60 ? head.slice(0, clause).trim() + '.' : head.replace(/\s+\S*$/, '').replace(/[,;:–—-]+$/, '') + '…'
    }
  }
  return line ? (body ? `${body}\n\n${line}` : line) : body
}

/**
 * The starting caption on the phone: the story's own headline plus the brand tag, nothing written for it. The editor
 * edits it before posting; `sanitizeFacebook` runs again when the post is built.
 */
export function defaultCaption(headline: string): string {
  const h = headline.replace(/\s+/g, ' ').trim()
  return h ? sanitizeFacebook(`${h}\n\n#ESBPowerLine`, h) : ''
}
