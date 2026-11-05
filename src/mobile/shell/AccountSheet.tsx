// Account sheet: who is signed in, is the site reachable, which AI engine is on, light/dark, Settings.
// Replaces the old popup menu: a phone sheet you can reach with a thumb. Every value is read from the live stores.
import { useState } from 'react'
import { runConnectionCheck, type ConnectionCheck } from '../../pc/editorial/siteConnect'
import { RoleChip } from './cat'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { aiFor, loadAiSettings, providerMeta } from '../../pc/editorial/aiProviders'
import { getThemePref, setThemePref, type ThemePref } from '../../shell/theme'
import { useNav } from './nav'
import { platform } from '../../platform/platform'
import { useOnline, useUi } from './core'
import { Icon, Segmented, Sheet, type IconName } from './ui'
import './account.css'

/** Change the theme smoothly: the slider finishes its glide first, then the new colours land in one frame with every
 *  colour transition switched off (dozens of elements each animating their own colour was the clunky part). */
function switchTheme(v: ThemePref) {
  window.setTimeout(() => {
    const root = document.documentElement
    root.dataset.vtTheme = '1'
    setThemePref(v)
    requestAnimationFrame(() => requestAnimationFrame(() => { delete root.dataset.vtTheme }))
  }, 260)
}

export function openAccount() { useUi.getState().openSheet('account') }

function Tile({ icon, title, meta, trail, onClick }: { icon: IconName; title: string; meta?: string; trail?: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="ac-ico" aria-hidden><Icon name={icon} size={20} /></span>
      <span className="ac-txt"><strong>{title}</strong>{meta && <small>{meta}</small>}</span>
      <span className="ac-trail">{trail ?? (onClick && <Icon name="chevRight" size={20} />)}</span>
    </>
  )
  return onClick ? <button type="button" className="ac-row" onClick={onClick}>{inner}</button> : <div className="ac-row">{inner}</div>
}

export default function AccountSheet() {
  const open = useUi((s) => s.sheet === 'account')
  const session = useEditorialStore((s) => s.staffSession)
  const site = useEditorialStore((s) => s.siteStatus)
  const check = useEditorialStore((s) => s.checkConnection)
  const online = useOnline()
  const nav = useNav()
  const [pref, setPref] = useState<ThemePref>(getThemePref())
  const [checking, setChecking] = useState(false)
  const [checks, setChecks] = useState<ConnectionCheck[] | null>(null)
  const failed = checks?.filter((c) => c.status === 'fail').length ?? 0
  const runCheck = async () => {
    setChecking(true)
    try { await check().catch(() => undefined); setChecks(await runConnectionCheck(session, setChecks)) } finally { setChecking(false) }
  }
  if (!open) return null

  const ai = loadAiSettings()
  const engine = providerMeta(ai.provider).name
  const aiState = ai.paused ? 'Paused' : aiFor('main') ? 'Ready' : 'Needs a key'
  const name = session ? session.name || session.email : 'Not signed in'
  const go = (fn: () => void) => () => { useUi.getState().closeSheet('account'); fn() }
  const siteMeta = !online ? 'Offline · work is saved on the phone' : !session ? 'Sign in to save and publish' : site.connected ? `Connected${site.latencyMs ? ` · ${site.latencyMs} ms` : ''}` : site.sessionEnded ? 'Session ended · sign in again' : 'Not reachable'

  return (
    <Sheet id="account" title="Account" initial="half">
      <div className="ac">
        <section className="ac-me">
          <span className={`ac-avatar${session ? '' : ' is-empty'}`} aria-hidden>{session ? name.slice(0, 1).toUpperCase() : <Icon name="user" size={28} />}</span>
          <span className="ac-me-txt">
            <span className="ac-name"><strong>{name}</strong>{session?.role && <RoleChip role={session.role} />}</span>
            <small>{session ? session.email : 'esbpowerline.com editor account'}</small>
          </span>
        </section>
        <button type="button" className="ac-manage" onClick={go(() => nav.openSettings('site'))}>{session ? 'Manage account' : 'Sign in'}<Icon name="chevRight" size={18} /></button>

        <h3 className="ac-h">Connections</h3>
        <div className="ac-card">
          <div className="ac-row ac-site">
            <span className="ac-ico" aria-hidden><Icon name="globe" size={20} /></span>
            <span className="ac-txt">
              <strong>esbpowerline.com</strong>
              <span className={'ac-status ' + (!online ? 'is-off' : session && site.connected ? 'is-ok' : 'is-warn')}><i aria-hidden />{siteMeta}</span>
            </span>
            <button type="button" className="ac-check" disabled={checking || !online} onClick={() => void runCheck()}>{checking ? 'Checking…' : checks ? 'Run again' : 'Check'}</button>
          </div>
          <Tile icon="sparkle" title={`AI engine · ${engine}`} meta={aiState} onClick={go(() => nav.openSettings('ai'))} />
        </div>

        {checks && (
          <>
            <div className="ac-h ac-h-row"><span>Connection check</span><em className={failed ? 'bad' : 'good'}>{checking ? 'Checking…' : failed ? `${failed} to fix` : 'All clear'}</em></div>
            <ul className="ac-checks" aria-live="polite">
              {checks.map((c) => (
                <li key={c.id} className={'ac-chk is-' + c.status}>
                  <span className="ac-chk-ic" aria-hidden><Icon name={c.status === 'ok' ? 'check' : c.status === 'fail' ? 'x' : 'minus'} size={14} /></span>
                  <span className="ac-chk-t"><b>{c.label}</b><small>{c.detail}</small></span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="ac-h">Appearance</h3>
        <div className="ac-card ac-pad">
          <Segmented<ThemePref> label="Theme" value={pref} onChange={(v) => { setPref(v); switchTheme(v) }} options={[
            { value: 'auto', label: 'Auto', icon: 'chip' },
            { value: 'light', label: 'Light', icon: 'sun' },
            { value: 'dark', label: 'Dark', icon: 'moon' },
          ]} />
        </div>

        <div className="ac-card ac-gap">
          <Tile icon="sliders" title="Settings" meta="Account, AI, Facebook, security, updates" onClick={go(() => nav.openSettings())} />
          <Tile icon="info" title="About ESB AI Studio" meta={`Version ${__APP_VERSION__}`} onClick={go(() => nav.openSettings('about'))} />
        </div>
        <p className="ac-credit">
          <span className="ac-ver">v{__APP_VERSION__}</span>
          <span>Made with <i aria-label="love">♥</i> by <button type="button" onClick={() => void platform().openExternal('https://facebook.com/chiefhamim')}>Hamim Ruwayfi</button></span>
        </p>
      </div>
    </Sheet>
  )
}
