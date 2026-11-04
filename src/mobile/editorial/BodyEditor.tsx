// The story body on the phone: the PC's RichBodyEditor (TipTap, the site's HTML, PC sanitisation) with its desktop
// toolbar hidden, driven by ONE slim, horizontally scrollable toolbar docked above the keyboard (--m-kb). Everything
// else (paragraph, strike, divider, table, chart, picture, find & replace, quotes, full-screen writing) is in the More
// sheet. Android's own text-selection toolbar stays where Android puts it; ours sits at the bottom edge, so neither
// ever covers the text being edited.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { RichBodyEditor } from '../../pc/editorial/RichBodyEditor'
import { richOf } from '../../pc/editorial/richBody'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { parseChartData, renderChart, chartToBlob, chartAlt } from '../../pc/editorial/chart'
import type { ChartSpec, ChartType } from '../../pc/editorial/chart'
import { platform } from '../../platform/platform'
import { PcHost } from '../PcHost'
import { Banner, Button, FullDialog, Icon, IconBtn, Segmented, Sheet } from '../shell/ui'
import type { IconName } from '../shell/ui'
import { snack, useUi } from '../shell/core'
import { useDesk } from './deskStore'
import { insertPictureFile, insertPictureUrl, uploadForStory, useEditorTick, useHostedEditor } from './tiptapHost'
import { blocksOf, findInBlocks } from './findText'
import type { Range } from './findText'
import { useCategory } from './useStory'

const ALIGNS = [{ value: 'default', label: 'Std' }, { value: 'full', label: 'Full' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Mid' }, { value: 'right', label: 'Right' }] as const
type Align = (typeof ALIGNS)[number]['value']

/** A toolbar button that never takes focus from the story (so the keyboard and the selection stay). */
function TB({ icon, text, label, on, disabled, onTap, group, primary }: { icon?: IconName; text?: string; label: string; on?: boolean; disabled?: boolean; onTap: () => void; group?: boolean; primary?: boolean }) {
  return (
    <button type="button" className={'me-tb' + (on ? ' is-on' : '') + (group ? ' g-start' : '') + (primary ? ' is-primary' : '')} aria-label={label} title={label} aria-pressed={on ?? undefined} disabled={disabled}
      onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={onTap}>
      {icon ? <Icon name={icon} size={20} /> : <span className="me-tb-txt">{text}</span>}
    </button>
  )
}

const TOOLS_POS_KEY = 'esb-phone/tools-offset'
const readOffset = () => { try { return Math.min(0, Number(localStorage.getItem(TOOLS_POS_KEY)) || 0) } catch { return 0 } }

/** The grip on top of the writing tools: drag it up or down to put the tools where the thumb reaches, double-tap to put them back. */
function useMovableTools() {
  const [dy, setDy] = useState(readOffset)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; o0: number; max: number; moved: boolean; last: number } | null>(null)
  const lastTap = useRef(0)
  const clamp = (v: number, max: number) => Math.max(-max, Math.min(0, v))
  const gripProps = {
    onPointerDown: (e: React.PointerEvent) => {
      const el = ref.current
      if (!el) return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      const top = el.getBoundingClientRect().top - dy // where the card sits with no offset
      drag.current = { y0: e.clientY, o0: dy, max: Math.max(0, top - 110), moved: false, last: dy } // never above the top bar
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.abs(e.clientY - d.y0) < 8) return // a tap or a wobble is not a drag
      d.moved = true
      d.last = clamp(d.o0 + (e.clientY - d.y0), d.max)
      setDy(d.last)
    },
    onPointerUp: () => {
      const d = drag.current
      drag.current = null
      if (d?.moved) { try { localStorage.setItem(TOOLS_POS_KEY, String(Math.round(d.last))) } catch { /* ignore */ }; return }
      // two quick taps put the tools back where they started
      const now = Date.now()
      if (now - lastTap.current < 450) { setDy(0); lastTap.current = 0; try { localStorage.removeItem(TOOLS_POS_KEY) } catch { /* ignore */ } } else lastTap.current = now
    },
    onPointerCancel: () => { drag.current = null },
  }
  return { ref, dy, gripProps }
}

function Toolbar({ ed }: { ed: Editor }) {
  const { ref, dy, gripProps } = useMovableTools()
  const writing = useDesk((s) => s.writing)
  const set = useDesk((s) => s.set)
  const open = (id: string) => useUi.getState().openSheet(id)
  const c = () => ed.chain().focus()
  const onImage = ed.isActive('image')
  const inTable = ed.isActive('table')
  return (
    <div ref={ref} className={'me-toolbar' + (dy ? ' is-moved' : '')} role="toolbar" aria-label="Story formatting" style={dy ? { transform: `translateY(${dy}px)` } : undefined}>
      <div className="me-tb-grip" role="separator" aria-label="Drag to move the writing tools; double-tap to put them back" {...gripProps}><i /></div>
      <div className="me-toolbar-scroll">
        {onImage && <>
          <TB icon="image" label="Picture details: alt text, caption, credit, alignment" onTap={() => open('ed-img')} />
          <TB icon="trash" label="Remove picture" onTap={() => c().deleteSelection().run()} />
          <span className="me-tb-sep" aria-hidden />
        </>}
        {inTable && <><TB icon="table" label="Table rows and columns" on onTap={() => open('ed-table')} /><span className="me-tb-sep" aria-hidden /></>}
        <TB icon="undo" label="Undo" disabled={!ed.can().undo()} onTap={() => c().undo().run()} />
        <TB icon="redo" label="Redo" disabled={!ed.can().redo()} onTap={() => c().redo().run()} />
        <TB group text="H2" label="Heading" on={ed.isActive('heading', { level: 2 })} onTap={() => c().toggleHeading({ level: 2 }).run()} />
        <TB text="H3" label="Subheading" on={ed.isActive('heading', { level: 3 })} onTap={() => c().toggleHeading({ level: 3 }).run()} />
        <TB group icon="bold" label="Bold" on={ed.isActive('bold')} onTap={() => c().toggleBold().run()} />
        <TB icon="italic" label="Italic" on={ed.isActive('italic')} onTap={() => c().toggleItalic().run()} />
        <TB icon="underline" label="Underline" on={ed.isActive('underline')} onTap={() => c().toggleUnderline().run()} />
        <TB icon="highlight" label="Highlight" on={ed.isActive('highlightColor')} onTap={() => (ed.isActive('highlightColor') ? c().unsetMark('highlightColor').run() : c().setMark('highlightColor').run())} />
        <TB group icon="listBullet" label="Bullet points" on={ed.isActive('bulletList')} onTap={() => c().toggleBulletList().run()} />
        <TB icon="listOrdered" label="Numbered list" on={ed.isActive('orderedList')} onTap={() => c().toggleOrderedList().run()} />
        <TB icon="quote" label="Quotation" on={ed.isActive('blockquote')} onTap={() => c().toggleBlockquote().run()} />
        <TB group icon="link" label="Link" on={ed.isActive('link')} onTap={() => open('ed-link')} />
        <TB icon="image" label="Add a picture" onTap={() => { ed.commands.blur(); open('ed-pic') }} />
      </div>
      <div className="me-toolbar-end">
        <TB group icon="more" label="More formatting and tools" onTap={() => open('ed-more')} />
        {writing
          ? <TB icon="x" label="Leave full-screen writing" onTap={() => { set({ writing: false }); ed.commands.blur() }} />
          : <TB primary text="Done" label="Done (hide the keyboard)" onTap={() => ed.commands.blur()} />}
      </div>
    </div>
  )
}

function MoreSheet({ ed }: { ed: Editor }) {
  const writing = useDesk((s) => s.writing)
  const set = useDesk((s) => s.set)
  const close = () => useUi.getState().closeSheet('ed-more')
  const open = (id: string) => useUi.getState().openSheet(id)
  const c = () => ed.chain().focus()
  const item = (icon: IconName, label: string, run: () => void, on?: boolean) => (
    <button type="button" className={'me-grid-btn' + (on ? ' is-on' : '')} onClick={run}><Icon name={icon} size={22} /><span>{label}</span></button>
  )
  return (
    <Sheet id="ed-more" title="Story tools">
      <div className="me-grid-btns">
        {item('type', 'Paragraph', () => { close(); c().setParagraph().run() }, ed.isActive('paragraph') && !ed.isActive('blockquote'))}
        {item('strike', 'Strike', () => { close(); c().toggleStrike().run() }, ed.isActive('strike'))}
        {item('rule', 'Divider', () => { close(); c().setHorizontalRule().run() })}
        {item('eraser', 'Clear format', () => { close(); c().unsetAllMarks().clearNodes().run() })}
        {item('table', ed.isActive('table') ? 'Table tools' : 'Table', () => { if (ed.isActive('table')) open('ed-table'); else { close(); c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() } })}
        {item('chart', 'Chart', () => open('ed-chart'))}
        {item('image', 'Picture', () => open('ed-pic'))}
        {item('search', 'Find & replace', () => open('ed-find'))}
        {item('quote', 'From library', () => open('ed-library'))}
        {item('fit', writing ? 'Leave full screen' : 'Full-screen writing', () => { close(); set({ writing: !writing }); if (!writing) requestAnimationFrame(() => ed.commands.focus()) }, writing)}
      </div>
    </Sheet>
  )
}

function LinkSheet({ ed }: { ed: Editor }) {
  const isOpen = useUi((s) => s.sheet === 'ed-link')
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [hasWords, setHasWords] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    const { from, to } = ed.state.selection
    const picked = from !== to ? ed.state.doc.textBetween(from, to, ' ') : ''
    setUrl((ed.getAttributes('link').href as string) ?? 'https://')
    setLabel(picked)
    setHasWords(!!picked || ed.isActive('link'))
  }, [isOpen, ed])
  const close = () => useUi.getState().closeSheet('ed-link')
  /** "example.com" becomes https://example.com, "a@b.com" becomes mailto:a@b.com; anything else is refused. */
  const href = (() => {
    const v = url.trim()
    if (!v || v === 'https://') return ''
    if (/^(https?:|mailto:)/i.test(v)) return v
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'mailto:' + v
    if (/^[^\s.]+\.[^\s]{2,}$/.test(v)) return 'https://' + v
    return ''
  })()
  const apply = () => {
    if (hasWords) ed.chain().focus().extendMarkRange('link').setLink({ href }).run()
    else ed.chain().focus().insertContent({ type: 'text', text: label.trim() || href.replace(/^mailto:|^https?:\/\//i, ''), marks: [{ type: 'link', attrs: { href } }] }).run()
    close()
  }
  return (
    <Sheet id="ed-link" title="Link" footer={<>
      {ed.isActive('link') && <Button kind="text" onClick={() => { ed.chain().focus().extendMarkRange('link').unsetLink().run(); close() }}>Remove link</Button>}
      <span className="m-spacer" />
      <Button disabled={!href} onClick={apply}>Apply</Button>
    </>}>
      <div className="m-stack">
        <label className="m-field"><span className="m-field-label">Address</span>
          <input type="url" inputMode="url" className="m-input" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoCapitalize="none" /></label>
        {!hasWords && (
          <label className="m-field"><span className="m-field-label">Words to show (optional)</span>
            <input className="m-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Leave empty to show the address" /></label>
        )}
        <p className="me-hint">{hasWords ? 'The link goes on the words you selected.' : 'No words are selected, so the link is added as new text. To link existing words, select them first.'}</p>
      </div>
    </Sheet>
  )
}

/** The shared icon set has no camera, so it is drawn here (same 24 px grid and stroke as the rest). */
function CameraGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ marginRight: 8 }}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />
    </svg>
  )
}

function PictureSheet({ ed }: { ed: Editor }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (f: File | null) => {
    if (!f) return
    setBusy(true); setErr(null)
    try {
      const up = await insertPictureFile(ed, f, setMsg)
      if (up.ok) { useUi.getState().closeSheet('ed-pic'); snack('Picture added') } else setErr(up.error)
    } catch (e) { setErr(e instanceof Error ? e.message : 'The picture could not be added.') } finally { setBusy(false); setMsg(null) }
  }
  return (
    <Sheet id="ed-pic" title="Add a picture">
      <div className="me-stack">
        <Button kind="tonal" icon="image" busy={busy} onClick={async () => { const fs = await platform().pickFiles({ accept: ['image/*'] }).catch(() => []); void run(fs[0] ?? null) }}>Choose from the phone</Button>
        <Button kind="tonal" disabled={busy} onClick={async () => void run(await platform().takePhoto().catch(() => null))}><CameraGlyph />Take a photo</Button>
        {msg && <p className="me-hint" role="status">{msg}</p>}
        {err && <Banner tone={/Planned/i.test(err) ? 'planned' : 'error'}>{err}</Banner>}
        <p className="me-hint">A picture from the phone is uploaded to the site's media library first, so the story only ever holds an https link.</p>
        <label className="m-field"><span className="m-field-label">…or a picture link</span>
          <input type="url" inputMode="url" className="m-input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} /></label>
        <Button kind="outlined" disabled={!/^https?:\/\//i.test(url.trim())} onClick={() => { insertPictureUrl(ed, url); setUrl(''); useUi.getState().closeSheet('ed-pic') }}>Add the link</Button>
      </div>
    </Sheet>
  )
}

function ImageSheet({ ed }: { ed: Editor }) {
  const a = ed.getAttributes('image') as { alt?: string; caption?: string; credit?: string; align?: Align }
  const setA = (p: Record<string, unknown>) => ed.commands.updateAttributes('image', p)
  if (!ed.isActive('image')) return <Sheet id="ed-img" title="Picture"><p className="me-hint">Tap a picture in the story first.</p></Sheet>
  return (
    <Sheet id="ed-img" title="Picture" footer={<><Button kind="danger" icon="trash" onClick={() => { ed.chain().focus().deleteSelection().run(); useUi.getState().closeSheet('ed-img') }}>Remove</Button><span className="m-spacer" /><Button onClick={() => useUi.getState().closeSheet('ed-img')}>Done</Button></>}>
      <div className="me-stack">
        <Segmented<Align> label="Alignment" value={a.align ?? 'default'} onChange={(v) => setA({ align: v })} options={ALIGNS.map((x) => ({ value: x.value, label: x.label }))} />
        <label className="m-field"><span className="m-field-label">Alt text — what the picture shows</span><input className="m-input" value={a.alt ?? ''} onChange={(e) => setA({ alt: e.target.value })} /></label>
        <label className="m-field"><span className="m-field-label">Caption</span><input className="m-input" value={a.caption ?? ''} onChange={(e) => setA({ caption: e.target.value })} /></label>
        <label className="m-field"><span className="m-field-label">Photo credit</span><input className="m-input" value={a.credit ?? ''} onChange={(e) => setA({ credit: e.target.value })} /></label>
        <p className="me-hint">A caption or credit turns the picture into the site's captioned figure.</p>
      </div>
    </Sheet>
  )
}

function TableSheet({ ed }: { ed: Editor }) {
  const c = () => ed.chain().focus()
  const b = (label: string, run: () => void, icon?: IconName) => <Button kind="tonal" icon={icon} onClick={run}>{label}</Button>
  return (
    <Sheet id="ed-table" title="Table">
      {ed.isActive('table') ? (
        <div className="me-btn-grid">
          {b('+ Row below', () => c().addRowAfter().run())}
          {b('+ Column right', () => c().addColumnAfter().run())}
          {b('− Row', () => c().deleteRow().run())}
          {b('− Column', () => c().deleteColumn().run())}
          {b('Header row', () => c().toggleHeaderRow().run())}
          {b('Delete table', () => { c().deleteTable().run(); useUi.getState().closeSheet('ed-table') }, 'trash')}
        </div>
      ) : <Button onClick={() => { c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); useUi.getState().closeSheet('ed-table') }}>Insert a 3 × 3 table</Button>}
    </Sheet>
  )
}

function FindSheet({ ed }: { ed: Editor }) {
  const [q, setQ] = useState('')
  const [rep, setRep] = useState('')
  const [i, setI] = useState(0)
  const [ver, setVer] = useState(0)
  const ranges = useMemo<Range[]>(() => findInBlocks(blocksOf(ed.state.doc as never), q), [q, ed, ver]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = ranges.length ? ranges[Math.min(i, ranges.length - 1)] : null
  const show = (r: Range | null) => {
    if (!r) return
    ed.commands.setTextSelection(r)
    try { const { node } = ed.view.domAtPos(r.from); (node.nodeType === 1 ? (node as Element) : node.parentElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* position gone */ }
  }
  const snippet = cur ? (() => { const t = ed.state.doc.textBetween(Math.max(0, cur.from - 30), Math.min(ed.state.doc.content.size, cur.to + 30), ' '); return t })() : ''
  const replaceOne = () => { if (!cur) return; (rep ? ed.chain().insertContentAt(cur, rep) : ed.chain().deleteRange(cur)).run(); setVer((v) => v + 1) }
  const replaceAll = () => {
    if (!ranges.length) return
    let ch = ed.chain()
    for (const r of [...ranges].reverse()) ch = rep ? ch.insertContentAt(r, rep) : ch.deleteRange(r)
    ch.run()
    snack(`Replaced ${ranges.length}`)
    setVer((v) => v + 1)
  }
  return (
    <Sheet id="ed-find" title="Find & replace">
      <div className="me-stack">
        <label className="m-field"><span className="m-field-label"><span>Find</span><span className="m-field-count">{q ? `${ranges.length ? Math.min(i, ranges.length - 1) + 1 : 0} of ${ranges.length}` : ''}</span></span>
          <input type="search" className="m-input" value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} /></label>
        {cur && <p className="me-snippet">…{snippet}…</p>}
        <div className="me-start-row">
          <Button kind="tonal" icon="chevUp" disabled={!ranges.length} onClick={() => { const n = (i - 1 + ranges.length) % ranges.length; setI(n); show(ranges[n]) }}>Previous</Button>
          <Button kind="tonal" icon="chevDown" disabled={!ranges.length} onClick={() => { const n = (i + 1) % ranges.length; setI(n); show(ranges[n]) }}>Next</Button>
        </div>
        <label className="m-field"><span className="m-field-label">Replace with</span><input className="m-input" value={rep} onChange={(e) => setRep(e.target.value)} /></label>
        <div className="me-start-row">
          <Button kind="outlined" disabled={!cur} onClick={replaceOne}>Replace</Button>
          <Button kind="outlined" disabled={!ranges.length} onClick={replaceAll}>Replace all</Button>
        </div>
        <p className="me-hint">Replacing changes only your words; check figures against the source afterwards (Verified view).</p>
      </div>
    </Sheet>
  )
}

const toText = (c: Partial<ChartSpec>) => (c.labels && c.series?.length ? [['Label', ...c.series.map((x, i) => x.name || `Series ${i + 1}`)].join(', '), ...c.labels.map((l, i) => [l, ...c.series!.map((x) => x.values[i])].join(', '))].join('\n') : '')

/** The PC ChartDialog's form on the phone (the PC dialog is a desktop frame): drawn by chart.ts, uploaded as a picture. */
export function ChartSheet({ ed }: { ed: Editor | null }) {
  const isOpen = useUi((s) => s.sheet === 'ed-chart')
  const ideaIx = useDesk((s) => s.chartIdea)
  const ideas = useEditorialStore((s) => s.draft.chartIdeas ?? [])
  const cat = useCategory()
  const init = ideaIx != null ? ideas[ideaIx] : undefined
  const [type, setType] = useState<ChartType>('bar')
  const [title, setTitle] = useState('')
  const [unit, setUnit] = useState('')
  const [source, setSource] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [data, setData] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const prev = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    setType(init?.type ?? 'bar'); setTitle(init?.title ?? ''); setUnit(init?.unit ?? ''); setSource(init?.source ?? ''); setSubtitle(init?.subtitle ?? ''); setData(toText(init ?? {})); setErr(null)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = useMemo(() => parseChartData(data), [data])
  const spec: ChartSpec | null = !data.trim() || parsed.error || !title.trim() ? null : { type, title: title.trim(), subtitle: subtitle.trim() || undefined, unit: unit.trim() || undefined, source: source.trim() || undefined, labels: parsed.labels, series: type === 'pie' ? parsed.series.slice(0, 1) : parsed.series }
  useEffect(() => {
    const host = prev.current
    if (!host || !spec) { host?.replaceChildren(); return }
    let live = true
    void document.fonts.load('800 40px "ESB Sans"').then(() => { if (!live) return; const c = renderChart(spec, cat.accent); c.className = 'me-chart-canvas'; host.replaceChildren(c) })
    return () => { live = false }
  }, [spec?.type, spec?.title, spec?.unit, spec?.source, spec?.subtitle, data, cat.accent]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { useUi.getState().closeSheet('ed-chart'); useDesk.setState({ chartIdea: null }) }
  const insert = async () => {
    if (!spec || !ed) return
    setBusy(true); setErr(null)
    try {
      await document.fonts.load('800 40px "ESB Sans"')
      const up = await uploadForStory(await chartToBlob(spec, cat.accent))
      if (!up.ok) { setErr(up.error); return }
      ed.chain().focus().insertContent({ type: 'image', attrs: { src: up.url, alt: chartAlt(spec), caption: spec.title, credit: '', align: 'full' } }).run()
      if (ideaIx != null) useEditorialStore.getState().setDraftField('chartIdeas', ideas.filter((_, k) => k !== ideaIx))
      close()
      snack('Chart added')
    } catch (e) { setErr(e instanceof Error ? e.message : 'The chart could not be added.') } finally { setBusy(false) }
  }
  return (
    <FullDialog open={isOpen} title="Chart for the story" onClose={close} footer={<><span className="me-meta me-grow">Drawn as a picture and uploaded to the site.</span><Button icon="check" busy={busy} disabled={!spec || !ed} onClick={() => void insert()}>Insert</Button></>}>
      <div className="m-wrap me-stack me-pad">
        {init && <Banner tone="info">An AI chart idea: every number was checked against the source article. Review it before inserting.</Banner>}
        <Segmented<ChartType> label="Chart type" value={type} onChange={setType} options={[{ value: 'bar', label: 'Columns' }, { value: 'hbar', label: 'Bars' }, { value: 'line', label: 'Line' }, { value: 'pie', label: 'Pie' }]} />
        <label className="m-field"><span className="m-field-label">Headline</span><input className="m-input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="me-two">
          <label className="m-field"><span className="m-field-label">Unit</span><input className="m-input" value={unit} placeholder="MW, Tk, %" onChange={(e) => setUnit(e.target.value)} /></label>
          <label className="m-field"><span className="m-field-label">Source</span><input className="m-input" value={source} onChange={(e) => setSource(e.target.value)} /></label>
        </div>
        <label className="m-field"><span className="m-field-label">Subtitle (optional)</span><input className="m-input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></label>
        <label className="m-field"><span className="m-field-label">Numbers — one row each: label, then number(s)</span>
          <textarea className="m-textarea me-mono" rows={6} spellCheck={false} value={data} placeholder={'Label, Value\nRow one, 10\nRow two, 12'} onChange={(e) => setData(e.target.value)} /></label>
        {data.trim() && parsed.error && <p className="me-meta is-bad">{parsed.error}</p>}
        {!title.trim() && <p className="me-hint">Add a headline to enable Insert.</p>}
        {err && <Banner tone={/Planned/i.test(err) ? 'planned' : 'error'}>{err}</Banner>}
        <div className="me-chart-prev" ref={prev} aria-label="Chart preview" />
      </div>
    </FullDialog>
  )
}

export function BodyEditor() {
  const body = useEditorialStore((s) => s.draft.body)
  const bodyHtml = useEditorialStore((s) => s.draft.bodyHtml)
  const ideas = useEditorialStore((s) => s.draft.chartIdeas ?? [])
  const setField = useEditorialStore((s) => s.setDraftField)
  const editing = useDesk((s) => s.editing)
  const writing = useDesk((s) => s.writing)
  const cat = useCategory()
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const ed = useHostedEditor(host)
  useEditorTick(ed)
  const rich = richOf({ body, bodyHtml })

  useEffect(() => {
    if (!ed) return
    let t: ReturnType<typeof setTimeout> | undefined
    const onFocus = () => { clearTimeout(t); useDesk.setState({ editing: true }) }
    const onBlur = () => { clearTimeout(t); t = setTimeout(() => { if (!ed.isFocused) useDesk.setState({ editing: false }) }, 120) }
    ed.on('focus', onFocus); ed.on('blur', onBlur)
    return () => { ed.off('focus', onFocus); ed.off('blur', onBlur); clearTimeout(t) }
  }, [ed])
  useEffect(() => () => useDesk.setState({ editing: false }), [])

  return (
    <div className="me-body">
      {ideas.length > 0 && (
        <div className="me-ideas" role="group" aria-label="Chart ideas from the AI">
          <span className="me-meta"><Icon name="sparkle" size={14} /> AI chart idea{ideas.length > 1 ? 's' : ''} — numbers taken from the source</span>
          <div className="m-chips">
            {ideas.map((c, i) => (
              <span key={i} className="me-idea">
                <button type="button" className="m-chip" onClick={() => { useDesk.setState({ chartIdea: i }); useUi.getState().openSheet('ed-chart') }}><Icon name="chart" size={16} /><span>{c.title}</span></button>
                <IconBtn icon="x" label={`Dismiss the chart idea ${c.title}`} onClick={() => setField('chartIdeas', ideas.filter((_, k) => k !== i))} />
              </span>
            ))}
          </div>
        </div>
      )}
      <div ref={setHost} className="me-rb-host">
        <PcHost className="me-rb" touch={false}>
          <RichBodyEditor body={body} bodyHtml={rich} accent={cat.accent} ideas={ideas} onIdeas={(l) => setField('chartIdeas', l)}
            uploadImage={uploadForStory} onChange={(html, plain) => { setField('bodyHtml', html); setField('body', plain) }} />
        </PcHost>
      </div>
      {!editing && !writing && <p className="me-hint me-body-hint"><Icon name="edit" size={14} /> Tap the story to write. Formatting tools appear above the keyboard; the rest are under More.</p>}
      {ed && (editing || writing) && <Toolbar ed={ed} />}
      {ed && <><MoreSheet ed={ed} /><LinkSheet ed={ed} /><PictureSheet ed={ed} /><ImageSheet ed={ed} /><TableSheet ed={ed} /><FindSheet ed={ed} /></>}
      <ChartSheet ed={ed} />
    </div>
  )
}
