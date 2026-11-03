// Banner sizes and templates available on the phone.
// Origin: esb-banner-studio src/core/templates.ts STACK table (fb45, sq, story: canvas, header/band scale kh, headline scale kb,
// band height, headline box) and HEAD_SIZES (headline px for 1-70 / 71+ characters), copied with the same numbers.
// 'fb191' (Facebook link image, 1200 x 630) is NOT a desktop size: it is the desktop Web (split) layout re-fitted to 1.91:1 for
// the phone, so it is marked "adapted" in the UI.
export type SizeId = 'fb45' | 'sq' | 'fb191' | 'story'
export type TemplateId = 'classic' | 'link' | 'overlay'
export type Family = 'stack' | 'split'

export interface SizeDef {
  id: SizeId
  name: string
  ratio: string
  w: number
  h: number
  family: Family
  /** header scale (stack) */
  kh: number
  /** headline scale (stack) */
  kb: number
  /** headline band height (stack) */
  bandH: number
  headX: number
  headW: number
  /** headline px for [1-70 characters, 71+] */
  headSizes: [number, number]
  /** true when the geometry is a phone adaptation, not a desktop size */
  adapted?: boolean
  note: string
}

export const SIZES: SizeDef[] = [
  { id: 'fb45', name: 'Feed', ratio: '4:5', w: 1080, h: 1350, family: 'stack', kh: 0.74, kb: 0.84, bandH: 350, headX: 48, headW: 984, headSizes: [58, 52], note: 'Facebook feed, the recommended size' },
  { id: 'sq', name: 'Square', ratio: '1:1', w: 1080, h: 1080, family: 'stack', kh: 0.7, kb: 0.8, bandH: 292, headX: 48, headW: 984, headSizes: [50, 45], note: 'Facebook, Instagram, WhatsApp, X' },
  { id: 'fb191', name: 'Link', ratio: '1.91:1', w: 1200, h: 630, family: 'split', kh: 0, kb: 0, bandH: 0, headX: 0, headW: 0, headSizes: [56, 50], adapted: true, note: 'Facebook link image (adapted from the desktop Web layout)' },
  { id: 'story', name: 'Story', ratio: '9:16', w: 1080, h: 1920, family: 'stack', kh: 0.82, kb: 0.95, bandH: 480, headX: 48, headW: 984, headSizes: [58, 52], note: 'Stories and Reels' },
]

export const DEFAULT_SIZE: SizeId = 'fb45'
export const getSize = (id: SizeId | string): SizeDef => SIZES.find((s) => s.id === id) ?? SIZES[0]

export interface TemplateDef { id: TemplateId; name: string; note: string }
export const TEMPLATES: TemplateDef[] = [
  { id: 'classic', name: 'Classic', note: 'Tinted headline band, the desktop default' },
  { id: 'link', name: 'News link', note: 'Red "news link in comment" pill above the headline' },
  { id: 'overlay', name: 'Photo overlay', note: 'Photo runs under a dark headline panel' },
]

/** Which templates a size supports ('link' is stack-only). */
export function templatesFor(size: SizeDef): TemplateDef[] {
  return size.family === 'stack' ? TEMPLATES : TEMPLATES.filter((t) => t.id !== 'link')
}
export const DEFAULT_TEMPLATE: TemplateId = 'classic'

/** Export widths: 1x is the size's own width; 2x doubles it. */
export function exportSize(size: SizeDef, scale: 1 | 2): { w: number; h: number } {
  return { w: size.w * scale, h: size.h * scale }
}
