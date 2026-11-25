// Rehype plugin: wraps every top-level heading and the content that follows
// it (up to the next heading of the same or higher rank) in a nested
// <section>, so the preview can collapse a heading's content.

export function headingText(node) {
  if (!node) return ''
  if (node.type === 'text') return node.value
  return (node.children || []).map(headingText).join('')
}

export function headingSlug(text) {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
}

const headingLevel = node => (
  node.type === 'element' && /^h[1-6]$/.test(node.tagName) ? Number(node.tagName[1]) : 0
)

export function rehypeHeadingSections() {
  return tree => {
    const root = { children: [] }
    const stack = [{ level: 0, node: root }]
    const seen = new Map()
    const sections = []

    for (const node of tree.children) {
      const level = headingLevel(node)
      if (!level) {
        stack[stack.length - 1].node.children.push(node)
        continue
      }
      while (stack[stack.length - 1].level >= level) stack.pop()
      const slug = headingSlug(headingText(node))
      const occurrence = seen.get(slug) ?? 0
      seen.set(slug, occurrence + 1)
      const key = `${slug || 'section'}~${occurrence}`
      node.properties = { ...node.properties, dataSectionKey: key }
      const section = {
        type: 'element',
        tagName: 'section',
        properties: { dataSectionKey: key, dataLevel: level },
        children: [node],
      }
      sections.push(section)
      stack[stack.length - 1].node.children.push(section)
      stack.push({ level, node: section })
    }

    // A single top-level section (typically the document title) is never
    // collapsed by default, otherwise the whole document would disappear.
    const topLevel = root.children.filter(child => child.tagName === 'section')
    if (topLevel.length === 1) {
      topLevel[0].properties.dataTitleSection = true
      topLevel[0].children[0].properties.dataTitleSection = true
    }
    // Sections without any content besides the heading have nothing to collapse.
    for (const section of sections) {
      const hasBody = section.children.slice(1).some(child => child.type !== 'text' || child.value.trim())
      if (!hasBody) {
        section.properties.dataEmpty = true
        section.children[0].properties.dataEmpty = true
      }
    }

    tree.children = root.children
  }
}
