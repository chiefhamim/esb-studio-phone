// The quote & figure library (PC QuoteLibraryPanel on quoteLibrary.ts): quotes with their speakers and figures with
// their units, harvested from stories (by hand, and automatically when a story is published), each with where it came
// from. On the phone: search, filter, insert into the story at the cursor, or send to Graphics as a quote/stat banner.
import { useEffect, useMemo, useState } from 'react'
import { useQuoteLibrary, installPublishHarvest, quoteBannerPatch, statBannerPatch, searchEntries } from '../../pc/editorial/quoteLibrary'
import type { LibraryEntry } from '../../pc/editorial/quoteLibrary'
import { useStore } from '../../pc/store'
import { Banner, Button, Chip, Empty, IconBtn, Icon, Sheet } from '../shell/ui'
import { confirmAsk, snack, useUi } from '../shell/core'
import { useNav } from '../shell/nav'
import { bodyEditor } from './tiptapHost'
import { hostOf } from './useStory'

installPublishHarvest()

function provenance(e: LibraryEntry): string {
  const where = e.slug ? `/articles/${e.slug}` : e.url ? hostOf(e.url) : e.sourceUrl ? `source: ${hostOf(e.sourceUrl)}` : 'not published'
  return `from ${e.headline} · ${where}${e.from === 'source' ? ' · original text' : ''}`
}

function insert(e: LibraryEntry) {
  const ed = bodyEditor()
  if (!ed) { snack('Open the story in Write view first'); return }
  if (e.kind === 'quote') {
    const who = [e.speaker, e.speakerTitle].filter(Boolean).join(', ')
    ed.chain().focus().insertContent({ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: `“${e.text}”${who ? ` — ${who}` : ''}` }] }] }).run()
  } else ed.chain().focus().insertContent(e.text).run()
  useUi.getState().closeSheet('ed-library')
  snack('Inserted at the cursor — check it fits the story')
}

export function LibrarySheet() {
  const isOpen = useUi((s) => s.sheet === 'ed-library')
  const L = useQuoteLibrary()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'quote' | 'stat'>('all')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (isOpen) void L.load() }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => searchEntries(L.entries, q, { kind: kind === 'all' ? undefined : kind }, L.speakers), [L.entries, L.speakers, q, kind])
  const last = L.last
  const note = err ?? L.problem ?? (last ? (!last.found ? 'No quotes or figures with units in this story.' : !last.added ? 'Nothing new: already in the library.' : `${last.added} added${last.failed ? `; ${last.failed} could not be stored` : ''}.`) : null)
  const harvest = async () => { setErr(null); try { await L.harvestActive() } catch (e) { setErr(e instanceof Error ? e.message : 'The harvest did not finish.') } }
  return (
    <Sheet id="ed-library" title="Quotes & figures" initial="full">
      <div className="me-stack">
        <Button kind="tonal" icon="plus" busy={L.busy} disabled={!L.loaded} onClick={() => void harvest()}>Harvest from this story</Button>
        {note && <Banner tone={err || L.problem ? 'error' : 'info'}>{note}</Banner>}
        {!L.loaded ? <p className="me-hint">Opening the library</p> : !L.entries.length ? (
          <Empty icon="quote" title="Nothing harvested yet" body="Quotes with their speakers and figures with their units are kept here from every story you harvest or publish, each with the story it came from." />
        ) : (
          <>
            <label className="me-search"><Icon name="search" size={18} /><input type="search" className="m-input" placeholder="Search quotes, figures, speakers" aria-label="Search the library" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <div className="m-chips">{(['all', 'quote', 'stat'] as const).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{k === 'all' ? `All ${L.entries.length}` : k === 'quote' ? 'Quotes' : 'Figures'}</Chip>)}</div>
            <div className="me-list">
              {shown.map((e) => (
                <section key={e.id} className="me-card">
                  {e.kind === 'quote' ? <p className="me-quote">“{e.text}”</p> : <p><b className="me-figure">{e.text}</b> <span className="me-meta">{e.sentence}</span></p>}
                  {e.kind === 'quote' && <p className="me-meta">{e.speaker ? `— ${[e.speaker, e.speakerTitle].filter(Boolean).join(', ')}` : 'Speaker not named in the story'}</p>}
                  <p className="me-meta me-break">{provenance(e)}</p>
                  <div className="me-btnrow">
                    <Button kind="text" icon="edit" onClick={() => insert(e)}>Insert in story</Button>
                    <Button kind="text" icon={e.kind === 'quote' ? 'quote' : 'chart'} onClick={() => { useStore.getState().setContent(e.kind === 'quote' ? quoteBannerPatch(e, L.speakers) : statBannerPatch(e)); useUi.getState().closeSheet('ed-library'); useNav.getState().go('graphics') }}>{e.kind === 'quote' ? 'Quote banner' : 'Stat banner'}</Button>
                    <IconBtn icon="trash" label="Remove from the library" onClick={async () => { if (await confirmAsk({ title: 'Remove from the library?', confirm: 'Remove', danger: true })) void L.remove(e.id) }} />
                  </div>
                </section>
              ))}
              {!shown.length && <p className="me-hint">Nothing in the library matches.</p>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
