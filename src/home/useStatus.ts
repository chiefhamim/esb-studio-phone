// What the header chip and the status bar report. AI/session presence is read from the phone's secure storage; the CMS
// connection is a real check (src/sync/connection.ts), re-run when Settings closes, on foreground, when the network
// changes and every 90 seconds while visible. Nothing is assumed.
import { useEffect, useState } from 'react'
import { hasSecret } from '../secure'
import { checkConnection } from '../sync/connection'
import type { Connection } from '../sync/connection'

export type { Connection }
export { CONNECTION_LABEL } from '../sync/connection'

export interface Status {
  /** a Gemini key is saved on this phone */
  ai: boolean
  /** a site session is saved on this phone (not a live connection check; see `connection`) */
  cms: boolean
  /** the live CMS state: connected / expired / offline / not-connected. 'checking' until the first answer. */
  connection: Connection | 'checking'
}

const POLL_MS = 90_000

/** Re-reads when `tick` changes (Settings closed) and when the app comes back to the foreground. */
export function useStatus(tick: unknown): Status {
  const [s, setS] = useState<Status>({ ai: false, cms: false, connection: 'checking' })
  useEffect(() => {
    let dead = false
    const read = () => {
      Promise.all([hasSecret('gemini-key'), hasSecret('site-session')])
        .then(([ai, cms]) => { if (!dead) setS((o) => (o.ai === ai && o.cms === cms ? o : { ...o, ai, cms })) })
        .catch(() => {})
      checkConnection()
        .then((connection) => { if (!dead) setS((o) => (o.connection === connection ? o : { ...o, connection })) })
        .catch(() => { if (!dead) setS((o) => ({ ...o, connection: 'offline' })) })
    }
    read()
    const vis = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('online', read)
    window.addEventListener('offline', read)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') read() }, POLL_MS)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('online', read)
      window.removeEventListener('offline', read)
      clearInterval(timer)
    }
  }, [tick])
  return s
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}
