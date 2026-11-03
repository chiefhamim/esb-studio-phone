// Storage router for the vendored PC code (src/pc). The PC stores everything in localStorage; on the phone:
//   - SECRET keys (site sign-in, AI keys, Facebook Page token) live ONLY in the Android Keystore (src/secure.ts) and
//     in memory. They never reach localStorage on disk.
//   - LARGE keys (the graphics project with its pictures, the editorial story, autosave snapshots) live in IndexedDB,
//     held in memory for the PC's synchronous reads and written through on every change.
//   - everything else (small preferences) stays in localStorage as on the PC.
// `hydrateStorage()` must finish BEFORE any src/pc module is imported (they read storage at module load).
import { deleteSecret, getSecret, setSecret, type SecretName } from '../secure'
import { kvDelete, kvGet, kvSet } from './kv'

export const SECRET_KEYS: Record<string, SecretName> = {
  'esb-banner-studio/site-session': 'site-session',
  'esb-banner-studio/ai-settings': 'pc-ai-settings',
  'esb-banner-studio/facebook': 'pc-facebook',
}

export const LARGE_KEYS = new Set([
  'esb-banner-studio/doc/v1',
  'esb-banner-studio/autosave-snapshot',
  'esb-banner-studio/editorial/v1',
  'esb-banner-studio/card-designs/v1',
  'esb-banner-studio/editorial/queue/v1',
  'esb-banner-studio/wire/inbox/v1',
  'esb-banner-studio/editorial/jobs/v1',
])

const mem = new Map<string, string>()
const pending = new Map<string, ReturnType<typeof setTimeout>>()
const writes = new Set<Promise<unknown>>()
let installed = false
let lastError: string | null = null

/** The last background write failure (shown by the app instead of pretending the save worked). */
export function storageError(): string | null { return lastError }

function track(p: Promise<unknown>) {
  const q = p.then(() => { lastError = null }, (e: unknown) => {
    lastError = e instanceof Error ? e.message : String(e)
    window.dispatchEvent(new CustomEvent('esb-storage-error', { detail: lastError }))
  }).finally(() => writes.delete(q))
  writes.add(q)
}

function writeLarge(key: string) {
  clearTimeout(pending.get(key))
  pending.set(key, setTimeout(() => {
    pending.delete(key)
    const v = mem.get(key)
    track(v == null ? kvDelete(key) : kvSet(key, v))
  }, 150))
}

/** Write everything that is waiting (called when the app goes to the background). */
export async function flushStorage(): Promise<void> {
  for (const [key, t] of pending) {
    clearTimeout(t)
    pending.delete(key)
    const v = mem.get(key)
    track(v == null ? kvDelete(key) : kvSet(key, v))
  }
  await Promise.allSettled([...writes])
}

const isRouted = (k: string) => k in SECRET_KEYS || LARGE_KEYS.has(k)

/** Load routed keys into memory, moving any copy found in plain localStorage to its proper home first. */
export async function hydrateStorage(): Promise<void> {
  const ls = window.localStorage
  for (const [key, secret] of Object.entries(SECRET_KEYS)) {
    const plain = ls.getItem(key)
    if (plain != null) { await setSecret(secret, plain); ls.removeItem(key) }
    const v = await getSecret(secret)
    if (v != null) mem.set(key, v)
  }
  for (const key of LARGE_KEYS) {
    const plain = ls.getItem(key)
    if (plain != null) { await kvSet(key, plain); ls.removeItem(key) }
    const v = await kvGet(key)
    if (v != null) mem.set(key, v)
  }
  installRouter()
}

function installRouter() {
  if (installed) return
  installed = true
  const proto = Storage.prototype
  const get = proto.getItem, set = proto.setItem, remove = proto.removeItem
  const isLocal = (s: Storage) => { try { return s === window.localStorage } catch { return false } }
  proto.getItem = function (this: Storage, key: string) {
    if (isLocal(this) && isRouted(key)) return mem.get(key) ?? null
    return get.call(this, key)
  }
  proto.setItem = function (this: Storage, key: string, value: string) {
    if (!(isLocal(this) && isRouted(key))) return set.call(this, key, value)
    const v = String(value)
    mem.set(key, v)
    const secret = SECRET_KEYS[key]
    if (secret) track(setSecret(secret, v))
    else writeLarge(key)
  }
  proto.removeItem = function (this: Storage, key: string) {
    if (!(isLocal(this) && isRouted(key))) return remove.call(this, key)
    mem.delete(key)
    const secret = SECRET_KEYS[key]
    if (secret) track(deleteSecret(secret))
    else writeLarge(key)
  }
  ;(window as unknown as { __esbStorageRouted?: boolean }).__esbStorageRouted = true
  const flush = () => { void flushStorage() }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  window.addEventListener('pagehide', flush)
}

/** Tests only. */
export function _peekMemory(key: string): string | undefined { return mem.get(key) }
