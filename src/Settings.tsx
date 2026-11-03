// Settings sheet: AI key, Facebook Page credentials, site sign-in status. Secrets only through secure.ts; a stored value
// is never read back into a field (only "Saved" / "Not set" is shown).
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteSecret, hasSecret, setSecret, type SecretName } from './secure'
import { errorMessage, testGeminiKey } from './aiProviders'

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
      <p className="note" role="status">{status === 'loading' ? 'Checking...' : status === 'saved' ? 'Saved' : 'Not set'}</p>
      {showInput && (
        <input id={id} type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          value={value} onChange={(e) => { setValue(e.target.value); setMsg('') }} placeholder={hint ?? 'Paste here'} aria-describedby={`${id}-msg`} />
      )}
      <div className="set-row">
        {showInput && <button type="button" className="primary" onClick={save}>{status === 'saved' ? 'Replace' : 'Save'}</button>}
        {status === 'saved' && !editing && <button type="button" className="secondary" onClick={() => { setEditing(true); setMsg('') }}>Replace</button>}
        {editing && <button type="button" className="secondary" onClick={() => { setEditing(false); setValue('') }}>Cancel</button>}
        {status === 'saved' && <button type="button" className="secondary" onClick={remove}>Remove</button>}
      </div>
      <p id={`${id}-msg`} className="note" aria-live="polite">{msg}</p>
    </div>
  )
}

export default function Settings({ onClose }: { onClose: () => void }) {
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

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
        <h1>Settings</h1>
        <button type="button" className="secondary" onClick={onClose} aria-label="Close settings">Close</button>
      </header>
      <div className="settings-body">
        <h2>AI (Gemini)</h2>
        <SecretField name="gemini-key" label="Gemini API key" hint="AIza..." onSaved={() => setTest({ state: 'idle', text: '' })} />
        <button type="button" className="secondary" onClick={runTest} disabled={test.state === 'running'}>Test key</button>
        <p className={`note set-test set-${test.state}`} role="status" aria-live="polite">{test.text}</p>

        <h2>Facebook Page</h2>
        <SecretField name="fb-page-id" label="Page ID" hint="Numeric Page ID" />
        <SecretField name="fb-page-token" label="Page access token" hint="Paste the Page token" />

        <h2>Site</h2>
        <div className="card">
          <p className="note">Site sign-in: set up in Publish</p>
        </div>

        <p className="note set-where">Keys and tokens are kept in the phone's secure storage (Android Keystore). They are never shown again after saving, never put in a link, and never written to a log. In a desktop browser test they are held in memory only and lost on reload.</p>
      </div>
    </section>
  )
}
