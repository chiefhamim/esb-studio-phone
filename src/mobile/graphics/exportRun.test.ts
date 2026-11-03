import { describe, expect, it } from 'vitest'
import { defaultDoc } from '../../pc/core/templates'
import { DEFAULT_SETTINGS, planJobs } from '../../pc/export'
import type { ExportSettings } from '../../pc/export'
import type { Assets } from '../../pc/core/render'
import { activePreset, applyPreset, Cancelled, insertToken, mimeOf, renderAll, toggleIn, toggleScale, totalMegapixels } from './exportRun'
import type { Render } from './exportRun'

const base = {} as Assets
const fakeRender: Render = async (_d, f, _b, scale, type) => new Blob([`${f}@${scale}.${type}`], { type: mimeOf(type) })
const settings = (p: Partial<ExportSettings> = {}): ExportSettings => ({ ...DEFAULT_SETTINGS, ...p })

describe('phone export run (PC engine)', () => {
  it('renders one file per planned job with the PC file names', async () => {
    const doc = defaultDoc()
    const s = settings({ formats: ['fb45', 'web'], scales: [1, 2] })
    const progress: number[] = []
    const files = await renderAll(doc, base, s, (p) => progress.push(p.done), undefined, fakeRender)
    expect(files.map((f) => f.name)).toEqual(planJobs(doc, s).map((j) => j.name))
    expect(files).toHaveLength(4)
    expect(files[0].mime).toBe('image/png')
    expect(new TextDecoder().decode(files[0].bytes)).toBe('fb45@1.png')
    expect(progress.at(-1)).toBe(4)
  })
  it('bundles into one ZIP when asked', async () => {
    const files = await renderAll(defaultDoc(), base, settings({ zip: true, formats: ['fb45', 'sq'] }), () => undefined, undefined, fakeRender)
    expect(files).toHaveLength(1)
    expect(files[0].mime).toBe('application/zip')
    expect(files[0].name).toMatch(/\.zip$/)
    // local file header signature "PK\3\4"
    expect([...files[0].bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  })
  it('uses the JPG / WebP mime types', async () => {
    const files = await renderAll(defaultDoc(), base, settings({ type: 'jpeg', formats: ['sq'] }), () => undefined, undefined, fakeRender)
    expect(files[0].mime).toBe('image/jpeg')
    expect(files[0].name).toMatch(/\.jpg$/)
  })
  it('stops when cancelled', async () => {
    const signal = { cancelled: false }
    const r: Render = async (...a) => { signal.cancelled = true; return fakeRender(...a) }
    await expect(renderAll(defaultDoc(), base, settings({ formats: ['fb45', 'web'] }), () => undefined, signal, r)).rejects.toBeInstanceOf(Cancelled)
  })
  it('refuses an empty plan', async () => {
    await expect(renderAll(defaultDoc(), base, settings({ formats: [] }), () => undefined, undefined, fakeRender)).rejects.toThrow(/Nothing to export/)
  })
  it('settings helpers mirror the PC dialog', () => {
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleScale([2, 1], 0.5)).toEqual([0.5, 1, 2])
    const s = applyPreset(settings(), 'whatsapp')
    expect(s.type).toBe('jpeg')
    expect(activePreset(s)).toBe('whatsapp')
    expect(insertToken('ESB_', 'date')).toBe('ESB_{date}')
    expect(insertToken('A-B', 'w', 1, 2)).toBe('A{w}B')
    expect(totalMegapixels([{ format: 'sq', scale: 1, name: 'x', w: 1000, h: 1000 }])).toBe(1)
  })
})
