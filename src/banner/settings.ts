// Per-story banner choices (template, size, key phrase, photo position and tone). Kept in localStorage by draft id: nothing
// secret lives here. The story's own text (headline, category) stays in the Draft.
import { clampTransform, NEUTRAL_TRANSFORM } from './photoMath'
import type { PhotoTransform } from './photoMath'
import { clampAdjust } from './photoEdit'
import type { PhotoAdjust } from './photoEdit'
import { DEFAULT_SIZE, DEFAULT_TEMPLATE, SIZES, TEMPLATES } from './sizes'
import type { SizeId, TemplateId } from './sizes'

const KEY = 'esb-phone-banner-v1'

export interface BannerSettings {
  size: SizeId
  template: TemplateId
  highlight: string
  hiStyle: 'colour' | 'marker' | 'underline'
  transform: PhotoTransform
  adjust: PhotoAdjust
  scale: 1 | 2
}

export const DEFAULT_SETTINGS: BannerSettings = {
  size: DEFAULT_SIZE, template: DEFAULT_TEMPLATE, highlight: '', hiStyle: 'colour', transform: NEUTRAL_TRANSFORM, adjust: {}, scale: 2,
}

/** Accept only what we wrote: anything else falls back to the default for that field. */
export function sanitizeSettings(v: unknown): BannerSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof BannerSettings, unknown>>
  const size = SIZES.some((s) => s.id === o.size) ? (o.size as SizeId) : DEFAULT_SIZE
  const template = TEMPLATES.some((t) => t.id === o.template) ? (o.template as TemplateId) : DEFAULT_TEMPLATE
  const hiStyle = o.hiStyle === 'marker' || o.hiStyle === 'underline' ? o.hiStyle : 'colour'
  const t = (o.transform ?? {}) as Partial<PhotoTransform>
  return {
    size, template, hiStyle,
    highlight: typeof o.highlight === 'string' ? o.highlight.slice(0, 200) : '',
    transform: clampTransform({ zoom: Number(t.zoom ?? 1), px: Number(t.px ?? 0), py: Number(t.py ?? 0) }),
    adjust: clampAdjust((o.adjust ?? {}) as PhotoAdjust),
    scale: o.scale === 1 ? 1 : 2,
  }
}

function readAll(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch { return {} }
}

export function loadSettings(draftId: string): BannerSettings { return sanitizeSettings(readAll()[draftId]) }

export function saveSettings(draftId: string, s: BannerSettings): void {
  const all = readAll()
  all[draftId] = s
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage full: the choices are lost on restart, nothing else */ }
}
