// Platform on the installed Android app (Capacitor 8). fetch() here goes through CapacitorHttp (native stack, no
// browser CORS); cleartext is refused natively.
import { registerPlugin } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Clipboard } from '@capacitor/clipboard'
import { bytesToBase64, inputPick, type OutFile, type Platform, type SaveResult } from './platform'
import { fetchImageData, fetchUrl } from './fetchGuarded'

interface MediaStoreApi { saveImage(o: { name: string; mime: string; data: string }): Promise<{ uri: string; path: string; size: number }> }
const MediaStore = registerPlugin<MediaStoreApi>('MediaStore')

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const safeName = (n: string) => n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120) || 'esb-file'

async function toCache(f: OutFile): Promise<string> {
  const w = await Filesystem.writeFile({ path: `out/${Date.now()}-${safeName(f.name)}`, data: bytesToBase64(f.bytes), directory: Directory.Cache, recursive: true })
  return w.uri
}

export const androidPlatform: Platform = {
  kind: 'android',
  pickFiles: ({ accept, multiple }) => inputPick(accept, !!multiple),
  async takePhoto() {
    try {
      const p = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 92, correctOrientation: true, saveToGallery: false })
      if (!p.webPath) return null
      const blob = await (await fetch(p.webPath)).blob()
      return new File([blob], `camera-${Date.now()}.${p.format || 'jpg'}`, { type: blob.type || 'image/jpeg' })
    } catch (e) {
      if (/cancel/i.test(msg(e))) return null
      throw new Error(`Camera: ${msg(e)}`)
    }
  },
  async saveFile(f): Promise<SaveResult> {
    try {
      const r = await MediaStore.saveImage({ name: safeName(f.name), mime: f.mime, data: bytesToBase64(f.bytes) })
      if (!(r.size > 0)) return { ok: false, error: 'The saved file is empty.', canShare: true }
      return { ok: true, path: r.path }
    } catch (e) {
      return { ok: false, error: `${msg(e)} Use Share and pick Save to device instead.`, canShare: true }
    }
  },
  async shareFiles(files, title) {
    try {
      const uris = await Promise.all(files.map(toCache))
      await Share.share({ files: uris, dialogTitle: title })
      return 'shared'
    } catch (e) {
      if (/cancel/i.test(msg(e))) return 'cancelled'
      throw new Error(`Sharing failed: ${msg(e)}`)
    }
  },
  async shareText(text, title) {
    try { await Share.share({ text, dialogTitle: title }); return 'shared' } catch (e) {
      if (/cancel/i.test(msg(e))) return 'cancelled'
      throw new Error(`Sharing failed: ${msg(e)}`)
    }
  },
  async copyText(text) { try { await Clipboard.write({ string: text }); return true } catch { try { await navigator.clipboard.writeText(text); return true } catch { return false } } },
  fetchUrl,
  fetchImageData,
  // only web links leave the app (never javascript:, intent: or file: from a feed, the site or an API answer)
  async openExternal(url) { if (/^https?:\/\//i.test(url)) window.open(url, '_system', 'noopener') },
}
