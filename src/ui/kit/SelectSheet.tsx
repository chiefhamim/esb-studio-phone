import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { IconCheck, IconSearch } from '../../shell/icons'

export interface SelectOption {
  id: string
  label: string
  description?: string
  color?: string
}

interface SelectSheetProps {
  open: boolean
  onClose: () => void
  title: string
  options: SelectOption[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function SelectSheet({
  open,
  onClose,
  title,
  options,
  selectedId,
  onSelect
}: SelectSheetProps) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()) || o.description?.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {options.length > 8 && (
        <div style={{ marginBottom: 'var(--sp-3)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>
            <IconSearch />
          </div>
          <input
            type="search"
            className="kit-input"
            style={{ paddingLeft: 40 }}
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }} role="listbox" aria-label={title}>
        {filtered.map((opt) => {
          const isSelected = opt.id === selectedId
          return (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-3)',
                minHeight: 48,
                padding: 'var(--sp-2) var(--sp-4)',
                borderRadius: 'var(--r-3)',
                border: 0,
                background: isSelected ? 'var(--accent-soft)' : 'transparent',
                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                font: '600 15px/20px var(--font-ui)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%'
              }}
              onClick={() => {
                onSelect(opt.id)
                onClose()
              }}
            >
              {opt.color && (
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: opt.color,
                    flexShrink: 0
                  }}
                  aria-hidden
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{opt.label}</div>
                {opt.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
                    {opt.description}
                  </div>
                )}
              </div>
              {isSelected && <IconCheck />}
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
