// "Sync to a folder": keeps a copy of every workspace file as a real file in a
// folder on the user's computer (File System Access API, Chromium browsers).

const TEXT_FILE = /\.(md|markdown|mdx|txt)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build'])

export const canSyncToFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** Workspace names may contain folders ("docs/intro.md"); keep them safe as relative paths. */
export function syncPath(name) {
  const parts = String(name || 'untitled.md').split('/')
    .map(part => part.replace(/[\\:*?"<>|]+/g, '-').trim())
    .filter(part => part && part !== '.' && part !== '..')
  if (!parts.length) parts.push('untitled.md')
  if (!TEXT_FILE.test(parts[parts.length - 1])) parts[parts.length - 1] += '.md'
  return parts.join('/')
}

export async function folderPermission(handle, request = false) {
  if (!handle?.queryPermission) return 'granted'
  const state = await handle.queryPermission({ mode: 'readwrite' })
  if (state === 'granted' || !request) return state
  return handle.requestPermission({ mode: 'readwrite' })
}

async function fileHandleFor(root, path, create) {
  const parts = path.split('/')
  let dir = root
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create })
  return dir.getFileHandle(parts[parts.length - 1], { create })
}

/** Writes files whose content differs from what was last written. Returns the number written. */
export async function writeToFolder(root, files, written) {
  let count = 0
  for (const file of files) {
    const path = syncPath(file.name)
    if (written.get(path) === file.content) continue
    const handle = await fileHandleFor(root, path, true)
    const writable = await handle.createWritable()
    await writable.write(file.content)
    await writable.close()
    written.set(path, file.content)
    count += 1
  }
  return count
}

/** Reads every Markdown/text file in the folder (up to 4 levels deep). */
export async function readFolder(root, prefix = '', depth = 0, out = []) {
  for await (const [name, entry] of root.entries()) {
    if (name.startsWith('.')) continue
    if (entry.kind === 'directory') {
      if (depth < 4 && !SKIP_DIRS.has(name)) await readFolder(entry, `${prefix}${name}/`, depth + 1, out)
    } else if (TEXT_FILE.test(name)) {
      const file = await entry.getFile()
      if (file.size > 5 * 1024 * 1024) continue
      out.push({ path: `${prefix}${name}`, content: await file.text(), lastModified: file.lastModified })
    }
  }
  return out
}
