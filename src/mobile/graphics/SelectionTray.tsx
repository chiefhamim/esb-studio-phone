// What you can do with the selected layer, as large touch targets docked at the foot of the canvas area. It replaces the
// PC Stage's floating Quickbar, which on a phone floats over the banner, scrolls sideways and ends up under other panels.
// Style opens the Inspector sheet (the PC's full property panel); Edit opens the sheet that owns that layer's content.
// "More" opens a second row with the things people reach for most while laying out a banner: lock, stacking order, centring,
// opacity and (for text) size, alignment and weight.
import { useEffect, useState } from 'react'
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

export function SelectionTray() {
  const ids = useStore((s) => s.selectedIds)
  const open = useUi((s) => s.openSheet)
  const [more, setMore] = useState(false)
  const key = ids.join(',')
  useEffect(() => { setMore(false) }, [key]) // a new selection starts with the short tray
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
  acts.push({ icon: 'copy', label: 'Duplicate', run: () => st().duplicateSelected() })
  if (extra || ids.length > 1) acts.push({ icon: 'trash', label: 'Delete', danger: true, run: () => st().deleteSelected() })
  else acts.push({ icon: 'eyeOff', label: 'Hide', run: () => { st().setVisible(ids, false); st().select(null) } })
  acts.push({ icon: more ? 'chevDown' : 'more', label: more ? 'Less' : 'More', run: () => setMore(!more), on: more })

  const text = single?.kind === 'text' ? single : null
  const opacity = single ? single.opacity : 1
  const nextOpacity = OPACITY_STEPS[(OPACITY_STEPS.findIndex((o) => Math.abs(o - opacity) < 0.05) + 1) % OPACITY_STEPS.length]
  const setAll = (patch: { locked?: boolean; opacity?: number }) => { els.forEach((e) => st().setOverride(e.id, patch)) }

  const extras: Act[] = [
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
      { icon: 'minus', label: 'Smaller', run: () => st().setOverride(text.id, { size: Math.max(8, Math.round(text.size * 0.9)) }) },
      { icon: 'plus', label: 'Larger', run: () => st().setOverride(text.id, { size: Math.round(text.size * 1.1) }) },
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
