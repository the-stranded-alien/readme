// Workspace backup / restore: one .zip with every file (as plain .md), file
// metadata, app settings and version history.
import { putAttachment, readAllAttachments, readAllHistory, writeAllHistory, writeWorkspace } from './workspaceDb'

const MANIFEST = 'readme-backup.json'
// Workspace data is stored separately; everything else prefixed "readme-" is a setting.
const NON_SETTING_KEYS = new Set(['readme-files', 'readme-active-file'])

function settingsSnapshot() {
  const settings = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith('readme-') && !NON_SETTING_KEYS.has(key)) settings[key] = localStorage.getItem(key)
  }
  return settings
}

const safeName = name => name.replace(/[\\:*?"<>|]+/g, '-').replace(/^\/+/, '') || 'document.md'

export async function createBackup({ files, activeId, closed = [], attachments = null }) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const used = new Set()
  const toEntry = (file, folder) => {
    let path = `${folder}/${safeName(file.name)}`
    if (!/\.(md|markdown|txt)$/i.test(path)) path += '.md'
    let n = 2
    while (used.has(path.toLowerCase())) path = path.replace(/(\.[^.]+)?$/, ext => `-${n++}${ext || ''}`)
    used.add(path.toLowerCase())
    zip.file(path, file.content)
    return { id: file.id, name: file.name, path, ...(file.pinned ? { pinned: true } : {}), ...(file.color ? { color: file.color } : {}), ...(file.wordGoal ? { wordGoal: file.wordGoal } : {}) }
  }
  const entries = files.map(file => toEntry(file, 'files'))
  // Files closed from the tab bar (still listed in the Files panel) go in their own folder.
  const closedEntries = closed.filter(entry => entry?.file).map(entry => ({ ...toEntry(entry.file, 'closed'), index: entry.index ?? 0 }))
  let history = {}
  try { history = await readAllHistory() } catch { /* history is optional */ }
  // Image attachments go in as real image files.
  let images = attachments
  if (!images) { try { images = await readAllAttachments() } catch { images = [] } }
  const imageEntries = (images ?? []).filter(item => item?.path && item.blob).map(item => {
    zip.file(item.path, item.blob)
    return { path: item.path, type: item.type || item.blob.type, createdAt: item.createdAt ?? 0 }
  })
  zip.file(MANIFEST, JSON.stringify({ app: 'ReadMe', version: 1, createdAt: new Date().toISOString(), activeId, files: entries, closed: closedEntries, attachments: imageEntries, settings: settingsSnapshot(), history }, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Reads and validates a backup .zip; throws with a readable message when it isn't one. */
export async function readBackup(blob) {
  const { default: JSZip } = await import('jszip')
  let zip
  try { zip = await JSZip.loadAsync(blob) } catch { throw new Error('This file is not a ZIP archive.') }
  const manifestFile = zip.file(MANIFEST)
  if (!manifestFile) throw new Error('This ZIP is not a ReadMe backup (readme-backup.json is missing).')
  const manifest = JSON.parse(await manifestFile.async('string'))
  if (manifest?.app !== 'ReadMe' || !Array.isArray(manifest.files)) throw new Error('The backup manifest is not valid.')
  const readEntries = async list => {
    const out = []
    for (const entry of Array.isArray(list) ? list : []) {
      const file = entry?.path && zip.file(entry.path)
      if (!file || typeof entry.id !== 'string' || typeof entry.name !== 'string') continue
      out.push({ entry, file: { id: entry.id, name: entry.name, content: await file.async('string'), ...(entry.pinned ? { pinned: true } : {}), ...(entry.color ? { color: entry.color } : {}), ...(entry.wordGoal > 0 ? { wordGoal: entry.wordGoal } : {}) } })
    }
    return out
  }
  const files = (await readEntries(manifest.files)).map(item => item.file)
  const closed = (await readEntries(manifest.closed))
    .filter(item => !files.some(file => file.id === item.file.id))
    .map(item => ({ index: Number(item.entry.index) || 0, file: item.file }))
  const attachments = []
  for (const entry of Array.isArray(manifest.attachments) ? manifest.attachments : []) {
    const file = typeof entry?.path === 'string' && entry.path.startsWith('attachments/') && zip.file(entry.path)
    if (!file) continue
    const data = await file.async('uint8array')
    const blob = new Blob([data], { type: entry.type || 'image/png' })
    attachments.push({ path: entry.path, blob, type: blob.type, size: blob.size, createdAt: Number(entry.createdAt) || Date.now() })
  }
  return {
    attachments,
    createdAt: manifest.createdAt,
    activeId: files.some(file => file.id === manifest.activeId) ? manifest.activeId : files[0]?.id ?? null,
    files,
    closed,
    settings: manifest.settings && typeof manifest.settings === 'object' ? manifest.settings : {},
    history: manifest.history && typeof manifest.history === 'object' ? manifest.history : {},
  }
}

/** Replaces the workspace, settings and history with the backup's contents. */
export async function applyBackup(backup) {
  for (const key of Object.keys(settingsSnapshot())) localStorage.removeItem(key)
  for (const [key, value] of Object.entries(backup.settings)) {
    if (key.startsWith('readme-') && !NON_SETTING_KEYS.has(key) && typeof value === 'string') localStorage.setItem(key, value)
  }
  const syncable = backup.files.map(({ id, name, content, pinned, color, wordGoal }) => ({ id, name, content, ...(pinned ? { pinned } : {}), ...(color ? { color } : {}), ...(wordGoal ? { wordGoal } : {}) }))
  try { localStorage.setItem('readme-files', JSON.stringify(syncable)) } catch { /* large workspaces live in IndexedDB */ }
  if (backup.activeId) localStorage.setItem('readme-active-file', backup.activeId)
  await writeWorkspace({ files: backup.files, activeId: backup.activeId, closed: backup.closed ?? [] })
  await writeAllHistory(backup.history)
  for (const record of backup.attachments ?? []) await putAttachment(record)
}
