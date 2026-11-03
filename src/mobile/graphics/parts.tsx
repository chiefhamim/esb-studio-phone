// Smaller pieces of the Graphics screen: base-asset loading, PC portals inside the PC style scope, the format and
// category strip, the Facebook preview, the project chooser and the selection's arrange bar.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Assets } from '../../pc/core/render'
import { CATEGORIES, FORMAT_LIST, getCategory } from '../../pc/core/tokens'
import { FacebookMock } from '../../pc/components/PreviewPanel'
import { KIND_ICON } from '../../pc/ui/Icon'
import { useStore } from '../../pc/store'
import { listProjects, setProjectChooser } from '../../platform/esbShim'
import { useBackLayer, useUi } from '../shell/core'
import { CatDot, CatName, FormatMark } from '../shell/cat'
import { Button, Chip, Empty, FullDialog, Icon, IconBtn, Row, Segmented, Sheet, Skeleton } from '../shell/ui'
import type { IconName } from '../shell/ui'

// ---------------------------------------------------------------- format + category strip
// The two pickers share their tiles. From the pills at the top of the canvas they drop DOWN from the pill; from the Story
// sheet's Category row they open as a sheet that is exactly as tall as its content.
function CatTiles({ onPick }: { onPick: () => void }) {
  const catId = useStore((s) => s.doc.content.categoryId)
  return (
    <div className="gx-grid">
      {CATEGORIES.map((c) => (
        <button key={c.id} type="button" style={{ '--cc': c.accent } as React.CSSProperties} className={'gx-tile' + (c.id === catId ? ' is-on' : '')} aria-pressed={c.id === catId} onClick={() => { useStore.getState().setContent({ categoryId: c.id }); onPick() }}>
          <CatDot cat={c} size={32} />
          <span className="gx-tile-txt"><CatName cat={c} /></span>
          {c.id === catId && <Icon name="check" size={16} />}
        </button>
      ))}
    </div>
  )
}

function SizeTiles({ onPick }: { onPick: () => void }) {
  const format = useStore((s) => s.format)
  return (
    <div className="gx-grid">
      {FORMAT_LIST.map((f) => {
        const long = Math.max(f.w, f.h)
        return (
          <button key={f.id} type="button" className={'gx-tile gx-tile-size' + (f.id === format ? ' is-on' : '')} aria-pressed={f.id === format} onClick={() => { useStore.getState().setFormat(f.id); onPick() }}>
            <span className="gx-tile-glyph" aria-hidden><i style={{ width: Math.round((f.w / long) * 30), height: Math.round((f.h / long) * 30) }} /></span>
            <span className="gx-tile-txt"><b>{f.name}</b><small><b>{f.ratio}</b>{f.w}×{f.h}</small></span>
            {f.id === format && <Icon name="check" size={16} />}
          </button>
        )
      })}
    </div>
  )
}

export function FormatStrip() {
  const format = useStore((s) => s.format)
  const catId = useStore((s) => s.doc.content.categoryId)
  const cat = getCategory(catId)
  const f = FORMAT_LIST.find((x) => x.id === format) ?? FORMAT_LIST[0]
  const [drop, setDrop] = useState<null | 'cat' | 'size'>(null)
  const close = () => setDrop(null)
  useBackLayer(drop !== null, close, 'menu')
  const rowRef = useRef<HTMLDivElement>(null)
  const top = rowRef.current ? rowRef.current.getBoundingClientRect().bottom + 6 : 0
  return (
    <div className="gx-pick" role="toolbar" aria-label="Category and banner size" ref={rowRef}>
      <button type="button" className={'gx-drop gx-drop-cat' + (drop === 'cat' ? ' is-open' : '')} style={{ '--cc': cat.accent } as React.CSSProperties} aria-haspopup="listbox" aria-expanded={drop === 'cat'} onClick={() => setDrop(drop === 'cat' ? null : 'cat')} aria-label={`Category: ${cat.name}. Change`}>
        <CatDot cat={cat} size={22} />
        <CatName cat={cat} className="gx-drop-name" />
        <Icon name="chevDown" size={18} />
      </button>
      <button type="button" className={'gx-drop gx-drop-size' + (drop === 'size' ? ' is-open' : '')} aria-haspopup="listbox" aria-expanded={drop === 'size'} onClick={() => setDrop(drop === 'size' ? null : 'size')} aria-label={`Size: ${f.name}, ${f.ratio}. Change`}>
        <FormatMark id={f.id} size={20} />
        <b>{f.ratio}</b>
        <Icon name="chevDown" size={18} />
      </button>
      {drop && createPortal(
        <div className="gx-dropscrim" onClick={close}>
          <div className="gx-droppanel" role="listbox" aria-label={drop === 'cat' ? 'Category' : 'Size'} style={{ top }} onClick={(e) => e.stopPropagation()}>
            {drop === 'cat' ? <CatTiles onPick={close} /> : <SizeTiles onPick={close} />}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export function CategorySheet() {
  return (
    <Sheet id="gx-category" title="Category" initial="half">
      <CatTiles onPick={() => useUi.getState().closeSheet('gx-category')} />
    </Sheet>
  )
}

export function SizeSheet() {
  return (
    <Sheet id="gx-size" title="Size" initial="half">
      <SizeTiles onPick={() => useUi.getState().closeSheet('gx-size')} />
    </Sheet>
  )
}

// ---------------------------------------------------------------- Facebook preview (PC FacebookMock, same renderer)
type Device = 'phone' | 'desktop' | 'link'
export function PreviewDialog({ open, onClose, base }: { open: boolean; onClose: () => void; base: Assets }) {
  const [device, setDevice] = useState<Device>('phone')
  const [dark, setDark] = useState(false)
  const headlineBg = useStore((s) => s.doc.content.headlineBg)
  const bandOpacity = useStore((s) => s.doc.content.bandOpacity ?? 1)
  const box = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    if (!open) return
    const el = box.current
    if (!el) return
    const natural = device === 'desktop' ? 760 : 414
    const fit = () => setZoom(Math.min(1, (el.clientWidth - 16) / (natural + 32)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, device])
  return (
    <FullDialog open={open} title="Facebook preview" onClose={onClose}>
      <div className="m-wrap gx-preview">
        <Segmented label="Preview" value={device} onChange={setDevice} options={[{ value: 'phone', label: 'Phone' }, { value: 'desktop', label: 'Desktop' }, { value: 'link', label: 'Link post' }]} />
        <div className="m-chips">
          <Chip on={dark} onClick={() => setDark(!dark)} icon="moon">Facebook dark mode</Chip>
          <Chip on={!!headlineBg} icon="layers" onClick={() => {
            const next = !headlineBg
            useStore.getState().setContent({ headlineBg: next, bandOpacity: next && bandOpacity === 1 ? 0 : (!next && bandOpacity === 0 ? 1 : bandOpacity) })
          }}>Translucent headline</Chip>
        </div>
        <div className="gx-preview-box pc-host" ref={box}>
          <div style={{ zoom }}><FacebookMock base={base} device={device} dark={dark} zoom={zoom} /></div>
        </div>
      </div>
    </FullDialog>
  )
}

// ---------------------------------------------------------------- open project: a sheet listing projects saved on the phone
let pending: ((path: string | null) => void) | null = null
export function ProjectsSheet() {
  const open = useUi((s) => s.sheet === 'gx-projects')
  const [list, setList] = useState<{ path: string; name: string }[] | null>(null)
  useEffect(() => {
    setProjectChooser(() => new Promise<string | null>((resolve) => { pending?.(null); pending = resolve; useUi.getState().openSheet('gx-projects') }))
    return () => setProjectChooser(null)
  }, [])
  useEffect(() => { if (open) { setList(null); void listProjects().then(setList).catch(() => setList([])) } }, [open])
  const done = (p: string | null) => { const r = pending; pending = null; r?.(p); useUi.getState().closeSheet('gx-projects') }
  return (
    <Sheet id="gx-projects" title="Open project" onClosed={() => { const r = pending; pending = null; r?.(null) }}>
      {list === null ? <Skeleton rows={3} /> : list.length === 0
        ? <Empty icon="folder" title="No saved projects" body="Save a banner with More › Save project. Projects stay on this phone." />
        : list.map((p) => <Row key={p.path} lead={<Icon name="newspaper" size={22} />} title={p.name} meta="Saved on this phone" onClick={() => done(p.path)} />)}
    </Sheet>
  )
}

// ---------------------------------------------------------------- the selection's arrange bar (Layers sheet, touch reorder)
export function ArrangeBar() {
  const ids = useStore((s) => s.selectedIds)
  const doc = useStore((s) => s.doc)
  const format = useStore((s) => s.format)
  const st = useStore.getState
  const els = st().scene().elements
  const sel = ids.map((id) => els.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e)
  void doc; void format
  if (!sel.length) return <p className="gx-help">Select a layer (tap it on the banner or in the list) to move it up or down, duplicate, hide or lock it.</p>
  const one = sel.length === 1 ? sel[0] : null
  const btn = (icon: IconName, label: string, run: () => void, disabled = false) => <IconBtn key={label} icon={icon} label={label} onClick={run} disabled={disabled} />
  const id = st().selectedId
  return (
    <div className="gx-arrange">
      <div className="gx-arrange-head">
        {one ? <><Icon name={KIND_ICON[one.kind]} size={18} /><b>{one.name}</b></> : <b>{sel.length} layers selected</b>}
      </div>
      <div className="gx-arrange-row" role="toolbar" aria-label="Order">
        {btn('front', 'Bring to front', () => id && st().moveLayer(id, 'front'), !id)}
        {btn('forward', 'Bring forward', () => id && st().moveLayer(id, 'up'), !id)}
        {btn('backward', 'Send backward', () => id && st().moveLayer(id, 'down'), !id)}
        {btn('back', 'Send to back', () => id && st().moveLayer(id, 'back'), !id)}
        {btn('copy', 'Duplicate', () => st().duplicateSelected())}
        {btn('trash', 'Delete or hide', () => st().deleteSelected())}
      </div>
      <div className="gx-arrange-row" role="toolbar" aria-label="Align">
        {btn('alignLeft', 'Align left', () => st().alignSelected('left'))}
        {btn('alignHCenter', 'Align centre', () => st().alignSelected('hcenter'))}
        {btn('alignRight', 'Align right', () => st().alignSelected('right'))}
        {btn('alignTop', 'Align top', () => st().alignSelected('top'))}
        {btn('alignVCenter', 'Align middle', () => st().alignSelected('vcenter'))}
        {btn('alignBottom', 'Align bottom', () => st().alignSelected('bottom'))}
      </div>
      {sel.length > 2 && (
        <div className="gx-arrange-row" role="toolbar" aria-label="Distribute">
          <Button kind="tonal" icon="distH" onClick={() => st().distributeSelected('x')}>Distribute across</Button>
          <Button kind="tonal" icon="distV" onClick={() => st().distributeSelected('y')}>Distribute down</Button>
        </div>
      )}
    </div>
  )
}

