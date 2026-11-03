// Publish desk, three steps: Check (is the story ready), Review (picture, site page, Facebook post), Send (account and the
// live actions). Every live action opens a confirmation sheet that names what goes out and needs a second tap; Cancel has
// focus. The gate is unchanged from the first build: the network functions refuse to run without the sheet's confirmation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import '../ui/publish.css'
import { defaultCaption, sanitizeFacebook, CAPTION_TEXT_LIMIT } from './caption'
import { ESB_CATEGORIES } from './categories'
import { issueConfirmation } from './confirm'
import type { LivePlan } from './confirm'
import { loadFacebook, postToFacebook } from './facebook'
import type { FacebookConfig } from './facebook'
import { buildReadiness, facebookBlockers, slugFromHeadline } from './readiness'
import { loadSession, saveArticle, signIn, signOut } from './site'
import { cachedAvailability, probeFeature, revalidateSlugs, uploadPicture } from '../sync/endpoints'
import type { Availability } from '../sync/endpoints'
import type { StaffSession } from './site'
import { getSent, setSent } from './state'
import { analyzeFacebook } from './socialChecks'
import { STEPS, ringStats, stepAt, stepIndex } from './steps'
import type { StepId } from './steps'
import { FacebookPreviewCard, SitePreviewCard } from './Previews'
import { formatArticleDate } from './steps'
import { renderDraftBanner } from '../banner/compose'
import { Icon } from '../edit/icons'
import type { IconName } from '../edit/icons'

type Outcome = { tone: 'ok' | 'bad'; text: string; link?: string } | null

/** One screen per story: switching stories remounts it, so nothing typed for one story leaks into another. */
export default function Publish({ draft, onChange, onGo }: { draft: Draft | null; onChange: (d: Draft) => void; onGo?: (tab: 'edit' | 'banner') => void }) {
  if (!draft) return (<><h1>Publish</h1><p>Open or start a story in Stories first.</p></>)
  return <PublishFor key={draft.id} draft={draft} onChange={onChange} onGo={onGo} />
}

function PHead({ id, icon, children, tag }: { id: string; icon: IconName; children: string; tag?: string }) {
  return (
    <header className="pb-card-h"><span className="pb-card-ic"><Icon name={icon} size={16} /></span><h2 id={id}>{children}</h2>{tag && <span className="pb-card-tag">{tag}</span>}</header>
  )
}

function Ring({ done, total, fraction }: { done: number; total: number; fraction: number }) {
  const r = 28
  const c = 2 * Math.PI * r
  return (
    <svg className="pb-ring" viewBox="0 0 72 72" role="img" aria-label={`${done} of ${total} required checks passed`}>
      <circle cx="36" cy="36" r={r} className="pb-ring-bg" />
      <circle cx="36" cy="36" r={r} className="pb-ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} transform="rotate(-90 36 36)" />
      <text x="36" y="41" textAnchor="middle" className="pb-ring-t">{done}/{total}</text>
    </svg>
  )
}

function PublishFor({ draft, onChange, onGo }: { draft: Draft; onChange: (d: Draft) => void; onGo?: (tab: 'edit' | 'banner') => void }) {
  const [step, setStep] = useState<StepId>('check')
  const [session, setSession] = useState<StaffSession | null>(null)
  const [fb, setFb] = useState<FacebookConfig | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [photoUrl, setPhotoUrl] = useState(() => getSent(draft.id).imageUrl ?? '')
  const [credit, setCredit] = useState(() => getSent(draft.id).imageCredit ?? '')
  const [uploadAvail, setUploadAvail] = useState<Availability>(() => cachedAvailability('upload'))
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState(() => defaultCaption(draft.headline))
  const [linkComment, setLinkComment] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<LivePlan | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [pictureNote, setPictureNote] = useState('')
  const [dateLine] = useState(() => formatArticleDate(new Date()))
  const [sent, setSentState] = useState(() => getSent(draft.id))
  const cancelRef = useRef<HTMLButtonElement>(null)
  const draftId = draft.id

  useEffect(() => { void loadSession().then(setSession); void loadFacebook().then(setFb) }, [])
  // is picture upload live on the site yet? (remembered probe; nothing is uploaded)
  useEffect(() => { if (session) { void probeFeature('upload').then(setUploadAvail); void probeFeature('revalidate') } }, [session])
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => { if (pending) cancelRef.current?.focus() }, [pending])

  const remember = useCallback((patch: Parameters<typeof setSent>[1]) => { if (draftId) setSentState(setSent(draftId, patch)) }, [draftId])

  const hasUrl = /^https:\/\//.test(photoUrl.trim())
  const ready = buildReadiness(draft, { translationReviewed: reviewed, hasPicture: !!photo || hasUrl })
  const fbProblems = facebookBlockers({ hasPictureFile: !!photo, caption, connected: !!fb })
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const isLive = sent.status === 'PUBLISHED'
  const pictureWords = hasUrl ? `picture link ${photoUrl.trim()}` : 'none (no picture is sent to the site)'
  const ring = ringStats(ready)
  const finalCaption = sanitizeFacebook(caption, draft.headline)
  const social = useMemo(() => analyzeFacebook(caption), [caption])
  const heroUrl = hasUrl ? photoUrl.trim() : preview

  async function doSignIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setOutcome(null)
    const r = await signIn(email, password)
    setPassword('') // never kept
    setBusy(false)
    if (r.ok) { setSession(r.session); setOutcome({ tone: 'ok', text: `Signed in as ${r.session.name}.` }) }
    else setOutcome({ tone: 'bad', text: r.error })
  }

  async function saveDraft() {
    setBusy(true); setOutcome(null)
    const r = await saveArticle(draft, { imageUrl: hasUrl ? photoUrl.trim() : undefined, imageCredit: credit, updateId: sent.articleId, knownLive: isLive })
    setBusy(false)
    if (r.ok) {
      remember({ articleId: r.articleId, slug: r.slug, status: r.status })
      setOutcome({ tone: 'ok', text: `${r.updated ? 'Updated' : 'Saved'} on esbpowerline.com as an unpublished draft. The site answered OK. It is not visible to readers.` })
    } else setOutcome({ tone: 'bad', text: r.error })
  }

  async function uploadToSite() {
    if (!photo) return
    setUploading(true); setPictureNote('')
    const r = await uploadPicture(photo, photoName || 'picture.jpg')
    setUploading(false)
    if (r.ok) { setPhotoUrl(r.data.url); setPictureNote('Uploaded to the site media library. The link is filled in above; it is used when you save or publish the story.') }
    else setPictureNote(r.error)
  }

  function askLive(kind: 'site' | 'facebook') {
    setOutcome(null)
    setPending(kind === 'site'
      ? { kind, title: draft.headline.trim(), slug: draft.slug.trim().toLowerCase(), destination: `esbpowerline.com/articles/${draft.slug.trim().toLowerCase()} (public, ${isLive ? 'updates the live article' : 'goes live now'})`, picture: pictureWords }
      : { kind, title: draft.headline.trim(), destination: 'the ESB Power Line Facebook Page (public post)', picture: photo ? `${photoName || 'picture'} (${Math.round(photo.size / 1024)} KB)` : 'none' })
  }

  async function confirmLive() {
    const plan = pending
    if (!plan) return
    setPending(null)
    setBusy(true); setOutcome(null)
    const confirmation = issueConfirmation(plan) // only this second tap issues it
    if (plan.kind === 'site') {
      const r = await saveArticle(draft, { publish: true, confirmation, imageUrl: hasUrl ? photoUrl.trim() : undefined, imageCredit: credit, updateId: sent.articleId })
      setBusy(false)
      if (r.ok) {
        remember({ articleId: r.articleId, slug: r.slug, status: 'PUBLISHED', liveUrl: r.liveUrl })
        // best effort: ask the site to refresh its cached public pages (only when the route is proved live)
        const refreshed = cachedAvailability('revalidate') === 'available' ? (await revalidateSlugs([r.slug])).ok : false
        setOutcome({ tone: 'ok', text: refreshed ? 'The site accepted it and it is published. The public pages were asked to refresh.' : 'The site accepted it and it is published. The public pages can take a few minutes to refresh (see docs/SITE_CONNECTIVITY.md).', link: r.liveUrl ?? undefined })
      } else setOutcome({ tone: 'bad', text: r.error })
    } else {
      if (!fb || !photo) { setBusy(false); setOutcome({ tone: 'bad', text: 'Facebook is not ready. Nothing was sent.' }); return }
      const r = await postToFacebook({ cfg: fb, photo, caption, title: draft.headline.trim(), confirmation, commentLink: linkComment && isLive ? sent.liveUrl ?? undefined : undefined })
      setBusy(false)
      if (r.ok) {
        remember({ fbUrl: r.url })
        const c = r.comment ? (r.comment.ok ? ' The article link was added as the first comment.' : ` The post is up, but the link comment failed: ${r.comment.error}`) : ''
        setOutcome({ tone: r.comment && !r.comment.ok ? 'bad' : 'ok', text: `Facebook accepted the post (id ${r.postId}).${c}`, link: r.url })
      } else setOutcome({ tone: 'bad', text: r.error })
    }
  }

  async function attachBanner() {
    setPictureNote('Making the banner from your Banner settings...')
    try {
      const blob = await renderDraftBanner(draft, 1)
      setPhoto(blob); setPhotoName('banner.png')
      setPictureNote('The banner is now the Facebook picture. It is only attached here; nothing was sent.')
    } catch (e) {
      setPictureNote(e instanceof Error ? e.message : 'The banner could not be made.')
    }
  }

  const mark = (s: string) => (s === 'ok' ? 'OK' : s === 'warn' ? 'Check' : 'Fix')
  const idx = stepIndex(step)
  const stepWhy = step === 'check' && ready.blockers.length ? `${ready.blockers.length} thing${ready.blockers.length === 1 ? '' : 's'} to fix before you can publish.` : ''

  return (
    <div className="pub">
      <h1 className="sr-only">Publish</h1>
      <ol className="pb-steps" aria-label="Publish steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={`pb-step${i === idx ? ' on' : ''}${i < idx ? ' done' : ''}`} aria-current={i === idx ? 'step' : undefined} onClick={() => setStep(s.id)}>
              <span className="pb-step-n" aria-hidden="true">{i < idx ? <Icon name="check" size={12} /> : i + 1}</span>{s.label}
            </button>
          </li>
        ))}
      </ol>
      <p className="note">Nothing leaves this phone until you tap a button in the Send step. Going live always asks twice.</p>

      {step === 'check' && (
        <>
          <section className="card pb-ready" aria-labelledby="pub-ready">
            <div className="pb-ready-head">
              <Ring {...ring} />
              <div>
                <h2 id="pub-ready">Ready to publish?</h2>
                <p className="note" role="status">{ready.blockers.length ? `${ready.blockers.length} thing${ready.blockers.length === 1 ? '' : 's'} to fix before you can publish.` : 'Everything required is in place.'}</p>
              </div>
            </div>
            <ul className="pub-checks">
              {ready.checks.map((c) => (
                <li key={c.id} className={`pub-check pub-${c.status}`}>
                  {c.status !== 'ok' && onGo ? (
                    <button
                      type="button"
                      className="pub-mark"
                      onClick={() => onGo(c.id === 'picture' ? 'banner' : 'edit')}
                      aria-label={`Fix ${c.label}. Tap to jump`}
                    >
                      {mark(c.status)}
                    </button>
                  ) : (
                    <span className="pub-mark" aria-hidden="true">{mark(c.status)}</span>
                  )}
                  <span><b>{c.label}.</b> <span className="sr-only">{c.status === 'ok' ? 'Done. ' : c.status === 'warn' ? 'Worth checking. ' : 'Must fix. '}</span>{c.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-labelledby="pub-details">
            <PHead id="pub-details" icon="info">Details</PHead>
            <label htmlFor="pub-cat">Category</label>
            <select id="pub-cat" value={draft.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">Choose a category</option>
              {Object.keys(ESB_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label htmlFor="pub-slug">Web address (slug)</label>
            <input id="pub-slug" value={draft.slug} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
            <button type="button" className="secondary" onClick={() => set({ slug: slugFromHeadline(draft.headline) })} disabled={!draft.headline.trim()}>Make from headline</button>
            {draft.translated && (
              <label className="pub-tick"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I have read the translated English through and it is right.</label>
            )}
          </section>
        </>
      )}

      {step === 'review' && (
        <>
          <section className="card" aria-labelledby="pub-pic">
            <PHead id="pub-pic" icon="image">Picture</PHead>
            <button type="button" className="secondary" onClick={() => { void attachBanner() }}>Use this story's banner for Facebook</button>
            {pictureNote && <p className="note" role="status">{pictureNote}</p>}
            <label htmlFor="pub-file">Or choose from the phone (used for Facebook)</label>
            <input id="pub-file" type="file" accept="image/jpeg,image/png" onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); setPhotoName(f?.name ?? ''); setPictureNote('') }} />
            <label htmlFor="pub-url">Picture link for the site (https, already hosted)</label>
            <input id="pub-url" type="url" inputMode="url" value={photoUrl} placeholder="https://" onChange={(e) => setPhotoUrl(e.target.value)} />
            <label htmlFor="pub-credit">Photo credit</label>
            <input id="pub-credit" value={credit} onChange={(e) => setCredit(e.target.value)} />
            {uploadAvail === 'available'
              ? <button type="button" className="secondary" disabled={!photo || uploading} onClick={() => { void uploadToSite() }}>{uploading ? 'Uploading...' : 'Upload the chosen picture to the site'}</button>
              : <button type="button" className="secondary" disabled aria-disabled="true">Upload picture to the site: {uploadAvail === 'unknown' ? 'sign in to check' : 'Planned'}</button>}
          </section>

          <section className="card" aria-labelledby="pb-site-h">
            <PHead id="pb-site-h" icon="globe">Website page</PHead>
            <SitePreviewCard title={draft.headline} deck={draft.deck} slug={draft.slug} category={draft.category} author={session?.name ?? null} body={draft.body} heroUrl={heroUrl} credit={credit} dateLine={dateLine} />
            <p className="note">An approximation drawn by the phone. The live page uses the site's own styles; the picture shown is the link if you set one, otherwise the chosen file (the site only receives a link).</p>
          </section>

          <section className="card" aria-labelledby="pub-fb">
            <PHead id="pub-fb" icon="facebook">Facebook post</PHead>
            <label htmlFor="pub-cap">Caption (no link; about {CAPTION_TEXT_LIMIT} characters plus hashtags)</label>
            <textarea id="pub-cap" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <button type="button" className="secondary" onClick={() => setCaption(defaultCaption(draft.headline))} disabled={!draft.headline.trim()}>Reset to the headline</button>
            <FacebookPreviewCard caption={finalCaption} imageUrl={preview} />
            <p className="count">Will post as the text above (links are removed, at most two lines, one hashtag line).</p>
            <label className="pub-tick"><input type="checkbox" checked={linkComment} onChange={(e) => setLinkComment(e.target.checked)} /> Add the article link as the first comment (only once the story is live)</label>
            {fbProblems.length > 0 && <ul className="pub-why">{fbProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
            <h3 className="pb-sub">Caption checks</h3>
            <ul className="pub-checks">
              {social.map((c) => (
                <li key={c.id} className={`pub-check pub-${c.status === 'good' ? 'ok' : c.status === 'bad' ? 'bad' : 'warn'}`}>
                  <span className="pub-mark" aria-hidden="true">{c.status === 'good' ? 'OK' : c.status === 'bad' ? 'Fix' : 'Check'}</span>
                  <span><b>{c.label}.</b> <span className="sr-only">{c.status === 'good' ? 'Done. ' : 'Worth checking. '}</span>{c.detail}{c.status !== 'good' && <small className="pb-why"> {c.why}</small>}</span>
                </li>
              ))}
            </ul>
            <p className="note">These are practice notes, not Facebook rules. They never block a post; the blockers above do.</p>
          </section>
        </>
      )}

      {step === 'send' && (
        <>
          <section className="card" aria-labelledby="pub-acct">
            <PHead id="pub-acct" icon="user">esbpowerline.com account</PHead>
            {session ? (
              <>
                <p className="note" role="status">Signed in as {session.name} ({session.email}){session.role ? `, ${session.role.toLowerCase()}` : ''}.</p>
                <button type="button" className="secondary" disabled={busy} onClick={() => { void signOut().then(() => setSession(null)) }}>Sign out</button>
              </>
            ) : (
              <form onSubmit={(e) => { void doSignIn(e) }}>
                <label htmlFor="pub-email">Email</label>
                <input id="pub-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label htmlFor="pub-pass">Password (not stored)</label>
                <input id="pub-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="submit" className="primary" disabled={busy || !email || !password}>Sign in</button>
              </form>
            )}
          </section>

          <section className="card" aria-labelledby="pb-sum">
            <PHead id="pb-sum" icon="send">What each button does</PHead>
            <ul className="pub-why">
              <li>Save to site as draft: stores the story on the site, not visible to readers.</li>
              <li>{isLive ? 'Update live article' : 'Publish live'}: public on esbpowerline.com, after a second tap.</li>
              <li>Post to Facebook: public post on the Page, after a second tap.</li>
            </ul>
            {stepWhy && <p className="note">{stepWhy}</p>}
          </section>

          <section className="pub-actions" aria-label="Actions">
            <button type="button" className="secondary" disabled={busy || !!ready.blockers.length || !session || isLive} onClick={() => { void saveDraft() }}>Save to site as draft</button>
            <button type="button" className="primary pub-live" disabled={busy || !!ready.blockers.length || !session} onClick={() => askLive('site')}>{isLive ? 'Update live article' : 'Publish live'}</button>
            <button type="button" className="primary pub-live" disabled={busy || !!fbProblems.length || !!ready.blockers.length} onClick={() => askLive('facebook')}>Post to Facebook</button>
            {isLive && <p className="note">This story is live, so "Save as draft" is off: it would take it down.</p>}
            {!session && <p className="note">Sign in above to save or publish to the site.</p>}
            {!!ready.blockers.length && <p className="note">Go back to Check: {ready.blockers.length} thing{ready.blockers.length === 1 ? '' : 's'} to fix.</p>}
          </section>
        </>
      )}

      <div aria-live="polite">
        {busy && <p className="note" role="status">Working. Waiting for the real answer...</p>}
        {outcome && (
          <p className={`pub-out pub-out-${outcome.tone}`} role={outcome.tone === 'bad' ? 'alert' : 'status'}>
            {outcome.text}{outcome.link && <> <a href={outcome.link} target="_blank" rel="noreferrer">{outcome.link}</a></>}
          </p>
        )}
      </div>

      <div className="pb-nav">
        <button type="button" className="secondary" disabled={idx === 0} onClick={() => setStep(stepAt(idx - 1))}>Back</button>
        {idx < STEPS.length - 1 && <button type="button" className="primary" onClick={() => setStep(stepAt(idx + 1))}>Next: {STEPS[idx + 1].label}</button>}
      </div>

      {pending && (
        <div className="pub-scrim" onKeyDown={(e) => { if (e.key === 'Escape') setPending(null) }}>
          <div className="pub-sheet" role="alertdialog" aria-modal="true" aria-labelledby="pub-ct" aria-describedby="pub-cd">
            <h2 id="pub-ct">{pending.kind === 'site' ? 'Publish to the website?' : 'Post to Facebook?'}</h2>
            <dl id="pub-cd">
              <dt>Title</dt><dd>{pending.title}</dd>
              <dt>Goes to</dt><dd>{pending.destination}</dd>
              <dt>Picture</dt><dd>{pending.picture}</dd>
              {pending.kind === 'facebook' && <><dt>Caption</dt><dd className="pub-pre">{sanitizeFacebook(caption, pending.title)}</dd></>}
            </dl>
            <p className="note">This is public. You cannot take it back from this app.</p>
            <div className="pub-sheet-btns">
              <button type="button" ref={cancelRef} className="secondary" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="primary pub-live" onClick={() => { void confirmLive() }}>{pending.kind === 'site' ? 'Yes, publish now' : 'Yes, post now'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
