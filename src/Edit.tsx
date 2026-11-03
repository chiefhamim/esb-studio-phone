// The Edit desk: the story as a document. Source (Bangla) and English side by side or one at a time, paragraph blocks,
// translation with progress, figure checks against the source, SEO, readiness and the next-step bar.
// Drafts save on every change (onChange is called at once; nothing is debounced). Logic lives in src/edit/*.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Draft } from './drafts'
import { BUDGETS } from './charBudgets'
import { CATEGORIES } from './banner/tokens'
import { buildReadiness, slugFromHeadline } from './publish/readiness'
import { cleanSource } from './translate'
import { AiError, errorMessage } from './aiProviders'
import { joinBlocks, insertBlock, parseBody, parseSource, setBlock, splitOnBlankLine } from './edit/blocks'
import { UndoStack } from './edit/undo'
import { findFactMarks, locateInSource, unplacedFlags, summarize, type FactMark, type Span } from './edit/factMap'
import { banglaTools, findAll, readMinutes, replaceAll, replaceAt, wordCount } from './edit/editTools'
import { quotesByParagraph } from './edit/quotes'
import { translateParagraph } from './edit/translateParagraph'
import { useTranslateJob } from './edit/useTranslateJob'
import { EMPTY_SEO, type SeoFields } from './edit/seoTools'
import ParagraphList from './edit/ParagraphList'
import SeoPanel from './edit/SeoPanel'
import { FactPanel, FindBar, QuotesSheet, ReadinessSheet, TranslateCard, type FactEntry, type FindState } from './edit/Panels'
import { AutoTextarea, MeterRing, Sheet } from './edit/ui'
import { Icon } from './edit/icons'
import { useMedia } from './edit/useMedia'
import './ui/edit.css'

type EditDraft = Draft & { seo?: SeoFields }
interface Props {
  draft: Draft | null
  onChange: (d: Draft) => void
  onOpenSettings: () => void
  onGo: (tab: 'banner' | 'publish') => void
}

/** What undo restores: every field the editor can change here. */
interface Snap { headline: string; deck: string; body: string; slug: string; category: string; source: string; translated: boolean; seo?: SeoFields }
const snap = (d: EditDraft): Snap => ({ headline: d.headline, deck: d.deck, body: d.body, slug: d.slug, category: d.category, source: d.source, translated: d.translated, seo: d.seo })

const STACKS = new Map<string, UndoStack<Snap>>()
const stackOf = (id: string) => { let s = STACKS.get(id); if (!s) { s = new UndoStack<Snap>(); STACKS.set(id, s) } return s }

const WIDE = '(min-width: 900px), (orientation: landscape) and (min-width: 800px)'

/** Paragraph blocks for a text field. The blocks are the editor's working copy; they re-read the text only when it changes from outside (undo, translate). */
function useBlocks(text: string, parse: (t: string) => string[], onText: (t: string, key: string) => void) {
  const [st, setSt] = useState(() => ({ blocks: parse(text), emitted: text }))
  let cur = st
  if (text !== st.emitted) { cur = { blocks: parse(text), emitted: text }; setSt(cur) }
  const set = (b: string[], key: string) => { const t = joinBlocks(b); setSt({ blocks: b, emitted: t }); onText(t, key) }
  return [cur.blocks, set] as const
}

export default function Edit(props: Props) {
  if (!props.draft) return (<><h1>Edit</h1><p>Open or start a story in Stories first.</p></>)
  return <Desk key={props.draft.id} {...props} draft={props.draft} />
}

type ParaJob = { i: number; status: 'running' | 'done' | 'error'; text?: string; notes?: string[]; error?: string; keyProblem?: boolean }

function Desk({ draft, onChange, onOpenSettings, onGo }: Props & { draft: Draft }) {
  const wide = useMedia(WIDE)
  const d = draft as EditDraft
  const draftRef = useRef(d)
  draftRef.current = d
  const undo = stackOf(d.id)
  const [, bump] = useState(0)
  const [mode, setModeRaw] = useState<'english' | 'source'>('english')
  const [selEn, setSelEn] = useState<number | null>(null)
  const [selSrc, setSelSrc] = useState<number | null>(null)
  const [pulse, setPulse] = useState<{ para: number; start: number; end: number; nonce: number } | null>(null)
  const [sheet, setSheet] = useState<null | 'replace' | 'ready' | 'quotes'>(null)
  const [find, setFind] = useState<FindState | null>(null)
  const [findMsg, setFindMsg] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [flash, setFlash] = useState('')
  const [cleanMsg, setCleanMsg] = useState('')
  const [paraJob, setParaJob] = useState<ParaJob | null>(null)
  const paraAbort = useRef<AbortController | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const scrolls = useRef<{ english: number; source: number }>({ english: 0, source: 0 })

  const scroller = () => root.current?.closest('.phone-main') as HTMLElement | null
  const say = (m: string) => { setFlash(m) }
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 5000); return () => clearTimeout(t) }, [flash])
  useEffect(() => () => { paraAbort.current?.abort() }, [])

  // ---------------------------------------------------------------- changing the draft (instant save + undo)
  const commit = (patch: Partial<EditDraft>) => {
    const next = { ...draftRef.current, ...patch } as EditDraft
    draftRef.current = next
    onChange(next)
  }
  /** `key` names a field being typed in, so a run of typing is one undo step; '' always makes its own step. */
  const edit = (patch: Partial<EditDraft>, key = '') => {
    undo.record(snap(draftRef.current), key)
    commit(patch)
    bump((n) => n + 1)
  }
  const doUndo = () => { const s = undo.undo(snap(draftRef.current)); if (s) { commit(s); bump((n) => n + 1) } }
  const doRedo = () => { const s = undo.redo(snap(draftRef.current)); if (s) { commit(s); bump((n) => n + 1) } }

  const [enBlocks, setEn] = useBlocks(d.body, parseBody, (t, k) => edit({ body: t }, k.startsWith('ed-') ? k : ''))
  const [srcBlocks, setSrc] = useBlocks(d.source, parseSource, (t, k) => edit({ source: t }, k.startsWith('ed-') ? k : ''))
  const seo = d.seo ?? EMPTY_SEO

  // ---------------------------------------------------------------- translate
  const job = useTranslateJob((r) => {
    edit({ headline: r.headline, deck: r.deck, body: r.body, slug: r.slug, category: r.category || draftRef.current.category, translated: true })
    setNotes(r.notes)
    setSelEn(null)
  })
  const hasEnglish = !!(d.headline.trim() || d.deck.trim() || d.body.trim())
  const runTranslate = () => { setNotes([]); setSheet(null); void job.start(draftRef.current.source, draftRef.current.sourceUrl) }
  const onTranslate = () => {
    if (!d.source.trim()) { say('There is no source text to translate. Paste the article into the Source column first.'); setMode('source'); return }
    if (hasEnglish) setSheet('replace')
    else runTranslate()
  }

  async function translatePara(i: number) {
    paraAbort.current?.abort()
    const ac = new AbortController(); paraAbort.current = ac
    setParaJob({ i, status: 'running' })
    try {
      const r = await translateParagraph(srcBlocks[i], { before: srcBlocks[i - 1], signal: ac.signal })
      setParaJob({ i, status: 'done', text: r.text, notes: r.notes })
    } catch (e) {
      if (ac.signal.aborted || (e instanceof AiError && e.code === 'aborted')) setParaJob(null)
      else setParaJob({ i, status: 'error', error: errorMessage(e), keyProblem: e instanceof AiError && (e.code === 'no-key' || e.code === 'bad-key') })
    }
  }
  const insertParaText = (i: number, text: string, replace: boolean) => {
    const at = Math.min(i + 1, enBlocks.length)
    const b = replace && enBlocks[i] !== undefined ? setBlock(enBlocks, i, text) : insertBlock(enBlocks, at, text)
    edit({ body: joinBlocks(b), translated: true })
    setParaJob(null)
    say(replace ? `English paragraph ${i + 1} replaced. It is a draft: read it against the source.` : `Added as English paragraph ${at + 1}. It is a draft: read it against the source.`)
  }

  // ---------------------------------------------------------------- view mode and scrolling
  function setMode(next: 'english' | 'source') {
    const sc = scroller()
    if (sc) scrolls.current[mode] = sc.scrollTop
    setModeRaw(next)
    requestAnimationFrame(() => { const s = scroller(); if (s) s.scrollTop = scrolls.current[next] })
  }
  const goTo = (id: string, focus = false) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (focus) (el as HTMLElement).focus?.()
  }

  // ---------------------------------------------------------------- facts
  const factCache = useRef<{ src: string; map: Map<string, FactMark[]> }>({ src: '', map: new Map() })
  const marksOf = (text: string): FactMark[] => {
    const c = factCache.current
    if (c.src !== d.source) { c.src = d.source; c.map.clear() }
    let m = c.map.get(text)
    if (!m) { m = findFactMarks(text, d.source); c.map.set(text, m) }
    return m
  }
  const hasSource = !!d.source.trim()
  const entries: FactEntry[] = useMemo(() => {
    if (!hasSource) return []
    const out: FactEntry[] = []
    const add = (where: string, text: string) => { for (const mark of marksOf(text)) out.push({ where, mark, hit: mark.status === 'found' ? locateInSource(srcBlocks, mark) : null }) }
    add('headline', d.headline)
    add('deck', d.deck)
    enBlocks.forEach((p, i) => add(`paragraph ${i + 1}`, p))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSource, d.headline, d.deck, enBlocks, srcBlocks, d.source])
  const unplaced = useMemo(() => {
    if (!hasSource) return []
    const all = [d.headline, d.deck, ...enBlocks]
    return all.flatMap((t) => unplacedFlags(d.source, t, marksOf(t)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSource, d.headline, d.deck, enBlocks, d.source])
  const factSummary = summarize(entries.map((e) => e.mark))

  const reveal = (e: FactEntry) => {
    if (!e.hit) return
    const sc = scroller()
    if (!wide && mode === 'english') {
      if (sc) scrolls.current.english = sc.scrollTop
      setModeRaw('source')
    }
    setSelSrc(null)
    setPulse({ para: e.hit.para, start: e.hit.start, end: e.hit.end, nonce: Date.now() })
  }
  useEffect(() => {
    if (!pulse) return
    goTo(`ed-s-${pulse.para}`)
    const t = setTimeout(() => setPulse(null), 2600)
    return () => clearTimeout(t)
  }, [pulse])

  // ---------------------------------------------------------------- find and replace
  const matches = useMemo(() => {
    if (!find || !find.query) return []
    const paras = find.scope === 'source' ? srcBlocks : enBlocks
    return paras.flatMap((p, para) => findAll(p, find.query, find.caseSensitive).map((m) => ({ para, ...m })))
  }, [find, enBlocks, srcBlocks])
  const curMatch = matches.length ? matches[((find?.cur ?? 0) % matches.length + matches.length) % matches.length] : null
  useEffect(() => {
    if (!find || !curMatch) return
    if (!wide) setMode(find.scope === 'source' ? 'source' : 'english')
    goTo(`${find.scope === 'source' ? 'ed-s' : 'ed-e'}-${curMatch.para}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find?.cur, find?.query, find?.scope])
  const patchFind = (p: Partial<FindState>) => { setFindMsg(''); setFind((f) => (f ? { ...f, ...p } : f)) }
  const doReplace = () => {
    if (!find || !curMatch) return
    const paras = find.scope === 'source' ? srcBlocks : enBlocks
    const set = find.scope === 'source' ? setSrc : setEn
    set(setBlock(paras, curMatch.para, replaceAt(paras[curMatch.para], curMatch, find.by)), 'find')
    setFindMsg('Replaced 1.')
  }
  const doReplaceAll = () => {
    if (!find || !find.query) return
    const paras = find.scope === 'source' ? srcBlocks : enBlocks
    const set = find.scope === 'source' ? setSrc : setEn
    let n = 0
    set(paras.map((p) => { const r = replaceAll(p, find.query, find.by, find.caseSensitive); n += r.count; return r.text }), 'find')
    setFindMsg(`Replaced ${n}. Undo brings them back.`)
  }

  // ---------------------------------------------------------------- spans for highlighted text
  const findSpans = (scope: 'english' | 'source', i: number): Span[] => {
    if (!find || find.scope !== scope) return []
    return matches.filter((m) => m.para === i).map((m) => ({ start: m.start, end: m.end, cls: m === curMatch ? 'ed-find-cur' : 'ed-find' }))
  }
  const enSpans = (i: number, text: string): Span[] => [
    ...marksOf(text).map((m, idx) => ({ start: m.start, end: m.end, cls: m.status === 'found' ? 'ed-f-found' : 'ed-f-missing', markIndex: idx })),
    ...findSpans('english', i),
  ]
  const srcSpans = (i: number, text: string): Span[] => {
    const out = findSpans('source', i)
    if (pulse && pulse.para === i && pulse.end <= text.length) out.unshift({ start: pulse.start, end: pulse.end, cls: 'ed-pulse' })
    return out
  }
  const onEnMark = (i: number, m: number) => {
    const mark = marksOf(enBlocks[i])[m]
    if (!mark) return
    if (mark.status === 'missing') { say(`"${mark.text}" is not in the source. Check it against your reporting or remove it.`); return }
    const hit = locateInSource(srcBlocks, mark)
    if (hit) reveal({ where: '', mark, hit })
    else say(`"${mark.text}" is in the source, but its place could not be found.`)
  }
  const jumpFact = (e: FactEntry) => reveal(e)

  // ---------------------------------------------------------------- readiness
  const ready = useMemo(() => buildReadiness(d, { translationReviewed: true, hasPicture: true }), [d])
  const required = ready.checks.filter((c) => c.group === 'Required' && c.id !== 'translation')
  const okCount = required.filter((c) => c.status === 'ok').length
  const extraChecks = factSummary.missing + unplaced.length > 0 ? [`${factSummary.missing + unplaced.length} figure or date in the English is not in the source. Open "Figures against the source".`] : []
  const blockers = ready.blockers.filter((c) => c.id !== 'translation')
  const fix = (id: string) => {
    if (!wide) setMode('english')
    const target = id === 'headline' ? 'ed-headline' : id === 'deck' ? 'ed-deck' : id === 'slug' ? 'ed-slug' : id === 'category' ? 'ed-cat' : 'ed-e-0'
    setTimeout(() => goTo(target, true), 50)
  }

  // ---------------------------------------------------------------- numbers
  const enWords = wordCount(d.body)
  const srcWords = wordCount(d.source)
  const quotes = useMemo(() => quotesByParagraph(enBlocks), [enBlocks])

  const cleanSourceNow = () => {
    const out = cleanSource(d.source)
    const before = parseSource(d.source).length
    const after = out ? out.split(/\n\n/).length : 0
    edit({ source: out })
    setCleanMsg(before === after ? 'Nothing to remove.' : `Removed ${before - after} boilerplate line${before - after === 1 ? '' : 's'}. Undo brings them back.`)
  }
  const mapSource = (f: (t: string) => string, label: string) => {
    const out = f(d.source)
    if (out === d.source) { setCleanMsg(`${label}: nothing to change.`); return }
    edit({ source: out }); setCleanMsg(`${label}: done. Undo brings it back.`)
  }

  const savedAt = new Date(d.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const savedShort = new Date(d.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const showEn = wide || mode === 'english'
  const showSrc = wide || mode === 'source'

  return (
    <div className="ed" ref={root} data-wide={wide ? '1' : '0'}>
      <header className="ed-top">
        <div className="ed-toprow">
          <div className="ed-tools" role="toolbar" aria-label="Editing tools">
            <button type="button" className="ed-tb" onClick={doUndo} disabled={!undo.canUndo} aria-label="Undo"><Icon name="undo" /><span>Undo</span></button>
            <button type="button" className="ed-tb" onClick={doRedo} disabled={!undo.canRedo} aria-label="Redo"><Icon name="redo" /><span>Redo</span></button>
            <button type="button" className="ed-tb" aria-pressed={!!find} onClick={() => { setFindMsg(''); setFind((f) => (f ? null : { query: '', by: '', caseSensitive: false, scope: 'english', cur: 0 })) }}><Icon name="search" /><span>Find</span></button>
            <button type="button" className="ed-tb" onClick={() => setSheet('quotes')}><Icon name="quote" /><span>Quotes{quotes.length ? ` ${quotes.length}` : ''}</span></button>
          </div>
          <span className="ed-saved" role="status"><span className="sr-only">Saved on this phone · {savedAt}</span><span aria-hidden="true"><i />{savedShort}</span></span>
        </div>
        {!wide && (
          <div className="ed-seg" role="group" aria-label="Show">
            <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}><Icon name="source" size={16} /><span>Source</span>{srcBlocks.length > 0 && <em>{srcBlocks.length}</em>}</button>
            <button type="button" aria-pressed={mode === 'english'} onClick={() => setMode('english')}><Icon name="globe" size={16} /><span>English</span>{enBlocks.length > 0 && <em>{enBlocks.length}</em>}</button>
          </div>
        )}
      </header>

      {flash && <p className="ed-flash" role="status">{flash}</p>}
      <TranslateCard job={job.state} onCancel={job.cancel} onRetry={onTranslate} onSettings={onOpenSettings} onDismiss={job.reset} />
      {notes.length > 0 && (
        <section className="ed-card ed-warncard" aria-label="Check these before publishing">
          <b>Check before publishing</b>
          <ul className="ed-list">{notes.map((n, i) => <li key={i} className="ed-note">{n}</li>)}</ul>
          <button type="button" className="ed-btn ed-btn-quiet" onClick={() => setNotes([])}>Hide</button>
        </section>
      )}
      {find && <FindBar f={find} onChange={patchFind} total={matches.length} onStep={(dir) => patchFind({ cur: (find.cur + dir + matches.length) % Math.max(1, matches.length) })} onReplace={doReplace} onReplaceAll={doReplaceAll} onClose={() => setFind(null)} lastMsg={findMsg} />}

      <div className="ed-cols">
        <section className="ed-card ed-col ed-col-src" hidden={!showSrc} aria-label="Source">
          <header className="ed-card-h"><span className="ed-card-ic"><Icon name="source" size={16} /></span><div className="ed-card-t"><h2>Original story</h2><p>{srcWords} words · {srcBlocks.length} paragraph{srcBlocks.length === 1 ? '' : 's'}{d.sourceUrl ? ' · from a link' : ''}</p></div></header>
          {d.sourceUrl && <p className="ed-url">{d.sourceUrl}</p>}
          <div className="ed-tchips" role="group" aria-label="Bangla tools">
            <button type="button" className="ed-chipbtn" onClick={cleanSourceNow} disabled={!hasSource}>Clean source</button>
            <button type="button" className="ed-chipbtn" onClick={() => mapSource(banglaTools.digitsToAscii, 'Digits')} disabled={!hasSource}>Digits to 0-9</button>
            <button type="button" className="ed-chipbtn" onClick={() => mapSource(banglaTools.composeLetters, 'Letters')} disabled={!hasSource}>Join ড় ঢ় য়</button>
          </div>
          {cleanMsg && <p className="ed-note" role="status">{cleanMsg}</p>}
          <ParagraphList
            idPrefix="ed-s"
            blocks={srcBlocks}
            onBlocks={setSrc}
            splitter={(t) => t.replace(/\r/g, '').split('\n')}
            lang="bn"
            tapToEdit={false}
            spansFor={srcSpans}
            placeholder="Paste or type the source article"
            spell={false}
            selected={selSrc}
            onSelect={setSelSrc}
            pulseIdx={pulse?.para ?? null}
            toolFor={(i) => (
              <button type="button" className="ed-btn ed-btn-primary" disabled={!srcBlocks[i]?.trim() || paraJob?.status === 'running'} onClick={() => translatePara(i)}>Translate this paragraph</button>
            )}
            belowFor={(i) => paraJob && paraJob.i === i ? (
              <div className="ed-para-job" role="status">
                {paraJob.status === 'running' && <><p className="ed-note">Translating paragraph {i + 1}…</p><button type="button" className="ed-btn" onClick={() => paraAbort.current?.abort()}>Cancel</button></>}
                {paraJob.status === 'error' && (
                  <><p className="ed-err">{paraJob.error}</p>
                    <div className="ed-row">
                      {paraJob.keyProblem && <button type="button" className="ed-btn ed-btn-primary" onClick={onOpenSettings}>Open Settings</button>}
                      <button type="button" className="ed-btn" onClick={() => translatePara(i)}>Try again</button>
                      <button type="button" className="ed-btn ed-btn-quiet" onClick={() => setParaJob(null)}>Dismiss</button>
                    </div></>
                )}
                {paraJob.status === 'done' && (
                  <>
                    <span className="ed-chip ed-chip-ai">AI draft · read it against the source</span>
                    <p className="ed-en">{paraJob.text}</p>
                    {paraJob.notes?.map((n, k) => <p key={k} className="ed-warn">{n}</p>)}
                    <div className="ed-row">
                      <button type="button" className="ed-btn ed-btn-primary" onClick={() => insertParaText(i, paraJob.text ?? '', false)}>Add as English paragraph {Math.min(i + 1, enBlocks.length) + 1}</button>
                      {enBlocks[i] !== undefined && <button type="button" className="ed-btn" onClick={() => insertParaText(i, paraJob.text ?? '', true)}>Replace English paragraph {i + 1}</button>}
                      <button type="button" className="ed-btn ed-btn-quiet" onClick={() => setParaJob(null)}>Discard</button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          />
        </section>

        <section className="ed-col ed-col-en" hidden={!showEn} aria-label="English story">
          {d.translated && <p className="ed-draft-tag">Draft from a translation. Read it against the source before publishing.</p>}
          <div className="ed-catwrap">
            <span className="ed-cap" id="ed-cat-l">Category</span>
            <div id="ed-cat" className="ed-cats" role="group" aria-labelledby="ed-cat-l" tabIndex={-1}>
              {CATEGORIES.map((c) => {
                const on = d.category === c.name
                return (
                  <button key={c.id} type="button" className="ed-cat" aria-pressed={on} style={on ? { background: c.accent, color: c.chipText, borderColor: c.accent } : undefined} onClick={() => edit({ category: on ? '' : c.name })}>
                    <i style={{ background: c.accent }} aria-hidden="true" />{c.name}
                  </button>
                )
              })}
            </div>
          </div>

          <section className="ed-card ed-card-hd" aria-label="Headline and deck">
            <header className="ed-card-h"><span className="ed-card-ic"><Icon name="type" size={16} /></span><div className="ed-card-t"><h2>Headline &amp; deck</h2><p>{d.category || 'No category yet'} · English copy for esbpowerline.com</p></div></header>
            <div className="ed-field">
              <div className="ed-field-row"><label htmlFor="ed-headline">Headline</label><span className={[...d.headline].length > BUDGETS.headline ? 'ed-budget over' : 'ed-budget'}>{[...d.headline].length} / {BUDGETS.headline}</span></div>
              <AutoTextarea id="ed-headline" className="ed-h1" label="Headline" lang="en-GB" placeholder="Headline" singleLine value={d.headline} onText={(v) => edit({ headline: v }, 'ed-headline')} />
            </div>
            <div className="ed-field">
              <div className="ed-field-row"><label htmlFor="ed-deck">Deck</label><span className={[...d.deck].length > BUDGETS.deck ? 'ed-budget over' : 'ed-budget'}>{[...d.deck].length} / {BUDGETS.deck}</span></div>
              <AutoTextarea id="ed-deck" className="ed-deck" label="Deck" lang="en-GB" placeholder="Deck: one sentence that sums up the story" singleLine value={d.deck} onText={(v) => edit({ deck: v }, 'ed-deck')} />
            </div>
          </section>

          <FactPanel entries={entries} unplaced={unplaced} hasSource={hasSource || entries.length === 0} onJump={jumpFact} />

          <section className="ed-card ed-card-story" aria-label="Story">
            <header className="ed-card-h"><span className="ed-card-ic"><Icon name="layers" size={16} /></span><div className="ed-card-t"><h2>Story</h2><p>{enWords} words · ~{readMinutes(enWords)} min read · {enBlocks.length} paragraph{enBlocks.length === 1 ? '' : 's'}</p></div></header>
            <ParagraphList
              idPrefix="ed-e"
              blocks={enBlocks}
              onBlocks={setEn}
              splitter={splitOnBlankLine}
              lang="en-GB"
              tapToEdit
              spansFor={enSpans}
              onMark={onEnMark}
              placeholder="Write the story. A blank line starts a new paragraph."
              spell
              selected={selEn}
              onSelect={setSelEn}
            />
          </section>

          <section className="ed-card ed-slugrow" aria-label="Web address">
            <label className="ed-lab" htmlFor="ed-slug">Web address <span className={[...d.slug].length > BUDGETS.slug ? 'ed-count ed-over' : 'ed-count'}>{[...d.slug].length}/{BUDGETS.slug}</span></label>
            <div className="ed-row">
              <input id="ed-slug" className="ed-input" value={d.slug} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="story-web-address" onChange={(e) => edit({ slug: e.target.value }, 'ed-slug')} />
              <button type="button" className="ed-btn" disabled={!d.headline.trim()} onClick={() => edit({ slug: slugFromHeadline(d.headline) })}>Make from headline</button>
            </div>
          </section>

          <SeoPanel
            story={{ headline: d.headline, deck: d.deck, body: d.body, slug: d.slug }}
            seo={seo}
            onSeo={(next, slug) => edit(slug !== undefined ? { seo: next, slug } : { seo: next }, slug !== undefined ? '' : 'ed-seo')}
            onOpenSettings={onOpenSettings}
          />
        </section>
      </div>

      <footer className="ed-actions" aria-label="Next step">
        <button type="button" className="ed-ready" onClick={() => setSheet('ready')} aria-label={blockers.length ? `${blockers.length} things to fix. Open the list.` : 'Ready. Open the list.'}>
          <MeterRing value={okCount} max={required.length || 1} size={38} label={`${okCount} of ${required.length} checks done`}>{blockers.length ? blockers.length : 'OK'}</MeterRing>
        </button>
        <button type="button" className="ed-btn ed-btn-primary" onClick={onTranslate} disabled={job.running}>{job.running ? 'Translating…' : 'Translate'}</button>
        <button type="button" className="ed-btn" onClick={() => onGo('banner')}>Banner</button>
        <button type="button" className="ed-btn" onClick={() => onGo('publish')}>Publish</button>
        <p className="ed-actions-note">{blockers.length ? `${blockers.length} to fix: ${blockers.slice(0, 2).map((b) => b.label).join(', ')}${blockers.length > 2 ? '…' : ''}` : 'Required fields are filled.'}</p>
      </footer>

      {sheet === 'replace' && (
        <Sheet title="Replace the current English?" onClose={() => setSheet(null)}>
          <p>The headline, deck and story ({enWords} words) will be replaced by a new translation of the source. Undo brings your English back.</p>
          <div className="ed-row">
            <button type="button" className="ed-btn ed-btn-primary" onClick={runTranslate}>Replace and translate</button>
            <button type="button" className="ed-btn" onClick={() => setSheet(null)}>Keep my English</button>
          </div>
        </Sheet>
      )}
      {sheet === 'quotes' && <QuotesSheet quotes={quotes} onClose={() => setSheet(null)} onJump={(p) => { if (!wide) setMode('english'); setSelEn(p); setTimeout(() => goTo(`ed-e-${p}`), 50) }} />}
      {sheet === 'ready' && <ReadinessSheet r={ready} extra={extraChecks} onClose={() => setSheet(null)} onFix={fix} onBanner={() => onGo('banner')} onPublish={() => onGo('publish')} />}
    </div>
  )
}
