// Intake: a news link (Bengali or English) with Paste and Fetch, or pasted text / a PDF or Word file to translate.
// The PC desk's launcher (EditorialWorkspace.tsx intakeForm) as one phone task; errors are the PC's describeIntakeError,
// and the phone's own "link fetching is not live yet" answer links to Settings instead of pretending.
import { useEffect, useRef } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { aiFor, providerMeta } from '../../pc/editorial/aiProviders'
import { fmtFileSize } from '../../pc/editorial/importDocument'
import { platform } from '../../platform/platform'
import { getLinkFetchMode } from '../../platform/fetchGuarded'
import { Banner, Button, IconBtn, Icon, Segmented, TopBar } from '../shell/ui'
import { useNav } from '../shell/nav'
import { useOnline } from '../shell/core'
import { cancelJob, canCancel, fetchLink, readClipboardText, readFile, translatePasted, useDesk } from './deskStore'
import type { IntakeTab } from './deskStore'
import { JobProgress } from './JobProgress'
import { homeMenu } from './Landing'

export function Intake() {
  const d = useDesk()
  const ai = useEditorialStore((s) => s.ai)
  const main = aiFor('main', ai)
  const online = useOnline()
  const urlRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (d.focusUrlAt && d.intakeTab === 'link') requestAnimationFrame(() => urlRef.current?.focus()) }, [d.focusUrlAt, d.intakeTab])
  const busy = d.busy === 'fetch' || d.busy === 'translate' || d.busy === 'doc'
  const pickDoc = async () => {
    const files = await platform().pickFiles({ accept: ['application/pdf', '.docx'] }).catch(() => [])
    if (files[0]) void readFile(files[0])
  }
  const err = d.error
  const fetchNotLive = err?.code === 'not_live' || /not live yet|Planned/i.test(err?.detail ?? '')
  return (
    <>
      <TopBar leading={<IconBtn icon="chevLeft" label="Back to stories" onClick={() => d.set({ view: 'home', error: null })} />} title="New story"
        sub={main ? `AI: ${providerMeta(main.provider).name}` : 'Free machine translation (no AI key)'} overflow={homeMenu()} />
      <div className="m-scroll">
        <div className="m-wrap me-intake">
          <Segmented<IntakeTab> label="Bring the story" value={d.intakeTab} onChange={(v) => d.set({ intakeTab: v, error: null })} options={[{ value: 'link', label: 'Link', icon: 'link' }, { value: 'text', label: 'Text or file', icon: 'edit' }]} />
          {!online && <Banner tone="warn">You are offline. Links and translation need the network.</Banner>}
          {d.intakeTab === 'link' ? (
            <section className="me-stack">
              <label className="m-field" htmlFor="me-url">
                <span className="m-field-label">News story link</span>
                <div className="me-urlrow">
                  <input id="me-url" ref={urlRef} type="url" inputMode="url" autoComplete="off" spellCheck={false} className="m-input me-url" placeholder="https://…" value={d.url}
                    onChange={(e) => d.set({ url: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === 'Enter') void fetchLink() }} disabled={busy} />
                  {d.url
                    ? <IconBtn icon="x" label="Clear the link" onClick={() => d.set({ url: '', error: null })} disabled={busy} />
                    : <Button kind="tonal" icon="copy" onClick={async () => { const t = (await readClipboardText()).trim(); if (t) d.set({ url: t, error: null }); else urlRef.current?.focus() }}>Paste</Button>}
                </div>
              </label>
              <p className="me-hint">Any Bengali or English news site. The story is read, translated to English and laid out as a draft; the original stays under Source for checking.</p>
              {getLinkFetchMode() === 'site' && (
                <p className="me-hint"><Icon name="info" size={14} /> Link fetching: through esbpowerline.com (Settings). If the site route is not live yet, switch to “This phone” or paste the text.</p>
              )}
            </section>
          ) : (
            <section className="me-stack">
              <div className={'me-doc' + (d.doc ? ' has' : '')}>
                <span className="me-doc-ic" aria-hidden><Icon name={d.doc ? 'check' : 'filePlus'} size={22} /></span>
                <div className="me-doc-t">
                  {d.busy === 'doc' ? <><b>{d.status || 'Reading the file…'}</b><span>This takes a few seconds</span></>
                    : d.doc ? <><b className="me-break">{d.doc.name}</b><span>{d.doc.kind === 'pdf' ? `${d.doc.pages} ${d.doc.pages === 1 ? 'page' : 'pages'} · ` : ''}{fmtFileSize(d.doc.size)} · {d.doc.words.toLocaleString()} words</span></>
                      : <><b>PDF or Word file</b><span>25 MB max · read on this phone</span></>}
                </div>
                {d.doc && <IconBtn icon="x" label="Remove the file" onClick={() => d.set({ doc: null, raw: '' })} disabled={busy} />}
                <Button kind="tonal" onClick={() => void pickDoc()} disabled={busy}>{d.doc ? 'Replace' : 'Choose'}</Button>
              </div>
              {d.doc && d.doc.warnings.length > 0 && <Banner tone="warn">{d.doc.warnings.join(' ')}</Banner>}
              <label className="m-field" htmlFor="me-raw">
                <span className="m-field-label"><span>Story text — headline on the first line</span><span className="m-field-count">{d.raw.trim().length.toLocaleString()} characters</span></span>
                <textarea id="me-raw" lang="bn" className="m-textarea me-bn me-raw" rows={10} value={d.raw} placeholder="Paste the Bengali (or English) headline on the first line, then the story" onChange={(e) => d.set({ raw: e.target.value, doc: null, error: null })} disabled={busy} />
              </label>
              {!d.raw && <Button kind="text" icon="copy" onClick={async () => { const t = await readClipboardText(); if (t) d.set({ raw: t }) }}>Paste from clipboard</Button>}
            </section>
          )}

          {(d.busy === 'fetch' || d.busy === 'translate') && <JobProgress />}

          {err && (
            <div className="m-note m-note-error me-err" role="alert">
              <Icon name="alert" size={18} />
              <div className="m-note-text">
                <b>{fetchNotLive ? 'Link fetching through the site is not live yet' : err.title}</b>
                {fetchNotLive ? <p>The site route that reads links for the phone needs the site update. Paste the article text instead, or set Link fetching to “This phone” in Settings.</p> : err.detail && <p>{err.detail}</p>}
                <div className="me-err-actions">
                  {d.intakeTab === 'link' && !fetchNotLive && <Button kind="text" icon="refresh" onClick={() => void fetchLink()}>Try again</Button>}
                  {fetchNotLive && <Button kind="text" onClick={() => useNav.getState().openSettings('site')}>Link fetching settings</Button>}
                  {(err.canPaste || fetchNotLive) && d.intakeTab === 'link' && <Button kind="text" onClick={() => d.set({ intakeTab: 'text', error: null })}>Paste the text instead</Button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="m-actionbar">
        {canCancel(d.busy) && <Button kind="text" onClick={cancelJob}>Cancel</Button>}
        <span className="m-spacer" />
        {d.intakeTab === 'link'
          ? <Button icon="sparkle" busy={d.busy === 'fetch'} disabled={!d.url.trim() || busy} onClick={() => void fetchLink()}>{d.busy === 'fetch' ? 'Fetching' : 'Fetch & translate'}</Button>
          : <Button icon="sparkle" busy={d.busy === 'translate'} disabled={!d.raw.trim() || busy} onClick={() => void translatePasted()}>{d.busy === 'translate' ? 'Translating' : 'Translate'}</Button>}
      </footer>
    </>
  )
}
