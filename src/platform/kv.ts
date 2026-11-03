// A tiny IndexedDB key/value store for large values (graphics projects with pictures, the story library).
// Falls back to an in-memory map where IndexedDB is missing (vitest without fake-indexeddb).
const DB = 'esb-phone'
const STORE = 'kv'

let dbp: Promise<IDBDatabase | null> | null = null
const memFallback = new Map<string, string>()

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbp
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    if (!db) { resolve(undefined); return }
    const t = db.transaction(STORE, mode)
    const r = run(t.objectStore(STORE))
    t.oncomplete = () => resolve(r.result)
    t.onerror = () => reject(t.error ?? new Error('IndexedDB write failed'))
    t.onabort = () => reject(t.error ?? new Error('IndexedDB write aborted (storage full?)'))
  }))
}

export async function kvGet(key: string): Promise<string | null> {
  const db = await open()
  if (!db) return memFallback.get(key) ?? null
  const v = await tx<unknown>('readonly', (s) => s.get(key))
  return typeof v === 'string' ? v : null
}

export async function kvSet(key: string, value: string): Promise<void> {
  const db = await open()
  if (!db) { memFallback.set(key, value); return }
  await tx('readwrite', (s) => s.put(value, key))
}

export async function kvDelete(key: string): Promise<void> {
  const db = await open()
  if (!db) { memFallback.delete(key); return }
  await tx('readwrite', (s) => s.delete(key))
}

export async function kvKeys(): Promise<string[]> {
  const db = await open()
  if (!db) return [...memFallback.keys()]
  return ((await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? []).map(String)
}

/** Ask the browser not to evict this app's storage under pressure (best effort). */
export async function persistStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}
