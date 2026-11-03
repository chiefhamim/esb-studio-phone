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
