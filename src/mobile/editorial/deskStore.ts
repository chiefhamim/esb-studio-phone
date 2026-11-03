// The phone Editorial desk's controller: which screen is showing, the intake inputs, and every job the PC desk runs
// (link import, pasted-text translation, PDF/DOCX reading, re-translation, SEO and captions with AI, fix-all). The job
// bodies are the PC EditorialWorkspace.tsx handlers (chiefhamim/esb-banner-studio, src/editorial/EditorialWorkspace.tsx)
// on the PC stores; what the phone adds is honest cancelling, an undo for every AI overwrite, and a confirm before AI
// replaces text the editor already has (AI output is a draft, never a silent overwrite).
import { create } from 'zustand'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import type { EditorialDraft } from '../../pc/editorial/editorialStore'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { automateNewsFromUrl, describeIntakeError, IntakeError } from '../../pc/editorial/automation'
import { alignKeywords, seoFields, translateNewsArticle } from '../../pc/editorial/translator'
import { DocumentImportError, documentKind, readDocument, readPdfWithAi } from '../../pc/editorial/importDocument'
import { aiFor, providerMeta } from '../../pc/editorial/aiProviders'
import { aiCaptions, aiSeo, storyCaptions } from '../../pc/editorial/aiDesk'
import { fixSeoWithAi } from '../../pc/editorial/seoFix'
import type { SeoDraft } from '../../pc/editorial/seoFix'
import { analyzeSocial, socialFixList } from '../../pc/editorial/socialChecks'
import { useJobLog } from '../../pc/editorial/jobLog'
import { openArticleForEdit } from '../../pc/editorial/liveEdit'
import type { LiveArticleSummary } from '../../pc/editorial/siteApi'
import { detectCategory, suggestHighlight } from '../../pc/core/newsroom'
import { autoDesk } from '../../pc/editorial/deskFlag'
import { useStore } from '../../pc/store'
import { CATEGORIES } from '../../pc/core/tokens'
import { confirmAsk, snack } from '../shell/core'
import { useNav } from '../shell/nav'

export type View = 'home' | 'intake' | 'story'
export type Tab = 'story' | 'details' | 'seo' | 'social' | 'preview'
export type IntakeTab = 'link' | 'text'
export type HomeTab = 'stories' | 'published' | 'wire'
export type Busy = null | 'fetch' | 'translate' | 'retranslate' | 'doc' | 'seo' | 'social' | 'fixSeo' | 'fixSocial' | 'open'
export interface DocInfo { name: string; kind: 'pdf' | 'docx'; pages?: number; size: number; words: number; warnings: string[] }
export interface IntakeFail { title: string; detail: string; canPaste: boolean; code: string }

interface DeskState {
  view: View
  tab: Tab
  intakeTab: IntakeTab
  homeTab: HomeTab
  url: string
  raw: string
  doc: DocInfo | null
  busy: Busy
  /** The running job's current step (null when idle). */
  status: string | null
  error: IntakeFail | null
  /** A translation problem worth more than a snackbar; shown on the Story tab until dismissed. */
  notice: string | null
  seoFixNote: string | null
  /** The last AI change, so it can be undone (one level). */
  undo: { label: string; restore: () => void } | null
  /** The body editor has focus (its toolbar is docked above the keyboard; the action bar steps aside). */
  editing: boolean
  writing: boolean
  bodyMode: 'edit' | 'verified'
  focusUrlAt: number
  /** The AI chart idea the chart sheet was opened on (index into draft.chartIdeas), or null for a new chart. */
  chartIdea: number | null
  set: (p: Partial<DeskState>) => void
}

export const useDesk = create<DeskState>((set) => ({
  view: 'home', tab: 'story', intakeTab: 'link', homeTab: 'stories', url: '', raw: '', doc: null, busy: null, status: null,
  error: null, notice: null, seoFixNote: null, undo: null, editing: false, writing: false, bodyMode: 'edit', focusUrlAt: 0, chartIdea: null,
  set: (p) => set(p),
}))

const ed = () => useEditorialStore.getState()
const desk = () => useDesk.getState()

// ---------------------------------------------------------------- the story job's timeline (fed by the status text, as on the PC)
let storyJob: number | null = null
function status(text: string | null, error?: string) {
  const log = useJobLog.getState()
  const live = storyJob != null && log.jobs.some((j) => j.id === storyJob && !j.end)
  if (text) {
    if (live) log.step(storyJob!, text)
    else storyJob = log.begin('story', /re-translat/i.test(text) ? 'Re-translation' : 'Story translation', text)
  } else if (live) {
    const st = ed()
    const p = st.translationProvider
    const by = p && p !== 'neural' && p !== 'offline' ? `${providerMeta(p).name}${st.modelUsed ? ` · ${st.modelUsed}` : ''}` : 'Machine translation'
    log.finish(storyJob!, { by, error })
    storyJob = null
  }
  useDesk.setState({ status: text })
}

// one sequence number for every cancellable job: a job whose number is stale writes nothing
let seq = 0
const isLive = (run: number) => run === seq

export function cancelJob() {
  const b = desk().busy
  if (!b || b === 'fetch' || b === 'open') return
  seq++
  if (storyJob != null) status(null, 'Cancelled by the editor')
  useDesk.setState({ busy: null, status: null })
  snack('Cancelled. Nothing from that run was written to the story.')
}

/** Can the running job be cancelled? A link import writes into the story as it goes, so it cannot be stopped midway. */
export const canCancel = (b: Busy) => !!b && b !== 'fetch' && b !== 'open'

function draftSnapshot(): { draft: EditorialDraft } { return { draft: ed().draft } }
function restoreDraft(s: { draft: EditorialDraft }) { useEditorialStore.setState({ draft: s.draft }); ed().reverify() }
function offerUndo(label: string, snap: { draft: EditorialDraft }) {
  const restore = () => { restoreDraft(snap); useDesk.setState({ undo: null }); snack(`${label} undone`) }
  useDesk.setState({ undo: { label, restore } })
  snack(`${label} — review it before publishing`, { action: { label: 'Undo', run: restore }, ms: 8000 })
}

// ---------------------------------------------------------------- intake: link
export async function fetchLink(override?: string, inPlace = false) {
  if (desk().busy) return
  let u = (override ?? desk().url).trim()
  if (!u) return
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  useDesk.setState({ url: u, error: null, busy: 'fetch' })
  // a different link starts a new story; re-fetching the story's own link refreshes it in place
  useStoryQueue.getState().beginStory({ inPlace })
  status('Fetching article & translating to English…')
  try {
    const r = await automateNewsFromUrl(u, (s) => status(s))
    const set = ed().setDraftField
    set('headline', r.englishHeadline)
    set('deck', r.deck)
    set('body', r.body)
    set('slug', r.slug)
    set('focusKeywords', r.focusKeywords)
    set('focusKeyphrase', (r.focusKeywords || '').split(',')[0]?.trim() ?? '')
    set('metaTitle', r.metaTitle)
    set('metaDescription', r.metaDescription)
    set('byline', r.byline)
    set('credit', r.credit)
    status(null)
    const warn = r.extraction?.warnings ?? []
    useDesk.setState({ notice: r.translationNote ?? null, view: 'story', tab: 'story', bodyMode: 'edit' })
    snack(warn.length ? `Story imported with ${warn.length} note${warn.length === 1 ? '' : 's'} — see Source` : 'Story imported and translated — check it against the source')
  } catch (err) {
    const info = describeIntakeError(err)
    const code = err instanceof IntakeError ? err.code : 'unknown'
    useDesk.setState({ error: { ...info, code } })
    status(null, info.title)
  } finally {
    useDesk.setState({ busy: null })
  }
}

// ---------------------------------------------------------------- intake: pasted text (PC handleTranslateRawBengali)
export async function translatePasted() {
  const raw = desk().raw.trim()
  if (!raw || desk().busy) return
  const run = ++seq
  useStoryQueue.getState().beginStory()
  useDesk.setState({ busy: 'translate', error: null })
  status('Translating story to English…')
  try {
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    const title = lines[0] || 'News Report'
    const paragraphs = lines.length > 1 ? lines.slice(1) : [title]
    const deck = paragraphs[0] ? paragraphs[0].slice(0, 200) : ''
    ed().setSourceArticle({ title, deck, paragraphs, images: ed().source?.images || [], canonicalUrl: 'pasted-text', rawHtmlLength: raw.length }, 'pasted-text')
    const t = await translateNewsArticle({ title, deck, paragraphs }, (s) => { if (isLive(run)) status(s) })
    if (!isLive(run)) return
    const s = ed()
    s.setTranslationMeta(t.provider, t.modelUsed)
    s.setDraftField('headline', t.headline)
    s.setDraftField('deck', t.deck)
    s.setDraftField('bodyHtml', t.bodyHtml ?? '')
    s.setDraftField('chartIdeas', t.charts ?? [])
    s.setDraftField('body', t.body)
    s.setDraftField('slug', t.slug)
    s.setDraftField('focusKeywords', t.focusKeywords)
    s.setDraftField('focusKeyphrase', (t.focusKeywords || '').split(',')[0]?.trim() ?? '')
    s.setDraftField('metaTitle', t.metaTitle)
    s.setDraftField('metaDescription', t.metaDescription)
    const cat = detectCategory(`${t.headline} ${t.deck} ${t.body}`) || '01'
    const hl = suggestHighlight(t.headline)
    const templated = storyCaptions({ headline: t.headline, deck: t.deck, categoryId: cat, slug: t.slug })
    for (const k of ['facebook', 'x', 'linkedin', 'telegram'] as const) s.setSocialCaption(k, k === 'facebook' && t.facebook ? t.facebook : templated[k])
    s.setDeskAuto(true)
    autoDesk(() => useStore.getState().setContent({ categoryId: cat, highlight: hl || useStore.getState().doc.content.highlight }))
    status(null)
    useDesk.setState({ notice: t.translationFailed ? 'Part of the story could not be translated — the Bengali is left in place for you to translate.' : t.coverageWarning ?? null, view: 'story', tab: 'story', raw: '', doc: null })
    snack(t.translationFailed ? 'No translation service reachable — Bengali is still in the draft' : 'Story translated — check it against the source')
  } catch (err) {
    if (!isLive(run)) return
    const msg = err instanceof Error ? err.message : 'Translation failed'
    useDesk.setState({ error: { title: 'The story could not be translated', detail: msg, canPaste: false, code: 'translate' } })
    status(null, msg)
  } finally {
    if (isLive(run)) useDesk.setState({ busy: null })
  }
}

// ---------------------------------------------------------------- intake: PDF / Word (PC handleDocumentFile)
export async function readFile(file: File) {
  if (desk().busy) return
  if (!documentKind(file.name, file.type)) { snack('Only PDF and Word (.docx) files can be read here', { tone: 'error' }); return }
  const run = ++seq
  useDesk.setState({ busy: 'doc', error: null, intakeTab: 'text' })
  try {
    let d = await readDocument(file)
    if (!isLive(run)) return
    if (d.needsVision) {
      d = await readPdfWithAi(file, d.needsVision, d.pages ?? 0, (st) => { if (isLive(run)) useDesk.setState({ status: st }) })
      if (!isLive(run)) return
    }
    useDesk.setState({ raw: d.text, doc: { name: d.name, kind: d.kind, pages: d.pages, size: file.size, words: d.words, warnings: d.warnings }, status: null })
    snack('File read — check the text, then press Translate')
  } catch (err) {
    if (!isLive(run)) return
    useDesk.setState({ status: null, error: { title: 'This file could not be read', detail: err instanceof DocumentImportError || err instanceof Error ? err.message : '', canPaste: false, code: 'file' } })
  } finally {
    if (isLive(run)) useDesk.setState({ busy: null })
  }
}

// ---------------------------------------------------------------- re-translate the source (PC handleRetranslateSource)
export async function retranslate(linkedLive: boolean) {
  const src = ed().source
  if (!src || desk().busy) return
  const cur = ed().draft
  if ((cur.headline.trim() || cur.body.trim()) && !(await confirmAsk({ title: 'Translate the source again?', body: linkedLive ? 'This story is live: its headline, address and captions are kept; the story text and search fields are replaced by the new translation. You can undo it.' : 'The headline, deck, story and search fields are replaced by a new translation. You can undo it.', confirm: 'Translate again' }))) return
  const run = ++seq
  const snap = draftSnapshot()
  useDesk.setState({ busy: 'retranslate', error: null })
  status('Re-translating story…')
  try {
    const res = await translateNewsArticle({ title: src.title, deck: src.deck, paragraphs: src.paragraphs }, (s) => { if (isLive(run)) status(s) })
    if (!isLive(run)) return
    const s = ed()
    s.setTranslationMeta(res.provider, res.modelUsed)
    const now = s.draft
    if (linkedLive && now.headline.trim()) {
      const kw = alignKeywords(now.headline, res.body, res.metaTitle, res.focusKeywords)
      const seo = seoFields(now.headline, now.deck, res.body, kw, res.metaTitle, res.metaDescription)
      s.setDraftField('bodyHtml', res.bodyHtml ?? '')
      s.setDraftField('chartIdeas', res.charts ?? [])
      s.setDraftField('body', res.body)
      s.setDraftField('focusKeywords', kw)
      s.setDraftField('focusKeyphrase', kw.split(',')[0]?.trim() ?? '')
      s.setDraftField('metaTitle', seo.metaTitle)
      s.setDraftField('metaDescription', seo.metaDescription)
    } else {
      s.setDraftField('headline', res.headline)
      s.setDraftField('deck', res.deck)
      s.setDraftField('bodyHtml', res.bodyHtml ?? '')
      s.setDraftField('chartIdeas', res.charts ?? [])
      s.setDraftField('body', res.body)
      s.setDraftField('slug', res.slug)
      s.setDraftField('focusKeywords', res.focusKeywords)
      s.setDraftField('focusKeyphrase', (res.focusKeywords || '').split(',')[0]?.trim() ?? '')
      s.setDraftField('metaTitle', res.metaTitle)
      s.setDraftField('metaDescription', res.metaDescription)
      if (res.facebook) s.setSocialCaption('facebook', res.facebook)
    }
    status(null)
    useDesk.setState({ notice: res.translationFailed ? 'Part of the story could not be translated — the Bengali is left in place for you to translate.' : res.coverageWarning ?? null })
    offerUndo('New translation applied', snap)
  } catch (err) {
    if (!isLive(run)) return
    const msg = err instanceof Error ? err.message : 'Re-translation failed'
    status(null, msg)
    snack(msg, { tone: 'error' })
  } finally {
    if (isLive(run)) useDesk.setState({ busy: null })
  }
}

// ---------------------------------------------------------------- SEO and captions with AI (PC runAi / handleFixSeo / handleFixSocial)
const needKey = (role: string) => {
  snack(`No AI key for ${role}. Add one in Settings → AI.`, { action: { label: 'Settings', run: () => useNav.getState().openSettings('ai') }, ms: 7000 })
}
const deskName = () => CATEGORIES.find((c) => c.id === useStore.getState().doc.content.categoryId)?.name ?? 'Energy'

export async function aiWriteSeo() {
  const a = aiFor('seo', ed().ai)
  if (!a) return needKey('SEO')
  if (desk().busy) return
  const d = ed().draft
  if ((d.metaTitle.trim() || d.metaDescription.trim()) && !(await confirmAsk({ title: 'Replace the SEO fields?', body: 'The keyphrase, tags, SEO title, description and slug are replaced by the AI\'s suggestions. You can undo it.', confirm: 'Write with AI' }))) return
  const run = ++seq
  const snap = draftSnapshot()
  const who = providerMeta(a.provider).name
  useDesk.setState({ busy: 'seo' })
  const log = useJobLog.getState()
  const job = log.begin('seo', 'SEO', 'Choosing the model')
  try {
    const r = await aiSeo(a, { headline: d.headline, deck: d.deck, body: d.body }, (l) => { if (isLive(run)) { log.step(job, l); useDesk.setState({ status: l }) } })
    if (!isLive(run)) { log.finish(job, { by: who, error: 'Cancelled' }); return }
    const s = ed()
    s.setDraftField('focusKeyphrase', r.focusKeyphrase)
    s.setDraftField('focusKeywords', r.focusKeywords)
    s.setDraftField('metaTitle', r.metaTitle)
    s.setDraftField('metaDescription', r.metaDescription)
    s.setDraftField('slug', r.slug)
    log.finish(job, { by: `${who} · ${r.model}` })
    offerUndo(`SEO written by ${who}`, snap)
  } catch (e) {
    log.finish(job, { by: who, error: (e as Error).message })
    if (isLive(run)) snack(`${who} could not finish: ${(e as Error).message}`, { tone: 'error' })
  } finally {
    if (isLive(run)) useDesk.setState({ busy: null, status: null })
  }
}

export async function aiWriteCaptions() {
  const a = aiFor('social', ed().ai)
  if (!a) return needKey('Social')
  if (desk().busy) return
  const d = ed().draft
  if (Object.values(d.social).some((t) => t.trim()) && !(await confirmAsk({ title: 'Replace all four captions?', body: 'Facebook, X, LinkedIn and Telegram captions are rewritten from the story. You can undo it.', confirm: 'Write with AI' }))) return
  const run = ++seq
  const snap = draftSnapshot()
  const who = providerMeta(a.provider).name
  useDesk.setState({ busy: 'social' })
  const log = useJobLog.getState()
  const job = log.begin('social', 'Social captions', 'Choosing the model')
  try {
    const r = await aiCaptions(a, { headline: d.headline, deck: d.deck, body: d.body, slug: d.slug, desk: deskName() }, (l) => { if (isLive(run)) { log.step(job, l); useDesk.setState({ status: l }) } })
    if (!isLive(run)) { log.finish(job, { by: who, error: 'Cancelled' }); return }
    for (const k of ['facebook', 'x', 'linkedin', 'telegram'] as const) ed().setSocialCaption(k, r[k])
    log.finish(job, { by: `${who} · ${r.model}` })
    offerUndo(`Captions written by ${who}`, snap)
  } catch (e) {
    log.finish(job, { by: who, error: (e as Error).message })
    if (isLive(run)) snack(`${who} could not finish: ${(e as Error).message}`, { tone: 'error' })
  } finally {
    if (isLive(run)) useDesk.setState({ busy: null, status: null })
  }
}

export async function aiFixSeo(hasImage: boolean) {
  const a = aiFor('seo', ed().ai)
  if (!a) return needKey('SEO')
  if (desk().busy) return
  const run = ++seq
  const d = ed().draft
  const snap = draftSnapshot()
  const before: SeoDraft = { headline: d.headline, deck: d.deck, body: d.body, slug: d.slug, metaTitle: d.metaTitle, metaDescription: d.metaDescription, focusKeyphrase: d.focusKeyphrase, focusKeywords: d.focusKeywords, imageAlt: d.imageAlt }
  const who = providerMeta(a.provider).name
  useDesk.setState({ busy: 'fixSeo', seoFixNote: null })
  const log = useJobLog.getState()
  const job = log.begin('seo', 'Fixing SEO', 'Choosing the model')
  try {
    const out = await fixSeoWithAi(a, before, { hasImage, publishedTitles: ed().liveArticles.filter((x) => x.slug !== d.slug).map((x) => x.title) }, (l) => { if (isLive(run)) { log.step(job, l); useDesk.setState({ status: l }) } })
    if (!isLive(run)) { log.finish(job, { by: who, error: 'Cancelled' }); return }
    for (const k of ['body', 'slug', 'metaTitle', 'metaDescription', 'focusKeyphrase', 'focusKeywords', 'imageAlt'] as const) ed().setDraftField(k, out.draft[k])
    log.finish(job, { by: `${who} · ${out.model}` })
    const left = out.remaining.map((c) => c.label)
    useDesk.setState({ seoFixNote: `${out.before} → ${out.after} of ${out.total} pass${out.bodyChanged ? ' · the story was reworded for structure (facts untouched)' : ''}${out.bodySkipped ? ' · a rewrite that changed facts was refused' : ''}${left.length ? ` · still open: ${left.join(', ')}${out.remaining.some((c) => c.fix === 'photo') ? ' (add a photo)' : ''}${out.remaining.some((c) => c.fix === 'reporting') ? ' (the story needs more reporting)' : ''}` : ''}` })
    offerUndo(`SEO ${out.after}/${out.total}`, snap)
  } catch (e) {
    log.finish(job, { by: who, error: (e as Error).message })
    if (isLive(run)) snack(`${who} could not finish: ${(e as Error).message}`, { tone: 'error' })
  } finally {
    if (isLive(run)) useDesk.setState({ busy: null, status: null })
  }
}

export async function aiFixSocial() {
  const a = aiFor('social', ed().ai)
  if (!a) return needKey('Social')
  if (desk().busy) return
  const d = ed().draft
  const problems = socialFixList(analyzeSocial(d.social, d.slug))
  if (!problems.length) return
  const run = ++seq
  const snap = draftSnapshot()
  const who = providerMeta(a.provider).name
  useDesk.setState({ busy: 'fixSocial' })
  const log = useJobLog.getState()
  const job = log.begin('social', 'Fixing captions', 'Choosing the model')
  try {
    const r = await aiCaptions(a, { headline: d.headline, deck: d.deck, body: d.body, slug: d.slug, desk: deskName() }, (l) => { if (isLive(run)) { log.step(job, l); useDesk.setState({ status: l }) } }, { current: d.social, problems })
    if (!isLive(run)) { log.finish(job, { by: who, error: 'Cancelled' }); return }
    for (const k of ['facebook', 'x', 'linkedin', 'telegram'] as const) ed().setSocialCaption(k, r[k])
    log.finish(job, { by: `${who} · ${r.model}` })
    const after = analyzeSocial(ed().draft.social, d.slug)
    offerUndo(`Captions: ${after.filter((c) => c.status === 'good').length} of ${after.length} checks pass`, snap)
  } catch (e) {
    log.finish(job, { by: who, error: (e as Error).message })
    if (isLive(run)) snack(`${who} could not finish: ${(e as Error).message}`, { tone: 'error' })
  } finally {
    if (isLive(run)) useDesk.setState({ busy: null, status: null })
  }
}

// ---------------------------------------------------------------- stories
export function openStory(id: string) {
  if (desk().busy === 'fetch' || desk().busy === 'open') { snack('Wait for the import to finish first'); return }
  useStoryQueue.getState().switchTo(id)
  useDesk.setState({ view: 'story', tab: 'story', notice: null, undo: null, seoFixNote: null, error: null, bodyMode: 'edit' })
}

export function newStory(to: View = 'story') {
  if (desk().busy === 'fetch' || desk().busy === 'open') { snack('Wait for the import to finish first'); return }
  useStoryQueue.getState().newStory()
  if (ed().bannerLink) useStore.getState().newBanner(true)
  useDesk.setState({ view: to, tab: 'story', intakeTab: 'link', url: '', raw: '', doc: null, notice: null, undo: null, seoFixNote: null, error: null, bodyMode: 'edit' })
}

/** Open an article that is live on esbpowerline.com for editing; Publish then updates it (never a duplicate). */
export async function editLive(art: LiveArticleSummary) {
  if (desk().busy) return
  useDesk.setState({ busy: 'open' })
  try {
    const r = await openArticleForEdit(art)
    if (ed().bannerLink) ed().applyDraftToBanner()
    useDesk.setState({ view: 'story', tab: 'story', notice: null, undo: null, error: null })
    snack(r.exact ? 'Opened for editing — Publish will update this article' : 'Opened from the public page (sign in to load the full record) — Publish will update this article', { ms: 6000 })
  } catch (e) {
    snack(`Could not open it: ${(e as Error).message}`, { tone: 'error' })
  } finally {
    useDesk.setState({ busy: null })
  }
}

/** Clipboard text: the bridge first (the phone shim), then the web clipboard. Empty when neither answers. */
export async function readClipboardText(): Promise<string> {
  try {
    const esb = (window as unknown as { esb?: { readClipboard?: () => Promise<string> | string } }).esb
    if (esb?.readClipboard) { const t = await esb.readClipboard(); if (typeof t === 'string' && t) return t }
  } catch { /* fall through */ }
  try { if (navigator.clipboard?.readText) return (await navigator.clipboard.readText()) || '' } catch { /* blocked */ }
  return ''
}
