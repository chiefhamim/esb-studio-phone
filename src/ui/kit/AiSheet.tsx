import { useEffect, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { hasSecret } from '../../secure'
import { testGeminiKey, errorMessage } from '../../aiProviders'
import { isAiPaused, setAiPaused } from '../../aiState'
import { IconSparkle, IconCheck, IconAlert } from '../../shell/icons'

interface AiSheetProps {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
}

export function AiSheet({ open, onClose, onOpenSettings }: AiSheetProps) {
  const [paused, setPausedState] = useState(isAiPaused())
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [testStatus, setTestStatus] = useState<{ kind: 'idle' | 'running' | 'ok' | 'error'; msg: string }>({
    kind: 'idle',
    msg: ''
  })

  useEffect(() => {
    if (!open) return
    void hasSecret('gemini-key')
      .then((h) => setHasKey(h))
      .catch(() => setHasKey(false))
  }, [open])

  const togglePause = () => {
    const next = !paused
    setPausedState(next)
    setAiPaused(next)
  }

  const runTest = async () => {
    setTestStatus({ kind: 'running', msg: 'Testing connection to Google AI Studio...' })
    try {
      const res = await testGeminiKey()
      setTestStatus({ kind: 'ok', msg: res.message })
    } catch (e) {
      setTestStatus({ kind: 'error', msg: errorMessage(e) })
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="AI Service & Models">
      <div style={{ display: 'grid', gap: 'var(--sp-4)', paddingBottom: 'var(--sp-3)' }}>
        {/* Master AI Pause Card */}
        <div
          style={{
            padding: 'var(--sp-4)',
            borderRadius: 'var(--r-3)',
            background: paused ? 'var(--warning-soft)' : 'var(--surface-raised)',
            border: `1px solid ${paused ? 'var(--warning)' : 'var(--border-subtle)'}`,
            display: 'grid',
            gap: 'var(--sp-2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <IconSparkle />
              <b style={{ font: 'var(--t-title)' }}>
                {paused ? 'AI Features: PAUSED' : 'AI Features: ACTIVE'}
              </b>
            </div>
            <button
              type="button"
              className="kit-btn"
              onClick={togglePause}
              style={{
                minHeight: 38,
                padding: '0 var(--sp-3)',
                background: paused ? 'var(--warning)' : 'var(--fill-active)',
                color: paused ? '#000000' : 'var(--text-primary)',
                fontWeight: 600
              }}
            >
              {paused ? 'Resume AI' : 'Pause AI'}
            </button>
          </div>
          <p style={{ margin: 0, font: 'var(--t-caption)', color: 'var(--text-secondary)' }}>
            {paused
              ? 'AI translation and drafts are paused. No data or requests are sent. Your keys and settings remain securely saved.'
              : 'AI is running. Powered by Gemini 2.5 Flash for newsroom translation and draft generation.'}
          </p>
        </div>

        {/* Active Provider & Model */}
        <div>
          <span
            style={{
              display: 'block',
              font: '700 11px/16px var(--font-ui)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--sp-2)'
            }}
          >
            AI Providers
          </span>

          <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
            {/* Gemini */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--sp-3)',
                borderRadius: 'var(--r-3)',
                background: 'var(--surface-raised)',
                border: '1px solid var(--accent)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <b style={{ font: 'var(--t-body)' }}>Google Gemini</b>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--r-pill)',
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)'
                    }}
                  >
                    Active
                  </span>
                </div>
                <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Default model: gemini-2.5-flash (fast, newsroom-tuned)
                </small>
              </div>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: hasKey ? 'var(--success)' : 'var(--warning)',
                  boxShadow: hasKey ? '0 0 0 2px var(--success-soft)' : '0 0 0 2px var(--warning-soft)'
                }}
                title={hasKey ? 'Key saved' : 'No key'}
              />
            </div>

            {/* Claude */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--sp-3)',
                borderRadius: 'var(--r-3)',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                opacity: 0.65
              }}
            >
              <div>
                <b style={{ font: 'var(--t-body)' }}>Anthropic Claude</b>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Claude 3.7 Sonnet</div>
              </div>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--r-pill)',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--fill-active)',
                  color: 'var(--text-tertiary)'
                }}
              >
                Planned
              </span>
            </div>

            {/* OpenAI */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--sp-3)',
                borderRadius: 'var(--r-3)',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                opacity: 0.65
              }}
            >
              <div>
                <b style={{ font: 'var(--t-body)' }}>OpenAI</b>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>GPT-4o</div>
              </div>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--r-pill)',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--fill-active)',
                  color: 'var(--text-tertiary)'
                }}
              >
                Planned
              </span>
            </div>
          </div>
        </div>

        {/* Key status & test */}
        <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button
              type="button"
              className="kit-btn"
              onClick={() => { void runTest() }}
              disabled={testStatus.kind === 'running' || hasKey === false}
              style={{ flex: 1, minHeight: 48 }}
            >
              {testStatus.kind === 'running' ? 'Testing connection…' : 'Test Gemini key'}
            </button>
            <button
              type="button"
              className="kit-btn kit-btn-tonal"
              onClick={() => {
                onClose()
                onOpenSettings()
              }}
              style={{ flex: 1, minHeight: 48 }}
            >
              Change key
            </button>
          </div>

          {testStatus.msg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--r-2)',
                fontSize: 13,
                background: testStatus.kind === 'ok' ? 'var(--success-soft)' : 'var(--danger-soft)',
                color: testStatus.kind === 'ok' ? 'var(--success)' : 'var(--danger)'
              }}
            >
              {testStatus.kind === 'ok' ? <IconCheck /> : <IconAlert />}
              <span>{testStatus.msg}</span>
            </div>
          )}

          {hasKey === false && (
            <p style={{ margin: 0, font: 'var(--t-caption)', color: 'var(--warning)' }}>
              No Gemini API key is configured. Tap &ldquo;Change key&rdquo; to paste your Google AI Studio key in Keystore.
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
