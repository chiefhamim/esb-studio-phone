// Haptics for key actions. No-op in a browser and when the phone has no haptic engine. Never throws.
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

const native = () => Capacitor.isNativePlatform()
const quiet = (p: Promise<unknown>) => { p.catch(() => {}) }

/** Light tick: a swipe passing its threshold, a toggle, a selection. */
export function tap(): void {
  if (native()) quiet(Haptics.impact({ style: ImpactStyle.Light }))
}

/** Something finished well (saved, published, copied). */
export function success(): void {
  if (native()) quiet(Haptics.notification({ type: NotificationType.Success }))
}

/** Before or on a destructive or risky step (delete confirm, error). */
export function warn(): void {
  if (native()) quiet(Haptics.notification({ type: NotificationType.Warning }))
}
