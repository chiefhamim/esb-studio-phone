// The app's icon, drawn from Tabler Icons. It has the same API as the PC's Icon (src/pc/ui/Icon.tsx) and replaces it
// at build time (vite.config.ts, tablerIcons plugin), so the phone screens and the vendored PC panels draw the same set
// while src/pc stays untouched. `filled` draws Tabler's filled version where one exists (the open tab).
import type { IconName } from '../../pc/ui/Icon'
import { TABLER, TABLER_FILLED } from './tablerIcons'

export type { IconName }

export function Icon({ name, size = 16, className, strokeWidth = 1.75, filled }: { name: IconName; size?: number; className?: string; strokeWidth?: number; filled?: boolean }) {
  const solid = filled ? TABLER_FILLED[name] : undefined
  const body = solid ?? TABLER[name] ?? ''
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={solid ? 'currentColor' : 'none'} stroke={solid ? 'none' : 'currentColor'} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={'icon ' + (className ?? '')} aria-hidden dangerouslySetInnerHTML={{ __html: body }} />
  )
}

/** Same as the PC's KIND_ICON: which icon a layer kind shows in Layers. */
export const KIND_ICON: Record<string, IconName> = { rect: 'square', text: 'text', icon: 'icon', image: 'image', photos: 'photos', watermark: 'watermark' }
