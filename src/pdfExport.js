// Markdown → PDF using pdfmake. The markdown is parsed into an mdast tree and
// translated into a pdfmake document definition, so the PDF contains real,
// selectable text with consistent typography instead of a screenshot or the
// browser's print layout.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { CALLOUT_TYPES, parseCalloutMarker } from './rehypeCallouts'

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
const CALLOUT_COLORS = { note: '#0969da', tip: '#1a7f37', important: '#8250df', warning: '#9a6700', caution: '#cf222e' }

// Returns { type, title, children } when a blockquote starts with a [!TYPE] marker.
function detectCallout(node) {
  const paragraph = node.children[0]
  const first = paragraph?.type === 'paragraph' ? paragraph.children[0] : null
  if (first?.type !== 'text') return null
  const marker = parseCalloutMarker(first.value)
  if (!marker) return null
  const rest = first.value.slice(marker.length).replace(/^\n/, '')
  const paragraphChildren = [...(rest ? [{ ...first, value: rest }] : []), ...paragraph.children.slice(1)]
  const children = [
    ...(paragraphChildren.length ? [{ ...paragraph, children: paragraphChildren }] : []),
    ...node.children.slice(1),
  ]
  return { type: marker.type, title: marker.title || CALLOUT_TYPES[marker.type], children }
}

const HEADING_SIZES = [22, 17, 14, 12.5, 11.5, 11]
const BASE_SIZE = 10.5
const CODE_SIZE = 9
export const PDF_PAGE_SIZES = { A4: { label: 'A4', width: 595.28, height: 841.89 }, LETTER: { label: 'US Letter', width: 612, height: 792 } }
export const PDF_MARGINS = { narrow: { label: 'Narrow', value: 36 }, normal: { label: 'Normal', value: 54 }, wide: { label: 'Wide', value: 72 } }
export const PDF_PAPERS = { white: { label: 'White', color: null }, sepia: { label: 'Sepia', color: '#f5ecdb' } }
export const DEFAULT_PDF_OPTIONS = { pageSize: 'A4', margins: 'normal', toc: false, includeMeta: true, paper: 'white', diagrams: true, cover: false, header: false }

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

// A document style's PDF values (see docStyles.js); the defaults are the ReadMe look.
const DEFAULT_LOOK = { font: 'Roboto', heading: 'Roboto', headingColor: COLORS.heading, accent: COLORS.accent, table: 'grid', rule: true }

function createConverter({ images, footnoteOrder, contentWidth, toc, rendered, look = DEFAULT_LOOK }) {
  const L = { ...DEFAULT_LOOK, ...look }
  // Times only has Latin (WinAnsi) glyphs: other scripts fall back to Roboto.
  const fontFor = value => (L.font === 'Times' && !isCourierSafe(value) ? { font: 'Roboto' } : {})
  const counters = [0, 0, 0]
  const inline = (nodes, style = {}) => nodes.flatMap(node => inlineNode(node, style))

  function inlineNode(node, style) {
    switch (node.type) {
      case 'text': {
        const value = cleanText(node.value)
        return [{ text: value, ...fontFor(value), ...style }]
      }
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
        return inline(node.children, { ...style, color: L.accent, decoration: 'underline', link: node.url })
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
        width: Math.min(contentWidth, image.width * 0.75),
        alignment: 'center',
        margin: [0, 4, 0, 10],
      }
    }
    return { text: inline(node.children), margin: [0, 0, 0, 8], ...(L.justify ? { alignment: 'justify' } : {}) }
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
    return { ul: items, ...(allTasks ? { type: 'none' } : {}), markerColor: L.accent, margin: [0, 0, 0, 8] }
  }

  function table(node) {
    const align = node.align || []
    const striped = L.table === 'striped'
    const fill = rowIndex => (rowIndex === 0
      ? (striped ? L.accent : L.table === 'grid' ? COLORS.tableHeadBg : null)
      : (striped && rowIndex % 2 === 0 ? '#f3f4fb' : null))
    const body = node.children.map((row, rowIndex) => row.children.map((cell, cellIndex) => ({
      text: inline(cell.children),
      bold: rowIndex === 0,
      fillColor: fill(rowIndex),
      ...(striped && rowIndex === 0 ? { color: '#ffffff' } : {}),
      alignment: align[cellIndex] || 'left',
      fontSize: BASE_SIZE - 0.5,
    })))
    const columns = Math.max(...body.map(row => row.length))
    body.forEach(row => { while (row.length < columns) row.push({ text: '' }) })
    const rows = body.length
    // grid: every line; lines: horizontal only; booktabs: thick top / bottom, thin under the header.
    const hWidth = L.table === 'booktabs'
      ? index => (index === 0 || index === rows ? 1.4 : index === 1 ? 0.6 : 0)
      : L.table === 'lines' ? index => (index === 0 || index === rows ? 1 : 0.5)
        : striped ? () => 0 : () => 0.6
    const vWidth = L.table === 'grid' ? () => 0.6 : () => 0
    return {
      table: { headerRows: 1, widths: Array(columns).fill('*'), body, dontBreakRows: true },
      layout: {
        hLineColor: index => (L.table === 'booktabs' || (L.table === 'lines' && (index === 0 || index === rows)) ? L.headingColor : COLORS.rule),
        vLineColor: () => COLORS.rule,
        hLineWidth: hWidth,
        vLineWidth: vWidth,
        ...(L.dashed ? { hLineStyle: () => ({ dash: { length: 3, space: 2 } }), vLineStyle: () => ({ dash: { length: 3, space: 2 } }) } : {}),
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
        const size = (HEADING_SIZES[node.depth - 1] ?? BASE_SIZE) * (L.minimal && node.depth > 1 ? 0.9 : 1)
        // Academic: numbered sections (2. / 2.1).
        let number = ''
        if (L.numbered && node.depth === 2) { counters[1] += 1; counters[2] = 0; number = `${counters[1]}.  ` }
        if (L.numbered && node.depth === 3) { counters[2] += 1; number = `${counters[1]}.${counters[2]}  ` }
        const heading = {
          text: [...(number ? [{ text: number }] : []), ...inline(node.children)],
          fontSize: size,
          bold: !L.minimal || node.depth === 1,
          color: L.numbered && node.depth === 3 ? L.headingColor : (L.accentH3 && node.depth === 3 ? L.accent : L.headingColor),
          ...(L.centerTitle && node.depth === 1 ? { alignment: 'center' } : {}),
          ...(L.numbered && node.depth === 3 ? { italics: true } : {}),
          margin: [0, node.depth <= 2 ? 14 : 10, 0, node.depth <= 2 ? 3 : 5],
          ...(toc && node.depth <= 3 ? { tocItem: true, tocMargin: [(node.depth - 1) * 14, 2, 0, 2], tocStyle: { fontSize: node.depth === 1 ? 10.5 : 9.5, bold: node.depth === 1 } } : {}),
        }
        if (node.depth > 2) return { ...heading, headlineLevel: node.depth }
        if (L.bar && node.depth === 2) {
          // Modern: an accent bar beside section headings.
          return {
            headlineLevel: node.depth, unbreakable: true,
            table: { widths: ['*'], body: [[{ ...heading, margin: [0, 0, 0, 0] }]] },
            layout: { hLineWidth: () => 0, vLineWidth: index => (index === 0 ? 4 : 0), vLineColor: () => L.accent, paddingLeft: () => 9, paddingTop: () => 1, paddingBottom: () => 1 },
            margin: [0, 14, 0, 8],
          }
        }
        if (L.centerTitle && node.depth === 1) {
          return { headlineLevel: 1, unbreakable: true, stack: [heading, { canvas: [{ type: 'line', x1: contentWidth / 2 - 30, y1: 0, x2: contentWidth / 2 + 30, y2: 0, lineWidth: 1, lineColor: COLORS.rule }], margin: [0, 2, 0, 14] }] }
        }
        if (!L.rule && !L.dashed) return { ...heading, headlineLevel: node.depth, margin: [0, node.depth === 1 ? 4 : 16, 0, 8] }
        return {
          headlineLevel: node.depth,
          stack: [heading, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: node.depth === 1 && L.dashed ? Math.min(contentWidth, 220) : contentWidth, y2: 0, lineWidth: node.depth === 1 ? (L.dashed ? 3 : 1) : (L.dashed ? 1 : 0.6), lineColor: L.dashed ? L.accent : COLORS.rule, ...(L.dashed && node.depth > 1 ? { dash: { length: 4, space: 3 } } : {}) }], margin: [0, 0, 0, 9] }],
          unbreakable: true,
        }
      }
      case 'paragraph':
        return paragraph(node)
      case 'blockquote': {
        const callout = detectCallout(node)
        if (callout) {
          const color = CALLOUT_COLORS[callout.type]
          return {
            table: { widths: ['*'], body: [[{
              stack: [{ text: cleanText(callout.title), bold: true, color, margin: [0, 0, 0, 4] }, ...blocks(callout.children)],
              fillColor: '#f7f8fb',
            }]] },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: index => (index === 0 ? 3 : 0),
              vLineColor: () => color,
              paddingLeft: () => 11, paddingRight: () => 9, paddingTop: () => 7, paddingBottom: () => 1,
            },
            margin: [0, 2, 0, 10],
          }
        }
        return {
          table: { widths: ['*'], body: [[{ stack: blocks(node.children), fillColor: COLORS.quoteBg, color: COLORS.muted, italics: true }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: index => (index === 0 ? 2.5 : 0),
            vLineColor: () => L.accent,
            paddingLeft: () => 11,
            paddingRight: () => 9,
            paddingTop: () => 7,
            paddingBottom: () => 0,
          },
          margin: [0, 2, 0, 10],
        }
      }
      case 'code': {
        const svg = rendered.get(node)
        if (svg) return { svg: svg.markup, width: Math.min(contentWidth, svg.width), alignment: 'center', margin: [0, 4, 0, 12] }
        return codeBlock(node.value, node.lang)
      }
      case 'math': {
        const svg = rendered.get(node)
        if (svg) return { svg: svg.markup, width: Math.min(contentWidth, svg.width), alignment: 'center', margin: [0, 4, 0, 10] }
        return { text: cleanText(node.value), italics: true, alignment: 'center', color: COLORS.muted, margin: [0, 4, 0, 10] }
      }
      case 'list':
        return list(node)
      case 'table':
        return table(node)
      case 'thematicBreak':
        return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 0.8, lineColor: COLORS.rule }], margin: [0, 8, 0, 14] }
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

// createImageBitmap can't decode SVG, so SVG images are drawn through an <img>, at a higher
// resolution so they stay sharp; the reported size is the image's own (for layout).
async function svgImage(blob) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = objectUrl })
    const width = image.naturalWidth || 300
    const height = image.naturalHeight || 150
    const scale = Math.max(2, Math.min(4, 1600 / width))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), width, height }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function loadImage(url) {
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (/svg/i.test(blob.type) || /^data:image\/svg/i.test(url)) return await svgImage(blob)
    const bitmap = await createImageBitmap(blob)
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

export async function collectImages(tree) {
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

// Parses the width / height of an SVG string (px, pt or ex units) to PDF points.
function svgSize(markup, exToPt = 4.6) {
  const read = name => {
    const match = new RegExp(`<svg[^>]*\\s${name}="([\\d.]+)(ex|px|pt)?"`).exec(markup)
    if (!match) return null
    const value = Number(match[1])
    return match[2] === 'ex' ? value * exToPt : match[2] === 'pt' ? value : value * 0.75
  }
  const viewBox = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(markup)
  const width = read('width') ?? (viewBox ? Number(viewBox[1]) * 0.75 : 300)
  const height = read('height') ?? (viewBox ? Number(viewBox[2]) * 0.75 : 150)
  return { width, height }
}

// Gives the root <svg> numeric width/height (pdfmake measures those attributes).
export function withNumericSize(markup) {
  const size = svgSize(markup)
  const markupOut = markup.replace(/<svg\b[^>]*>/, tag => tag
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace(/\sstyle="[^"]*max-width[^"]*"/, '')
    .replace(/^<svg/, `<svg width="${size.width.toFixed(2)}" height="${size.height.toFixed(2)}"`))
  return { markup: markupOut, ...size }
}

// The PDF SVG renderer ignores <style> sheets, so copy each element's computed
// presentation styles onto it as attributes (Mermaid styles everything via CSS).
const INLINE_SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline']
export function inlineSvgStyles(markup) {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;pointer-events:none;contain:layout paint'
  host.setAttribute('aria-hidden', 'true')
  host.innerHTML = markup
  document.body.appendChild(host)
  try {
    const svg = host.querySelector('svg')
    if (!svg) return markup
    // Read every computed style first: stripping classes while iterating would
    // stop descendant selectors (e.g. ".node rect") from matching.
    const elements = Array.from(svg.querySelectorAll('*')).filter(el => !/^(style|title|desc|script)$/i.test(el.tagName))
    const styles = elements.map(el => {
      const computed = getComputedStyle(el)
      if (computed.display === 'none') return null
      return INLINE_SVG_PROPS.map(prop => [prop, computed.getPropertyValue(prop)])
    })
    // Edge-label backgrounds must stay solid, or labels sit on top of the arrow line.
    const edgeLabelBackgrounds = new Set(svg.querySelectorAll('.edgeLabel rect, .edgeLabel .background, .labelBkg rect'))
    elements.forEach((el, index) => {
      const values = styles[index]
      if (!values) { el.setAttribute('display', 'none'); return }
      for (const [prop, raw] of values) {
        if (!raw || raw === 'normal' || raw === 'auto') continue
        // The PDF SVG renderer ignores rgba(); split it into a colour + opacity.
        const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(raw)
        if (rgba && (prop === 'fill' || prop === 'stroke')) {
          el.setAttribute(prop, `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`)
          const opacityProp = `${prop}-opacity`
          const existing = Number(values.find(([name]) => name === opacityProp)?.[1] ?? 1)
          el.setAttribute(opacityProp, String(Number(rgba[4]) * (Number.isFinite(existing) ? existing : 1)))
          continue
        }
        if (rgba === null && /-opacity$/.test(prop) && el.hasAttribute(prop)) continue
        el.setAttribute(prop, prop === 'font-family' ? 'Helvetica' : raw)
      }
      if (edgeLabelBackgrounds.has(el)) {
        el.setAttribute('fill', '#ffffff')
        el.setAttribute('fill-opacity', '1')
        el.setAttribute('opacity', '1')
      }
      el.removeAttribute('style')
      el.removeAttribute('class')
    })
    svg.querySelectorAll('style').forEach(el => el.remove())
    return svg.outerHTML
  } finally {
    host.remove()
  }
}

let mathJaxPromise
function loadMathJax() {
  mathJaxPromise ??= Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/output/svg.js'),
    import('mathjax-full/js/adaptors/liteAdaptor.js'),
    import('mathjax-full/js/handlers/html.js'),
    import('mathjax-full/js/input/tex/AllPackages.js'),
  ]).then(([{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }]) => {
    const adaptor = liteAdaptor()
    RegisterHTMLHandler(adaptor)
    const doc = mathjax.document('', { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: 'none' }) })
    return tex => adaptor.innerHTML(doc.convert(tex, { display: true }))
  })
  return mathJaxPromise
}

// Mermaid diagrams and display math are converted to SVG so they stay vector in the PDF.
async function renderVectorBlocks(tree, enabled) {
  const rendered = new Map()
  if (!enabled || typeof document === 'undefined') return rendered
  const diagrams = []
  const formulas = []
  const walk = node => {
    if (node.type === 'code' && /^mermaid$/i.test(node.lang || '')) diagrams.push(node)
    else if (node.type === 'math') formulas.push(node)
    node.children?.forEach(walk)
  }
  walk(tree)

  if (formulas.length) {
    try {
      const toSvg = await loadMathJax()
      for (const node of formulas) {
        try {
          const markup = toSvg(node.value).replace(/currentColor/g, COLORS.text)
          if (/data-mjx-error|merror/.test(markup)) continue
          rendered.set(node, withNumericSize(markup))
        } catch { /* keep the TeX source as text */ }
      }
    } catch (error) {
      console.warn('Math rendering for PDF failed', error)
    }
  }

  if (diagrams.length) {
    const svgs = await renderMermaidSvgs(diagrams.map(node => node.value))
    diagrams.forEach((node, index) => { if (svgs[index]) rendered.set(node, svgs[index]) })
  }
  return rendered
}

/** Renders Mermaid sources to self-contained SVGs (plain-text labels, inlined styles). */
export async function renderMermaidSvgs(sources) {
  const results = []
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false, theme: 'default', securityLevel: 'strict',
      // Exported SVG renderers ignore <foreignObject>, so labels must be plain SVG text.
      htmlLabels: false, flowchart: { htmlLabels: false }, class: { htmlLabels: false }, state: { htmlLabels: false },
      themeVariables: { fontFamily: 'Helvetica, Arial, sans-serif' },
    })
    let n = 0
    for (const source of sources) {
      try {
        const { svg } = await mermaid.render(`export-mermaid-${Date.now()}-${n++}`, source)
        results.push(/<foreignObject/i.test(svg) ? null : withNumericSize(inlineSvgStyles(svg)))
      } catch {
        results.push(null)
      }
    }
  } catch (error) {
    console.warn('Diagram rendering for export failed', error)
  }
  return results
}

/** Rasterises an SVG string to PNG bytes (for formats without SVG support). */
export async function svgToPng(markup, width, height, scale = 2) {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function buildPdfDefinition(markdown, { title = 'Document', meta = [], options = {}, look = {} } = {}) {
  const settings = { ...DEFAULT_PDF_OPTIONS, ...options }
  const L = { ...DEFAULT_LOOK, ...look }
  const page = PDF_PAGE_SIZES[settings.pageSize] ?? PDF_PAGE_SIZES.A4
  const margin = (PDF_MARGINS[settings.margins] ?? PDF_MARGINS.normal).value
  const contentWidth = page.width - 2 * margin
  const paperColor = PDF_PAPERS[settings.paper]?.color
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown)
  const [images, rendered] = await Promise.all([
    typeof document !== 'undefined' ? collectImages(tree) : new Map(),
    renderVectorBlocks(tree, settings.diagrams),
  ])
  const footnoteOrder = []
  const { blocks } = createConverter({ images, footnoteOrder, contentWidth, toc: settings.toc, rendered, look: L })
  const content = blocks(tree.children)

  const metaEntries = (Array.isArray(meta) ? meta.map(({ key, value }) => [key, value]) : Object.entries(meta))
    .filter(([, value]) => value !== '' && value != null && !(Array.isArray(value) && value.length === 0))
  if (settings.toc && content.some(item => item.tocItem || item.stack?.[0]?.tocItem)) {
    content.unshift({
      toc: { title: { text: 'Contents', fontSize: 15, bold: true, color: COLORS.heading, margin: [0, 0, 0, 10] } },
      margin: [0, 0, 0, 18],
    }, { text: '', pageBreak: 'after' })
  }
  if (settings.includeMeta && metaEntries.length) {
    content.unshift({
      text: metaEntries.map(([key, value], index) => [
        { text: `${key}: `, bold: true, color: COLORS.muted },
        { text: `${cleanText(Array.isArray(value) ? value.join(', ') : value)}${index < metaEntries.length - 1 ? '    ' : ''}`, color: COLORS.muted },
      ]).flat(),
      fontSize: 8.5,
      margin: [0, 0, 0, 12],
    })
  }

  // Cover page: title, subtitle / description, author and date (from the front matter).
  const metaValue = key => {
    const entry = metaEntries.find(([name]) => name.toLowerCase() === key)
    return entry ? cleanText(Array.isArray(entry[1]) ? entry[1].join(', ') : entry[1]) : ''
  }
  if (settings.cover) {
    const subtitle = metaValue('subtitle') || metaValue('description')
    const byline = [metaValue('author'), metaValue('date') || new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })].filter(Boolean).join('  ·  ')
    content.unshift({
      stack: [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: 48, h: 4, color: L.accent }], margin: [0, page.height * 0.28, 0, 22] },
        { text: cleanText(metaValue('title') || title), fontSize: 30, bold: true, color: L.headingColor, lineHeight: 1.15 },
        ...(subtitle ? [{ text: subtitle, fontSize: 14, color: COLORS.muted, margin: [0, 12, 0, 0] }] : []),
        { text: byline, fontSize: 10.5, color: COLORS.muted, margin: [0, 28, 0, 0] },
      ],
      pageBreak: 'after',
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
    pageSize: settings.pageSize === 'LETTER' ? 'LETTER' : 'A4',
    pageMargins: [margin, margin, margin, margin + 6],
    ...(paperColor ? { background: (_currentPage, size) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: size.width, h: size.height, color: paperColor }] }) } : {}),
    defaultStyle: { font: L.font, fontSize: BASE_SIZE * (L.font === 'Times' ? 1.08 : 1), lineHeight: 1.35, color: COLORS.text },
    content: content.length ? content : [{ text: ' ' }],
    ...(settings.header ? { header: currentPage => (settings.cover && currentPage === 1 ? null : { text: cleanText(title), alignment: 'right', fontSize: 8, color: '#9aa0b8', margin: [margin, Math.max(14, margin / 2 - 4), margin, 0] }) } : {}),
    footer: (currentPage, pageCount) => (settings.cover && currentPage === 1 ? null : {
      columns: [
        { text: cleanText(title), alignment: 'left', fontSize: 8, color: '#9aa0b8' },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 8, color: '#9aa0b8' },
      ],
      margin: [margin, Math.max(14, margin / 2 - 4), margin, 0],
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
    import('pdfmake/build/standard-fonts/Times'),
  ]).then(([pdfMakeModule, vfsModule, courierModule, timesModule]) => {
    const pdfMake = pdfMakeModule.default ?? pdfMakeModule
    pdfMake.addVirtualFileSystem(vfsModule.default ?? vfsModule)
    pdfMake.addFontContainer(courierModule.default ?? courierModule)
    pdfMake.addFontContainer(timesModule.default ?? timesModule)
    return pdfMake
  })
  return pdfMakePromise
}

export async function exportMarkdownPdf(markdown, { title, fileName, meta, options, look } = {}) {
  const [pdfMake, definition] = await Promise.all([loadPdfMake(), buildPdfDefinition(markdown, { title, meta, options, look })])
  await pdfMake.createPdf(definition).download(fileName || 'document.pdf')
}

// ── Presentation PDF: one landscape 16:9 page per slide, framed like presentation mode ──
const DECK = { width: 960, height: 540, inset: 22, padX: 72, padY: 46, border: 6, radius: 22, scale: 1.7 }

// Slide text is bigger than document text: scale every font size (and spacing) in a block.
function scaleBlock(node, k) {
  if (Array.isArray(node)) return node.map(item => scaleBlock(item, k))
  if (!node || typeof node !== 'object') return node
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'fontSize' && typeof value === 'number') out[key] = value * k
    else if (key === 'margin' && Array.isArray(value)) out[key] = value.map(n => (typeof n === 'number' ? n * k : n))
    // Lines (rules under headings, quote bars) get longer with everything else.
    else if (key === 'canvas' && Array.isArray(value)) out[key] = value.map(shape => ({ ...shape, ...['x1', 'x2', 'w'].reduce((acc, prop) => (typeof shape[prop] === 'number' ? { ...acc, [prop]: shape[prop] * k } : acc), {}) }))
    else if (key === 'layout' || key === 'svg' || key === 'image' || key === 'widths' || key === 'heights') out[key] = value
    else out[key] = typeof value === 'object' ? scaleBlock(value, k) : value
  }
  // Images and diagrams fit inside the slide, never taller than it.
  if ((out.image || out.svg) && typeof out.width === 'number') {
    // Pictures fit inside one slide.
    const maxHeight = DECK.height - 2 * (DECK.inset + DECK.padY) - 70
    out.fit = [out.width, maxHeight]
    delete out.width
  }
  return out
}

// Parses each slide and loads its images / diagrams once (re-used when trying text sizes).
async function prepareDeck(slides, settings) {
  return Promise.all((slides.length ? slides : [' ']).map(async markdown => {
    const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown)
    const [images, rendered] = await Promise.all([
      typeof document !== 'undefined' ? collectImages(tree) : new Map(),
      renderVectorBlocks(tree, settings.diagrams),
    ])
    return { tree, images, rendered }
  }))
}

// The document style for the deck being built (set by the deck exports).
let deckLook = DEFAULT_LOOK
const DECK_CONTENT = { width: DECK.width - 2 * (DECK.inset + DECK.padX), height: DECK.height - 2 * (DECK.inset + DECK.padY) }

// One slide's content at text scale `k` (1 = document size).
function deckSlide({ tree, images, rendered }, k) {
  const { blocks } = createConverter({ images, footnoteOrder: [], contentWidth: DECK_CONTENT.width / k, toc: false, rendered, look: deckLook })
  const stack = scaleBlock(blocks(tree.children), k)
  return { stack: stack.length ? stack : [{ text: ' ' }], fontSize: BASE_SIZE * k }
}

function deckDefinition(slideBlocks, { title, accent, backdrop }) {
  const content = slideBlocks.map(({ stack, fontSize, long }, index) => (long
    // A slide too long for one page flows on to the next page(s), top-aligned.
    ? { id: `slide-${index}`, stack, fontSize }
    : {
      // One cell the size of the slide, with its content centred vertically.
      table: { widths: [DECK_CONTENT.width], heights: [DECK_CONTENT.height], body: [[{ stack, fontSize, verticalAlignment: 'middle' }]] },
      id: `slide-${index}`,
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    }))
  const frameW = DECK.width - 2 * DECK.inset, frameH = DECK.height - 2 * DECK.inset
  return {
    info: { title: cleanText(title), creator: 'ReadMe' },
    pageSize: { width: DECK.width, height: DECK.height },
    pageOrientation: 'landscape',
    pageMargins: [DECK.inset + DECK.padX, DECK.inset + DECK.padY, DECK.inset + DECK.padX, DECK.inset + DECK.padY],
    background: () => ({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: DECK.width, h: DECK.height, color: backdrop },
        // The slide card with a thick border in the theme's accent.
        { type: 'rect', x: DECK.inset, y: DECK.inset, w: frameW, h: frameH, r: DECK.radius, color: '#ffffff', lineWidth: DECK.border, lineColor: accent },
      ],
    }),
    defaultStyle: { font: deckLook.font, fontSize: BASE_SIZE * DECK.scale, lineHeight: 1.35, color: COLORS.text },
    content,
    // Each slide starts a new page — unless the page is still empty (a long slide that just
    // filled the previous page must not leave a blank page behind).
    pageBreakBefore: (node, queries) => {
      if (!/^slide-[1-9]/.test(node.id || '')) return false
      const previous = queries?.getPreviousNodesOnPage?.() ?? queries?.previousNodesOnPage ?? []
      // Only nodes that draw something count (not empty containers left over from a long slide).
      const visible = node => node.image || node.svg || node.canvas || (node.text != null && textOf(node.text).trim() !== '')
      return previous.some(visible)
    },
    footer: (currentPage, pageCount) => ({
      // The footer sits in the bottom margin: put the slide number inside the card's corner.
      text: `${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 9, color: '#9aa0b8',
      margin: [0, DECK.padY - 22, DECK.inset + 22, 0],
    }),
  }
}

/**
 * pdfmake definition for a slide deck. `slides` are Markdown strings (speaker notes already
 * removed); `accent` colours the slide frame like the presentation's theme.
 */
export async function buildPresentationPdfDefinition(slides, { title = 'Presentation', accent = COLORS.accent, backdrop = '#ebecf6', options = {}, look } = {}) {
  deckLook = { ...DEFAULT_LOOK, ...look, rule: false }
  const prepared = await prepareDeck(slides, { ...DEFAULT_PDF_OPTIONS, ...options })
  return deckDefinition(prepared.map(slide => deckSlide(slide, DECK.scale)), { title, accent, backdrop })
}

// Every slide uses the same text size; a slide too long for one page continues on the next
// page (the frame is drawn on every page). Long slides are found by laying each slide out alone.
const textOf = value => (Array.isArray(value) ? value.map(item => textOf(item?.text ?? item)).join('') : typeof value === 'object' && value ? textOf(value.text) : String(value ?? ''))

// A long slide's last block shouldn't push its bottom margin onto an otherwise empty page.
function trimTrailingMargin(block) {
  const stack = [...block.stack]
  const last = stack.length - 1
  if (last >= 0 && Array.isArray(stack[last]?.margin)) stack[last] = { ...stack[last], margin: [stack[last].margin[0], stack[last].margin[1], stack[last].margin[2], 0] }
  return { ...block, stack }
}
// pdfmake compresses its page objects, so read the page count from the footer callback while it lays out.
const countPdfPages = async (pdfMake, definition) => {
  let pages = 0
  const footer = definition.footer
  await pdfMake.createPdf({ ...definition, footer: (current, count) => { pages = Math.max(pages, count); return footer(current, count) } }).getBuffer()
  return pages
}
export async function exportPresentationPdf(slides, { title = 'Presentation', fileName, accent = COLORS.accent, backdrop = '#ebecf6', options, look: styleLook } = {}) {
  deckLook = { ...DEFAULT_LOOK, ...styleLook, rule: false }
  const pdfMake = await loadPdfMake()
  const prepared = await prepareDeck(slides, { ...DEFAULT_PDF_OPTIONS, ...options })
  const look = { title, accent, backdrop }
  const blocks = []
  for (const slide of prepared) {
    const block = deckSlide(slide, DECK.scale)
    const pages = await countPdfPages(pdfMake, deckDefinition([block], look))
    blocks.push(pages > 1 ? { ...trimTrailingMargin(block), long: true } : block)
  }
  await pdfMake.createPdf(deckDefinition(blocks, look)).download(fileName || 'presentation.pdf')
}
