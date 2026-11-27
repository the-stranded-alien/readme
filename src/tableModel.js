// Markdown tables as data, for the visual table editor: find them in a document (outside code
// fences), read one into cells, and write cells back as a neatly formatted table.
import { formatMarkdownTables, isSeparator, splitRow } from './editorAssist'

const FENCE_RE = /^\s*(```|~~~)/

/** Every table in the document: { from, to } character offsets (to = end of its last line). */
export function findTables(markdown) {
  const lines = String(markdown ?? '').split('\n')
  const starts = []
  let offset = 0
  for (const line of lines) { starts.push(offset); offset += line.length + 1 }
  const tables = []
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    if (FENCE_RE.test(lines[i])) { inFence = !inFence; continue }
    if (inFence || !lines[i].includes('|') || !isSeparator(lines[i + 1] ?? '')) continue
    let end = i + 2
    while (end < lines.length && lines[end].includes('|') && lines[end].trim() && !FENCE_RE.test(lines[end])) end += 1
    tables.push({ from: starts[i], to: starts[end - 1] + lines[end - 1].length, startLine: i, endLine: end - 1 })
    i = end - 1
  }
  return tables
}

/** The table containing character `offset`, or null. */
export const tableAt = (markdown, offset) => findTables(markdown).find(table => offset >= table.from && offset <= table.to) ?? null

const unescapeCell = cell => cell.replace(/\\\|/g, '|')
const escapeCell = cell => String(cell ?? '').replace(/\r?\n/g, '<br>').replace(/(?<!\\)\|/g, '\\|').trim()

/** Table Markdown → { align: ['left'|'center'|'right'|'none'], rows: [[cell]] } (rows[0] = header). */
export function parseTable(text) {
  const lines = String(text).split('\n').filter(line => line.trim())
  const header = splitRow(lines[0])
  const align = splitRow(lines[1] ?? '').map(cell => {
    const left = cell.startsWith(':'), right = cell.endsWith(':')
    return left && right ? 'center' : right ? 'right' : left ? 'left' : 'none'
  })
  const body = lines.slice(2).map(splitRow)
  const columns = Math.max(header.length, ...body.map(row => row.length), 1)
  const fill = row => Array.from({ length: columns }, (_, c) => unescapeCell(row[c] ?? ''))
  return { align: Array.from({ length: columns }, (_, c) => align[c] ?? 'none'), rows: [fill(header), ...body.map(fill)] }
}

/** { align, rows } → formatted table Markdown (column widths lined up). */
export function tableToMarkdown({ align, rows }) {
  const columns = Math.max(1, ...rows.map(row => row.length))
  const line = cells => `| ${Array.from({ length: columns }, (_, c) => escapeCell(cells[c]) || ' ').join(' | ')} |`
  const separator = `| ${Array.from({ length: columns }, (_, c) => ({ left: ':---', center: ':---:', right: '---:' }[align[c]] ?? '---')).join(' | ')} |`
  return formatMarkdownTables([line(rows[0] ?? []), separator, ...rows.slice(1).map(line)].join('\n'))
}

export const emptyTable = (columns = 3, bodyRows = 2) => ({
  align: Array(columns).fill('none'),
  rows: [Array.from({ length: columns }, (_, c) => `Column ${c + 1}`), ...Array.from({ length: bodyRows }, () => Array(columns).fill(''))],
})

// ── Grid operations (all return a new table) ──
const clone = table => ({ align: [...table.align], rows: table.rows.map(row => [...row]) })
export const insertRow = (table, at) => { const t = clone(table); t.rows.splice(Math.max(1, at), 0, Array(t.align.length).fill('')); return t }
export const deleteRow = (table, at) => { const t = clone(table); if (at >= 1 && t.rows.length > 2) t.rows.splice(at, 1); else if (at >= 1) t.rows[at] = Array(t.align.length).fill(''); return t }
export const moveRow = (table, at, step) => {
  const to = at + step
  if (at < 1 || to < 1 || to >= table.rows.length) return table
  const t = clone(table); [t.rows[at], t.rows[to]] = [t.rows[to], t.rows[at]]; return t
}
export const insertColumn = (table, at) => { const t = clone(table); t.align.splice(at, 0, 'none'); t.rows.forEach((row, r) => row.splice(at, 0, r === 0 ? `Column ${t.align.length}` : '')); return t }
export const deleteColumn = (table, at) => { if (table.align.length <= 1) return table; const t = clone(table); t.align.splice(at, 1); t.rows.forEach(row => row.splice(at, 1)); return t }
export const moveColumn = (table, at, step) => {
  const to = at + step
  if (to < 0 || to >= table.align.length) return table
  const t = clone(table)
  const swap = list => { [list[at], list[to]] = [list[to], list[at]] }
  swap(t.align); t.rows.forEach(swap)
  return t
}
export const setAlign = (table, column, value) => { const t = clone(table); t.align[column] = value; return t }
/** Sort body rows by a column (numbers numerically, text naturally); header stays first. */
export function sortRows(table, column, direction = 'asc') {
  const t = clone(table)
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  const key = cell => cell.replace(/[$€£,%\s]/g, '')
  const body = t.rows.slice(1).sort((a, b) => {
    const x = a[column] ?? '', y = b[column] ?? ''
    const nx = Number(key(x)), ny = Number(key(y))
    const order = x && y && !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : collator.compare(x, y)
    return direction === 'desc' ? -order : order
  })
  t.rows = [t.rows[0], ...body]
  return t
}
/** Paste a block of cells (rows × columns) starting at a cell, growing the table as needed. */
export function pasteCells(table, row, column, cells) {
  const t = clone(table)
  cells.forEach((values, r) => values.forEach((value, c) => {
    const rr = row + r, cc = column + c
    while (cc >= t.align.length) { t.align.push('none'); t.rows.forEach((line, i) => line.push(i === 0 ? `Column ${t.align.length}` : '')) }
    while (rr >= t.rows.length) t.rows.push(Array(t.align.length).fill(''))
    t.rows[rr][cc] = value
  }))
  return t
}

export const duplicateRow = (table, at) => { if (at < 1) return table; const t = clone(table); t.rows.splice(at + 1, 0, [...t.rows[at]]); return t }
export const duplicateColumn = (table, at) => {
  const t = clone(table)
  t.align.splice(at + 1, 0, t.align[at])
  t.rows.forEach((row, r) => row.splice(at + 1, 0, r === 0 ? `${row[at] || 'Column'} (copy)` : row[at]))
  return t
}
export const clearRow = (table, at) => { const t = clone(table); t.rows[at] = t.rows[at].map(() => ''); return t }
export const clearColumn = (table, at) => { const t = clone(table); t.rows.forEach((row, r) => { if (r > 0) row[at] = '' }); return t }
/** Empties every body cell (headers stay). */
export const clearBody = table => { const t = clone(table); t.rows = t.rows.map((row, r) => (r === 0 ? row : row.map(() => ''))); return t }
/** Rows become columns and columns become rows (the first column becomes the header). */
export function transpose(table) {
  const columns = table.align.length
  const rows = Array.from({ length: columns }, (_, c) => table.rows.map(row => row[c] ?? ''))
  return { align: Array(rows[0].length).fill('none'), rows }
}
/** Grows or shrinks to `bodyRows` × `columns` (keeps what fits). */
export function resizeTable(table, bodyRows, columns) {
  let t = clone(table)
  const wantRows = Math.max(1, bodyRows), wantColumns = Math.max(1, columns)
  while (t.align.length < wantColumns) t = insertColumn(t, t.align.length)
  while (t.align.length > wantColumns) t = deleteColumn(t, t.align.length - 1)
  while (t.rows.length - 1 < wantRows) t.rows.push(Array(t.align.length).fill(''))
  while (t.rows.length - 1 > wantRows) t.rows.pop()
  return t
}
/** Wraps the selected text of a cell in Markdown (bold, italic, code, link). */
export function wrapCellText(value, start, end, kind, url = '') {
  const selected = value.slice(start, end) || ({ bold: 'bold text', italic: 'italic text', code: 'code', link: 'link text' })[kind]
  const [before, after] = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'], link: ['[', `](${url || 'https://'})`] }[kind]
  const text = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`
  return { text, start: start + before.length, end: start + before.length + selected.length }
}
