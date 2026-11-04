// The banner's Elements and Layers, built for the phone in the app's own anatomy (section label, white card, rows with
// an icon tile, a title and a grey line under it, the app's switch). Same data and actions as the desktop panels
// (src/pc/components/Panels.tsx: ElementsList, LayersList, the Date panel), so a change here is the same change there.
import { useMemo, useState } from 'react'
import { useStore } from '../../pc/store'
import { ELEMENT_DEFS, ELEMENT_SECTIONS } from '../../pc/core/elements'
import { KIND_ICON } from '../../pc/ui/Icon'
import { Icon, IconBtn } from '../shell/ui'

function useSceneEls() {
  const doc = useStore((s) => s.doc)
  const format = useStore((s) => s.format)
  const scene = useStore((s) => s.scene)
  return useMemo(() => scene().elements, [scene, doc, format]) // eslint-disable-line react-hooks/exhaustive-deps
}

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'m-switch' + (on ? ' is-on' : '')}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}><span /></button>
  )
}

// ---------------------------------------------------------------- Elements: every part of the banner as an on/off switch
export function ElementsBody() {
  const els = useSceneEls()
  const selectedIds = useStore((s) => s.selectedIds)
  const st = useStore.getState
  const custom = useMemo(() => els.filter((e) => e.id.startsWith('x-')), [els])
  const rows = useMemo(() => ELEMENT_DEFS.map((d) => {
    const items = els.filter((e) => d.match(e.id) && !e.id.startsWith('x-'))
    return { d, ids: items.map((e) => e.id), on: items.some((e) => e.visible), present: items.length > 0 }
  }), [els])
  const hidden = els.filter((e) => !e.visible && !e.id.startsWith('x-'))

  return (
    <div className="bx">
      {hidden.length > 0 && (
        <button type="button" className="bx-notice" onClick={() => st().setVisible(hidden.map((e) => e.id), true)}>
          <span className="bx-tile"><Icon name="eyeOff" size={18} /></span>
          <span className="bx-name"><b>{hidden.length} {hidden.length === 1 ? 'part is' : 'parts are'} hidden</b><small>Tap to show everything again</small></span>
          <span className="bx-go">Show all</span>
        </button>
      )}
      {ELEMENT_SECTIONS.map((sec) => {
        const mine = rows.filter((r) => r.d.section === sec)
        const live = mine.filter((r) => r.present)
        const onCount = live.filter((r) => r.on).length
        const allIds = live.flatMap((r) => r.ids)
        return (
          <section key={sec} className="bx-sec" aria-label={sec}>
            <header className="bx-head">
              <h3>{sec}</h3>
              <span className="bx-count">{onCount} of {live.length} shown</span>
              {live.length > 0 && <button type="button" className="bx-link" onClick={() => st().setVisible(allIds, onCount === 0)}>{onCount > 0 ? 'Hide all' : 'Show all'}</button>}
            </header>
            <div className="bx-card">
              {mine.map((r) => {
                const picked = r.ids.some((id) => selectedIds.includes(id))
                return (
                  <div key={r.d.key} role="button" tabIndex={r.present ? 0 : -1} className={'bx-row' + (picked ? ' is-sel' : '') + (r.present && !r.on ? ' is-off' : '') + (!r.present ? ' is-absent' : '')}
                    onClick={() => { if (r.present) st().select(r.ids.find((id) => els.find((e) => e.id === id)?.visible) ?? r.ids[0]) }}>
                    <span className="bx-tile"><Icon name={r.d.icon} size={18} /></span>
                    <span className="bx-name"><b>{r.d.label}</b>{!r.present && <small>{r.d.hint ?? 'Not on this format'}</small>}</span>
                    <Switch on={r.on} disabled={!r.present} label={r.on ? `Hide ${r.d.label}` : `Show ${r.d.label}`} onChange={(v) => st().setVisible(r.ids, v)} />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      {custom.length > 0 && (
        <section className="bx-sec" aria-label="Your layers">
          <header className="bx-head">
            <h3>Your layers</h3>
            <span className="bx-count">{custom.filter((e) => e.visible).length} of {custom.length} shown</span>
          </header>
          <div className="bx-card">
            {custom.map((e) => (
              <div key={e.id} role="button" tabIndex={0} className={'bx-row' + (selectedIds.includes(e.id) ? ' is-sel' : '') + (!e.visible ? ' is-off' : '')} onClick={() => st().select(e.id)}>
                <span className="bx-tile"><Icon name={KIND_ICON[e.kind]} size={18} /></span>
                <span className="bx-name"><b>{e.name}</b></span>
                <Switch on={e.visible} label={e.visible ? `Hide ${e.name}` : `Show ${e.name}`} onChange={(v) => st().setVisible([e.id], v)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Layers: the stack, top first
export function LayersBody() {
  const doc = useStore((s) => s.doc)
  const format = useStore((s) => s.format)
  const selectedIds = useStore((s) => s.selectedIds)
  const els = useSceneEls()
  const st = useStore.getState
  const [q, setQ] = useState('')
  const list = useMemo(() => [...els].reverse().filter((e) => !q || (e.name + ' ' + e.group).toLowerCase().includes(q.toLowerCase())), [els, q])

  return (
    <div className="bx">
      <label className="bx-search">
        <Icon name="search" size={18} />
        <input type="search" value={q} placeholder="Filter layers" aria-label="Filter layers" onChange={(e) => setQ(e.target.value)} />
        {q && <IconBtn icon="x" label="Clear the filter" onClick={() => setQ('')} />}
      </label>
      <section className="bx-sec">
        <header className="bx-head"><h3>Top to bottom</h3><span className="bx-count">{els.length} layers</span></header>
        <div className="bx-card">
          {list.map((e) => {
            const changed = !!doc.overrides[`${format}:${e.id}`]
            const mine = e.id.startsWith('x-')
            return (
              <div key={e.id} role="button" tabIndex={0} className={'bx-row is-layer' + (selectedIds.includes(e.id) ? ' is-sel' : '') + (!e.visible ? ' is-off' : '')} onClick={() => st().select(e.id)}>
                <span className="bx-tile"><Icon name={KIND_ICON[e.kind]} size={18} /></span>
                <span className="bx-name"><b>{e.name}</b>{(changed || mine) && <small>{[mine && 'Your layer', changed && 'Changed from the template'].filter(Boolean).join(' · ')}</small>}</span>
                {changed && <IconBtn icon="reset" label={`Reset ${e.name}`} onClick={(ev) => { ev.stopPropagation(); st().resetOverride(e.id) }} />}
                <IconBtn icon={e.locked ? 'lock' : 'unlock'} label={e.locked ? `Unlock ${e.name}` : `Lock ${e.name}`} active={e.locked} onClick={(ev) => { ev.stopPropagation(); st().setOverride(e.id, { locked: !e.locked }) }} />
                <IconBtn icon={e.visible ? 'eye' : 'eyeOff'} label={e.visible ? `Hide ${e.name}` : `Show ${e.name}`} onClick={(ev) => { ev.stopPropagation(); st().setOverride(e.id, { visible: !e.visible }) }} />
              </div>
            )
          })}
          {list.length === 0 && <p className="bx-empty">No layers match “{q}”.</p>}
        </div>
      </section>
    </div>
  )
}
