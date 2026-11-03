// What you can do with the selected layer, as large touch targets docked at the foot of the canvas area. It replaces the
// PC Stage's floating Quickbar, which on a phone floats over the banner, scrolls sideways and ends up under other panels.
// Style opens the Inspector sheet (the PC's full property panel); Edit opens the sheet that owns that layer's content.
import { FORMATS } from '../../pc/core/tokens'
import { useStore } from '../../pc/store'
import { useUi } from '../shell/core'
import { Icon } from '../shell/ui'
import type { IconName } from '../shell/ui'

interface Act { icon: IconName; label: string; run: () => void; danger?: boolean }

export function SelectionTray() {
  const ids = useStore((s) => s.selectedIds)
  const open = useUi((s) => s.openSheet)
  if (ids.length === 0) return null
  const st = useStore.getState
  const single = ids.length === 1 ? st().scene().elements.find((e) => e.id === ids[0]) ?? null : null
  const extra = !!single && single.id.startsWith('x-')
  const title = single ? single.name : `${ids.length} layers`
  const acts: Act[] = []
  if (single?.kind === 'photos') acts.push({ icon: 'image', label: 'Photos', run: () => open('gx-photos') })
  else if (single?.kind === 'text') acts.push({ icon: 'edit', label: 'Edit text', run: () => open('gx-story') })
  acts.push({ icon: 'sliders', label: 'Style', run: () => open('gx-inspector') })
  acts.push({ icon: 'copy', label: 'Duplicate', run: () => st().duplicateSelected() })
  if (extra || ids.length > 1) acts.push({ icon: 'trash', label: 'Delete', danger: true, run: () => st().deleteSelected() })
  else acts.push({ icon: 'eyeOff', label: 'Hide', run: () => { st().setVisible(ids, false); st().select(null) } })
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
          <button key={a.label} type="button" className={'gx-act' + (a.danger ? ' is-danger' : '')} onClick={a.run}>
            <Icon name={a.icon} size={22} /><span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
