// Picking, shrinking and storing the banner photo. Photos live in IndexedDB (one per draft id), never in localStorage.
import { shrinkDims } from './photoMath'

export const MAX_LONG_SIDE = 2400

const DB = 'esb-phone-photos'
const STORE = 'photos'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open photo storage'))
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error ?? new Error('Photo storage failed'))
      tx.onabort = () => reject(tx.error ?? new Error('Photo storage failed'))
    })
  } finally {
    db.close()
  }
}

export async function savePhoto(draftId: string, blob: Blob): Promise<void> {
  await run('readwrite', (s) => s.put(blob, draftId))
}

export async function loadPhoto(draftId: string): Promise<Blob | null> {
  const v = await run<unknown>('readonly', (s) => s.get(draftId))
  return v instanceof Blob ? v : null
}

export async function deletePhoto(draftId: string): Promise<void> {
  await run('readwrite', (s) => s.delete(draftId))
}

/** Decode (EXIF orientation applied), shrink to the long-side limit and re-encode as JPEG. EXIF, including GPS, is dropped. */
export async function shrinkPhoto(blob: Blob, maxLong = MAX_LONG_SIDE): Promise<Blob> {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  try {
    const d = shrinkDims(bmp.width, bmp.height, maxLong)
    const c = document.createElement('canvas')
    c.width = d.w
    c.height = d.h
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('This phone could not prepare the photo (no canvas).')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, d.w, d.h)
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', 0.9))
  } finally {
    bmp.close()
  }
}

/** Open the gallery picker. Resolves null if the editor cancels. */
export function pickFromGallery(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Take a photo with the camera app. Resolves null if the editor cancels; throws a plain-words Error on failure. */
export async function takePhoto(): Promise<Blob | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  try {
    const p = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, correctOrientation: true, quality: 90 })
    if (!p.webPath) throw new Error('The camera gave no photo.')
    const r = await fetch(p.webPath)
    return await r.blob()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/cancel/i.test(msg)) return null
    throw new Error(`Camera failed: ${msg}`)
  }
}

/** Pick (gallery or camera), shrink, and store for this draft. Returns the stored blob, or null on cancel. */
export async function choosePhoto(draftId: string, from: 'gallery' | 'camera'): Promise<Blob | null> {
  const raw = from === 'camera' ? await takePhoto() : await pickFromGallery()
  if (!raw) return null
  let small: Blob
  try { small = await shrinkPhoto(raw) } catch { throw new Error('That file could not be read as a photo.') }
  await savePhoto(draftId, small)
  return small
}
