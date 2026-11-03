export type StatusType = 'draft' | 'translated' | 'ready' | 'warn'

interface StatusChipProps {
  status: StatusType
  label: string
}

export function StatusChip({ status, label }: StatusChipProps) {
  return (
    <span className={`kit-chip kit-chip-${status}`}>
      {label}
    </span>
  )
}
