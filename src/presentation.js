// Splits a Markdown document into slides. The pure-helper default stays on the
// established heading behavior; the app's saved presentation default is smart.
// Options: `level` (1–6) — headings up to this level start a slide;
//          `rules` — a `---` line (after a blank line) also starts a slide.
export const DEFAULT_SPLIT = { mode: 'headings', level: 2, rules: false, targetWords: 180 }

export function splitSlides(markdown, options) {
  return splitSlidesWithHeadings(markdown, options).slides
}

// Same heading rule as the contents list (extractHeadings), so TOC row n is heading n here.
const TOC_HEADING = /^(#{1,3})\s+(.+)/

/**
 * Splits into slides and also records, for each contents heading (in order),
 * the slide it sits on: `headingSlides[n]` is the slide of the nth heading.
 */
const wordCount = text => (String(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length

function contentBlocks(markdown) {
  const blocks = []
  let lines = []
  let fence = null
  const flush = () => {
    if (!lines.length) return
    const text = lines.join('\n').trim()
    lines = []
    if (!text) return
    const parts = text.split('\n')
    let type = 'paragraph'
    if (/^\s{0,3}(?:`{3,}|~{3,})/.test(parts[0])) type = 'code'
    else if (/^\s{0,3}\?\?\?\s*$/.test(parts[0])) type = 'notes'
    else if (/^\s{0,3}#{1,6}\s/.test(parts[0]) || /^\s{0,3}(?:=+|-+)\s*$/.test(parts[1] || '')) type = 'heading'
    else if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text)) type = 'rule'
    else if (parts.length > 1 && /\|/.test(parts[0]) && /^\s*\|?\s*:?-{3,}/.test(parts[1])) type = 'table'
    else if (/^\s{0,3}(?:[-+*]\s|\d+[.)]\s)/.test(parts[0])) type = 'list'
    else if (/^\s{0,3}>/.test(parts[0])) type = 'quote'
    blocks.push({ type, text, words: wordCount(text) })
  }
  for (const line of String(markdown ?? '').split('\n')) {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      lines.push(line)
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) fence = null
    } else if (match) {
      fence = match[1]
      lines.push(line)
    } else if (!line.trim()) flush()
    else lines.push(line)
  }
  flush()

  // Blank lines are allowed between list items and table rows. Keep those structures whole.
  const merged = []
  for (const block of blocks) {
    const previous = merged.at(-1)
    if (previous && block.type === previous.type && ['list', 'table'].includes(block.type)) {
      previous.text += `\n\n${block.text}`
      previous.words += block.words
    } else merged.push({ ...block })
  }
  return merged
}

function contentUnits(blocks) {
  const units = []
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const next = blocks[index + 1]
    if (block.type === 'notes' && units.length) {
      units[units.length - 1].text += `\n\n${block.text}`
      continue
    }
    const attachLead = block.type === 'paragraph' && block.words <= 48 && next && ['list', 'table', 'quote', 'code'].includes(next.type)
    const attachHeading = block.type === 'heading' && next && next.type !== 'heading' && next.type !== 'rule'
    if (attachLead || attachHeading) {
      units.push({ type: next.type, text: `${block.text}\n\n${next.text}`, words: block.words + next.words })
      index += 1
    } else units.push({ ...block })
  }
  return units
}

function splitContentBlocks(markdown, { mode, rules, targetWords }) {
  const units = contentUnits(contentBlocks(markdown))
  const slides = []
  let current = []
  let words = 0
  let previousType = ''
  const flush = () => {
    const text = current.join('\n\n').trim()
    if (text) slides.push(text)
    current = []
    words = 0
    previousType = ''
  }
  for (const unit of units) {
    if (unit.type === 'rule' && rules) { flush(); continue }
    const strongBoundary = ['list', 'table', 'quote', 'code'].includes(unit.type)
      && words >= targetWords * 0.55
      && !['list', 'table', 'quote', 'code'].includes(previousType)
    const sizeBoundary = words > 0 && words + unit.words > targetWords
    if (mode === 'blocks' && current.length || mode === 'length' && sizeBoundary || mode === 'smart' && current.length && (sizeBoundary || strongBoundary)) flush()
    current.push(unit.text)
    words += unit.words
    previousType = unit.type
  }
  flush()
  return slides.length ? slides : [String(markdown ?? '').trim() || ' ']
}

function headingsInSlides(slides) {
  const result = []
  slides.forEach((slide, slideIndex) => {
    let fence = null
    for (const line of slide.split('\n')) {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
      if (fence) {
        if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
      } else if (fenceMatch) fence = fenceMatch[1]
      else if (TOC_HEADING.test(line)) result.push(slideIndex)
    }
  })
  return result
}

export function splitSlidesWithHeadings(markdown, { mode = DEFAULT_SPLIT.mode, level = DEFAULT_SPLIT.level, rules = DEFAULT_SPLIT.rules, targetWords = DEFAULT_SPLIT.targetWords } = {}) {
  const breakAt = new RegExp(`^\\s{0,3}#{1,${Math.min(6, Math.max(1, Number(level) || 2))}}\\s`)
  const lines = String(markdown ?? '').split('\n')
  const setextStarts = new Set()
  if (mode === 'smart') {
    let setextFence = null
    lines.forEach((line, index) => {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
      if (setextFence) {
        if (fenceMatch && fenceMatch[1][0] === setextFence[0] && fenceMatch[1].length >= setextFence.length) setextFence = null
        return
      }
      if (fenceMatch) { setextFence = fenceMatch[1]; return }
      const underline = lines[index + 1]
      if (line.trim() && !/^\s{0,3}(?:[-+*]\s|\d+[.)]\s|>|`|~)/.test(line)
        && (Number(level) >= 1 && /^\s{0,3}=+\s*$/.test(underline || '')
          || Number(level) >= 2 && /^\s{0,3}-+\s*$/.test(underline || ''))) setextStarts.add(index)
    })
  }
  const slides = []
  let current = []
  let fence = null
  let previous = ''
  const flush = () => {
    const text = current.join('\n').trim()
    if (text) slides.push(text)
    current = []
  }
  for (const [lineIndex, line] of lines.entries()) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    let isRule = false
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
    } else if (fenceMatch) {
      fence = fenceMatch[1]
    } else if (breakAt.test(line) || setextStarts.has(lineIndex)) {
      flush()
    } else if (rules && !previous.trim() && /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      // A thematic break (not a setext underline, which follows text) ends the slide.
      flush()
      isRule = true
    }
    if (!isRule) current.push(line)
    previous = line
  }
  flush()
  const sourceSlides = slides.length ? slides : [markdown.trim() || ' ']
  const hasHeadings = contentBlocks(markdown).some(block => block.type === 'heading')
  const resolvedSlides = mode === 'single'
    ? [String(markdown ?? '').trim() || ' ']
    : mode === 'blocks' || mode === 'length' || (mode === 'smart' && !hasHeadings)
      ? splitContentBlocks(markdown, { mode: mode === 'smart' ? 'smart' : mode, rules, targetWords: Math.max(40, Number(targetWords) || DEFAULT_SPLIT.targetWords) })
      : sourceSlides
  return { slides: resolvedSlides, headingSlides: headingsInSlides(resolvedSlides) }
}

/** The slide that contents heading number `ordinal` (0-based) is on. */
export function slideForHeading(markdown, ordinal, options) {
  const { slides, headingSlides } = splitSlidesWithHeadings(markdown, options)
  return Math.min(headingSlides[ordinal] ?? 0, slides.length - 1)
}

/**
 * Slides for only the chosen sections (contents heading numbers). A section runs
 * from its heading to the next heading of the same or a higher level; sections
 * inside an already chosen one aren't repeated. Each section starts a new slide.
 */
export function sectionSlides(markdown, ordinals, options) {
  const lines = markdown.split('\n')
  const headings = [] // { line, level, inFence }
  let fence = null
  lines.forEach((line, index) => {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    const match = TOC_HEADING.exec(line)
    if (match) headings.push({ line: index, level: match[1].length, inFence: Boolean(fence) })
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
    } else if (fenceMatch) fence = fenceMatch[1]
  })
  const slides = []
  let coveredUntil = -1
  for (const ordinal of [...ordinals].sort((a, b) => a - b)) {
    const start = headings[ordinal]
    if (!start || start.line < coveredUntil) continue
    const next = headings.slice(ordinal + 1).find(h => !h.inFence && h.level <= start.level)
    const end = next ? next.line : lines.length
    coveredUntil = end
    const section = lines.slice(start.line, end).join('\n').trim()
    if (section) slides.push(...splitSlides(section, options))
  }
  return slides
}

export function slideTitle(slide) {
  const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m.exec(slide)
  return heading ? heading[1].replace(/[*_`~]/g, '') : slide.split('\n')[0].slice(0, 60)
}

/**
 * Speaker notes: everything after a line containing only `???` (outside fenced
 * code) is notes for that slide; they show only in the presenter view.
 */
export function splitSlideNotes(slide) {
  const lines = slide.split('\n')
  let fence = null
  for (let i = 0; i < lines.length; i += 1) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[i])
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
    } else if (fenceMatch) {
      fence = fenceMatch[1]
    } else if (/^\s{0,3}\?\?\?\s*$/.test(lines[i])) {
      return { body: lines.slice(0, i).join('\n').trim() || ' ', notes: lines.slice(i + 1).join('\n').trim() }
    }
  }
  return { body: slide, notes: '' }
}

// Slide text size in presentation mode (1 = default), kept between slides and visits.
export const PRESENTATION_ZOOM = { min: 0.6, max: 2, step: 0.1, key: 'readme-presentation-zoom' }
export function clampZoom(value) {
  const n = Math.round(Number(value) * 10) / 10
  return Number.isFinite(n) ? Math.min(PRESENTATION_ZOOM.max, Math.max(PRESENTATION_ZOOM.min, n)) : 1
}
