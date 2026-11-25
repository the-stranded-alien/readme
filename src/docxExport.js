// Markdown → Word (.docx) using the `docx` library. The Markdown is parsed to an
// mdast tree (same parser as the preview / PDF) and mapped to Word structures:
// real headings, lists with numbering, tables, hyperlinks, footnotes and images.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { CALLOUT_TYPES, parseCalloutMarker } from './rehypeCallouts'
import { renderMermaidSvgs, svgToPng } from './pdfExport'

const CALLOUT_COLORS = { note: '0969DA', tip: '1A7F37', important: '8250DF', warning: '9A6700', caution: 'CF222E' }
const ACCENT = '6D28D9'
const MONO = 'Consolas'
const MAX_IMAGE_WIDTH = 600 // px at 96 dpi ≈ 6.25in (fits A4 / Letter margins)


async function loadImageForDocx(url) {
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    // createImageBitmap can't decode SVG blobs in some browsers; fall back to <img>.
    const bitmap = await createImageBitmap(blob).catch(async () => {
      const objectUrl = URL.createObjectURL(blob)
      try {
        const img = new Image()
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = objectUrl })
        return { width: img.naturalWidth || 300, height: img.naturalHeight || 150, source: img, close: () => {} }
      } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
      }
    })
    const { width, height } = bitmap
    let type = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' }[blob.type]
    let data
    if (type) {
      data = new Uint8Array(await blob.arrayBuffer())
    } else {
      // SVG / WebP / AVIF → PNG
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(bitmap.source ?? bitmap, 0, 0, width, height)
      data = new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer())
      type = 'png'
    }
    bitmap.close?.()
    return { data, type, width, height }
  } catch {
    return null
  }
}

function fitSize(width, height) {
  const scale = Math.min(1, MAX_IMAGE_WIDTH / width)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export async function buildDocx(markdown, { title = 'Document', meta = [] } = {}) {
  const docx = await import('docx')
  const {
    AlignmentType, BorderStyle, Document, ExternalHyperlink, FootnoteReferenceRun, HeadingLevel, ImageRun,
    LevelFormat, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  } = docx

  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown)

  // Pre-load images and render Mermaid diagrams.
  const imageUrls = new Set()
  const diagrams = []
  const collect = node => {
    if (node.type === 'image' && node.url) imageUrls.add(node.url)
    if (node.type === 'code' && /^mermaid$/i.test(node.lang || '')) diagrams.push(node)
    node.children?.forEach(collect)
  }
  collect(tree)
  const images = new Map()
  await Promise.all(Array.from(imageUrls).map(async url => { const image = await loadImageForDocx(url); if (image) images.set(url, image) }))
  const diagramImages = new Map()
  if (diagrams.length) {
    const svgs = await renderMermaidSvgs(diagrams.map(node => node.value))
    await Promise.all(diagrams.map(async (node, index) => {
      const svg = svgs[index]
      if (!svg) return
      try {
        const widthPx = svg.width / 0.75
        const heightPx = svg.height / 0.75
        diagramImages.set(node, { data: await svgToPng(svg.markup, widthPx, heightPx, 2), type: 'png', width: widthPx, height: heightPx })
      } catch { /* keep the source as code */ }
    }))
  }

  // Footnotes.
  const footnoteDefs = new Map()
  const findDefs = node => { if (node.type === 'footnoteDefinition') footnoteDefs.set(node.identifier, node); node.children?.forEach(findDefs) }
  findDefs(tree)
  const footnoteIds = new Map()
  const footnotes = {}

  let orderedInstance = 0

  const inline = (nodes, style = {}) => nodes.flatMap(node => inlineNode(node, style))
  function inlineNode(node, style) {
    switch (node.type) {
      case 'text': return [new TextRun({ text: node.value.replace(/\n/g, ' '), ...style })]
      case 'strong': return inline(node.children, { ...style, bold: true })
      case 'emphasis': return inline(node.children, { ...style, italics: true })
      case 'delete': return inline(node.children, { ...style, strike: true })
      case 'inlineCode': return [new TextRun({ text: node.value, ...style, font: MONO, size: 19, color: '9F1239', shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F2F8' } })]
      case 'inlineMath': return [new TextRun({ text: node.value, ...style, italics: true, font: 'Cambria Math' })]
      case 'break': return [new TextRun({ text: '', break: 1 })]
      case 'link':
        return [new ExternalHyperlink({ link: node.url, children: inline(node.children, { ...style, color: ACCENT, underline: {} }) })]
      case 'image': {
        const image = images.get(node.url)
        if (!image) return [new TextRun({ text: `[${node.alt || 'image'}]`, ...style, italics: true, color: '6B7280' })]
        return [new ImageRun({ type: image.type, data: image.data, transformation: fitSize(image.width, image.height), altText: { title: node.alt || 'Image', description: node.alt || '', name: node.alt || 'image' } })]
      }
      case 'footnoteReference': {
        const definition = footnoteDefs.get(node.identifier)
        if (!definition) return []
        if (!footnoteIds.has(node.identifier)) {
          const id = footnoteIds.size + 1
          footnoteIds.set(node.identifier, id)
          footnotes[id] = { children: definition.children.filter(child => child.type === 'paragraph').map(p => new Paragraph({ children: inline(p.children) })) }
        }
        return [new FootnoteReferenceRun(footnoteIds.get(node.identifier))]
      }
      case 'html': return [new TextRun({ text: node.value.replace(/<[^>]+>/g, ''), ...style })]
      default: return node.children ? inline(node.children, style) : []
    }
  }

  const blocks = (nodes, ctx = {}) => nodes.flatMap(node => block(node, ctx))
  function block(node, ctx) {
    const indent = ctx.quoteLevel ? { left: 360 * ctx.quoteLevel } : undefined
    const quoteBorder = ctx.quoteColor ? { left: { style: BorderStyle.SINGLE, size: 18, color: ctx.quoteColor, space: 10 } } : undefined
    switch (node.type) {
      case 'heading':
        return [new Paragraph({ heading: HeadingLevel[`HEADING_${Math.min(6, node.depth)}`], children: inline(node.children) })]
      case 'paragraph': {
        const only = node.children.filter(child => !(child.type === 'text' && !child.value.trim()))
        const alignment = only.length === 1 && only[0].type === 'image' ? AlignmentType.CENTER : undefined
        const caption = alignment && only[0].alt ? [new Paragraph({ alignment, children: [new TextRun({ text: only[0].alt, italics: true, size: 18, color: '6B7280' })], spacing: { after: 160 } })] : []
        return [new Paragraph({ children: inline(node.children), indent, border: quoteBorder, alignment, ...(ctx.bullet ? ctx.bullet() : {}) }), ...caption]
      }
      case 'blockquote': {
        const paragraph = node.children[0]
        const first = paragraph?.type === 'paragraph' ? paragraph.children[0] : null
        const marker = first?.type === 'text' ? parseCalloutMarker(first.value) : null
        const level = (ctx.quoteLevel || 0) + 1
        if (marker) {
          const rest = first.value.slice(marker.length).replace(/^\n/, '')
          const children = [
            ...(rest || paragraph.children.length > 1 ? [{ ...paragraph, children: [...(rest ? [{ ...first, value: rest }] : []), ...paragraph.children.slice(1)] }] : []),
            ...node.children.slice(1),
          ]
          const color = CALLOUT_COLORS[marker.type]
          return [
            new Paragraph({ indent: { left: 360 * level }, border: { left: { style: BorderStyle.SINGLE, size: 18, color, space: 10 } }, children: [new TextRun({ text: marker.title || CALLOUT_TYPES[marker.type], bold: true, color })] }),
            ...blocks(children, { ...ctx, quoteLevel: level, quoteColor: color }),
          ]
        }
        return blocks(node.children, { ...ctx, quoteLevel: level, quoteColor: ctx.quoteColor || 'A78BFA' })
      }
      case 'code': {
        const diagram = diagramImages.get(node)
        if (diagram) return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: diagram.data, transformation: fitSize(diagram.width, diagram.height), altText: { title: 'Diagram', description: node.value, name: 'diagram' } })] })]
        const lines = node.value.split('\n')
        return lines.map((line, index) => new Paragraph({
          children: [new TextRun({ text: line.replace(/\t/g, '    ') || ' ', font: MONO, size: 19 })],
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F5FA' },
          spacing: { before: index === 0 ? 120 : 0, after: index === lines.length - 1 ? 160 : 0, line: 260 },
          indent,
        }))
      }
      case 'math':
        return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: node.value, italics: true, font: 'Cambria Math' })] })]
      case 'list': {
        const instance = node.ordered ? ++orderedInstance : 0
        const depth = ctx.listDepth ?? 0
        return node.children.flatMap(item => {
          const task = typeof item.checked === 'boolean' ? (item.checked ? '☒ ' : '☐ ') : ''
          let first = true
          const bullet = () => {
            if (!first) return { indent: { left: 720 * (depth + 1) } }
            first = false
            return node.ordered
              ? { numbering: { reference: 'ordered-list', level: Math.min(depth, 8), instance } }
              : { bullet: { level: Math.min(depth, 8) } }
          }
          return item.children.flatMap(child => {
            if (child.type === 'list') return block(child, { ...ctx, listDepth: depth + 1, bullet: undefined })
            if (child.type === 'paragraph' && task && first) {
              return [new Paragraph({ ...bullet(), children: [new TextRun({ text: task, font: 'Segoe UI Symbol' }), ...inline(child.children)] })]
            }
            return block(child, { ...ctx, bullet })
          })
        })
      }
      case 'table': {
        const align = node.align || []
        const columns = Math.max(...node.children.map(row => row.children.length))
        return [new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: node.children.map((row, rowIndex) => new TableRow({
            tableHeader: rowIndex === 0,
            children: Array.from({ length: columns }, (_, c) => {
              const cell = row.children[c]
              return new TableCell({
                shading: rowIndex === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F2F8' } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({
                  alignment: align[c] === 'center' ? AlignmentType.CENTER : align[c] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: cell ? inline(cell.children, rowIndex === 0 ? { bold: true } : {}) : [],
                })],
              })
            }),
          })),
        }), new Paragraph({ children: [] })]
      }
      case 'thematicBreak':
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D9DCEB', space: 1 } }, children: [] })]
      case 'html': {
        const text = node.value.replace(/<[^>]+>/g, '').trim()
        return text ? [new Paragraph({ children: [new TextRun(text)] })] : []
      }
      case 'definition':
      case 'footnoteDefinition':
      case 'yaml':
        return []
      default:
        return node.children ? blocks(node.children, ctx) : []
    }
  }

  const body = blocks(tree.children)
  const metaEntries = (meta || []).filter(entry => entry && entry.value !== '' && entry.value != null)
  const metaParagraphs = metaEntries.length ? [new Paragraph({
    spacing: { after: 240 },
    children: metaEntries.flatMap(({ key, value }, index) => [
      new TextRun({ text: `${key}: `, bold: true, color: '6B7280', size: 18 }),
      new TextRun({ text: `${Array.isArray(value) ? value.join(', ') : value}${index < metaEntries.length - 1 ? '    ' : ''}`, color: '6B7280', size: 18 }),
    ]),
  })] : []

  const levels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }))

  return new Document({
    creator: 'ReadMe',
    title,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, color: '1F2433' }, paragraph: { spacing: { after: 120, line: 300 } } } },
      paragraphStyles: [1, 2, 3, 4, 5, 6].map(level => ({
        id: `Heading${level}`, name: `Heading ${level}`, basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: [40, 32, 27, 24, 22, 21][level - 1], bold: true, color: '14172B' },
        paragraph: { spacing: { before: level <= 2 ? 320 : 220, after: 120 }, keepNext: true },
      })),
    },
    numbering: { config: [{ reference: 'ordered-list', levels }] },
    footnotes,
    sections: [{ children: [...metaParagraphs, ...body] }],
  })
}

export async function exportMarkdownDocx(markdown, { title, fileName, meta } = {}) {
  const [{ Packer }, document] = await Promise.all([import('docx'), buildDocx(markdown, { title, meta })])
  const blob = await Packer.toBlob(document)
  const a = Object.assign(window.document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName || 'document.docx' })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
