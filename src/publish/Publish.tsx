// Publish screen: review, save to esbpowerline.com as a draft, publish live, post to the Facebook Page.
// Every live action opens a confirmation sheet that names what goes out and needs a second tap; Cancel has focus.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import { defaultCaption, sanitizeFacebook } from './caption'
import { ESB_CATEGORIES } from './categories'
import { issueConfirmation } from './confirm'
import type { LivePlan } from './confirm'
import { loadFacebook, postToFacebook } from './facebook'
import type { FacebookConfig } from './facebook'
import { buildReadiness, facebookBlockers, slugFromHeadline } from './readiness'
import { loadSession, saveArticle, signIn, signOut } from './site'
import type { StaffSession } from './site'
import { getSent, setSent } from './state'

type Outcome = { tone: 'ok' | 'bad'; text: string; link?: string } | null

/** One screen per story: switching stories remounts it, so nothing typed for one story leaks into another. */
export default function Publish({ draft, onChange }: { draft: Draft | null; onChange: (d: Draft) => void }) {
  if (!draft) return (<><h1>Publish</h1><p>Open or start a story in Stories first.</p></>)
  return <PublishFor key={draft.id} draft={draft} onChange={onChange} />
}

function PublishFor({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const [session, setSession] = useState<StaffSession | null>(null)
  const [fb, setFb] = useState<FacebookConfig | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [credit, setCredit] = useState('')
  const [caption, setCaption] = useState(() => defaultCaption(draft.headline))
  const [linkComment, setLinkComment] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<LivePlan | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [sent, setSentState] = useState(() => getSent(draft.id))
    const cancelRef = useRef<HTMLButtonElement>(null)
  const draftId = draft.id

  useEffect(() => { void loadSession().then(setSession); void loadFacebook().then(setFb) }, [])
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

  function askLive(kind: 'site' | 'facebook') {
    setOutcome(null)
    setPending(kind === 'site'
      ? { kind, title: draft.headline.trim(), slug: draft.slug.trim().toLowerCase(), destination: `esbpowerline.com/articles/${draft.slug.trim().toLowerCase()} (public, ${isLive ? 'updates the live article' : 'goes live now'})`, picture: pictureWords }
      : { kind, title: draft.headline.trim(), destination: 'the ESB Power Line Facebook Page (public post)', picture: photo ? `${photo.name} (${Math.round(photo.size / 1024)} KB)` : 'none' })
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
        setOutcome({ tone: 'ok', text: 'The site accepted it and it is published. The public pages can take a few minutes to refresh (see docs/PUBLISH_GAPS.md).', link: r.liveUrl ?? undefined })
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

  const mark = (s: string) => (s === 'ok' ? 'OK' : s === 'warn' ? 'Check' : 'Fix')

  return (
    <div className="pub">
      <h1>Publish</h1>
      <p className="note">Nothing leaves this phone until you tap a button below. Going live always asks twice.</p>

      <section className="card" aria-labelledby="pub-ready">
        <h2 id="pub-ready">Ready to publish?</h2>
        <ul className="pub-checks">
          {ready.checks.map((c) => (
            <li key={c.id} className={`pub-check pub-${c.status}`}>
              <span className="pub-mark" aria-hidden="true">{mark(c.status)}</span>
              <span><b>{c.label}.</b> <span className="sr-only">{c.status === 'ok' ? 'Done. ' : c.status === 'warn' ? 'Worth checking. ' : 'Must fix. '}</span>{c.detail}</span>
            </li>
          ))}
        </ul>
        <p className="note" role="status">{ready.blockers.length ? `${ready.blockers.length} thing${ready.blockers.length === 1 ? '' : 's'} to fix before you can publish.` : 'Everything required is in place.'}</p>
      </section>

      <section className="card" aria-labelledby="pub-details">
        <h2 id="pub-details">Details</h2>
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

      <section className="card" aria-labelledby="pub-pic">
        <h2 id="pub-pic">Picture</h2>
        <label htmlFor="pub-file">Choose from the phone (used for Facebook)</label>
        <input id="pub-file" type="file" accept="image/jpeg,image/png" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        {preview && <img className="pub-preview" src={preview} alt="Chosen picture preview" />}
        <label htmlFor="pub-url">Picture link for the site (https, already hosted)</label>
        <input id="pub-url" type="url" inputMode="url" value={photoUrl} placeholder="https://" onChange={(e) => setPhotoUrl(e.target.value)} />
        <label htmlFor="pub-credit">Photo credit</label>
        <input id="pub-credit" value={credit} onChange={(e) => setCredit(e.target.value)} />
        <button type="button" className="secondary" disabled aria-disabled="true">Upload picture to the site: Planned</button>
      </section>

      <section className="card" aria-labelledby="pub-acct">
        <h2 id="pub-acct">esbpowerline.com account</h2>
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

      <section className="card" aria-labelledby="pub-fb">
        <h2 id="pub-fb">Facebook caption</h2>
        <label htmlFor="pub-cap">Caption (no link; about 125 characters plus hashtags)</label>
        <textarea id="pub-cap" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
        <p className="count">Will post as: {sanitizeFacebook(caption, draft.headline) || '(empty)'}</p>
        <label className="pub-tick"><input type="checkbox" checked={linkComment} onChange={(e) => setLinkComment(e.target.checked)} /> Add the article link as the first comment (only once the story is live)</label>
        {fbProblems.length > 0 && <ul className="pub-why">{fbProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </section>

      <section className="pub-actions" aria-label="Actions">
        <button type="button" className="secondary" disabled={busy || !!ready.blockers.length || !session || isLive} onClick={() => { void saveDraft() }}>Save to site as draft</button>
        <button type="button" className="primary pub-live" disabled={busy || !!ready.blockers.length || !session} onClick={() => askLive('site')}>{isLive ? 'Update live article' : 'Publish live'}</button>
        <button type="button" className="primary pub-live" disabled={busy || !!fbProblems.length || !!ready.blockers.length} onClick={() => askLive('facebook')}>Post to Facebook</button>
        {isLive && <p className="note">This story is live, so "Save as draft" is off: it would take it down.</p>}
        {!session && <p className="note">Sign in above to save or publish to the site.</p>}
      </section>

      <div aria-live="polite">
        {busy && <p className="note" role="status">Working. Waiting for the real answer...</p>}
        {outcome && (
          <p className={`pub-out pub-out-${outcome.tone}`} role={outcome.tone === 'bad' ? 'alert' : 'status'}>
            {outcome.text}{outcome.link && <> <a href={outcome.link} target="_blank" rel="noreferrer">{outcome.link}</a></>}
          </p>
        )}
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
