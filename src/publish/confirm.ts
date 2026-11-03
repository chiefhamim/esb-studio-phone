// The confirmation gate. A live action (publish to the site, post to Facebook) needs a one-time Confirmation that only
// the confirmation sheet's second tap issues. The network functions refuse to run without a matching one, so no code
// path can go live by accident, whatever the UI does.

export interface LivePlan {
  kind: 'site' | 'facebook'
  /** the story's headline, exactly as it will go out */
  title: string
  /** where it goes, in words */
  destination: string
  /** what picture goes with it, in words ("none" is a valid answer) */
  picture: string
  /** the site slug (site publishes) so a confirmation for one story cannot be reused for another */
  slug?: string
}

export interface Confirmation { readonly id: string }

const issued = new Map<string, LivePlan>()
let counter = 0

/** Called only by the sheet's explicit "yes" tap. */
export function issueConfirmation(plan: LivePlan): Confirmation {
  counter += 1
  const id = `c${Date.now().toString(36)}-${counter}`
  issued.set(id, { ...plan })
  return { id }
}

/** One use only, and only for the plan it was issued for. */
export function consumeConfirmation(c: Confirmation | undefined, expect: Pick<LivePlan, 'kind' | 'title'> & { slug?: string }): boolean {
  if (!c) return false
  const plan = issued.get(c.id)
  if (!plan) return false
  issued.delete(c.id) // spent whether or not it matches
  return plan.kind === expect.kind && plan.title === expect.title && (expect.slug === undefined || plan.slug === expect.slug)
}

export function _resetConfirmationsForTests(): void { issued.clear() }
