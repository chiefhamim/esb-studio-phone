// What you can do with the selected layer, as large touch targets docked at the foot of the canvas area. It replaces the
// PC Stage's floating Quickbar, which on a phone floats over the banner, scrolls sideways and ends up under other panels.
// Style opens the Inspector sheet (the PC's full property panel); Edit opens the sheet that owns that layer's content.
// "More" opens a second row with the things people reach for most while laying out a banner: lock, stacking order, centring,
// opacity and (for text) size, alignment and weight.
import { useEffect, useRef, useState } from 'react'
import { FORMATS } from '../../pc/core/tokens'
import type { Align } from '../../pc/core/types'
import { useStore } from '../../pc/store'
import { useUi } from '../shell/core'
import { Icon } from '../shell/ui'
import type { IconName } from '../shell/ui'

interface Act { icon: IconName; label: string; run: () => void; danger?: boolean; on?: boolean }

const OPACITY_STEPS = [1, 0.75, 0.5, 0.25]
const NEXT_ALIGN: Record<Align, Align> = { left: 'center', center: 'right', right: 'left' }
const ALIGN_ICON: Record<Align, IconName> = { left: 'alignTextLeft', center: 'alignTextCenter', right: 'alignTextRight' }

const SIZE_MIN = 6, SIZE_MAX = 600
const SLIDER_MAX = 240
const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))

/** Font size, the way the PC does it. Drag across the number to scrub (about 3 dp per pixel, so a thumb sweep covers 100 px of type), slide the
 *  slider for the big moves, tap +/- for one pixel and hold to run (it speeds up), or tap the number and type 55. Every live change skips the
 *  undo history; the gesture saves one undo step when it starts, so Undo goes back to the size you began with. */
function SizeBar({ id, size }: { id: string; size: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef(0)
  const live = useRef(size)
  live.current = size
  const clampSize = (v: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, v))
  const apply = (v: number, silent = true) => useStore.getState().setOverride(id, { size: clampSize(Math.round(v * 10) / 10) }, { silent })
  const begin = () => useStore.getState().record('size:' + id)
  const stop = () => { clearInterval(timer.current); clearTimeout(timer.current) }
  useEffect(() => stop, [])

  // +/- : tap = 1 px, hold = runs, faster the longer it is held
  const press = (dir: 1 | -1) => (e: React.PointerEvent) => {
    e.preventDefault()
    stop(); begin()
    apply(Math.round(live.current) + dir)
    let n = 0
    timer.current = window.setTimeout(() => {
      timer.current = window.setInterval(() => { n++; apply(live.current + dir * (n > 40 ? 8 : n > 20 ? 4 : n > 8 ? 2 : 1)) }, 32)
    }, 300)
  }

  // scrub the number
  const scrub = useRef<{ x0: number; v0: number; moved: boolean } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if (document.activeElement === e.target) return // already typing: let the caret work
    scrub.current = { x0: e.clientX, v0: live.current, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = scrub.current
    if (!d) return
    const dx = e.clientX - d.x0
    if (!d.moved) { if (Math.abs(dx) < 6) return; d.moved = true; begin() }
    apply(Math.round(d.v0 + dx / 3))
  }
  const onUp = (e: React.PointerEvent) => {
    const d = scrub.current
    scrub.current = null
    if (d && !d.moved) (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus() // a tap types
  }
  const commit = () => {
    if (draft !== null) { const v = parseFloat(draft.replace(',', '.')); if (Number.isFinite(v)) { begin(); apply(v) } }
    setDraft(null)
  }
  return (
    <div className="gx-sizebar" role="group" aria-label="Font size in pixels">
      <button type="button" className="gx-step" aria-label="Smaller by 1 pixel" onPointerDown={press(-1)} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()}><Icon name="minus" size={20} /></button>
      <div className="gx-size-val" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { scrub.current = null }} title="Drag sideways to change the size, or tap to type it">
        <span className="gx-size-num">
          <input inputMode="decimal" aria-label="Font size" value={draft ?? fmt(size)} onFocus={(e) => { setDraft(fmt(size)); e.currentTarget.select() }} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          <span>px</span>
        </span>
        <em aria-hidden>◂ drag ▸</em>
      </div>
      <button type="button" className="gx-step" aria-label="Larger by 1 pixel" onPointerDown={press(1)} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()}><Icon name="plus" size={20} /></button>
      <input className="gx-size-slider" type="range" aria-label="Font size slider" min={SIZE_MIN} max={SLIDER_MAX} step={1} value={Math.min(SLIDER_MAX, Math.max(SIZE_MIN, Math.round(size)))}
        onPointerDown={begin} onChange={(e) => apply(Number(e.target.value))} />
    </div>
  )
}

export function SelectionTray() {
  const ids = useStore((s) => s.selectedIds)
  const open = useUi((s) => s.openSheet)
  const [more, setMore] = useState(false)
  const [sizing, setSizing] = useState(false)
  const key = ids.join(',')
  useEffect(() => { setMore(false); setSizing(false) }, [key]) // a new selection starts with the short tray
  if (ids.length === 0) return null
  const st = useStore.getState
  const single = ids.length === 1 ? st().scene().elements.find((e) => e.id === ids[0]) ?? null : null
  const extra = !!single && single.id.startsWith('x-')
  const title = single ? single.name : `${ids.length} layers`
  const els = st().scene().elements.filter((e) => ids.includes(e.id))
  const allLocked = els.length > 0 && els.every((e) => e.locked)

  const acts: Act[] = []
  if (single?.kind === 'photos') acts.push({ icon: 'image', label: 'Photos', run: () => open('gx-photos') })
  else if (single?.kind === 'text') acts.push({ icon: 'edit', label: 'Edit text', run: () => open('gx-story') })
  acts.push({ icon: 'sliders', label: 'Style', run: () => open('gx-inspector') })
  if (single?.kind === 'text') acts.push({ icon: 'type', label: 'Size', on: sizing, run: () => { setSizing(!sizing); setMore(false) } })
  if (extra || ids.length > 1) acts.push({ icon: 'trash', label: 'Delete', danger: true, run: () => st().deleteSelected() })
  else acts.push({ icon: 'eyeOff', label: 'Hide', run: () => { st().setVisible(ids, false); st().select(null) } })
  acts.push({ icon: more ? 'chevDown' : 'more', label: more ? 'Less' : 'More', run: () => { setMore(!more); setSizing(false) }, on: more })

  const text = single?.kind === 'text' ? single : null
  const opacity = single ? single.opacity : 1
  const nextOpacity = OPACITY_STEPS[(OPACITY_STEPS.findIndex((o) => Math.abs(o - opacity) < 0.05) + 1) % OPACITY_STEPS.length]
  const setAll = (patch: { locked?: boolean; opacity?: number }) => { els.forEach((e) => st().setOverride(e.id, patch)) }

  const extras: Act[] = [
    { icon: 'copy', label: 'Duplicate', run: () => st().duplicateSelected() },
    { icon: allLocked ? 'lock' : 'unlock', label: allLocked ? 'Unlock' : 'Lock', on: allLocked, run: () => setAll({ locked: !allLocked }) },
  ]
  if (single) {
    extras.push(
      { icon: 'front', label: 'To front', run: () => st().moveLayer(single.id, 'front') },
      { icon: 'forward', label: 'Forward', run: () => st().moveLayer(single.id, 'up') },
      { icon: 'backward', label: 'Backward', run: () => st().moveLayer(single.id, 'down') },
      { icon: 'back', label: 'To back', run: () => st().moveLayer(single.id, 'back') },
    )
  }
  extras.push(
    { icon: 'alignHCenter', label: 'Centre', run: () => st().alignSelected('hcenter') },
    { icon: 'alignVCenter', label: 'Middle', run: () => st().alignSelected('vcenter') },
    { icon: 'droplet', label: `${Math.round(opacity * 100)}%`, run: () => setAll({ opacity: nextOpacity }) },
  )
  if (text) {
    extras.push(
      { icon: ALIGN_ICON[text.align], label: 'Align', run: () => st().setAlignText(text.id, NEXT_ALIGN[text.align]) },
      { icon: 'bold', label: 'Bold', on: text.weight === 800, run: () => st().setOverride(text.id, { weight: text.weight === 800 ? 700 : 800 }) },
    )
  }
  if (single && !extra) extras.push({ icon: 'reset', label: 'Reset', run: () => st().resetOverride(single.id) })

  // keep the selected layer in view: when it sits in the lower half of the banner the tray goes to the top
  const H = FORMATS[st().format]?.h || 1350
  const sel = single as unknown as { y?: number; h?: number } | null
  const low = !!sel && typeof sel.y === 'number' && typeof sel.h === 'number' && sel.y + sel.h / 2 > H * 0.5
  return (
    <div className={'gx-tray' + (low ? ' is-top' : '')} role="toolbar" aria-label={`Edit ${title}`}>
      <div className="gx-tray-head">
        <b>{title}</b>
        <button type="button" className="gx-tray-done" onClick={() => st().select(null)}><Icon name="check" size={16} /><span>Done</span></button>
      </div>
      <div className="gx-tray-acts">
        {acts.map((a) => (
          <button key={a.label} type="button" className={'gx-act' + (a.danger ? ' is-danger' : '') + (a.on ? ' is-on' : '')} onClick={a.run}>
            <Icon name={a.icon} size={22} /><span>{a.label}</span>
          </button>
        ))}
      </div>
      {sizing && text && <SizeBar id={text.id} size={text.size} />}
      {more && (
        <div className="gx-tray-more" role="group" aria-label="More options">
          {extras.map((a) => (
            <button key={a.label} type="button" className={'gx-chip' + (a.on ? ' is-on' : '')} onClick={a.run}>
              <Icon name={a.icon} size={18} /><span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
