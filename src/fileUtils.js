export function makeDuplicateFileName(name, existingNames) {
  const dot = name.lastIndexOf('.')
  const hasExtension = dot > 0
  const stem = hasExtension ? name.slice(0, dot) : name
  const extension = hasExtension ? name.slice(dot) : ''
  const used = new Set(existingNames.map(value => value.toLocaleLowerCase()))
  let suffix = 1
  let candidate
  do {
    candidate = `${stem} copy${suffix > 1 ? ` ${suffix}` : ''}${extension}`
    suffix += 1
  } while (used.has(candidate.toLocaleLowerCase()))
  return candidate
}

export const FILE_LABEL_COLORS = [
  { id: 'red', name: 'Red', value: '#e5484d' },
  { id: 'orange', name: 'Orange', value: '#f76b15' },
  { id: 'yellow', name: 'Yellow', value: '#d4a017' },
  { id: 'green', name: 'Green', value: '#30a46c' },
  { id: 'blue', name: 'Blue', value: '#0090ff' },
  { id: 'purple', name: 'Purple', value: '#8e4ec6' },
]
export const labelColor = id => FILE_LABEL_COLORS.find(color => color.id === id)?.value

export const TAB_DRAG_TYPE = 'application/x-readme-tab'

export function isDiskBacked(file) {
  return Boolean(file.diskHandle) || typeof file.diskSavedContent === 'string'
}
export function isModifiedFromDisk(file) {
  return typeof file.diskSavedContent === 'string' && file.content !== file.diskSavedContent
}

// Subsequence fuzzy match: higher score for consecutive and early matches.
export function fuzzyScore(query, text) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct !== -1) return 1000 - direct * 2 - (t.length - q.length) * 0.1
  let score = 0
  let ti = 0
  let streak = 0
  // Spaces separate words in the query; they are not required characters.
  for (const char of q.replace(/\s+/g, '')) {
    const found = t.indexOf(char, ti)
    if (found === -1) return -1
    streak = found === ti ? streak + 1 : 0
    score += 10 + streak * 5 - Math.min(found - ti, 10)
    ti = found + 1
  }
  return score
}

// ── Links between workspace files ("notes/plan.md" style names) ──
export const FILE_DRAG_TYPE = 'application/x-readme-file'

/** Relative link from one workspace file to another, URL-encoded per segment. */
export function relativeFileLink(fromName, toName) {
  const from = String(fromName || '').split('/').slice(0, -1)
  const to = String(toName || '').split('/')
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1
  const parts = [...from.slice(common).map(() => '..'), ...to.slice(common)]
  return parts.map(part => encodeURIComponent(part)).join('/')
}

/** Workspace name a relative .md link points to (or null for web links, anchors, other files). */
export function resolveFileLink(fromName, href) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return null
  const [pathPart, anchor = ''] = href.split('#')
  let path
  try { path = decodeURIComponent(pathPart.split('?')[0]) } catch { path = pathPart }
  if (!/\.(md|markdown|mdx|txt)$/i.test(path)) return null
  const parts = path.startsWith('/') ? [] : String(fromName || '').split('/').slice(0, -1)
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return { name: parts.join('/'), anchor }
}

/** Link text for a file: its first heading, or its name without the extension. */
export function fileLinkTitle(file) {
  const heading = String(file?.content || '').match(/^#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1]
  return (heading || String(file?.name || '').split('/').pop().replace(/\.[^.]+$/, '')).replace(/[[\]]/g, '')
}
