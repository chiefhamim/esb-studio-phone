// Intake: a news link (Bengali or English) with Paste and Fetch, or pasted text / a PDF or Word file to translate.
// The PC desk's launcher (EditorialWorkspace.tsx intakeForm) as one phone task; errors are the PC's describeIntakeError,
// and the phone's own "link fetching is not live yet" answer links to Settings instead of pretending.
import { useEffect, useRef } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { aiFor, providerMeta } from '../../pc/editorial/aiProviders'
import { fmtFileSize } from '../../pc/editorial/importDocument'
import { platform } from '../../platform/platform'
import { getLinkFetchMode } from '../../platform/fetchGuarded'
import { Banner, Button, IconBtn, Icon, TopBar } from '../shell/ui'
import { useNav } from '../shell/nav'
import { FileTypeIcon, FileTypePair, ProviderMark } from '../shell/marks'
import { useOnline } from '../shell/core'
import { cancelJob, canCancel, fetchLink, newStory, readClipboardText, readFile, translatePasted, useDesk } from './deskStore'
import { JobProgress } from './JobProgress'
import { sharedTools } from './Landing'
import { AccountButton } from '../shell/AccountSheet'
import { FlowTrack, StepSub } from './Pipeline'
import { afterSlide, slideTo } from '../shell/slide'

export function Intake() {
  const d = useDesk()
  const ai = useEditorialStore((s) => s.ai)
  const main = aiFor('main', ai)
  const online = useOnline()
  const urlRef = useRef<HTMLInputElement>(null)
  const rawRef = useRef<HTMLTextAreaElement>(null)
  // The text box grows with what is in it (and can still be dragged taller).
  useEffect(() => { const t = rawRef.current; if (!t) return; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px` }, [d.raw, d.intakeTab])
  // the keyboard opens only after the slide in has landed (a resize mid-slide makes the browser abandon the transition)
  useEffect(() => { if (d.focusUrlAt && d.intakeTab === 'link') afterSlide(() => requestAnimationFrame(() => urlRef.current?.focus())) }, [d.focusUrlAt, d.intakeTab])
  const busy = d.busy === 'fetch' || d.busy === 'translate' || d.busy === 'doc'
  const pickDoc = async () => {
    const files = await platform().pickFiles({ accept: ['application/pdf', '.docx'] }).catch(() => [])
    if (files[0]) { d.set({ intakeTab: 'text', error: null }); void readFile(files[0]) }
  }
  const err = d.error
  const fetchNotLive = err?.code === 'not_live' || /not live yet|Planned/i.test(err?.detail ?? '')
  const link = d.intakeTab === 'link'
  return (
    <>
      <TopBar leading={<IconBtn icon="chevLeft" label="Back to stories" onClick={() => slideTo(-1, () => d.set({ view: 'home', error: null }))} />} title="Editorial"
        sub={<StepSub extra={main ? providerMeta(main.provider).name : 'Free translation'} />} under={<FlowTrack />} trailing={<AccountButton />}
        overflow={[
          // Editorial's own: the story list (also on Home) and a blank story; then the tools every desk shares
          { label: 'All stories', icon: 'newspaper', onClick: () => slideTo(-1, () => d.set({ view: 'home', homeTab: 'stories', error: null })) },
          { label: 'Write a blank story', icon: 'plus', onClick: () => newStory('story') },
          { divider: true, label: '', onClick: () => {} },
          ...sharedTools(),
        ]} />
      <div className="m-scroll">
        <div className="m-wrap me-intake">
          {!online && <Banner tone="warn">You are offline. Links and translation need the network.</Banner>}
          {link ? (
            <>
              <section className="me-desk" aria-label="Start a story" data-provider={main?.provider}>
                <div className="me-compose">
                  <header className="me-desk-head">
                    <span className="me-desk-ic" aria-hidden><Icon name="power" size={22} /></span>
                    <div><h2>Start from a link</h2><p>Paste a Bengali or English news link. It is read, translated into newsroom English and laid out as a draft, with the original kept under Source for checking.</p></div>
                  </header>
                  <label className="me-link" htmlFor="me-url">
                    <Icon name="link" size={18} />
                    <input id="me-url" ref={urlRef} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Paste a news story link" aria-label="News story link" value={d.url}
                      onChange={(e) => d.set({ url: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === 'Enter') void fetchLink() }} disabled={busy} />
                    {d.url
                      ? <button type="button" className="me-link-x" aria-label="Clear the link" onClick={() => d.set({ url: '', error: null })} disabled={busy}><Icon name="x" size={16} /></button>
                      : <button type="button" className="me-link-paste" onClick={async () => { const t = (await readClipboardText()).trim(); if (t) d.set({ url: t, error: null }); else urlRef.current?.focus() }}><Icon name="copy" size={15} /><span>Paste</span></button>}
                  </label>
                  <button type="button" className="me-go" disabled={!d.url.trim() || busy || !online} onClick={() => void fetchLink()}>
                    {main ? <ProviderMark id={main.provider} size={18} /> : <Icon name="sparkle" size={18} />}<span>{d.busy === 'fetch' ? 'Fetching the story' : 'Fetch & Process'}</span>
                  </button>
                  {getLinkFetchMode() === 'site' && (
                    <p className="me-hint"><Icon name="info" size={14} /> Links are read through esbpowerline.com (Settings). If that route is not live yet, switch to “This phone” or paste the text.</p>
                  )}
                </div>
                <div className="me-or" aria-hidden><span>or start from</span></div>
                <div className="me-group">
                  <button type="button" className="me-rowbtn" onClick={() => void pickDoc()} disabled={busy}>
                    <span className="me-file-icons" aria-hidden><FileTypeIcon kind="pdf" size={42} /><FileTypeIcon kind="docx" size={42} /></span>
                    <span className="me-rowbtn-txt"><b>PDF or Word file</b><small>Attach file</small></span>
                    <Icon name="chevRight" size={20} />
                  </button>
                  <button type="button" className="me-rowbtn" onClick={() => d.set({ intakeTab: 'text', error: null })}>
                    <span className="me-rowbtn-ico" aria-hidden><Icon name="edit" size={20} /></span>
                    <span className="me-rowbtn-txt"><b>Paste text</b><small>Type or paste the story</small></span>
                    <Icon name="chevRight" size={20} />
                  </button>
                </div>
              </section>
            </>
          ) : (
            <>
            <section className="me-stack">
              {(d.doc || d.busy === 'doc') && <div className="me-doc has">
                <span className="me-doc-ic" aria-hidden>{d.doc ? <FileTypeIcon kind={d.doc.kind === 'pdf' ? 'pdf' : 'docx'} size={44} /> : <FileTypePair size={44} />}</span>
                <div className="me-doc-t">
                  {d.busy === 'doc' ? <><b>{d.status || 'Reading the file'}</b><span>This takes a few seconds</span></>
                    : d.doc && <><b className="me-break">{d.doc.name}</b><span>{d.doc.kind === 'pdf' ? `${d.doc.pages} ${d.doc.pages === 1 ? 'page' : 'pages'} · ` : ''}{fmtFileSize(d.doc.size)} · {d.doc.words.toLocaleString()} words</span></>}
                </div>
                {d.doc && <IconBtn icon="x" label="Remove the file" onClick={() => d.set({ doc: null, raw: '' })} disabled={busy} />}
              </div>}
              {d.doc && d.doc.warnings.length > 0 && <Banner tone="warn">{d.doc.warnings.join(' ')}</Banner>}
              <label className="m-field" htmlFor="me-raw">
                <span className="m-field-label"><span>Story text</span><span className="m-field-count">{d.raw.trim().length.toLocaleString()} characters</span></span>
                <textarea id="me-raw" ref={rawRef} lang="bn" className="m-textarea me-bn me-raw" rows={10} value={d.raw} placeholder="Paste the Bengali (or English) headline on the first line, then the story" onChange={(e) => d.set({ raw: e.target.value, doc: null, error: null })} disabled={busy} />
              </label>
              {!d.raw && <Button kind="text" icon="copy" onClick={async () => { const t = await readClipboardText(); if (t) d.set({ raw: t }) }}>Paste from clipboard</Button>}
            </section>
            </>
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
      {(!link || canCancel(d.busy)) && (
  <footer className="m-actionbar">
          {canCancel(d.busy) && <Button kind="text" onClick={cancelJob}>Cancel</Button>}
          <span className="m-spacer" />
          {!link && <Button icon="sparkle" busy={d.busy === 'translate'} disabled={!d.raw.trim() || busy} onClick={() => void translatePasted()}>{d.busy === 'translate' ? 'Translating' : 'Translate'}</Button>}
        </footer>
      )}
    </>
  )
}
