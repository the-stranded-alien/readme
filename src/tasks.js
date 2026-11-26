// Task list items across documents: "- [ ] text", "1. [x] text", inside quotes or nested lists.
// Optional markers that still read fine as Markdown:
//   due:2026-12-01  (or 📅 2026-12-01)   #tag   !high / !medium / !low
// Task items inside code blocks are ignored.

const FENCE_RE = /^\s*(?:>\s*)*(```|~~~)/
const TASK_RE = /^(\s*(?:>\s*)*)([-*+]|\d+[.)])(\s+)\[( |x|X)\](\s+|$)(.*)$/
const DUE_RE = /(?:^|\s)(?:due:|📅\s*)(\d{4}-\d{2}-\d{2})\b/
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_-]*\p{L}[\p{L}\p{N}_-]*)/gu
const PRIORITY_RE = /(?:^|\s)!(high|medium|med|low)\b/i
export const PRIORITIES = { high: 3, medium: 2, low: 1 }

/** Every task in a document: { line, offset (of the box character), checked, text, due, tags, priority, depth }. */
export function parseTasks(markdown) {
  const tasks = []
  const lines = String(markdown ?? '').split('\n')
  let offset = 0
  let fence = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = FENCE_RE.exec(line)
    if (fence) { if (fenceMatch && fenceMatch[1][0] === fence[0]) fence = null }
    else if (fenceMatch) fence = fenceMatch[1]
    else {
      const match = TASK_RE.exec(line)
      if (match) {
        const [, lead, marker, gap, box, , rest] = match
        const due = DUE_RE.exec(rest)?.[1] ?? null
        const level = PRIORITY_RE.exec(rest)?.[1]?.toLowerCase()
        const priority = level ? (level === 'med' ? 'medium' : level) : null
        const tags = [...rest.matchAll(TAG_RE)].map(tag => tag[1].toLowerCase())
        const text = rest.replace(DUE_RE, ' ').replace(PRIORITY_RE, ' ').replace(TAG_RE, ' ').replace(/\s+/g, ' ').trim()
        tasks.push({
          line: index,
          offset: offset + lead.length + marker.length + gap.length + 1,
          checked: box !== ' ',
          text: text || rest.trim(),
          raw: rest,
          due, tags, priority,
          depth: Math.floor(lead.replace(/>\s*/g, '').replace(/\t/g, '  ').length / 2),
        })
      }
    }
    offset += line.length + 1
  }
  return tasks
}

/** The document with the task box at `offset` ticked or unticked (or unchanged if it isn't a box). */
export function toggleTaskAt(markdown, offset, checked) {
  const char = markdown[offset]
  if (char !== ' ' && char !== 'x' && char !== 'X') return markdown
  if (markdown[offset - 1] !== '[' || markdown[offset + 1] !== ']') return markdown
  const next = checked ?? char === ' '
  return `${markdown.slice(0, offset)}${next ? 'x' : ' '}${markdown.slice(offset + 1)}`
}

// ── Dates ──
const DAY = 24 * 60 * 60 * 1000
const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate())
export const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function daysUntil(due, today = new Date()) {
  const [y, m, d] = due.split('-').map(Number)
  return Math.round((new Date(y, m - 1, d) - startOfDay(today)) / DAY)
}
/** "Today", "Tomorrow", "Overdue · 3 days", "Fri 5 Dec", "5 Dec 2027". */
export function dueLabel(due, today = new Date()) {
  const days = daysUntil(due, today)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `Overdue · ${-days} days`
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(y !== today.getFullYear() ? { year: 'numeric' } : { weekday: 'short' }) })
}
export function dueState(due, today = new Date()) {
  if (!due) return 'none'
  const days = daysUntil(due, today)
  return days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later'
}

/** Filters for the Tasks panel. */
export const TASK_FILTERS = [
  { id: 'open', label: 'Open', test: task => !task.checked },
  { id: 'due', label: 'Due this week', test: (task, today) => !task.checked && task.due && daysUntil(task.due, today) <= 7 },
  { id: 'overdue', label: 'Overdue', test: (task, today) => !task.checked && task.due && daysUntil(task.due, today) < 0 },
  { id: 'done', label: 'Done', test: task => task.checked },
  { id: 'all', label: 'All', test: () => true },
]

/** Sort: overdue / soonest due first, then higher priority, then document order. */
export function compareTasks(a, b, today = new Date()) {
  const due = task => (task.due ? daysUntil(task.due, today) : Infinity)
  return (Number(a.checked) - Number(b.checked)) || (due(a) - due(b)) || ((PRIORITIES[b.priority] ?? 0) - (PRIORITIES[a.priority] ?? 0))
}
