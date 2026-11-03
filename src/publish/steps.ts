// Publish stepper (Check, Review, Send) and the readiness ring numbers. Pure, so it is testable.
import type { Readiness } from './readiness'

export type StepId = 'check' | 'review' | 'send'
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'check', label: 'Check' },
  { id: 'review', label: 'Review' },
  { id: 'send', label: 'Send' },
]

export const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id)
export const stepAt = (i: number): StepId => STEPS[Math.min(STEPS.length - 1, Math.max(0, i))].id

/** Required checks passed out of required checks total, and the 0..1 fraction the ring draws. */
export function ringStats(r: Readiness): { done: number; total: number; fraction: number } {
  const req = r.checks.filter((c) => c.group === 'Required')
  const done = req.filter((c) => c.status === 'ok').length
  return { done, total: req.length, fraction: req.length ? done / req.length : 0 }
}

/** Read time the site shows: whole minutes at 200 words a minute, at least 1. */
export function readMinutes(words: number): number { return Math.max(1, Math.round(words / 200)) }

const ARTICLE_TZ = 'Asia/Dhaka'
/** Same wording as the desktop formatArticleDate. */
export function formatArticleDate(date: Date): string {
  const d = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: ARTICLE_TZ })
  const t = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ARTICLE_TZ })
  return `Published on ${d} at ${t}`
}
