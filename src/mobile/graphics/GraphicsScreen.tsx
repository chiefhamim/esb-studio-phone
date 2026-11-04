// Graphics: the PC Graphics workspace (src/pc, vendored from esb-banner-studio src/shell/GraphicsWorkspace.tsx) laid
// out for a phone. The banner is drawn only by the PC renderer through the PC Stage; every panel is the PC panel
// (StoryPanel, PhotosPanel, Elements/Layers Dock, Inspector) mounted in a <PcHost> inside a bottom sheet; every menu
// command calls the same PC store action as the PC menus File / Edit / Insert / Arrange / View.
//   compact  (< 600)  top bar · format strip · canvas · zoom + Export · dock (Story Photos Elements Layers Inspector)
//   medium   600–839  the same, Inspector can sit beside the canvas (toggle)
//   expanded >= 840   Inspector always beside the canvas
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Dock, Inspector, PhotosPanel, StoryPanel } from '../../pc/components/Panels'
import { CATEGORIES, FORMATS, getFormat } from '../../pc/core/tokens'
import type { FormatId } from '../../pc/core/types'
import { humanBytes, loadSettings, saveSettings } from '../../pc/export'
import type { ExportSettings } from '../../pc/export'
import { openProject, saveProject } from '../../pc/project'
import { normalizeDoc, useStore } from '../../pc/store'
import { getCollage } from '../../pc/core/collage'
import { FORMAT_IDS } from '../../pc/core/tokens'
import { readSharedFile } from '../../native/shareIn'
import { platform } from '../../platform/platform'
import { getThemePref, nextPref, setThemePref } from '../../shell/theme'
import { PcHost } from '../PcHost'
import { confirmAsk, snack, useSizeClass, useUi } from '../shell/core'
import { useIncoming } from '../shell/incoming'
import { useNav } from '../shell/nav'
import { SelectionTray } from './SelectionTray'
import { LivePreview } from './LivePreview'
import type { ScreenProps } from '../shell/nav'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { useDesk } from '../editorial/deskStore'
import { Banner, Button, ErrorState, Icon, IconBtn, Planned, Sheet, Skeleton, TopBar } from '../shell/ui'
import type { IconName } from '../shell/ui'
import { ExportSheet } from './ExportSheet'
import { saveFiles, shareOut } from './saveShare'
import { renderAll } from './exportRun'
import { ArrangeBar, CategorySheet, FormatStrip, PreviewDialog, ProjectsSheet, SizeSheet } from './parts'
import { setDockTab, useBaseAssets, usePcPortals } from './hooks'
import { TouchStage } from './TouchStage'
import { zoomBy, zoomCanvas } from './zoom'
import './graphics.css'

type DockId = 'story' | 'photos' | 'elements' | 'layers' | 'inspector'
const DOCK: { id: DockId; label: string; icon: IconName }[] = [
  { id: 'story', label: 'Menu', icon: 'newspaper' },
  { id: 'photos', label: 'Photos', icon: 'image' },
  { id: 'elements', label: 'Elements', icon: 'eye' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
  { id: 'inspector', label: 'Inspector', icon: 'sliders' },
]
const SIDE_KEY = 'esb-phone/graphics/side-inspector'

interface Cmd { label: string; icon?: IconName; run: () => void; disabled?: boolean; checked?: boolean; danger?: boolean; hint?: string; planned?: string }
interface CmdGroup { title: string; items: Cmd[] }

// ---------------------------------------------------------------- photos: gallery, camera, shared pictures
async function addFiles(files: File[]) {
  const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name))
  if (!imgs.length) return
  const before = useStore.getState().images.length
  await useStore.getState().addImages(imgs)
  const added = useStore.getState().images.length - before
  if (added > 0) snack(`Added ${added} photo${added === 1 ? '' : 's'}`)
  else snack('These pictures could not be opened', { tone: 'error' })
}
const pickGallery = () => { void platform().pickFiles({ accept: ['image/*'], multiple: true }).then(addFiles).catch((e) => snack('Could not open the gallery: ' + String(e), { tone: 'error' })) }
const takePhoto = () => { void platform().takePhoto().then((f) => (f ? addFiles([f]) : undefined)).catch((e) => snack('Could not use the camera: ' + String(e), { tone: 'error' })) }

async function importShared() {
  const inc = useIncoming.getState().pending
  const files = inc?.files.filter((f) => f.mime.startsWith('image/')) ?? []
  if (!inc || !files.length) return
  useIncoming.getState().take()
  const out: File[] = []
  let failed = 0
  for (const f of files) {
    try { const b = await readSharedFile(f); out.push(new File([b], f.name || 'shared.jpg', { type: f.mime })) } catch { failed++ }
  }
  if (out.length) await addFiles(out)
  if (failed) snack(`${failed} shared picture${failed === 1 ? '' : 's'} could not be read`, { tone: 'error' })
}

export default function GraphicsScreen({ active }: ScreenProps) {
  const backTo = useNav((st) => st.backTo)
  // The bridge to publishing: a story with a headline is in progress, so Graphics offers Publish / Update straight from here.
  // The banner is the story's banner (same store as the Story screens), so nothing needs saving or exporting first.
  const storyHeadline = useEditorialStore((st) => st.draft.headline)
  // the banner is one step of the story: when it is done the next step is Check (SEO, captions, previews), then Publish
  const toCheck = () => {
    useDesk.getState().set({ view: 'story', tab: 'seo', writing: false })
    useNav.setState({ route: 'editorial', backTo: null })
  }
  const size = useSizeClass()
  const [assets, retry] = useBaseAssets()
  usePcPortals()
  const base = assets.kind === 'ready' ? assets.base : null

  const format = useStore((s) => s.format)
  const past = useStore((s) => s.past.length)
  const future = useStore((s) => s.future.length)
  const projectName = useStore((s) => s.projectName)
  const dirty = useStore((s) => s.dirty)
  const notice = useStore((s) => s.notice)
  const images = useStore((s) => s.images)
  const selCount = useStore((s) => s.selectedIds.length)
  const hasClip = useStore((s) => !!s.clip)
  const zoom = useStore((s) => s.zoom)
  const scale = useStore((s) => s.scale)
  const snapOn = useStore((s) => s.snap)
  const rulers = useStore((s) => s.rulers)
  const canvasGrid = useStore((s) => s.canvasGrid)
  const cropGuides = useStore((s) => s.cropGuides)
  const showDimensions = useStore((s) => s.showDimensions)
  const tool = useStore((s) => s.tool)
  const guideCount = useStore((s) => s.doc.guides[s.format].length)
  const catId = useStore((s) => s.doc.content.categoryId)
  const sheet = useUi((s) => s.sheet)
  const openSheet = useUi((s) => s.openSheet)

  const [exp, setExpState] = useState<ExportSettings>(loadSettings)
  const setExp = useCallback((s: ExportSettings) => { setExpState(s); saveSettings(s) }, [])
  const [showExport, setShowExport] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sideOpen, setSideOpen] = useState(() => { try { return localStorage.getItem(SIDE_KEY) === '1' } catch { return false } })
  const toggleSide = () => setSideOpen((v) => { try { localStorage.setItem(SIDE_KEY, v ? '0' : '1') } catch { /* ignore */ } return !v })
  const side = size === 'expanded' || (size === 'medium' && sideOpen)
  const st = useStore.getState

  // ---------------------------------------------------------------- photo slots always match the collage
  // A banner started with a bare defaultDoc() (src/mobile/library/storyGraphics.ts resetBanner) has no photo slots, so
  // photos could never be placed. The PC's own start (initialDoc) runs fitSlots; normalizeDoc does the same here,
  // without an undo step.
  useEffect(() => {
    const fix = (doc: ReturnType<typeof useStore.getState>['doc']) => {
      const n = getCollage(doc.photos.collage).count
      if (FORMAT_IDS.some((f) => (doc.photos.slots[f]?.length ?? 0) !== n)) { const dirty = useStore.getState().dirty; useStore.setState({ doc: normalizeDoc(structuredClone(doc), true) }); if (useStore.getState().dirty !== dirty) useStore.setState({ dirty }) }
    }
    fix(useStore.getState().doc)
    return useStore.subscribe((s, p) => { if (s.doc !== p.doc) fix(s.doc) })
  }, [])

  // ---------------------------------------------------------------- category colour for PC chrome (as the PC App sets it)
  useEffect(() => {
    if (!active) return
    const c = CATEGORIES.find((x) => x.id === catId)
    const root = document.documentElement.style
    if (c) { root.setProperty('--cat', c.accent); root.setProperty('--cat-ink', c.chipText) }
  }, [active, catId])

  // ---------------------------------------------------------------- PC notices -> snackbars
  useEffect(() => {
    if (!notice || !active) return
    snack(notice)
    useStore.getState().setNotice(null)
  }, [notice, active])

  // ---------------------------------------------------------------- the PC canvas asks for photos (empty slot card, double-tap a photo)
  useEffect(() => {
    const on = () => { openSheet('gx-photos'); pickGallery() }
    window.addEventListener('esb:add-photos', on)
    return () => window.removeEventListener('esb:add-photos', on)
  }, [openSheet])

  // ---------------------------------------------------------------- export
  const quickExport = useCallback(async (formats: FormatId[]) => {
    if (!base) return
    const doc = useStore.getState().doc
    setBusy(true)
    try {
      const files = await renderAll(doc, base, { ...exp, formats, zip: false }, () => undefined)
      const res = await saveFiles(files)
      const ok = res.filter((r) => r.state === 'saved')
      const bytes = ok.reduce((a, r) => a + r.file.bytes.length, 0)
      const failed = res.filter((r) => r.state === 'failed')
      if (!failed.length) snack(`Saved ${ok.length} file${ok.length === 1 ? '' : 's'} · ${humanBytes(bytes)}`, { tone: 'success' })
      else snack(`${failed.length} of ${res.length} not saved: ${failed[0].error ?? ''}`, { tone: 'error', action: { label: 'Share', run: () => void shareOut(failed.map((r) => r.file)) } })
    } catch (e) {
      snack(e instanceof Error ? e.message : String(e), { tone: 'error' })
    } finally { setBusy(false) }
  }, [base, exp])

  // ---------------------------------------------------------------- new banner (asks first when there is work on it)
  const newBanner = useCallback(async (keep: boolean) => {
    const s = useStore.getState()
    const has = !!s.doc.content.headline.trim() || s.images.length > 0 || s.past.length > 0
    if (has && !(await confirmAsk({ title: keep ? 'Next story, same layout?' : 'Start a new banner?', body: keep ? 'Clears the headline and the photos; keeps every layout and style change. You can undo it.' : 'Clears this banner. You can undo it.', confirm: keep ? 'Next story' : 'New banner' }))) return
    useStore.getState().newBanner(keep)
    useStore.getState().setZoom('fit')
  }, [])

  // ---------------------------------------------------------------- intents from Home / share-in
  const handled = useRef(0)
  const intent = useNav((s) => s.graphicsIntent)
  useEffect(() => {
    if (!intent || intent.at === handled.current || !base) return
    handled.current = intent.at
    if (intent.kind === 'photos') { openSheet('gx-photos'); void importShared() }
    else if (intent.kind === 'export') setShowExport(true)
    else if (intent.kind === 'new') void newBanner(false).then(() => { if (intent.format) useStore.getState().setFormat(intent.format as never) })
  }, [intent, base, openSheet, newBanner])

  // ---------------------------------------------------------------- hardware keyboard (DeX, tablets): the PC shortcuts that apply
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = (t instanceof HTMLInputElement && !['range', 'checkbox'].includes(t.type)) || t instanceof HTMLTextAreaElement || t.isContentEditable
      const s = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'e') { e.preventDefault(); setShowExport(true); return }
      if (mod && k === 's') { e.preventDefault(); void saveProject(e.shiftKey); return }
      if (typing || showExport || useUi.getState().sheet) return
      if (e.key === 'Escape') { s.select(null); return }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return }
      if (mod && k === 'y') { e.preventDefault(); s.redo(); return }
      if (mod && k === 'c') { if (s.copySelected()) { e.preventDefault(); snack('Copied') } return }
      if (mod && k === 'x') { e.preventDefault(); s.cutSelected(); return }
      if (mod && k === 'v') { if (s.clip) { e.preventDefault(); s.pasteClip(e.shiftKey) } return }
      if (mod && k === 'a') { e.preventDefault(); s.selectAll(); return }
      if (mod && k === 'd') { e.preventDefault(); s.duplicateSelected(); return }
      if (mod && k === '0') { e.preventDefault(); zoomCanvas('fit'); return }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomBy(1); return }
      if (mod && k === '-') { e.preventDefault(); zoomBy(-1); return }
      if (mod) return
      if (k === 't') { e.preventDefault(); s.addText(); return }
      if (k === 'r') { e.preventDefault(); s.addRect(); return }
      if (!s.selectedIds.length) return
      const step = e.shiftKey ? 10 : 1
      const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      if (dir[e.key]) {
        e.preventDefault()
        const [dx, dy] = dir[e.key]
        const els = s.scene().elements.filter((x) => s.selectedIds.includes(x.id) && !x.locked && x.kind !== 'watermark')
        if (els.length) s.moveElements(els.map((x) => ({ id: x.id, x: x.x + dx, y: x.y + dy })))
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); s.deleteSelected() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, showExport])

  // ---------------------------------------------------------------- the PC menus, phone edition
  const has = selCount > 0
  const sel = () => st().selectedId
  const flip = (field: 'visible' | 'locked') => st().selectedIds.forEach((id) => { const e = st().scene().elements.find((x) => x.id === id); if (e) st().setOverride(id, { [field]: !e[field] }) })
  const themePref = getThemePref()
  const groups: CmdGroup[] = useMemo(() => [
    { title: 'File', items: [
      { label: 'New banner', icon: 'filePlus', run: () => void newBanner(false) },
      { label: 'Next story · keep this layout', icon: 'swap', hint: 'clears headline + photos', run: () => void newBanner(true) },
      { label: 'Open project', icon: 'folder', run: () => void openProject() },
      { label: 'Save project', icon: 'download', hint: projectName ? projectName : 'on this phone', run: () => void saveProject(false) },
      { label: 'Save project as', icon: 'download', run: () => void saveProject(true) },
      { label: 'Import photos', icon: 'image', run: pickGallery },
      { label: 'Take a photo', icon: 'image', run: takePhoto },
      { label: 'Export', icon: 'sliders', run: () => setShowExport(true) },
      { label: 'Quick: this banner only', icon: 'download', hint: `${getFormat(format).name} · ${exp.type.toUpperCase()} ${exp.scales.map((s) => s + '×').join(' ')}`, run: () => void quickExport([format]), disabled: busy || !base },
      { label: 'Quick: Newsroom Bundle (FB + Web)', icon: 'download', hint: '4:5 + 16:9', run: () => void quickExport(['fb45', 'web']), disabled: busy || !base },
      { label: 'Quick: all selected formats', icon: 'download', hint: exp.formats.map((f) => getFormat(f).short).join(', '), run: () => void quickExport(exp.formats), disabled: busy || !base || !exp.formats.length },
      { label: 'Drag to Post', icon: 'hand', planned: 'desktop drag-out; use Export › Share', run: () => undefined, disabled: true },
    ] },
    { title: 'Edit', items: [
      { label: 'Undo', icon: 'undo', disabled: !past, run: () => st().undo() },
      { label: 'Redo', icon: 'redo', disabled: !future, run: () => st().redo() },
      { label: 'Cut', icon: 'copy', disabled: !has, run: () => st().cutSelected() },
      { label: 'Copy', icon: 'copy', disabled: !has, run: () => { if (st().copySelected()) snack('Copied') } },
      { label: 'Paste', icon: 'copy', disabled: !hasClip, run: () => st().pasteClip(false) },
      { label: 'Paste in place', icon: 'copy', disabled: !hasClip, run: () => st().pasteClip(true) },
      { label: 'Duplicate', icon: 'copy', disabled: !has, run: () => st().duplicateSelected() },
      { label: 'Delete', icon: 'trash', danger: true, disabled: !has, run: () => st().deleteSelected() },
      { label: 'Select all', icon: 'select', run: () => st().selectAll() },
      { label: 'Deselect', icon: 'x', disabled: !has, run: () => st().select(null) },
    ] },
    { title: 'Insert', items: [
      { label: 'Text', icon: 'text', run: () => st().addText() },
      { label: 'Rectangle', icon: 'square', run: () => st().addRect() },
      { label: 'Photos', icon: 'image', run: pickGallery },
      ...images.slice(0, 6).map((im) => ({ label: im.name, icon: 'image' as IconName, hint: 'add the library photo as a layer', run: () => st().addImageLayer(im.id) })),
    ] },
    { title: 'Arrange', items: [
      { label: 'Bring to front', icon: 'front', disabled: !has, run: () => { const id = sel(); if (id) st().moveLayer(id, 'front') } },
      { label: 'Bring forward', icon: 'forward', disabled: !has, run: () => { const id = sel(); if (id) st().moveLayer(id, 'up') } },
      { label: 'Send backward', icon: 'backward', disabled: !has, run: () => { const id = sel(); if (id) st().moveLayer(id, 'down') } },
      { label: 'Send to back', icon: 'back', disabled: !has, run: () => { const id = sel(); if (id) st().moveLayer(id, 'back') } },
      { label: 'Align left', icon: 'alignLeft', disabled: !has, run: () => st().alignSelected('left') },
      { label: 'Align centre', icon: 'alignHCenter', disabled: !has, run: () => st().alignSelected('hcenter') },
      { label: 'Align right', icon: 'alignRight', disabled: !has, run: () => st().alignSelected('right') },
      { label: 'Align top', icon: 'alignTop', disabled: !has, run: () => st().alignSelected('top') },
      { label: 'Align middle', icon: 'alignVCenter', disabled: !has, run: () => st().alignSelected('vcenter') },
      { label: 'Align bottom', icon: 'alignBottom', disabled: !has, run: () => st().alignSelected('bottom') },
      { label: 'Distribute across', icon: 'distH', disabled: selCount < 3, run: () => st().distributeSelected('x') },
      { label: 'Distribute down', icon: 'distV', disabled: selCount < 3, run: () => st().distributeSelected('y') },
      { label: 'Hide / show', icon: 'eyeOff', disabled: !has, run: () => flip('visible') },
      { label: 'Lock / unlock', icon: 'lock', disabled: !has, run: () => flip('locked') },
      { label: 'Reset all layers on this banner', icon: 'reset', run: () => st().resetAllOverrides() },
    ] },
    { title: 'View', items: [
      { label: 'Zoom in', icon: 'plus', run: () => zoomBy(1) },
      { label: 'Zoom out', icon: 'minus', run: () => zoomBy(-1) },
      { label: 'Fit to screen', icon: 'fit', checked: zoom === 'fit', run: () => zoomCanvas('fit') },
      { label: 'Actual size (100%)', icon: 'fit', run: () => zoomCanvas(1) },
      { label: 'Zoom to selection', icon: 'fit', disabled: !has, run: () => window.dispatchEvent(new CustomEvent('esb:zoom-selection')) },
      { label: 'Facebook preview', icon: 'eye', run: () => setShowPreview(true), disabled: !base },
      { label: 'Hand tool (one finger pans)', icon: 'hand', checked: tool === 'hand', run: () => st().setTool(tool === 'hand' ? 'select' : 'hand') },
      { label: 'Rulers & guides', icon: 'ruler', checked: rulers, run: () => st().setRulers(!rulers) },
      { label: 'Canvas grid', icon: 'dotgrid', checked: canvasGrid, run: () => st().setCanvasGrid(!canvasGrid) },
      { label: 'Snap to edges, centres & guides', icon: 'magnet', checked: snapOn, run: () => st().setSnap(!snapOn) },
      { label: 'Crop guides (how Facebook trims)', icon: 'crop', checked: cropGuides, run: () => st().setCropGuides(!cropGuides) },
      { label: 'Element dimensions', icon: 'dimension', checked: showDimensions, run: () => st().setShowDimensions(!showDimensions) },
      { label: 'Clear guides', icon: 'ruler', disabled: !guideCount, run: () => st().clearGuides() },
      { label: `Theme: ${themePref === 'auto' ? 'System' : themePref === 'light' ? 'Light' : 'Dark'}`, icon: themePref === 'dark' ? 'moon' : 'sun', hint: 'tap to switch', run: () => setThemePref(nextPref(getThemePref())) },
    ] },
  ], [newBanner, projectName, format, exp, quickExport, busy, base, past, future, has, hasClip, images, selCount, zoom, tool, rulers, canvasGrid, snapOn, cropGuides, showDimensions, guideCount, themePref]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDock = (id: DockId) => {
    if (id === 'inspector' && size === 'medium') { toggleSide(); return }
    if (id === 'elements' || id === 'layers') setDockTab(id)
    openSheet('gx-' + id)
  }

  const pct = Math.round(scale * 100)
  const sub = `${FORMATS[format].w}×${FORMATS[format].h}${dirty ? ' · edited' : ''}`

  return (
    <div className="m-screen gx" data-size={size} style={{ '--gx-side': side ? '1' : '0' } as CSSProperties}>
      <TopBar
        leading={size === 'compact' ? <IconBtn icon="chevLeft" label={backTo ? 'Back to the story' : 'Back to Home'} onClick={() => useNav.getState().back()} /> : undefined}
        title={projectName ?? 'Untitled banner'}
        sub={sub}
        actions={<>
          <IconBtn icon="undo" label="Undo" disabled={!past} onClick={() => st().undo()} />
          <IconBtn icon="redo" label="Redo" disabled={!future} onClick={() => st().redo()} />
          {size === 'medium' && <IconBtn icon="sliders" label={sideOpen ? 'Hide the Inspector panel' : 'Show the Inspector panel'} active={sideOpen} onClick={toggleSide} />}
          <IconBtn icon="more" label="More: File, Edit, Insert, Arrange, View" onClick={() => openSheet('gx-more')} />
        </>}
      />
      <FormatStrip />

      <div className="gx-body">
        <main className="gx-main">
          {assets.kind === 'loading' && <div className="gx-loading"><div className="gx-skel-art" aria-hidden /><Skeleton rows={2} /><p className="gx-help">Loading fonts and artwork…</p></div>}
          {assets.kind === 'error' && <ErrorState title="The banner engine could not start" body={`Fonts or the logo did not load: ${assets.message}`} onRetry={retry} />}
          {base && <PcHost className="gx-stagehost"><TouchStage base={base} /></PcHost>}
          {base && <SelectionTray />}
        </main>
        {side && (
          <aside className="gx-side" aria-label="Inspector">
            <PcHost className="gx-panel"><Inspector /></PcHost>
          </aside>
        )}
      </div>

      {base && images.length === 0 && (
        <div className="gx-empty" role="status">
          <Icon name="image" size={20} />
          <span className="gx-empty-text"><b>No photo yet</b><small>Add pictures for the photo slots</small></span>
          <Button kind="tonal" icon="image" onClick={pickGallery}>Gallery</Button>
          <Button kind="text" onClick={takePhoto} label="Take a photo with the camera">Camera</Button>
        </div>
      )}

      <div className="gx-tools" role="toolbar" aria-label="Zoom and export">
        <div className="gx-zoomgrp">
        <IconBtn icon="minus" label="Zoom out" onClick={() => zoomBy(-1)} disabled={!base} />
        <button type="button" className={'gx-zoom' + (zoom === 'fit' ? ' is-fit' : '')} onClick={() => zoomCanvas(zoom === 'fit' ? 1 : 'fit')} disabled={!base} aria-label={zoom === 'fit' ? `Fit, ${pct}%. Tap for 100%` : `${pct}%. Tap to fit`}>
          {zoom === 'fit' ? `Fit · ${pct}%` : `${pct}%`}
        </button>
        <IconBtn icon="plus" label="Zoom in" onClick={() => zoomBy(1)} disabled={!base} />
        </div>
        <span className="m-spacer" />
        <Button kind="tonal" icon="download" busy={busy} disabled={!base} label="Export the banner" onClick={() => setShowExport(true)}>Export</Button>
        {storyHeadline.trim() && <Button icon="check" disabled={!base} onClick={toCheck}>Check story</Button>}
      </div>

      <nav className="gx-dock" aria-label="Graphics panels">
        {DOCK.filter((d) => !(d.id === 'inspector' && size === 'expanded')).map((d) => {
          const on = sheet === 'gx-' + d.id || (d.id === 'inspector' && side)
          return (
            <button key={d.id} type="button" className={'gx-dock-item' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => openDock(d.id)} disabled={!base}>
              <span className="gx-dock-pill"><Icon name={d.icon} size={22} />{d.id === 'inspector' && selCount > 0 && <span className="m-badge">{selCount}</span>}{d.id === 'photos' && images.length > 0 && <span className="m-badge">{images.length}</span>}</span>
              <span className="gx-dock-label">{d.label}</span>
            </button>
          )
        })}
      </nav>

      {base && <Sheets />}
      <MoreSheet groups={groups} />
      <CategorySheet />
      <SizeSheet />
      <ProjectsSheet />
      {base && <ExportSheet open={showExport} onClose={() => setShowExport(false)} base={base} settings={exp} setSettings={setExp} />}
      {base && <PreviewDialog open={showPreview} onClose={() => setShowPreview(false)} base={base} />}
    </div>
  )
}

function Sheets() {
  const images = useStore((s) => s.images.length)
  const selCount = useStore((s) => s.selectedIds.length)
  const st = useStore.getState
  return (
    <>
      <Sheet id="gx-story" title="Menu" wide>
        {/* the PC's Category row opens the phone's category sheet (numbered dots) instead of its own cramped grid */}
        <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest('.pnl[data-panel="Category"] > header')) { e.stopPropagation(); e.preventDefault(); useUi.getState().openSheet('gx-category') } }}>
          <LivePreview />
          <PcHost className="gx-panel"><StoryPanel /></PcHost>
        </div>
      </Sheet>
      <Sheet id="gx-photos" title="Photos" wide actions={<span className="gx-sheet-count">{images ? `${images} in library` : ''}</span>}>
        <div className="gx-photo-actions">
          <Button kind="filled" icon="image" onClick={pickGallery}>Gallery</Button>
          <Button kind="tonal" onClick={takePhoto}>Camera</Button>
        </div>
        <p className="gx-help">Tap a photo to place it in the selected slot. On the banner: drag a photo to pan it; with the photo selected, pinch with two fingers to zoom it.</p>
        <PcHost className="gx-panel"><PhotosPanel addPhotos={pickGallery} /></PcHost>
      </Sheet>
      <Sheet id="gx-elements" title="Elements" wide>
        <PcHost className="gx-panel gx-dockhost"><Dock key="elements" /></PcHost>
      </Sheet>
      <Sheet id="gx-layers" title="Layers" wide actions={<>
        <IconBtn icon="text" label="Add text layer" onClick={() => st().addText()} />
        <IconBtn icon="square" label="Add rectangle" onClick={() => st().addRect()} />
      </>}>
        <ArrangeBar />
        <PcHost className="gx-panel gx-dockhost"><Dock key="layers" /></PcHost>
      </Sheet>
      <Sheet id="gx-inspector" title={selCount > 1 ? `Inspector · ${selCount} layers` : 'Inspector'} wide>
        <LivePreview />
        <PcHost className="gx-panel"><Inspector /></PcHost>
      </Sheet>
    </>
  )
}

function MoreSheet({ groups }: { groups: CmdGroup[] }) {
  const close = () => useUi.getState().closeSheet('gx-more')
  return (
    <Sheet id="gx-more" title="More" wide initial="full">
      {groups.map((g) => (
        <section key={g.title} className="gx-more-sec" aria-label={g.title}>
          <h3 className="gx-ex-title">{g.title}</h3>
          <div className="gx-more-grid">
            {g.items.map((it, i) => (
              <button key={g.title + i} type="button" className={'gx-more-item' + (it.danger ? ' is-danger' : '') + (it.checked ? ' is-on' : '')} disabled={it.disabled} aria-pressed={it.checked ?? undefined} onClick={() => { close(); it.run() }}>
                {it.icon && <Icon name={it.icon} size={20} />}
                <span className="gx-more-text"><span>{it.label}</span>{it.hint && <small>{it.hint}</small>}{it.planned && <Planned>{it.planned}</Planned>}</span>
                {it.checked && <Icon name="check" size={18} />}
              </button>
            ))}
          </div>
        </section>
      ))}
      <Banner tone="info">Tap a layer to select it; rest a finger on it a moment, then drag to move or resize. Two fingers zoom and pan the canvas.</Banner>
    </Sheet>
  )
}
