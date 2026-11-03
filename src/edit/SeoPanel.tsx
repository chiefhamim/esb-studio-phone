// Search (SEO) panel: meta fields, score, offline fixes, and an optional labelled AI draft. Nothing is applied without a tap.
import { useMemo, useRef, useState } from 'react'
import { AiError, errorMessage } from '../aiProviders'
import { cleanDescription, suggestKeyphrases, titlePixels, TITLE_MAX_PX, DESCRIPTION_MAX } from './seo'
import { aiSeoDraft, applySuggestion, offlineSuggestions, seoChecks, seoScore, snippetDescription, type SeoFields, type SeoStory, type Suggestion } from './seoTools'
import { MeterRing } from './ui'

interface Props {
  story: SeoStory
  seo: SeoFields
  /** set the SEO fields, and the slug when a suggestion changes it */
  onSeo: (next: SeoFields, slug?: string) => void
  onOpenSettings: () => void
}

const show = (v: string | string[]) => (Array.isArray(v) ? v.join(', ') : v)

export default function SeoPanel({ story, seo, onSeo, onOpenSettings }: Props) {
  const [open, setOpen] = useState(false)
  const [tag, setTag] = useState('')
  const [ai, setAi] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; draft?: SeoFields; error?: string; keyProblem?: boolean }>({ status: 'idle' })
  const abort = useRef<AbortController | null>(null)

  const checks = useMemo(() => seoChecks(story, seo), [story, seo])
  const score = seoScore(checks)
  const sugg = useMemo(() => (open ? offlineSuggestions(story, seo) : []), [open, story, seo])
  const kpIdeas = useMemo(() => (open ? suggestKeyphrases(story.headline, story.deck, story.body, 5) : []), [open, story.headline, story.deck, story.body])
  const hasStory = !!(story.headline.trim() && story.body.trim())

  const title = seo.metaTitle.trim() || story.headline.trim()
  const px = Math.round(titlePixels(title))
  const desc = snippetDescription(story.deck, seo)

  const apply = (s: Suggestion) => { const r = applySuggestion(seo, s); onSeo(r.seo, r.slug) }
  const applyAll = () => {
    let cur = seo, slug: string | undefined
    for (const s of sugg) { const r = applySuggestion(cur, s); cur = r.seo; if (r.slug) slug = r.slug }
    onSeo(cur, slug)
  }
  const addTag = () => {
    const t = tag.replace(/^#/, '').trim()
    if (t && t.length <= 40 && !seo.tags.some((x) => x.toLowerCase() === t.toLowerCase())) onSeo({ ...seo, tags: [...seo.tags, t] })
    setTag('')
  }

  async function runAi() {
    abort.current?.abort()
    const ac = new AbortController(); abort.current = ac
    setAi({ status: 'running' })
    try {
      const draft = await aiSeoDraft(story, ac.signal)
      setAi({ status: 'done', draft })
    } catch (e) {
      if (ac.signal.aborted) setAi({ status: 'idle' })
      else setAi({ status: 'error', error: errorMessage(e), keyProblem: e instanceof AiError && (e.code === 'no-key' || e.code === 'bad-key') })
    }
  }

  const groups = ['Keyphrase', 'Search snippet', 'Content'] as const
  return (
    <section className="ed-card ed-seo" aria-label="Search (SEO)">
      <button type="button" className="ed-fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ed-fold-t">Search (SEO)</span>
        <span className={`ed-chip ${score.percent >= 80 ? 'ed-chip-ok' : 'ed-chip-warn'}`}>{score.good} of {score.total} checks</span>
      </button>
      {open && (
        <div className="ed-seo-body">
          <div className="ed-snippet" aria-label="How the search result looks">
            <span className="ed-snippet-t">{title || 'Headline'}</span>
            <span className="ed-snippet-u">esbpowerline.com &rsaquo; articles &rsaquo; {story.slug || 'slug'}</span>
            <span className="ed-snippet-d">{desc || 'No description yet.'}</span>
            {px > TITLE_MAX_PX && <span className="ed-warn">The title is too wide and Google will cut it.</span>}
          </div>

          <label className="ed-lab" htmlFor="ed-kp">Focus keyphrase</label>
          <input id="ed-kp" className="ed-input" value={seo.keyphrase} onChange={(e) => onSeo({ ...seo, keyphrase: e.target.value })} autoCapitalize="none" placeholder="1 to 4 words readers search for" />
          {kpIdeas.length > 0 && (
            <div className="ed-chips" aria-label="Keyphrases from this story">
              {kpIdeas.map((k) => <button key={k.phrase} type="button" className="ed-chip ed-chip-btn" onClick={() => onSeo({ ...seo, keyphrase: k.phrase })}>{k.phrase}</button>)}
            </div>
          )}

          <label className="ed-lab" htmlFor="ed-mt">SEO title <span className="ed-count">{[...title].length}/60 · empty uses the headline</span></label>
          <input id="ed-mt" className="ed-input" value={seo.metaTitle} onChange={(e) => onSeo({ ...seo, metaTitle: e.target.value })} placeholder={story.headline} />

          <label className="ed-lab" htmlFor="ed-md">Meta description <span className={seo.metaDescription.length > DESCRIPTION_MAX ? 'ed-count ed-over' : 'ed-count'}>{seo.metaDescription.length}/{DESCRIPTION_MAX} · empty uses the deck</span></label>
          <textarea id="ed-md" className="ed-input ed-area" rows={3} value={seo.metaDescription} onChange={(e) => onSeo({ ...seo, metaDescription: e.target.value })} placeholder={cleanDescription(story.deck)} />

          <span className="ed-lab">Tags <span className="ed-count">{seo.tags.length} (3 to 8 is good)</span></span>
          <div className="ed-chips">
            {seo.tags.map((t) => <button key={t} type="button" className="ed-chip ed-chip-btn" aria-label={`Remove tag ${t}`} onClick={() => onSeo({ ...seo, tags: seo.tags.filter((x) => x !== t) })}>{t} &times;</button>)}
          </div>
          <div className="ed-row">
            <input className="ed-input" aria-label="New tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag" autoCapitalize="none" />
            <button type="button" className="ed-btn" onClick={addTag} disabled={!tag.trim()}>Add</button>
          </div>

          <h3 className="ed-h3">Suggestions from the story (no network)</h3>
          {sugg.length ? (
            <>
              <ul className="ed-list">
                {sugg.map((s) => (
                  <li key={s.id} className="ed-sugg">
                    <span className="ed-lab">{s.label}</span>
                    <span>{show(s.value)}</span>
                    <button type="button" className="ed-btn" onClick={() => apply(s)}>Apply</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="ed-btn" onClick={applyAll}>Apply all {sugg.length}</button>
            </>
          ) : <p className="ed-note">{hasStory ? 'Nothing to suggest: the fields these checks use are already fine.' : 'Write the headline and story first; suggestions come from them.'}</p>}

          <h3 className="ed-h3">AI draft (optional)</h3>
          <p className="ed-note">Gemini writes a draft of the keyphrase, title, description and tags from the story. It is a draft: you review each field before it is used.</p>
          <div className="ed-row">
            <button type="button" className="ed-btn" onClick={runAi} disabled={ai.status === 'running' || !hasStory}>{ai.status === 'running' ? 'Asking Gemini…' : 'Ask Gemini for a draft'}</button>
            {ai.status === 'running' && <button type="button" className="ed-btn ed-btn-quiet" onClick={() => abort.current?.abort()}>Cancel</button>}
          </div>
          {ai.status === 'error' && (
            <p className="ed-err" role="alert">{ai.error} {ai.keyProblem && <button type="button" className="ed-btn" onClick={onOpenSettings}>Open Settings</button>}</p>
          )}
          {ai.status === 'done' && ai.draft && (
            <div className="ed-aidraft" aria-label="AI draft">
              <span className="ed-chip ed-chip-ai">AI draft · review before use</span>
              {([['keyphrase', 'Focus keyphrase', ai.draft.keyphrase], ['metaTitle', 'SEO title', ai.draft.metaTitle], ['metaDescription', 'Meta description', ai.draft.metaDescription], ['tags', 'Tags', ai.draft.tags.join(', ')]] as const).map(([k, label, v]) => v ? (
                <div key={k} className="ed-sugg">
                  <span className="ed-lab">{label}</span>
                  <span>{v}</span>
                  <button type="button" className="ed-btn" onClick={() => { const d = ai.draft as SeoFields; onSeo({ ...seo, [k]: k === 'tags' ? d.tags : v }) }}>Use</button>
                </div>
              ) : null)}
              <div className="ed-row">
                <button type="button" className="ed-btn" onClick={() => { const d = ai.draft as SeoFields; onSeo({ metaTitle: d.metaTitle || seo.metaTitle, metaDescription: d.metaDescription || seo.metaDescription, keyphrase: d.keyphrase || seo.keyphrase, tags: d.tags.length ? d.tags : seo.tags }); setAi({ status: 'idle' }) }}>Use all</button>
                <button type="button" className="ed-btn ed-btn-quiet" onClick={() => setAi({ status: 'idle' })}>Discard</button>
              </div>
            </div>
          )}

          <h3 className="ed-h3">Checks</h3>
          {groups.map((g) => (
            <div key={g}>
              <span className="ed-lab">{g}</span>
              <ul className="ed-checks">
                {checks.filter((c) => c.group === g).map((c) => (
                  <li key={c.id} className={`ed-check-${c.status === 'good' ? 'ok' : c.status === 'warn' ? 'warn' : 'bad'}`}>
                    <span className="ed-mk" aria-hidden="true">{c.status === 'good' ? 'OK' : c.status === 'warn' ? 'Check' : 'Fix'}</span>
                    <span><b>{c.label}</b><br />{c.detail}{c.status !== 'good' && c.why ? <><br /><small>{c.why}</small></> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="ed-row"><MeterRing value={score.good} max={score.total} size={36} label={`${score.percent} percent`}>{score.percent}</MeterRing><span className="ed-note">Checks are computed from the story on the phone. A good score does not make the story true or important.</span></div>
        </div>
      )}
    </section>
  )
}
