// Draws the story banner (4:5) to a PNG. Origin of the look: esb-banner-studio src/core/render.ts + templates.ts (fb45).
// Fonts are loaded from /brand/fonts (bundled in the app, no CDN). The logo is public/brand/esb-logo.png, byte-copied
// from the desktop repo (electron/assets/esb-logo.png) and only decoded here, never redrawn or recoloured.
import { buildStoryScene, todayIso, W, H } from './template'
import { coverSource } from './photoMath'
import { drawText } from './text'
import type { TextEl } from './types'
import { SOCIAL_BG, STRIPE_COLORS } from './tokens'
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

export interface BannerStory { headline: string; category: string; deck?: string }
export interface BannerOpts { width: number; /** yyyy-mm-dd; today if omitted */ date?: string }

/** Banner height for a width (4:5). */
export const bannerHeight = (width: number) => Math.round((width * H) / W)

/** Render the story banner as a PNG. The deck is accepted but not drawn: the desktop 4:5 template has no deck line. */
export async function renderBanner(story: BannerStory, photo: Blob | null, opts: BannerOpts): Promise<Blob> {
  const [, logo] = await Promise.all([loadBannerFonts(), loadLogo()])
  let bmp: ImageBitmap | null = null
  if (photo) {
    try { bmp = await createImageBitmap(photo, { imageOrientation: 'from-image' }) } catch { throw new Error('The photo could not be read. Pick it again.') }
  }
  try {
    const sc = buildStoryScene(story, opts.date ?? todayIso())
    const { g, cat } = sc
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(opts.width)
    canvas.height = bannerHeight(opts.width)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This phone could not create a drawing surface.')
    ctx.scale(canvas.width / W, canvas.width / W)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    ctx.fillStyle = SOCIAL_BG
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.beginPath(); ctx.rect(0, g.headerH, W, g.photoH); ctx.clip()
    if (bmp) {
      const s = coverSource(bmp.width, bmp.height, W, g.photoH)
      ctx.drawImage(bmp, s.sx, s.sy, s.sw, s.sh, 0, g.headerH, W, g.photoH)
    } else {
      ctx.fillStyle = cat.band
      ctx.fillRect(0, g.headerH, W, g.photoH)
    }
    ctx.restore()
    ctx.fillStyle = cat.band; ctx.fillRect(0, g.bandTop, W, g.bandH)
    ctx.fillStyle = cat.accent; ctx.fillRect(0, g.bandTop - 10 * g.kh, W, 10 * g.kh)
    const sx = [0, W / 3, (W * 2) / 3]
    for (const y of [0, g.headerH - g.stripeH]) STRIPE_COLORS.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(sx[i], y, W / 3 + 1, g.stripeH) })
    ctx.fillStyle = cat.footer; ctx.fillRect(0, g.footTop, W, g.footH)
    ctx.fillStyle = cat.accent; ctx.fillRect(0, g.footTop, W, 6 * g.kf)
    const fy = (v: number) => g.footTop + (v - 1341) * g.kf
    icon(ctx, SOCIAL_ICONS.facebook, 56 * g.kf, fy(1356), 60 * g.kf)
    icon(ctx, SOCIAL_ICONS.website, 601 * g.kf, fy(1354), 64 * g.kf)
    icon(ctx, SOCIAL_ICONS.youtube, 1192 * g.kf, fy(1362.5), 66 * g.kf)
    const ls = Math.min(sc.logo.w / logo.width, sc.logo.h / logo.height)
    ctx.drawImage(logo, sc.logo.x + (sc.logo.w - logo.width * ls) / 2, sc.logo.y + (sc.logo.h - logo.height * ls) / 2, logo.width * ls, logo.height * ls)
    ctx.fillStyle = cat.accent
    ctx.beginPath(); ctx.roundRect(sc.dateRule.x, sc.dateRule.y, sc.dateRule.w, sc.dateRule.h, 4 * g.kh); ctx.fill()
    ctx.beginPath(); ctx.roundRect(sc.chip.x, sc.chip.y, sc.chip.w, sc.chip.h, 22 * g.kh); ctx.fill()
    ctx.save(); ctx.translate(sc.chipIcon.x, sc.chipIcon.y); ctx.scale(sc.chipIcon.size / 26, sc.chipIcon.size / 26); drawPaths(ctx, cat.icon, cat.chipText); ctx.restore()
    const texts: TextEl[] = [sc.dateNum, sc.dateMonth, sc.dateWeekday, sc.chipText, sc.headline.el, ...sc.footer]
    for (const t of texts) drawText(ctx, t)

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the PNG.'))), 'image/png'))
  } finally {
    bmp?.close()
  }
}
