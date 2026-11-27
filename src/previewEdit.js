// Editing right in the preview: which rendered block came from which part of the Markdown,
// and converting a block's inline Markdown to editable HTML and back.
// A block is edited as formatted text only when that conversion gives back exactly the same
// Markdown; otherwise its Markdown source is edited instead (nothing is ever silently changed).
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { htmlToMarkdown } from './htmlToMarkdown'

const BLOCK_KINDS = { p: 'p', h1: 'h', h2: 'h', h3: 'h', h4: 'h', h5: 'h', h6: 'h', li: 'li', blockquote: 'quote', table: 'table', hr: 'hr', pre: 'code' }

/**
 * rehype: marks blocks with the source range they came from (offsets in the Markdown given to
 * the renderer) — data-src-from / data-src-to / data-src-kind. Paragraphs inside list items and
 * quotes aren't marked (their list item / quote is). Must run before plugins that replace nodes.
 */
export function rehypeSourceRanges() {
  return tree => {
    const walk = (node, inside) => {
      if (node.type === 'element') {
        const kind = BLOCK_KINDS[node.tagName]
        const start = node.position?.start?.offset
        const end = node.position?.end?.offset
        if (kind && Number.isInteger(start) && Number.isInteger(end) && !(kind === 'p' && inside)) {
          node.properties = { ...node.properties, dataSrcFrom: start, dataSrcTo: end, dataSrcKind: kind }
          // Code blocks render through a component that drops <pre>: keep the range on <code> too.
          if (kind === 'code') {
            const code = node.children?.find(child => child.type === 'element' && child.tagName === 'code')
            if (code) code.properties = { ...code.properties, dataSrcFrom: start, dataSrcTo: end, dataSrcKind: kind }
          }
        }
        const nested = inside || node.tagName === 'li' || node.tagName === 'blockquote'
        node.children?.forEach(child => walk(child, nested))
      } else node.children?.forEach(child => walk(child, inside))
    }
    walk(tree, false)
  }
}

// ── A block's source: prefix (marker) + inline text ───────────────
const HEADING_RE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const ITEM_RE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)(.*)$/

/** { prefix, inline } for a paragraph / heading / list item, or null if it isn't simple inline text. */
export function splitBlock(kind, source) {
  if (kind === 'p') return /^\s*$/.test(source) || /^(?:[ \t]*[-*+>#|]|[ \t]*\d+[.)][ \t]|[ \t]{4}|[ \t]*```|[ \t]*\$\$)/.test(source) ? null : { prefix: '', inline: source }
  if (kind === 'h') {
    if (source.includes('\n')) return null // setext headings: edit the source
    const match = HEADING_RE.exec(source)
    return match ? { prefix: `${match[1]} `, inline: match[2] } : null
  }
  if (kind === 'li') {
    if (source.trimEnd().includes('\n')) return null // nested lists, several paragraphs
    const match = ITEM_RE.exec(source.trimEnd())
    return match ? { prefix: match[1], inline: match[2] } : null
  }
  return null
}

/** Inline Markdown → HTML for the editor (one paragraph's children). */
export function inlineToHtml(markdown) {
  if (!markdown.trim()) return ''
  const html = String(unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify).processSync(markdown))
  // Soft line breaks show as line breaks (the preview uses remark-breaks).
  return html.trim().replace(/^<p>/, '').replace(/<\/p>$/, '').replace(/\n/g, '<br>')
}

/** Removes backslash escapes that don't change how the text renders (a_b, [[Wiki]], 50 * 2). */
export function dropNeedlessEscapes(markdown) {
  let text = markdown
  const target = inlineToHtml(text)
  let index = text.indexOf('\\')
  while (index !== -1) {
    const candidate = text.slice(0, index) + text.slice(index + 1)
    if (/[\\`*_{}[\]()#+\-.!~|<>=$^]/.test(text[index + 1] ?? '') && inlineToHtml(candidate) === target) text = candidate
    else index += 1
    index = text.indexOf('\\', index)
  }
  return text
}

/** HTML from the editor → inline Markdown (one block, no block structure). */
export function htmlToInline(html) {
  if (!String(html).replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, ' ').trim()) return ''
  // Line breaks in the block stay soft breaks; never invent new blocks.
  const markdown = htmlToMarkdown(`<p>${html}</p>`).replace(/\n{2,}/g, '\n').replace(/\\\n/g, '\n').trim()
  // Bare URLs stay bare (not "[url](url)").
  return dropNeedlessEscapes(markdown.replace(/\[(https?:\/\/[^\]\s]+)\]\(\1\)/g, '$1'))
}

/** Can this inline Markdown be edited as formatted text without changing what it shows? */
export function roundTrips(inline) {
  // Raw HTML (<kbd>, <br>, comments) isn't shown by the editor: edit those blocks as source.
  if (/<[a-zA-Z!/]/.test(inline)) return false
  try { return inlineToHtml(htmlToInline(inlineToHtml(inline))) === inlineToHtml(inline) } catch { return false }
}

/**
 * How to edit a block: { mode: 'rich', prefix, inline, html } when it round-trips, otherwise
 * { mode: 'source' } (tables use the table editor).
 */
export function editPlan(kind, source) {
  if (kind === 'table') return { mode: 'table' }
  const parts = splitBlock(kind, source)
  if (parts && roundTrips(parts.inline)) return { mode: 'rich', ...parts, html: inlineToHtml(parts.inline) }
  return { mode: 'source' }
}

/** The prefix for the block that follows this one when Enter is pressed. */
export function nextPrefix(kind, prefix) {
  if (kind !== 'li') return ''
  const numbered = /^([ \t]*)(\d+)([.)])[ \t]+/.exec(prefix)
  if (numbered) return `${numbered[1]}${Number(numbered[2]) + 1}${numbered[3]} `
  const indent = /^[ \t]*/.exec(prefix)[0]
  const marker = /[-*+]/.exec(prefix)?.[0] ?? '-'
  return `${indent}${marker} ${/\[[ xX]\]/.test(prefix) ? '[ ] ' : ''}`
}

/** What separates a block from the next one of its kind. */
export const separatorFor = kind => (kind === 'li' ? '\n' : '\n\n')

/** Heading level change: the prefix for a paragraph (0) or heading (1–6). */
export const headingPrefix = level => (level ? `${'#'.repeat(level)} ` : '')
