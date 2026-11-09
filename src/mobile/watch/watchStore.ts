// EnergyWatch on the phone: the office watcher's news & official government press release engine, run by the phone itself,
// so it works anywhere with internet and needs neither the office server nor its login.
import { create } from 'zustand'
import { buildMatcher, type EwKeyword } from './matcher'
import { EW_FEEDS, EW_KEYWORDS, EW_PRESS_SOURCES, type EwPressSource } from './ewSources'
import { parseFeed, parseDate } from './feedparse'
import { itemTimeMs, olderThan, sortTimeMs } from './dates'
import { mergeFound, norm } from './dedupe'
import { NOT_PRESS, parseGovPressTable, resolveGovOfficeName } from './pressParse'

// the shared engine (identical to the PC's src/news): matcher, feedparse, dates, dedupe, pressParse, rangeSearch
export { itemTimeMs, norm, parseGovPressTable, resolveGovOfficeName }
import { unwrapFeedRedirectUrl } from '../../platform/fetchGuarded'

export type WatchCat = 'energy' | 'leadership' | 'press'
export interface WatchItem {
  key: string
  title: string
  link: string
  /** true when the only link is an encoded Google News one */
  google: boolean
  source: string
  feedId: number
  published: string | null
  foundAt: number
  categories: string[]
  matched: string[]
  /** the feed gave no readable date: shown as "time not given", aged from when it was first found */
  timeUnknown?: boolean
}
export interface FeedState { ok: boolean; at: number; count: number; error?: string }
export interface WatchPrefs {
  /** portal names switched off on this phone */
  portalsOff: string[]
  /** extra "always keep" words (energy news) */
  keep: string[]
  /** extra "never show" words */
  never: string[]
  show: Record<WatchCat, boolean>
  maxAgeH: number
  /** minutes between automatic checks while Wire is open; 0 = only Check now */
  autoMin: number
  /** show an English line under Bangla headlines (free translation, in the background); default on */
}

export const DEFAULT_PREFS: WatchPrefs = {
  portalsOff: [],
  keep: [],
  never: [],
  show: { energy: true, leadership: true, press: true },
  maxAgeH: 24,
  autoMin: 10,
}
const PREFS_KEY = 'esb-phone/watch/prefs/v1'
const DATA_KEY = 'esb-phone/watch/data/v1'
const ITEM_CAP = 2800
const CONCURRENCY = 8
const TIMEOUT_MS = 20000
const PRESS_RETENTION_MS = 60 * 24 * 3600_000 // Keep official government press releases for 60 days

const load = <T extends object>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    if (!v) return d
    const parsed = JSON.parse(v)
    if (parsed && typeof parsed === 'object' && 'show' in d && parsed.show) {
      parsed.show = { ...(d as unknown as WatchPrefs).show, ...parsed.show }
    }
    return { ...d, ...parsed }
  } catch {
    return d
  }
}
const save = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full */ }
}

/** Bing News answers the phone with a web page, not RSS: those feeds are left out here. */
export const isPhoneFeed = (f: { on: boolean; url: string }) => {
  if (!f.on) return false
  try { return !/(^|\.)bing\.com$/i.test(new URL(f.url).hostname) } catch { return false }
}

/** Every media portal (feeds grouped by name), in EnergyWatch's order. */
export const PORTALS: { name: string; feeds: number }[] = (() => {
  const m = new Map<string, number>()
  for (const f of EW_FEEDS) if (isPhoneFeed(f)) m.set(f.name, (m.get(f.name) ?? 0) + 1)
  return [...m].map(([name, feeds]) => ({ name, feeds }))
})()

/** Official Bangladesh Government Ministries, Divisions, Commissions & State Offices scanned for Official Press. */
export const PRESS_OFFICES: { name: string; office: string; feeds: number }[] = (() => {
  const m = new Map<string, { office: string; feeds: number }>()
  for (const s of EW_PRESS_SOURCES) {
    if (!s.on) continue
    const cur = m.get(s.name)
    m.set(s.name, { office: s.office, feeds: (cur?.feeds ?? 0) + 1 })
  }
  return [...m].map(([name, v]) => ({ name, office: v.office, feeds: v.feeds }))
})()

/** Unwrap Bing apiclick and offline-decodable Google News CBMi... links immediately; mark remaining Google News links. */
export function unwrapLink(link: string): { link: string; google: boolean } {
  const unwrapped = unwrapFeedRedirectUrl(link)
  try {
    const u = new URL(unwrapped)
    if (/(^|\.)news\.google\.com$/i.test(u.hostname)) return { link: unwrapped, google: true }
  } catch { /* keep as-is */ }
  return { link: unwrapped, google: false }
}


export function keywordsFor(p: WatchPrefs): EwKeyword[] {
  return [
    ...EW_KEYWORDS,
    ...p.keep.map((term) => ({ term, kind: 'strong', category: 'energy' })),
    ...p.never.map((term) => ({ term, kind: 'block', category: null })),
  ]
}

// ============================================================================
// Canonical Topics, Bilingual Synonym Grouping & Relevance Sorting
// ============================================================================

export interface CanonicalTopic {
  label: string
  cat?: WatchCat
  terms: string[]
}

/** High-signal newsroom topics grouping Bangla & English synonyms so Trending pills are meaningful and never split by language. */
export const CANONICAL_TOPICS: CanonicalTopic[] = [
  { label: 'LNG', cat: 'energy', terms: ['lng', 'rlng', 'fsru', 'এলএনজি', 'তরলীকৃত প্রাকৃতিক গ্যাস'] },
  { label: 'LPG', cat: 'energy', terms: ['lpg', 'autogas', 'এলপিজি', 'সিলিন্ডার গ্যাস', 'অটোগ্যাস', 'বোতলজাত গ্যাস'] },
  { label: 'Load Shedding', cat: 'energy', terms: ['load shedding', 'load-shedding', 'loadshedding', 'power cut', 'power outage', 'blackout', 'লোডশেডিং', 'বিদ্যুৎ বিভ্রাট', 'বিদ্যুৎহীন', 'বিদ্যুৎ থাকবে না', 'ব্ল্যাকআউট'] },
  { label: 'Tariff & Price', cat: 'energy', terms: ['power tariff', 'gas tariff', 'electricity price', 'electricity tariff', 'fuel price', 'tariff hike', 'price hike', 'বিদ্যুতের দাম', 'গ্যাসের দাম', 'জ্বালানির দাম', 'তেলের দাম', 'এলপিজির দাম', 'ভর্তুকি', 'subsidy'] },
  { label: 'BPDB', cat: 'energy', terms: ['bpdb', 'pdb', 'পিডিবি', 'বিপিডিবি', 'বিদ্যুৎ উন্নয়ন বোর্ড'] },
  { label: 'Petrobangla', cat: 'energy', terms: ['petrobangla', 'পেট্রোবাংলা'] },
  { label: 'BERC', cat: 'energy', terms: ['berc', 'বিইআরসি', 'এনার্জি রেগুলেটরি'] },
  { label: 'BPC & Fuel Oil', cat: 'energy', terms: ['bpc', 'বিপিসি', 'পেট্রোলিয়াম কর্পোরেশন', 'ডিজেল', 'পেট্রোল', 'অকটেন', 'ফার্নেস অয়েল', 'কেরোসিন', 'diesel', 'octane', 'petrol', 'furnace oil', 'kerosene', 'refinery', 'রিফাইনারি', 'ইস্টার্ন রিফাইনারি', 'পদ্মা অয়েল', 'মেঘনা পেট্রোলিয়াম', 'যমুনা অয়েল'] },
  { label: 'Solar & Renewable', cat: 'energy', terms: ['solar', 'renewable', 'sreda', 'net metering', 'rooftop solar', 'wind power', 'সৌরবিদ্যুৎ', 'সৌর', 'নবায়নযোগ্য', 'স্রেডা', 'নেট মিটারিং', 'বায়ুবিদ্যুৎ'] },
  { label: 'Rooppur Nuclear', cat: 'energy', terms: ['rooppur', 'nuclear power', 'nuclear plant', 'রূপপুর', 'পারমাণবিক'] },
  { label: 'Grid & PGCB', cat: 'energy', terms: ['pgcb', 'national grid', 'transmission line', 'substation', 'পিজিসিবি', 'পাওয়ার গ্রিড', 'জাতীয় গ্রিড', 'সঞ্চালন লাইন', 'সাবস্টেশন', 'গ্রিড বিপর্যয়'] },
  { label: 'Palli Bidyut', cat: 'energy', terms: ['breb', 'reb', 'palli bidyut', 'পল্লী বিদ্যুৎ', 'পল্লী বিদ্যুতায়ন'] },
  { label: 'Titas & Gas Supply', cat: 'energy', terms: ['titas gas', 'titas', 'gtcl', 'gas crisis', 'gas shortage', 'gas connection', 'তিতাস গ্যাস', 'তিতাস', 'জিটিসিএল', 'গ্যাস সংকট', 'গ্যাস সংযোগ', 'অবৈধ গ্যাস', 'গ্যাস সরবরাহ', 'বাখরাবাদ', 'জালালাবাদ', 'কর্ণফুলী গ্যাস'] },
  { label: 'DESCO & DPDC', cat: 'energy', terms: ['desco', 'dpdc', 'nesco', 'wzpdcl', 'ডেসকো', 'ডিপিডিসি', 'নেসকো', 'ওজোপাডিকো', 'প্রিপেইড মিটার', 'prepaid meter'] },
  { label: 'BAPEX & Gas Fields', cat: 'energy', terms: ['bapex', 'gas field', 'bibiyana', 'bhola gas', 'sgfl', 'বাপেক্স', 'গ্যাসক্ষেত্র', 'কূপ খনন', 'বিবিয়ানা', 'ভোলা গ্যাস', 'রশিদপুর', 'হরিপুর', 'কৈলাশটিলা', 'সিলেট গ্যাস'] },
  { label: 'Coal & Power Plants', cat: 'energy', terms: ['matarbari', 'payra', 'rampal', 'banskhali', 'coal power', 'power plant', 'মাতারবাড়ী', 'পায়রা', 'রামপাল', 'বাঁশখালী', 'কয়লা', 'বিদ্যুৎকেন্দ্র'] },
  { label: 'Power Import & Adani', cat: 'energy', terms: ['adani', 'power import', 'cross-border power', 'আদানি', 'বিদ্যুৎ আমদানি', 'নেপাল থেকে বিদ্যুৎ', 'ভারত থেকে বিদ্যুৎ'] },
  { label: 'Ministry & Policy', cat: 'energy', terms: ['power division', 'emrd', 'energy adviser', 'power adviser', 'বিদ্যুৎ বিভাগ', 'জ্বালানি বিভাগ', 'বিদ্যুৎ মন্ত্রণালয়', 'বিদ্যুৎ উপদেষ্টা', 'জ্বালানি উপদেষ্টা'] },
  { label: 'PM Tarique Rahman', cat: 'leadership', terms: ['tarique rahman', 'pm tarique', 'pmo', 'তারেক রহমান', 'প্রধানমন্ত্রীর কার্যালয়'] },
  { label: 'President & Bangabhaban', cat: 'leadership', terms: ['shahabuddin', 'president shahabuddin', 'bangabhaban', 'সাহাবুদ্দিন', 'বঙ্গভবন', 'রাষ্ট্রপতির কার্যালয়'] },
]

/** Generic single-word umbrella terms that already define the whole category and should not clutter Trending pills. */
const GENERIC_UMBRELLA_TERMS = new Set([
  'বিদ্যুৎ', 'বিদ্যুত', 'জ্বালানি', 'গ্যাস', 'তেল', 'পাওয়ার', 'এনার্জি',
  'energy', 'power', 'electricity', 'fuel', 'gas', 'oil',
  'pm', 'prime minister', 'প্রধানমন্ত্রী', 'president', 'রাষ্ট্রপতি', 'প্রেসিডেন্ট',
  'bangladesh', 'বাংলাদেশ', 'dhaka', 'ঢাকা', 'সরকার', 'government',
])

const bnFold = (s: string) => s.toLowerCase().replaceAll('ৎ', 'ত')

const TOPIC_BY_LOWER = new Map<string, CanonicalTopic>()
for (const t of CANONICAL_TOPICS) {
  TOPIC_BY_LOWER.set(t.label.toLowerCase(), t)
  for (const syn of t.terms) TOPIC_BY_LOWER.set(bnFold(syn), t)
}

/** Identify which canonical topics a headline belongs to. */
export function canonicalTopicsForItem(x: WatchItem): string[] {
  const hay = bnFold(`${x.title} ${x.matched.join(' ')}`)
  const out: string[] = []
  for (const topic of CANONICAL_TOPICS) {
    if (topic.terms.some((term) => hay.includes(bnFold(term)))) {
      out.push(topic.label)
    }
  }
  return out
}

/** Compute the top Trending pills for the currently active category and visible items. */
export function trendingTopics(items: WatchItem[], cat: 'all' | WatchCat, limit = 8): [string, number][] {
  const scoped = cat === 'all' ? items : items.filter((x) => x.categories.includes(cat))
  const counts = new Map<string, number>()

  if (cat === 'press') {
    // In Official Press, surface the active government ministries/offices first so one tap filters by office
    for (const x of scoped) {
      counts.set(x.source, (counts.get(x.source) ?? 0) + 1)
    }
  }

  for (const x of scoped) {
    const topics = canonicalTopicsForItem(x)
    for (const t of topics) counts.set(t, (counts.get(t) ?? 0) + 1)
    if (!topics.length) {
      for (const raw of x.matched) {
        const clean = raw.trim()
        if (clean.length <= 2 || GENERIC_UMBRELLA_TERMS.has(bnFold(clean))) continue
        const mapped = TOPIC_BY_LOWER.get(bnFold(clean))
        const label = mapped ? mapped.label : clean
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
}

/** Score how strongly a headline matches a search query or Trending topic pill (0 = no match). */
export function matchQueryScore(x: WatchItem, rawQuery: string): number {
  const q = rawQuery.trim()
  if (!q) return 1
  const qFold = bnFold(q)
  const titleFold = bnFold(x.title)
  const sourceFold = bnFold(x.source)
  const matchedFold = x.matched.map(bnFold)

  const topic = TOPIC_BY_LOWER.get(qFold)
  const needles = topic ? [...new Set([qFold, ...topic.terms.map(bnFold)])] : [qFold]

  let score = 0
  let hits = 0
  for (const n of needles) {
    if (!n) continue
    if (sourceFold === n) {
      score += 50
      hits++
    } else if (sourceFold.includes(n)) {
      score += 30
      hits++
    }
    const idx = titleFold.indexOf(n)
    if (idx !== -1) {
      hits++
      // Lead-subject boost when the topic appears near the start of the headline
      score += idx <= 28 ? 40 : 25
    }
    if (matchedFold.some((m) => m === n || m.includes(n))) {
      hits++
      score += 15
    }
  }

  // Multi-word fallback: if user typed multiple words, match when all words appear
  if (hits === 0 && qFold.includes(' ')) {
    const parts = qFold.split(/\s+/).filter((w) => w.length >= 2)
    if (parts.length > 1 && parts.every((p) => titleFold.includes(p) || sourceFold.includes(p))) {
      score += 22
    }
  }

  return score
}

// ============================================================================
// Official Government Press Release Parser (National Portal *.gov.bd / *.org.bd)
// ============================================================================

export async function fetchText(url: string): Promise<string> {
  let last: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(new Error('timed out')), TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, cache: 'no-store' })
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); if (res.status === 429 || res.status >= 500) { last = e; continue } throw e }
      const xml = await res.text()
      if (!/<(rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('Not a news feed')
      return xml
    } catch (e) {
      last = e
      if (e instanceof Error && /^(HTTP 4|Not a news)/.test(e.message)) break
    } finally { clearTimeout(t) }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

async function fetchPortalHtml(url: string): Promise<string> {
  if (typeof window !== 'undefined' && window.esb?.fetchUrl) {
    const r = await window.esb.fetchUrl(url, { timeoutMs: 15000 })
    if (r.ok && r.html) return r.html
  }
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(new Error('timed out')), 15000)
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { Accept: 'text/html,application/xhtml+xml,*/*' }, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

async function pool<T>(list: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]) }))
}

interface WatchState {
  prefs: WatchPrefs
  items: WatchItem[]
  hidden: string[]
  feeds: Record<number, FeedState>
  lastRun: number | null
  /** newest foundAt the editor has looked at: rows found after it are marked new */
  seenAt: number
  /** headlines the latest refresh added (empty after the very first check): they carry the NEW tag until the next refresh */
  newKeys: string[]
  running: boolean
  setPrefs: (p: Partial<WatchPrefs>) => void
  resetPrefs: () => void
  hide: (key: string) => void
  /** Remove/hide a story from News right after it is published or updated. */
  cleanPublishedStory: (url?: string | null, title?: string | null) => void
  unhide: (key: string) => void
  markSeen: () => void
  markRead: (key: string) => void
  markAllRead: () => void
  run: () => Promise<{ checked: number; added: number; failed: number } | null>
}

const initial = load(DATA_KEY, { items: [] as WatchItem[], hidden: [] as string[], feeds: {} as Record<number, FeedState>, lastRun: null as number | null, seenAt: 0, newKeys: [] as string[] })


export const useWatch = create<WatchState>((set, get) => {
  const persist = () => { const s = get(); save(DATA_KEY, { items: s.items, hidden: s.hidden, feeds: s.feeds, lastRun: s.lastRun, seenAt: s.seenAt, newKeys: s.newKeys }) }
  return {
    prefs: load(PREFS_KEY, DEFAULT_PREFS),
    ...initial,
    running: false,
    setPrefs: (p) => {
      const cur = get().prefs
      const prefs: WatchPrefs = { ...cur, ...p, show: p.show ? { ...cur.show, ...p.show } : cur.show }
      save(PREFS_KEY, prefs)
      set({ prefs })
    },
    resetPrefs: () => { save(PREFS_KEY, DEFAULT_PREFS); set({ prefs: DEFAULT_PREFS }) },
    cleanPublishedStory: (url, title) => {
      const s = get()
      const cleanU = url ? unwrapFeedRedirectUrl(url.trim()).replace(/\/+$/, '').toLowerCase() : ''
      const cleanT = title ? norm(title) : ''
      if (!cleanU && !cleanT) return
      const removedKeys = new Set<string>()
      for (const x of s.items) {
        const itemU = unwrapFeedRedirectUrl(x.link).replace(/\/+$/, '').toLowerCase()
        if ((cleanU && (itemU === cleanU || x.key.toLowerCase() === cleanU)) || (cleanT && cleanT.length >= 12 && norm(x.title) === cleanT)) {
          removedKeys.add(x.key)
        }
      }
      if (!removedKeys.size && cleanU) removedKeys.add(url!.trim())
      set({
        hidden: [...new Set([...s.hidden, ...removedKeys])].slice(-2000),
        items: s.items.filter((x) => !removedKeys.has(x.key)),
        newKeys: s.newKeys.filter((k) => !removedKeys.has(k)),
      })
      persist()
    },
    hide: (key) => { set({ hidden: [...get().hidden, key].slice(-2000) }); persist() },
    unhide: (key) => { set({ hidden: get().hidden.filter((k) => k !== key) }); persist() },
    markRead: (key) => { set({ newKeys: get().newKeys.filter((k) => k !== key) }); persist() },
    markAllRead: () => { set({ newKeys: [] }); persist() },
    markSeen: () => { const top = get().items.reduce((m, x) => Math.max(m, x.foundAt), 0); if (top > get().seenAt) { set({ seenAt: top }); persist() } },
    run: async () => {
      if (get().running) return null
      set({ running: true })
      const started = Date.now()
      const { prefs } = get()
      const match = buildMatcher(keywordsFor(prefs))
      const off = new Set(prefs.portalsOff)
      const feeds = EW_FEEDS.filter((f) => isPhoneFeed(f) && !off.has(f.name))
      const pressSources: EwPressSource[] = prefs.show.press !== false ? EW_PRESS_SOURCES.filter((s) => s.on && !off.has(s.name)) : []
      const maxAge = prefs.maxAgeH * 3600_000
      const states: Record<number, FeedState> = { ...get().feeds }
      const found: WatchItem[] = []
      let failed = 0

      // 1. Scan media portals
      await pool(feeds, CONCURRENCY, async (f) => {
        try {
          const list = parseFeed(await fetchText(f.url))
          states[f.id] = { ok: true, at: Date.now(), count: list.length }
          for (const it of list) {
            const published = parseDate(it.date)
            if (published && started - Date.parse(published) > maxAge) continue
            const m = match(it.title)
            if (!m) continue
            const { link, google } = unwrapLink(it.link || '')
            if (!/^https?:\/\//i.test(link)) continue
            found.push({ key: it.key, title: it.title, link, google, source: f.name, feedId: f.id, published, timeUnknown: !published || undefined, foundAt: started, categories: m.categories, matched: m.matched })
          }
        } catch (e) {
          failed++
          states[f.id] = { ok: false, at: Date.now(), count: 0, error: e instanceof Error ? e.message : String(e) }
        }
      })

      // 2. Scan Official Government Press Wings & Ministries (strictly official government sources)
      await pool(pressSources, 6, async (ps) => {
        try {
          if (ps.kind === 'portal-table') {
            const html = await fetchPortalHtml(ps.url)
            const rows = parseGovPressTable(html, ps.url)
            states[ps.id] = { ok: true, at: Date.now(), count: rows.length }
            for (const r of rows) {
              if (r.published && started - Date.parse(r.published) > PRESS_RETENTION_MS) continue
              const m = match(r.title)
              const matched = m ? m.matched : [ps.name]
              found.push({
                key: r.key,
                title: r.title,
                link: r.link,
                google: false,
                source: ps.name,
                feedId: ps.id,
                published: r.published,
                timeUnknown: !r.published || undefined,
                foundAt: started,
                categories: ['press'],
                matched,
              })
            }
          } else {
            const list = parseFeed(await fetchText(ps.url))
            states[ps.id] = { ok: true, at: Date.now(), count: list.length }
            for (const it of list) {
              const published = parseDate(it.date)
              if (published && started - Date.parse(published) > PRESS_RETENTION_MS) continue
              const cleanTitle = it.title.replace(/\s*\|\s*(?:খবর|সংবাদ|প্রেস\s*রিলিজ|সংবাদ\s*বিজ্ঞপ্তি|Press\s*Release|News|Notice|নোটিশ)\s*\|.*$/i, '').trim()
              if (!cleanTitle || NOT_PRESS.test(cleanTitle)) continue
              const { link, google } = unwrapLink(it.link || '')
              if (!/^https?:\/\//i.test(link)) continue
              const officeName = google ? ps.name : resolveGovOfficeName(link, ps.name)
              if (!officeName) continue
              const m = match(cleanTitle)
              found.push({
                key: it.key,
                title: cleanTitle,
                link,
                google,
                source: officeName,
                feedId: ps.id,
                published,
                timeUnknown: !published || undefined,
                foundAt: started,
                categories: ['press'],
                matched: m ? m.matched : [officeName],
              })
            }
          }
        } catch (e) {
          states[ps.id] = { ok: false, at: Date.now(), count: 0, error: e instanceof Error ? e.message : String(e) }
        }
      })

      // Merge: one row per story across feeds (dedupe.ts: same address, or same portal and near-identical headline); a
      // direct link beats a Google one; the editor's hidden rows never come back.
      const prev = get().items
      const { items, addedKeys } = mergeFound(prev, found, started, { hidden: get().hidden, itemCap: ITEM_CAP, pressRetentionMs: PRESS_RETENTION_MS })
      const added = addedKeys.length
      set({ items, feeds: states, lastRun: started, running: false, seenAt: prev.length ? get().seenAt : started, newKeys: prev.length ? addedKeys : [] })
      persist()
      return { checked: feeds.length + pressSources.length, added, failed }
    },
  }
})

/** Rows to show: filtered by category, time window, and topic/search query, sorted by relevance (when querying) and true timestamp. */
export function visibleItems(
  items: WatchItem[],
  hidden: string[],
  prefs: WatchPrefs,
  q: string,
  cat: 'all' | WatchCat,
  newKeys?: Iterable<string>,
): WatchItem[] {
  const h = new Set(hidden)
  const isNew = newKeys ? new Set(newKeys) : new Set<string>()
  const now = Date.now()
  const mediaMinTime = now - prefs.maxAgeH * 3600_000
  const hasQuery = q.trim().length > 0

  const scored: { item: WatchItem; score: number; time: number; fresh: boolean }[] = []
  for (const x of items) {
    if (h.has(x.key)) continue
    if (prefs.portalsOff.includes(x.source)) continue
    if (!x.categories.some((c) => prefs.show[c as WatchCat] !== false)) continue
    if (cat !== 'all' && !x.categories.includes(cat)) continue

    // the chosen window applies to every row, official press too (the 60-day press retention is storage, not "last 24 hours");
    // a row without a date counts from when it was first found
    if (olderThan(x, now, now - mediaMinTime)) continue

    const score = hasQuery ? matchQueryScore(x, q) : 1
    if (score <= 0) continue
    scored.push({ item: x, score, time: sortTimeMs(x), fresh: isNew.has(x.key) })
  }

  scored.sort((a, b) => {
    if (hasQuery && b.score !== a.score) return b.score - a.score
    if (!hasQuery && a.fresh !== b.fresh) return a.fresh ? -1 : 1
    return b.time - a.time || b.item.foundAt - a.item.foundAt
  })

  return scored.map((s) => s.item)
}
