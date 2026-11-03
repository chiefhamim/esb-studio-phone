// One story, one banner: the phone keeps each story's whole Graphics project (all formats, layers, photos) beside its
// queue entry, so a banner survives the app being killed and comes back with its story. The project is the PC's own
// .esb format (serializeProject / applyProject); it lives in IndexedDB under graphics:<storyId>.
// (The PC itself starts every launch with a clean banner; on a phone the OS kills apps, so the phone restores it.)
import { normalizeDoc, useStore } from '../../pc/store'
import { defaultDoc } from '../../pc/core/templates'
import { applyProject, serializeProject } from '../../pc/project'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { matchCategoryNameToId, useEditorialStore } from '../../pc/editorial/editorialStore'
import { kvDelete, kvGet, kvSet } from '../../platform/kv'
import { readStoryMeta } from './migrateDrafts'

export const SCRATCH = '_scratch'
const keyFor = (storyId: string | null) => `graphics:${storyId ?? SCRATCH}`

let current: string | null = null
let loading = false
let timer: ReturnType<typeof setTimeout> | undefined
let lastSaved: { id: string | null; doc: unknown; images: unknown } | null = null
let saving: Promise<void> = Promise.resolve()

async function saveNow(id: string | null) {
  const st = useStore.getState()
  if (lastSaved && lastSaved.id === id && lastSaved.doc === st.doc && lastSaved.images === st.images) return
  const text = await serializeProject()
  await kvSet(keyFor(id), text)
  lastSaved = { id, doc: st.doc, images: st.images }
}

function scheduleSave() {
  if (loading) return
  clearTimeout(timer)
  const id = current
  timer = setTimeout(() => { saving = saving.then(() => saveNow(id)).catch((e) => { window.dispatchEvent(new CustomEvent('esb-storage-error', { detail: String(e) })) }) }, 1200)
}

/** Save the banner on screen now (app going to the background, switching stories). */
export async function flushGraphics(): Promise<void> {
  clearTimeout(timer)
  saving = saving.then(() => saveNow(current)).catch(() => undefined)
  await saving
}

function resetBanner(storyId: string | null) {
  // normalizeDoc fits the photo slots, as the PC's own initialDoc does (a bare defaultDoc has none)
  const doc = normalizeDoc(defaultDoc(), true)
  const meta = storyId ? readStoryMeta(storyId) : {}
  if (meta.categoryName) doc.content.categoryId = matchCategoryNameToId(meta.categoryName)
  useStore.setState({ images: [] })
  useStore.getState().loadDoc(doc)
}

/** Loading or resetting a banner is not an edit: the PC banner link (Graphics -> Editorial) must not copy the
 *  template's placeholder headline, or an old project's text, into the story on the desk while it happens. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const ed = useEditorialStore.getState()
  const link = ed.bannerLink
  if (link) useEditorialStore.setState({ bannerLink: false })
  try { return await fn() } finally { if (link) useEditorialStore.setState({ bannerLink: true }) }
}

async function load(storyId: string | null) {
  loading = true
  try { await quietly(() => loadInner(storyId)) } finally { loading = false }
  // after the load, the story leads: a linked banner takes the story's headline (never the other way round)
  const ed = useEditorialStore.getState()
  if (storyId && ed.bannerLink && ed.draft.headline.trim() && useStore.getState().doc.content.headline !== ed.draft.headline) ed.applyDraftToBanner()
}

async function loadInner(storyId: string | null) {
  {
    const text = await kvGet(keyFor(storyId))
    if (text) {
      try { await applyProject(text, null, null) } catch { resetBanner(storyId) }
    } else {
      resetBanner(storyId)
    }
    const st = useStore.getState()
    lastSaved = { id: storyId, doc: st.doc, images: st.images }
  }
}

/** Start following the story queue. Returns once the active story's banner is on screen. */
export async function startStoryGraphics(): Promise<void> {
  // The banner template's placeholder ("Your headline goes here…") is never a story headline: any path that resets the
  // banner (New banner, a story switch) and lets the banner link copy it across is undone at once, before the queue's
  // autosave (500 ms) could turn it into a story.
  const PLACEHOLDER = defaultDoc().content.headline
  useEditorialStore.subscribe((s, p) => {
    if (s.draft.headline === PLACEHOLDER && p.draft.headline !== PLACEHOLDER) useEditorialStore.getState().setDraftField('headline', p.draft.headline)
  })
  current = useStoryQueue.getState().activeId
  await load(current)
  useStore.subscribe((s, p) => { if (s.doc !== p.doc || s.images !== p.images) scheduleSave() })
  useStoryQueue.subscribe((s, p) => {
    if (s.activeId === p.activeId) return
    const prev = current
    // a brand-new story created from the scratch banner keeps that banner (the editor started with a graphic)
    if (prev === null && s.activeId && !p.stories.some((x) => x.id === s.activeId)) {
      current = s.activeId
      clearTimeout(timer)
      saving = saving.then(() => saveNow(current)).then(() => kvDelete(keyFor(null))).catch(() => undefined)
      return
    }
    clearTimeout(timer)
    saving = saving.then(() => saveNow(prev)).catch(() => undefined)
    current = s.activeId
    void saving.then(() => load(current))
  })
  useStoryQueue.subscribe((s, p) => {
    for (const gone of p.stories) if (!s.stories.some((x) => x.id === gone.id)) void kvDelete(keyFor(gone.id))
  })
  const flush = () => { void flushGraphics() }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  window.addEventListener('pagehide', flush)
}
