import { describe, expect, it } from 'vitest'
import { planMigration, storyFromOld, readOldDrafts } from './migrateDrafts'
import { storyTitle, hasContent } from '../../pc/editorial/storyQueue'
import { scopeCss, topLevel } from '../../../tools/pc-css-scope'

const OLD = JSON.stringify([
  { id: 'a', sourceUrl: 'https://www.prothomalo.com/x', source: 'প্রথম অনুচ্ছেদ ৫০০ মেগাওয়াট।\n\nদ্বিতীয় অনুচ্ছেদ।', headline: '', deck: '', body: '', category: 'Renewables & Nuclear', slug: '', translated: false, updatedAt: 1000 },
  { id: 'b', sourceUrl: '', source: '', headline: 'Untitled', deck: 'Deck', body: 'Body text', category: '', slug: 'untitled', translated: true, updatedAt: 2000 },
  { id: 'c', sourceUrl: '', source: '', headline: '', deck: '', body: '', category: '', slug: '', translated: false, updatedAt: 3000 },
])

describe('old phone drafts -> PC story queue', () => {
  it('keeps every typed character and the category', () => {
    const [a] = readOldDrafts(OLD)
    const s = storyFromOld(a)
    expect(s.snapshot.source?.rawText).toBe('প্রথম অনুচ্ছেদ ৫০০ মেগাওয়াট।\n\nদ্বিতীয় অনুচ্ছেদ।')
    expect(s.snapshot.source?.paragraphs).toEqual(['প্রথম অনুচ্ছেদ ৫০০ মেগাওয়াট।', 'দ্বিতীয় অনুচ্ছেদ।'])
    expect(s.snapshot.source?.url).toBe('https://www.prothomalo.com/x')
    expect(hasContent(s.snapshot)).toBe(true)
    const b = storyFromOld(readOldDrafts(OLD)[1])
    expect(b.snapshot.draft).toMatchObject({ headline: 'Untitled', deck: 'Deck', body: 'Body text', slug: 'untitled' })
    expect(storyTitle(b.snapshot)).toBe('Untitled')
  })

  it('adds non-empty drafts once, skips empties, never duplicates on a second run', () => {
    const r1 = planMigration(OLD, null, null, null)
    expect(r1.added).toBe(2)
    expect(r1.queue.stories.map((s) => s.id)).toEqual(['m-b', 'm-a'])
    expect(r1.meta['m-a'].categoryName).toBe('Renewables & Nuclear')
    const r2 = planMigration(OLD, JSON.stringify(r1.queue), JSON.stringify(r1.migrated), JSON.stringify(r1.meta))
    expect(r2.added).toBe(0)
    expect(r2.queue.stories).toHaveLength(2)
  })

  it('never overwrites a story the editor has changed since', () => {
    const r1 = planMigration(OLD, null, null, null)
    const edited = { ...r1.queue, stories: r1.queue.stories.map((s) => (s.id === 'm-b' ? { ...s, snapshot: { ...s.snapshot, draft: { ...s.snapshot.draft, headline: 'Edited on the new screens' } } } : s)) }
    const r2 = planMigration(OLD, JSON.stringify(edited), null, null) // migrated list lost: still no overwrite
    expect(r2.queue.stories.find((s) => s.id === 'm-b')?.snapshot.draft.headline).toBe('Edited on the new screens')
    expect(r2.queue.stories).toHaveLength(2)
  })

  it('keeps stories already in the queue and survives damaged values', () => {
    const existing = { stories: [{ ...storyFromOld(readOldDrafts(OLD)[1]), id: 'pc1', updatedAt: 5000 }], activeId: 'pc1' }
    const r = planMigration(OLD, JSON.stringify(existing), 'not json', '{{')
    expect(r.queue.activeId).toBe('pc1')
    expect(r.queue.stories.map((s) => s.id)).toEqual(['pc1', 'm-b', 'm-a'])
    expect(planMigration('garbage', null, null, null).added).toBe(0)
  })
})

describe('PC stylesheet scoping', () => {
  it('splits top-level statements across comments, strings and nesting', () => {
    expect(topLevel('a{b:c} /* } */ @media (x){.d{e:f}} .g{content:"}"}')).toHaveLength(3)
  })
  it('scopes rules, hoists keyframes and font-face, keeps only token declarations of page rules', () => {
    const out = scopeCss('@font-face{font-family:X;src:url(a.woff2)} @keyframes k{to{opacity:0}} body{margin:0;--x:1px} html,body{overflow:hidden} .btn{color:red} @media (max-width:1px){.btn{color:blue}}')
    const [hoisted, scoped] = out.split('@scope (.pc-host)')
    expect(hoisted).toContain('@font-face')
    expect(hoisted).toContain('@keyframes k')
    expect(hoisted).toContain('body { --x:1px; }')
    expect(hoisted).not.toContain('overflow:hidden')
    expect(scoped).toContain('.btn{color:red}')
    expect(scoped).toContain('@media (max-width:1px)')
    expect(scoped).not.toContain('overflow:hidden')
  })
})
