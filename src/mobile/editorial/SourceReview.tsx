// Source review: the original article, untouched, beside nothing else — the link (open, re-fetch), the extraction
// report, the Bengali headline and deck, the figures to check (each marked found / not found in the English draft;
// tap one to find it in the story's Verified view), the draft's flagged discrepancies (facts.ts) and the numbered
// paragraphs. "Edit" corrects the extracted text by hand (the PC's source editor).
import { useMemo, useState } from 'react'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { platform } from '../../platform/platform'
import { Banner, Button, Chip, FullDialog, Icon } from '../shell/ui'
import { useUi } from '../shell/core'
import { fetchLink, retranslate, useDesk } from './deskStore'
import { linkedArticle } from './publish'
import { useFacts } from './useStory'

/** Go to the Story tab's Verified view and pulse the first figure with these digits. */
export function locateFact(digits: string) {
  useUi.getState().closeSheet('ed-source')
  useDesk.setState({ view: 'story', tab: 'story', bodyMode: 'verified', writing: false })
  let tries = 0
  const find = () => {
    const el = document.querySelector<HTMLElement>(`.me-verified [data-fact-digits*="${digits}"]`)
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('is-pulse'); setTimeout(() => el.classList.remove('is-pulse'), 1600); return }
    if (++tries < 10) setTimeout(find, 80)
  }
  setTimeout(find, 60)
}

export function SourceReview() {
  const open = useUi((s) => s.sheet === 'ed-source')
  const source = useEditorialStore((s) => s.source)
  const draft = useEditorialStore((s) => s.draft)
  const discrepancies = useEditorialStore((s) => s.discrepancies)
  const update = useEditorialStore((s) => s.updateSourceManual)
  const busy = useDesk((s) => s.busy)
  const { factTable } = useFacts()
  const [editing, setEditing] = useState(false)
  const close = () => { setEditing(false); useUi.getState().closeSheet('ed-source') }
  const draftDigits = useMemo(() => `${draft.headline} ${draft.deck} ${draft.body}`.replace(/[^0-9]/g, ' '), [draft])
  const url = source?.url && /^https?:\/\//.test(source.url) ? source.url : null
  const ex = source?.extraction
  const method = ex ? (ex.method === 'structured' ? 'Structured data' : ex.method === 'markup' ? 'Page markup' : ex.method === 'page-data' ? 'Page data' : 'Metadata only') : null
  const lang = ex ? (ex.language === 'bn' ? 'Bengali' : ex.language === 'en' ? 'English' : ex.language === 'mixed' ? 'Mixed' : 'Unknown language') : null
  return (
    <FullDialog open={open} title="Original source" onClose={close} primary={source ? <Button kind="text" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</Button> : undefined}>
      {!source ? <div className="m-wrap me-pad"><p className="me-hint">This story has no source yet.</p></div> : (
        <div className="m-wrap me-stack me-pad">
          <section className="me-card">
            {url ? <p className="me-break me-meta">{url}</p> : <p className="me-meta">{source.url === 'pasted-text' ? 'Pasted text — no link to return to.' : 'Loaded from the site CMS.'}</p>}
            {url && <div className="me-start-row">
              <Button kind="tonal" icon="externalLink" onClick={() => void platform().openExternal(url)}>Open</Button>
              <Button kind="tonal" icon="refresh" busy={busy === 'fetch'} disabled={!!busy} onClick={() => { close(); void fetchLink(url, true) }}>Re-fetch</Button>
            </div>}
            <Button kind="text" icon="sparkle" disabled={!!busy} onClick={() => { close(); void retranslate(!!linkedArticle()) }}>Translate the source again</Button>
            {ex && <div className="m-chips">
              <span className="me-tagchip">{method}</span><span className="me-tagchip">{lang}</span>
              <span className="me-tagchip">{source.paragraphs.length} paragraph{source.paragraphs.length === 1 ? '' : 's'}</span>
              <span className="me-tagchip">{source.images.length} photo{source.images.length === 1 ? '' : 's'}</span>
            </div>}
            {ex?.warnings.map((w) => <Banner key={w} tone="warn">{w}</Banner>)}
          </section>

          {editing ? (
            <section className="me-stack">
              <label className="m-field"><span className="m-field-label">Original headline</span><textarea lang="bn" className="m-textarea me-bn" rows={2} value={source.title} onChange={(e) => update(e.target.value, source.deck, source.paragraphs)} /></label>
              <label className="m-field"><span className="m-field-label">Original deck</span><textarea lang="bn" className="m-textarea me-bn" rows={3} value={source.deck} onChange={(e) => update(source.title, e.target.value, source.paragraphs)} /></label>
              <label className="m-field"><span className="m-field-label">Paragraphs (blank line between)</span><textarea lang="bn" className="m-textarea me-bn" rows={14} value={source.paragraphs.join('\n\n')} onChange={(e) => update(source.title, source.deck, e.target.value.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean))} /></label>
            </section>
          ) : (
            <>
              <section className="me-card">
                <h2 className="me-src-title me-bn" lang="bn">{source.title}</h2>
                {source.deck && <p className="me-bn me-src-deck" lang="bn">{source.deck}</p>}
              </section>
              {discrepancies.length > 0 && (
                <section className="me-card">
                  <h3 className="me-h3">Not found in the source ({discrepancies.length})</h3>
                  <p className="me-hint">Figures, quotes or names in the English draft that the original does not contain. Check each one.</p>
                  {discrepancies.map((f, i) => <p key={i} className="me-readyline is-warn"><i aria-hidden />{f.message}</p>)}
                </section>
              )}
              {factTable.length > 0 && (
                <section className="me-card">
                  <h3 className="me-h3">Figures to check ({factTable.length})</h3>
                  <p className="me-hint">Green: the figure is in the English draft. Amber: not found in the draft. Tap one to find it in the story.</p>
                  <div className="m-chips">
                    {factTable.map((f) => {
                      const digits = f.normalized.replace(/[^0-9]/g, '')
                      const inDraft = !!digits && draftDigits.includes(digits)
                      return <span key={f.id} className={'me-factchip ' + (inDraft ? 'is-ok' : 'is-bad')}><Chip onClick={() => locateFact(digits)} icon={inDraft ? 'check' : 'alert'}>{f.normalized}</Chip></span>
                    })}
                  </div>
                </section>
              )}
              <section className="me-card">
                <h3 className="me-h3">Original story · {source.paragraphs.length} ¶</h3>
                <ol className="me-src-paras">
                  {source.paragraphs.map((p, i) => <li key={i} lang="bn" className="me-bn"><span className="me-src-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span><span>{p}</span></li>)}
                </ol>
              </section>
              {source.images.length > 0 && (
                <section className="me-card">
                  <h3 className="me-h3">Photos in the article ({source.images.length})</h3>
                  <p className="me-hint">They were added to the banner's photo library; pick the featured one under Details.</p>
                  <div className="me-photos">{source.images.slice(0, 12).map((im) => <img key={im.src} src={im.src} alt={im.alt || ''} loading="lazy" />)}</div>
                </section>
              )}
              <p className="me-hint"><Icon name="info" size={14} /> The original is never changed by translation or editing; only Edit (top right) corrects the extracted text.</p>
            </>
          )}
        </div>
      )}
    </FullDialog>
  )
}
