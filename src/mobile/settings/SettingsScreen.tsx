// Settings: everything the PC keeps in its AI settings dialog, site sign-in sheet and Facebook dialog, as one
// Android settings page. All values go through the PC's own stores and save functions; secrets (keys, the site
// session, the Page token) are routed to the Android Keystore by src/platform/storage.ts.
import { useEffect, useState } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { AI_PROVIDERS, listModels, testAiKey, type AiModelInfo, type AiProviderId, type AiSettings } from '../../pc/editorial/aiProviders'
import { clearFacebook, getFacebook, saveFacebook, useFacebookPrefs } from '../../pc/editorial/facebook'
import manifest from '../../pc/SYNC_MANIFEST.json'
import { getLinkFetchMode, setLinkFetchMode, type LinkFetchMode } from '../../platform/fetchGuarded'
import { probeFeature } from '../../sync/endpoints'
import { siteFeatureState, type SiteFeatureState } from '../../platform/esbShim'
import { getThemePref, setThemePref, type ThemePref } from '../../shell/theme'
import { isAppLockEnabled, isBiometricAvailable, setAppLockEnabled } from '../../native/biometric'
import { useNav } from '../shell/nav'
import { snack } from '../shell/core'
import { Banner, Button, Chip, Collapse, FullDialog, Icon, Row, Section, Segmented } from '../shell/ui'

const STATE_LABEL: Record<SiteFeatureState, string> = { live: 'Works', 'not-live': 'Planned · site update needed', unknown: 'Not checked (sign in first)' }

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

  if (!session) {
    return (
      <form className="m-stack" onSubmit={(e) => { e.preventDefault(); setBusy(true); setErr(''); void login(email.trim(), pass).then((r) => { setBusy(false); setPass(''); if (!r.success) setErr(r.error ?? 'Sign-in failed.'); else snack('Signed in to esbpowerline.com', { tone: 'success' }) }) }}>
        <p className="m-muted">Sign in with your esbpowerline.com editor account. The password is sent once to the site's sign-in service and is not kept.</p>
        <label className="m-field"><span className="m-field-label">Email</span><input className="m-input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="m-field"><span className="m-field-label">Password</span><input className="m-input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required /></label>
        {err && <Banner tone="error">{err}</Banner>}
        <Button type="submit" busy={busy} wide>Sign in</Button>
      </form>
    )
  }
  return (
    <div className="m-stack">
      <Row lead={<span className="m-avatar">{(session.name || session.email).slice(0, 1).toUpperCase()}</span>} title={session.name || session.email} meta={`${session.email}${session.role ? ' · ' + session.role : ''}`} />
      <Row title="esbpowerline.com" meta={status.connected ? `Connected · ${status.latencyMs} ms` : status.sessionEnded ? 'Session ended: sign in again' : status.statusText ?? 'Not connected'} trail={<Button kind="text" icon="refresh" onClick={() => { void check() }}>Check</Button>} />
      <div className="m-feature-list">
        <div className="m-feature"><span>Save drafts, publish, update articles</span><strong>Works</strong></div>
        <div className="m-feature"><span>Picture upload</span><strong className={feat.upload === 'live' ? '' : 'is-planned'}>{STATE_LABEL[feat.upload]}</strong></div>
        <div className="m-feature"><span>Cache refresh after publish</span><strong className={feat.revalidate === 'live' ? '' : 'is-planned'}>{STATE_LABEL[feat.revalidate]}</strong></div>
        <div className="m-feature"><span>Link fetching through the site</span><strong className={feat.fetchArticle === 'live' ? '' : 'is-planned'}>{STATE_LABEL[feat.fetchArticle]}</strong></div>
      </div>
      <div className="m-btnrow">
        <Button kind="tonal" icon="refresh" busy={probing} onClick={() => { void reprobe() }}>Check site features</Button>
        <Button kind="outlined" onClick={() => { logout(); snack('Signed out') }}>Sign out</Button>
      </div>
    </div>
  )
}

function KeyField({ id, ai, onSave }: { id: AiProviderId; ai: AiSettings; onSave: (s: AiSettings) => void }) {
  const meta = AI_PROVIDERS.find((p) => p.id === id)!
  const [val, setVal] = useState(ai.keys[id])
  const [show, setShow] = useState(false)
  const [models, setModels] = useState<AiModelInfo[] | null>(null)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = val.trim() !== ai.keys[id]
  // a saved key lists that account's models on its own, so the model can be changed without running a test first
  useEffect(() => {
    const k = ai.keys[id]
    if (!k || models || ai.paused) return
    let dead = false
    void listModels(id, k).then((m) => { if (!dead && m.length) setModels(m) }).catch(() => undefined)
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.keys[id], ai.paused])
  const save = () => { onSave({ ...ai, keys: { ...ai.keys, [id]: val.trim() } }); snack(`${meta.name} key saved on this phone`, { tone: 'success' }) }
  const test = async () => {
    setTesting(true); setResult(null)
    try {
      const r = await testAiKey(id, val.trim(), ai.models[id])
      setResult(r.ok ? { ok: true, text: `Key works${r.model ? ` · ${r.model}` : ''}` } : { ok: false, text: r.error ?? 'The key did not work.' })
      if (r.ok) setModels(r.models ?? (await listModels(id, val.trim()).catch(() => null)))
    } finally { setTesting(false) }
  }
  return (
    <Collapse title={meta.name} sub={ai.keys[id] ? 'Key saved' : 'No key'} defaultOpen={id === ai.provider && !ai.keys[id]}>
      <div className="m-stack">
        <p className="m-muted">{meta.help}</p>
        <label className="m-field">
          <span className="m-field-label">API key</span>
          <span className="m-input-row">
            <input className="m-input" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder={meta.keyPlaceholder} value={val} onChange={(e) => setVal(e.target.value)} />
            <button type="button" className="m-iconbtn" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} size={22} /></button>
          </span>
        </label>
        <label className="m-field">
          <span className="m-field-label">Model</span>
          <select className="m-select" value={ai.models[id]} onChange={(e) => onSave({ ...ai, models: { ...ai.models, [id]: e.target.value } })}>
            <option value="auto">{meta.autoLabel}</option>
            {ai.models[id] !== 'auto' && !models?.some((m) => m.id === ai.models[id]) && <option value={ai.models[id]}>{ai.models[id]}</option>}
            {(models ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {!models && <span className="m-field-help">Test the key to list this account's models.</span>}
        </label>
        {result && <Banner tone={result.ok ? 'success' : 'error'}>{result.text}</Banner>}
        <div className="m-btnrow">
          <Button kind="tonal" busy={testing} disabled={!val.trim() || ai.paused} onClick={() => { void test() }}>Test key</Button>
          <Button disabled={!dirty} onClick={save}>Save</Button>
          {ai.keys[id] && <Button kind="text" onClick={() => { setVal(''); onSave({ ...ai, keys: { ...ai.keys, [id]: '' } }); snack(`${meta.name} key removed`) }}>Remove</Button>}
        </div>
      </div>
    </Collapse>
  )
}

function AiSection() {
  const ai = useEditorialStore((s) => s.ai)
  const setAi = useEditorialStore((s) => s.setAiSettings)
  const setPaused = useEditorialStore((s) => s.setAiPaused)
  const roleRow = (role: 'seo' | 'social', label: string) => (
    <label className="m-field">
      <span className="m-field-label">{label}</span>
      <select className="m-select" value={ai[role]} onChange={(e) => setAi({ ...ai, [role]: e.target.value as AiProviderId | '' })}>
        <option value="">Same as the main provider</option>
        {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}{ai.keys[p.id] ? '' : ' (no key)'}</option>)}
      </select>
    </label>
  )
  return (
    <div className="m-stack">
      <Row title="AI is on" meta={ai.paused ? 'Paused: no AI company is contacted; the free translation service is used.' : 'Translation, SEO and captions use the providers below.'} trail={<button type="button" role="switch" aria-checked={!ai.paused} aria-label="AI on" className={`m-switch${ai.paused ? '' : ' is-on'}`} onClick={() => setPaused(!ai.paused)}><span /></button>} />
      <div className="m-field">
        <span className="m-field-label">Main provider (story and translation)</span>
        <div className="m-chips">{AI_PROVIDERS.map((p) => <Chip key={p.id} on={ai.provider === p.id} onClick={() => setAi({ ...ai, provider: p.id })}>{p.name}</Chip>)}</div>
      </div>
      {roleRow('seo', 'SEO writing')}
      {roleRow('social', 'Social captions')}
      <Row title="Second opinion on figures" meta="When the translation's figures disagree with the source, ask once more on a stronger model." trail={<button type="button" role="switch" aria-checked={!!ai.escalate?.main} aria-label="Second opinion" className={`m-switch${ai.escalate?.main ? ' is-on' : ''}`} onClick={() => setAi({ ...ai, escalate: { ...ai.escalate, main: !ai.escalate?.main } })}><span /></button>} />
      {AI_PROVIDERS.map((p) => <KeyField key={p.id} id={p.id} ai={ai} onSave={setAi} />)}
      <Collapse title="Translation prompt" sub={ai.prompt ? 'Your own prompt' : 'Built-in newsroom prompt'}>
        <label className="m-field">
          <span className="m-field-label">Prompt (empty = the built-in newsroom prompt)</span>
          <textarea className="m-textarea" rows={6} value={ai.prompt} onChange={(e) => setAi({ ...ai, prompt: e.target.value })} />
        </label>
      </Collapse>
      <p className="m-muted">Keys stay in this phone's secure storage (Android Keystore). Each call goes straight to the provider with your key.</p>
    </div>
  )
}

function FacebookSection() {
  const [fb, setFb] = useState(getFacebook())
  const [pageId, setPageId] = useState(fb?.pageId ?? '')
  const [token, setToken] = useState('')
  const linkComment = useFacebookPrefs((s) => s.linkComment)
  const setLinkComment = useFacebookPrefs((s) => s.setLinkComment)
  if (fb) {
    return (
      <div className="m-stack">
        <Row title={fb.pageName || `Page ${fb.pageId}`} meta={`Page id ${fb.pageId}${fb.permanent ? ' · token does not expire' : ''}`} />
        <Row title="Link in the first comment" meta="After a post, add the story link as the first comment." trail={<button type="button" role="switch" aria-checked={linkComment} aria-label="Link in first comment" className={`m-switch${linkComment ? ' is-on' : ''}`} onClick={() => setLinkComment(!linkComment)}><span /></button>} />
        <Button kind="outlined" onClick={() => { clearFacebook(); setFb(null); snack('Facebook Page removed from this phone') }}>Remove Page</Button>
      </div>
    )
  }
  return (
    <form className="m-stack" onSubmit={(e) => { e.preventDefault(); const c = { pageId: pageId.trim(), token: token.trim() }; saveFacebook(c); const ok = getFacebook(); setFb(ok); setToken(''); snack(ok ? 'Facebook Page saved' : 'The Page id must be digits and the token filled in', { tone: ok ? 'success' : 'error' }) }}>
      <p className="m-muted">Posting needs the Page id and a Page access token. Nothing is posted until you press Post and confirm it.</p>
      <label className="m-field"><span className="m-field-label">Page id</span><input className="m-input" inputMode="numeric" value={pageId} onChange={(e) => setPageId(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="m-field"><span className="m-field-label">Page access token</span><input className="m-input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
      <Button type="submit" disabled={!pageId || !token}>Save Page</Button>
    </form>
  )
}

export default function SettingsScreen({ onClose }: { onClose: () => void }) {
  const section = useNav((s) => s.settingsSection)
  const [mode, setMode] = useState<LinkFetchMode>(getLinkFetchMode())
  const [theme, setTheme] = useState<ThemePref>(getThemePref())
  const [lock, setLock] = useState(isAppLockEnabled())
  const [bio, setBio] = useState<boolean | null>(null)
  useEffect(() => { void isBiometricAvailable().then((r) => setBio(r.available)) }, [])
  useEffect(() => { if (section) document.getElementById(`set-${section}`)?.scrollIntoView({ block: 'start' }) }, [section])

  return (
    <FullDialog open title="Settings" onClose={onClose}>
      <div className="m-wrap m-settings">
        <Section title="Site account" id="set-site"><SiteAccount /></Section>
        <Section title="AI providers" id="set-ai"><AiSection /></Section>
        <Section title="Link fetching" id="set-fetch">
          <div className="m-stack">
            <Segmented label="Link fetching" value={mode} onChange={(m) => { setMode(m); setLinkFetchMode(m) }} options={[{ value: 'site', label: 'Through the site' }, { value: 'device', label: 'This phone' }]} />
            <p className="m-muted">{mode === 'site'
              ? 'Pasted links are read by esbpowerline.com (staff route). Until the site update is deployed this says "not connected" and you paste the text instead. Feeds (Wire) need "This phone".'
              : 'This phone reads the public page itself, the way the PC app does, after the same safety checks (public https addresses only). Feeds (Wire) work in this mode.'}</p>
          </div>
        </Section>
        <Section title="Facebook" id="set-facebook"><FacebookSection /></Section>
        <Section title="Appearance" id="set-theme">
          <Segmented label="Theme" value={theme} onChange={(t) => { setTheme(t); setThemePref(t) }} options={[{ value: 'auto', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Section>
        <Section title="Security" id="set-lock">
          <Row title="App lock" meta={bio === false ? 'This phone has no fingerprint, face or screen lock set up.' : 'Ask for fingerprint, face or screen lock when ESB Studio opens.'} trail={<button type="button" role="switch" aria-checked={lock} aria-label="App lock" disabled={bio === false} className={`m-switch${lock ? ' is-on' : ''}`} onClick={() => { const want = !lock; void setAppLockEnabled(want).then((state) => { setLock(state); if (state !== want) snack('App lock was not turned on (the phone did not confirm it is you).', { tone: 'error' }) }) }}><span /></button>} />
        </Section>
        <Section title="About" id="set-about">
          <Row title="ESB Studio" meta={`Version ${__APP_VERSION__}`} />
          <Row title="Engine and editor" meta={`ESB AI Studio (PC) ${manifest.commit.slice(0, 9)} · ${Object.keys(manifest.files).length} files`} />
        </Section>
      </div>
    </FullDialog>
  )
}
