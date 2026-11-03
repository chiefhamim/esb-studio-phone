// What the header chip and the status bar report. Read from the phone's secure storage; nothing is assumed.
import { useEffect, useState } from 'react'
import { hasSecret } from '../secure'

export interface Status {
  /** a Gemini key is saved on this phone */
  ai: boolean
  /** a site session is saved on this phone (not a live connection check) */
  cms: boolean
}

/** Re-reads when `tick` changes (Settings closed) and when the app comes back to the foreground. */
export function useStatus(tick: unknown): Status {
  const [s, setS] = useState<Status>({ ai: false, cms: false })
  useEffect(() => {
    let dead = false
    const read = () => {
      Promise.all([hasSecret('gemini-key'), hasSecret('site-session')])
        .then(([ai, cms]) => { if (!dead) setS((o) => (o.ai === ai && o.cms === cms ? o : { ai, cms })) })
        .catch(() => {})
    }
    read()
    const vis = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', vis)
    return () => { dead = true; document.removeEventListener('visibilitychange', vis) }
  }, [tick])
  return s
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}
