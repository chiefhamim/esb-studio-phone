// Draws the banner to a PNG. Origin of the look: esb-banner-studio src/core/render.ts + templates.ts (stack and split layouts).
// Fonts are loaded from /brand/fonts (bundled in the app, no CDN). The logo is public/brand/esb-logo.png, byte-copied
// from the desktop repo (electron/assets/esb-logo.png) and only decoded here, never redrawn or recoloured.
import { buildScene, todayIso } from './template'
import { transformedSource, NEUTRAL_TRANSFORM } from './photoMath'
import type { PhotoTransform } from './photoMath'
import { processedPhoto, isNeutralAdjust } from './photoEdit'
import type { PhotoAdjust } from './photoEdit'
import { getSize, DEFAULT_TEMPLATE } from './sizes'
import type { SizeId, TemplateId } from './sizes'
import { drawText } from './text'
import type { TextEl } from './types'
import { STRIPE_COLORS, LINK_PILL } from './tokens'
import type { IconPathDef } from './tokens'
import { SOCIAL_ICONS } from './icons'

const base = () => (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')

let fontsReady: Promise<void> | null = null
export function loadBannerFonts(): Promise<void> {
  if (!fontsReady) {
    const f = `${base()}brand/fonts/`
    const faces = [
      new FontFace('Inter', `url(${f}Inter-500.woff2) format('woff2')`, { weight: '500' }),
      new FontFace('Inter', `url(${f}Inter-700.woff2) format('woff2')`, { weight: '700' }),
      new FontFace('Inter', `url(${f}Inter-800.woff2) format('woff2')`, { weight: '800' }),
      new FontFace('Hind Siliguri', `url(${f}bengali-600.woff2) format('woff2')`, { weight: '600' }),
      new FontFace('Hind Siliguri', `url(${f}bengali-700.woff2) format('woff2')`, { weight: '700' }),
    ]
    const p = Promise.all(faces.map((x) => x.load())).then((l) => { l.forEach((x) => document.fonts.add(x)) })
    p.catch(() => { fontsReady = null })
    fontsReady = p
  }
  return fontsReady
}

let logoP: Promise<ImageBitmap> | null = null
function loadLogo(): Promise<ImageBitmap> {
  if (!logoP) {
    const p = fetch(`${base()}brand/esb-logo.png`).then((r) => {
      if (!r.ok) throw new Error('The ESB Power Line logo file is missing from the app.')
      return r.blob()
    }).then((b) => createImageBitmap(b))
    p.catch(() => { logoP = null })
    logoP = p
  }
  return logoP
}

function drawPaths(ctx: CanvasRenderingContext2D, paths: IconPathDef[], ink: string) {
  for (const p of paths) {
    const path = new Path2D(p.d)
    if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(path) }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke === '$ink' ? ink : p.stroke
      ctx.lineWidth = p.strokeWidth ?? 1
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke(path)
    }
  }
}

function icon(ctx: CanvasRenderingContext2D, def: { vw: number; vh: number; paths: IconPathDef[] }, x: number, y: number, w: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(w / def.vw, w / def.vw)
  drawPaths(ctx, def.paths, '#fff')
  ctx.restore()
}

export interface BannerStory { headline: string; category: string; deck?: string; highlight?: string; hiStyle?: 'colour' | 'marker' | 'underline' }
export interface BannerOpts {
  /** output width in px; height follows the size's ratio */
  width: number
  size?: SizeId
  template?: TemplateId
  /** yyyy-mm-dd; today if omitted */
  date?: string
  transform?: PhotoTransform
  adjust?: PhotoAdjust
}

/** Banner height for a width at a size (default 4:5). */
export const bannerHeight = (width: number, size: SizeId = 'fb45') => { const s = getSize(size); return Math.round((width * s.h) / s.w) }

// One decoded photo is kept: dragging redraws the banner many times a second and must not decode a 2400 px JPEG each time.
let cached: { blob: Blob; bmp: ImageBitmap } | null = null
async function bitmapFor(photo: Blob): Promise<ImageBitmap> {
  if (cached && cached.blob === photo) return cached.bmp
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(photo, { imageOrientation: 'from-image' }) } catch { throw new Error('The photo could not be read. Pick it again.') }
  cached?.bmp.close()
  cached = { blob: photo, bmp }
  return bmp
}

/** Natural size of a photo blob (for the touch-positioning maths). */
export async function photoSize(photo: Blob): Promise<{ w: number; h: number }> {
  const b = await bitmapFor(photo)
  return { w: b.width, h: b.height }
}

/** Render the banner as a PNG. The deck is accepted but not drawn: the desktop story templates have no deck line. */
export async function renderBanner(story: BannerStory, photo: Blob | null, opts: BannerOpts): Promise<Blob> {
  const [, logo] = await Promise.all([loadBannerFonts(), loadLogo()])
  const bmp = photo ? await bitmapFor(photo) : null
  const sc = buildScene({
    size: opts.size ?? 'fb45', template: opts.template ?? DEFAULT_TEMPLATE, headline: story.headline, category: story.category,
    date: opts.date ?? todayIso(), highlight: story.highlight, hiStyle: story.hiStyle,
  })
  const { cat, size } = sc
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(opts.width)
  canvas.height = bannerHeight(opts.width, size.id)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This phone could not create a drawing surface.')
  const k = canvas.width / size.w
  ctx.scale(k, k)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = sc.headerColor
  ctx.fillRect(0, 0, size.w, size.h)
  const pr = sc.photoRect
  ctx.save()
  ctx.beginPath(); ctx.rect(pr.x, pr.y, pr.w, pr.h); ctx.clip()
  if (bmp) {
    const adjust = opts.adjust ?? {}
    const src = isNeutralAdjust(adjust) ? bmp : processedPhoto(bmp, adjust, Math.min(2600, Math.max(900, Math.round(canvas.width * 1.5))))
    const f = src.width / bmp.width
    const s = transformedSource(bmp.width, bmp.height, pr.w, pr.h, opts.transform ?? NEUTRAL_TRANSFORM)
    ctx.drawImage(src, s.sx * f, s.sy * f, s.sw * f, s.sh * f, pr.x, pr.y, pr.w, pr.h)
  } else {
    ctx.fillStyle = cat.band
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h)
  }
  ctx.restore()

  const b = sc.bandRect
  const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h)
  grad.addColorStop(0, sc.bandFill.top)
  grad.addColorStop(1, sc.bandFill.bottom)
  ctx.save(); ctx.globalAlpha = sc.bandFill.alpha; ctx.fillStyle = grad; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore()
  ctx.fillStyle = cat.accent
  ctx.fillRect(sc.edgeRect.x, sc.edgeRect.y, sc.edgeRect.w, sc.edgeRect.h)
  const third = size.w / 3
  for (const st of sc.stripes) STRIPE_COLORS.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(third * i, st.y, third + 1, st.h) })
  ctx.fillStyle = sc.footerColor
  ctx.fillRect(sc.footerRect.x, sc.footerRect.y, sc.footerRect.w, sc.footerRect.h)
  ctx.fillStyle = cat.accent
  ctx.fillRect(sc.footerLine.x, sc.footerLine.y, sc.footerLine.w, sc.footerLine.h)
  for (const ic of sc.footerIcons) icon(ctx, SOCIAL_ICONS[ic.id], ic.x, ic.y, ic.w)
  const ls = Math.min(sc.logo.w / logo.width, sc.logo.h / logo.height)
  ctx.drawImage(logo, sc.logo.x + (sc.logo.w - logo.width * ls) / 2, sc.logo.y + (sc.logo.h - logo.height * ls) / 2, logo.width * ls, logo.height * ls)
  ctx.fillStyle = cat.accent
  ctx.beginPath(); ctx.roundRect(sc.dateRule.x, sc.dateRule.y, sc.dateRule.w, sc.dateRule.h, 4 * sc.unit); ctx.fill()
  ctx.beginPath(); ctx.roundRect(sc.chip.x, sc.chip.y, sc.chip.w, sc.chip.h, 22 * sc.unit); ctx.fill()
  ctx.save(); ctx.translate(sc.chipIcon.x, sc.chipIcon.y); ctx.scale(sc.chipIcon.size / 26, sc.chipIcon.size / 26); drawPaths(ctx, cat.icon, cat.chipText); ctx.restore()
  if (sc.pill) {
    const u = size.kb
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 12 * u; ctx.shadowOffsetY = 5 * u
    ctx.fillStyle = LINK_PILL
    ctx.beginPath(); ctx.roundRect(sc.pill.rect.x, sc.pill.rect.y, sc.pill.rect.w, sc.pill.rect.h, sc.pill.radius); ctx.fill()
    ctx.restore()
    icon(ctx, SOCIAL_ICONS.bubble, sc.pill.icon.x, sc.pill.icon.y, sc.pill.icon.w)
    drawText(ctx, sc.pill.label)
  }
  const texts: TextEl[] = [sc.dateNum, sc.dateMonth, sc.dateWeekday, sc.chipText, sc.headline.el, ...sc.footer]
  for (const t of texts) drawText(ctx, t)

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('Could not make the PNG.'))), 'image/png'))
}
