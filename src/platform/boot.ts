// Boot order matters: the vendored PC modules read localStorage and window.esb when they are first imported, so the
// storage router, the secret migration, the platform and the bridge are all in place BEFORE the app is imported.
import { migrateSecrets } from './migrateSecrets'
import { hydrateStorage } from './storage'
import { loadPlatform } from './platform'
import { installEsbShim } from './esbShim'
import { persistStorage } from './kv'

export async function bootPlatform(): Promise<void> {
  await migrateSecrets().catch(() => undefined)
  await hydrateStorage()
  await loadPlatform()
  installEsbShim()
  void persistStorage()
}
