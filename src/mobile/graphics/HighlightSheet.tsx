// Headline → Highlight, made for the thumb. The headline is split into its words; tap the words to highlight and the
// phrase from the first to the last tapped word becomes the highlighted phrase (the banner highlights one phrase, the
// same field as the PC's "Highlighted phrase"). Opened from the canvas tray (tap the headline) and from the Menu.
import { useMemo } from 'react'
import { useStore } from '../../pc/store'
import { suggestHighlight } from '../../pc/core/newsroom'
import { Button, Icon, Sheet } from '../shell/ui'
import { useUi } from '../shell/core'

export const HIGHLIGHT_SHEET = 'gx-highlight'
export const openHighlight = () => useUi.getState().openSheet(HIGHLIGHT_SHEET)

/** Words of the headline with their position; punctuation stays with its word. */
export function headlineWords(headline: string): string[] {
  return headline.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}

/** Which word indexes the current phrase covers (the first place it occurs), or none. */
export function phraseRange(words: string[], phrase: string): [number, number] | null {
  const p = headlineWords(phrase)
  if (!p.length) return null
  for (let i = 0; i + p.length <= words.length; i++) {
    if (p.every((w, k) => words[i + k] === w)) return [i, i + p.length - 1]
  }
  return null
}

export function HighlightSheet() {
  const headline = useStore((s) => s.doc.content.headline)
  const highlight = useStore((s) => s.doc.content.highlight)
  const onSocial = useStore((s) => s.doc.content.highlightOnSocial)
  const set = (patch: Record<string, unknown>) => useStore.getState().setContent(patch)
  const words = useMemo(() => headlineWords(headline), [headline])
  const range = phraseRange(words, highlight || '')
  const tap = (i: number) => {
    let a: number, b: number
    if (!range) { a = i; b = i }
    else if (i < range[0]) { a = i; b = range[1] }
    else if (i > range[1]) { a = range[0]; b = i }
    else if (i === range[0] && i === range[1]) { set({ highlight: '' }); return }
    else if (i === range[0]) { a = i + 1; b = range[1] }
    else if (i === range[1]) { a = range[0]; b = i - 1 }
    else { a = range[0]; b = i } // tapping inside shortens the phrase to end here
    set({ highlight: words.slice(a, b + 1).join(' ') })
  }
  return (
    <Sheet id={HIGHLIGHT_SHEET} title="Highlight" initial="half">
      <div className="hl">
        <p className="hl-help">Tap the words to highlight. The phrase runs from the first to the last word you tap; tap an end again to shorten it.</p>
        {words.length ? (
          <div className="hl-words" role="group" aria-label="Headline words">
            {words.map((w, i) => {
              const on = !!range && i >= range[0] && i <= range[1]
              const edge = on && (i === range![0] ? ' is-start' : '') + (i === range![1] ? ' is-end' : '')
              return <button key={i} type="button" className={'hl-word' + (on ? ' is-on' + edge : '')} aria-pressed={on} onClick={() => tap(i)}>{w}</button>
            })}
          </div>
        ) : <p className="hl-help">Write a headline first.</p>}
        <div className="hl-now">
          <Icon name="highlight" size={18} />
          <span>{highlight ? <>Highlighted: <b>{highlight}</b></> : 'Nothing highlighted'}</span>
        </div>
        <div className="hl-actions">
          <Button kind="tonal" icon="sparkle" disabled={!headline.trim()} onClick={() => set({ highlight: suggestHighlight(headline) })}>Suggest</Button>
          <Button kind="tonal" icon="x" disabled={!highlight} onClick={() => set({ highlight: '' })}>Clear</Button>
        </div>
        <label className="hl-switch">
          <span><b>On the Facebook banner too</b><small>The web banner always shows it</small></span>
          <button type="button" role="switch" aria-checked={!!onSocial} aria-label="Highlight on Facebook banner too" className={'m-switch' + (onSocial ? ' is-on' : '')} onClick={() => set({ highlightOnSocial: !onSocial })}><span /></button>
        </label>
      </div>
    </Sheet>
  )
}
