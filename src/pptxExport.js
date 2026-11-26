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
const FONT = 'Calibri', MONO = 'Consolas'
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
  const list = items.length ? items : [{ text: ' ', options: {} }]
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
  const block = (node, depth = 0, quote = null) => {
    switch (node.type) {
      case 'heading':
        if (!title && depth === 0) { title = { runs: runs(node.children), depth: node.depth }; return }
        text.push(...paragraph(runs(node.children), { bold: true, fontSize: node.depth <= 2 ? 22 : 19, color: hex(accent), paraSpaceBefore: 6 }))
        return
      case 'paragraph': {
        const images = node.children.filter(child => child.type === 'image')
        const rest = node.children.filter(child => child.type !== 'image' && !(child.type === 'text' && !child.value.trim()))
        images.forEach(image => visuals.push({ kind: 'image', url: image.url, alt: image.alt }))
        if (rest.length) text.push(...paragraph(runs(rest), { indentLevel: depth, ...(quote ? { color: quote.color, italic: !quote.callout } : {}) }))
        return
      }
      case 'list': {
        node.children.forEach((item, index) => {
          const prefix = typeof item.checked === 'boolean' ? (item.checked ? '☑ ' : '☐ ') : ''
          const [first, ...rest] = item.children
          // Task items show a check box instead of a bullet; numbered lists keep their start number.
          const bullet = typeof item.checked === 'boolean' ? false
            : node.ordered ? { type: 'number', ...(index === 0 && (node.start ?? 1) !== 1 ? { numberStartAt: node.start } : {}) } : true
          const content = first?.type === 'paragraph' ? runs(first.children) : []
          text.push(...paragraph([{ text: prefix, options: {} }, ...content].filter(run => run.text !== ''), { bullet, indentLevel: depth }))
          rest.forEach(child => block(child, depth + 1, quote))
        })
        return
      }
      case 'blockquote': {
        const first = node.children[0]
        const marker = first?.type === 'paragraph' && first.children[0]?.type === 'text' ? parseCalloutMarker(first.children[0].value) : null
        if (marker) {
          const color = CALLOUT_COLORS[marker.type]
          text.push(...paragraph([{ text: marker.title || CALLOUT_TYPES[marker.type], options: { bold: true, color } }]))
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
        if (node.lang === 'mermaid') { visuals.push({ kind: 'mermaid', source: node.value }); return }
        text.push(...node.value.split('\n').map((line, index, all) => ({
          text: line || ' ', options: { fontFace: MONO, fontSize: 13, color: TEXT, highlight: CODE_BG, breakLine: true, ...(index === 0 ? { paraSpaceBefore: 4 } : {}), ...(index === all.length - 1 ? { paraSpaceAfter: 6 } : {}) },
        })))
        return
      case 'math':
        text.push(...paragraph([{ text: node.value, options: { italic: true, color: MUTED } }], { align: 'center' }))
        return
      case 'table':
        visuals.push({ kind: 'table', node })
        return
      case 'thematicBreak': case 'definition': case 'footnoteDefinition': case 'yaml': case 'html':
        return
      default:
        node.children?.forEach(child => block(child, depth, quote))
    }
  }
  tree.children.forEach(child => block(child))
  return { title, text, visuals }
}

/**
 * Writes the deck and downloads it. `slides`: [{ body, notes }] (Markdown).
 * `accent`: the theme colour used for the slide frame and titles.
 */
export async function exportPresentationPptx(slides, { title = 'Presentation', fileName = 'presentation.pptx', accent = '#6d28d9' } = {}) {
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

  layouts.forEach((layout, index) => {
    const slide = pptx.addSlide()
    slide.background = { color: 'FFFFFF' }
    // The slide frame: a rounded border in the theme's accent, like presentation mode.
    slide.addShape(pptx.ShapeType.roundRect, {
      x: INSET, y: INSET, w: W - 2 * INSET, h: H - 2 * INSET, rectRadius: 0.18,
      fill: { type: 'none' }, line: { color: accentHex, width: 4.5 },
    })
    slide.addText(`${index + 1} / ${layouts.length}`, { x: W - INSET - 1.3, y: H - INSET - 0.42, w: 1.1, h: 0.3, fontSize: 9, fontFace: FONT, color: '9AA0B8', align: 'right' })

    const hasTitle = Boolean(layout.title)
    const bodyY = hasTitle ? BODY_Y : TITLE_Y
    const bodyH = H - bodyY - 0.55
    if (hasTitle) {
      slide.addText(layout.title.runs.length ? layout.title.runs : [{ text: ' ' }], {
        x: PAD_X + 0.22, y: TITLE_Y, w: BODY_W - 0.22, h: TITLE_H, fontFace: FONT, fontSize: layout.title.depth === 1 ? 34 : 28, bold: true,
        color: '14172B', valign: 'middle', fit: 'shrink', margin: 0,
      })
      slide.addShape(pptx.ShapeType.rect, { x: PAD_X, y: TITLE_Y + 0.12, w: 0.07, h: TITLE_H - 0.24, fill: { color: accentHex }, line: { type: 'none' } })
    }
    const visuals = layout.visuals.filter(item => item.kind === 'table' || (item.kind === 'image' && images.has(item.url)) || (item.kind === 'mermaid' && diagrams.has(item.source)))
    const hasText = layout.text.length > 0
    // Text on top, visuals below (or the whole body when only one of them exists).
    const textH = hasText ? (visuals.length ? bodyH * 0.42 : bodyH) : 0
    if (hasText) {
      slide.addText(layout.text, {
        x: PAD_X + (hasTitle ? 0.2 : 0), y: bodyY, w: BODY_W - (hasTitle ? 0.2 : 0), h: textH,
        fontSize: 18, fontFace: FONT, color: TEXT, valign: 'top', fit: 'shrink', paraSpaceAfter: 6, margin: 0.04,
      })
    }
    if (visuals.length) {
      const top = bodyY + (hasText ? textH + 0.12 : 0)
      const height = bodyY + bodyH - top
      const gap = 0.2
      const width = (BODY_W - gap * (visuals.length - 1)) / visuals.length
      visuals.forEach((visual, n) => {
        const x = PAD_X + n * (width + gap)
        if (visual.kind === 'table') {
          const [header, ...body] = visual.node.children
          const align = visual.node.align ?? []
          const cell = (node, columnIndex, head) => ({
            text: runs(node.children).map(run => ({ text: run.text, options: run.options })),
            options: { bold: head, fill: { color: head ? 'F1F2F8' : 'FFFFFF' }, align: align[columnIndex] || 'left', valign: 'middle' },
          })
          slide.addTable([header, ...body].map((row, rowIndex) => row.children.map((node, columnIndex) => cell(node, columnIndex, rowIndex === 0))), {
            x, y: top, w: width, fontSize: 12, fontFace: FONT, color: TEXT, border: { type: 'solid', pt: 0.75, color: 'D9DCEB' }, autoPage: false,
          })
          return
        }
        const source = visual.kind === 'image' ? images.get(visual.url) : diagrams.get(visual.source)
        // Fit inside the box, keeping the aspect ratio, centred.
        const ratio = Math.min(width / source.width, height / source.height)
        const w = source.width * ratio, h = source.height * ratio
        slide.addImage({ data: source.dataUrl, x: x + (width - w) / 2, y: top + (height - h) / 2, w, h, altText: visual.alt || 'Diagram' })
      })
    }
    if (slides[index].notes) slide.addNotes(slides[index].notes)
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
