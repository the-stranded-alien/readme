// Rehype plugin: ==text== becomes a highlight; =={green}text== picks a colour.
export const MARK_COLORS = [
  { id: 'yellow', label: 'Yellow', swatch: '#fde047' },
  { id: 'green', label: 'Green', swatch: '#86efac' },
  { id: 'blue', label: 'Blue', swatch: '#93c5fd' },
  { id: 'pink', label: 'Pink', swatch: '#f9a8d4' },
  { id: 'purple', label: 'Purple', swatch: '#c4b5fd' },
  { id: 'orange', label: 'Orange', swatch: '#fdba74' },
]
const COLOR_IDS = MARK_COLORS.map(color => color.id).join('|')
const MARK_RE = new RegExp(`==(?:\\{(${COLOR_IDS})\\})?([^=\\s](?:[^\\n]*?[^=\\s])?)==`, 'g')
const SKIP = new Set(['code', 'pre', 'script', 'style', 'kbd', 'math'])

function splitText(value) {
  const parts = []
  let last = 0
  MARK_RE.lastIndex = 0
  for (let match = MARK_RE.exec(value); match; match = MARK_RE.exec(value)) {
    if (match.index > last) parts.push({ type: 'text', value: value.slice(last, match.index) })
    const color = match[1] || 'yellow'
    parts.push({
      type: 'element', tagName: 'mark',
      properties: { className: ['md-mark', `md-mark-${color}`], dataColor: color },
      children: [{ type: 'text', value: match[2] }],
    })
    last = match.index + match[0].length
  }
  if (!parts.length) return null
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
  return parts
}

export function rehypeMarks() {
  const visit = node => {
    if (!node.children || (node.type === 'element' && SKIP.has(node.tagName))) return
    if (node.type === 'element' && (node.properties?.className || []).includes?.('katex')) return
    const next = []
    let changed = false
    for (const child of node.children) {
      if (child.type === 'text' && child.value.includes('==')) {
        const parts = splitText(child.value)
        if (parts) { next.push(...parts); changed = true; continue }
      }
      visit(child)
      next.push(child)
    }
    if (changed) node.children = next
  }
  return tree => visit(tree)
}
