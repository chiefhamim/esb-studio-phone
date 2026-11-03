// Saving and sharing exported files through the platform layer, reporting exactly what the platform answered.
import { platform } from '../../platform/platform'
import type { OutFile } from '../../platform/platform'
import { snack } from '../shell/core'

export interface Result { file: OutFile; state: 'pending' | 'saving' | 'saved' | 'failed'; path?: string; error?: string; canShare?: boolean }

/** Save files one by one; returns the per-file outcome exactly as the platform reported it. */
export async function saveFiles(files: OutFile[], onEach?: (i: number, r: Result) => void): Promise<Result[]> {
  const out: Result[] = []
  for (let i = 0; i < files.length; i++) {
    onEach?.(i, { file: files[i], state: 'saving' })
    let r: Result
    try {
      const s = await platform().saveFile(files[i])
      r = s.ok ? { file: files[i], state: 'saved', path: s.path } : { file: files[i], state: 'failed', error: s.error, canShare: s.canShare }
    } catch (e) {
      r = { file: files[i], state: 'failed', error: e instanceof Error ? e.message : String(e), canShare: true }
    }
    out.push(r)
    onEach?.(i, r)
  }
  return out
}

export async function shareOut(files: OutFile[]) {
  try {
    const r = await platform().shareFiles(files, files.length === 1 ? files[0].name : `${files.length} banners`)
    if (r === 'cancelled') snack('Share cancelled')
  } catch (e) { snack('Could not share: ' + (e instanceof Error ? e.message : String(e)), { tone: 'error' }) }
}

