// The typed platform layer: everything the app needs from the device, behind one interface.
//   android.ts  Capacitor (installed APK)
//   web.ts      a plain browser (vite dev / preview, Playwright)
// The vendored PC code never calls this directly: it calls window.esb, which src/platform/esbShim.ts maps here.
import { Capacitor } from '@capacitor/core'
import type { EsbFetchImageDataResult, EsbFetchUrlResult } from '../pc/esb'

export interface OutFile { name: string; bytes: Uint8Array; mime: string }

export type SaveResult = { ok: true; path: string } | { ok: false; error: string; canShare: boolean }

export interface Platform {
  kind: 'android' | 'web'
  /** Gallery / document picker. `accept` like ['image/*'] or ['application/pdf', '.docx']. Resolves [] when cancelled. */
  pickFiles(opts: { accept: string[]; multiple?: boolean }): Promise<File[]>
  /** Camera. Null when cancelled or not available. */
  takePhoto(): Promise<File | null>
  /** Save into the phone's shared storage (Pictures/ESB Studio, Download/ESB Studio for ZIP). */
  saveFile(f: OutFile): Promise<SaveResult>
  /** Share sheet with one or more files. */
  shareFiles(files: OutFile[], title: string): Promise<'shared' | 'cancelled'>
  shareText(text: string, title: string): Promise<'shared' | 'cancelled'>
  copyText(text: string): Promise<boolean>
  /** Fetch a public page/feed for the editor (link extraction, wire). Never throws. */
  fetchUrl(url: string, opts?: { timeoutMs?: number; allowedTypes?: string[] }): Promise<EsbFetchUrlResult>
  /** Fetch a public picture as a data URL. Never throws. */
  fetchImageData(url: string, opts?: { timeoutMs?: number }): Promise<EsbFetchImageDataResult>
  /** Open a web page outside the app (system browser). */
  openExternal(url: string): Promise<void>
}

let impl: Platform | null = null

export async function loadPlatform(): Promise<Platform> {
  if (impl) return impl
  impl = Capacitor.isNativePlatform() ? (await import('./android')).androidPlatform : (await import('./web')).webPlatform
  return impl
}

/** The platform, once loadPlatform() has run at boot. */
export function platform(): Platform {
  if (!impl) throw new Error('platform not loaded yet (call loadPlatform() at boot)')
  return impl
}

/** Tests only. */
export function _setPlatformForTests(p: Platform | null) { impl = p }

/** <input type=file> picker; works in a browser and in the Android WebView (Capacitor provides the file chooser). */
export function inputPick(accept: string[], multiple: boolean, capture?: 'environment'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept.join(',')
    input.multiple = multiple
    if (capture) input.setAttribute('capture', capture)
    input.style.display = 'none'
    let settled = false
    const done = (files: File[]) => { if (settled) return; settled = true; input.remove(); resolve(files) }
    input.addEventListener('change', () => done([...(input.files ?? [])]))
    input.addEventListener('cancel', () => done([]))
    document.body.appendChild(input)
    input.click()
  })
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(bin)
}
