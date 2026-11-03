import { CONNECTION_LABEL } from './useStatus'
import type { Status } from './useStatus'

/** Thin bottom line like the desktop's: CMS state | ENGINE | words and reading time. */
export default function StatusBar({ status, words }: { status: Status; words: number }) {
  const min = Math.max(1, Math.ceil(words / 200))
  return (
    <footer className="hm-status" aria-label="Status">
      <span className="hm-sb-item"><span className="hm-sb-k">CMS</span><i className={status.connection === 'connected' ? 'hm-sb-dot ok' : 'hm-sb-dot hollow'} aria-hidden /><b>{status.connection === 'checking' ? 'Checking' : CONNECTION_LABEL[status.connection]}</b></span>
      <span className="hm-sb-sep" aria-hidden />
      <span className="hm-sb-item"><span className="hm-sb-k">Engine</span><i className={status.ai ? 'hm-sb-dot ok' : 'hm-sb-dot'} aria-hidden /><b>{status.ai ? 'Gemini' : 'No AI key'}</b></span>
      <span className="hm-sb-words">{words} {words === 1 ? 'word' : 'words'} · ~{min} min</span>
    </footer>
  )
}
