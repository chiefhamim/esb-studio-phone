// Parity harness: the same banner as the PC's src/golden.ts, but produced through the PHONE's export path
// (src/pc/export.ts renderBanner, the code the phone's Export dialog runs) so the PC/phone comparison covers export too.
import { loadBaseAssets, loadImage } from '../../src/pc/core/assets'
import samplePhoto from '../../src/pc/assets/images/sample-photo.jpg'
import { defaultDoc } from '../../src/pc/core/templates'
import { renderBanner } from '../../src/pc/export'
import { imageAssets } from '../../src/pc/store'
import type { FormatId } from '../../src/pc/core/types'

declare global { interface Window { __done?: boolean; __png?: string; __err?: string } }

async function main() {
  const q = new URLSearchParams(location.search)
  const fmt = (q.get('fmt') ?? 'social') as FormatId
  const cat = q.get('cat') ?? '01'
  const base = await loadBaseAssets()
  imageAssets.sample = await loadImage(samplePhoto)
  const doc = defaultDoc()
  doc.content = {
    categoryId: cat, date: q.get('date') ?? '2026-10-18',
    headline: q.get('headline') ?? "Review Meeting Held on Progress of Power Division's Development Projects",
    highlight: q.get('hl') ?? 'Development Projects', showLinkPill: true, highlightOnSocial: false,
    credit: q.get('credit') ?? '', creditPos: 'bl', creditSize: 24, creditColor: '#ffffff', creditFont: 'inter', creditChip: false,
    label: (q.get('label') ?? 'none') as 'none' | 'breaking' | 'featured' | 'trending' | 'custom', labelText: '', labelPos: 'tl', labelScale: 1, labelColor: '#dc2828', caption: null,
  }
  for (const f of Object.keys(doc.photos.slots) as FormatId[]) doc.photos.slots[f] = [{ src: 'sample', zoom: 1, panX: 0, panY: 0 }]
  const blob = await renderBanner(doc, fmt, base, 1, 'png', 1)
  window.__png = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob) })
  window.__done = true
}
main().catch((e) => { window.__err = String(e && e.stack ? e.stack : e); window.__done = true })
