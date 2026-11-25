const DB_NAME = 'readme-workspace'
const STORE_NAME = 'state'
const HISTORY_STORE = 'history'
const MAX_SNAPSHOTS = 30

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is unavailable'))
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function get(storeName, key) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
    request.onsuccess = () => { db.close(); resolve(request.result ?? null) }
    request.onerror = () => { db.close(); reject(request.error) }
  }))
}

function put(storeName, key, value) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    if (value === undefined) tx.objectStore(storeName).delete(key)
    else tx.objectStore(storeName).put(value, key)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  }))
}

export const readWorkspace = () => get(STORE_NAME, 'workspace')
export const writeWorkspace = value => put(STORE_NAME, 'workspace', value)

// ── Version history (per file) ─────────────────────────────────
export async function readHistory(fileId) {
  const snapshots = await get(HISTORY_STORE, fileId)
  return Array.isArray(snapshots) ? snapshots : []
}

/** Adds a snapshot unless the content equals the newest one; keeps the latest MAX_SNAPSHOTS. */
export async function addSnapshot(fileId, { content, reason = 'Snapshot', name = '' }) {
  const snapshots = await readHistory(fileId)
  if (snapshots[0]?.content === content) return snapshots
  const next = [{ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), content, reason, name }, ...snapshots].slice(0, MAX_SNAPSHOTS)
  await put(HISTORY_STORE, fileId, next)
  return next
}

export async function readAllHistory() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE)
    const result = {}
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) { db.close(); resolve(result); return }
      result[cursor.key] = cursor.value
      cursor.continue()
    }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

export async function writeAllHistory(history) {
  await Promise.all(Object.entries(history || {}).map(([fileId, snapshots]) => (Array.isArray(snapshots) ? put(HISTORY_STORE, fileId, snapshots.slice(0, MAX_SNAPSHOTS)) : null)))
}
