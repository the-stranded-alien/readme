// Markdown → PDF using pdfmake. The markdown is parsed into an mdast tree and
// translated into a pdfmake document definition, so the PDF contains real,
// selectable text with consistent typography instead of a screenshot or the
// browser's print layout.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

const COLORS = {
  text: '#1f2433',
  muted: '#5b6178',
  heading: '#14172b',
  accent: '#6d28d9',
  rule: '#d9dceb',
  codeBg: '#f4f5fa',
  codeBorder: '#dfe2f0',
  quoteBg: '#f6f3fd',
  tableHeadBg: '#f1f2f8',
}
const HEADING_SIZES = [22, 17, 14, 12.5, 11.5, 11]
const BASE_SIZE = 10.5
const CODE_SIZE = 9
const CONTENT_WIDTH = 595.28 - 2 * 54 // A4 width minus horizontal margins

// Roboto (bundled) has no emoji glyphs; strip them rather than print tofu boxes.
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3/gu
// ©, ®, ™ and similar low code points are pictographic too but Roboto has them.
const cleanText = value => String(value ?? '').replace(EMOJI_RE, match => (match.codePointAt(0) < 0x2190 ? match : ''))
// The built-in Courier font only covers WinAnsi (Latin-1 + a few symbols).
const WINANSI_EXTRA = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC])
const isCourierSafe = value => Array.from(value).every(char => {
  const code = char.codePointAt(0)
  return code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF) || WINANSI_EXTRA.has(code)
})
const monoFont = value => (isCourierSafe(value) ? 'Courier' : 'Roboto')

function plainText(node) {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  return (node.children || []).map(plainText).join('')
}

function stripHtml(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

function createConverter({ images, footnoteOrder }) {
  const inline = (nodes, style = {}) => nodes.flatMap(node => inlineNode(node, style))

  function inlineNode(node, style) {
    switch (node.type) {
      case 'text':
        return [{ text: cleanText(node.value), ...style }]
      case 'strong':
        return inline(node.children, { ...style, bold: true })
      case 'emphasis':
        return inline(node.children, { ...style, italics: true })
      case 'delete':
        return inline(node.children, { ...style, decoration: 'lineThrough' })
      case 'inlineCode': {
        const value = cleanText(node.value)
        return [{ text: `\u00A0${value}\u00A0`, ...style, font: monoFont(value), fontSize: CODE_SIZE, background: COLORS.codeBg, color: '#9f1239' }]
      }
      case 'inlineMath':
        return [{ text: cleanText(node.value), ...style, italics: true, color: COLORS.muted }]
      case 'break':
        return [{ text: '\n' }]
      case 'link':
        return inline(node.children, { ...style, color: COLORS.accent, decoration: 'underline', link: node.url })
      case 'image': {
        const alt = cleanText(node.alt || 'image')
        return [{ text: `[${alt}]`, ...style, italics: true, color: COLORS.muted }]
      }
      case 'footnoteReference': {
        let index = footnoteOrder.indexOf(node.identifier)
        if (index === -1) index = footnoteOrder.push(node.identifier) - 1
        return [{ text: `[${index + 1}]`, ...style, fontSize: 7.5, color: COLORS.accent, sup: true }]
      }
      case 'html':
        return [{ text: cleanText(stripHtml(node.value)), ...style }]
      default:
        return node.children ? inline(node.children, style) : []
    }
  }

  const blocks = nodes => nodes.flatMap(block).filter(Boolean)

  function paragraph(node) {
    // A paragraph holding only an image renders the image itself when it could be loaded.
    const meaningful = node.children.filter(child => !(child.type === 'text' && !child.value.trim()))
    if (meaningful.length === 1 && meaningful[0].type === 'image' && images.has(meaningful[0].url)) {
      const image = images.get(meaningful[0].url)
      return {
        image: image.dataUrl,
        width: Math.min(CONTENT_WIDTH, image.width * 0.75),
        alignment: 'center',
        margin: [0, 4, 0, 10],
      }
    }
    return { text: inline(node.children), margin: [0, 0, 0, 8] }
  }

  function codeBlock(value, lang) {
    const code = cleanText(value).replace(/\t/g, '    ')
    const stack = []
    if (lang) stack.push({ text: lang.toUpperCase(), fontSize: 7, bold: true, color: COLORS.muted, margin: [0, 0, 0, 3] })
    stack.push({ text: code || ' ', font: monoFont(code), fontSize: CODE_SIZE, lineHeight: 1.25, preserveLeadingSpaces: true, color: '#1f2433' })
    return {
      table: { widths: ['*'], body: [[{ stack, fillColor: COLORS.codeBg }]] },
      layout: {
        hLineColor: () => COLORS.codeBorder,
        vLineColor: () => COLORS.codeBorder,
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        paddingLeft: () => 9,
        paddingRight: () => 9,
        paddingTop: () => 7,
        paddingBottom: () => 7,
      },
      margin: [0, 2, 0, 10],
    }
  }

  function list(node) {
    const items = node.children.map(item => {
      const content = blocks(item.children)
      if (typeof item.checked === 'boolean') {
        const box = { text: item.checked ? '[x] ' : '[ ] ', font: 'Courier', fontSize: CODE_SIZE, color: COLORS.accent }
        if (content[0]?.text) content[0] = { ...content[0], text: [box, ...[].concat(content[0].text)] }
        else content.unshift({ text: [box] })
      }
      // Tighten spacing between list items.
      const last = content[content.length - 1]
      if (last && !node.spread && Array.isArray(last.margin)) content[content.length - 1] = { ...last, margin: [last.margin[0], last.margin[1], last.margin[2], 3] }
      return content.length === 1 ? content[0] : { stack: content }
    })
    const allTasks = node.children.length > 0 && node.children.every(item => typeof item.checked === 'boolean')
    if (node.ordered) return { ol: items, start: node.start ?? 1, margin: [0, 0, 0, 8] }
    return { ul: items, ...(allTasks ? { type: 'none' } : {}), markerColor: COLORS.accent, margin: [0, 0, 0, 8] }
  }

  function table(node) {
    const align = node.align || []
    const body = node.children.map((row, rowIndex) => row.children.map((cell, cellIndex) => ({
      text: inline(cell.children),
      bold: rowIndex === 0,
      fillColor: rowIndex === 0 ? COLORS.tableHeadBg : null,
      alignment: align[cellIndex] || 'left',
      fontSize: BASE_SIZE - 0.5,
    })))
    const columns = Math.max(...body.map(row => row.length))
    body.forEach(row => { while (row.length < columns) row.push({ text: '' }) })
    return {
      table: { headerRows: 1, widths: Array(columns).fill('*'), body, dontBreakRows: true },
      layout: {
        hLineColor: () => COLORS.rule,
        vLineColor: () => COLORS.rule,
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 2, 0, 10],
    }
  }

  function block(node) {
    switch (node.type) {
      case 'heading': {
        const size = HEADING_SIZES[node.depth - 1] ?? BASE_SIZE
        const heading = {
          text: inline(node.children),
          fontSize: size,
          bold: true,
          color: COLORS.heading,
          margin: [0, node.depth <= 2 ? 14 : 10, 0, node.depth <= 2 ? 3 : 5],
        }
        if (node.depth > 2) return { ...heading, headlineLevel: node.depth }
        return {
          headlineLevel: node.depth,
          stack: [heading, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: node.depth === 1 ? 1 : 0.6, lineColor: COLORS.rule }], margin: [0, 0, 0, 9] }],
          unbreakable: true,
        }
      }
      case 'paragraph':
        return paragraph(node)
      case 'blockquote':
        return {
          table: { widths: ['*'], body: [[{ stack: blocks(node.children), fillColor: COLORS.quoteBg, color: COLORS.muted, italics: true }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: index => (index === 0 ? 2.5 : 0),
            vLineColor: () => COLORS.accent,
            paddingLeft: () => 11,
            paddingRight: () => 9,
            paddingTop: () => 7,
            paddingBottom: () => 0,
          },
          margin: [0, 2, 0, 10],
        }
      case 'code':
        return codeBlock(node.value, node.lang)
      case 'math':
        return { text: cleanText(node.value), italics: true, alignment: 'center', color: COLORS.muted, margin: [0, 4, 0, 10] }
      case 'list':
        return list(node)
      case 'table':
        return table(node)
      case 'thematicBreak':
        return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.8, lineColor: COLORS.rule }], margin: [0, 8, 0, 14] }
      case 'html': {
        const text = cleanText(stripHtml(node.value)).trim()
        return text ? { text, margin: [0, 0, 0, 8] } : null
      }
      case 'definition':
      case 'footnoteDefinition':
      case 'yaml':
        return null
      default:
        return node.children ? blocks(node.children) : null
    }
  }

  return { blocks }
}

async function loadImage(url) {
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    bitmap.close?.()
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
  } catch {
    return null
  }
}

async function collectImages(tree) {
  const urls = new Set()
  const walk = node => {
    if (node.type === 'image' && node.url) urls.add(node.url)
    node.children?.forEach(walk)
  }
  walk(tree)
  const images = new Map()
  await Promise.all(Array.from(urls).map(async url => {
    const image = await loadImage(url)
    if (image) images.set(url, image)
  }))
  return images
}

export async function buildPdfDefinition(markdown, { title = 'Document', meta = [] } = {}) {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown)
  const images = typeof document !== 'undefined' ? await collectImages(tree) : new Map()
  const footnoteOrder = []
  const { blocks } = createConverter({ images, footnoteOrder })
  const content = blocks(tree.children)

  const metaEntries = (Array.isArray(meta) ? meta.map(({ key, value }) => [key, value]) : Object.entries(meta))
    .filter(([, value]) => value !== '' && value != null && !(Array.isArray(value) && value.length === 0))
  if (metaEntries.length) {
    content.unshift({
      text: metaEntries.map(([key, value], index) => [
        { text: `${key}: `, bold: true, color: COLORS.muted },
        { text: `${cleanText(Array.isArray(value) ? value.join(', ') : value)}${index < metaEntries.length - 1 ? '    ' : ''}`, color: COLORS.muted },
      ]).flat(),
      fontSize: 8.5,
      margin: [0, 0, 0, 12],
    })
  }

  const definitions = new Map()
  const findDefinitions = node => {
    if (node.type === 'footnoteDefinition') definitions.set(node.identifier, node)
    node.children?.forEach(findDefinitions)
  }
  findDefinitions(tree)
  if (footnoteOrder.length) {
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.6, lineColor: COLORS.rule }], margin: [0, 12, 0, 6] })
    footnoteOrder.forEach((id, index) => {
      const definition = definitions.get(id)
      if (!definition) return
      content.push({ text: [{ text: `${index + 1}. `, bold: true }, cleanText(plainText(definition))], fontSize: 8.5, color: COLORS.muted, margin: [0, 0, 0, 3] })
    })
  }

  return {
    info: { title: cleanText(title), creator: 'ReadMe' },
    pageSize: 'A4',
    pageMargins: [54, 54, 54, 60],
    defaultStyle: { font: 'Roboto', fontSize: BASE_SIZE, lineHeight: 1.35, color: COLORS.text },
    content: content.length ? content : [{ text: ' ' }],
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: cleanText(title), alignment: 'left', fontSize: 8, color: '#9aa0b8' },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 8, color: '#9aa0b8' },
      ],
      margin: [54, 24, 54, 0],
    }),
    pageBreakBefore: (node, following) => (
      // Keep headings from being stranded at the bottom of a page.
      Boolean(node.headlineLevel) && (following.getFollowingNodesOnPage?.() ?? following.followingNodesOnPage ?? [null]).length === 0
    ),
  }
}

let pdfMakePromise
function loadPdfMake() {
  pdfMakePromise ??= Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    import('pdfmake/build/standard-fonts/Courier'),
  ]).then(([pdfMakeModule, vfsModule, courierModule]) => {
    const pdfMake = pdfMakeModule.default ?? pdfMakeModule
    pdfMake.addVirtualFileSystem(vfsModule.default ?? vfsModule)
    pdfMake.addFontContainer(courierModule.default ?? courierModule)
    return pdfMake
  })
  return pdfMakePromise
}

export async function exportMarkdownPdf(markdown, { title, fileName, meta } = {}) {
  const [pdfMake, definition] = await Promise.all([loadPdfMake(), buildPdfDefinition(markdown, { title, meta })])
  await pdfMake.createPdf(definition).download(fileName || 'document.pdf')
}
