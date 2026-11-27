// Rich text (HTML from Word, Google Docs, Confluence, web pages, ReadMe's own preview) and
// spreadsheet data → clean Markdown. Loaded only when needed (paste, import).
import TurndownService from 'turndown'

const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution']
// Confluence panel types / macro names → our callout types.
const PANEL_TYPES = { info: 'note', information: 'note', note: 'note', tip: 'tip', success: 'tip', warning: 'warning', error: 'caution', caution: 'caution', important: 'important' }
const STRUCTURE = 'h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre,a[href],img,del,s,strike,hr,code,[data-panel-type],.confluence-information-macro,.markdown-alert,.callout'

const STRUCTURE_BEYOND_CODE = STRUCTURE.split(',').filter(selector => selector !== 'pre' && selector !== 'code').join(',')
const parse = html => new DOMParser().parseFromString(String(html || ''), 'text/html')

// Markdown written as plain text: headings, lists, quotes, fences, tables, **bold**, [links](…).
const MARKDOWN_SOURCE = /^(?:#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s?|```|~~~|\|.*\|\s*$)|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\)/m

/**
 * Does this HTML carry formatting worth converting (not just plain text wrapped in spans)?
 * `plain` is the clipboard's plain text: a copy from a code editor (VS Code, JetBrains, Sublime…)
 * comes with syntax-coloured HTML — that colouring isn't formatting, the plain text is the content.
 */
export function looksRich(html, plain = '') {
  if (!html || typeof DOMParser === 'undefined') return false
  const doc = parse(html)
  const structural = doc.querySelector(STRUCTURE)
  // Only a <pre>/<code> wrapper around everything still counts as "source", not formatting.
  if (!doc.querySelector(STRUCTURE_BEYOND_CODE)) {
    const box = doc.body.querySelector('[style], pre')
    const codeEditor = box && (box.tagName === 'PRE' || /monospace|white-space:\s*pre/i.test(box.getAttribute('style') || ''))
    if ((codeEditor && !structural) || MARKDOWN_SOURCE.test(plain) || (codeEditor && box.tagName === 'PRE' && MARKDOWN_SOURCE.test(box.textContent))) return false
  }
  if (structural) return true
  // Bold / italic: real tags (not Google Docs' outer wrapper) or inline styles. Plain paragraphs
  // alone aren't converted (the plain text is already right).
  const bold = [...doc.querySelectorAll('b, strong, em, i')].some(el => !/^docs-internal-guid/.test(el.id || '') && !/font-weight:\s*normal/i.test(el.getAttribute('style') || '') && el.textContent.trim())
  const styled = [...doc.querySelectorAll('span[style]')].some(el => /font-weight:\s*(bold|[6-9]00)|font-style:\s*italic/i.test(el.getAttribute('style')))
  return bold || styled
}

// ── Clean-up before converting ─────────────────────────────────
function cleanDocument(doc, baseUrl) {
  const body = doc.body
  // Comments (Word's conditional comments), scripts, styles, our own UI bits.
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT)
  const comments = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach(node => node.remove())
  body.querySelectorAll('script, style, noscript, template, meta, link, title, button, svg, o\\:p, .heading-anchor, .heading-tools, .section-toggle, .code-actions, .copy-btn, .linenumber, .react-syntax-highlighter-line-number, .table-edit, .file-tree, nav').forEach(el => el.remove())

  // Google Docs wraps everything in <b style="font-weight:normal" id="docs-internal-guid-…">.
  body.querySelectorAll('b[id^="docs-internal-guid"], b[style*="font-weight:normal"], b[style*="font-weight: normal"]').forEach(el => el.replaceWith(...el.childNodes))
  // Formatting written as inline styles (Google Docs, some editors).
  body.querySelectorAll('span[style]').forEach(span => {
    const style = span.getAttribute('style')
    let node = span
    const wrap = tag => { const el = doc.createElement(tag); node.replaceWith(el); el.appendChild(node); node = el }
    if (/font-weight:\s*(bold|[6-9]00)/i.test(style) && !span.closest('h1,h2,h3,h4,h5,h6,th,strong,b')) wrap('strong')
    if (/font-style:\s*italic/i.test(style) && !span.closest('em,i')) wrap('em')
    if (/text-decoration[^;]*line-through/i.test(style)) wrap('del')
  })

  // Word lists: paragraphs with mso-list styles and a marker span → real nested lists.
  const isWordItem = p => p?.nodeType === 1 && p.tagName === 'P' && (/mso-list/i.test(p.getAttribute('style') || '') || /MsoListParagraph/i.test(p.className))
  for (const first of [...body.querySelectorAll('p')]) {
    if (!first.isConnected || !isWordItem(first) || isWordItem(first.previousElementSibling)) continue
    const items = []
    for (let p = first; isWordItem(p); p = p.nextElementSibling) items.push(p)
    const root = doc.createElement('div')
    const stack = [{ level: 0, list: null, parent: root }]
    for (const p of items) {
      const level = Number(/level(\d+)/i.exec(p.getAttribute('style') || '')?.[1] || 1)
      const marker = p.querySelector('span[style*="mso-list:Ignore"], span[style*="mso-list: Ignore"]')
      const ordered = /^\s*(\d+|[a-z]|[ivx]+)[.)]/i.test(marker?.textContent || '')
      marker?.remove()
      while (stack.length > 1 && stack.at(-1).level > level) stack.pop()
      let top = stack.at(-1)
      if (top.level < level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul')
        const host = top.list?.lastElementChild ?? top.parent
        host.appendChild(list)
        top = { level, list, parent: host }
        stack.push(top)
      }
      const li = doc.createElement('li')
      li.innerHTML = p.innerHTML.replace(/^(\s|&nbsp;)+/, '')
      top.list.appendChild(li)
    }
    first.before(...root.childNodes)
    items.forEach(p => p.remove())
  }

  // Callouts from Confluence, GitHub and ReadMe → <blockquote data-callout="type">.
  const toCallout = (el, type, titleSelector) => {
    const quote = doc.createElement('blockquote')
    quote.setAttribute('data-callout', CALLOUT_TYPES.includes(type) ? type : 'note')
    el.querySelectorAll(titleSelector).forEach(title => {
      const text = title.textContent.trim()
      // Keep a custom title (not just "Note", "Warning"…).
      if (text && !CALLOUT_TYPES.includes(text.toLowerCase()) && !/^info(rmation)?$/i.test(text)) quote.setAttribute('data-callout-title', text)
      title.remove()
    })
    quote.append(...el.childNodes)
    el.replaceWith(quote)
  }
  body.querySelectorAll('[data-panel-type]').forEach(el => toCallout(el, PANEL_TYPES[el.getAttribute('data-panel-type')] || 'note', '.panel-header, [data-panel-title]'))
  body.querySelectorAll('.confluence-information-macro').forEach(el => {
    const type = /confluence-information-macro-(\w+)/.exec(el.className)?.[1]
    toCallout(el, PANEL_TYPES[type] || 'note', '.confluence-information-macro-icon, .title')
  })
  body.querySelectorAll('.markdown-alert').forEach(el => toCallout(el, /markdown-alert-(\w+)/.exec(el.className)?.[1] || 'note', '.markdown-alert-title'))
  body.querySelectorAll('.callout').forEach(el => toCallout(el, /callout-(note|tip|important|warning|caution)/.exec(el.className)?.[1] || 'note', '.callout-title'))

  // Relative links and images (pages imported from a URL).
  if (baseUrl) {
    body.querySelectorAll('a[href]').forEach(a => { try { a.setAttribute('href', new URL(a.getAttribute('href'), baseUrl).href) } catch { /* keep */ } })
    body.querySelectorAll('img[src]').forEach(img => { try { img.setAttribute('src', new URL(img.getAttribute('src'), baseUrl).href) } catch { /* keep */ } })
  }
  return body
}

// ── Markdown tables ─────────────────────────────────────────────
const cellText = (service, cell) => service.turndown(cell.innerHTML)
  .replace(/\n{2,}/g, '<br>').replace(/\n/g, ' ')
  .replace(/(?<!\\)\|/g, '\\|').trim()

function tableToMarkdown(service, table) {
  const rows = [...table.rows].filter(row => row.closest('table') === table)
  if (!rows.length) return ''
  const grid = rows.map(row => [...row.cells].map(cell => cellText(service, cell)))
  // Header cells are bold anyway: drop bold that wraps a whole header cell (Word, Google Docs).
  grid[0] = grid[0].map(cell => cell.replace(/^\*\*(.+)\*\*$/, '$1'))
  const columns = Math.max(...grid.map(row => row.length))
  const header = grid[0]
  const align = [...rows[0].cells].map(cell => {
    const value = (cell.getAttribute('align') || cell.style?.textAlign || '').toLowerCase()
    return value === 'center' ? ':---:' : value === 'right' ? '---:' : value === 'left' ? ':---' : '---'
  })
  const line = cells => `| ${Array.from({ length: columns }, (_, i) => cells[i] ?? '').join(' | ')} |`
  return [line(header), line(Array.from({ length: columns }, (_, i) => align[i] || '---')), ...grid.slice(1).map(line)].join('\n')
}

function createService() {
  const service = new TurndownService({
    headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', fence: '```',
    emDelimiter: '*', strongDelimiter: '**', hr: '---', linkStyle: 'inlined',
  })
  service.remove(['script', 'style', 'noscript', 'button'])
  service.addRule('strikethrough', { filter: ['del', 's', 'strike'], replacement: content => (content.trim() ? `~~${content}~~` : '') })
  service.addRule('taskListCheckbox', {
    filter: node => node.nodeName === 'INPUT' && node.type === 'checkbox',
    replacement: (_content, node) => (node.checked || node.hasAttribute('checked') ? '[x] ' : '[ ] '),
  })
  // Tidy list items: "- item" / "1. item" (not turndown's padded "-   item"), nested by the
  // marker's width, and "[x] task" with one space.
  service.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentNode
      const index = [...parent.children].filter(child => child.nodeName === 'LI').indexOf(node)
      const prefix = parent.nodeName === 'OL' ? `${Number(parent.getAttribute('start') || 1) + index}. ` : '- '
      const indent = ' '.repeat(prefix.length)
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/^\[(x| )\]\s+/, '[$1] ').replace(/\n/gm, `\n${indent}`)
      return `${prefix}${body.replace(new RegExp(`\n${indent}$`), '\n')}${node.nextSibling && !/\n$/.test(body) ? '\n' : ''}`
    },
  })
  service.addRule('table', { filter: 'table', replacement: (_content, node) => `\n\n${tableToMarkdown(service, node)}\n\n` })
  service.addRule('fencedCodeWithLanguage', {
    filter: node => node.nodeName === 'PRE',
    replacement: (_content, node) => {
      const code = node.querySelector('code') || node
      const lang = (/(?:language|lang)-([\w+#-]+)/.exec(`${code.className} ${node.className}`)?.[1]
        || node.closest('[data-language]')?.getAttribute('data-language') || node.getAttribute('data-lang') || '').toLowerCase()
      const text = code.textContent.replace(/\n$/, '')
      const fence = /```/.test(text) ? '````' : '```'
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`
    },
  })
  service.addRule('callout', {
    filter: node => node.nodeName === 'BLOCKQUOTE' && node.hasAttribute('data-callout'),
    replacement: (content, node) => {
      const type = node.getAttribute('data-callout').toUpperCase()
      const title = node.getAttribute('data-callout-title')
      const body = content.trim().split('\n').map(line => (line ? `> ${line}` : '>')).join('\n')
      return `\n\n> [!${type}]${title ? ` ${title}` : ''}\n${body}\n\n`
    },
  })
  // Images: keep alt text; an image with only a data URL stays inline (pasted screenshots).
  service.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const src = node.getAttribute('src') || ''
      if (!src) return ''
      const alt = (node.getAttribute('alt') || '').replace(/[[\]]/g, '')
      const title = node.getAttribute('title')
      return `![${alt}](${src}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`
    },
  })
  return service
}

/** HTML → Markdown. `baseUrl` resolves relative links (pages imported from a URL). */
export function htmlToMarkdown(html, { baseUrl } = {}) {
  const body = cleanDocument(parse(html), baseUrl)
  const markdown = createService().turndown(body.innerHTML)
  return markdown
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** A web page → Markdown of its main content (article / main, without menus and footers). */
export function webPageToMarkdown(html, baseUrl) {
  const doc = parse(html)
  doc.querySelectorAll('header, footer, nav, aside, form, [role="navigation"], [role="banner"], [role="contentinfo"]').forEach(el => el.remove())
  const main = doc.querySelector('article, main, [role="main"]') || doc.body
  return htmlToMarkdown(main.innerHTML, { baseUrl })
}

/** Word (.docx) → Markdown, on the device. */
export async function docxToMarkdown(arrayBuffer) {
  const mammoth = await import('mammoth/mammoth.browser')
  const { value } = await (mammoth.default ?? mammoth).convertToHtml({ arrayBuffer })
  return htmlToMarkdown(value)
}

// ── Spreadsheet data (tab- or comma-separated) ──────────────────
function splitCsvLine(line, separator) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1 } else if (char === '"') quoted = false
      else current += char
    } else if (char === '"' && !current) quoted = true
    else if (char === separator) { cells.push(current); current = '' } else current += char
  }
  cells.push(current)
  return cells
}

/** Rows of cells from tab-separated (spreadsheet copy) or CSV text, or null when it isn't tabular. */
export function parseDelimited(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (lines.length < 2) return null
  const separator = lines.every(line => line.includes('\t')) ? '\t' : lines.every(line => line.includes(',')) ? ',' : null
  if (!separator) return null
  const rows = lines.map(line => splitCsvLine(line, separator).map(cell => cell.trim()))
  const width = rows[0].length
  if (width < 2 || rows.some(row => row.length !== width)) return null
  return rows
}

export function rowsToMarkdownTable(rows) {
  const columns = Math.max(...rows.map(row => row.length))
  const escape = cell => String(cell ?? '').replace(/(?<!\\)\|/g, '\\|').replace(/\n/g, '<br>')
  const line = cells => `| ${Array.from({ length: columns }, (_, i) => escape(cells[i])).join(' | ')} |`
  return [line(rows[0]), line(Array.from({ length: columns }, () => '---')), ...rows.slice(1).map(line)].join('\n')
}
