// Pure maths for photos (no DOM), so it is testable under vitest.

/** Scale a size down so the long side is at most maxLong. Never scales up. */
export function shrinkDims(w: number, h: number, maxLong = 2400): { w: number; h: number; scale: number } {
  const long = Math.max(w, h)
  if (!(long > 0) || long <= maxLong) return { w, h, scale: 1 }
  const scale = maxLong / long
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale }
}

/** Source rectangle that "covers" a box of boxW x boxH from an image of imgW x imgH, centred. */
export function coverSource(imgW: number, imgH: number, boxW: number, boxH: number): { sx: number; sy: number; sw: number; sh: number } {
  const s = Math.max(boxW / imgW, boxH / imgH)
  const sw = boxW / s
  const sh = boxH / s
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh }
}

/**
 * The photo's position inside its frame. zoom >= 1 (1 = the plain cover crop); px / py are -1..1 and say how far the crop
 * window sits from the centre of the room the photo leaves (0 = centred, -1 = left/top edge, 1 = right/bottom edge).
 */
export interface PhotoTransform { zoom: number; px: number; py: number }
export const NEUTRAL_TRANSFORM: PhotoTransform = { zoom: 1, px: 0, py: 0 }
export const MAX_ZOOM = 4

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function clampTransform(t: PhotoTransform): PhotoTransform {
  const zoom = Number.isFinite(t.zoom) ? clamp(t.zoom, 1, MAX_ZOOM) : 1
  return { zoom, px: Number.isFinite(t.px) ? clamp(t.px, -1, 1) : 0, py: Number.isFinite(t.py) ? clamp(t.py, -1, 1) : 0 }
}

/** Source rectangle for a box with the editor's zoom and position. At zoom 1 and px = py = 0 this is exactly coverSource. */
export function transformedSource(imgW: number, imgH: number, boxW: number, boxH: number, t: PhotoTransform): { sx: number; sy: number; sw: number; sh: number } {
  const c = clampTransform(t)
  const base = coverSource(imgW, imgH, boxW, boxH)
  const sw = base.sw / c.zoom
  const sh = base.sh / c.zoom
  const roomX = (imgW - sw) / 2
  const roomY = (imgH - sh) / 2
  return { sx: roomX + c.px * roomX, sy: roomY + c.py * roomY, sw, sh }
}

/**
 * Drag the photo by (dx, dy) pixels measured in the frame (frame units, boxW x boxH). The photo follows the finger, so the
 * crop window moves the opposite way. Returns the clamped transform.
 */
export function panTransform(imgW: number, imgH: number, boxW: number, boxH: number, t: PhotoTransform, dx: number, dy: number): PhotoTransform {
  const c = clampTransform(t)
  const cur = transformedSource(imgW, imgH, boxW, boxH, c)
  const roomX = (imgW - cur.sw) / 2
  const roomY = (imgH - cur.sh) / 2
  // frame pixels -> source pixels
  const kx = cur.sw / boxW
  const ky = cur.sh / boxH
  const px = roomX > 0 ? c.px - (dx * kx) / roomX : 0
  const py = roomY > 0 ? c.py - (dy * ky) / roomY : 0
  return clampTransform({ zoom: c.zoom, px, py })
}

/**
 * Pinch: multiply the zoom by `factor`, keeping the point under the fingers still. (fx, fy) is that point as a fraction of
 * the frame (0..1). Returns the clamped transform.
 */
export function zoomTransform(imgW: number, imgH: number, boxW: number, boxH: number, t: PhotoTransform, factor: number, fx = 0.5, fy = 0.5): PhotoTransform {
  const c = clampTransform(t)
  const before = transformedSource(imgW, imgH, boxW, boxH, c)
  const zoom = clamp(c.zoom * (Number.isFinite(factor) && factor > 0 ? factor : 1), 1, MAX_ZOOM)
  const base = coverSource(imgW, imgH, boxW, boxH)
  const sw = base.sw / zoom
  const sh = base.sh / zoom
  // source point under the fingers stays put
  const ax = before.sx + fx * before.sw
  const ay = before.sy + fy * before.sh
  const sx = ax - fx * sw
  const sy = ay - fy * sh
  const roomX = (imgW - sw) / 2
  const roomY = (imgH - sh) / 2
  return clampTransform({ zoom, px: roomX > 0 ? (sx - roomX) / roomX : 0, py: roomY > 0 ? (sy - roomY) / roomY : 0 })
}

export const isNeutralTransform = (t: PhotoTransform) => t.zoom === 1 && t.px === 0 && t.py === 0
