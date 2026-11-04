// The pictures of a story, kept on the phone. Publishing sends one banner to the website and one to Facebook; this
// module (a) sets what each should be by default (Facebook 3× PNG, website 1× JPG, once; after that the editor's own
// choice in the publish sheet wins) and (b) saves those same two files to the phone's gallery, named after the story.
import { platform } from '../../platform/platform'
import { renderBanner } from '../../pc/export'
import { effectiveQuality, FORMAT_OF, pixelSize, TYPES_FOR, usePublishImage } from '../../pc/editorial/publishImage'
import type { Dest } from '../../pc/editorial/publishImage'
import type { Assets } from '../../pc/core/render'
import { useStore } from '../../pc/store'

const INIT = 'esb-phone/picture-defaults-v1'
const KEEP = 'esb-phone/keep-banners'

/** Once per install: Facebook 3× PNG, website 1× JPG 90%. */
export function applyPictureDefaults() {
  try {
    if (localStorage.getItem(INIT)) return
    const s = usePublishImage.getState().set
    s('fb', { scale: 3, type: 'png' })
    s('web', { scale: 1, type: 'jpeg', quality: 0.9 })
    localStorage.setItem(INIT, '1')
  } catch { /* storage unavailable: the built-in defaults stay */ }
}
applyPictureDefaults()

export const keepOn = () => { try { return localStorage.getItem(KEEP) !== '0' } catch { return true } }
export const setKeep = (on: boolean) => { try { localStorage.setItem(KEEP, on ? '1' : '0') } catch { /* ignore */ } }

const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' } as const
const LABEL: Record<Dest, string> = { web: 'website', fb: 'facebook' }

/** Render (unless a finished file is passed) and save one destination's banner to the gallery. */
async function keepOne(d: Dest, base: Assets, slug: string, have: Blob | null): Promise<string> {
  const o = usePublishImage.getState().opts[d]
  const kind = TYPES_FOR[d].find((t) => t.id === o.type)?.name ?? o.type
  const px = pixelSize(d, o)
  const what = `${LABEL[d]} ${px.w}×${px.h} ${kind}`
  try {
    const blob = have ?? (await renderBanner(useStore.getState().doc, FORMAT_OF[d], base, o.scale, o.type, effectiveQuality(o)))
    const name = `${(slug || 'banner').slice(0, 80)}-${LABEL[d]}${o.scale === 1 ? '' : `@${String(o.scale).replace('.', '_')}x`}.${EXT[o.type]}`
    const r = await platform().saveFile({ name, bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || (o.type === 'png' ? 'image/png' : 'image/jpeg') })
    return r.ok ? `${what} saved` : `${what} not saved (${r.error})`
  } catch (e) {
    return `${what} not saved (${e instanceof Error ? e.message : String(e)})`
  }
}

/** Save the website and Facebook banners; returns one sentence saying exactly what happened to each. */
export async function keepBanners(base: Assets | null, slug: string, have: { web?: Blob | null; fb?: Blob | null } = {}): Promise<string> {
  if (!base) return 'Banners not saved to the phone (the artwork is not loaded).'
  const parts = [await keepOne('web', base, slug, have.web ?? null), await keepOne('fb', base, slug, have.fb ?? null)]
  return `On this phone: ${parts.join('; ')}.`
}
