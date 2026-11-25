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
