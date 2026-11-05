// Settings: everything the PC keeps in its AI settings dialog, site sign-in sheet and Facebook dialog, as one
// Android settings page. All values go through the PC's own stores and save functions; secrets (keys, the site
// session, the Page token) are routed to the Android Keystore by src/platform/storage.ts.
import { UserAvatar, openAvatarPicker } from '../shell/avatar'
import { useEffect, useState } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { AI_PROVIDERS, providerMeta, listModels, testAiKey, type AiModelInfo, type AiProviderId, type AiSettings } from '../../pc/editorial/aiProviders'
import { clearFacebook, getFacebook, makeTokenPermanent, saveFacebook, useFacebookPrefs, verifyFacebook } from '../../pc/editorial/facebook'
import manifest from '../../pc/SYNC_MANIFEST.json'
import { getLinkFetchMode, setLinkFetchMode, type LinkFetchMode } from '../../platform/fetchGuarded'
import { probeFeature } from '../../sync/endpoints'
import { siteFeatureState, type SiteFeatureState } from '../../platform/esbShim'
import { isAppLockEnabled, isBiometricAvailable, setAppLockEnabled } from '../../native/biometric'
import { useNav } from '../shell/nav'
import { snack, useOnline } from '../shell/core'
import { checkForUpdate, getCurrentBundle } from '../../platform/ota'
import { Banner, Button, Collapse, Dropdown, FullDialog, Icon, Row, Section, Segmented } from '../shell/ui'
import { ProviderMark, brandColor } from '../shell/marks'
import { HoldButton } from '../shell/HoldButton'
import { FormatMark, RoleChip } from '../shell/cat'
import { JOURNALISTIC_TRANSLATOR_PROMPT } from '../../pc/editorial/translator'
import { platform } from '../../platform/platform'

const STATE_LABEL: Record<SiteFeatureState, string> = { live: 'Works', 'not-live': 'Planned · site update needed', unknown: 'Not checked yet' }

/** The PC's About: what it is, who made it. */
function AboutCard() {
  return (
    <div className="ab2">
      <section className="ab2-hero">
        <span className="ab2-glow" aria-hidden><i /><i /><i /><i /></span>
        <span className="ab2-mark"><img src="./brand/esb-avatar.png" alt="ESB Power Line" width={84} height={84} /></span>
        <h3 className="ab2-title">ESB <span>Ai Studio</span></h3>
        <p className="ab2-tag">Where stories are written, imagination is designed and reality is cut.</p>
        <span className="ab2-stripe" aria-hidden><i /><i /><i /></span>
        <span className="ab2-ver">Version {__APP_VERSION__}</span>
      </section>

      <section className="ab2-grid" aria-label="What it does">
        <div className="ab2-tile is-engine"><i><Icon name="power" size={20} /></i><b>Editorial</b><small>Bangla or English link in, newsroom English out</small></div>
        <div className="ab2-tile is-banner"><i><Icon name="layers" size={20} /></i><b>Banner</b><small>Facebook and web banners, on brand</small></div>
        <div className="ab2-tile is-wire"><i><Icon name="inbox" size={20} /></i><b>News</b><small>EnergyWatch by <em className="ab2-yeasin">Yeasin Fiyaz</em></small></div>
        <div className="ab2-tile is-pub"><i><Icon name="globe" size={20} /></i><b>Publish</b><small>esbpowerline.com and Facebook</small></div>
      </section>

      <section className="ab2-credit">
        <span className="ab2-avatar" aria-hidden>HR</span>
        <span className="ab2-who"><small>Designed and engineered by</small><b>Hamim Ruwayfi</b><em>Editorial and newsroom workflow</em></span>
        <button type="button" className="ab2-link" onClick={() => void platform().openExternal('https://facebook.com/chiefhamim')} aria-label="Hamim Ruwayfi on Facebook"><Icon name="externalLink" size={18} /></button>
      </section>

    </div>
  )
}

/** About: shows the running version and looks for a newer release on our own update host on request. */
function UpdateCheck() {
  const [state, setState] = useState<'idle' | 'checking' | 'latest' | 'found' | 'failed'>('idle')
  const [found, setFound] = useState('')
  const [running, setRunning] = useState('')
  useEffect(() => { void getCurrentBundle().then((b) => setRunning(/^\d/.test(b.version) ? b.version : '')) }, [])
  const run = async () => {
    setState('checking')
    try {
      const up = await checkForUpdate()
      if (up) { setFound(up.version); setState('found'); window.dispatchEvent(new CustomEvent('esb-update-found', { detail: up })) } else setState('latest')
    } catch { setState('failed') }
  }
  const meta = state === 'checking' ? 'Looking for a newer version'
    : state === 'found' ? `Version ${found} is ready. Tap Update now in the box that opened.`
    : state === 'latest' ? 'You have the latest version.'
    : state === 'failed' ? 'Could not reach the update server. Check the connection and try again.'
    : 'Updates download over the internet; your drafts and keys stay.'
  return (
    <div className="ab-update">
      <span className="ab-update-t"><b>ESB Studio</b><small>Version {running || __APP_VERSION__}</small><small className={'ab-update-s is-' + state}>{meta}</small></span>
      <Button kind="tonal" icon="refresh" busy={state === 'checking'} onClick={() => void run()}>Check for updates</Button>
      <p className="ab-update-foot"><span>ESB Ai Studio build {manifest.commit.slice(0, 7)} · {Object.keys(manifest.files).length} files</span><span>Fonts, artwork and templates are bundled with the app · © ESB Power Line</span></p>
    </div>
  )
}

function SiteAccount() {
  const session = useEditorialStore((s) => s.staffSession)
  const status = useEditorialStore((s) => s.siteStatus)
  const login = useEditorialStore((s) => s.loginStaff)
  const logout = useEditorialStore((s) => s.logoutStaff)
  const check = useEditorialStore((s) => s.checkConnection)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [feat, setFeat] = useState({ upload: siteFeatureState('upload'), revalidate: siteFeatureState('revalidate'), fetchArticle: siteFeatureState('fetchArticle') })
  const [probing, setProbing] = useState(false)

  const reprobe = async () => {
    setProbing(true)
    try {
      for (const f of ['upload', 'revalidate', 'fetchArticle'] as const) await probeFeature(f, { force: true })
      setFeat({ upload: siteFeatureState('upload'), revalidate: siteFeatureState('revalidate'), fetchArticle: siteFeatureState('fetchArticle') })
    } finally { setProbing(false) }
  }
  useEffect(() => { void check() }, [check])
  // signed in: find out what the site can do as soon as Settings opens (these probes store nothing), instead of showing "not checked"
  const signedIn = !!session
  useEffect(() => { if (signedIn) void reprobe() }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) {
    return (
      <form className="m-stack" onSubmit={(e) => { e.preventDefault(); setBusy(true); setErr(''); void login(email.trim(), pass).catch(() => ({ success: false, error: 'Could not reach the site.' } as { success: boolean; error?: string })).then((r) => { setBusy(false); setPass(''); if (!r.success) setErr(r.error ?? 'Sign-in failed.'); else snack('Signed in to esbpowerline.com', { tone: 'success' }) }) }}>
        <p className="m-muted">Sign in with your esbpowerline.com editor account. The password is sent once to the site's sign-in service and is not kept.</p>
        <label className="m-field"><span className="m-field-label">Email</span><input className="m-input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="m-field"><span className="m-field-label">Password</span><input className="m-input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required /></label>
        {err && <Banner tone="error">{err}</Banner>}
        <Button type="submit" busy={busy} wide>Sign in</Button>
      </form>
    )
  }
  const featRow = (label: string, st: SiteFeatureState | 'works') => {
    const tone = st === 'works' || st === 'live' ? 'ok' : st === 'not-live' ? 'planned' : 'unknown'
    return (
      <div className={'sa-feat is-' + tone}>
        <span className="sa-feat-ic" aria-hidden><Icon name={tone === 'ok' ? 'check' : tone === 'planned' ? 'clock' : 'info'} size={16} /></span>
        <span className="sa-feat-t"><b>{label}</b><small>{st === 'works' ? 'Works' : STATE_LABEL[st]}</small></span>
      </div>
    )
  }
  return (
    <div className="sa">
      <div className="sa-me">
        <button type="button" className="sa-avatar sa-avatar-btn" aria-label="Change profile picture" onClick={openAvatarPicker}><UserAvatar name={session.name || session.email} /></button>
        <span className="sa-me-t"><span className="sa-name"><b>{session.name || session.email}</b><RoleChip role={session.role} /></span><small>{session.email}</small></span>
      </div>
      <div className="sa-site">
        <span className="sa-site-t"><b>esbpowerline.com</b><small>Editor sign-in and publishing</small></span>
        <div className="fbc-conn">
          <span className={'fbc-pill is-' + (status.connected ? 'ok' : 'bad')}><i aria-hidden />{status.connected ? `Connected · ${status.latencyMs} ms` : status.sessionEnded ? 'Session ended: sign in again' : status.statusText ?? 'Not connected'}</span>
          <button type="button" className="fbc-recheck" onClick={() => { void check() }}><Icon name="refresh" size={16} />Check again</button>
        </div>
      </div>
      <div className="sa-feats">
        {featRow('Save drafts, publish, update articles', 'works')}
        {featRow('Picture upload', feat.upload)}
        {featRow('Cache refresh after publish', feat.revalidate)}
        {featRow('Link fetching through the site', feat.fetchArticle)}
      </div>
      <Button kind="tonal" wide icon="refresh" busy={probing} onClick={() => { void reprobe() }}>Check site features</Button>
      <HoldButton onConfirm={() => { logout(); snack('Signed out') }}>Sign out</HoldButton>
    </div>
  )
}

/** A very small "key saved" mark beside a provider's name. */
function SavedMark({ on }: { on: boolean }) {
  if (!on) return null
  return <span className="st-saved" role="img" aria-label="Key saved" title="Key saved"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden><circle cx="6" cy="6" r="6" fill="currentColor" /><path d="M3.4 6.2l1.8 1.8 3.4-3.7" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
}

function KeyField({ id, ai, onSave, inline }: { id: AiProviderId; ai: AiSettings; onSave: (s: AiSettings) => void; inline?: boolean }) {
  const meta = AI_PROVIDERS.find((p) => p.id === id)!
  const [val, setVal] = useState(ai.keys[id])
  const [show, setShow] = useState(false)
  const [models, setModels] = useState<AiModelInfo[] | null>(null)
  const [listErr, setListErr] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = val.trim() !== ai.keys[id]
  // a saved key lists that account's models on its own, so the model can be changed without running a test first
  useEffect(() => {
    const k = ai.keys[id]
    if (!k || models || ai.paused) return
    let dead = false
    setListErr('')
    void listModels(id, k).then((m) => { if (dead) return; if (m.length) setModels(m); else setListErr('The account answered with no usable models.') }).catch((e) => { if (!dead) setListErr(e instanceof Error ? e.message : String(e)) })
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.keys[id], ai.paused])
  const save = () => { onSave({ ...ai, keys: { ...ai.keys, [id]: val.trim() } }); snack(`${meta.name} key saved on this phone`, { tone: 'success' }) }
  const test = async () => {
    setTesting(true); setResult(null)
    try {
      const r = await testAiKey(id, val.trim(), ai.models[id])
      setResult(r.ok ? { ok: true, text: `Key works — ${r.models?.length ?? 0} models${r.model ? `, answered on ${r.model}` : ''}.` } : { ok: false, text: r.error ?? 'The key did not work.' })
      if (r.ok) { setListErr(''); setModels(r.models ?? (await listModels(id, val.trim()).catch((e) => { setListErr(e instanceof Error ? e.message : String(e)); return null }))) }
    } finally { setTesting(false) }
  }
  const body = (
      <div className="m-stack">
        <p className="m-muted">{meta.help}</p>
        <label className="m-field">
          <span className="m-field-label">API key</span>
          <span className="m-input-row">
            <input className="m-input" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder={meta.keyPlaceholder} value={val} onChange={(e) => { setVal(e.target.value); setModels(null); setResult(null); setListErr('') }} />
            <button type="button" className="m-iconbtn" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} size={22} /></button>
            <button type="button" className="m-iconbtn st-rm" aria-label={`Remove the ${meta.name} key`} title="Remove key" disabled={!ai.keys[id]} onClick={() => { setVal(''); setModels(null); setResult(null); setListErr(''); onSave({ ...ai, keys: { ...ai.keys, [id]: '' } }); snack(`${meta.name} key removed`) }}><Icon name="trash" size={20} /></button>
          </span>
        </label>
        <div className="m-field">
          <Dropdown label="Model" value={ai.models[id]} onChange={(v) => onSave({ ...ai, models: { ...ai.models, [id]: v } })} options={[
            { value: 'auto', label: meta.autoLabel },
            ...(ai.models[id] !== 'auto' && !models?.some((x) => x.id === ai.models[id]) ? [{ value: ai.models[id], label: ai.models[id] }] : []),
            ...(models ?? []).map((x) => ({ value: x.id, label: x.label, hint: x.hint })),
          ]} />
          {!models?.length && <span className="m-field-help">{listErr ? `Could not load the models: ${listErr} Press Check to try again.` : val.trim() ? 'Check the key to load the models it can use.' : `Paste a ${meta.name} key to choose a model.`}</span>}
        </div>
        {result && <Banner tone={result.ok ? 'success' : 'error'}>{result.text}</Banner>}
        <div className="st-actions">
          <button type="button" className={'st-test' + (testing ? ' is-busy' : '')} disabled={testing || !val.trim() || ai.paused} onClick={() => { void test() }}><Icon name={testing ? 'refresh' : 'check'} size={18} className={testing ? 'st-spin' : ''} /><span>{testing ? 'Checking' : 'Check'}</span></button>
          <button type="button" className="st-save" disabled={!dirty || !val.trim()} onClick={save}><Icon name="check" size={18} /><span>Save</span></button>
        </div>
      </div>
  )
  if (inline) {
    return (
      <div className="st-key">
        <div className="st-key-head" style={{ '--pc': brandColor(id) } as React.CSSProperties}>
          <i className="st-picon"><ProviderMark id={id} size={18} /></i>
          <span><b>{meta.name}<SavedMark on={!!ai.keys[id]} /></b><small>{ai.keys[id] ? 'Key saved on this phone' : 'No key yet'}</small></span>
        </div>
        {body}
      </div>
    )
  }
  return (
    <Collapse title={<>{meta.name}<SavedMark on={!!ai.keys[id]} /></>} lead={<i className="st-picon" style={{ '--pc': brandColor(id) } as React.CSSProperties}><ProviderMark id={id} size={18} /></i>} sub={ai.keys[id] ? 'Key saved' : 'No key'}>
      {body}
    </Collapse>
  )
}

/** The translation prompt, shown (and editable) exactly as on the PC: the newsroom's official prompt by default; an own
 *  prompt is kept only while it differs from it (an empty stored value means "the official one"). */
function PromptField() {
  const ai = useEditorialStore((s) => s.ai)
  const setAi = useEditorialStore((s) => s.setAiSettings)
  const [text, setText] = useState(ai.prompt || JOURNALISTIC_TRANSLATOR_PROMPT)
  const custom = text.trim() !== JOURNALISTIC_TRANSLATOR_PROMPT.trim()
  const commit = (v: string) => { setText(v); setAi({ ...useEditorialStore.getState().ai, prompt: v.trim() === JOURNALISTIC_TRANSLATOR_PROMPT.trim() ? '' : v }) }
  return (
    <div className="m-field st-prompt">
      <span className="m-field-label"><span>Translation prompt</span><span className={'st-prompt-state' + (custom ? ' is-custom' : '')}>{custom ? 'Your own prompt' : 'Newsroom default'}</span></span>
      <textarea className="m-textarea st-prompt-area" rows={12} spellCheck={false} aria-label="Translation prompt" value={text} onChange={(e) => commit(e.target.value)} />
      {custom && <Button kind="tonal" icon="reset" onClick={() => commit(JOURNALISTIC_TRANSLATOR_PROMPT)}>Reset to default</Button>}
      <p className="m-field-help">The main provider follows this prompt for the translation, word for word. Only the layout of its answer is fixed: headline, deck, slug, keywords, meta title and description, and the complete body (with headings, bullet points, tables and highlights where the story calls for them, plus chart ideas built only from the source's own numbers). The desk holds all of it to the site's limits.</p>
    </div>
  )
}

function AiSection() {
  const ai = useEditorialStore((s) => s.ai)
  const setAi = useEditorialStore((s) => s.setAiSettings)
  const setPaused = useEditorialStore((s) => s.setAiPaused)
  const roleRow = (role: 'seo' | 'social', label: string) => (
    <Dropdown label={label} value={ai[role]} onChange={(v) => setAi({ ...ai, [role]: v as AiProviderId | '' })} options={[
      { value: '', label: 'Same as the main provider', hint: providerMeta(ai.provider).name, lead: <span className="dd-mark" style={{ '--pc': brandColor(ai.provider) } as React.CSSProperties}><ProviderMark id={ai.provider} size={16} /></span> },
      ...AI_PROVIDERS.map((p) => ({ value: p.id as AiProviderId | '', label: p.name, hint: ai.keys[p.id] ? 'Key saved' : 'No key yet', lead: <span className="dd-mark" style={{ '--pc': brandColor(p.id) } as React.CSSProperties}><ProviderMark id={p.id} size={16} /></span> })),
    ]} />
  )
  return (
    <div className="m-stack">
      <Row title="AI is on" meta={ai.paused ? 'Paused: no AI company is contacted; the free translation service is used.' : 'Translation, SEO and captions use the providers below.'} trail={<button type="button" role="switch" aria-checked={!ai.paused} aria-label="AI on" className={`m-switch${ai.paused ? '' : ' is-on'}`} onClick={() => setPaused(!ai.paused)}><span /></button>} />
      <div className="m-field">
        <span className="st-h">Main provider · story and translation</span>
        <div className="st-prov" role="radiogroup" aria-label="Main provider">{AI_PROVIDERS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={ai.provider === p.id} className={'st-prov-chip' + (ai.provider === p.id ? ' is-on' : '')} style={{ '--pc': brandColor(p.id) } as React.CSSProperties} onClick={() => setAi({ ...ai, provider: p.id })}>
            <i><ProviderMark id={p.id} size={18} /></i><span>{p.name}<SavedMark on={!!ai.keys[p.id]} /></span>{ai.provider === p.id && <Icon name="check" size={16} />}
          </button>
        ))}</div>
      </div>
      <KeyField key={ai.provider} id={ai.provider} ai={ai} onSave={setAi} inline />
      <div className="st-jobs">
        <h4 className="st-h">Who writes what</h4>
        {roleRow('seo', 'SEO writing')}
        {roleRow('social', 'Social captions')}
      </div>
      <PromptField />
      <Row title="Second opinion on figures" meta="When the translation's figures disagree with the source, ask once more on a stronger model." trail={<button type="button" role="switch" aria-checked={!!ai.escalate?.main} aria-label="Second opinion" className={`m-switch${ai.escalate?.main ? ' is-on' : ''}`} onClick={() => setAi({ ...ai, escalate: { ...ai.escalate, main: !ai.escalate?.main } })}><span /></button>} />
      <h4 className="st-h">Other providers</h4>
      <div className="st-others">{AI_PROVIDERS.filter((p) => p.id !== ai.provider).map((p) => <KeyField key={p.id} id={p.id} ai={ai} onSave={setAi} />)}</div>
      <p className="m-muted">Keys stay in this phone's secure storage (Android Keystore). Each call goes straight to the provider with your key.</p>
    </div>
  )
}

/** The PC's "Make it permanent": a short-lived user token from the Graph API Explorer + the app's ID and secret become a Page token that
 *  never expires (Meta: a Page token made from a long-lived user token has no expiry). The secret lives in this form only: it is used for
 *  the exchange and cleared straight after, never saved, never logged. */
function PermanentToken({ pageId, onPageId, onDone, onCancel }: { pageId: string; onPageId?: (v: string) => void; onDone: () => void; onCancel?: () => void }) {
  const [userToken, setUserToken] = useState('')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ready = /^\d{5,}$/.test(pageId.trim()) && !!userToken.trim() && /^\d{5,}$/.test(appId.trim()) && !!appSecret.trim()
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const r = await makeTokenPermanent({ pageId: pageId.trim(), userToken: userToken.trim(), appId: appId.trim(), appSecret: appSecret.trim() })
      if (!r.ok) { setErr(r.error); return }
      const v = await verifyFacebook(pageId.trim(), r.token, true)
      if (!v.ok) { setErr(v.error); return }
      saveFacebook({ pageId: pageId.trim(), token: r.token, pageName: v.name || r.pageName, permanent: r.permanent })
      snack(r.permanent ? `Connected to ${v.name || r.pageName}: the token does not expire` : `Connected to ${v.name || r.pageName}. Facebook did not confirm that it never expires`, { tone: r.permanent ? 'success' : 'info' })
      onDone()
    } catch { setErr('Could not reach Facebook. Check the connection and try again.') } finally { setBusy(false); setAppSecret(''); setUserToken('') }
  }
  return (
    <div className="m-stack fb-perm">
      <p className="m-muted">A token copied from the Graph API Explorer lasts about an hour, which is why it keeps stopping. This builds one that does not expire. Paste the Explorer's <b>user</b> token, your app's ID and secret (Meta for Developers, your app, Settings, Basic). The secret is used once and not kept.</p>
      {onPageId && <label className="m-field"><span className="m-field-label">Page id</span><input className="m-input" inputMode="numeric" value={pageId} onChange={(e) => onPageId(e.target.value.replace(/\D/g, ''))} /></label>}
      <label className="m-field"><span className="m-field-label">User access token (from the Graph API Explorer)</span><input className="m-input" type="password" autoComplete="off" spellCheck={false} value={userToken} onChange={(e) => setUserToken(e.target.value)} /></label>
      <label className="m-field"><span className="m-field-label">App ID</span><input className="m-input" inputMode="numeric" value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="m-field"><span className="m-field-label">App secret</span><input className="m-input" type="password" autoComplete="off" spellCheck={false} value={appSecret} onChange={(e) => setAppSecret(e.target.value)} /></label>
      {err && <Banner tone="error">{err}</Banner>}
      <Button wide busy={busy} disabled={!ready} onClick={() => void go()}>Make permanent &amp; connect</Button>
      {onCancel && <Button kind="text" wide onClick={onCancel}>Paste a Page token instead</Button>}
    </div>
  )
}

function FacebookSection() {
  const [fb, setFb] = useState(getFacebook())
  const [pageId, setPageId] = useState(fb?.pageId ?? '')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pic, setPic] = useState(true)
  const [perm, setPerm] = useState(false)
  const [link, setLink] = useState<{ s: 'checking' | 'ok' | 'bad'; name?: string; err?: string }>({ s: 'checking' })
  const linkComment = useFacebookPrefs((st) => st.linkComment)
  const setLinkComment = useFacebookPrefs((st) => st.setLinkComment)
  const online = useOnline()

  const recheck = async (cfg = fb, fresh = true) => {
    if (!cfg) return
    setLink({ s: 'checking' })
    const r = await verifyFacebook(cfg.pageId, cfg.token, fresh).catch(() => ({ ok: false as const, error: 'Could not reach Facebook.' }))
    if (r.ok) {
      setLink({ s: 'ok', name: r.name })
      if (r.name && r.name !== cfg.pageName) { const next = { ...cfg, pageName: r.name }; saveFacebook(next); setFb(next) }
    } else setLink({ s: 'bad', err: r.error })
  }
  // the connection is proved on open (the PC does the same when its sidebar opens)
  useEffect(() => { if (fb && online) void recheck(fb, false); else if (fb) setLink({ s: 'bad', err: 'Offline: the connection could not be checked.' }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (fb) {
    const name = link.name || fb.pageName || `Page ${fb.pageId}`
    return (
      <div className="fbc">
        <div className="fbc-card">
          <span className="fbc-pic" aria-hidden>
            {pic ? <img src={`https://graph.facebook.com/${fb.pageId}/picture?type=square`} alt="" onError={() => setPic(false)} /> : <FormatMark id="fb45" size={44} />}
            {pic && <i className="fbc-f"><FormatMark id="fb45" size={18} /></i>}
          </span>
          <span className="fbc-t"><b>{name}</b><small>Facebook Page · {fb.pageId}</small></span>
        </div>
        <div className="fbc-conn">
          <span className={'fbc-pill is-' + link.s}><i aria-hidden />{link.s === 'ok' ? 'Connected' : link.s === 'bad' ? 'Needs attention' : 'Checking'}</span>
          <button type="button" className="fbc-recheck" onClick={() => void recheck()} disabled={link.s === 'checking' || !online}><Icon name="refresh" size={16} className={link.s === 'checking' ? 'st-spin' : ''} />Check again</button>
        </div>
        {link.s === 'bad' && <Banner tone="error">{link.err}</Banner>}
        <div className="fbc-facts">
          <div><Icon name={fb.permanent ? 'check' : 'info'} size={16} /><span><b>{fb.permanent ? 'Token does not expire' : 'Token may expire'}</b><small>{fb.permanent ? 'Made from a long-lived token.' : 'A token pasted from the Graph API Explorer usually lasts about an hour.'}</small></span></div>
          <div><Icon name="lock" size={16} /><span><b>Kept in this phone's secure storage</b><small>Sent only to Facebook, never in a link.</small></span></div>
        </div>
        {!fb.permanent && (
          <Collapse title="Make the token permanent" sub="Stop it expiring every hour">
            <PermanentToken pageId={fb.pageId} onDone={() => { const n = getFacebook(); setFb(n); setLink({ s: 'checking' }); if (n) void recheck(n, false) }} />
          </Collapse>
        )}
        <Row title="Link in the first comment" meta="After a post, add the story link as the first comment." trail={<button type="button" role="switch" aria-checked={linkComment} aria-label="Link in first comment" className={`m-switch${linkComment ? ' is-on' : ''}`} onClick={() => setLinkComment(!linkComment)}><span /></button>} />
        <HoldButton onConfirm={() => { clearFacebook(); setFb(null); setLink({ s: 'checking' }); setPic(true); snack('Facebook Page removed from this phone') }}>Disconnect Page</HoldButton>
      </div>
    )
  }
  if (perm) {
    return (
      <div className="m-stack">
        <div className="fbc-empty"><span className="fbc-f big"><FormatMark id="fb45" size={28} /></span><span><b>Not connected</b><small>Permanent token</small></span></div>
        <PermanentToken pageId={pageId} onPageId={setPageId} onDone={() => { setFb(getFacebook()); setPerm(false); setLink({ s: 'ok' }) }} onCancel={() => setPerm(false)} />
      </div>
    )
  }
  return (
    <form className="m-stack" onSubmit={(e) => {
      e.preventDefault(); setErr('')
      const id = pageId.trim(), tk = token.trim()
      if (!/^\d{5,}$/.test(id)) { setErr('The Page id must be digits only.'); return }
      setBusy(true)
      void verifyFacebook(id, tk, true).catch(() => ({ ok: false as const, error: 'Could not reach Facebook.' })).then((r) => {
        setBusy(false)
        if (!r.ok) { setErr(r.error); return }
        saveFacebook({ pageId: id, token: tk, pageName: r.name }); setFb(getFacebook()); setToken(''); setLink({ s: 'ok', name: r.name })
        snack(`Connected to ${r.name}`, { tone: 'success' })
      })
    }}>
      <div className="fbc-empty"><span className="fbc-f big"><FormatMark id="fb45" size={28} /></span><span><b>Not connected</b><small>Connect a Page to post the banner</small></span></div>
      <p className="m-muted">Posting needs the Page id and a Page access token. The token is checked with Facebook before it is saved, and nothing is posted until you press Post and confirm it.</p>
      <label className="m-field"><span className="m-field-label">Page id</span><input className="m-input" inputMode="numeric" value={pageId} onChange={(e) => setPageId(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="m-field"><span className="m-field-label">Page access token</span><input className="m-input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
      {err && <Banner tone="error">{err}</Banner>}
      <Button type="submit" wide busy={busy} disabled={!pageId || !token}>Connect Page</Button>
      <Button kind="text" wide onClick={() => setPerm(true)}>Token keeps expiring? Make it permanent</Button>
    </form>
  )
}

export default function SettingsScreen({ onClose }: { onClose: () => void }) {
  const section = useNav((s) => s.settingsSection)
  const [mode, setMode] = useState<LinkFetchMode>(getLinkFetchMode())
  const [lock, setLock] = useState(isAppLockEnabled())
  const [bio, setBio] = useState<boolean | null>(null)

  useEffect(() => { void isBiometricAvailable().then((r) => setBio(r.available)) }, [])
  useEffect(() => { if (section) document.getElementById(`set-${section}`)?.scrollIntoView({ block: 'start' }) }, [section])

  return (
    <FullDialog open title="Settings" onClose={onClose}>
      <div className="m-wrap m-settings">
        <Section title="Site account" id="set-site"><SiteAccount /></Section>
        <Section title="Facebook" id="set-facebook"><FacebookSection /></Section>
        <Section title="AI providers" id="set-ai"><AiSection /></Section>
        <Section title="Link fetching" id="set-fetch">
          <div className="m-stack">
            <Segmented label="Link fetching" value={mode} onChange={(m) => { setMode(m); setLinkFetchMode(m) }} options={[{ value: 'site', label: 'Through the site' }, { value: 'device', label: 'This phone' }]} />
            <p className="m-muted">{mode === 'site'
              ? 'Pasted links are read by esbpowerline.com (staff route). Until the site update is deployed this says "not connected" and you paste the text instead. Feeds (News) need "This phone".'
              : 'This phone reads the public page itself, after the same safety checks (public https addresses only). Feeds (News) work in this mode.'}</p>
          </div>
        </Section>
        <Section title="Security" id="set-lock">
          <Row title="App lock" meta={bio === false ? 'This phone has no fingerprint, face or screen lock set up.' : 'Ask for fingerprint, face or screen lock when ESB Studio opens.'} trail={<button type="button" role="switch" aria-checked={lock} aria-label="App lock" disabled={bio === false} className={`m-switch${lock ? ' is-on' : ''}`} onClick={() => { const want = !lock; void setAppLockEnabled(want).then((state) => { setLock(state); if (state !== want) snack('App lock was not turned on (the phone did not confirm it is you).', { tone: 'error' }) }) }}><span /></button>} />
        </Section>
        <Section title="About" id="set-about">
          <AboutCard />
          <UpdateCheck />
        </Section>
      </div>
    </FullDialog>
  )
}
