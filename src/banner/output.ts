// Getting a rendered banner out of the app: share sheet (WhatsApp, Facebook, Quick Share) and save to the gallery.
// Every function either succeeds for real (the file exists / the share sheet returned) or throws an Error in plain words.
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(new Error('Could not read the banner image.'))
    r.readAsDataURL(blob)
  })
}

/** File-name-safe stem from a headline (ASCII letters and digits; falls back to "banner"). */
export function fileStem(headline: string, now = new Date()): string {
  const slug = headline.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `esb-${slug || 'banner'}-${stamp}`
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Open the share sheet with the banner as a PNG file. Resolves 'shared' or 'cancelled'. */
export async function shareBanner(blob: Blob, stem: string): Promise<'shared' | 'cancelled'> {
  if (!Capacitor.isNativePlatform()) throw new Error('Sharing works in the installed Android app, not in a browser.')
  let uri: string
  try {
    const w = await Filesystem.writeFile({ path: `banners/${stem}.png`, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true })
    uri = w.uri
  } catch (e) {
    throw new Error(`Could not prepare the image for sharing: ${msg(e)}`)
  }
  try {
    const can = await Share.canShare()
    if (!can.value) throw new Error('This phone cannot share files from the app.')
    await Share.share({ files: [uri], dialogTitle: 'Share banner' })
    return 'shared'
  } catch (e) {
    if (/cancel/i.test(msg(e))) return 'cancelled'
    throw new Error(`Sharing failed: ${msg(e)}`)
  }
}

/**
 * Save to Pictures/ESB Studio on the phone's shared storage (Filesystem, Directory.ExternalStorage), then confirm the file
 * exists with stat before reporting success. Returns the path. On Android 11+ a file written this way is in the Pictures
 * folder but the Gallery app may need a moment (or a media scan) before it lists it; the caller words the message so.
 */
export async function saveToGallery(blob: Blob, stem: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) throw new Error('Saving to the gallery works in the installed Android app, not in a browser.')
  const path = `Pictures/ESB Studio/${stem}.png`
  try {
    const perm = await Filesystem.checkPermissions()
    if (perm.publicStorage !== 'granted') {
      const asked = await Filesystem.requestPermissions()
      if (asked.publicStorage !== 'granted') throw new Error('Storage permission was not given.')
    }
    await Filesystem.writeFile({ path, data: await blobToBase64(blob), directory: Directory.ExternalStorage, recursive: true })
    const st = await Filesystem.stat({ path, directory: Directory.ExternalStorage })
    if (!(st.size > 0)) throw new Error('The saved file is empty.')
    return path
  } catch (e) {
    throw new Error(`Could not save to the gallery: ${msg(e)}. Use Share and pick Save to device instead.`)
  }
}
