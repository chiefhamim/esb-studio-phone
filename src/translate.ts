// Translate a Bangla (or English) source into one English ESB Power Line story draft, on the phone.
// ORIGIN: copied from the desktop app (chiefhamim/esb-banner-studio), read-only:
//   - the newsroom prompt (BASE_PROMPT) from src/editorial/translator.ts JOURNALISTIC_TRANSLATOR_PROMPT, minus its SEO /
//     Facebook / rich-layout parts (the phone body is plain paragraphs) and with phone-specific fields appended;
//   - source cleaning (BOILERPLATE_PATTERNS, isBoilerplateParagraph, cleanParagraphLead) from src/editorial/extract.ts;
//   - the story categories from src/core/tokens.ts CATEGORIES.
// Nothing here invents facts: the prompt forbids it, and flagUnsupportedFacts (facts.ts) lists every figure, date or
// currency in the English that the source does not contain. The result is a DRAFT for the editor to review.
import { getSecret } from './secure'
import { geminiJson, AiError, NO_KEY_MESSAGE, type AiSchema } from './aiProviders'
import { checkBudgets, describeIssue, fitSlug } from './charBudgets'
import { factNotes } from './facts'

/** The site's story categories (src/core/tokens.ts CATEGORIES, names only). */
export const STORY_CATEGORIES = [
  'Energy Policy & Regulators', 'Power Generation', 'Fossil Fuels & Commodities', 'Renewables & Nuclear',
  'Grid & Transmission', 'Distribution & Utilities', 'Consumers & Tariffs', 'Market, Finance & Subsidies',
  'International & Cross-Border', 'Environment & Efficiency',
] as const

export const BASE_PROMPT = `You are the senior editor of ESB Power Line, an English-language news site on Bangladesh's power, gas and energy sector. Your readers are energy professionals, investors, policymakers and Bangladeshis abroad. They read quickly, distrust hype and judge a publication by whether its numbers are right.

Turn the Bengali (or English) source report into one finished English news story. You are an editor, not a translator: restructure for clarity, but never change what the source says.

FACTS
- Every figure, name, date, quote and claim must come from the source. Never add, infer, round, convert or estimate. If the source is silent, leave it out; do not fill the gap.
- Keep every fact. You may reorder, merge or split paragraphs, but nothing is dropped.
- Quotes stay in quotation marks, translated faithfully and attributed to the same person.

STRUCTURE
- Headline: the strongest fact, active voice, ideally under 90 characters.
- Opening paragraph, under 40 words: who did what, the key number, and why it matters to the sector, using only facts in the source.
- Then context in order of importance, one idea per short paragraph. Close on what happens next only if the source says so.

ENERGY PRECISION
- Keep units with every figure, with a space between number and unit (40 MW, not 40MW). Never mix up power (MW) and energy (MWh). Say whether a number is capacity or actual output. Write "million" in full instead of "M".
- On first use, spell out units and acronyms (million cubic feet per day, mmcfd). Give lakh and crore a plain gloss, for example "Tk 592 crore (5.92 billion taka)". Do not convert currencies or energy units unless the source does.
- State a project's stage exactly as the source does: proposed, approved, under construction, operating.
- Explain an institution or term in a half-sentence clause, only as a definition (for example "Petrobangla, the state gas company"). A definition is not a new fact about the event.

ATTRIBUTION AND STYLE
- Name the person and institution ("said Petrobangla's chairman"). If the source names nobody, say what the report did not state.
- Newspaper names shouldn't be stated in our version, it should be removed, or mentioned as "sources" etc.
- British spelling, except that official names of companies, institutions and projects stay exactly as they style themselves (for example Jamuna Fertilizer Factory). Plain, active, specific. Write a weekday with its date.
- Avoid hype, stock phrases, em dashes, exclamation marks, rhetorical questions and opinion.
FIELDS TO RETURN (the limits are final)
- headline: at most 104 characters. deck: one sentence, at most 200. slug: lowercase words joined by hyphens, at most 75 characters, no dates or amounts.
- category: exactly one of the site's categories listed in the reply format.
- body: the complete English story as plain paragraphs separated by blank lines, no markdown marks, no site name.
- If the source is thin, contradictory or cut off, say so in the notes field instead of filling the gap.

Before answering, check: every number matches the source, units are right, the first paragraph answers who, what and why it matters, and nothing was added.`

/** Comprehensive filter for editorial noise, publisher/editor names, commercial office addresses, disclaimers, and ads. */
const BOILERPLATE_PATTERNS = [
  /সম্পাদক\s*ও\s*প্রকাশক/i,
  /ভারপ্রাপ্ত\s*সম্পাদক/i,
  /প্রধান\s*সম্পাদক/i,
  /উপদেষ্টা\s*সম্পাদক/i,
  /বার্তা\s*সম্পাদক/i,
  /নির্বাহী\s*সম্পাদক/i,
  /ব্যবস্থাপনা\s*সম্পাদক/i,
  /সহ[- ]?সম্পাদক/i,
  /প্রধান\s*বার্তা\s*সম্পাদক/i,
  /যুগ্ম\s*বার্তা\s*সম্পাদক/i,
  /নগর\s*সম্পাদক/i,
  /মফস্বল\s*সম্পাদক/i,
  /অনলাইন\s*ইনচার্জ/i,
  /প্রকাশক\s*কর্তৃক/i,
  /মুদ্রিত\s*ও\s*প্রকাশিত/i,
  /প্রকাশিত\s*ও\s*প্রচারিত/i,
  /ঢাকা\s*থেকে\s*প্রকাশিত/i,
  /অনলাইন\s*(?:সংস্করণ|ভার্সন|এডিশন)/i,
  /ডিজিটাল\s*(?:সংস্করণ|এডিশন)/i,
  /কাগজের\s*সংস্করণ/i,
  /মুদ্রণ\s*(?:সংস্করণ|লাইন)/i,
  /প্রিন্টার্স\s*লাইন/i,
  /প্রেস\s*থেকে\s*মুদ্রিত/i,
  /আল[- ]ফালাহ\s*প্রিন্টিং/i,
  /বিজি\s*প্রেস/i,
  /editor\s*(?:&|and)\s*publisher/i,
  /editor-in-chief/i,
  /executive\s*editor/i,
  /managing\s*editor/i,
  /published\s*by/i,
  /printed\s*by/i,
  /বার্তা\s*ও\s*বাণিজ্যিক\s*কার্যালয়/i,
  /সম্পাদকীয়\s*ও\s*বাণিজ্যিক/i,
  /বাণিজ্যিক\s*কার্যালয়/i,
  /কর্পোরেট\s*অফিস/i,
  /প্রগতি\s*সরণি/i,
  /তেজগাঁও\s*শিল্প\s*এলাকা/i,
  /যোগাযোগ\s*:\s*/i,
  /(?:ফোন|ইমেইল|ফ্যাক্স|পিএবিএক্স|মোবাইল|হটলাইন|টেলিফোন)\s*:\s*/i,
  /\b(?:phone|email|tel|fax|pabx|hotline|mobile)\s*:\s*/i,
  /(?:বিডিবিএল|ওয়াসা|সেনা|বসুন্ধরা|যমুনা|কনকর্ড|নাভানা|শান্তা)\s*(?:ভবন|টাওয়ার|টাওয়ার|প্লাজা|সেন্টার)/i,
  /(?:কাজী\s*নজরুল\s*ইসলাম|বীর\s*উত্তম|বঙ্গবন্ধু)\s*(?:এভিনিউ|সড়ক|সরণি|রোড)/i,
  /(?:লেভেল|তলা|ফ্লোর|level|floor)\s*\d+/i,
  /(?:ঢাকা|চট্টগ্রাম|সিলেট|রাজশাহী|খুলনা|বরিশাল|রংপুর)[- ]?\d{4}/i,
  /বার্তা\s*ও\s*(?:সম্পাদকীয়|বাণিজ্যিক)\s*বিভাগ/i,
  /বিজ্ঞাপন\s*ও\s*সার্কুলেশন\s*বিভাগ/i,
  /(?:The\s+Daily\s+)?Bonik\s*Barta/i,
  /বণিক\s*বার্তা/i,
  /(?:Dewan\s+Hanif\s+Mahmud|দেওয়ান\s+হানিফ\s+মাহমুদ)/i,
  /(?:is\s*a\s*bangla\s*newspaper|newspaper\s*of\s*bangladesh|circulated\s*business\s*daily|circulation\s*of\s*the\s*newspaper|name\s*of\s*the\s*editor)/i,
  /E-paper|ই[- ]?পেপার|অনলাইন\s*সংস্করণ/i,
  /পোস্ট\s*কোড|জিপিও\s*বক্স/i,
  /সর্বস্বত্ব\s*সংরক্ষিত/i,
  /কপিরাইট\s*©?/i,
  /স্বত্ব\s*©/i,
  /অনুমতি\s*ছাড়া\s*(?:কোনো\s*সংবাদ\s*বা\s*ছবির\s*)?ব্যবহার\s*নিষিদ্ধ/i,
  /all\s*rights\s*reserved/i,
  /copyright\s*©?/i,
  /\bdisclaimer\s*:/i,
  /বিজ্ঞাপন(?:\s*ও\s*সার্কুলেশন)?\s*:/i,
  /বিজ্ঞাপনের\s*জন্য\s*যোগাযোগ/i,
  /বিজ্ঞাপন\s*(?:মূল্যতালিকা|দর|বিভাগ|শাখা)/i,
  /সার্কুলেশন\s*(?:বিভাগ|শাখা|যোগাযোগ)/i,
  /\badvertisement\b/i,
  /\bsponsored\s*content\b/i,
  /ফেসবুক\s*(?:গ্রুপে|পেজে)\s*(?:যুক্ত\s*হন|লাইক\s*দিন|ফলো\s*করুন)/i,
  /টেলিগ্রাম\s*(?:গ্রুপে|চ্যানেলে)/i,
  /হোয়াটসঅ্যাপ\s*(?:গ্রুপে|চ্যানেলে)/i,
  /ইউটিউব\s*(?:চ্যানেলে|চ্যানেল)/i,
  /অ্যাপ\s*ডাউনলোড\s*করুন/i,
  /নিউজলেটার\s*সাবস্ক্রাইব/i,
  /গুগল\s*নিউজ\s*(?:-এ\s*ফলো|চ্যানেলে)/i,
  /গুগল\s*প্লে\s*(?:স্টোর)?/i,
  /অ্যাপ\s*স্টোর/i,
  /\bfollow\s*us\s*on\b/i,
  /\bsubscribe\s*to\b/i,
  /\bdownload\s*our\s*app\b/i,
  /^(?:আরও\s*পড়ুন|আরও\s*দেখুন|সম্পর্কিত\s*(?:সংবাদ|খবর)|পড়ুন|রিলেটেড\s*নিউজ|বিশেষ\s*সংবাদ|অন্যান্য\s*খবর|সর্বশেষ\s*সংবাদ)\s*[:—–-]/i,
  /^(?:read\s*more|also\s*read|related\s*stories|related\s*news|see\s*also)\s*[:—–-]/i,
  /^(?:ছবি\s*:\s*|ছবি\s*সংগৃহীত|ফাইল\s*ছবি|ভিডিও\s*:\s*|গ্রাফিক্স\s*:\s*|ইলাস্ট্রেশন\s*:\s*)/i,
  /^(?:জাতীয়|রাজনীতি|অর্থনীতি|আন্তর্জাতিক|সারাদেশ|খেলা|বিনোদন|মতামত|বাণিজ্য|প্রবাস)\s*$/i,
  /^(?:নিজস্ব\s*প্রতিবেদক|বিশেষ\s*প্রতিনিধি|স্টাফ\s*রিপোর্টার|অনলাইন\s*ডেস্ক|ডেস্ক\s*রিপোর্ট|জেলা\s*প্রতিনিধি|উপজেলা\s*প্রতিনিধি|সংবাদ\s*বিজ্ঞপ্তি|প্রেস\s*বিজ্ঞপ্তি)(?:,\s*[\u0980-\u09FF\s]+)?$/i,
  /^(?:বাসস|ইউএনবি|রয়টার্স|এএফপি|এপি|বিবিসি|বিডিনিউজ\s*২৪)(?:,\s*[\u0980-\u09FF\s]+)?$/i,
]

/** Office-address and masthead lines: dropped only when they look like an address block, never a sentence that merely mentions a road, a block or Gulshan. */
const ADDRESS_HINT = /(?:ঢাকা|চট্টগ্রাম|সিলেট|dhaka|chattogram|chittagong)[- ]?\d{4}\b|(?:ফোন|ইমেইল|ফ্যাক্স|পিএবিএক্স|phone|email|fax|pabx|tel)\b|(?:বাড়ি|প্লট|house|plot)\s*(?:#|নং|no\.?|number)?\s*[0-9০-৯]|(?:ভবন|টাওয়ার|প্লাজা|bhaban|plaza)\b/i
const ADDRESS_WORDS = /\b(?:house|road|plot|sector|lane|block|avenue|street|bhaban|tower)\b|(?:বাড়ি|রোড|প্লট|সেক্টর|লেন|ব্লক)\s*নং|(?:কারওয়ান|কাওরান|মতিঝিল|তেজগাঁও|গুলশান|বনানী|ধানমন্ডি|উত্তরা|পল্টন|বিজয়নগর|আগ্রাবাদ)\s*(?:বাজার)?/i
const DATELINE_ONLY = /^(?:E-paper\s*English|শুক্রবার|শনিবার|রবিবার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার)/i

export function isBoilerplateParagraph(text: string): boolean {
  const t = text.trim()
  if (t.length < 20) return true
  for (const pat of BOILERPLATE_PATTERNS) {
    if (pat.test(t)) return true
  }
  if (ADDRESS_WORDS.test(t) && t.length < 240 && ADDRESS_HINT.test(t)) return true
  if (DATELINE_ONLY.test(t) && t.length <= 70) return true
  return false
}

/** Strips datelines, reporter leads, agency tags, and noise prefixes from an article paragraph. */
export function cleanParagraphLead(text: string): string {
  let t = text.trim()
  // 1. Strip reporter / agency leads:
  // e.g. "নিজস্ব প্রতিবেদক, ঢাকা:" or "অনলাইন ডেস্ক —" or "বিশেষ প্রতিনিধি, ঢাকা (২৩ অক্টোবর):"
  t = t.replace(/^(?:(?:নিজস্ব\s*প্রতিবেদক|বিশেষ\s*প্রতিনিধি|স্টাফ\s*রিপোর্টার|অনলাইন\s*ডেস্ক|ডেস্ক\s*রিপোর্ট|জেলা\s*প্রতিনিধি|সংবাদদাতা|অর্থনৈতিক\s*প্রতিবেদক)(?:,\s*[\u0980-\u09FF\s\d,()]+)?)\s*[:—–-]\s*/i, '')

  // 2. Strip bracketed dateline leads:
  // e.g. "(ঢাকা, ২৩ অক্টোবর) —" or "(বাসস) —" or "(ইউএনবি) —"
  t = t.replace(/^\([^)]{2,40}\)\s*[:—–-]\s*/i, '')

  // 3. Strip city datelines:
  // e.g. "ঢাকা, ২৩ অক্টোবর (বাসস) :" or "ঢাকা:" or "সিলেট:"
  t = t.replace(/^(?:ঢাকা|চট্টগ্রাম|সিলেট|রাজশাহী|খুলনা|বরিশাল|রংপুর|ময়মনসিংহ|কক্সবাজার|গাজীপুর|নারায়ণগঞ্জ)(?:,\s*[\u0980-\u09FF\s\d,()]+)?\s*[:—–-]\s*/i, '')

  // 4. Strip inline trailing boilerplate ("বিস্তারিত আসছে..." / "আরও পড়ুন...")
  t = t.replace(/\s*[-—–|•]\s*(?:আরও\s*পড়ুন|বিস্তারিত\s*আসছে|বিস্তারিত\s*জানতে|ছবি\s*:).*$/i, '')

  return t.trim()
}

/** Bengali ড় ঢ় য় can be typed as one letter or as letter + nukta; the patterns use the one-letter form (NFC does not join them). */
export const composeBengali = (t: string): string => t.replace(/ড়/g, 'ড়').replace(/ঢ়/g, 'ঢ়').replace(/য়/g, 'য়')

/** Removes boilerplate paragraphs and reporter/dateline leads from a pasted or fetched source. Never rewrites a sentence. */
export function cleanSource(raw: string): string {
  const paras = raw.replace(/\r/g, '').split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const kept: string[] = []
  for (const p of paras) {
    const cleaned = cleanParagraphLead(p)
    if (cleaned && !isBoilerplateParagraph(composeBengali(cleaned)) && kept[kept.length - 1] !== cleaned) kept.push(cleaned)
  }
  return kept.join('\n\n')
}

export const TRANSLATION_SCHEMA: AiSchema = {
  properties: {
    headline: { description: 'The strongest fact as an active English news headline, at most 104 characters.' },
    deck: { description: 'One-sentence standfirst, at most 200 characters.' },
    slug: { description: 'lowercase kebab-case URL slug, at most 75 characters, meaning words only, no dates or amounts.' },
    category: { description: `Exactly one of: ${STORY_CATEGORIES.join(' | ')}` },
    body: { description: 'The complete finished English story: every fact of the source, plain paragraphs separated by blank lines. Never drop the ending.' },
    notes: { description: 'Short lines, one per line, for the editor: anything unclear, contradictory or cut off in the source. Empty if none.' },
  },
  required: ['headline', 'deck', 'slug', 'category', 'body', 'notes'],
}

const MAX_SOURCE_CHARS = 60_000

/** The exact request sent to the model (pure, so tests can inspect it). */
export function buildTranslationRequest(source: string): { system: string; user: string; schema: AiSchema } {
  const system = `${BASE_PROMPT}\n\nReply format: answer only with the requested JSON fields, no labels and no commentary. Never invent a fact, figure, name, date or quote that is not in the source. Do not mention the site name or the source newspaper in any field. category must be exactly one of: ${STORY_CATEGORIES.join('; ')}.`
  return { system, user: `Source article:\n\n${source}`, schema: TRANSLATION_SCHEMA }
}

export interface TranslateResult {
  headline: string
  deck: string
  body: string
  slug: string
  category: string
  /** amber list for the editor: budget overruns, figures not in the source, model remarks */
  notes: string[]
}

export async function translateStory(
  input: { source: string; sourceUrl?: string },
  opts?: { signal?: AbortSignal },
): Promise<TranslateResult> {
  const source = cleanSource(input.source)
  if (!source) throw new AiError('bad-request', 'There is no article text to translate. Paste the text first.')
  if (source.length > MAX_SOURCE_CHARS) throw new AiError('bad-request', 'The article is too long for one go. Paste it in two parts.')
  // fail early, before any network call, when there is no key
  if (!(await getSecret('gemini-key'))) throw new AiError('no-key', NO_KEY_MESSAGE)

  const req = buildTranslationRequest(source)
  const { data } = await geminiJson<Record<string, string>>({ ...req, signal: opts?.signal, maxTokens: 24000 })
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const headline = str(data.headline)
  const body = str(data.body).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')
  if (!headline || !body) throw new AiError('bad-reply', 'Gemini returned no article. Try again.')
  const deck = str(data.deck)
  const slug = fitSlug(str(data.slug) || headline)
  const notes: string[] = str(data.notes).split(/\n+/).map((l) => l.trim()).filter(Boolean)

  let category = str(data.category)
  if (!(STORY_CATEGORIES as readonly string[]).includes(category)) {
    notes.push(category ? `The model suggested the category "${category}", which the site does not have. Pick one.` : 'No category suggested. Pick one.')
    category = ''
  }
  for (const i of checkBudgets({ headline, deck, slug })) notes.push(describeIssue(i))
  notes.push(...factNotes(source, `${headline}\n${deck}\n${body}`))
  return { headline, deck, body, slug, category, notes }
}
