// Browser / PWA integration helpers: shared content inbox (Web Share Target)
// and persistent storage (Storage API).

const SHARE_INBOX = '/__share-inbox__'

/** Returns everything shared to the app via the OS share sheet and clears the inbox. */
export async function takeSharedItems() {
  if (!('caches' in window)) return []
  const items = []
  for (const name of await caches.keys()) {
    if (!name.startsWith('readme-shell-')) continue
    const cache = await caches.open(name)
    const response = await cache.match(SHARE_INBOX)
    if (!response) continue
    try {
      const inbox = await response.json()
      if (Array.isArray(inbox)) items.push(...inbox)
    } catch { /* ignore a damaged inbox */ }
    await cache.delete(SHARE_INBOX)
  }
  return items
}

/** Turns one shared item into ReadMe files: shared files as-is, text / links as a note. */
export function sharedItemToFiles(item) {
  const files = (item.files || [])
    .filter(file => typeof file.content === 'string')
    .map(file => ({ name: file.name || 'Shared.md', content: file.content }))
  const text = (item.text || '').trim()
  const url = (item.url || '').trim()
  if (text || url) {
    const title = (item.title || '').trim() || (url ? new URL(url, 'https://x').hostname.replace(/^www\./, '') : 'Shared note')
    const urlInText = url && text.includes(url)
    const body = [`# ${title}`, '', text, url && !urlInText ? `\n[${url}](${url})` : ''].filter((part, i) => i < 2 || part).join('\n').trim()
    const safeTitle = title.replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Shared note'
    files.push({ name: `${safeTitle}.md`, content: `${body}\n` })
  }
  return files
}

export async function storageStatus() {
  const storage = navigator.storage
  if (!storage?.estimate) return { supported: false }
  const [estimate, persisted] = await Promise.all([storage.estimate(), storage.persisted?.() ?? Promise.resolve(false)])
  return { supported: true, usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted: Boolean(persisted), canPersist: typeof storage.persist === 'function' }
}

export async function requestPersistentStorage() {
  try { return Boolean(await navigator.storage?.persist?.()) } catch { return false }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}
