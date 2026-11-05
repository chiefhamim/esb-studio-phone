// Review & publish (full screen), built on the PC publish flow (publish.ts) and the PC readiness list (readiness.ts):
// what this is (a new article or an update of the live one, never a duplicate), the checklist with a way to each fix,
// what the site can and cannot do from the phone yet (upload and page refresh are Planned until the site update), the
// website and Facebook banners, the Facebook switches, then live progress and the site's real answer.
// Publish / Update and any Facebook post need a second, separate tap (tapGate.ts). Save draft is not live: one tap.
import { useEffect, useRef, useState } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { BannerPreviews } from '../../pc/editorial/BannerPreviews'
import { ImageOptions } from '../../pc/editorial/ImageOptions'
import { useHeroMode } from '../../pc/editorial/heroMode'
import { getFacebook, useFacebookPrefs } from '../../pc/editorial/facebook'
import { useIgnoredChecks } from '../../pc/editorial/ignoredChecks'
import type { ReadyFix } from '../../pc/editorial/readiness'
import { useJobLog } from '../../pc/editorial/jobLog'
import { useStoryQueue } from '../../pc/editorial/storyQueue'
import { SITE_BASE_URL } from '../../pc/editorial/siteApi'
import { siteFeatureState } from '../../platform/esbShim'
import { platform } from '../../platform/platform'
import { PcHost } from '../PcHost'
import { Banner, Button, FullDialog, Icon, IconBtn, Planned, Sheet } from '../shell/ui'
import { snack, useOnline, useUi, useUnsavedGuard } from '../shell/core'
import { useNav } from '../shell/nav'
import { useDesk } from './deskStore'
import { Steps } from './JobProgress'
import { FlowTrack, StepSub } from './Pipeline'
import { slideTo } from '../shell/slide'
import { cmsPayload, linkedArticle, runPublish, usePublish } from './publish'
import { useBase } from './StoryEditor'
import { FormatMark } from '../shell/cat'
import { detailOf, FIX_LABEL, useLeadPhoto, useReadiness, useStoryNumbers } from './useStory'
import { useTapGate } from './tapGate'
import { keepBanners, keepOn, setKeep } from './pictureKeep'

/** Take the editor to where an open item is fixed (the PC sidebar's fixReady). */
export function fixReady(fix: ReadyFix) {
  const ui = useUi.getState()
  ui.closeSheet()
  const go = (tab: 'story' | 'details' | 'seo', focus?: string) => {
    useDesk.setState({ view: 'story', tab, writing: false, ...(fix === 'facts' ? { bodyMode: 'verified' as const } : fix === 'body' || fix === 'bengali' ? { bodyMode: 'edit' as const } : {}) })
    if (focus) setTimeout(() => { const el = document.getElementById(focus); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.focus() }, 120)
  }
  if (fix === 'headline') go('story', 'me-headline')
  else if (fix === 'deck') go('story', 'me-deck')
  else if (fix === 'body' || fix === 'bengali' || fix === 'facts') go('story')
  else if (fix === 'seo') go('seo')
  else if (fix === 'photo') go('details', 'me-details-photo')
  else if (fix === 'tags') go('details', 'me-details-tags')
  else if (fix === 'sign-in') useNav.getState().openSettings('site')
  else if (fix === 'site') { void useEditorialStore.getState().checkConnection(); snack('Checking esbpowerline.com…') }
}

function Checklist({ compact }: { compact?: boolean }) {
  const { ready, t, storyId } = useReadiness()
  const ignore = useIgnoredChecks((s) => s.ignore)
  const restore = useIgnoredChecks((s) => s.restore)
  const [showPassed, setShowPassed] = useState(false)
  const rank = (g: string, s: string) => (g === 'Required' ? 0 : 2) + (s === 'bad' ? 0 : 1)
  const todo = t.open.slice().sort((a, b) => rank(a.group, a.status) - rank(b.group, b.status))
  return (
    <div className="me-stack">
      <p className={'me-readysum is-' + t.state}>
        <b>{t.state === 'blocked' ? `${t.blockers} required to fix` : t.state === 'review' ? `${t.warnings} to check — you can still publish` : 'Everything checks out'}</b>
        <span>{t.done} of {ready.total} checks done{t.ignored.length ? ` · ${t.ignored.length} ignored` : ''}</span>
      </p>
      {!compact && <p className="me-hint">Worked out from the draft itself. Required: headline ≤104, deck ≤200, at least 40 words, no Bengali left, the site reachable, signed in. Worth a look: figures vs the source, SEO, photo with alt text, three or more tags.</p>}
      <ul className="me-checks">
        {todo.map((c) => (
          <li key={c.id} className={'is-' + c.status}>
            <i className="me-checks-dot" aria-hidden />
            <div className="me-checks-t"><b>{c.label}{c.group === 'Required' && <em>Required</em>}</b><span>{detailOf(c)}</span></div>
            {c.fix && <Button kind="text" onClick={() => fixReady(c.fix!)}>{FIX_LABEL[c.fix]}</Button>}
            <IconBtn icon="eyeOff" label={`Ignore ${c.label} for this story`} onClick={() => ignore(storyId, [c.id])} />
          </li>
        ))}
      </ul>
      {t.ignored.length > 0 && (
        <div className="me-card">
          <div className="me-card-row"><b className="me-grow">Ignored ({t.ignored.length})</b><Button kind="text" onClick={() => restore(storyId)}>Restore all</Button></div>
          {t.ignored.map((c) => <p key={c.id} className="me-meta">{c.label} — {detailOf(c)}</p>)}
        </div>
      )}
      {t.passed.length > 0 && (
        <>
          <Button kind="text" icon={showPassed ? 'chevUp' : 'chevDown'} onClick={() => setShowPassed(!showPassed)}>{t.passed.length} check{t.passed.length === 1 ? '' : 's'} passed</Button>
          {showPassed && <ul className="me-checks">{t.passed.map((c) => <li key={c.id} className="is-ok"><i className="me-checks-dot" aria-hidden /><div className="me-checks-t"><b>{c.label}</b><span>{c.detail}</span></div></li>)}</ul>}
        </>
      )}
    </div>
  )
}

export function ReadinessSheet() {
  return <Sheet id="ed-ready" title="Before publication"><Checklist /></Sheet>
}

function capability(state: ReturnType<typeof siteFeatureState>, live: string, planned: string) {
  return state === 'live' ? <span className="me-cap is-ok"><Icon name="check" size={16} />{live}</span> : <span className="me-cap"><Planned>{planned}</Planned></span>
}

export function PublishReview() {
  const open = useUi((s) => s.sheet === 'ed-publish')
  // the two full banner previews are drawn once Publish has slid in (drawing them on open froze the slide for ~300 ms)
  const [landed, setLanded] = useState(false)
  useEffect(() => { if (!open) { setLanded(false); return } const t = window.setTimeout(() => setLanded(true), 440); return () => window.clearTimeout(t) }, [open])
  const draft = useEditorialStore((s) => s.draft)
  const staff = useEditorialStore((s) => s.staffSession)
  const site = useEditorialStore((s) => s.siteStatus)
  const slugStatus = useEditorialStore((s) => s.slugStatus)
  const storyId = useStoryQueue((s) => s.activeId) ?? ''
  const P = usePublish()
  const job = useJobLog((s) => (P.jobId != null ? s.jobs.find((j) => j.id === P.jobId) : undefined))
  const { words } = useStoryNumbers()
  const online = useOnline()
  const base = useBase()
  const photo = useLeadPhoto()
  const [hero, setHero] = useHeroMode()
  const fbLink = useFacebookPrefs((s) => s.linkComment)
  const setFbLink = useFacebookPrefs((s) => s.setLinkComment)
  const linked = linkedArticle()
  const [fb, setFb] = useState(() => getFacebook())
  const [which, setWhich] = useState<'web' | 'fb'>('web')
  const [fbOn, setFbOn] = useState(false)
  const [keep, setKeepState] = useState(keepOn)
  const [keeping, setKeeping] = useState(false)
  useEffect(() => {
    if (!open) return
    const f = getFacebook()
    setFb(f); setFbOn(!linked && !!f)
    // a publish still running (the sheet was closed and opened again) keeps its progress on screen
    if (!usePublish.getState().busy) usePublish.setState({ result: null, jobId: null })
    void useEditorialStore.getState().checkConnection()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  // Publishing runs at the foot of the page while its steps sit above: follow the run. Each new step scrolls into view, and the result does too.
  const progressRef = useRef<HTMLElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const stepCount = job?.steps.length ?? 0
  useEffect(() => {
    if (!open || !P.busy) return
    progressRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [open, P.busy, stepCount])
  useEffect(() => {
    if (open && P.result) setTimeout(() => resultRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
  }, [open, P.result])
  useUnsavedGuard(() => (P.busy ? 'A publish is still running. Leaving now may leave the article half-sent.' : null))

  const verb = linked ? 'Update' : 'Publish'
  const goLive = useTapGate(() => void runPublish({ status: 'PUBLISHED', heroMode: hero, fbOn: fbOn && !!fb, fbLink }))
  const updateInstead = useTapGate(() => {
    const slug = P.result?.existingSlug
    if (!slug) return
    useStoryQueue.getState().linkArticle({ slug, url: `${SITE_BASE_URL}/articles/${slug}` })
    void runPublish({ status: 'PUBLISHED', heroMode: hero, fbOn: false, fbLink })
  })
  const close = () => { if (P.busy) { snack('Publishing is still running — it continues if you close this'); } goLive.reset(); slideTo(-1, () => useUi.getState().closeSheet('ed-publish'), 'flow') }
  const blocked = P.busy || !draft.headline.trim() || !online
  const last = P.last[storyId]
  const willFb = fbOn && !!fb

  return (
    <FullDialog open={open} title={linked ? 'Update article' : 'Publish'} onClose={close} back sub={<StepSub />} under={<FlowTrack />}
      primary={<Button kind="text" disabled={blocked} onClick={() => void runPublish({ status: 'DRAFT', heroMode: hero, fbOn: false, fbLink })}>{linked ? 'Save as draft' : 'Save draft'}</Button>}
      footer={
        <Button wide kind={goLive.armed ? 'danger' : 'filled'} icon="upload" busy={P.busy} disabled={blocked} onClick={goLive.tap}>
          {P.busy ? (linked ? 'Updating' : 'Publishing') : goLive.armed ? 'Tap again to confirm' : <span className="me-pubbtn"><b>{verb}</b><small>{willFb ? 'Website and Facebook' : 'esbpowerline.com'}</small></span>}
        </Button>
      }>
      <div className="m-wrap me-stack me-pad">
        {goLive.armed && <Banner tone="warn">Second tap needed: this goes live on esbpowerline.com{willFb ? ` and posts to Facebook (${fb?.pageName || 'your Page'})` : ''}. Wait a few seconds to cancel.</Banner>}
        {!online && <Banner tone="error">You are offline. Nothing can be sent until the phone is online.</Banner>}
        <section className="me-card">
          <div className="me-card-row"><Icon name={linked ? 'refresh' : 'link'} size={18} /><b className="me-grow">{linked ? 'Live article — Publish updates it, no second copy' : 'New article'}</b></div>
          <p className="me-break me-meta">esbpowerline.com/articles/{linked?.slug ?? (draft.slug || 'not-set')}</p>
          {!linked && <div className="me-card-row">
            <span className="me-meta me-grow">Slug: {slugStatus === 'idle' ? 'not checked' : slugStatus}</span>
            <Button kind="text" disabled={!draft.slug || slugStatus === 'checking'} onClick={() => void useEditorialStore.getState().checkSlug(draft.slug)}>Check slug</Button>
          </div>}
          <Button kind="text" icon="copy" onClick={async () => snack((await platform().copyText(JSON.stringify(cmsPayload('PUBLISHED'), null, 2))) ? 'CMS JSON copied' : 'Could not copy')}>Copy CMS JSON</Button>
          <p className="me-meta">Headline {draft.headline.length}/104 · deck {draft.deck.length}/200 · {words} words · {staff ? `as ${staff.name || staff.email}` : 'not signed in'} · site {site.connected ? 'online' : 'not reachable'}</p>
        </section>

        <section>
          <h2 className="me-h2">Checklist</h2>
          <Checklist compact />
        </section>

        <section className="me-card">
          <h3 className="me-h3">From the phone</h3>
          <div className="me-caps">
            <span>Article text, SEO, tags</span><span className="me-cap is-ok"><Icon name="check" size={16} />Sent to the site</span>
            <span>Banner and story pictures</span>{capability(siteFeatureState('upload'), 'Uploaded', 'needs the site update; the original photo link is used')}
            <span>Refresh the site's pages</span>{capability(siteFeatureState('revalidate'), 'Refreshed', 'needs the site update; pages catch up within 15 min')}
          </div>
        </section>

        <div className="m-seg bp-switch" role="radiogroup" aria-label="Banner version" style={{ '--i': which === 'web' ? 0 : 1, '--n': 2 } as React.CSSProperties}>
          <button type="button" role="radio" aria-checked={which === 'web'} className={'m-seg-item' + (which === 'web' ? ' is-on' : '')} onClick={() => setWhich('web')}><FormatMark id="web" size={18} /><span>Website <b>16:9</b></span></button>
          <button type="button" role="radio" aria-checked={which === 'fb'} className={'m-seg-item' + (which === 'fb' ? ' is-on' : '')} onClick={() => setWhich('fb')}><FormatMark id="fb45" size={18} /><span>Facebook <b>4:5</b></span></button>
        </div>
        <div className="bp-which" data-which={which}>{!landed ? <div className="me-bp-hold" aria-hidden /> : <PcHost className="me-bp"><BannerPreviews base={base} heroMode={hero} onHeroMode={setHero} photoUrl={photo} caption={willFb || !fb ? draft.social.facebook : undefined} pageName={fb ? fb.pageName || fb.pageId : null} webExtra={<ImageOptions dest="web" base={base} />} fbExtra={<ImageOptions dest="fb" base={base} />} /></PcHost>}</div>

        <section className="me-card">
          <h3 className="me-h3">Keep a copy</h3>
          <label className="me-switchrow"><span><b>Save both banners to this phone</b><small>The exact website and Facebook files, saved to Pictures when you {verb.toLowerCase()}. Named after the story.</small></span><input type="checkbox" role="switch" checked={keep} onChange={(e) => { setKeepState(e.target.checked); setKeep(e.target.checked) }} /></label>
          <Button kind="tonal" icon="download" busy={keeping} disabled={keeping || !base} onClick={async () => { setKeeping(true); const note = await keepBanners(base, draft.slug); setKeeping(false); snack(note, { tone: /not saved/.test(note) ? 'error' : 'success', ms: 7000 }) }}>Save both now</Button>
        </section>

        <section className="me-card">
          <h3 className="me-h3">Facebook</h3>
          {fb ? (
            <>
              <label className="me-switchrow"><span><b>Post the banner when I {verb.toLowerCase()}</b><small>{fb.pageName || fb.pageId} · the 4:5 banner with the Facebook caption{linked ? ' · off by default for an update' : ''}</small></span><input type="checkbox" role="switch" checked={fbOn} onChange={(e) => setFbOn(e.target.checked)} /></label>
              <label className="me-switchrow"><span><b>Add the article link as the first comment</b><small>Pin it on Facebook afterwards (the API cannot pin).</small></span><input type="checkbox" role="switch" checked={fbLink} disabled={!fbOn} onChange={(e) => setFbLink(e.target.checked)} /></label>
            </>
          ) : <div className="me-card-row"><span className="me-meta me-grow">No Facebook Page connected.</span><Button kind="text" onClick={() => useNav.getState().openSettings('facebook')}>Connect</Button></div>}
        </section>

        {job && (
          <section className={'me-card me-progress' + (P.busy ? ' is-running' : '')} ref={progressRef} aria-live="polite">
            <h3 className="me-h3">{P.busy ? (linked ? 'Updating now' : 'Publishing now') : 'Progress'}</h3>
            <Steps job={job} />
          </section>
        )}
        {P.result && (
          <div ref={resultRef} className={'m-note ' + (P.result.ok ? 'm-note-success' : 'm-note-error')} role="status">
            <Icon name={P.result.ok ? 'check' : 'alert'} size={18} />
            <div className="m-note-text">
              <p>{P.result.msg}</p>
              <div className="me-err-actions">
                {P.result.url && <Button kind="text" icon="globe" onClick={() => void platform().openExternal(P.result!.url!)}>Open the article</Button>}
                {P.result.fbUrl && <Button kind="text" icon="externalLink" onClick={() => void platform().openExternal(P.result!.fbUrl!)}>Open the Facebook post</Button>}
                {P.result.existingSlug && <Button kind={updateInstead.armed ? 'danger' : 'text'} icon="refresh" onClick={updateInstead.tap}>{updateInstead.armed ? 'Tap again to update it' : 'Update that article instead'}</Button>}
                {!staff && <Button kind="text" onClick={() => useNav.getState().openSettings('site')}>Sign in</Button>}
              </div>
            </div>
          </div>
        )}
        {!P.result && last && <p className={'me-meta' + (last.ok ? '' : ' is-bad')}>Last time: {last.text}</p>}
      </div>
    </FullDialog>
  )
}
