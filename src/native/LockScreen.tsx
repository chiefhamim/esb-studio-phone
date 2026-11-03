import { useEffect, useState } from 'react'
import { isLocked, onLockChange, unlock } from './biometric'

/** Full-screen cover while the (default-off) app lock is locked. Asks for the fingerprint/face/screen lock on show. */
export default function LockScreen() {
  const [locked, setLocked] = useState(isLocked())
  const [failed, setFailed] = useState(false)
  useEffect(() => onLockChange((l) => { setLocked(l); if (l) setFailed(false) }), [])
  useEffect(() => { if (locked) void unlock().then((ok) => { if (!ok) setFailed(true) }) }, [locked])
  if (!locked) return null
  return (
    <div className="lk" role="dialog" aria-modal="true" aria-label="ESB Studio is locked">
      <img src="/brand/esb-avatar.png" alt="" width="72" height="72" />
      <h1>ESB Studio is locked</h1>
      <p>{failed ? 'That did not unlock it. Try again.' : 'Confirm it is you to continue.'}</p>
      <button type="button" className="lk-btn" onClick={() => { setFailed(false); void unlock().then((ok) => { if (!ok) setFailed(true) }) }}>Unlock</button>
    </div>
  )
}
