// The story on the desk, one task per tab: Story (headline, deck, body with the PC editor and the Verified view) ·
// Details (category, tags, byline, featured image, banner) · SEO (the PC SeoPanel: 17 checks, Google preview, AI fixes) ·
// Social (four captions, 14 checks) · Preview (the site's article page and the two banners). From 840 dp the story sits
// beside a side column with the readiness list and a live phone preview. The bottom bar: readiness (explained on tap)
// and Publish / Update.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { useStoryQueue, STATUS_LABEL } from '../../pc/editorial/storyQueue'
import { CATEGORIES } from '../../pc/core/tokens'
import { suggestKeyphrases } from '../../pc/editorial/seo'
import { SeoPanel } from '../../pc/editorial/SeoPanel'
import { SocialChecks } from '../../pc/editorial/SocialCheckList'
import { analyzeSocial } from '../../pc/editorial/socialChecks'
import { articleUrl, xLength } from '../../pc/editorial/aiDesk'
import { aiFor, providerMeta } from '../../pc/editorial/aiProviders'
import { FeaturedImage } from '../../pc/editorial/FeaturedImage'
import { SitePreview, SITE_THEMES } from '../../pc/editorial/SitePreview'
import type { SiteDevice, SiteTheme } from '../../pc/editorial/SitePreview'
import { BannerPreviews } from '../../pc/editorial/BannerPreviews'
import { useBannerImage } from '../../pc/editorial/useBannerImage'
import { useHeroMode } from '../../pc/editorial/heroMode'
import type { HeroMode } from '../../pc/editorial/heroMode'
import { richOf } from '../../pc/editorial/richBody'
import { getFacebook } from '../../pc/editorial/facebook'
import { openSiteCms } from '../../pc/editorial/siteApi'
import type { Assets } from '../../pc/core/render'
import { platform } from '../../platform/platform'
import { PcHost } from '../PcHost'
import { Banner, Button, Icon, IconBtn, Planned, Segmented, TopBar } from '../shell/ui'
import type { MenuItem } from '../shell/ui'
import { confirmAsk, snack, useSizeClass, useUi } from '../shell/core'
import { useNav } from '../shell/nav'
import { aiFixSeo, aiFixSocial, aiWriteCaptions, aiWriteSeo, canCancel, cancelJob, newStory, retranslate, useDesk } from './deskStore'
import type { Tab } from './deskStore'
import { BodyEditor } from './BodyEditor'
import { JobProgress } from './JobProgress'
import { RichReview } from './RichReview'
import { parseParagraphWithFacts } from './factSpans'
import { baseAssets, cmsPayload, linkedArticle, usePublish } from './publish'
import { StatusChip } from './Landing'
import { useCategory, useFacts, useLeadPhoto, useReadiness, useStoryNumbers } from './useStory'

const TABS: { id: Tab; label: string }[] = [{ id: 'story', label: 'Story' }, { id: 'details', label: 'Details' }, { id: 'seo', label: 'SEO' }, { id: 'social', label: 'Social' }, { id: 'preview', label: 'Preview' }]

export function useBase(): Assets | null {
  const [b, setB] = useState<Assets | null>(null)
  useEffect(() => { let on = true; void baseAssets().then((x) => { if (on) setB(x) }); return () => { on = false } }, [])
  return b
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={'m-field-count' + (n > max ? ' is-over' : '')}>{n} / {max}{n > max ? ' · too long' : ''}</span>
}

// ---------------------------------------------------------------- Story
function Verified() {
  const draft = useEditorialStore((s) => s.draft)
  const source = useEditorialStore((s) => s.source)
  const { factTable, sourceAscii } = useFacts()
  const rich = richOf(draft)
  const mark = (t: string): ReactNode => parseParagraphWithFacts(t, factTable, sourceAscii).map((sp, i) => sp.isFact
    ? <button key={i} type="button" className={'me-fact ' + (sp.isVerified ? 'is-ok' : 'is-bad')} data-fact-digits={sp.text.replace(/[^0-9]/g, '')} onClick={() => snack(sp.tooltip ?? '')}>{sp.text}</button>
    : <span key={i}>{sp.text}</span>)
  if (!draft.body.trim()) return <p className="me-hint">The translated story appears here, with every figure checked against the source.</p>
  return (
    <div className="me-verified">
      {source ? <p className="me-legend"><i className="is-ok" />in the source <i className="is-bad" />not found in the source · tap a figure for details</p>
        : <Banner tone="info">This story has no source to check against, so figures are not marked.</Banner>}
      <PcHost touch={false} className="me-verified-doc">
        {rich ? <RichReview html={rich} text={mark} /> : <div className="rv article-body">{draft.body.split(/\n{2,}/).map((p, i) => <p key={i}>{mark(p)}</p>)}</div>}
      </PcHost>
    </div>
  )
}

function StoryTab() {
  const draft = useEditorialStore((s) => s.draft)
  const setField = useEditorialStore((s) => s.setDraftField)
  const provider = useEditorialStore((s) => s.translationProvider)
  const d = useDesk()
  const isAi = provider && provider !== 'neural' && provider !== 'offline'
  return (
    <div className="me-stack">
      {d.notice && <Banner tone="warn" action={<Button kind="text" onClick={() => d.set({ notice: null })}>Dismiss</Button>}>{d.notice}</Banner>}
      {d.undo && <Banner tone="info" action={<Button kind="text" onClick={d.undo.restore}>Undo</Button>}>{d.undo.label}. AI output is a draft: read it before publishing.</Banner>}
      {(d.busy === 'retranslate') && <JobProgress />}
      <div className="me-hide-writing me-stack">
        <div className="me-chiprow">
          <span className={'me-state' + (provider === 'offline' ? ' is-warn' : '')}>{isAi ? `${providerMeta(provider).name} draft` : provider === 'offline' ? 'Needs translation' : provider === 'neural' ? 'Machine draft' : 'Written by hand'}</span>
        </div>
        <label className="m-field" htmlFor="me-headline">
          <span className="m-field-label"><span>Headline</span><Counter n={draft.headline.length} max={104} /></span>
          <textarea id="me-headline" className="m-textarea me-headline" rows={2} placeholder="The English headline readers will see" value={draft.headline} onChange={(e) => setField('headline', e.target.value)} />
        </label>
        <label className="m-field" htmlFor="me-deck">
          <span className="m-field-label"><span>Deck / excerpt</span><Counter n={draft.deck.length} max={200} /></span>
          <textarea id="me-deck" className="m-textarea" rows={3} placeholder="One or two sentences that sum up the story" value={draft.deck} onChange={(e) => setField('deck', e.target.value)} />
        </label>
        <Segmented<'edit' | 'verified'> label="Story view" value={d.bodyMode} onChange={(v) => d.set({ bodyMode: v })} options={[{ value: 'edit', label: 'Write', icon: 'edit' }, { value: 'verified', label: 'Verified', icon: 'eye' }]} />
      </div>
      {d.bodyMode === 'edit' ? <BodyEditor /> : <Verified />}
    </div>
  )
}

// ---------------------------------------------------------------- Details
function DetailsTab() {
  const draft = useEditorialStore((s) => s.draft)
  const setField = useEditorialStore((s) => s.setDraftField)
  const staff = useEditorialStore((s) => s.staffSession)
  const deskAuto = useEditorialStore((s) => s.deskAuto)
  const bannerLink = useEditorialStore((s) => s.bannerLink)
  const cat = useCategory()
  const { tags } = useStoryNumbers()
  const [tagIn, setTagIn] = useState('')
  const setTags = (l: string[]) => setField('focusKeywords', l.join(', '))
  const addTag = (raw: string) => { const t = raw.trim().replace(/^#/, ''); if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]); setTagIn('') }
  return (
    <div className="me-stack">
      <section className="me-card" id="me-details-cat">
        <label className="m-field"><span className="m-field-label">Category</span>
          <select className="m-select" value={cat.id} onChange={(e) => useEditorialStore.getState().setDesk(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <Button kind="text" icon={deskAuto ? 'check' : 'sparkle'} onClick={() => { const id = useEditorialStore.getState().autoDetectDesk(); snack(`Category set to ${CATEGORIES.find((c) => c.id === id)?.name ?? id} from the story`) }}>{deskAuto ? 'Detected from the story' : 'Detect from the story'}</Button>
      </section>
      <section className="me-card" id="me-details-tags">
        <div className="m-field-label"><span>Tags</span><span className="m-field-count">{tags.length}</span></div>
        <div className="me-tags">
          {tags.map((t) => <span key={t} className="me-tag">#{t}<IconBtn icon="x" label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} /></span>)}
        </div>
        <div className="me-urlrow">
          <input className="m-input" value={tagIn} placeholder="Add a tag" enterKeyHint="done" onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) addTag(v.slice(0, -1)); else setTagIn(v) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagIn) } }} />
          <Button kind="tonal" disabled={!tagIn.trim()} onClick={() => addTag(tagIn)}>Add</Button>
        </div>
        <Button kind="text" icon="sparkle" onClick={() => setTags(suggestKeyphrases(draft.headline, draft.deck, draft.body, 6).map((k) => k.phrase))}>Auto-pick from the story</Button>
      </section>
      <section className="me-card">
        <label className="m-field"><span className="m-field-label">Byline</span><input className="m-input" value={draft.byline} placeholder={staff?.name || 'Reporter name'} onChange={(e) => setField('byline', e.target.value)} /></label>
        <label className="me-switchrow"><span><b>Post as ESB News Desk</b><small>Credited to the desk instead of the signed-in editor.</small></span><input type="checkbox" checked={!!draft.postAsNewsDesk} onChange={(e) => setField('postAsNewsDesk', e.target.checked)} /></label>
        <div className="me-switchrow is-planned"><span><b>Featured · Breaking · Trending</b><small>The PC desk always sends these off; the story draft has no field for them yet.</small></span><Planned /></div>
      </section>
      <section className="me-card" id="me-details-photo">
        <h3 className="me-h3">Featured image</h3>
        <p className="me-hint">The banner's photo slot: framing and tone here are the banner's own. Credit, alt text and caption go to the site.</p>
        <PcHost className="me-fi"><FeaturedImage onToast={(m) => snack(m)} /></PcHost>
      </section>
      <section className="me-card">
        <h3 className="me-h3">Banner</h3>
        <label className="me-switchrow"><span><b>Keep the banner in step</b><small>Headline, credit and caption follow this story both ways.</small></span><input type="checkbox" checked={bannerLink} onChange={(e) => useEditorialStore.getState().setBannerLink(e.target.checked)} /></label>
        <div className="me-start-row">
          <Button kind="tonal" icon="refresh" disabled={!draft.headline.trim()} onClick={() => { useEditorialStore.getState().applyDraftToBanner(); snack('Banner updated from the story') }}>Update banner</Button>
          <Button kind="tonal" icon="layers" onClick={() => useNav.getState().go('graphics')}>Open in Graphics</Button>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- SEO
function SeoTab() {
  const slugStatus = useEditorialStore((s) => s.slugStatus)
  const slug = useEditorialStore((s) => s.draft.slug)
  const ai = useEditorialStore((s) => s.ai)
  const d = useDesk()
  const photo = useLeadPhoto()
  const seoAi = aiFor('seo', ai)
  return (
    <div className="me-stack">
      {(d.busy === 'seo' || d.busy === 'fixSeo') && <JobProgress />}
      {d.undo && <Banner tone="info" action={<Button kind="text" onClick={d.undo.restore}>Undo</Button>}>{d.undo.label}</Banner>}
      <PcHost className="me-seo">
        <SeoPanel hasImage={!!photo} slugStatus={slugStatus} onCheckSlug={() => void useEditorialStore.getState().checkSlug(slug)}
          onAiSeo={() => void aiWriteSeo()} aiBusy={d.busy === 'seo'} aiProvider={seoAi?.provider ?? null}
          onFix={() => void aiFixSeo(!!photo)} fixBusy={d.busy === 'fixSeo'} onUndo={d.undo ? d.undo.restore : undefined} fixNote={d.seoFixNote} />
      </PcHost>
    </div>
  )
}

// ---------------------------------------------------------------- Social
type Net = 'facebook' | 'x' | 'linkedin' | 'telegram'
function SocialTab() {
  const draft = useEditorialStore((s) => s.draft)
  const setCap = useEditorialStore((s) => s.setSocialCaption)
  const ai = useEditorialStore((s) => s.ai)
  const d = useDesk()
  const [net, setNet] = useState<Net>('facebook')
  const socialAi = aiFor('social', ai)
  const url = articleUrl(draft.slug)
  const text = draft.social[net] || ''
  const checks = useMemo(() => analyzeSocial(draft.social, draft.slug), [draft.social, draft.slug])
  return (
    <div className="me-stack">
      {(d.busy === 'social' || d.busy === 'fixSocial') && <JobProgress />}
      {d.undo && <Banner tone="info" action={<Button kind="text" onClick={d.undo.restore}>Undo</Button>}>{d.undo.label}</Banner>}
      <div className="me-linkrow">
        <Icon name="link" size={18} /><span className="me-break me-grow">{url}</span>
        <IconBtn icon="copy" label="Copy the article link" onClick={async () => snack((await platform().copyText(url)) ? 'Article link copied' : 'Could not copy')} />
      </div>
      {!draft.slug.trim() && <Banner tone="warn">Set the slug under SEO first — every caption links to this address.</Banner>}
      <Segmented<Net> label="Channel" value={net} onChange={setNet} options={[{ value: 'facebook', label: 'Facebook' }, { value: 'x', label: 'X' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'telegram', label: 'Telegram' }]} />
      <label className="m-field" htmlFor="me-caption">
        <span className="m-field-label"><span>{net === 'facebook' ? 'Facebook caption' : net === 'x' ? 'X post' : net === 'linkedin' ? 'LinkedIn post' : 'Telegram post'}</span>
          {net === 'x' ? <Counter n={xLength(text)} max={280} /> : <span className="m-field-count">{text.length} characters</span>}</span>
        <textarea id="me-caption" className="m-textarea" rows={7} value={text} onChange={(e) => setCap(net, e.target.value)} />
        {net === 'facebook' && <span className="m-field-help">No link here: the article link is posted as the first comment.</span>}
      </label>
      <div className="me-btnrow">
        <Button kind="tonal" icon="sparkle" busy={d.busy === 'social'} disabled={!!d.busy || !draft.headline.trim()} onClick={() => void aiWriteCaptions()}>{socialAi ? 'Write all with AI' : 'Write with AI'}</Button>
        {net !== 'facebook' && draft.slug.trim() && !text.includes(url) && <Button kind="outlined" icon="link" onClick={() => setCap(net, `${text.trim()}\n\n${url}`.trim())}>Add link</Button>}
        <Button kind="outlined" icon="copy" onClick={async () => snack((await platform().copyText(text)) ? 'Caption copied' : 'Could not copy')}>Copy</Button>
        <Button kind="outlined" icon="send" disabled={!text.trim()} onClick={() => void platform().shareText(text, 'Caption')}>Share</Button>
      </div>
      <PcHost className="me-social">
        <SocialChecks checks={checks} active={net} onFix={() => void aiFixSocial()} busy={d.busy === 'fixSocial'} onUndo={d.undo ? d.undo.restore : undefined} />
      </PcHost>
    </div>
  )
}

// ---------------------------------------------------------------- Preview
function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [w, setW] = useState(360)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w]
}

export function SitePreviewBox({ device, theme, hero, base }: { device: SiteDevice; theme: SiteTheme; hero: HeroMode; base: Assets | null }) {
  const draft = useEditorialStore((s) => s.draft)
  const staff = useEditorialStore((s) => s.staffSession)
  const live = useEditorialStore((s) => s.liveArticles)
  const cat = useCategory()
  const photo = useLeadPhoto()
  const { readTime, tags } = useStoryNumbers()
  const web = useBannerImage(hero === 'banner' ? base : null, 'web')
  const [ref, w] = useWidth()
  const [date] = useState(() => new Date())
  const related = useMemo(() => live.filter((a) => a.category === cat.name && a.slug !== draft.slug).slice(0, 4).map((a) => ({ slug: a.slug, title: a.title, excerpt: a.description, category: a.category, imageUrl: a.imageUrl, date: a.publishedAt })), [live, cat.name, draft.slug])
  return (
    <div ref={ref} className="me-sitebox">
      <PcHost touch={false}>
        <SitePreview theme={theme} device={device} availableWidth={Math.max(260, w)} title={draft.headline} excerpt={draft.deck} slug={draft.slug} category={cat.name}
          author={draft.postAsNewsDesk ? 'ESB News Desk' : staff?.name || draft.byline || 'ESB Power Line'} date={date} readTime={readTime}
          heroUrl={hero === 'banner' ? web : photo} heroCredit={draft.credit} paragraphs={draft.body.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)}
          bodyHtml={richOf(draft)} tags={tags} related={related} />
      </PcHost>
    </div>
  )
}

function PreviewTab() {
  const [what, setWhat] = useState<'site' | 'banners'>('site')
  const [device, setDevice] = useState<SiteDevice>('mobile')
  const [theme, setTheme] = useState<SiteTheme>('white')
  const [hero, setHero] = useHeroMode()
  const base = useBase()
  const photo = useLeadPhoto()
  const fbCaption = useEditorialStore((s) => s.draft.social.facebook)
  const slug = useEditorialStore((s) => s.draft.slug)
  const fb = getFacebook()
  return (
    <div className="me-stack">
      <Segmented<'site' | 'banners'> label="Preview" value={what} onChange={setWhat} options={[{ value: 'site', label: 'Website' }, { value: 'banners', label: 'Banners' }]} />
      {what === 'site' ? (
        <>
          <Segmented<SiteDevice> label="Device" value={device} onChange={setDevice} options={[{ value: 'mobile', label: 'Phone' }, { value: 'tablet', label: 'Tablet' }, { value: 'desktop', label: 'Desktop' }]} />
          <div className="me-two">
            <label className="m-field"><span className="m-field-label">Site theme</span><select className="m-select" value={theme} onChange={(e) => setTheme(e.target.value as SiteTheme)}>{SITE_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="m-field"><span className="m-field-label">Hero</span><select className="m-select" value={hero} onChange={(e) => setHero(e.target.value as HeroMode)}><option value="banner">Web banner</option><option value="photo">Photo</option></select></label>
          </div>
          <SitePreviewBox device={device} theme={theme} hero={hero} base={base} />
          <p className="me-meta me-break">https://esbpowerline.com/articles/{slug || 'story-slug'}</p>
        </>
      ) : (
        <>
          <PcHost className="me-bp"><BannerPreviews base={base} heroMode={hero} onHeroMode={setHero} photoUrl={photo} caption={fbCaption} pageName={fb ? fb.pageName || fb.pageId : null} /></PcHost>
          <div className="me-start-row">
            <Button kind="tonal" icon="refresh" onClick={() => { useEditorialStore.getState().applyDraftToBanner(); snack('Banner updated from the story') }}>Update banner</Button>
            <Button kind="tonal" icon="layers" onClick={() => useNav.getState().go('graphics')}>Edit in Graphics</Button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- side column (expanded) + readiness pill
export function ReadyPill() {
  const { t } = useReadiness()
  const label = t.state === 'blocked' ? `${t.blockers} to fix` : t.state === 'review' ? `${t.warnings} to check` : 'Ready'
  return (
    <button type="button" className={'me-ready is-' + t.state} onClick={() => useUi.getState().openSheet('ed-ready')} aria-label={`${label}. Show the publishing checklist`}>
      <Icon name={t.state === 'ready' ? 'check' : 'alert'} size={18} /><span>{label}</span>
    </button>
  )
}

function Side() {
  const { ready, t } = useReadiness()
  const base = useBase()
  return (
    <aside className="me-side" aria-label="Before publication">
      <section className="me-card">
        <div className="me-card-row"><b className="me-grow">Before publication</b><span className="me-meta">{t.done}/{ready.total}</span></div>
        {t.open.slice(0, 5).map((c) => <p key={c.id} className={'me-readyline is-' + c.status}><i aria-hidden />{c.label}{c.group === 'Required' ? ' · required' : ''}</p>)}
        {!t.open.length && <p className="me-meta">Nothing left to fix.</p>}
        <Button kind="text" onClick={() => useUi.getState().openSheet('ed-ready')}>Show the checklist</Button>
      </section>
      <section className="me-card">
        <b>On a phone</b>
        <SitePreviewBox device="mobile" theme="white" hero="banner" base={base} />
      </section>
    </aside>
  )
}

// ---------------------------------------------------------------- the screen
export function storyMenu(): MenuItem[] {
  const nav = useNav.getState()
  const ed = useEditorialStore.getState()
  const linked = linkedArticle()
  return [
    { label: 'New story', icon: 'plus', onClick: () => newStory('story') },
    { label: 'Load another link', icon: 'link', onClick: () => { newStory('intake'); useDesk.setState({ intakeTab: 'link', focusUrlAt: Date.now() }) } },
    { label: 'Translate the source again', icon: 'refresh', disabled: !ed.source || !!useDesk.getState().busy, onClick: () => void retranslate(!!linked) },
    { label: 'Original source', icon: 'newspaper', disabled: !ed.source, onClick: () => useUi.getState().openSheet('ed-source') },
    { divider: true, label: '', onClick: () => {} },
    { label: 'Copy CMS JSON', icon: 'copy', disabled: !ed.draft.headline.trim(), onClick: async () => snack((await platform().copyText(JSON.stringify(cmsPayload('PUBLISHED'), null, 2))) ? 'CMS JSON copied' : 'Could not copy') },
    { label: 'Open the site CMS (browser)', icon: 'externalLink', onClick: () => void openSiteCms(ed.staffSession, '/cms/articles/new') },
    { label: 'Activity', icon: 'activity', onClick: () => useUi.getState().openSheet('ed-activity') },
    { label: 'Quote & figure library', icon: 'quote', onClick: () => useUi.getState().openSheet('ed-library') },
    { divider: true, label: '', onClick: () => {} },
    { label: 'AI keys and providers', icon: 'sparkle', onClick: () => nav.openSettings('ai') },
    { label: 'Site sign-in', icon: 'user', onClick: () => nav.openSettings('site') },
    { label: 'Facebook Page', icon: 'link', onClick: () => nav.openSettings('facebook') },
    { divider: true, label: '', onClick: () => {} },
    { label: 'Remove this story', icon: 'trash', danger: true, onClick: async () => {
      const id = useStoryQueue.getState().activeId
      if (!(await confirmAsk({ title: 'Remove this story?', body: 'Its draft is deleted from this phone. An article already on esbpowerline.com is not touched.', confirm: 'Remove', danger: true }))) return
      if (id) useStoryQueue.getState().remove(id); else useEditorialStore.getState().clear()
      useDesk.setState({ view: 'home' })
    } },
  ]
}

export function StoryEditor() {
  const d = useDesk()
  const headline = useEditorialStore((s) => s.draft.headline)
  const source = useEditorialStore((s) => s.source)
  const story = useStoryQueue((s) => s.stories.find((x) => x.id === s.activeId))
  const cat = useCategory()
  const { words } = useStoryNumbers()
  const size = useSizeClass()
  const pubBusy = usePublish((s) => s.busy)
  const jobLive = d.busy != null || pubBusy
  const linked = linkedArticle()
  const wide = size === 'expanded'
  return (
    <div className={'me-story' + (d.writing ? ' is-writing' : '') + (d.editing ? ' is-editing' : '')}>
      <div className="me-hide-writing">
        <TopBar leading={<IconBtn icon="chevLeft" label="Back to stories" onClick={() => d.set({ view: 'home', writing: false })} />}
          title={headline.trim() || source?.title || 'Untitled story'}
          sub={<>{story ? <StatusChip s={story.status} /> : <span className="me-status s-draft">{STATUS_LABEL.draft}</span>}<span>{cat.name} · {words} words{linked ? ' · live' : ''}</span></>}
          actions={<>
            <IconBtn icon="newspaper" label="Original source" disabled={!source} onClick={() => useUi.getState().openSheet('ed-source')} />
            <IconBtn icon="activity" label={jobLive ? 'Activity (a job is running)' : 'Activity'} badge={jobLive ? '•' : undefined} onClick={() => useUi.getState().openSheet('ed-activity')} />
          </>}
          overflow={storyMenu()} />
        <nav className="me-tabs" role="tablist" aria-label="Story sections">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={d.tab === t.id} className={'me-tab' + (d.tab === t.id ? ' is-on' : '')} onClick={() => d.set({ tab: t.id, writing: false })}>{t.label}</button>)}
        </nav>
      </div>
      <div key={d.tab} className="m-scroll me-scroll">
        <div className={'m-wrap' + (wide ? ' m-grid me-wide' : '')}>
          <div className={wide ? 'm-span-main' : undefined}>
            {d.tab === 'story' && <StoryTab />}
            {d.tab === 'details' && <DetailsTab />}
            {d.tab === 'seo' && <SeoTab />}
            {d.tab === 'social' && <SocialTab />}
            {d.tab === 'preview' && <PreviewTab />}
          </div>
          {wide && !d.writing && <div className="m-span-side"><Side /></div>}
        </div>
      </div>
      {!d.editing && !d.writing && (
        <footer className="m-actionbar me-actionbar">
          {canCancel(d.busy) ? <Button kind="text" onClick={cancelJob}>Cancel job</Button> : <ReadyPill />}
          <span className="m-spacer" />
          <Button icon="upload" disabled={!headline.trim()} onClick={() => useUi.getState().openSheet('ed-publish')}>{linked ? 'Update' : 'Publish'}</Button>
        </footer>
      )}
    </div>
  )
}
