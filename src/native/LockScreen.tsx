import { useEffect, useState } from 'react'
import { getLastBiometricError, isLocked, onLockChange, setAppLockEnabled, unlock } from './biometric'

/** Full-screen cover while the (default-off) app lock is locked. Asks for the fingerprint/face/screen lock on show. */
export default function LockScreen() {
  const [locked, setLocked] = useState(isLocked())
  const [failed, setFailed] = useState(false)
  useEffect(() => onLockChange((l) => { setLocked(l); if (l) setFailed(false) }), [])
  useEffect(() => { if (locked) void unlock().then((ok) => { if (!ok) setFailed(true) }) }, [locked])
  if (!locked) return null
  // Fingerprint / face / screen lock removed from the phone after the lock was switched on: it can never succeed again, so
  // the editor is offered the way out (the lock is a convenience; the data is still protected by the phone itself).
  const gone = failed && ['none-enrolled', 'no-hardware', 'hardware-unavailable'].includes(String(getLastBiometricError() ?? ''))
  return (
    <div className="lk" role="dialog" aria-modal="true" aria-label="ESB Studio is locked">
      <img src="/brand/esb-avatar.png" alt="" width="72" height="72" />
      <h1>ESB Studio is locked</h1>
      <p>{failed ? 'That did not unlock it. Try again.' : 'Confirm it is you to continue.'}</p>
      <button type="button" className="lk-btn" onClick={() => { setFailed(false); void unlock().then((ok) => { if (!ok) setFailed(true) }) }}>Unlock</button>
      {gone && <button type="button" className="lk-btn lk-alt" onClick={() => { void setAppLockEnabled(false) }}>This phone has no screen lock any more: turn the app lock off</button>}
    </div>
  )
}
