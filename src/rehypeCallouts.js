// Rehype plugin: GitHub / Obsidian style callouts.
//   > [!NOTE]            → note callout with the default title
//   > [!TIP] Pro tip     → tip callout titled "Pro tip"
// The marker is removed from the content and the blockquote gets
// data-callout / data-callout-title properties for the renderer.

export const CALLOUT_TYPES = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}
const MARKER_RE = /^\s*\[!(note|tip|important|warning|caution)\][+-]?[ \t]*([^\n]*)(\n?)/i

export function parseCalloutMarker(text) {
  const match = MARKER_RE.exec(text)
  if (!match) return null
  return { type: match[1].toLowerCase(), title: match[2].trim(), length: match[0].length, endsLine: Boolean(match[3]) }
}

const isWhitespaceText = node => node?.type === 'text' && !node.value.trim()

function transformBlockquote(node) {
  const paragraph = node.children.find(child => child.type === 'element')
  if (!paragraph || paragraph.tagName !== 'p') return
  const first = paragraph.children[0]
  if (first?.type !== 'text') return
  const marker = parseCalloutMarker(first.value)
  if (!marker) return

  first.value = first.value.slice(marker.length)
  // The marker line may end with a <br> (remark-breaks) instead of a newline.
  if (!marker.endsLine && !first.value) {
    paragraph.children.shift()
    if (paragraph.children[0]?.type === 'element' && paragraph.children[0].tagName === 'br') paragraph.children.shift()
    if (isWhitespaceText(paragraph.children[0])) paragraph.children.shift()
  }
  if (paragraph.children.every(child => isWhitespaceText(child) || (child.type === 'text' && !child.value))) {
    node.children = node.children.filter(child => child !== paragraph)
  }
  node.properties = {
    ...node.properties,
    dataCallout: marker.type,
    dataCalloutTitle: marker.title || CALLOUT_TYPES[marker.type],
  }
}

export function rehypeCallouts() {
  const walk = node => {
    if (node.type === 'element' && node.tagName === 'blockquote') transformBlockquote(node)
    node.children?.forEach(walk)
  }
  return tree => walk(tree)
}

// Rehype plugin: marks images that are the only content of their paragraph,
// so they can be rendered as captioned figures (inline images stay inline).
export function rehypeStandaloneImages() {
  const walk = node => {
    if (node.type === 'element' && node.tagName === 'p') {
      const meaningful = node.children.filter(child => !isWhitespaceText(child) && !(child.type === 'element' && child.tagName === 'br'))
      if (meaningful.length === 1 && meaningful[0].type === 'element' && meaningful[0].tagName === 'img') {
        meaningful[0].properties = { ...meaningful[0].properties, dataStandalone: true }
      }
    }
    node.children?.forEach(walk)
  }
  return tree => walk(tree)
}
