// @vitest-environment jsdom
// The phone Editorial's own logic and the PC pieces it relies on: check counts (17 SEO, 14 social), sanitisation round
// trip, readiness, the second-tap gate, find & replace, fact marks, and that the PC story editor can be driven from
// outside (the TipTap editor on `.ProseMirror`). All data here is synthetic.
import { describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { analyzeSeo } from '../../pc/editorial/seo'
import { analyzeSocial } from '../../pc/editorial/socialChecks'
import { bodyForPublish, htmlToPlain, richOf, sanitizeBodyHtml } from '../../pc/editorial/richBody'
import { buildReadiness, triage } from '../../pc/editorial/readiness'
import { createTapGate, ARM_MS, MIN_GAP_MS } from './tapGate'
import { findInBlocks, flattenBlock } from './findText'
import { factCounts, parseParagraphWithFacts } from './factSpans'

const BODY = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} of a synthetic test story about an example solar plant that adds 120 MW to the grid at a cost of Tk 500 crore, according to the example agency.`).join('\n\n')
const DRAFT = {
  headline: 'Example solar plant adds 120 MW to the national grid',
  deck: 'A synthetic deck for the test: the example plant adds capacity at a stated cost.',
  body: BODY,
  slug: 'example-solar-plant-adds-120-mw',
  metaTitle: 'Example solar plant adds 120 MW to the grid',
  metaDescription: 'A synthetic description for the test story about an example solar plant adding 120 MW to the grid at a cost of Tk 500 crore.',
  keyphrase: 'example solar plant',
  tags: ['solar', 'grid', 'example'],
}

describe('PC check counts on a sample draft', () => {
  it('seo.ts yields 17 checks', () => {
    const checks = analyzeSeo({ ...DRAFT, hasImage: true, imageAlt: 'Solar panels' })
    expect(checks).toHaveLength(17)
    expect(new Set(checks.map((c) => c.id)).size).toBe(17)
  })
  it('the PC adds an 18th check ("Written for search") only while the meta description is empty', () => {
    const checks = analyzeSeo({ ...DRAFT, metaDescription: '', hasImage: true, imageAlt: 'Solar panels' })
    expect(checks).toHaveLength(18)
    expect(checks.some((c) => c.id === 'desc-own')).toBe(true)
  })
  it('socialChecks.ts yields 14 checks across the four channels', () => {
    const checks = analyzeSocial({ facebook: 'Example plant adds 120 MW.\n\n#Solar #Grid #ESBPowerLine', x: 'x', linkedin: 'l', telegram: 't' }, DRAFT.slug)
    expect(checks).toHaveLength(14)
    const per = (p: string) => checks.filter((c) => c.platform === p).length
    expect([per('facebook'), per('x'), per('linkedin'), per('telegram')]).toEqual([6, 3, 3, 2])
  })
})

describe('sanitisation round trip (richBody.ts)', () => {
  it('drops scripts and handlers, keeps structure, and plain text matches', () => {
    const dirty = '<h2>Head</h2><p onclick="x()">One <strong>bold</strong><script>alert(1)</script></p><img src="data:image/png;base64,AA"><ul><li><p>a</p></li></ul>'
    const clean = sanitizeBodyHtml(dirty)
    expect(clean).not.toMatch(/script|onclick|data:/)
    expect(clean).toContain('<h2>Head</h2>')
    const body = htmlToPlain(clean)
    expect(richOf({ body, bodyHtml: clean })).toBe(clean)
    // any other change to the text makes the rich copy stale: publishing falls back to plain paragraphs
    expect(richOf({ body: body + ' edited', bodyHtml: clean })).toBeNull()
    expect(bodyForPublish({ body: 'Plain one.\n\nPlain two.', bodyHtml: clean })).toBe('<p>Plain one.</p>\n<p>Plain two.</p>')
  })
})

describe('readiness (readiness.ts) as the publish badge reads it', () => {
  it('counts blockers and lets ignored checks stop counting', () => {
    const r = buildReadiness({ headline: DRAFT.headline, deck: DRAFT.deck, body: BODY, words: 300, hasImage: false, imageAlt: '', tagCount: 1, unverified: 0, seo: [], signedIn: false, siteOnline: true, canUpload: false })
    expect(r.blockers).toBe(1) // not signed in
    expect(r.state).toBe('blocked')
    const t = triage(r, new Set(['signin']))
    expect(t.blockers).toBe(0)
    expect(t.ignored.map((c) => c.id)).toEqual(['signin'])
  })
})

describe('second-tap gate (tapGate.ts)', () => {
  it('the first tap only arms; a separate second tap fires', () => {
    const g = createTapGate()
    expect(g.tap(1000)).toBe('armed')
    expect(g.tap(1000 + MIN_GAP_MS + 1)).toBe('fire')
    expect(g.armedUntil(1000 + MIN_GAP_MS + 2)).toBeNull()
  })
  it('a fast double-tap never fires', () => {
    const g = createTapGate()
    expect(g.tap(0)).toBe('armed')
    expect(g.tap(100)).toBe('ignored')
    expect(g.tap(MIN_GAP_MS + 50)).toBe('fire')
  })
  it('a second tap after the window re-arms instead of firing', () => {
    const g = createTapGate()
    g.tap(0)
    expect(g.tap(ARM_MS + 1)).toBe('armed')
  })
  it('reset disarms', () => {
    const g = createTapGate()
    g.tap(0); g.reset()
    expect(g.tap(MIN_GAP_MS + 1)).toBe('armed')
  })
})

describe('find & replace (findText.ts)', () => {
  it('finds across mark boundaries and maps to document positions', () => {
    // "Power <b>Line</b> power" in one paragraph starting at document position 1
    const b = flattenBlock([{ text: 'Power ', pos: 1 }, { text: 'Line', pos: 7 }, { text: ' power', pos: 11 }])
    expect(findInBlocks([b], 'power')).toEqual([{ from: 1, to: 6 }, { from: 12, to: 17 }])
    expect(findInBlocks([b], 'r Li')).toEqual([{ from: 5, to: 9 }])
    expect(findInBlocks([b], 'power', true)).toEqual([{ from: 12, to: 17 }])
    expect(findInBlocks([b], '')).toEqual([])
  })
})

describe('fact marks (factSpans.ts)', () => {
  it('marks figures found / not found in the source', () => {
    const spans = parseParagraphWithFacts('The plant adds 120 MW at Tk 500 crore, up from 90 MW.', [], 'source text with 120 and 500')
    const facts = spans.filter((s) => s.isFact)
    expect(facts.map((f) => [f.text.trim(), f.isVerified])).toEqual([['120 MW', true], ['Tk 500 crore', true], ['90 MW', false]])
    expect(factCounts(['adds 120 MW', 'and 77 MW'], [], '120')).toEqual({ checked: 2, unverified: 1 })
  })
})

describe('the PC story editor can be driven from the phone toolbar', () => {
  it('exposes its TipTap editor on .ProseMirror and its output stays sanitised', async () => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const { RichBodyEditor } = await import('../../pc/editorial/RichBodyEditor')
    const host = document.createElement('div')
    document.body.appendChild(host)
    let out = { html: '', plain: '' }
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(RichBodyEditor, { body: 'First paragraph.', bodyHtml: null, accent: '#00E5FF', ideas: [], onIdeas: () => {}, uploadImage: async () => ({ ok: false as const, error: 'no' }), onChange: (html: string, plain: string) => { out = { html, plain } } }))
    })
    const el = host.querySelector('.ProseMirror') as (HTMLElement & { editor?: { commands: { selectAll: () => boolean; toggleBold: () => boolean; toggleHeading: (a: { level: 2 }) => boolean } } }) | null
    expect(el?.editor).toBeTruthy()
    await act(async () => { el!.editor!.commands.selectAll(); el!.editor!.commands.toggleBold() })
    expect(out.html).toContain('<strong>First paragraph.</strong>')
    expect(out.plain).toBe('First paragraph.')
    await act(async () => { el!.editor!.commands.toggleHeading({ level: 2 }) })
    expect(out.html).toMatch(/^<h2>/)
    await act(async () => root.unmount())
  })
})
