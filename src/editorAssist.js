// Pure helpers for the Markdown textarea editor: list continuation, bracket
// auto-pairing, table formatting and image embedding.

const LIST_RE = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/
const QUOTE_RE = /^(\s*(?:>\s?)+)/

function lineBounds(value, index) {
  const start = value.lastIndexOf('\n', index - 1) + 1
  const endIndex = value.indexOf('\n', index)
  return { start, end: endIndex === -1 ? value.length : endIndex }
}

/**
 * Enter inside a list item / blockquote. Returns the edit to apply, or null
 * to let the browser insert a plain newline.
 * Edit shape: { from, to, text, cursor } (positions in the original value).
 */
export function continueMarkup(value, selectionStart, selectionEnd) {
  if (selectionStart !== selectionEnd) return null
  const { start } = lineBounds(value, selectionStart)
  const before = value.slice(start, selectionStart)
  // Don't continue inside fenced code blocks.
  const fences = value.slice(0, start).match(/^\s*(```|~~~)/gm)
  if (fences && fences.length % 2 === 1) return null

  const list = LIST_RE.exec(before)
  if (list) {
    const [marker, indent, bullet, number, delimiter, gap, task] = list
    if (before.trim() === marker.trim()) {
      // Empty nested item: outdent one level. Empty top-level item: end the
      // list and leave a blank line so the next paragraph starts cleanly.
      if (indent.length >= 2) return { from: start, to: selectionStart, text: marker.slice(2), cursor: start + marker.length - 2 }
      return { from: start, to: selectionStart, text: '\n', cursor: start + 1 }
    }
    const nextBullet = bullet ?? `${Number(number) + 1}${delimiter}`
    const text = `\n${indent}${nextBullet}${gap}${task ? '[ ] ' : ''}`
    return { from: selectionStart, to: selectionStart, text, cursor: selectionStart + text.length }
  }

  const quote = QUOTE_RE.exec(before)
  if (quote) {
    if (!before.slice(quote[1].length).trim()) {
      return { from: start, to: selectionStart, text: '\n', cursor: start + 1 }
    }
    const text = `\n${quote[1].endsWith(' ') ? quote[1] : `${quote[1]} `}`
    return { from: selectionStart, to: selectionStart, text, cursor: selectionStart + text.length }
  }
  return null
}

export const AUTO_PAIRS = { '(': ')', '[': ']', '{': '}', '`': '`', '"': '"' }
const CLOSERS = new Set(Object.values(AUTO_PAIRS))

/** Typing an opener wraps the selection or inserts a pair; typing a closer steps over it. */
export function autoPair(value, selectionStart, selectionEnd, char) {
  const next = value[selectionEnd] ?? ''
  if (selectionStart === selectionEnd && CLOSERS.has(char) && next === char) {
    return { from: selectionStart, to: selectionStart + 1, text: char, cursor: selectionStart + 1 }
  }
  const closer = AUTO_PAIRS[char]
  if (!closer) return null
  if (selectionStart !== selectionEnd) {
    const selected = value.slice(selectionStart, selectionEnd)
    return { from: selectionStart, to: selectionEnd, text: `${char}${selected}${closer}`, cursor: selectionStart + 1, cursorEnd: selectionEnd + 1 }
  }
  const prev = value[selectionStart - 1] ?? ''
  // Only pair before whitespace / end / closing punctuation, and not inside words for quotes/backticks.
  if (next && !/[\s)\]}.,;:!?]/.test(next)) return null
  if ((char === '"' || char === '`') && /\w/.test(prev)) return null
  return { from: selectionStart, to: selectionStart, text: `${char}${closer}`, cursor: selectionStart + 1 }
}

/** Backspace between an empty pair removes both characters. */
export function deletePair(value, selectionStart, selectionEnd) {
  if (selectionStart !== selectionEnd || selectionStart === 0) return null
  const prev = value[selectionStart - 1]
  if (AUTO_PAIRS[prev] && value[selectionStart] === AUTO_PAIRS[prev]) {
    return { from: selectionStart - 1, to: selectionStart + 1, text: '', cursor: selectionStart - 1 }
  }
  return null
}

// ── Tables ─────────────────────────────────────────────────────
const splitRow = line => {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)
  const cells = []
  let current = ''
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === '\\' && row[i + 1] === '|') { current += '\\|'; i += 1; continue }
    if (row[i] === '|') { cells.push(current.trim()); current = ''; continue }
    current += row[i]
  }
  cells.push(current.trim())
  return cells
}
const isSeparator = line => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line)
const displayWidth = text => Array.from(text).reduce((width, char) => width + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u.test(char) ? 2 : 1), 0)
const pad = (text, width, align) => {
  const gap = Math.max(0, width - displayWidth(text))
  if (align === 'right') return ' '.repeat(gap) + text
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + text + ' '.repeat(Math.ceil(gap / 2))
  return text + ' '.repeat(gap)
}

/** Aligns the pipes of every GFM table (outside fenced code blocks). */
export function formatMarkdownTables(markdown) {
  const lines = markdown.split('\n')
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; continue }
    if (inFence || !lines[i].includes('|') || !isSeparator(lines[i + 1] ?? '')) continue
    let end = i + 2
    while (end < lines.length && lines[end].includes('|') && lines[end].trim()) end += 1
    const rows = lines.slice(i, end).map(splitRow)
    const aligns = rows[1].map(cell => {
      const left = cell.startsWith(':')
      const right = cell.endsWith(':')
      return left && right ? 'center' : right ? 'right' : left ? 'left' : 'none'
    })
    const columns = Math.max(...rows.map(row => row.length))
    const widths = Array.from({ length: columns }, (_, c) => Math.max(3, ...rows.filter((_, r) => r !== 1).map(row => displayWidth(row[c] ?? ''))))
    const indent = lines[i].match(/^\s*/)[0]
    const formatted = rows.map((row, r) => {
      if (r === 1) {
        return `${indent}| ${widths.map((width, c) => {
          const align = aligns[c] ?? 'none'
          const dashes = '-'.repeat(Math.max(1, width - (align === 'center' ? 2 : align === 'none' ? 0 : 1)))
          return align === 'center' ? `:${dashes}:` : align === 'left' ? `:${dashes}` : align === 'right' ? `${dashes}:` : dashes
        }).join(' | ')} |`
      }
      return `${indent}| ${widths.map((width, c) => pad(row[c] ?? '', width, aligns[c])).join(' | ')} |`
    })
    lines.splice(i, end - i, ...formatted)
    i = end - 1
  }
  return lines.join('\n')
}

// ── Images ─────────────────────────────────────────────────────
export const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=]+$/i

/** Reads an image file as a data URL, downscaling large raster images. */
export async function imageFileToDataUrl(file, { maxSide = 1600, quality = 0.86 } = {}) {
  const readAsDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  if (!/^image\/(png|jpe?g|webp|avif)$/i.test(file.type) || typeof createImageBitmap !== 'function') return readAsDataUrl(file)
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 350_000) { bitmap.close?.(); return readAsDataUrl(file) }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const encoded = canvas.toDataURL(type, quality)
    // Fall back to JPEG when a PNG stays huge (photos / screenshots without transparency are fine as JPEG).
    if (type === 'image/png' && encoded.length > 900_000) return canvas.toDataURL('image/webp', quality)
    return encoded
  } catch {
    return readAsDataUrl(file)
  }
}

/** Builds the Markdown for embedded images: inline references + definitions appended at the end. */
export function imageReferenceMarkdown(entries, existingMarkdown) {
  const used = new Set(Array.from(existingMarkdown.matchAll(/^\[(img-[a-z0-9-]+)\]:/gim), match => match[1].toLowerCase()))
  const inline = []
  const definitions = []
  for (const { name, dataUrl } of entries) {
    const base = (name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image').slice(0, 32)
    let id = `img-${base}`
    let n = 2
    while (used.has(id)) id = `img-${base}-${n++}`
    used.add(id)
    const alt = name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')
    inline.push(`![${alt}][${id}]`)
    definitions.push(`[${id}]: ${dataUrl}`)
  }
  return { inline: inline.join('\n\n'), definitions: definitions.join('\n') }
}

/** Counts words the same way as the document analysis (whitespace separated). */
export const countWords = text => text.match(/\S+/g)?.length ?? 0
