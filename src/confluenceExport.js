// Markdown → Confluence storage format (XHTML with Confluence `ac:` / `ri:` macros).
// This is what Confluence stores pages as, so it can be pasted into a storage-format
// source editor, sent through the REST API (representation: "storage"), or imported.
//
//   code blocks   → code macro (language, title for Mermaid / math)
//   task lists    → ac:task-list
//   > [!NOTE] …   → info / tip / note / warning panels
//   images        → ac:image (ri:url for web images, ri:attachment otherwise)
//   tables, lists, headings, links, emphasis → plain XHTML
//
// `toConfluenceHtml` gives clean HTML of the same content for pasting straight into
// the Confluence editor (which converts <pre>, tables and lists on paste).
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { CALLOUT_TYPES, parseCalloutMarker } from './rehypeCallouts'

// Confluence code macro language ids for common fence names.
const LANGUAGES = {
  js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
  ts: 'typescript', tsx: 'typescript', typescript: 'typescript',
  py: 'py', python: 'py', rb: 'ruby', ruby: 'ruby', java: 'java', kotlin: 'kotlin', kt: 'kotlin', scala: 'scala', groovy: 'groovy',
  c: 'cpp', cpp: 'cpp', 'c++': 'cpp', h: 'cpp', hpp: 'cpp', cs: 'c#', csharp: 'c#', 'c#': 'c#', go: 'go', golang: 'go', rust: 'rust', rs: 'rust', swift: 'swift',
  php: 'php', perl: 'perl', pl: 'perl', r: 'r', lua: 'lua', dart: 'dart', erlang: 'erl', erl: 'erl', vb: 'vb', vbnet: 'vb', delphi: 'delphi', pascal: 'delphi',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash', console: 'bash', powershell: 'powershell', ps1: 'powershell', ps: 'powershell',
  sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql', plsql: 'sql',
  html: 'xml', xml: 'xml', svg: 'xml', xhtml: 'xml', css: 'css', scss: 'sass', sass: 'sass', less: 'css',
  json: 'json', jsonc: 'json', yaml: 'yml', yml: 'yml', toml: 'text', ini: 'text', diff: 'diff', patch: 'diff',
  graphql: 'graphql', gql: 'graphql', dockerfile: 'bash', docker: 'bash', makefile: 'bash', md: 'text', markdown: 'text', text: 'text', txt: 'text', plaintext: 'text',
}
// > [!TYPE] → Confluence panel macro.
const PANELS = { note: 'info', tip: 'tip', important: 'note', warning: 'note', caution: 'warning' }

const escapeText = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = value => escapeText(value).replace(/"/g, '&quot;')
const cdata = value => `<![CDATA[${String(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
const isWebUrl = url => /^(https?:)?\/\//i.test(url)
const fileName = url => decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop() || 'image')

/** Raw HTML from the Markdown, made well-formed XHTML (unknown or broken markup becomes text). */
function rawToXhtml(html) {
  const value = String(html)
  if (/^\s*<!--[\s\S]*-->\s*$/.test(value)) return ''
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return escapeText(value)
  const doc = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html')
  const serializer = new XMLSerializer()
  return Array.from(doc.body.childNodes)
    .filter(node => node.nodeType !== 8)
    .map(node => serializer.serializeToString(node).replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, ''))
    .join('')
}

function parse(markdown) {
  const body = String(markdown ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(body)
}

function createSerializer(tree, mode) {
  const storage = mode === 'storage'
  const definitions = new Map()
  const footnotes = []
  const footnoteIds = new Map()
  const visit = node => {
    if (node.type === 'definition') definitions.set(String(node.identifier).toLowerCase(), node)
    if (node.type === 'footnoteDefinition') footnotes.push(node)
    node.children?.forEach(visit)
  }
  visit(tree)

  const inline = nodes => {
    // Inline raw HTML comes split into opening and closing pieces: join the run, then make it well-formed.
    if (nodes.some(node => node.type === 'html')) {
      const joined = nodes.map(node => (node.type === 'html' ? node.value : inlineNode(node))).join('')
      return rawToXhtml(joined)
    }
    return nodes.map(inlineNode).join('')
  }

  const image = (url, alt, title) => {
    if (!storage) return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt || '')}"${title ? ` title="${escapeAttr(title)}"` : ''} />`
    const attrs = `${alt ? ` ac:alt="${escapeAttr(alt)}"` : ''}${title ? ` ac:title="${escapeAttr(title)}"` : ''}`
    // Web images by URL; anything else (relative paths, pasted images) as a page attachment of that name.
    const ref = isWebUrl(url) ? `<ri:url ri:value="${escapeAttr(url)}" />` : `<ri:attachment ri:filename="${escapeAttr(fileName(url))}" />`
    return `<ac:image${attrs}>${ref}</ac:image>`
  }

  function inlineNode(node) {
    switch (node.type) {
      case 'text': return escapeText(node.value)
      case 'strong': return `<strong>${inline(node.children)}</strong>`
      case 'emphasis': return `<em>${inline(node.children)}</em>`
      case 'delete': return `<del>${inline(node.children)}</del>`
      case 'inlineCode': return `<code>${escapeText(node.value)}</code>`
      case 'inlineMath': return `<code>${escapeText(node.value)}</code>`
      case 'break': return '<br />'
      case 'link': return `<a href="${escapeAttr(node.url)}"${node.title ? ` title="${escapeAttr(node.title)}"` : ''}>${inline(node.children)}</a>`
      case 'linkReference': {
        const def = definitions.get(String(node.identifier).toLowerCase())
        return def ? `<a href="${escapeAttr(def.url)}">${inline(node.children)}</a>` : escapeText(`[${node.label ?? ''}]`)
      }
      case 'image': return image(node.url, node.alt, node.title)
      case 'imageReference': {
        const def = definitions.get(String(node.identifier).toLowerCase())
        return def ? image(def.url, node.alt, def.title) : escapeText(node.alt || '')
      }
      case 'footnoteReference': {
        const id = String(node.identifier)
        if (!footnoteIds.has(id)) footnoteIds.set(id, footnoteIds.size + 1)
        return `<sup>[${footnoteIds.get(id)}]</sup>`
      }
      case 'html': return rawToXhtml(node.value)
      default: return node.children ? inline(node.children) : escapeText(node.value ?? '')
    }
  }

  const codeBlock = (code, lang, title) => {
    const language = LANGUAGES[String(lang || '').toLowerCase()] ?? (lang ? String(lang).toLowerCase() : '')
    if (!storage) return `<pre><code${language ? ` class="language-${escapeAttr(language)}"` : ''}>${escapeText(code)}</code></pre>`
    return '<ac:structured-macro ac:name="code" ac:schema-version="1">'
      + (title ? `<ac:parameter ac:name="title">${escapeText(title)}</ac:parameter>` : '')
      + (language && language !== 'text' ? `<ac:parameter ac:name="language">${escapeText(language)}</ac:parameter>` : '')
      + '<ac:parameter ac:name="linenumbers">false</ac:parameter>'
      + `<ac:plain-text-body>${cdata(code)}</ac:plain-text-body>`
      + '</ac:structured-macro>'
  }

  const listItemContent = (item, tight) => item.children.map(child => (
    tight && child.type === 'paragraph' ? inline(child.children) : block(child)
  )).join('')

  const taskList = items => {
    if (!storage) {
      return `<ul>${items.map(item => `<li>${item.checked ? '☑' : '☐'} ${listItemContent(item, true)}</li>`).join('')}</ul>`
    }
    return `<ac:task-list>${items.map(item => {
      const [first, ...rest] = item.children
      const body = first?.type === 'paragraph' ? inline(first.children) : ''
      const nested = rest.map(block).join('')
      return `<ac:task><ac:task-status>${item.checked ? 'complete' : 'incomplete'}</ac:task-status><ac:task-body>${body}${nested}</ac:task-body></ac:task>`
    }).join('')}</ac:task-list>`
  }

  const list = node => {
    const tight = !node.spread && node.children.every(item => !item.spread)
    // Consecutive task items become a task list; other items stay a normal list.
    const groups = []
    for (const item of node.children) {
      const isTask = typeof item.checked === 'boolean'
      const last = groups.at(-1)
      if (last && last.isTask === isTask) last.items.push(item)
      else groups.push({ isTask, items: [item] })
    }
    let start = node.start ?? 1
    return groups.map(group => {
      if (group.isTask) return taskList(group.items)
      const tag = node.ordered ? 'ol' : 'ul'
      const startAttr = node.ordered && start !== 1 ? ` start="${start}"` : ''
      start += group.items.length
      return `<${tag}${startAttr}>${group.items.map(item => `<li>${listItemContent(item, tight)}</li>`).join('')}</${tag}>`
    }).join('')
  }

  const table = node => {
    const align = node.align ?? []
    const rows = node.children.map((row, rowIndex) => `<tr>${row.children.map((cell, cellIndex) => {
      const tag = rowIndex === 0 ? 'th' : 'td'
      const style = align[cellIndex] ? ` style="text-align: ${align[cellIndex]};"` : ''
      return `<${tag}${style}>${inline(cell.children)}</${tag}>`
    }).join('')}</tr>`).join('')
    return `<table><tbody>${rows}</tbody></table>`
  }

  const blockquote = node => {
    const first = node.children[0]
    const text = first?.type === 'paragraph' && first.children[0]?.type === 'text' ? first.children[0].value : ''
    const marker = parseCalloutMarker(text)
    if (!marker) return `<blockquote>${node.children.map(block).join('')}</blockquote>`
    // Remove the [!TYPE] marker (and the rest of its line, which is the title).
    const rest = first.children[0].value.slice(marker.length).replace(/^\n/, '')
    const firstChildren = [{ ...first.children[0], value: rest }, ...first.children.slice(1)]
    while (firstChildren.length && ((firstChildren[0].type === 'text' && !firstChildren[0].value.trim()) || firstChildren[0].type === 'break')) firstChildren.shift()
    const children = [...(firstChildren.length ? [{ ...first, children: firstChildren }] : []), ...node.children.slice(1)]
    const title = marker.title || CALLOUT_TYPES[marker.type]
    const body = children.map(block).join('')
    if (!storage) return `<blockquote><p><strong>${escapeText(title)}</strong></p>${body}</blockquote>`
    return `<ac:structured-macro ac:name="${PANELS[marker.type]}" ac:schema-version="1">`
      + `<ac:parameter ac:name="title">${escapeText(title)}</ac:parameter>`
      + `<ac:rich-text-body>${body || '<p />'}</ac:rich-text-body></ac:structured-macro>`
  }

  function block(node) {
    switch (node.type) {
      case 'heading': return `<h${node.depth}>${inline(node.children)}</h${node.depth}>`
      case 'paragraph': return `<p>${inline(node.children)}</p>`
      case 'thematicBreak': return '<hr />'
      case 'code': return node.lang === 'mermaid' ? codeBlock(node.value, 'text', 'Mermaid diagram') : codeBlock(node.value, node.lang)
      case 'math': return codeBlock(node.value, 'text', 'Math (LaTeX)')
      case 'blockquote': return blockquote(node)
      case 'list': return list(node)
      case 'table': return table(node)
      case 'html': {
        const xhtml = rawToXhtml(node.value).trim()
        if (!xhtml) return ''
        // Block-level HTML stays as it is; inline HTML gets a paragraph.
        return /^<(div|table|ul|ol|h[1-6]|pre|blockquote|details|section|figure|hr|p)[\s/>]/i.test(xhtml) ? xhtml : `<p>${xhtml}</p>`
      }
      case 'definition': case 'footnoteDefinition': case 'yaml': return ''
      default: return node.children ? node.children.map(block).join('') : ''
    }
  }

  return () => {
    let out = tree.children.map(block).join('\n')
    const used = footnotes.filter(def => footnoteIds.has(String(def.identifier)))
      .sort((a, b) => footnoteIds.get(String(a.identifier)) - footnoteIds.get(String(b.identifier)))
    if (used.length) {
      out += `\n<hr />\n<ol>${used.map(def => `<li>${def.children.map(child => (child.type === 'paragraph' ? inline(child.children) : block(child))).join('')}</li>`).join('')}</ol>`
    }
    return out
  }
}

/** Confluence storage format (XHTML + ac: macros) for a Markdown document. */
export function toConfluenceStorage(markdown) {
  return createSerializer(parse(markdown), 'storage')()
}

/** Clean HTML of the same content, for pasting into the Confluence editor. */
export function toConfluenceHtml(markdown) {
  return createSerializer(parse(markdown), 'html')()
}

/** Wraps storage format in a root with the Confluence namespaces, so XML tools can parse it. */
export const CONFLUENCE_NAMESPACES = 'xmlns:ac="http://atlassian.com/content" xmlns:ri="http://atlassian.com/resource/identifier"'
export function isWellFormedStorage(storage) {
  if (typeof DOMParser === 'undefined') return true
  const doc = new DOMParser().parseFromString(`<root ${CONFLUENCE_NAMESPACES}>${storage}</root>`, 'application/xml')
  return !doc.getElementsByTagName('parsererror').length
}
