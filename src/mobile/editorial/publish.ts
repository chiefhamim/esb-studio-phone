// Publish / update / save draft on esbpowerline.com — the PC desk's handleLivePublishToCms (chiefhamim/esb-banner-studio,
// src/editorial/EditorialWorkspace.tsx) on the phone. Same order and the same honesty: one timed `publish` job with real
// steps, the site's answer as the result, a linked story UPDATES its article (never a second row with the same slug).
// On the phone, banner and inline picture upload and the site's page refresh go through window.esb (src/platform/
// esbShim.ts), which answers "Planned: needs the site update" until that route is deployed: the result says so.
// Nothing here runs without the publish sheet's second tap (tapGate.ts); this module itself never decides to publish.
import { create } from 'zustand'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { bodyForPublish } from '../../pc/editorial/richBody'
import { buildCmsArticlePayload, ensureFreshSession, findArticle, insertArticleToSupabase, sessionRefusedBySite, siteFetch } from '../../pc/editorial/siteApi'
import type { CmsArticlePayload } from '../../pc/editorial/siteApi'
import { canUploadToSite, refreshSite, uploadBannerToSite } from '../../pc/editorial/siteConnect'
import { useJobLog } from '../../pc/editorial/jobLog'
import { effectiveQuality, usePublishImage } from '../../pc/editorial/publishImage'
import { commentOnPost, getFacebook, postBannerToFacebook } from '../../pc/editorial/facebook'
import { sanitizeFacebook } from '../../pc/editorial/facebookCaption'
import { renderBanner } from '../../pc/export'
import { keepBanners, keepOn } from './pictureKeep'
import { loadBaseAssets } from '../../pc/core/assets'
import type { Assets } from '../../pc/core/render'
import { useStore } from '../../pc/store'
import { CATEGORIES } from '../../pc/core/tokens'
import type { HeroMode } from '../../pc/editorial/heroMode'
import { syncPublished } from './publishedLive'
import { rememberFbPost } from './fbLookup'

export interface PublishOutcome { ok: boolean; msg: string; url?: string; fbUrl?: string; existingSlug?: string }

interface PubState {
  busy: boolean
  result: PublishOutcome | null
  jobId: number | null
  /** The last publish of each story, by queue id (shown on the publish sheet). */
  last: Record<string, { ok: boolean; at: number; text: string }>
  set: (p: Partial<PubState>) => void
}
export const usePublish = create<PubState>((set) => ({ busy: false, result: null, jobId: null, last: {}, set: (p) => set(p) }))

// ---------------------------------------------------------------- the banner renderer's base assets (once)
let baseP: Promise<Assets | null> | null = null
export const baseAssets = () => (baseP ??= loadBaseAssets().catch(() => null))

/** The story's lead photo as the banner uses it (a URL the site can only use when it is https). */
export function leadPhotoUrl(): string | null {
  const st = useStore.getState()
  const src = st.doc.photos.slots[st.format]?.[0]?.src ?? null
  return (src && st.images.find((i) => i.id === src)?.url) || null
}

/** The story on the desk is linked to an article on the site (published from here, or opened for editing). */
export function linkedArticle(): { slug: string; url?: string } | null {
  const q = useStoryQueue.getState()
  const s = q.stories.find((x) => x.id === q.activeId)
  const slug = s?.publishedSlug ?? s?.publishedUrl?.match(/\/articles\/([^/?#]+)/)?.[1] ?? null
  return slug ? { slug, url: s?.publishedUrl } : null
}

export function cmsPayload(status: 'PUBLISHED' | 'DRAFT', imageUrl?: string): CmsArticlePayload {
  const { draft, staffSession } = useEditorialStore.getState()
  const cat = CATEGORIES.find((c) => c.id === useStore.getState().doc.content.categoryId) ?? CATEGORIES[0]
  return buildCmsArticlePayload({
    headline: draft.headline, deck: draft.deck, body: draft.body, bodyHtml: bodyForPublish(draft), slug: draft.slug, category: cat.name,
    focusKeywords: draft.focusKeywords, focusKeyphrase: draft.focusKeyphrase, metaTitle: draft.metaTitle, metaDescription: draft.metaDescription,
    byline: staffSession?.name || draft.byline, postAsNewsDesk: draft.postAsNewsDesk, credit: draft.credit, imageAlt: draft.imageAlt,
    imageCaption: draft.imageCaption, imageUrl, status,
  })
}

/** Publish (or update, or save as a draft). Call only after the editor's explicit confirmation. */
export async function runPublish(opts: { status: 'PUBLISHED' | 'DRAFT'; heroMode: HeroMode; fbOn: boolean; fbLink: boolean }): Promise<void> {
  const P = usePublish.getState()
  if (P.busy) return
  const linked = linkedArticle()
  const storyId = useStoryQueue.getState().activeId ?? ''
  const jl = useJobLog.getState()
  const jobId = jl.begin('publish', linked ? 'Updating article' : opts.status === 'DRAFT' ? 'Saving draft' : 'Publishing', 'Checking the sign-in')
  usePublish.setState({ busy: true, result: null, jobId })
  let jobError: string | undefined
  let jobBy = 'esbpowerline.com'
  const ed = useEditorialStore.getState()
  const draft = ed.draft
  const finish = (r: PublishOutcome, lastText: string) => {
    usePublish.setState((s) => ({ result: r, last: { ...s.last, [storyId]: { ok: r.ok, at: Date.now(), text: lastText } } }))
    // a story that went live shows in Published straight away (read from the database, not the lagging feed)
    if (r.ok && opts.status === 'PUBLISHED') void syncPublished()
  }
  try {
    const fresh = await ensureFreshSession(ed.staffSession)
    if (!fresh) {
      jobError = 'Not signed in to esbpowerline.com. Nothing was sent. Sign in under Settings → Site, then publish.'
      finish({ ok: false, msg: jobError }, 'Not sent — not signed in')
      return
    }
    const refused = await sessionRefusedBySite(fresh)
    if (refused) {
      jobError = `The site ended your sign-in (HTTP ${refused}). Nothing was published. Sign in again, then publish.`
      useEditorialStore.getState().logoutStaff()
      finish({ ok: false, msg: jobError }, 'Not sent — sign-in ended')
      return
    }

    const base = await baseAssets()
    let imageUrl = leadPhotoUrl() || undefined
    let imageNote = ''
    let uploadError = ''
    let webBlob: Blob | null = null
    let fbBlob: Blob | null = null
    if (opts.heroMode === 'banner' && base && canUploadToSite()) {
      jl.step(jobId, 'Rendering the web banner')
      const wo = usePublishImage.getState().opts.web
      const blob = await renderBanner(useStore.getState().doc, 'web', base, wo.scale, wo.type, effectiveQuality(wo)).catch(() => null)
      webBlob = blob
      jl.step(jobId, 'Uploading the banner to the media library')
      let up = blob ? await uploadBannerToSite(fresh, blob, draft.slug) : { ok: false as const, error: 'The banner could not be rendered.' }
      if (!up.ok && blob && !/over 4 MB|sign in|Planned/i.test(up.error ?? '')) {
        jl.step(jobId, 'Uploading the banner again')
        up = await uploadBannerToSite(fresh, blob, draft.slug)
      }
      if (up.ok) { imageUrl = up.url; imageNote = ' Image: the Web banner, uploaded to the media library.' }
      else { uploadError = up.error ?? 'unknown error'; imageNote = ` Banner not uploaded (${uploadError}) — the original photo link was used instead.` }
    }
    if (imageUrl && !/^https:\/\//.test(imageUrl)) {
      imageUrl = undefined
      imageNote = uploadError
        ? ` The banner was not uploaded (${uploadError}) and the photo is a file on this phone the site cannot reach, so no image was attached — add one in the CMS.`
        : ' The photo is a file on this phone the site cannot reach, so no image was attached — add one in the CMS.'
    }

    const payload = cmsPayload(opts.status, imageUrl)
    const q = useStoryQueue.getState()
    const cur = q.stories.find((x) => x.id === q.activeId)
    let updateId = cur?.publishedId
    const lookup = cur?.publishedSlug ?? cur?.publishedUrl?.match(/\/articles\/([^/?#]+)/)?.[1]
    if (!updateId && lookup) {
      updateId = (await findArticle({ slug: lookup }, fresh))?.id
      if (!updateId) {
        jobError = `The linked article "${lookup}" was not found on the site (it may have been deleted, or this account cannot read it). Nothing was sent. Open the story fresh, or change the slug to publish a new article.`
        finish({ ok: false, msg: jobError }, 'Not sent — linked article not found')
        return
      }
    }
    jl.step(jobId, updateId ? 'Updating the article on esbpowerline.com' : opts.status === 'DRAFT' ? 'Saving the draft to esbpowerline.com' : 'Publishing the article to esbpowerline.com')
    const result = await insertArticleToSupabase(payload, fresh, { updateId })

    if (!result.success) {
      const taken = /already exists/i.test(result.error ?? '')
      const existing = taken && !updateId ? await findArticle({ slug: payload.slug }, fresh) : null
      jobError = result.error || 'The article could not be saved to esbpowerline.com.'
      finish({ ok: false, msg: jobError, existingSlug: existing?.slug }, 'Not saved — ' + jobError)
      return
    }

    const did = result.updated ? 'Updated' : opts.status === 'PUBLISHED' ? 'Published' : 'Saved as draft'
    if (opts.status === 'PUBLISHED') {
      jl.step(jobId, 'Refreshing the website pages')
      const rf = await refreshSite(fresh, [result.slug ?? draft.slug])
      imageNote += ` ${rf.note}`
    }
    let fbNote = ''
    let fbUrl: string | undefined
    if (opts.status === 'PUBLISHED' && result.liveUrl) {
      jl.step(jobId, 'Checking the article is live on the site')
      let live = false
      for (let i = 0; i < 4 && !live; i++) { live = (await siteFetch(`${result.liveUrl}?_=${Date.now()}`, 6000)).ok; if (!live) await new Promise((r) => setTimeout(r, 1500)) }
      imageNote += live ? ' The page is live.' : ' Saved, but the public page did not answer yet — it can take a minute to appear.'
    }
    const fb = getFacebook()
    if (opts.status === 'PUBLISHED' && opts.fbOn && fb && base) {
      jl.step(jobId, 'Rendering the Facebook banner')
      const fo = usePublishImage.getState().opts.fb
      const photo = await renderBanner(useStore.getState().doc, 'fb45', base, fo.scale, fo.type, effectiveQuality(fo)).catch(() => null)
      fbBlob = photo
      const link = result.liveUrl ?? ''
      const caption = sanitizeFacebook(draft.social.facebook, draft.headline).trim() || draft.headline
      jl.step(jobId, 'Posting to Facebook')
      const post = photo ? await postBannerToFacebook(fb, photo, caption) : { ok: false as const, error: 'The banner could not be rendered.' }
      fbNote = post.ok ? ` Posted to Facebook (${fb.pageName || 'your Page'}).` : ` Facebook post failed: ${post.error}`
      if (post.ok) {
        jobBy += ' + Facebook'
        fbUrl = post.url
        rememberFbPost(result.slug ?? draft.slug, { url: post.url, when: new Date().toISOString() }) // so Published can open it later
        if (link && !opts.fbLink) fbNote += ' The article link was not added (that option is off).'
        if (link && opts.fbLink) {
          jl.step(jobId, 'Adding the article link as a comment')
          const c = await commentOnPost(fb, post.postId, `Full story: ${link}`)
          fbNote += c.ok ? ' Link added as the first comment — pin it on Facebook.' : ` The link comment failed: ${c.error}`
          if (!c.ok) jobError = `Posted to Facebook, but the link comment failed: ${c.error}`
        }
      } else jobError = `The site was saved, but Facebook failed: ${post.error}`
    } else if (opts.status === 'PUBLISHED') {
      fbNote = fb ? ' Facebook: not posted (the Facebook switch was off).' : ' Facebook: not connected.'
    }
    if (opts.status === 'PUBLISHED' && keepOn()) {
      jl.step(jobId, 'Saving the banners to this phone')
      fbNote += ' ' + (await keepBanners(base, draft.slug, { web: webBlob, fb: fbBlob }))
    }
    finish({ ok: !jobError, msg: `${did} on esbpowerline.com.` + imageNote + fbNote, url: result.liveUrl, fbUrl },
      `${did} on the site` + (fbNote.includes('Posted') ? ' · posted to Facebook' : fbNote.includes('failed') ? ' · Facebook failed' : fbNote.includes('not') ? ' · not on Facebook' : ''))
    if (opts.status === 'PUBLISHED' && result.liveUrl) {
      // the quote library (and anything else listening) harvests a story when it is published, as on the PC
      window.dispatchEvent(new CustomEvent('esb:story-published', { detail: { storyId, slug: result.slug ?? draft.slug, url: result.liveUrl, headline: draft.headline, categoryId: useStore.getState().doc.content.categoryId, updated: !!result.updated } }))
    }
    if (opts.status === 'PUBLISHED') useStoryQueue.getState().markPublished({ url: result.liveUrl, id: result.articleId, slug: result.slug })
    else if (result.updated) useStoryQueue.getState().linkArticle({ url: result.liveUrl, id: result.articleId, slug: result.slug ?? draft.slug })
    useEditorialStore.getState().syncFromLiveFeed().catch(() => {})
  } catch (err) {
    jobError = (err as Error)?.message || 'Publish error'
    finish({ ok: false, msg: jobError }, 'Not saved — ' + jobError)
  } finally {
    useJobLog.getState().finish(jobId, { by: jobBy, error: jobError })
    usePublish.setState({ busy: false })
  }
}
