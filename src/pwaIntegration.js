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

/**
 * Ask the browser to keep this site's data. Resolves to { granted, reason }:
 * when it isn't granted, `reason` explains why in plain words.
 */
export async function requestPersistentStorage() {
  const storage = navigator.storage
  if (typeof storage?.persist !== 'function') {
    return { granted: false, reason: 'This browser does not let websites ask to keep their data. Back up your workspace regularly instead.' }
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { granted: false, reason: 'Storage can only be protected on a secure (https) page.' }
  }
  let permission = null
  try { permission = (await navigator.permissions?.query({ name: 'persistent-storage' }))?.state ?? null } catch { /* not supported */ }
  if (permission === 'denied') {
    return { granted: false, reason: 'Keeping data is blocked for this site in your browser’s site settings. Allow “storage” there, or back up your workspace.' }
  }
  try {
    if (await storage.persist()) return { granted: true }
  } catch (error) {
    return { granted: false, reason: `The browser reported an error: ${error?.message || error?.name || 'unknown error'}.` }
  }
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches
  const chromium = typeof navigator !== 'undefined' && /Chrome|Chromium|Edg\//.test(navigator.userAgent)
  if (chromium) {
    return {
      granted: false,
      reason: standalone
        ? 'Chrome decided not to protect the data yet — it grants this to sites you use often. Try again after using ReadMe for a while, and keep a backup.'
        : 'Chrome only protects data for sites you use often, have bookmarked or installed as an app. Install ReadMe as an app (or bookmark it) and try again — or back up your workspace.',
    }
  }
  return { granted: false, reason: 'The browser declined the request (you may have dismissed its prompt). Try again, or back up your workspace.' }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}
