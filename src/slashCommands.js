// Slash commands for the editor: "/" at the start of a line opens a menu of
// Markdown snippets. In snippets, ‹text› marks a selected placeholder and | marks
// where the caret goes.

const today = () => new Date().toISOString().slice(0, 10)
const now = () => new Date().toTimeString().slice(0, 5)

export const SLASH_COMMANDS = [
  { id: 'h1', label: 'Heading 1', keywords: 'title h1', icon: 'Heading1', snippet: '# ‹Heading›' },
  { id: 'h2', label: 'Heading 2', keywords: 'section h2', icon: 'Heading2', snippet: '## ‹Heading›' },
  { id: 'h3', label: 'Heading 3', keywords: 'subsection h3', icon: 'Heading3', snippet: '### ‹Heading›' },
  { id: 'bullet', label: 'Bulleted list', keywords: 'ul unordered bullet', icon: 'List', snippet: '- |' },
  { id: 'numbered', label: 'Numbered list', keywords: 'ol ordered number', icon: 'ListOrdered', snippet: '1. |' },
  { id: 'checklist', label: 'Checklist', keywords: 'todo task checkbox', icon: 'ListChecks', snippet: '- [ ] |' },
  { id: 'quote', label: 'Quote', keywords: 'blockquote cite', icon: 'Quote', snippet: '> |' },
  { id: 'table', label: 'Table', keywords: 'grid columns rows', icon: 'Table', snippet: '| ‹Column 1› | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |' },
  { id: 'code', label: 'Code block', keywords: 'pre fence snippet', icon: 'SquareCode', snippet: '```‹language›\n\n```' },
  { id: 'mermaid', label: 'Mermaid diagram', keywords: 'flowchart chart graph diagram', icon: 'Workflow', snippet: '```mermaid\nflowchart LR\n  A[‹Start›] --> B[Next step]\n  B --> C[Done]\n```' },
  { id: 'note', label: 'Callout: Note', keywords: 'admonition info callout', icon: 'Info', snippet: '> [!NOTE]\n> |' },
  { id: 'tip', label: 'Callout: Tip', keywords: 'admonition hint callout', icon: 'Lightbulb', snippet: '> [!TIP]\n> |' },
  { id: 'warning', label: 'Callout: Warning', keywords: 'admonition caution callout', icon: 'TriangleAlert', snippet: '> [!WARNING]\n> |' },
  { id: 'image', label: 'Image', keywords: 'picture photo img', icon: 'Image', snippet: '![‹description›](https://)' },
  { id: 'link', label: 'Link', keywords: 'url href', icon: 'Link', snippet: '[‹text›](https://)' },
  { id: 'divider', label: 'Divider', keywords: 'hr rule separator line', icon: 'Minus', snippet: '---\n|' },
  { id: 'footnote', label: 'Footnote', keywords: 'reference note', icon: 'Superscript', snippet: '[^‹1›]' },
  { id: 'math', label: 'Math block', keywords: 'latex equation formula katex', icon: 'Sigma', snippet: '$$\n|\n$$' },
  { id: 'date', label: "Today's date", keywords: 'today now day', icon: 'CalendarDays', snippet: () => `${today()}|` },
  { id: 'time', label: 'Current time', keywords: 'clock now', icon: 'Clock', snippet: () => `${now()}|` },
]

export function filterSlashCommands(query) {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS
    .map(command => {
      const label = command.label.toLowerCase()
      const score = label.startsWith(q) ? 3 : label.includes(q) ? 2 : command.keywords.includes(q) || command.id.startsWith(q) ? 1 : 0
      return { command, score }
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.command)
}

/** Detects "/query" typed at the start of a line (after optional indentation). */
export function detectSlash(value, caret) {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const before = value.slice(lineStart, caret)
  const match = /^(\s*)\/([\w-]{0,24})$/.exec(before)
  if (!match) return null
  // Not inside a fenced code block.
  const fences = value.slice(0, lineStart).match(/^\s*(```|~~~)/gm)
  if (fences && fences.length % 2 === 1) return null
  return { from: lineStart + match[1].length, to: caret, query: match[2] }
}

/** Expands a snippet into the text to insert plus the caret / selection inside it. */
export function expandSnippet(command, from) {
  let snippet = typeof command.snippet === 'function' ? command.snippet() : command.snippet
  let selStart
  let selEnd
  const placeholder = /‹([^›]*)›/.exec(snippet)
  if (placeholder) {
    selStart = placeholder.index
    selEnd = selStart + placeholder[1].length
    snippet = snippet.replace(/‹([^›]*)›/, '$1')
  } else {
    selStart = snippet.indexOf('|')
    if (selStart === -1) selStart = snippet.length
    snippet = snippet.replace('|', '')
    selEnd = selStart
  }
  return { text: snippet, cursor: from + selStart, cursorEnd: from + selEnd }
}

/** Pixel position of a caret inside a <textarea>, measured with a mirror element. */
export function textareaCaretRect(textarea, position) {
  const style = getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const props = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
    'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'wordSpacing', 'textIndent', 'tabSize', 'whiteSpace', 'wordWrap', 'overflowWrap']
  for (const prop of props) mirror.style[prop] = style[prop]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.textContent = textarea.value.slice(0, position)
  const marker = document.createElement('span')
  marker.textContent = '​'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const box = textarea.getBoundingClientRect()
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6
  const rect = {
    left: box.left + marker.offsetLeft - textarea.scrollLeft,
    top: box.top + marker.offsetTop - textarea.scrollTop,
    height: lineHeight,
  }
  mirror.remove()
  return rect
}

/** Caret rectangle for either editor (textarea or the CodeMirror adapter). */
export function editorCaretRect(editor, position) {
  if (editor?.view?.coordsAtPos) {
    const coords = editor.view.coordsAtPos(position)
    return coords ? { left: coords.left, top: coords.top, height: coords.bottom - coords.top } : null
  }
  if (editor instanceof HTMLTextAreaElement) return textareaCaretRect(editor, position)
  return null
}
