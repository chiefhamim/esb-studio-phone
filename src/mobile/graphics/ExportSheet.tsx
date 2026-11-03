// Export on the phone: the PC Export dialog's settings (presets, banners, resolution, file type + quality, file-name
// pattern with tokens, ZIP, preflight, file list) as a full-screen dialog, run on the PC export engine (exportRun.ts).
// Every file is then saved to the phone (MediaStore via platform().saveFile) or handed to the share sheet; each
// row shows what the platform answered. A failed save offers Share instead.
import { useEffect, useMemo, useRef, useState } from 'react'
import { FORMAT_LIST } from '../../pc/core/tokens'
import { DEFAULT_SETTINGS, PRESETS, SCALE_CHOICES, copyToClipboard, dims, humanBytes, planJobs, preflight, tooBig } from '../../pc/export'
import type { ExportSettings, ExportType } from '../../pc/export'
import type { Assets } from '../../pc/core/render'
import { useStore } from '../../pc/store'
import { snack } from '../shell/core'
import { Banner, Button, Chip, FullDialog, Icon, Segmented } from '../shell/ui'
import { saveFiles, shareOut } from './saveShare'
import type { Result } from './saveShare'
import { activePreset, applyPreset, Cancelled, insertToken, renderAll, toggleIn, toggleScale, totalMegapixels } from './exportRun'
import type { Progress } from './exportRun'

const TOKENS = ['cat', 'category', 'date', 'format', 'ratio', 'w', 'h', 'scale', 'headline']
const TYPES: { value: ExportType; label: string; note: string }[] = [
  { value: 'png', label: 'PNG', note: 'Lossless · sharpest text' },
  { value: 'jpeg', label: 'JPG', note: 'Smaller · great for chat apps' },
  { value: 'webp', label: 'WebP', note: 'Smallest · modern browsers' },
]
type Then = 'save' | 'share'
const THEN_KEY = 'esb-phone/graphics/export-then'
const loadThen = (): Then => { try { return localStorage.getItem(THEN_KEY) === 'share' ? 'share' : 'save' } catch { return 'save' } }


export function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="gx-switch-row" onClick={() => onChange(!on)}>
      <span className="gx-switch-text"><span>{label}</span>{hint && <small>{hint}</small>}</span>
      <span className={'gx-switch' + (on ? ' is-on' : '')} aria-hidden><i /></span>
    </button>
  )
}

export function ExportSheet({ open, onClose, base, settings, setSettings }: { open: boolean; onClose: () => void; base: Assets; settings: ExportSettings; setSettings: (s: ExportSettings) => void }) {
  const doc = useStore((s) => s.doc)
  const format = useStore((s) => s.format)
  const [running, setRunning] = useState<Progress | null>(null)
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [custom, setCustom] = useState(2.5)
  const [then, setThenState] = useState<Then>(loadThen)
  const cancel = useRef({ cancelled: false })
  const patternRef = useRef<HTMLInputElement>(null)
  const s = settings
  const patch = (p: Partial<ExportSettings>) => setSettings({ ...s, ...p })
  const jobs = useMemo(() => planJobs(doc, s), [doc, s])
  const checks = useMemo(() => preflight(doc, s.formats), [doc, s.formats])
  const scaleChoices = [...new Set([...SCALE_CHOICES, ...s.scales])].sort((a, b) => a - b)
  const preset = activePreset(s)
  const setThen = (t: Then) => { setThenState(t); try { localStorage.setItem(THEN_KEY, t) } catch { /* ignore */ } }

  useEffect(() => { if (!open) { cancel.current.cancelled = true; setResults(null); setError(null) } }, [open])

  const go = async () => {
    setError(null); setResults(null)
    cancel.current = { cancelled: false }
    setRunning({ done: 0, total: jobs.length, label: 'Starting…' })
    try {
      const files = await renderAll(doc, base, s, setRunning, cancel.current)
      const list: Result[] = files.map((file) => ({ file, state: 'pending' }))
      setResults(list)
      setRunning(null)
      if (then === 'share') { await shareOut(files); return }
      const done = await saveFiles(files, (i, r) => setResults((cur) => cur?.map((x, j) => (j === i ? r : x)) ?? null))
      const ok = done.filter((r) => r.state === 'saved').length
      if (ok === done.length) snack(`Saved ${ok} file${ok === 1 ? '' : 's'} to the phone`, { tone: 'success' })
      else snack(`${done.length - ok} of ${done.length} could not be saved · Share them instead`, { tone: 'error', action: { label: 'Share', run: () => void shareOut(done.filter((r) => r.state === 'failed').map((r) => r.file)) } })
    } catch (e) {
      setError(e instanceof Cancelled ? 'Export cancelled' : e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(null)
    }
  }

  const saveOne = async (i: number) => {
    if (!results) return
    const [r] = await saveFiles([results[i].file], (_j, x) => setResults((cur) => cur?.map((y, k) => (k === i ? x : y)) ?? null))
    if (r.state === 'failed') snack('Could not save: ' + (r.error ?? 'unknown error'), { tone: 'error', action: r.canShare ? { label: 'Share', run: () => void shareOut([r.file]) } : undefined })
  }

  const copy = async () => {
    try { await copyToClipboard(doc, format, base); snack('Copied the banner to the clipboard', { tone: 'success' }) }
    catch (e) { snack('Could not copy the image on this phone: ' + (e instanceof Error ? e.message : String(e)), { tone: 'error' }) }
  }

  const close = () => { if (running) cancel.current.cancelled = true; onClose() }
  const pct = running && running.total ? Math.round((running.done / running.total) * 100) : 0
  const totalBytes = results?.reduce((a, r) => a + r.file.bytes.length, 0) ?? 0

  return (
    <FullDialog open={open} title="Export banners" onClose={close}
      footer={running ? (
        <>
          <div className="gx-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Export progress">
            <div className="gx-progress-bar"><i style={{ width: pct + '%' }} /></div>
            <small>{running.done}/{running.total} · {running.label}</small>
          </div>
          <Button kind="outlined" onClick={() => { cancel.current.cancelled = true }}>Cancel</Button>
        </>
      ) : (
        <>
          <Button kind="text" icon="copy" onClick={copy}>Copy</Button>
          <span className="m-spacer" />
          <Button icon={then === 'share' ? 'send' : 'download'} disabled={!jobs.length} onClick={go}>
            {`${then === 'share' ? 'Share' : 'Save'} ${s.zip ? 'ZIP' : `${jobs.length} file${jobs.length === 1 ? '' : 's'}`}`}
          </Button>
        </>
      )}>
      <div className="m-wrap gx-export">
        {(results || error) && (
          <section className="gx-ex-sec" aria-live="polite">
            {error && <Banner tone={error === 'Export cancelled' ? 'info' : 'error'}>{error}</Banner>}
            {results && (
              <>
                <h3 className="gx-ex-title">Files <small>{results.length} · {humanBytes(totalBytes)}</small></h3>
                <div className="gx-ex-results">
                  {results.map((r, i) => (
                    <div key={r.file.name} className="gx-ex-result">
                      <span className={'gx-ex-state is-' + r.state}><Icon name={r.state === 'saved' ? 'check' : r.state === 'failed' ? 'alert' : 'image'} size={18} /></span>
                      <span className="gx-ex-rtext">
                        <b>{r.file.name}</b>
                        <small>{r.state === 'saved' ? `Saved · ${r.path}` : r.state === 'failed' ? `Not saved · ${r.error ?? ''}` : r.state === 'saving' ? 'Saving…' : `${humanBytes(r.file.bytes.length)} · not saved yet`}</small>
                      </span>
                      {r.state !== 'saved' && r.state !== 'saving' && <Button kind="text" icon="download" label={`Save ${r.file.name}`} onClick={() => void saveOne(i)} />}
                      <Button kind="text" icon="send" label={`Share ${r.file.name}`} onClick={() => void shareOut([r.file])} />
                    </div>
                  ))}
                </div>
                <div className="gx-ex-row">
                  <Button kind="tonal" icon="download" onClick={async () => { const d = await saveFiles(results.map((r) => r.file), (i, r) => setResults((cur) => cur?.map((x, j) => (j === i ? r : x)) ?? null)); const ok = d.filter((x) => x.state === 'saved').length; snack(ok === d.length ? `Saved ${ok} file${ok === 1 ? '' : 's'} to the phone` : `${d.length - ok} could not be saved`, { tone: ok === d.length ? 'success' : 'error' }) }}>Save all</Button>
                  <Button kind="tonal" icon="send" onClick={() => void shareOut(results.map((r) => r.file))}>Share all</Button>
                </div>
              </>
            )}
          </section>
        )}

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">After export</h3>
          <Segmented label="After export" value={then} onChange={setThen} options={[{ value: 'save', label: 'Save to phone', icon: 'download' }, { value: 'share', label: 'Share', icon: 'send' }]} />
          <p className="gx-help">{then === 'save' ? 'Pictures go to Pictures/ESB Studio, a ZIP to Download/ESB Studio.' : 'Opens the Android share sheet (WhatsApp, Facebook, Drive…).'}</p>
        </section>

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">Presets</h3>
          <div className="gx-ex-presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={'gx-card' + (preset === p.id ? ' is-on' : '')} aria-pressed={preset === p.id} onClick={() => setSettings(applyPreset(s, p.id))}>
                <b>{p.label}</b><small>{p.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">Banners <small>{s.formats.length} of {FORMAT_LIST.length}</small></h3>
          <div className="gx-ex-formats">
            {FORMAT_LIST.map((f) => {
              const on = s.formats.includes(f.id)
              return (
                <button key={f.id} type="button" className={'gx-card gx-fcard' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => patch({ formats: toggleIn(s.formats, f.id) })}>
                  <span className={'gx-ratio'} style={{ aspectRatio: `${f.w} / ${f.h}` }} aria-hidden />
                  <span className="gx-fcard-text"><b>{f.name}</b><small><b className="gx-pill">{f.ratio}</b><span className="gx-dims">{f.w}×{f.h}</span></small></span>
                  {on && <Icon name="check" size={18} />}
                </button>
              )
            })}
          </div>
        </section>

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">Resolution <small>same layout, more pixels</small></h3>
          <div className="m-chips">
            {scaleChoices.map((v) => {
              const big = s.formats.some((f) => tooBig(f, v))
              return <Chip key={v} on={s.scales.includes(v)} onClick={() => { if (big) snack(`${v}× is too large for the phone's image engine`); else patch({ scales: toggleScale(s.scales, v) }) }}>{`${v}×${v === 1 ? ' native' : ''}`}</Chip>
            })}
          </div>
          <div className="gx-ex-row">
            <span className="gx-help">Custom</span>
            <Button kind="outlined" icon="minus" label="Smaller custom scale" onClick={() => setCustom((c) => Math.max(0.25, +(c - 0.25).toFixed(2)))} />
            <output className="gx-num">{custom}×</output>
            <Button kind="outlined" icon="plus" label="Larger custom scale" onClick={() => setCustom((c) => Math.min(6, +(c + 0.25).toFixed(2)))} />
            <Button kind="tonal" disabled={s.scales.includes(custom) || s.formats.some((f) => tooBig(f, custom))} onClick={() => patch({ scales: toggleScale(s.scales, custom) })}>Add</Button>
          </div>
          {s.formats[0] && s.scales.length > 0 && <p className="gx-help">{s.scales.map((v) => { const d = dims(s.formats[0], v); return `${v}× = ${d.w}×${d.h}` }).join(' · ')} ({FORMAT_LIST.find((f) => f.id === s.formats[0])?.short})</p>}
        </section>

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">File type</h3>
          <Segmented label="File type" value={s.type} onChange={(t) => patch({ type: t })} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          <p className="gx-help">{TYPES.find((t) => t.value === s.type)?.note}</p>
          {s.type !== 'png' && (
            <label className="gx-range">
              <span>Quality <b>{Math.round(s.quality * 100)}%</b></span>
              <input type="range" min={0.5} max={1} step={0.01} value={s.quality} onChange={(e) => patch({ quality: +e.target.value })} />
            </label>
          )}
        </section>

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">File names</h3>
          <input ref={patternRef} className="m-input gx-mono" value={s.pattern} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="File name pattern" onChange={(e) => patch({ pattern: e.target.value })} />
          <div className="m-chips">
            {TOKENS.map((t) => <Chip key={t} onClick={() => { const el = patternRef.current; patch({ pattern: insertToken(s.pattern, t, el?.selectionStart ?? s.pattern.length, el?.selectionEnd ?? s.pattern.length) }) }}>{`{${t}}`}</Chip>)}
            <Chip icon="reset" onClick={() => patch({ pattern: DEFAULT_SETTINGS.pattern })}>Reset</Chip>
          </div>
          <Switch on={s.zip} onChange={(v) => patch({ zip: v })} label="Bundle everything into one ZIP" hint="Easy to share or attach" />
          <p className="gx-help">Also save an editable project: use More › Save project (projects stay on this phone).</p>
        </section>

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">Preflight</h3>
          <div className="gx-stack">
            {checks.map((c, i) => <Banner key={i} tone={c.level === 'warn' ? 'warn' : 'info'}>{c.text}</Banner>)}
            {!checks.length && <Banner tone="success">Preflight passed: nothing to fix.</Banner>}
          </div>
        </section>

        <section className="gx-ex-sec">
          <h3 className="gx-ex-title">Will export <small>{jobs.length} file{jobs.length === 1 ? '' : 's'}{s.zip ? ' in 1 ZIP' : ''} · {totalMegapixels(jobs).toFixed(1)} MP</small></h3>
          <div className="gx-ex-files">
            {jobs.map((j) => (
              <div key={j.name} className="gx-ex-file"><Icon name="image" size={18} /><span><b>{j.name}</b><small>{j.w} × {j.h} px · {j.scale}×</small></span></div>
            ))}
            {!jobs.length && <Banner tone="warn">Pick at least one banner and one resolution.</Banner>}
          </div>
        </section>
      </div>
    </FullDialog>
  )
}
