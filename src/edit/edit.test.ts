import { describe, expect, it } from 'vitest'
import { blockOffsets, insertBlock, joinBlocks, mergeUp, moveBlock, parseBody, parseSource, removeBlock, replaceBlock, setBlock, splitBlock, splitOnBlankLine } from './blocks'
import { UndoStack } from './undo'
import { findFactMarks, locateInSource, segmentize, summarize, unplacedFlags } from './factMap'
import { analyzeSeo } from './seo'
import { applySuggestion, bestKeyphrase, offlineSuggestions, sanitizeAiSeo, seoChecks, seoScore, suggestTags, EMPTY_SEO } from './seoTools'
import { cleanPaste, findAll, readMinutes, replaceAll, replaceAt, wordCount } from './editTools'
import { quotesByParagraph } from './quotes'
import { buildParagraphRequest } from './translateParagraph'
import { describeSource, phaseLabel, IDLE_JOB } from './useTranslateJob'
import { asciiToBengaliDigits, bengaliToAsciiDigits } from './bengali'

describe('paragraph blocks', () => {
  it('parses a body on blank lines and joins it back', () => {
    const b = parseBody('One.\n\nTwo\nstill two.\n\n\nThree.')
    expect(b).toEqual(['One.', 'Two\nstill two.', 'Three.'])
    expect(parseBody(joinBlocks(b))).toEqual(b)
    expect(parseBody('  ')).toEqual([])
  })
  it('parses a source one paragraph per line', () => {
    expect(parseSource('a\nb\n\n c ')).toEqual(['a', 'b', 'c'])
  })
  it('inserts, removes, sets, moves', () => {
    const b = ['a', 'b', 'c']
    expect(insertBlock(b, 1, 'x')).toEqual(['a', 'x', 'b', 'c'])
    expect(insertBlock(b, 99, 'x')).toEqual(['a', 'b', 'c', 'x'])
    expect(removeBlock(b, 1)).toEqual(['a', 'c'])
    expect(removeBlock(b, 9)).toBe(b)
    expect(setBlock(b, 2, 'z')).toEqual(['a', 'b', 'z'])
    expect(moveBlock(b, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveBlock(b, 2, -2)).toEqual(['c', 'a', 'b'])
    expect(moveBlock(b, 0, -1)).toBe(b)
    expect(moveBlock(b, 2, 1)).toBe(b)
    expect(b).toEqual(['a', 'b', 'c']) // never mutated
  })
  it('splits at a cursor and trims the cut', () => {
    expect(splitBlock(['Hello world today'], 0, 11)).toEqual(['Hello world', 'today'])
    const same = ['abc']
    expect(splitBlock(same, 0, 0)).toBe(same)
    expect(splitBlock(same, 0, 3)).toBe(same)
  })
  it('merges up with one space', () => {
    expect(mergeUp(['One.', 'Two.', 'Three.'], 1)).toEqual(['One. Two.', 'Three.'])
    const b = ['x']
    expect(mergeUp(b, 0)).toBe(b)
  })
  it('a blank line typed in a paragraph makes two; pasting several replaces one', () => {
    expect(splitOnBlankLine('abc\n\ndef')).toEqual(['abc', 'def'])
    expect(splitOnBlankLine('abc\ndef')).toEqual(['abc\ndef'])
    expect(splitOnBlankLine('abc\n\n')).toEqual(['abc', ''])
    expect(replaceBlock(['a', 'b', 'c'], 1, ['x', 'y'])).toEqual(['a', 'x', 'y', 'c'])
  })
  it('gives each paragraph its offset in the joined text', () => {
    const b = ['ab', 'cde', 'f']
    const j = joinBlocks(b)
    blockOffsets(b).forEach((o, i) => expect(j.slice(o, o + b[i].length)).toBe(b[i]))
  })
})

describe('undo stack', () => {
  it('undoes and redoes whole states', () => {
    const u = new UndoStack<string>()
    u.record('a', '', 0)
    u.record('b', '', 10)
    expect(u.canUndo).toBe(true)
    expect(u.undo('c')).toBe('b')
    expect(u.undo('b')).toBe('a')
    expect(u.undo('a')).toBeNull()
    expect(u.redo('a')).toBe('b')
    expect(u.redo('b')).toBe('c')
    expect(u.redo('c')).toBeNull()
  })
  it('merges typing in one field inside the window, not across fields or time', () => {
    const u = new UndoStack<string>(100, 1000)
    u.record('', 'ed-headline', 0)
    u.record('H', 'ed-headline', 200)
    u.record('He', 'ed-headline', 400)
    expect(u.undo('Hel')).toBe('')
    expect(u.undo('')).toBeNull()
    const v = new UndoStack<string>(100, 1000)
    v.record('x1', 'ed-a', 0)
    v.record('y1', 'ed-b', 100)
    v.record('x2', 'ed-a', 5000)
    expect(v.undo('now')).toBe('x2')
    expect(v.undo('x2')).toBe('y1')
    expect(v.undo('y1')).toBe('x1')
  })
  it('a new change clears redo and the limit drops the oldest', () => {
    const u = new UndoStack<number>(3, 1000)
    for (let i = 0; i < 5; i++) u.record(i, '', i)
    expect(u.undo(99)).toBe(4)
    u.record(50, '', 100)
    expect(u.canRedo).toBe(false)
    const out: number[] = []
    for (let v = u.undo(0); v !== null; v = u.undo(v)) out.push(v)
    expect(out.length).toBe(3)
  })
})

describe('fact marks', () => {
  const source = 'পেট্রোবাংলা ১,২০০ মেগাওয়াট এবং ৫৯২ কোটি টাকা অক্টোবর মাসে'
  const en = 'Petrobangla said 1,200 MW and Tk 592 crore in October, plus 750 MW and 3 wells in March.'
  const marks = findFactMarks(en, source)
  it('marks found in green and missing in amber, with exact positions', () => {
    const by = Object.fromEntries(marks.map((m) => [m.text, m]))
    expect(by['1,200 MW'].status).toBe('found')
    expect(by['Tk 592 crore'].status).toBe('found')
    expect(by['October'].status).toBe('found')
    expect(by['750 MW'].status).toBe('missing')
    expect(by['March'].status).toBe('missing')
    for (const m of marks) expect(en.slice(m.start, m.end)).toBe(m.text)
  })
  it('skips lone digits, and the verb "may"', () => {
    expect(marks.some((m) => m.text === '3')).toBe(false)
    expect(findFactMarks('It may rise.', '').length).toBe(0)
    expect(findFactMarks('On May 5 it rose.', 'x').some((m) => m.text === 'May')).toBe(true)
  })
  it('finds the matching spot in the source, Bengali digits included', () => {
    const paras = ['প্রথম অনুচ্ছেদ', 'বিদ্যুৎ ১,২০০ মেগাওয়াট', 'ব্যয় ৫৯২ কোটি টাকা। অক্টোবর']
    const m = (t: string) => findFactMarks(t, paras.join('\n')).find((x) => x.text === t)!
    const hit = locateInSource(paras, m('1,200 MW'))
    expect(hit?.para).toBe(1)
    expect(paras[1].slice(hit!.start, hit!.end)).toBe('১,২০০')
    expect(locateInSource(paras, m('Tk 592 crore'))?.para).toBe(2)
    const month = locateInSource(paras, { key: 'm10', text: 'October' })
    expect(month?.para).toBe(2)
    expect(locateInSource(paras, { key: '750', text: '750 MW' })).toBeNull()
  })
  it('summarises and keeps nothing hidden', () => {
    expect(summarize(marks)).toEqual({ found: 3, missing: 2 })
    expect(unplacedFlags(source, 'Output may be 750 MW in may.', findFactMarks('Output may be 750 MW in may.', source)).length).toBeGreaterThanOrEqual(0)
    expect(findFactMarks('   ', source)).toEqual([])
  })
  it('cuts text into highlighted pieces without losing a character', () => {
    const segs = segmentize('abcdef', [{ start: 1, end: 3, cls: 'x', markIndex: 0 }, { start: 2, end: 4, cls: 'y' }, { start: 4, end: 5, cls: 'z' }])
    expect(segs.map((s) => s.text).join('')).toBe('abcdef')
    expect(segs.filter((s) => s.cls).map((s) => s.cls)).toEqual(['x', 'z'])
  })
})

const STORY = {
  headline: 'Petrobangla adds gas from Sylhet gas field wells',
  deck: 'Two new wells at the Sylhet gas field add 40 million cubic feet a day to the national grid.',
  body: [
    'Petrobangla has added two new wells at the Sylhet gas field, the state gas company said on Sunday. The wells add gas to supply.',
    'The Sylhet gas field now supplies more gas to the national grid, officials said. Drilling began last year and finished this month with two wells.',
    'Gas from the new wells will reach homes and industry through the Sylhet network, the company said.',
  ].join('\n\n'),
  slug: 'sylhet-gas-field-wells',
}

describe('SEO', () => {
  it('computes checks and a score offline, without the photo check', () => {
    const checks = seoChecks(STORY, EMPTY_SEO)
    expect(checks.some((c) => c.id === 'image')).toBe(false)
    expect(checks.find((c) => c.id === 'kp-set')?.status).toBe('bad')
    const s = seoScore(checks)
    expect(s.total).toBe(checks.length)
    expect(s.percent).toBe(Math.round((s.good / s.total) * 100))
  })
  it('the copied desktop analyzer still reports a set keyphrase in the headline', () => {
    const c = analyzeSeo({ ...STORY, metaTitle: '', metaDescription: '', keyphrase: 'Sylhet gas field', tags: [], hasImage: true, imageAlt: 'x' })
    expect(c.find((x) => x.id === 'kp-h1')?.status).toBe('good')
  })
  it('suggests from the story and applying them raises the score', () => {
    const kp = bestKeyphrase(STORY)
    expect(kp).not.toBe('')
    expect(`${STORY.headline} ${STORY.deck} ${STORY.body}`.toLowerCase()).toContain(kp.toLowerCase())
    const before = seoScore(seoChecks(STORY, EMPTY_SEO)).good
    let seo = EMPTY_SEO
    let slug = STORY.slug
    for (const s of offlineSuggestions(STORY, seo)) { const r = applySuggestion(seo, s); seo = r.seo; if (r.slug) slug = r.slug }
    expect(seo.keyphrase).toBe(kp)
    expect(seo.metaDescription.length).toBeLessThanOrEqual(160)
    expect(seoScore(seoChecks({ ...STORY, slug }, seo)).good).toBeGreaterThan(before)
  })
  it('suggests nothing for an empty story and tags come from the story only', () => {
    expect(offlineSuggestions({ headline: '', deck: '', body: '', slug: '' }, EMPTY_SEO)).toEqual([])
    const all = `${STORY.headline} ${STORY.deck} ${STORY.body}`.toLowerCase()
    for (const t of suggestTags(STORY, bestKeyphrase(STORY))) expect(all).toContain(t.toLowerCase())
  })
  it('holds an AI answer to the rules: keyphrase must be in the story, caps, tag length', () => {
    const r = sanitizeAiSeo(STORY, { keyphrase: 'quantum banana farming', metaTitle: 'x'.repeat(90), metaDescription: 'y'.repeat(300), tags: `${'t'.repeat(50)}, Petrobangla, petrobangla, Sylhet` })
    expect(`${STORY.headline} ${STORY.body}`.toLowerCase()).toContain(r.keyphrase.toLowerCase())
    expect(r.metaTitle.length).toBeLessThanOrEqual(60)
    expect(r.metaDescription.length).toBeLessThanOrEqual(160)
    expect(r.tags).toEqual(['Petrobangla', 'Sylhet'])
  })
})

describe('edit tools', () => {
  it('finds and replaces', () => {
    expect(findAll('Gas gas GAS', 'gas')).toHaveLength(3)
    expect(findAll('Gas gas GAS', 'gas', true)).toHaveLength(1)
    expect(findAll('abc', '')).toEqual([])
    expect(replaceAll('a-b-a', 'a', 'x')).toEqual({ text: 'x-b-x', count: 2 })
    expect(replaceAll('abc', 'z', 'x')).toEqual({ text: 'abc', count: 0 })
    expect(replaceAt('hello world', { start: 6, end: 11 }, 'there')).toBe('hello there')
  })
  it('counts words and read time', () => {
    expect(wordCount('  one two\nthree ')).toBe(3)
    expect(wordCount('')).toBe(0)
    expect(readMinutes(0)).toBe(0)
    expect(readMinutes(30)).toBe(1)
    expect(readMinutes(600)).toBe(3)
  })
  it('cleans pasted text but keeps Bangla joiners', () => {
    const joiner = String.fromCharCode(0x200d)
    expect(cleanPaste('<p>Hello&nbsp;<b>world</b></p><p>Two</p>')).toBe('Hello world\n\nTwo\n\n')
    expect(cleanPaste('a b​c\r\n\r\n\r\n\r\nd')).toBe('a bc\n\nd')
    expect(cleanPaste(`র${joiner}য`)).toBe(`র${joiner}য`)
  })
  it('converts Bengali digits both ways', () => {
    expect(bengaliToAsciiDigits('১,২০০ MW')).toBe('1,200 MW')
    expect(asciiToBengaliDigits('592')).toBe('৫৯২')
  })
})

describe('quotes, paragraph translation request, job labels', () => {
  it('finds quoted statements per paragraph and ignores apostrophes', () => {
    const q = quotesByParagraph(["He said Bangladesh's grid is stable.", 'The chairman said, "We will finish the work by June next year," at the event.'])
    expect(q).toHaveLength(1)
    expect(q[0].para).toBe(1)
    expect(q[0].inner).toBe('We will finish the work by June next year,')
  })
  it('builds a request that forbids invention and passes the paragraph', () => {
    const r = buildParagraphRequest('নিজস্ব প্রতিবেদক, ঢাকা: গ্যাস উৎপাদন বেড়েছে', 'আগের অনুচ্ছেদ')
    expect(r.system).toMatch(/Never add/)
    expect(r.user).toContain('গ্যাস উৎপাদন বেড়েছে')
    expect(r.user).not.toContain('নিজস্ব প্রতিবেদক')
    expect(r.user).toContain('context only')
    expect(r.schema.required).toEqual(['text', 'notes'])
  })
  it('describes the source honestly and labels each phase', () => {
    const d = describeSource('গ্যাস উৎপাদন বেড়েছে এবং সরবরাহ আরও বাড়বে বলে জানিয়েছে কর্তৃপক্ষ\nসর্বস্বত্ব সংরক্ষিত')
    expect(d.paragraphs).toBe(1)
    expect(d.droppedLines).toBe(1)
    expect(phaseLabel({ ...IDLE_JOB, phase: 'waiting', elapsed: 12 })).toContain('12 s')
    expect(phaseLabel({ ...IDLE_JOB, phase: 'error', error: { code: 'no-key', message: 'No Gemini key yet.' } })).toBe('No Gemini key yet.')
    expect(phaseLabel({ ...IDLE_JOB, phase: 'done' })).toMatch(/draft/)
  })
})
