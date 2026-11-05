import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui'
import { useBackLayer } from './core'
import { downloadAndApplyUpdate, watchForUpdatesOnResume, type AvailableUpdate } from '../../platform/ota'

export function UpdateDialog() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Settings > About > "Check for updates" hands over what it found
  useEffect(() => {
    const on = (e: Event) => { setUpdate((e as CustomEvent<AvailableUpdate>).detail); setDismissed(false) }
    window.addEventListener('esb-update-found', on)
    return () => window.removeEventListener('esb-update-found', on)
  }, [])

  useEffect(() => {
    return watchForUpdatesOnResume((up) => {
      setUpdate(up)
      setDismissed(false)
    })
  }, [])

  // Back closes the offer (not while a bundle is being written)
  useBackLayer(!!update && !dismissed && !downloading, () => setDismissed(true), 'dialog')

  if (!update || dismissed) return null

  const onUpdate = async () => {
    setDownloading(true)
    setError(null)
    setProgress(0)
    try {
      await downloadAndApplyUpdate(update, (pct) => setProgress(pct))
      // the APK is handed to Android's own installer: this dialog's part is done (cancelling there must not leave it stuck)
      if (update.needsApk) { setDownloading(false); setDismissed(true) }
    } catch (err: unknown) {
      setDownloading(false)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to download update.')
    }
  }

  return createPortal(
    <div className="m-scrim m-scrim-center" role="presentation">
      <div
        className="m-alert"
        role="alertdialog"
        aria-modal="true"
        aria-label="Update available"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>New update available</h2>
        {downloading ? (
          <div>
            <p>Downloading and applying update... {progress}%</p>
            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'var(--border-strong, #ccc)',
                borderRadius: '3px',
                overflow: 'hidden',
                marginTop: '12px',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent, #008080)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        ) : error ? (
          <p style={{ color: 'var(--danger, #d32f2f)' }}>{error}</p>
        ) : (
          <p>
            {update.message ? <>{update.message}<br /></> : null}<small>Version {update.version}{update.needsApk ? ' · a full app file; Android will ask you to confirm the install.' : ' · downloads in a few seconds and the app restarts itself.'}</small>
          </p>
        )}

        <div className="m-alert-actions">
          {downloading ? (
            <Button kind="filled" busy disabled wide>
              Updating...
            </Button>
          ) : error ? (
            <>
              <Button kind="text" onClick={() => { setError(null); setDismissed(true) }}>
                Later
              </Button>
              <Button kind="filled" onClick={onUpdate}>
                Retry
              </Button>
            </>
          ) : (
            <>
              <Button kind="text" onClick={() => setDismissed(true)}>
                Later
              </Button>
              <Button kind="filled" icon="download" onClick={onUpdate}>
                Update now
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
