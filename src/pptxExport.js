// Slides → PowerPoint (.pptx), 16:9 like presentation mode.
// Each slide: its first heading as the title, then text (paragraphs, lists, quotes, callouts,
// code) in one text box, with tables, images and Mermaid diagrams placed below or beside it.
// Speaker notes (text after `???`) become the slide's notes. Loaded only when exporting.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { CALLOUT_TYPES, parseCalloutMarker } from './rehypeCallouts'
import { collectImages, renderMermaidSvgs, svgToPng } from './pdfExport'

const W = 10, H = 5.625 // inches (LAYOUT_16x9)
const INSET = 0.22, PAD_X = 0.62, TITLE_Y = 0.5, TITLE_H = 0.8
const BODY_Y = 1.4, BODY_W = W - 2 * PAD_X, BODY_H = H - BODY_Y - 0.5
const TEXT = '1F2433', MUTED = '5B6178', CODE_BG = 'F4F5FA'
const CALLOUT_COLORS = { note: '0969DA', tip: '1A7F37', important: '8250DF', warning: '9A6700', caution: 'CF222E' }
// FONT follows the document style for the deck being exported.
let FONT = 'Calibri'
const MONO = 'Consolas'
const GAP = 0.12, MIN_PICTURE = 1.6, TABLE_SIZE = 12
const PT = 1 / 72

// Estimated height (inches) of one paragraph of runs in a box `width` inches wide.
function paragraphHeight(paragraphRuns, width) {
  const first = paragraphRuns[0]?.options ?? {}
  const size = paragraphRuns.find(run => run.options.fontSize)?.options.fontSize ?? 18
  const mono = paragraphRuns.some(run => run.options.fontFace === MONO)
  const indent = (first.bullet ? 0.35 : 0) + (first.indentLevel || 0) * 0.35
  const usable = Math.max(1, width - indent - 0.1)
  const charWidth = size * (mono ? 0.6 : 0.49) * PT // Calibri averages ~0.47em per character
  const segments = ['']
  for (const run of paragraphRuns) {
    if (run.options.softBreakBefore) segments.push('')
    segments[segments.length - 1] += run.text
  }
  const lines = segments.reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length * charWidth / usable)), 0)
  return lines * size * 1.2 * PT + ((first.paraSpaceBefore || 0) + (first.paraSpaceAfter ?? 6)) * PT
}
// Estimated height of a table row: its tallest cell.
function tableRowHeight(row, columnWidth) {
  const charWidth = TABLE_SIZE * 0.47 * PT
  const lines = Math.max(1, ...row.children.map(cell => Math.ceil(runs(cell.children).map(run => run.text).join('').length * charWidth / Math.max(0.3, columnWidth - 0.2))))
  return lines * TABLE_SIZE * 1.2 * PT + 0.12
}

const hex = color => String(color || '#6d28d9').replace('#', '').slice(0, 6).toUpperCase()

const bytesToDataUrl = bytes => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(binary)}`
}
const svgSize = markup => ({
  width: Number(/\swidth="([\d.]+)/.exec(markup)?.[1]) || 600,
  height: Number(/\sheight="([\d.]+)/.exec(markup)?.[1]) || 400,
})

/** Inline Markdown → pptxgenjs text runs. */
function runs(nodes, style = {}) {
  return nodes.flatMap(node => {
    switch (node.type) {
      // A line break inside a paragraph (shown as a new line in ReadMe) becomes a soft break.
      case 'text': return node.value.split('\n').map((part, index) => ({ text: part, options: { ...style, ...(index > 0 ? { softBreakBefore: true } : {}) } }))
      case 'strong': return runs(node.children, { ...style, bold: true })
      case 'emphasis': return runs(node.children, { ...style, italic: true })
      case 'delete': return runs(node.children, { ...style, strike: 'sngStrike' })
      case 'inlineCode': return [{ text: node.value, options: { ...style, fontFace: MONO, color: '9F1239' } }]
      case 'inlineMath': return [{ text: node.value, options: { ...style, italic: true, color: MUTED } }]
      case 'break': return [{ text: '', options: { ...style, breakLine: true } }]
      case 'link': return runs(node.children, { ...style, hyperlink: { url: node.url }, color: style.color ?? '1D4ED8' })
      case 'image': return [{ text: node.alt ? `[${node.alt}]` : '', options: { ...style, color: MUTED } }]
      case 'footnoteReference': return []
      default: return node.children ? runs(node.children, style) : node.value ? [{ text: node.value, options: style }] : []
    }
  })
}

// Paragraph-level options go on the first run only (on every run, PowerPoint would start a new
// paragraph — a new bullet — for each bold word); run styles like colour go on every run.
const PARAGRAPH_KEYS = ['bullet', 'indentLevel', 'align', 'paraSpaceBefore', 'paraSpaceAfter']
/** One paragraph of runs; its last run ends the line. */
function paragraph(items, options = {}) {
  // pptxgenjs drops empty runs (and their line breaks): move a break onto the next run with text.
  const cleaned = []
  let pendingBreak = false
  for (const item of items) {
    if (item.text === '') { pendingBreak ||= Boolean(item.options?.softBreakBefore); continue }
    cleaned.push(pendingBreak ? { ...item, options: { ...item.options, softBreakBefore: true } } : item)
    pendingBreak = false
  }
  const list = cleaned.length ? cleaned : [{ text: ' ', options: {} }]
  const runStyle = Object.fromEntries(Object.entries(options).filter(([key]) => !PARAGRAPH_KEYS.includes(key)))
  const paraStyle = Object.fromEntries(Object.entries(options).filter(([key]) => PARAGRAPH_KEYS.includes(key)))
  return list.map((item, index) => ({
    text: item.text,
    options: { ...runStyle, ...item.options, ...(index === 0 ? paraStyle : {}), ...(index === list.length - 1 ? { breakLine: true } : {}) },
  }))
}

/** Splits a slide's Markdown into a title, text paragraphs and "visuals" (tables, images, diagrams). */
function layoutSlide(tree, accent) {
  let title = null
  const text = []
  const visuals = []
  // Everything in order, for paginating: { kind: 'text', runs } per paragraph, or a visual.
  const flow = []
  const addText = items => {
    text.push(...items)
    let current = []
    for (const item of items) {
      current.push(item)
      if (item.options.breakLine) { flow.push({ kind: 'text', runs: current }); current = [] }
    }
    if (current.length) flow.push({ kind: 'text', runs: current })
  }
  const addVisual = visual => { visuals.push(visual); flow.push(visual) }
  const block = (node, depth = 0, quote = null) => {
    switch (node.type) {
      case 'heading':
        if (!title && depth === 0) { title = { runs: runs(node.children), depth: node.depth }; return }
        addText(paragraph(runs(node.children), { bold: true, fontSize: node.depth <= 2 ? 22 : 19, color: hex(accent), paraSpaceBefore: 6 }))
        return
      case 'paragraph': {
        const images = node.children.filter(child => child.type === 'image')
        // Whitespace between images is dropped, but a line break ("\n") between links or words is kept.
        const rest = node.children.filter(child => child.type !== 'image' && !(child.type === 'text' && !child.value.trim() && !child.value.includes('\n')))
        images.forEach(image => addVisual({ kind: 'image', url: image.url, alt: image.alt }))
        if (rest.length) addText(paragraph(runs(rest), { indentLevel: depth, ...(quote ? { color: quote.color, italic: !quote.callout } : {}) }))
        return
      }
      case 'list': {
        node.children.forEach((item, index) => {
          const prefix = typeof item.checked === 'boolean' ? (item.checked ? '☑ ' : '☐ ') : ''
          const [first, ...rest] = item.children
          // Task items show a check box instead of a bullet; numbered lists keep their start number.
          const bullet = typeof item.checked === 'boolean' ? false
            // Each numbered item states its own number, so every app shows 1, 2, 3 (not 1, 1, 1).
            : node.ordered ? { type: 'number', numberStartAt: (node.start ?? 1) + index } : true
          const content = first?.type === 'paragraph' ? runs(first.children) : []
          addText(paragraph([{ text: prefix, options: {} }, ...content].filter(run => run.text !== ''), { bullet, indentLevel: depth }))
          rest.forEach(child => block(child, depth + 1, quote))
        })
        return
      }
      case 'blockquote': {
        const first = node.children[0]
        const marker = first?.type === 'paragraph' && first.children[0]?.type === 'text' ? parseCalloutMarker(first.children[0].value) : null
        if (marker) {
          const color = CALLOUT_COLORS[marker.type]
          addText(paragraph([{ text: marker.title || CALLOUT_TYPES[marker.type], options: { bold: true, color } }]))
          const remaining = first.children[0].value.slice(marker.length).replace(/^\n/, '')
          const firstRest = [{ ...first.children[0], value: remaining }, ...first.children.slice(1)].filter(child => !(child.type === 'text' && !child.value.trim()) && child.type !== 'break')
          if (firstRest.length) block({ ...first, children: firstRest }, depth, { color: TEXT, callout: true })
          node.children.slice(1).forEach(child => block(child, depth, { color: TEXT, callout: true }))
          return
        }
        node.children.forEach(child => block(child, depth, { color: MUTED }))
        return
      }
      case 'code':
        if (node.lang === 'mermaid') { addVisual({ kind: 'mermaid', source: node.value }); return }
        addText(node.value.split('\n').map((line, index, all) => ({
          // Code lines sit tight together (pptxgenjs treats 0 as "unset", so use a hair of space).
          text: line || ' ', options: { fontFace: MONO, fontSize: 13, color: TEXT, highlight: CODE_BG, breakLine: true, paraSpaceAfter: index === all.length - 1 ? 6 : 0.01, ...(index === 0 ? { paraSpaceBefore: 4 } : {}) },
        })))
        return
      case 'math':
        addText(paragraph([{ text: node.value, options: { italic: true, color: MUTED } }], { align: 'center' }))
        return
      case 'table':
        addVisual({ kind: 'table', node })
        return
      case 'thematicBreak': case 'definition': case 'footnoteDefinition': case 'yaml': case 'html':
        return
      default:
        node.children?.forEach(child => block(child, depth, quote))
    }
  }
  tree.children.forEach(child => block(child))
  return { title, text, visuals, flow }
}

/**
 * Writes the deck and downloads it. `slides`: [{ body, notes }] (Markdown).
 * `accent`: the theme colour used for the slide frame and titles.
 */
export async function exportPresentationPptx(slides, { title = 'Presentation', fileName = 'presentation.pptx', accent = '#6d28d9', font = 'Calibri' } = {}) {
  FONT = font
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = title
  pptx.company = 'ReadMe'
  const accentHex = hex(accent)

  const parsed = slides.map(slide => unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(slide.body || ''))
  const layouts = parsed.map(tree => layoutSlide(tree, accent))
  // Load every image and render every diagram up front.
  const images = new Map()
  await Promise.all(parsed.map(async tree => { for (const [url, image] of await collectImages(tree)) images.set(url, image) }))
  const mermaidSources = layouts.flatMap(layout => layout.visuals.filter(item => item.kind === 'mermaid').map(item => item.source))
  const svgs = mermaidSources.length ? await renderMermaidSvgs(mermaidSources) : []
  const diagrams = new Map()
  await Promise.all(mermaidSources.map(async (source, index) => {
    // renderMermaidSvgs gives { markup, width, height } (or null when a diagram fails).
    const svg = svgs[index]
    if (!svg?.markup) return
    const size = { width: svg.width || svgSize(svg.markup).width, height: svg.height || svgSize(svg.markup).height }
    try { diagrams.set(source, { dataUrl: bytesToDataUrl(await svgToPng(svg.markup, size.width, size.height, 2)), ...size }) } catch (error) { console.warn('Diagram export failed', error) }
  }))

  // 1. Plan: lay each slide's content out top to bottom at a fixed text size, starting a
  //    "(continued)" slide whenever the next paragraph, table row or picture wouldn't fit.
  const planned = []
  layouts.forEach((layout, index) => {
    const hasTitle = Boolean(layout.title)
    const bodyY = hasTitle ? BODY_Y : TITLE_Y
    const avail = (H - bodyY - 0.55) * 0.95 // a little slack for font differences between apps
    const textX = PAD_X + (hasTitle ? 0.2 : 0)
    const textW = BODY_W - (hasTitle ? 0.2 : 0)
    let page = null
    let used = 0
    const newPage = () => {
      page = { layout, hasTitle, bodyY, continued: Boolean(page), items: [], notes: page ? '' : slides[index].notes }
      planned.push(page)
      used = 0
    }
    newPage()
    const place = height => {
      if (used > 0 && used + height > avail) newPage()
      const y = bodyY + used
      used += height + GAP
      return y
    }
    for (const item of layout.flow) {
      if (item.kind === 'text') {
        const height = paragraphHeight(item.runs, textW)
        const last = page.items.at(-1)
        if (last?.kind === 'text' && used + height - GAP <= avail) {
          last.runs.push(...item.runs)
          last.h += height
          used += height
        } else {
          const y = place(height)
          page.items.push({ kind: 'text', runs: [...item.runs], x: textX, y, w: textW, h: height })
        }
      } else if (item.kind === 'table') {
        const [header, ...body] = item.node.children
        const columns = header.children.length
        const rowHeight = row => tableRowHeight(row, BODY_W / Math.max(1, columns))
        // Split long tables across slides, repeating the header row.
        let chunk = []
        let chunkHeight = rowHeight(header)
        const flush = () => {
          const y = place(chunkHeight)
          page.items.push({ kind: 'table', node: item.node, rows: [header, ...chunk], y, h: chunkHeight })
          chunk = []
          chunkHeight = rowHeight(header)
        }
        for (const row of body) {
          const height = rowHeight(row)
          if (used + chunkHeight + height > avail) {
            if (chunk.length) flush()
            if (used > 0) newPage()
          }
          chunk.push(row)
          chunkHeight += height
        }
        flush()
      } else {
        const source = item.kind === 'image' ? images.get(item.url) : diagrams.get(item.source)
        if (!source) continue
        const natural = BODY_W * source.height / source.width
        // A picture needs at least MIN_PICTURE of height; otherwise it goes on the next slide.
        if (used > 0 && Math.min(natural, MIN_PICTURE) > avail - used) newPage()
        const height = Math.min(natural, avail - used)
        const y = place(height)
        const ratio = Math.min(BODY_W / source.width, height / source.height)
        const w = source.width * ratio, h = source.height * ratio
        page.items.push({ kind: 'picture', data: source.dataUrl, x: PAD_X + (BODY_W - w) / 2, y, w, h, alt: item.alt || 'Diagram' })
      }
    }
  })

  // 2. Draw the planned slides.
  planned.forEach((page, index) => {
    const slide = pptx.addSlide()
    slide.background = { color: 'FFFFFF' }
    // The slide frame: a rounded border in the theme's accent, like presentation mode.
    slide.addShape(pptx.ShapeType.roundRect, {
      x: INSET, y: INSET, w: W - 2 * INSET, h: H - 2 * INSET, rectRadius: 0.18,
      fill: { type: 'none' }, line: { color: accentHex, width: 4.5 },
    })
    slide.addText(`${index + 1} / ${planned.length}`, { x: W - INSET - 1.3, y: H - INSET - 0.42, w: 1.1, h: 0.3, fontSize: 9, fontFace: FONT, color: '9AA0B8', align: 'right' })
    if (page.hasTitle) {
      const titleRuns = page.layout.title.runs.length ? page.layout.title.runs : [{ text: ' ' }]
      slide.addText(page.continued ? [...titleRuns, { text: ' (continued)', options: { color: '9AA0B8', bold: false } }] : titleRuns, {
        x: PAD_X + 0.22, y: TITLE_Y, w: BODY_W - 0.22, h: TITLE_H, fontFace: FONT,
        fontSize: page.layout.title.depth === 1 ? 34 : 28, bold: true, color: '14172B', valign: 'middle', fit: 'shrink', margin: 0,
      })
      slide.addShape(pptx.ShapeType.rect, { x: PAD_X, y: TITLE_Y + 0.12, w: 0.07, h: TITLE_H - 0.24, fill: { color: accentHex }, line: { type: 'none' } })
    }
    for (const item of page.items) {
      if (item.kind === 'text') {
        slide.addText(item.runs, { x: item.x, y: item.y, w: item.w, h: item.h + 0.06, fontSize: 18, fontFace: FONT, color: TEXT, valign: 'top', paraSpaceAfter: 6, margin: 0.04 })
      } else if (item.kind === 'table') {
        const align = item.node.align ?? []
        const cell = (node, columnIndex, head) => ({
          text: runs(node.children).map(run => ({ text: run.text, options: run.options })),
          options: { bold: head, fill: { color: head ? 'F1F2F8' : 'FFFFFF' }, align: align[columnIndex] || 'left', valign: 'middle' },
        })
        slide.addTable(item.rows.map((row, rowIndex) => row.children.map((node, columnIndex) => cell(node, columnIndex, rowIndex === 0))), {
          x: PAD_X, y: item.y, w: BODY_W, fontSize: TABLE_SIZE, fontFace: FONT, color: TEXT, border: { type: 'solid', pt: 0.75, color: 'D9DCEB' }, autoPage: false,
        })
      } else {
        slide.addImage({ data: item.data, x: item.x, y: item.y, w: item.w, h: item.h, altText: item.alt })
      }
    }
    if (page.notes) slide.addNotes(page.notes)
  })

  // pptxgenjs writes paragraph properties once per text run; later runs (bold words, links)
  // would then cancel the paragraph's bullet. Keep only the first <a:pPr> of each paragraph.
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'arraybuffer' }))
  await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(async name => {
    const xml = await zip.file(name).async('string')
    zip.file(name, firstParagraphPropsOnly(xml))
  }))
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName })
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

export function firstParagraphPropsOnly(xml) {
  return xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (paragraph, inner) => {
    let seen = false
    return `<a:p>${inner.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, props => {
      if (seen) return ''
      seen = true
      return props
    })}</a:p>`
  })
}

// For tests: the layout of one slide without writing a file.
export function describeSlide(markdown, accent) {
  const layout = layoutSlide(unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown), accent)
  return {
    title: layout.title ? layout.title.runs.map(run => run.text).join('') : null,
    text: layout.text.map(run => run.text).join('|'),
    visuals: layout.visuals.map(item => item.kind),
    bullets: layout.text.filter(run => run.options.bullet).length,
  }
}
