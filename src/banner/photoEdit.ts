// Origin: esb-banner-studio src/core/photoEdit.ts (toneLut, the per-pixel pipeline), copied with the same formulas and cut down
// to what the phone offers: exposure ("brightness"), contrast, saturation and temperature. The desktop's other controls
// (highlights, shadows, sharpen, grain, looks, vignette) are Planned on the phone. The edit never touches the stored photo:
// it is applied to a working copy that is cached per photo and per edit.

export interface PhotoAdjust { exposure?: number; contrast?: number; saturation?: number; temp?: number }
export const NO_ADJUST: PhotoAdjust = {}
const KEYS = ['exposure', 'contrast', 'saturation', 'temp'] as const

export function isNeutralAdjust(a: PhotoAdjust): boolean { return KEYS.every((k) => !a[k]) }

export function clampAdjust(a: PhotoAdjust): PhotoAdjust {
  const out: PhotoAdjust = {}
  for (const k of KEYS) {
    const v = a[k]
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) out[k] = Math.min(100, Math.max(-100, Math.round(v)))
  }
  return out
}

/** The tone curve as a 256-entry table (the same curve for R, G and B): exposure then contrast, as on the desktop. */
export function toneLut(a: PhotoAdjust): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  const exp = Math.pow(2, (a.exposure ?? 0) / 100)
  const con = 1 + (a.contrast ?? 0) / 100
  for (let i = 0; i < 256; i++) {
    let x = (i / 255) * exp
    x = (x - 0.5) * con + 0.5
    lut[i] = Math.round(Math.min(1, Math.max(0, x)) * 255)
  }
  return lut
}

/** Colour step of the desktop pipeline for one pixel (r, g, b in 0..1): temperature, then saturation. */
export function colourPixel(r: number, g: number, b: number, temp: number, sat: number): [number, number, number] {
  const t = temp / 100
  if (t !== 0) {
    const L0 = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const mid = 1 - Math.abs(L0 - 0.5) * 0.8
    r += t * 0.11 * mid
    g += t * 0.015 * mid
    b += -t * 0.13 * mid
  }
  if (sat !== 0) {
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const f = 1 + sat / 100
    r = L + (r - L) * f
    g = L + (g - L) * f
    b = L + (b - L) * f
  }
  return [r, g, b]
}

type Src = CanvasImageSource & { width: number; height: number }
const cache = new WeakMap<object, Map<string, HTMLCanvasElement>>()

/** The photo with the edit applied, at most maxEdge px on the long side. Cached per photo and per edit. */
export function processedPhoto(img: Src, a: PhotoAdjust, maxEdge: number): Src {
  if (isNeutralAdjust(a) || typeof document === 'undefined') return img
  const key = JSON.stringify([maxEdge, ...KEYS.map((k) => a[k] ?? 0)])
  let m = cache.get(img)
  if (!m) { m = new Map(); cache.set(img, m) }
  const hit = m.get(key)
  if (hit) { m.delete(key); m.set(key, hit); return hit }
  const out = renderEdit(img, a, maxEdge)
  m.set(key, out)
  while (m.size > 3) m.delete(m.keys().next().value as string)
  return out
}

export function renderEdit(img: Src, a: PhotoAdjust, maxEdge: number): HTMLCanvasElement {
  const iw = img.width, ih = img.height
  const s = Math.min(1, maxEdge / Math.max(iw, ih))
  const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s))
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This phone could not prepare the photo edit (no canvas).')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  const lut = toneLut(a)
  const temp = a.temp ?? 0, sat = a.saturation ?? 0
  const colour = temp !== 0 || sat !== 0
  for (let i = 0; i < px.length; i += 4) {
    let r = lut[px[i]] / 255, g = lut[px[i + 1]] / 255, b = lut[px[i + 2]] / 255
    if (colour) [r, g, b] = colourPixel(r, g, b, temp, sat)
    px[i] = r * 255; px[i + 1] = g * 255; px[i + 2] = b * 255
  }
  ctx.putImageData(data, 0, 0)
  return cv
}
