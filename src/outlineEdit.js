// Reorganise a document by its outline: move a heading's whole section (with its sub-sections),
// promote / demote it, or take it out (to move it into another file). Headings are numbered like
// the Contents list (every line starting with 1–3 "#", in order), so a Contents row's index maps
// straight to a heading here. Headings inside code blocks never move or count as boundaries.

const TOC_RE = /^(#{1,3})\s+(.+)/
const ATX_RE = /^(#{1,6})(\s+|$)/
const FENCE_RE = /^\s*(```|~~~)/
// Footnote / link definitions at the very end belong to the whole file, not the last section.
const DEFINITION_RE = /^\s{0,3}\[\^?[^\]]+\]:\s/

function scan(markdown) {
  const lines = String(markdown ?? '').split('\n')
  const headings = [] // every ATX heading: { line, level, inFence, toc }
  let fence = false
  lines.forEach((line, index) => {
    if (FENCE_RE.test(line)) { fence = !fence; return }
    const atx = ATX_RE.exec(line)
    const toc = TOC_RE.test(line)
    if (atx || toc) headings.push({ line: index, level: atx ? atx[1].length : Number(TOC_RE.exec(line)[1].length), inFence: fence, toc })
  })
  return { lines, headings, toc: headings.filter(heading => heading.toc) }
}

// End line (exclusive) of the section that starts at `heading`.
function sectionEnd(lines, headings, heading) {
  const next = headings.find(other => other.line > heading.line && !other.inFence && other.level <= heading.level)
  if (next) return next.line
  // The last section stops before trailing footnote / link definitions.
  let end = lines.length
  let sawDefinition = false
  while (end > heading.line + 1 && (!lines[end - 1].trim() || DEFINITION_RE.test(lines[end - 1]))) {
    if (DEFINITION_RE.test(lines[end - 1])) sawDefinition = true
    end -= 1
  }
  return sawDefinition ? end : lines.length
}

/** { start, end } line range (end exclusive) of Contents heading `ordinal`, or null. */
export function sectionRange(markdown, ordinal) {
  const { lines, headings, toc } = scan(markdown)
  const heading = toc[ordinal]
  if (!heading || heading.inFence) return null
  return { start: heading.line, end: sectionEnd(lines, headings, heading), level: heading.level }
}

const tidy = text => text.replace(/\n{3,}/g, '\n\n')
const block = lines => {
  const out = [...lines]
  while (out.length && !out.at(-1).trim()) out.pop()
  return out
}

/**
 * Moves section `from` before or after (`place`) section `to` (Contents indexes). "After" means
 * after the target's whole section. Returns the new Markdown, or null when the move isn't possible
 * (e.g. into its own sub-section).
 */
export function moveSection(markdown, from, to, place = 'before') {
  const { lines, headings, toc } = scan(markdown)
  const source = toc[from], target = toc[to]
  if (!source || !target || source.inFence || target.inFence || from === to) return null
  const start = source.line, end = sectionEnd(lines, headings, source)
  if (target.line >= start && target.line < end) return null
  let insertAt = place === 'after' ? sectionEnd(lines, headings, target) : target.line
  const moving = block(lines.slice(start, end))
  const rest = [...lines.slice(0, start), ...lines.slice(end)]
  if (insertAt > start) insertAt -= end - start
  const before = rest.slice(0, insertAt)
  const after = rest.slice(insertAt)
  while (before.length && !before.at(-1).trim()) before.pop()
  const pieces = [...before, ...(before.length ? [''] : []), ...moving, '', ...after]
  return tidy(pieces.join('\n')).replace(/\n*$/, markdown.endsWith('\n') ? '\n' : '')
}

/** Moves a section up or down past its neighbouring section of the same level (same parent). */
export function moveSectionStep(markdown, ordinal, direction) {
  const { toc } = scan(markdown)
  const heading = toc[ordinal]
  if (!heading || heading.inFence) return null
  // Siblings: same level, and no higher-level heading between them.
  const parentOf = index => {
    for (let i = index - 1; i >= 0; i -= 1) if (!toc[i].inFence && toc[i].level < toc[index].level) return i
    return -1
  }
  const parent = parentOf(ordinal)
  const siblings = toc.map((item, index) => index).filter(index => !toc[index].inFence && toc[index].level === heading.level && parentOf(index) === parent)
  const position = siblings.indexOf(ordinal)
  const neighbour = siblings[position + (direction < 0 ? -1 : 1)]
  if (neighbour == null) return null
  return moveSection(markdown, ordinal, neighbour, direction < 0 ? 'before' : 'after')
}

/** Promote (-1) or demote (+1) a heading and all the headings inside its section. */
export function shiftSection(markdown, ordinal, delta) {
  const { lines, headings, toc } = scan(markdown)
  const heading = toc[ordinal]
  if (!heading || heading.inFence) return null
  const end = sectionEnd(lines, headings, heading)
  const inside = headings.filter(item => !item.inFence && item.line >= heading.line && item.line < end)
  if (inside.some(item => item.level + delta < 1 || item.level + delta > 6)) return null
  const out = [...lines]
  for (const item of inside) out[item.line] = out[item.line].replace(/^#+/, '#'.repeat(item.level + delta))
  return out.join('\n')
}

/** Takes section `ordinal` out: { text, rest } (rest = the document without it). */
export function extractSection(markdown, ordinal) {
  const range = sectionRange(markdown, ordinal)
  if (!range) return null
  const { lines } = scan(markdown)
  const text = block(lines.slice(range.start, range.end)).join('\n')
  const rest = tidy([...lines.slice(0, range.start), ...lines.slice(range.end)].join('\n'))
  return { text, rest }
}

/** Adds a section at the start (after front matter and the title's introduction) or the end. */
export function insertSection(markdown, text, where = 'end') {
  const doc = String(markdown ?? '')
  if (where === 'end') return `${doc.replace(/\s*$/, '')}${doc.trim() ? '\n\n' : ''}${text}\n`
  const lines = doc.split('\n')
  let at = 0
  if (lines[0] === '---') { const close = lines.indexOf('---', 1); if (close > 0) at = close + 1 }
  while (at < lines.length && !lines[at].trim()) at += 1
  // After the title and its introduction, before the first sub-heading.
  if (/^#\s/.test(lines[at] ?? '')) {
    at += 1
    while (at < lines.length && !/^#{1,6}\s/.test(lines[at])) at += 1
  }
  const before = lines.slice(0, at).join('\n').replace(/\s*$/, '')
  const after = lines.slice(at).join('\n').replace(/^\s*/, '')
  return tidy(`${before}${before ? '\n\n' : ''}${text}\n\n${after}`).replace(/\n*$/, '\n')
}

/** Character offset where Contents heading `ordinal` starts (to put the caret / scroll there). */
export function headingOffset(markdown, ordinal) {
  const { lines, toc } = scan(markdown)
  const heading = toc[ordinal]
  if (!heading) return 0
  return lines.slice(0, heading.line).reduce((sum, line) => sum + line.length + 1, 0)
}
