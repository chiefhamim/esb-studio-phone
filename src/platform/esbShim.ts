// window.esb for the phone. The vendored PC code (src/pc) talks to the Electron preload bridge `window.esb`; this
// installs a bridge with the same contract, mapped onto the platform layer, the site's bearer routes
// (src/sync/endpoints.ts, branch phone-bearer-api) and on-device storage. Installed at boot, before any src/pc module.
import type { EsbBridge, EsbOpenProjectResult } from '../pc/esb'
import { platform } from './platform'
import { kvGet, kvKeys, kvSet } from './kv'
import { cachedAvailability, probeFeature, revalidateSlugs, uploadPicture } from '../sync/endpoints'

export const PHONE_FOLDER = 'ESB Studio'
const PROJECT_PREFIX = 'project:'

function mimeOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop()
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'zip' ? 'application/zip' : 'image/png'
}

/** The mobile UI registers a picker for "Open project" (a sheet listing projects saved on the phone). */
let projectChooser: (() => Promise<string | null>) | null = null
export function setProjectChooser(fn: (() => Promise<string | null>) | null) { projectChooser = fn }

export async function listProjects(): Promise<{ path: string; name: string }[]> {
  return (await kvKeys()).filter((k) => k.startsWith(PROJECT_PREFIX)).map((k) => ({ path: k, name: k.slice(PROJECT_PREFIX.length).replace(/\.esb$/i, '') })).sort((a, b) => a.name.localeCompare(b.name))
}

/** What happened to the site features this session (the UI shows "Planned / site update needed" from here). */
export type SiteFeatureState = 'live' | 'not-live' | 'unknown'
export function siteFeatureState(f: 'upload' | 'revalidate' | 'fetchArticle'): SiteFeatureState {
  const a = cachedAvailability(f)
  return a === 'available' ? 'live' : a === 'unavailable' ? 'not-live' : 'unknown'
}

const NOT_LIVE = 'Picture upload to esbpowerline.com is Planned: it needs the site update (branch phone-bearer-api) to be deployed.'

export const phoneBridge: EsbBridge = {
  async saveImage(name, bytes) {
    const r = await platform().saveFile({ name, bytes, mime: mimeOf(name) })
    if (!r.ok) throw new Error(r.error)
    return r.path
  },
  // Android has no folder picker for this: everything goes to Pictures/ESB Studio (ZIPs to Download/ESB Studio)
  async pickFolder() { return PHONE_FOLDER },
  async reveal() { /* no file manager hand-off on the phone */ },
  async saveProject(name, text, existingPath) {
    let path = existingPath && existingPath.startsWith(PROJECT_PREFIX) ? existingPath : PROJECT_PREFIX + name
    if (path !== existingPath) {
      // a NEW project called like a saved one gets "name 2", "name 3" ...: the saved one is never overwritten
      const base = path
      for (let n = 2; (await kvGet(path)) != null; n++) path = `${base} ${n}`
    }
    await kvSet(path, text)
    return path
  },
  async openProject(): Promise<EsbOpenProjectResult | null> {
    if (!projectChooser) return null
    const path = await projectChooser()
    if (!path) return null
    const text = await kvGet(path)
    return text == null ? null : { path, text }
  },
  async readProject(path) { return kvGet(path) },
  fetchUrl: (url, options) => platform().fetchUrl(url, options),
  fetchImageData: (url, options) => platform().fetchImageData(url, options),
  async prepareDragFile() { return null },
  startDrag() { /* no drag-out on the phone */ },
  async openSiteAs(_cookies, sitePath) {
    // the CMS cannot be opened signed in from the phone (no cookie hand-off); open the page in the browser instead
    await platform().openExternal(`https://esbpowerline.com${sitePath}`)
    return false
  },
  async siteSignOut() { return true },
  async siteUpload(_cookies, bytes, mime, name) {
    if (siteFeatureState('upload') !== 'live' && (await probeFeature('upload')) !== 'available') return { ok: false, status: 404, error: NOT_LIVE }
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
    const r = await uploadPicture(new Blob([bytes as BlobPart], { type: mime }), /\.\w+$/.test(name) ? name : `${name}.${ext}`)
    return r.ok ? { ok: true, url: r.data.url, status: 200 } : { ok: false, status: r.status ?? 0, error: r.error }
  },
  async siteRevalidate(_cookies, slugs) {
    if (siteFeatureState('revalidate') !== 'live' && (await probeFeature('revalidate')) !== 'available') return { ok: false, status: 404, error: 'Cache refresh is Planned: it needs the site update to be deployed.' }
    const r = await revalidateSlugs(slugs)
    return r.ok ? { ok: true, status: 200 } : { ok: false, status: r.status ?? 0, error: r.error }
  },
  async siteUploadProbe() {
    const a = await probeFeature('upload')
    return a === 'available' ? { ok: true, status: 400, detail: 'Picture upload is live.' } : { ok: false, status: a === 'unavailable' ? 404 : 0, detail: a === 'unavailable' ? NOT_LIVE : 'Could not check the site (offline or signed out).' }
  },
}

export function installEsbShim() {
  ;(window as unknown as { esb: EsbBridge }).esb = phoneBridge
}
