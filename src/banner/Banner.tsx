import { useCallback, useEffect, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import { renderBanner } from './renderBanner'
import { choosePhoto, deletePhoto, loadPhoto } from './photos'
import { fileStem, saveToGallery, shareBanner } from './output'
import { CATEGORIES } from './tokens'
import { categoryIdOf } from './categories'

interface Props {
  draft: Draft | null
  onChange: (d: Draft) => void
}

type Status = { kind: 'ok' | 'error' | 'busy'; text: string } | null

export default function Banner({ draft, onChange }: Props) {
  const [stored, setStored] = useState<{ id: string; blob: Blob | null } | null>(null)
  const [photoErr, setPhotoErr] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [scale, setScale] = useState<1 | 2>(2)
  const [status, setStatus] = useState<Status>(null)
  const busy = status?.kind === 'busy'
  const draftId = draft?.id ?? ''
  const headline = draft?.headline ?? ''
  const category = draft?.category ?? ''
  const catId = categoryIdOf(category)
  const photo = stored && stored.id === draftId ? stored.blob : null
  const setPhoto = (blob: Blob | null) => setStored({ id: draftId, blob })
  const urlRef = useRef<string | null>(null)

  // photo for this draft, from IndexedDB
  useEffect(() => {
    let live = true
    if (!draftId) return
    loadPhoto(draftId).then((b) => { if (live) setStored({ id: draftId, blob: b }) }).catch(() => { if (live) setPhotoErr('Could not read the saved photo for this story.') })
    return () => { live = false }
  }, [draftId])

  // live preview, debounced; the previous picture stays until the next one is ready
  useEffect(() => {
    if (!draftId) return
    let live = true
    const t = setTimeout(() => {
      renderBanner({ headline, category: catId }, photo, { width: 540 })
        .then((blob) => {
          if (!live) return
          const url = URL.createObjectURL(blob)
          const old = urlRef.current
          urlRef.current = url
          setPreviewUrl(url)
          setPreviewErr('')
          if (old) setTimeout(() => URL.revokeObjectURL(old), 1000)
        })
        .catch((e: unknown) => { if (live) setPreviewErr(e instanceof Error ? e.message : 'The preview could not be drawn.') })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [draftId, headline, catId, photo])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const pick = useCallback(async (from: 'gallery' | 'camera') => {
    if (!draftId) return
    setPhotoErr('')
    setStatus({ kind: 'busy', text: 'Preparing the photo...' })
    try {
      const b = await choosePhoto(draftId, from)
      if (b) setStored({ id: draftId, blob: b })
      setStatus(null)
    } catch (e) {
      setStatus(null)
      setPhotoErr(e instanceof Error ? e.message : 'The photo could not be added.')
    }
  }, [draftId])

  const removePhoto = async () => {
    try { await deletePhoto(draftId); setPhoto(null); setPhotoErr('') } catch { setPhotoErr('Could not remove the photo.') }
  }

  if (!draft) return (<><h1>Banner</h1><p>Open a story first.</p></>)

  const ready = !!headline.trim() && !!catId
  const why = !headline.trim() ? 'Add a headline in Edit to make the banner.' : !catId ? 'Pick a category to make the banner.' : ''

  const make = () => renderBanner({ headline, category: catId, deck: draft.deck }, photo, { width: 1080 * scale })

  const share = async () => {
    setStatus({ kind: 'busy', text: 'Making the banner...' })
    try {
      const blob = await make()
      const r = await shareBanner(blob, fileStem(headline))
      setStatus(r === 'shared' ? { kind: 'ok', text: 'Share sheet closed after sharing.' } : null)
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Sharing failed.' })
    }
  }

  const save = async () => {
    setStatus({ kind: 'busy', text: 'Making the banner...' })
    try {
      const blob = await make()
      const path = await saveToGallery(blob, fileStem(headline))
      setStatus({ kind: 'ok', text: `Saved to ${path}. The Gallery may take a moment to list it.` })
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Saving failed.' })
    }
  }

  return (
    <div className="bn">
      <h1>Banner</h1>
      <div className="bn-grid">
        <div className="bn-preview">
          {previewUrl
            ? <img src={previewUrl} alt={`Banner preview: ${headline || 'no headline yet'}`} width={540} height={675} />
            : <div className="bn-blank" role="status">Drawing the preview...</div>}
          {previewErr && <p className="bn-error" role="alert">{previewErr}</p>}
        </div>
        <div className="bn-controls">
          <section className="card">
            <label htmlFor="bn-cat">Category</label>
            <select id="bn-cat" value={catId} onChange={(e) => {
              const c = CATEGORIES.find((x) => x.id === e.target.value)
              onChange({ ...draft, category: c ? c.name : '' })
            }}>
              <option value="">Pick a category</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="note">Headline comes from Edit: {headline.trim() ? headline : 'none yet'}</p>
          </section>
          <section className="card">
            <span className="bn-label">Photo</span>
            <div className="bn-row">
              <button type="button" className="secondary" disabled={busy} onClick={() => pick('gallery')}>From gallery</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => pick('camera')}>Take photo</button>
            </div>
            {photo && <button type="button" className="secondary" disabled={busy} onClick={removePhoto}>Remove photo</button>}
            <p className="note">{photo ? 'Photo set (shrunk to 2400 px, location data removed).' : 'No photo: the banner uses the category colour.'}</p>
            {photoErr && <p className="bn-error" role="alert">{photoErr}</p>}
          </section>
          <section className="card">
            <span className="bn-label" id="bn-size">Export size</span>
            <div className="bn-row" role="radiogroup" aria-labelledby="bn-size">
              <button type="button" role="radio" aria-checked={scale === 1} className={scale === 1 ? 'primary' : 'secondary'} onClick={() => setScale(1)}>1x 1080 px</button>
              <button type="button" role="radio" aria-checked={scale === 2} className={scale === 2 ? 'primary' : 'secondary'} onClick={() => setScale(2)}>2x 2160 px</button>
            </div>
            <div className="bn-row">
              <button type="button" className="primary" disabled={!ready || busy} onClick={share}>Share</button>
              <button type="button" className="primary" disabled={!ready || busy} onClick={save}>Save to gallery</button>
            </div>
            {why && <p className="note">{why}</p>}
            {status && <p className={status.kind === 'error' ? 'bn-error' : 'note'} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
