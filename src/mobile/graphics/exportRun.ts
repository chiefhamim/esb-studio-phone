// The phone's export run, built only on the PC export engine (src/pc/export.ts): planJobs names and sizes the files,
// renderBanner draws them with the PC renderer, makeZip bundles them. Unlike the PC's runExport it does not write
// anywhere itself: it returns the files, and the screen saves (MediaStore) or shares each one through the platform
// layer, reporting the platform's own answer per file (never a "saved" the phone did not confirm).
import { PRESETS, makeZip, planJobs, renderBanner, zipNameFor } from '../../pc/export'
import type { ExportJob, ExportSettings, ExportType } from '../../pc/export'
import type { Assets } from '../../pc/core/render'
import type { Doc, FormatId } from '../../pc/core/types'
import type { OutFile } from '../../platform/platform'

export const mimeOf = (t: ExportType) => (t === 'jpeg' ? 'image/jpeg' : t === 'webp' ? 'image/webp' : 'image/png')

export type Render = (doc: Doc, format: FormatId, base: Assets, scale: number, type: ExportType, quality: number) => Promise<Blob>

export interface Progress { done: number; total: number; label: string }

export class Cancelled extends Error { constructor() { super('Export cancelled') } }

/** Render every planned file (and the ZIP when asked). Throws Cancelled when `signal.cancelled` turns true between files. */
export async function renderAll(doc: Doc, base: Assets, s: ExportSettings, onProgress: (p: Progress) => void, signal: { cancelled: boolean } = { cancelled: false }, render: Render = renderBanner): Promise<OutFile[]> {
  const jobs = planJobs(doc, s)
  if (!jobs.length) throw new Error('Nothing to export: pick at least one banner and one size.')
  const total = jobs.length + (s.zip ? 1 : 0)
  const out: OutFile[] = []
  for (let i = 0; i < jobs.length; i++) {
    if (signal.cancelled) throw new Cancelled()
    const j = jobs[i]
    onProgress({ done: i, total, label: `${j.name} · ${j.w}×${j.h}` })
    await new Promise((r) => setTimeout(r, 16)) // let the progress bar paint before the heavy render
    const blob = await render(doc, j.format, base, j.scale, s.type, s.quality)
    out.push({ name: j.name, bytes: new Uint8Array(await blob.arrayBuffer()), mime: mimeOf(s.type) })
  }
  if (signal.cancelled) throw new Cancelled()
  if (s.zip) {
    onProgress({ done: jobs.length, total, label: 'Building ZIP…' })
    const zip = makeZip(out.map((f) => ({ name: f.name, data: f.bytes })))
    onProgress({ done: total, total, label: 'Done' })
    return [{ name: zipNameFor(doc), bytes: zip, mime: 'application/zip' }]
  }
  onProgress({ done: total, total, label: 'Done' })
  return out
}

// ---------------------------------------------------------------- settings helpers (the PC ExportDialog's logic)
export const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
export const toggleScale = (scales: number[], v: number) => toggleIn(scales, v).sort((a, b) => a - b)

/** The preset whose settings all match the current ones (as the PC marks it), if any. */
export function activePreset(s: ExportSettings): string | undefined {
  return PRESETS.find((p) => Object.entries(p.settings).every(([k, v]) => JSON.stringify((s as unknown as Record<string, unknown>)[k]) === JSON.stringify(v)))?.id
}

export function applyPreset(s: ExportSettings, id: string): ExportSettings {
  const p = PRESETS.find((x) => x.id === id)
  return p ? { ...s, ...p.settings } : s
}

/** Insert `{token}` into the pattern at the caret (or replace the selection). */
export function insertToken(pattern: string, token: string, start = pattern.length, end = start): string {
  return pattern.slice(0, start) + `{${token}}` + pattern.slice(end)
}

export const totalMegapixels = (jobs: ExportJob[]) => jobs.reduce((a, j) => a + j.w * j.h, 0) / 1e6
