// Boot order matters: the vendored PC modules read localStorage and window.esb when they are first imported, so the
// storage router, the secret migration, the platform and the bridge are all in place BEFORE the app is imported.
import { migrateSecrets } from './migrateSecrets'
import { hydrateStorage } from './storage'
import { loadPlatform } from './platform'
import { installEsbShim } from './esbShim'
import { persistStorage } from './kv'
import { migrateOldDrafts } from '../mobile/library/migrateDrafts'

export async function bootPlatform(): Promise<void> {
  await migrateSecrets().catch(() => undefined)
  await hydrateStorage()
  // the phone's old drafts join the PC story queue (copied, never removed) before the queue module reads it
  try { migrateOldDrafts() } catch (e) { console.warn('draft migration skipped', e) }
  await loadPlatform()
  installEsbShim()
  void persistStorage()
}
