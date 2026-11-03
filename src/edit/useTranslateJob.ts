// The translate flow as a small state machine with honest progress: what the phone can actually know.
//   preparing  the source was read and cleaned on the phone (real counts)
//   waiting    the request is with Gemini; there is no percentage to report, so the elapsed time is shown
//   checking   the answer came back and its figures are being compared with the source
//   done / error / cancelled
import { useCallback, useEffect, useRef, useState } from 'react'
import { translateStory, cleanSource, type TranslateResult } from '../translate'
import { AiError, errorMessage, type AiErrorCode } from '../aiProviders'

export type JobPhase = 'idle' | 'preparing' | 'waiting' | 'checking' | 'done' | 'error' | 'cancelled'

export interface JobState {
  phase: JobPhase
  /** seconds since the request started */
  elapsed: number
  /** counts from the cleaned source */
  paragraphs: number
  droppedLines: number
  error?: { code: AiErrorCode | 'unknown'; message: string }
}

export const IDLE_JOB: JobState = { phase: 'idle', elapsed: 0, paragraphs: 0, droppedLines: 0 }

/** Real facts about the source before sending: paragraphs kept, lines the cleaner drops. Pure. */
export function describeSource(raw: string): { paragraphs: number; droppedLines: number } {
  const lines = raw.replace(/\r/g, '').split(/\n+/).map((p) => p.trim()).filter(Boolean).length
  const kept = cleanSource(raw).split(/\n\n/).filter(Boolean).length
  return { paragraphs: kept, droppedLines: Math.max(0, lines - kept) }
}

/** Plain words for each phase (what the screen says). Pure. */
export function phaseLabel(s: JobState): string {
  switch (s.phase) {
    case 'preparing': return `Source read: ${s.paragraphs} paragraph${s.paragraphs === 1 ? '' : 's'}${s.droppedLines ? `, ${s.droppedLines} boilerplate line${s.droppedLines === 1 ? '' : 's'} left out` : ''}.`
    case 'waiting': return `Waiting for Gemini · ${s.elapsed} s. A long story can take a minute or two.`
    case 'checking': return 'Comparing the figures with the source.'
    case 'done': return 'Translated. This is a draft: read it against the source.'
    case 'cancelled': return 'Cancelled. Nothing was changed.'
    case 'error': return s.error?.message ?? 'Something went wrong.'
    default: return ''
  }
}

export function useTranslateJob(onResult: (r: TranslateResult, secs: number) => void) {
  const [state, setState] = useState<JobState>(IDLE_JOB)
  const abort = useRef<AbortController | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const onResultRef = useRef(onResult)
  useEffect(() => { onResultRef.current = onResult })
  useEffect(() => () => { abort.current?.abort(); window.clearInterval(timer.current) }, [])

  const cancel = useCallback(() => { abort.current?.abort() }, [])
  const reset = useCallback(() => { setState(IDLE_JOB) }, [])

  const start = useCallback(async (source: string, sourceUrl?: string) => {
    abort.current?.abort()
    window.clearInterval(timer.current)
    const ac = new AbortController()
    abort.current = ac
    const t0 = Date.now()
    const info = describeSource(source)
    setState({ phase: 'preparing', elapsed: 0, ...info })
    timer.current = window.setInterval(() => setState((s) => (s.phase === 'waiting' ? { ...s, elapsed: Math.round((Date.now() - t0) / 1000) } : s)), 1000)
    setState((s) => ({ ...s, phase: 'waiting' }))
    try {
      const r = await translateStory({ source, sourceUrl }, { signal: ac.signal })
      if (ac.signal.aborted) throw new AiError('aborted', 'Cancelled.')
      setState((s) => ({ ...s, phase: 'checking' }))
      await new Promise((res) => setTimeout(res, 0)) // let the "checking" state paint before the work below
      onResultRef.current(r, Math.round((Date.now() - t0) / 1000))
      setState((s) => ({ ...s, phase: 'done' }))
    } catch (e) {
      if (ac.signal.aborted || (e instanceof AiError && e.code === 'aborted')) setState((s) => ({ ...s, phase: 'cancelled' }))
      else setState((s) => ({ ...s, phase: 'error', error: { code: e instanceof AiError ? e.code : 'unknown', message: errorMessage(e) } }))
    } finally {
      window.clearInterval(timer.current)
    }
  }, [])

  return { state, start, cancel, reset, running: state.phase === 'preparing' || state.phase === 'waiting' || state.phase === 'checking' }
}
