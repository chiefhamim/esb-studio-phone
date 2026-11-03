// Secret storage: Android Keystore through the Capacitor secure-storage plugin. Secrets (AI keys, the site session, the
// Facebook Page token) go ONLY through here: never localStorage, never a URL, never a log line.
// In a plain browser (dev) there is no Keystore: secrets are held in memory for the session only and lost on reload.
import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

export type SecretName = 'gemini-key' | 'claude-key' | 'openai-key' | 'site-session' | 'fb-page-token' | 'fb-page-id' | 'pc-ai-settings' | 'pc-facebook'

const mem = new Map<string, string>()
const native = () => Capacitor.isNativePlatform()

export async function getSecret(name: SecretName): Promise<string | null> {
  if (!native()) return mem.get(name) ?? null
  const v = await SecureStorage.get(name, false, false).catch(() => null)
  return typeof v === 'string' ? v : null
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  if (!native()) { mem.set(name, value); return }
  await SecureStorage.set(name, value, false, false)
}

export async function deleteSecret(name: SecretName): Promise<void> {
  if (!native()) { mem.delete(name); return }
  await SecureStorage.remove(name, false).catch(() => false)
}

export async function hasSecret(name: SecretName): Promise<boolean> {
  return (await getSecret(name)) !== null
}

/** Only for tests: forget everything held in memory. */
export function _resetMemoryForTests(): void { mem.clear() }
