// Banner desk: live preview with pinch/pan, templates, sizes, touch photo positioning, tone, headline + key phrase, export.
// Nothing here posts anywhere: Share opens the phone's share sheet and Save writes a file, both on the editor's tap.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import '../ui/banner.css'
import { renderBanner, photoSize } from './renderBanner'
import { choosePhoto, deletePhoto, loadPhoto } from './photos'
import { fileStem, saveToGallery, shareBanner } from './output'
import { CATEGORIES } from './tokens'
import { categoryIdOf } from './categories'
import { loadSettings, saveSettings } from './settings'
import type { BannerSettings } from './settings'
import { SIZES, TEMPLATES, getSize, templatesFor } from './sizes'
import type { TemplateId } from './sizes'
import { panTransform, zoomTransform, NEUTRAL_TRANSFORM, clampTransform, isNeutralTransform } from './photoMath'
import { isNeutralAdjust } from './photoEdit'
import { tapWord, rangeOfPhrase, wordsOf } from './highlight'
import { photoRectFor } from './template'
import { Icon } from '../edit/icons'
import type { IconName } from '../edit/icons'

interface Props {
  draft: Draft | null
  onChange: (d: Draft) => void
}

type Status = { kind: 'ok' | 'error' | 'busy'; text: string; fallback?: boolean } | null
type Tab = 'text' | 'template' | 'size' | 'photo' | 'export'
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'template', label: 'Template', icon: 'layout' },
  { id: 'size', label: 'Size', icon: 'size' },
  { id: 'photo', label: 'Photo', icon: 'image' },
  { id: 'export', label: 'Export', icon: 'download' },
]
const PREVIEW_W = 720

export default function Banner({ draft, onChange }: Props) {
  if (!draft) return (<><h1>Banner</h1><p>Open a story first.</p></>)
  return <BannerFor key={draft.id} draft={draft} onChange={onChange} />
}

function BannerFor({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const draftId = draft.id
  const headline = draft.headline
  const catId = categoryIdOf(draft.category)
  const [cfg, setCfg] = useState<BannerSettings>(() => loadSettings(draftId))
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [photoErr, setPhotoErr] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [tab, setTab] = useState<Tab>('text')
  const [mode, setMode] = useState<'photo' | 'view'>('photo')
  const [view, setView] = useState({ z: 1, x: 0, y: 0 })
  const [anchor, setAnchor] = useState<number | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const busy = status?.kind === 'busy'
  const size = getSize(cfg.size)
  const urlRef = useRef<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)

  const patch = useCallback((p: Partial<BannerSettings>) => setCfg((c) => ({ ...c, ...p })), [])
  useEffect(() => { if (loaded.current) saveSettings(draftId, cfg); loaded.current = true }, [draftId, cfg])

  // photo for this draft, from IndexedDB
  useEffect(() => {
    let live = true
    loadPhoto(draftId).then((b) => { if (live) setPhoto(b) }).catch(() => { if (live) setPhotoErr('Could not read the saved photo for this story.') })
    return () => { live = false }
  }, [draftId])
  useEffect(() => {
    let live = true
    if (!photo) { void Promise.resolve().then(() => { if (live) setDims(null) }); return () => { live = false } }
    photoSize(photo).then((d) => { if (live) setDims(d) }).catch(() => { if (live) setDims(null) })
    return () => { live = false }
  }, [photo])

  // one render at a time; while dragging only the newest request runs
  const runner = useRef<{ busy: boolean; next: null | (() => Promise<void>) }>({ busy: false, next: null })
  const enqueue = useCallback((fn: () => Promise<void>) => {
    const r = runner.current
    r.next = fn
    if (r.busy) return
    r.busy = true
    void (async () => {
      while (r.next) { const f = r.next; r.next = null; try { await f() } catch { /* each job reports its own error */ } }
      r.busy = false
    })()
  }, [])

  const story = useMemo(() => ({ headline, category: catId, highlight: cfg.highlight, hiStyle: cfg.hiStyle }), [headline, catId, cfg.highlight, cfg.hiStyle])

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      enqueue(async () => {
        try {
          const blob = await renderBanner(story, photo, { width: PREVIEW_W, size: cfg.size, template: cfg.template, transform: cfg.transform, adjust: cfg.adjust })
          if (!live) return
          const url = URL.createObjectURL(blob)
          const old = urlRef.current
          urlRef.current = url
          setPreviewUrl(url)
          setPreviewErr('')
          if (old) setTimeout(() => URL.revokeObjectURL(old), 1000)
        } catch (e) { if (live) setPreviewErr(e instanceof Error ? e.message : 'The preview could not be drawn.') }
      })
    }, 40)
    return () => { live = false; clearTimeout(t) }
  }, [story, photo, cfg.size, cfg.template, cfg.transform, cfg.adjust, enqueue])
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  // template thumbnails, only while that tab is open
  useEffect(() => {
    if (tab !== 'template') return
    let live = true
    const made: string[] = []
    const t = setTimeout(async () => {
      for (const tpl of templatesFor(size)) {
        try {
          const blob = await renderBanner(story, photo, { width: 200, size: cfg.size, template: tpl.id, transform: cfg.transform, adjust: cfg.adjust })
          if (!live) return
          const url = URL.createObjectURL(blob)
          made.push(url)
          setThumbs((m) => ({ ...m, [`${cfg.size}:${tpl.id}`]: url }))
        } catch { /* a thumbnail that cannot be drawn stays blank; the preview shows the real error */ }
      }
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [tab, story, photo, cfg.size, cfg.transform, cfg.adjust, size])

  const pick = async (from: 'gallery' | 'camera') => {
    setPhotoErr('')
    setStatus({ kind: 'busy', text: 'Preparing the photo...' })
    try {
      const b = await choosePhoto(draftId, from)
      if (b) { setPhoto(b); patch({ transform: NEUTRAL_TRANSFORM }) }
      setStatus(null)
    } catch (e) {
      setStatus(null)
      setPhotoErr(e instanceof Error ? e.message : 'The photo could not be added.')
    }
  }
  const removePhoto = async () => {
    try { await deletePhoto(draftId); setPhoto(null); patch({ transform: NEUTRAL_TRANSFORM }); setPhotoErr('') } catch { setPhotoErr('Could not remove the photo.') }
  }

  // ---- touch: one finger drags, two fingers pinch ----
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])
  const lastTap = useRef(0)
  const unit = () => { const r = stageRef.current?.getBoundingClientRect(); return r && r.width > 0 ? { r, k: size.w / r.width } : null }

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 1) {
      const now = Date.now()
      if (now - lastTap.current < 300) { setView({ z: 1, x: 0, y: 0 }); lastTap.current = 0 } else lastTap.current = now
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId)
    if (!prev) return
    const others = [...pts.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p)
    const cur = { x: e.clientX, y: e.clientY }
    pts.current.set(e.pointerId, cur)
    const u = unit()
    if (!u) return
    let dx = cur.x - prev.x, dy = cur.y - prev.y
    let factor = 1
    let cx = cur.x, cy = cur.y
    if (others.length) {
      const o = others[0]
      const d0 = Math.hypot(prev.x - o.x, prev.y - o.y)
      const d1 = Math.hypot(cur.x - o.x, cur.y - o.y)
      if (d0 > 8) factor = d1 / d0
      cx = (cur.x + o.x) / 2; cy = (cur.y + o.y) / 2
      dx /= 2; dy /= 2 // both fingers report the move: the centre moves by half of each
    }
    if (mode === 'view') {
      setView((v) => {
        const z = Math.min(4, Math.max(1, v.z * factor))
        const lim = ((z - 1) * u.r.width) / 2 + 40
        const limY = ((z - 1) * u.r.height) / 2 + 40
        return { z, x: Math.min(lim, Math.max(-lim, v.x + dx)), y: Math.min(limY, Math.max(-limY, v.y + dy)) }
      })
      return
    }
    if (!photo || !dims) return
    const pr = photoRectFor(cfgRef.current.size, cfgRef.current.template)
    const bx = ((cx - u.r.left) / u.r.width) * size.w
    const by = ((cy - u.r.top) / u.r.height) * size.h
    const fx = Math.min(1, Math.max(0, (bx - pr.x) / pr.w)), fy = Math.min(1, Math.max(0, (by - pr.y) / pr.h))
    setCfg((c) => {
      let t = c.transform
      if (factor !== 1) t = zoomTransform(dims.w, dims.h, pr.w, pr.h, t, factor, fx, fy)
      t = panTransform(dims.w, dims.h, pr.w, pr.h, t, dx * u.k, dy * u.k)
      return { ...c, transform: t }
    })
  }
  const onUp = (e: React.PointerEvent) => { pts.current.delete(e.pointerId) }

  const ready = !!headline.trim() && !!catId
  const why = !headline.trim() ? 'Write a headline in the Text tab.' : !catId ? 'Pick a category in the Text tab.' : ''
  const make = () => renderBanner(story, photo, { width: size.w * cfg.scale, size: cfg.size, template: cfg.template, transform: cfg.transform, adjust: cfg.adjust })

  const share = async () => {
    setStatus({ kind: 'busy', text: 'Making the banner...' })
    try {
      const r = await shareBanner(await make(), fileStem(headline))
      setStatus(r === 'shared' ? { kind: 'ok', text: 'The share sheet closed after sharing. The app cannot see where it went.' } : null)
    } catch (e) { setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Sharing failed.' }) }
  }
  const save = async () => {
    setStatus({ kind: 'busy', text: 'Making the banner...' })
    try {
      const path = await saveToGallery(await make(), fileStem(headline))
      setStatus({ kind: 'ok', text: `Saved to ${path}. The file exists; the Gallery app may take a moment to list it.` })
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Saving failed.', fallback: true })
    }
  }

  const words = wordsOf(headline)
  const range = rangeOfPhrase(words, cfg.highlight)
  const T = clampTransform(cfg.transform)
  const exp = size.w * cfg.scale
  const stageStyle = { aspectRatio: `${size.w} / ${size.h}` }

  return (
    <div className="bn">
      <h1 className="sr-only">Banner</h1>
      <div className="bn-layout">
        <div className="bn-col-view">
          <div className="bn-viewport" style={{ ...stageStyle, ['--ar' as string]: size.w / size.h }}>
            <div
              ref={stageRef} className={`bn-stage bn-mode-${mode}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, ...stageStyle }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              role="img" aria-label={`Banner preview: ${headline || 'no headline yet'}`}
            >
              {previewUrl ? <img src={previewUrl} alt="" draggable={false} /> : <div className="bn-blank" role="status">Drawing the preview...</div>}
            </div>
          </div>
          {previewErr && <p className="bn-error" role="alert">{previewErr}</p>}
          <div className="bn-modebar">
            <div className="bn-seg" role="radiogroup" aria-label="What a drag does">
              <button type="button" role="radio" aria-checked={mode === 'photo'} className={mode === 'photo' ? 'on' : ''} onClick={() => setMode('photo')}><Icon name="move" size={16} /><span>Move photo</span></button>
              <button type="button" role="radio" aria-checked={mode === 'view'} className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}><Icon name="zoom" size={16} /><span>Zoom view</span></button>
            </div>
            <button type="button" className="bn-ghost" onClick={() => { setView({ z: 1, x: 0, y: 0 }); patch({ transform: NEUTRAL_TRANSFORM }) }} disabled={isNeutralTransform(T) && view.z === 1 && !view.x && !view.y}>Reset</button>
          </div>
          <p className="bn-hint">{mode === 'photo' ? (photo ? 'Drag to move the photo, pinch to zoom it inside its frame.' : 'Add a photo in the Photo tab, then drag and pinch it here.') : 'Pinch and drag to look closer. Double-tap to reset the view. The banner itself is not changed.'}</p>
        </div>

        <div className="bn-col-tools">
          <div className="bn-tabs" role="tablist" aria-label="Banner tools">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`bn-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="bn-panel" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><Icon name={t.icon} size={18} /><span>{t.label}</span></button>
            ))}
          </div>
          <div id="bn-panel" role="tabpanel" aria-labelledby={`bn-tab-${tab}`} className="bn-panel">
            {tab === 'text' && (
              <>
                <label htmlFor="bn-head" className="bn-label">Headline <span className="bn-count">{headline.trim().length} characters</span></label>
                <textarea id="bn-head" className="bn-input" rows={3} value={headline} onChange={(e) => onChange({ ...draft, headline: e.target.value })} lang={/[ঀ-৿]/.test(headline) ? 'bn' : 'en'} />
                <span className="bn-label" id="bn-hi-l">Key phrase: tap the first word, then the last</span>
                <div className="bn-words" role="group" aria-labelledby="bn-hi-l">
                  {words.length === 0 && <span className="bn-hint">Write a headline first.</span>}
                  {words.map((w, i) => {
                    const inRange = range && i >= range[0] && i <= range[1]
                    return (
                      <button key={`${i}-${w}`} type="button" aria-pressed={!!inRange || anchor === i} className={`bn-word${inRange || anchor === i ? ' on' : ''}`}
                        onClick={() => { const r = tapWord(words, cfg.highlight, anchor, i); setAnchor(r.anchor); patch({ highlight: r.phrase }) }}>{w}</button>
                    )
                  })}
                </div>
                <div className="bn-seg" role="radiogroup" aria-label="Key phrase style">
                  {(['colour', 'marker', 'underline'] as const).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={cfg.hiStyle === s} className={cfg.hiStyle === s ? 'on' : ''} onClick={() => patch({ hiStyle: s })}>{s === 'colour' ? 'Colour' : s === 'marker' ? 'Marker' : 'Underline'}</button>
                  ))}
                </div>
                <span className="bn-label" id="bn-cat-l">Category</span>
                <div className="bn-cats" role="radiogroup" aria-labelledby="bn-cat-l">
                  {CATEGORIES.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={catId === c.id} className={`bn-cat${catId === c.id ? ' on' : ''}`}
                      style={{ ['--cat' as string]: c.accent, ['--cat-ink' as string]: c.chipText }} onClick={() => onChange({ ...draft, category: c.name })}>{c.name}</button>
                  ))}
                </div>
                <p className="bn-hint">The headline and category are the story's own: changes here are saved to the story.</p>
              </>
            )}

            {tab === 'template' && (
              <>
                <div className="bn-tpls" role="radiogroup" aria-label="Template">
                  {templatesFor(size).map((t) => (
                    <button key={t.id} type="button" role="radio" aria-checked={cfg.template === t.id} className={`bn-tpl${cfg.template === t.id ? ' on' : ''}`} onClick={() => patch({ template: t.id as TemplateId })}>
                      <span className="bn-thumb" style={{ aspectRatio: `${size.w} / ${size.h}` }}>{thumbs[`${cfg.size}:${t.id}`] ? <img src={thumbs[`${cfg.size}:${t.id}`]} alt="" /> : <i>...</i>}</span>
                      <b>{t.name}</b><small>{t.note}</small>
                    </button>
                  ))}
                </div>
                {TEMPLATES.length > templatesFor(size).length && <p className="bn-hint">News link is not offered at {size.ratio}: Planned.</p>}
                <p className="bn-hint">More desktop layouts (quote card, stat card, lower third) are Planned.</p>
              </>
            )}

            {tab === 'size' && (
              <div className="bn-sizes" role="radiogroup" aria-label="Banner size">
                {SIZES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={cfg.size === s.id} className={`bn-size${cfg.size === s.id ? ' on' : ''}`}
                    onClick={() => { const ok = templatesFor(s).some((t) => t.id === cfg.template); patch({ size: s.id, template: ok ? cfg.template : 'classic', transform: NEUTRAL_TRANSFORM }) }}>
                    <span className="bn-ratio" style={{ aspectRatio: `${s.w} / ${s.h}` }} aria-hidden="true" />
                    <b>{s.name} {s.ratio}</b><small>{s.w} x {s.h}{s.adapted ? ', adapted' : ''}</small>
                  </button>
                ))}
              </div>
            )}

            {tab === 'photo' && (
              <>
                <div className="bn-row">
                  <button type="button" className="secondary" disabled={busy} onClick={() => { void pick('gallery') }}><Icon name="image" size={16} /><span>From gallery</span></button>
                  <button type="button" className="secondary" disabled={busy} onClick={() => { void pick('camera') }}><Icon name="camera" size={16} /><span>Take photo</span></button>
                </div>
                {photo && <button type="button" className="secondary" disabled={busy} onClick={() => { void removePhoto() }}>Remove photo</button>}
                <p className="bn-hint">{photo ? 'Photo set (shrunk to 2400 px, location data removed). Drag and pinch it on the preview.' : 'No photo: the banner uses the category colour.'}</p>
                {photoErr && <p className="bn-error" role="alert">{photoErr}</p>}
                {photo && (
                  <>
                    <Slider id="zoom" label="Zoom" min={1} max={4} step={0.05} value={T.zoom} fmt={(v) => `${v.toFixed(2)}x`}
                      onChange={(v) => { if (dims) { const pr = photoRectFor(cfg.size, cfg.template); patch({ transform: zoomTransform(dims.w, dims.h, pr.w, pr.h, cfg.transform, v / T.zoom) }) } }} />
                    {(['exposure', 'contrast', 'saturation', 'temp'] as const).map((k) => (
                      <Slider key={k} id={k} label={{ exposure: 'Brightness', contrast: 'Contrast', saturation: 'Saturation', temp: 'Warmth' }[k]} min={-100} max={100} step={1} value={cfg.adjust[k] ?? 0} fmt={(v) => String(Math.round(v))}
                        onChange={(v) => patch({ adjust: { ...cfg.adjust, [k]: v } })} />
                    ))}
                    <button type="button" className="secondary" disabled={isNeutralAdjust(cfg.adjust)} onClick={() => patch({ adjust: {} })}>Reset tone</button>
                    <p className="bn-hint">Tone edits change the banner only, never the stored photo. Looks, highlights, shadows, sharpen and grain are Planned.</p>
                  </>
                )}
              </>
            )}

            {tab === 'export' && (
              <>
                <span className="bn-label" id="bn-scale">Export size</span>
                <div className="bn-seg" role="radiogroup" aria-labelledby="bn-scale">
                  <button type="button" role="radio" aria-checked={cfg.scale === 1} className={cfg.scale === 1 ? 'on' : ''} onClick={() => patch({ scale: 1 })}>1x {size.w} px</button>
                  <button type="button" role="radio" aria-checked={cfg.scale === 2} className={cfg.scale === 2 ? 'on' : ''} onClick={() => patch({ scale: 2 })}>2x {exp} px</button>
                </div>
                <div className="bn-row">
                  <button type="button" className="primary" disabled={!ready || busy} onClick={() => { void share() }}><Icon name="send" size={16} /><span>Share</span></button>
                  <button type="button" className="primary" disabled={!ready || busy} onClick={() => { void save() }}><Icon name="download" size={16} /><span>Save to gallery</span></button>
                </div>
                {why && <p className="bn-hint">{why}</p>}
                {status && (
                  <div className={status.kind === 'error' ? 'bn-error' : 'bn-hint'} role={status.kind === 'error' ? 'alert' : 'status'}>
                    {status.text}
                    {status.fallback && (
                      <>
                        <p>Android 13 to 15 can refuse a direct write to Pictures. Share does not need that permission: tap Share and pick Save to device, Gallery or Quick Share.</p>
                        <button type="button" className="secondary" disabled={busy} onClick={() => { void share() }}>Share instead</button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slider({ id, label, min, max, step, value, fmt, onChange }: { id: string; label: string; min: number; max: number; step: number; value: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="bn-slider">
      <label htmlFor={`bn-s-${id}`}>{label}<output>{fmt(value)}</output></label>
      <input id={`bn-s-${id}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}
