// The Facebook part of the social checklist.
// Origin: esb-banner-studio src/editorial/socialChecks.ts (analyzeSocial, the 'facebook' block), copied with the same rules
// and wording; X, LinkedIn and Telegram are not on the phone. Every item is practice, not a Facebook rule: Facebook shows
// about two short lines before "See more", and a short human caption with its tags on one last line wins.
export interface SocialCheck {
  id: string
  status: 'good' | 'warn' | 'bad'
  label: string
  detail: string
  why: string
}

const LINK = /https?:\/\/\S+/i
const tagsIn = (t: string) => t.match(/#[\p{L}\p{N}_]+/gu) ?? []
const emojiCount = (t: string) => (t.match(/\p{Extended_Pictographic}/gu) ?? []).length
const textOnly = (t: string) => t.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(LINK, ' ').replace(/[ \t]+/g, ' ').trim()

export function analyzeFacebook(fb: string): SocialCheck[] {
  const out: SocialCheck[] = []
  const add = (id: string, label: string, ok: boolean, goodDetail: string, badDetail: string, why: string, level: 'warn' | 'bad' = 'warn') =>
    out.push({ id, label, status: ok ? 'good' : level, detail: ok ? goodDetail : badDetail, why })
  const fbText = textOnly(fb)
  const fbTags = tagsIn(fb)
  const lastLine = fb.trim().split('\n').pop() ?? ''
  add('fb-nolink', 'No link in the caption', !LINK.test(fb), 'The link goes in the first comment.', 'The caption has a link; Facebook gives link text less reach and the app posts the link as a comment.', 'Posts with the link in a comment keep the caption clean and short.', 'bad')
  add('fb-length', 'Fits without “See more”', fbText.length > 0 && fbText.length <= 125, `${fbText.length} characters.`, fbText.length ? `${fbText.length} characters — over 125, so Facebook folds it behind “See more”.` : 'Empty.', 'Two short lines show in full on phone and desktop.')
  add('fb-lines', 'One or two lines', textOnly(fb).split('\n').filter(Boolean).length <= 2, 'Short enough to scan.', 'More than two lines of text — cut it to the one strongest fact.', 'A scannable hook beats a paragraph.')
  add('fb-tags', 'Hashtags: 3–5, one last line', fbTags.length >= 3 && fbTags.length <= 5 && tagsIn(lastLine).length === fbTags.length, `${fbTags.length} hashtags on the last line.`, fbTags.length < 3 ? `${fbTags.length} hashtag${fbTags.length === 1 ? '' : 's'} — add 3 to 5 specific ones.` : fbTags.length > 5 ? `${fbTags.length} hashtags — keep the 5 that matter.` : 'Put every hashtag together on the last line.', 'A few specific tags help discovery; piles of them look spammy.')
  add('fb-brand', 'Ends with #ESBPowerLine', /#esbpowerline\s*$/i.test(fb.trim()), 'Brand tag closes the line.', 'End the hashtag line with #ESBPowerLine.', 'One consistent brand tag makes the Page searchable.')
  const giveaways = /—|–\s|\bbreaking\b|\bmoreover\b|\bgame-?changer\b|here['’]s what|\bclick\b|read more|link in (the )?(bio|comments?)/i.test(fb) || /\b[A-Z]{5,}\b/.test(fbText) || emojiCount(fb) > 1
  add('fb-human', 'Reads like a person', !giveaways, 'No machine-writing giveaways.', 'Remove em dashes, “Breaking”, “click / read more”, ALL-CAPS words and extra emoji.', 'Plain, specific writing outperforms hype and reads as human.')
  return out
}

/** Short lines for fixing: which checks fail and why. */
export const socialFixList = (checks: SocialCheck[]) => checks.filter((c) => c.status !== 'good').map((c) => `${c.label}: ${c.detail}`)
