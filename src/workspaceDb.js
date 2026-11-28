const DB_NAME = 'readme-workspace'
const STORE_NAME = 'state'
const HISTORY_STORE = 'history'
const ATTACHMENT_STORE = 'attachments'
const MAX_SNAPSHOTS = 30

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is unavailable'))
    const request = indexedDB.open(DB_NAME, 3)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE)
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) db.createObjectStore(ATTACHMENT_STORE)
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
export const readDailyNotes = async () => {
  const value = await get(STORE_NAME, 'daily-notes')
  return Array.isArray(value) ? value : []
}
export const writeDailyNotes = notes => put(STORE_NAME, 'daily-notes', Array.isArray(notes) ? notes : [])
export const readDashboards = async () => {
  const value = await get(STORE_NAME, 'document-dashboards')
  return Array.isArray(value) ? value : []
}
export const writeDashboards = dashboards => put(STORE_NAME, 'document-dashboards', Array.isArray(dashboards) ? dashboards : [])

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

// The folder chosen for "Sync to a folder" (a FileSystemDirectoryHandle).
export const readSyncFolder = () => get(STORE_NAME, 'sync-folder')
export const writeSyncFolder = handle => put(STORE_NAME, 'sync-folder', handle ?? undefined)
// What the app last wrote to / read from the sync folder ({ written: Map path→text, paths: Map id→path }),
// kept across reloads so closed or renamed files aren't mistaken for new files in the folder.
export const readSyncState = () => get(STORE_NAME, 'sync-state')
export const writeSyncState = state => put(STORE_NAME, 'sync-state', state ?? undefined)

// ── Attachments (images stored next to the workspace, by path) ──
/** Every attachment: [{ path, blob, type, size, createdAt }]. */
export function readAllAttachments() {
  return openDb().then(db => new Promise((resolve, reject) => {
    const request = db.transaction(ATTACHMENT_STORE, 'readonly').objectStore(ATTACHMENT_STORE).getAll()
    request.onsuccess = () => { db.close(); resolve((request.result ?? []).filter(item => item?.path && item.blob)) }
    request.onerror = () => { db.close(); reject(request.error) }
  }))
}
export const putAttachment = record => put(ATTACHMENT_STORE, record.path, record)
export const deleteAttachment = path => put(ATTACHMENT_STORE, path, undefined)

