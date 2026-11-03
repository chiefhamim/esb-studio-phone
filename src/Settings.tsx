// Settings sheet, in groups: AI, Facebook Page, Site account, Appearance, Privacy, About.
// Secrets only through secure.ts; a stored value is never read back into a field (only "Saved" / "Not set" is shown).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { deleteSecret, hasSecret, setSecret, type SecretName } from './secure'
import { errorMessage, testGeminiKey } from './aiProviders'
import { loadFacebook, verifyFacebook } from './publish/facebook'
import { loadSession, signIn, signOut } from './publish/site'
import type { StaffSession } from './publish/site'
import { checkConnection, CONNECTION_LABEL } from './sync/connection'
import type { Connection } from './sync/connection'
import { probeFeature } from './sync/endpoints'
import type { Availability, Feature } from './sync/endpoints'
import { applyTheme, readTheme } from './theme'
import type { ThemeChoice } from './theme'
import { isAppLockEnabled, isBiometricAvailable, setAppLockEnabled } from './native/biometric'
import {
  IconChevronRight,
  IconSparkle,
  IconGlobe,
  IconSun,
  IconLock,
  IconInfo,
  IconLink
} from './shell/icons'
import './ui/settings.css'

function AppLock() {
  const [on, setOn] = useState(isAppLockEnabled())
  const [can, setCan] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { void isBiometricAvailable().then((a) => setCan(a.available)).catch(() => setCan(false)) }, [])
  async function toggle() {
    setMsg('')
    const next = await setAppLockEnabled(!on)
    setOn(next)
    if (!on && !next) setMsg('Could not turn it on. Check that a fingerprint, face or screen lock is set up on this phone.')
  }
  return (
    <div className="card">
      <button type="button" className="secondary" role="switch" aria-checked={on} disabled={can === false} onClick={() => void toggle()}>{on ? 'App lock: ON (tap to turn off)' : 'Turn on app lock'}</button>
      <p className="note">{can === false ? 'This phone has no fingerprint, face or screen lock available to this app.' : 'Asks for your fingerprint, face or screen lock when the app opens and after 30 seconds in the background.'}</p>
      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  )
}

type Status = 'loading' | 'saved' | 'unset'

function SecretField({ name, label, hint, onSaved }: { name: SecretName; label: string; hint?: string; onSaved?: () => void }) {
  const [status, setStatus] = useState<Status>('loading')
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState('')
  const id = `set-${name}`

  useEffect(() => { void hasSecret(name).then((h) => setStatus(h ? 'saved' : 'unset')).catch(() => setStatus('unset')) }, [name])

  const save = async () => {
    const v = value.trim()
    if (!v) { setMsg('Type or paste a value first.'); return }
    try {
      await setSecret(name, v)
      setValue(''); setEditing(false); setStatus('saved'); setMsg('Saved.')
      onSaved?.()
    } catch { setMsg('Could not save to secure storage. Nothing was stored.') }
  }
  const remove = async () => {
    try { await deleteSecret(name); setStatus('unset'); setEditing(false); setValue(''); setMsg('Removed.'); onSaved?.() } catch { setMsg('Could not remove it.') }
  }
  const showInput = status === 'unset' || editing

  return (
    <div className="card set-field">
      <label htmlFor={id}>{label}</label>
      <p className={`st-pill st-${status}`} role="status">{status === 'loading' ? 'Checking...' : status === 'saved' ? 'Saved in Keystore' : 'Not set'}</p>
      {showInput && (
        <input id={id} type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          value={value} onChange={(e) => { setValue(e.target.value); setMsg('') }} placeholder={hint ?? 'Paste here'} aria-describedby={`${id}-msg`} />
      )}
      <div className="set-row">
        {showInput && <button type="button" className="primary" onClick={() => { void save() }}>{status === 'saved' ? 'Replace' : 'Save'}</button>}
        {status === 'saved' && !editing && <button type="button" className="secondary" onClick={() => { setEditing(true); setMsg('') }}>Replace</button>}
        {editing && <button type="button" className="secondary" onClick={() => { setEditing(false); setValue('') }}>Cancel</button>}
        {status === 'saved' && <button type="button" className="secondary" onClick={() => { void remove() }}>Remove</button>}
      </div>
      <p id={`${id}-msg`} className="note" aria-live="polite">{msg}</p>
    </div>
  )
}

function Group({ id, title, icon, children }: { id: string; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="st-group" aria-labelledby={`st-${id}`}>
      <div className="st-group-h">
        {icon && <span className="st-group-ic" aria-hidden>{icon}</span>}
        <h2 id={`st-${id}`}>{title}</h2>
      </div>
      <div className="st-group-card">
        {children}
      </div>
    </section>
  )
}

function FacebookCheck() {
  const [state, setState] = useState<{ kind: 'idle' | 'running' | 'ok' | 'fail'; text: string }>({ kind: 'idle', text: '' })
  const run = async () => {
    setState({ kind: 'running', text: 'Asking Facebook which Page this token belongs to. Nothing is posted...' })
    const cfg = await loadFacebook()
    if (!cfg) { setState({ kind: 'fail', text: 'Save a numeric Page ID and a Page token first.' }); return }
    const r = await verifyFacebook(cfg)
    setState(r.ok ? { kind: 'ok', text: `Connected to the Page "${r.name}".` } : { kind: 'fail', text: r.error })
  }
  return (
    <>
      <button type="button" className="secondary" onClick={() => { void run() }} disabled={state.kind === 'running'}>Check connection</button>
      <p className={`note set-test set-${state.kind}`} role="status" aria-live="polite">{state.text}</p>
    </>
  )
}

function featWord(a: Availability | undefined): string {
  return a === 'available' ? 'works' : a === 'unavailable' ? 'Planned (the site has not been updated for it yet)' : a === 'unknown' ? 'could not check' : 'checking'
}

function SiteAccount() {
  const [session, setSession] = useState<StaffSession | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [conn, setConn] = useState<Connection | 'checking'>('checking')
  const [feat, setFeat] = useState<Partial<Record<Feature, Availability>>>({})
  useEffect(() => { void loadSession().then(setSession).catch(() => setSession(null)) }, [])
  useEffect(() => {
    let live = true
    void checkConnection().then((c) => { if (live) setConn(c) }).catch(() => { if (live) setConn('offline') })
    if (session) for (const k of ['upload', 'revalidate', 'fetchArticle'] as const) void probeFeature(k, { force: true }).then((a) => { if (live) setFeat((o) => ({ ...o, [k]: a })) })
    return () => { live = false }
  }, [session])
  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg('')
    const r = await signIn(email, password)
    setPassword('') // never kept
    setBusy(false)
    if (r.ok) { setSession(r.session); setEmail('') } else setMsg(r.error)
  }
  if (session === undefined) return <div className="card"><p className="note" role="status">Checking...</p></div>
  return (
    <div className="card">
      {session ? (
        <>
          <p className={`st-pill ${conn === 'connected' ? 'st-saved' : 'st-unset'}`} role="status">{conn === 'checking' ? 'Checking...' : CONNECTION_LABEL[conn]}</p>
          {conn === 'expired' && <p className="note">The site ended this sign-in. Sign out, then sign in again below.</p>}
          {conn === 'offline' && <p className="note">The site cannot be reached right now. Your sign-in is kept.</p>}
          <p className="note">{session.name} ({session.email}){session.role ? `, ${session.role.toLowerCase()}` : ''}. The sign-in is kept in secure storage; the password is not.</p>
          <ul className="note" aria-label="Site features">
            <li>Save and publish stories: works</li>
            <li>Picture upload: {featWord(feat.upload)}</li>
            <li>Refresh public pages after publishing: {featWord(feat.revalidate)}</li>
            <li>Fetch a pasted news link: {featWord(feat.fetchArticle)}</li>
          </ul>
          <button type="button" className="secondary" onClick={() => { void signOut().then(() => setSession(null)) }}>Sign out</button>
        </>
      ) : (
        <form onSubmit={(e) => { void login(e) }}>
          <p className="st-pill st-unset" role="status">Not signed in</p>
          <label htmlFor="st-email">Email</label>
          <input id="st-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="st-pass">Password (not stored)</label>
          <input id="st-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="primary" disabled={busy || !email || !password}>Sign in</button>
          {msg && <p className="set-test set-fail" role="alert">{msg}</p>}
        </form>
      )}
    </div>
  )
}

const THEMES: { id: ThemeChoice; label: string }[] = [{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]

export default function Settings({ onClose }: { onClose: () => void }) {
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const [theme, setTheme] = useState<ThemeChoice>(readTheme)
  const [version, setVersion] = useState('Checking...')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let live = true
    if (!Capacitor.isNativePlatform()) { void Promise.resolve().then(() => { if (live) setVersion('Browser preview (no app version outside the installed app)') }); return () => { live = false } }
    import('@capacitor/app').then(({ App }) => App.getInfo()).then((i) => { if (live) setVersion(`${i.version} (build ${i.build})`) }).catch(() => { if (live) setVersion('Could not read the app version.') })
    return () => { live = false }
  }, [])

  const runTest = useCallback(async () => {
    abort.current?.abort()
    const c = new AbortController()
    abort.current = c
    setTest({ state: 'running', text: 'Testing...' })
    try {
      const r = await testGeminiKey(c.signal)
      setTest({ state: 'ok', text: r.message })
    } catch (e) {
      setTest({ state: 'fail', text: errorMessage(e) })
    }
  }, [])

  return (
    <section className="settings" role="dialog" aria-modal="true" aria-label="Settings">
      <header className="settings-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <button
            type="button"
            className="kit-iconbtn"
            onClick={onClose}
            aria-label="Back"
            style={{ transform: 'rotate(180deg)' }}
          >
            <IconChevronRight />
          </button>
          <h1>Settings</h1>
        </div>
        <button type="button" className="kit-btn kit-btn-tonal" onClick={onClose} aria-label="Done with settings" style={{ minHeight: 40, padding: '0 var(--sp-4)' }}>Done</button>
      </header>
      <div className="settings-body">
        <Group id="ai" title="AI Configuration" icon={<IconSparkle />}>
          <SecretField name="gemini-key" label="Gemini API key" hint="AIza..." onSaved={() => setTest({ state: 'idle', text: '' })} />
          <button type="button" className="secondary" onClick={() => { void runTest() }} disabled={test.state === 'running'}>Test Gemini connection</button>
          <p className={`note set-test set-${test.state}`} role="status" aria-live="polite">{test.text}</p>
          <p className="note">Claude and OpenAI keys: Planned.</p>
        </Group>

        <Group id="fb" title="Facebook Page Integration" icon={<IconLink />}>
          <SecretField name="fb-page-id" label="Page ID" hint="Numeric Page ID" />
          <SecretField name="fb-page-token" label="Page access token" hint="Paste the Page token" />
          <FacebookCheck />
        </Group>

        <Group id="site" title="Site Account (esbpowerline.com)" icon={<IconGlobe />}>
          <SiteAccount />
        </Group>

        <Group id="look" title="Appearance & Theme" icon={<IconSun />}>
          <div className="st-seg" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={theme === t.id ? 'on' : ''} onClick={() => { setTheme(t.id); applyTheme(t.id) }}>{t.label}</button>
            ))}
          </div>
          <p className="note">Auto follows Android dark/light system preference. Light and Dark override it on this phone.</p>
        </Group>

        <Group id="lock" title="Privacy & Security" icon={<IconLock />}>
          <AppLock />
        </Group>

        <Group id="about" title="About ESB Studio" icon={<IconInfo />}>
          <div className="card">
            <p className="note"><b>ESB Studio Phone</b>, the newsroom companion to ESB AI Studio.</p>
            <p className="note">Version: {version}</p>
          </div>
        </Group>

        <p className="note set-where">Keys and tokens are kept strictly in the phone&apos;s hardware-backed secure storage (Android Keystore via SecureStorage). They are never shown again after saving, never exposed in URLs, and never written to logs.</p>
      </div>
    </section>
  )
}
