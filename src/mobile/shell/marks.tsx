// Marks copied from the PC app (chiefhamim/esb-banner-studio, src/editorial/ProviderMark.tsx and FileTypeIcon.tsx), unchanged
// apart from the module split: the AI companies' single-colour marks (they take the text colour) and the PDF / Word sheets.
// PROVIDER_COLOR is the PC's own per-provider colour from aiProviders.ts (AI_PROVIDERS[].color).
import { useId } from 'react'
import type { AiProviderId } from '../../pc/editorial/aiProviders'

export const PROVIDER_COLOR: Record<AiProviderId, string> = { gemini: '#4285f4', anthropic: '#d97757', openai: '#10a37f', openrouter: '#6467f2' }

export function ProviderMark({ id, size = 16 }: { id: AiProviderId; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const
  if (id === 'anthropic') {
    const len = [10.8, 7.6, 10.2, 7.4, 10.8, 8.2, 10.4, 7.6, 10.8, 7.8, 10.2, 8]
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        {len.map((l, i) => {
          const a = (i * 30 - 90) * (Math.PI / 180)
          return <line key={i} x1={12 + Math.cos(a) * 2.2} y1={12 + Math.sin(a) * 2.2} x2={12 + Math.cos(a) * l} y2={12 + Math.sin(a) * l} />
        })}
      </svg>
    )
  }
  if (id === 'gemini') {
    return (
      <svg {...common} fill="currentColor">
        <path d="M12 1.5C12.7 7.6 16.4 11.3 22.5 12C16.4 12.7 12.7 16.4 12 22.5C11.3 16.4 7.6 12.7 1.5 12C7.6 11.3 11.3 7.6 12 1.5Z" />
      </svg>
    )
  }
  if (id === 'openai') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
        {[0, 60, 120, 180, 240, 300].map((d) => (
          <path key={d} transform={`rotate(${d} 12 12)`} d="M12 12 L12 3.2 C15.4 3.2 17.4 5.2 17.4 7.6 L12 12Z" />
        ))}
      </svg>
    )
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h14M13 4l4 4-4 4M21 16H7M11 12l-4 4 4 4" />
    </svg>
  )
}

export type FileKind = 'pdf' | 'docx'
const TONES: Record<FileKind, { top: string; bottom: string; label: string }> = {
  pdf: { top: '#f4675f', bottom: '#cf372f', label: 'PDF' },
  docx: { top: '#5a98f5', bottom: '#2a5fd0', label: 'DOC' },
}

export function FileTypeIcon({ kind, size = 36 }: { kind: FileKind; size?: number }) {
  const id = useId().replace(/:/g, '')
  const t = TONES[kind]
  return (
    <svg className="file-icon" width={(size * 40) / 48} height={size} viewBox="0 0 40 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.top} /><stop offset="1" stopColor={t.bottom} /></linearGradient>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--file-page-top, #ffffff)" /><stop offset="1" stopColor="var(--file-page-bottom, #eceef2)" /></linearGradient>
      </defs>
      <path d="M8 1.5h16.2a3 3 0 0 1 2.1.9l8.3 8.3a3 3 0 0 1 .9 2.1V41a5.5 5.5 0 0 1-5.5 5.5H8A5.5 5.5 0 0 1 2.5 41V7A5.5 5.5 0 0 1 8 1.5Z" fill={`url(#p${id})`} stroke="var(--file-edge, rgba(20,22,30,.14))" />
      <path d="M24.5 1.8v6.7a3.2 3.2 0 0 0 3.2 3.2h6.8" fill="var(--file-fold, #e1e4ea)" stroke="var(--file-edge, rgba(20,22,30,.14))" strokeLinejoin="round" />
      <rect x="9" y="15" width="13" height="2" rx="1" fill={t.bottom} opacity=".22" />
      <rect x="9" y="20" width="19" height="2" rx="1" fill={t.bottom} opacity=".14" />
      <rect x="9" y="25" width="16" height="2" rx="1" fill={t.bottom} opacity=".14" />
      <rect x="0" y="29.5" width="27" height="12.5" rx="3.2" fill={`url(#g${id})`} />
      <rect x="0.5" y="30" width="26" height="11.5" rx="2.8" fill="none" stroke="#fff" strokeOpacity=".28" />
      <text x="13.5" y="38.6" textAnchor="middle" fill="#fff" fontFamily="inherit" fontSize="8.2" fontWeight="800" letterSpacing=".6">{t.label}</text>
    </svg>
  )
}

/** PDF and Word side by side: what the Paste tab accepts. */
export function FileTypePair({ size = 36 }: { size?: number }) {
  return <span className="file-pair" aria-hidden><FileTypeIcon kind="pdf" size={size} /><FileTypeIcon kind="docx" size={size} /></span>
}
