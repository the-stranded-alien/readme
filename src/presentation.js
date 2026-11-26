// Splits a Markdown document into slides: a new slide starts at every H1 or H2
// (outside fenced code). Content before the first heading becomes its own slide.

export function splitSlides(markdown) {
  return splitSlidesWithHeadings(markdown).slides
}

// Same heading rule as the contents list (extractHeadings), so TOC row n is heading n here.
const TOC_HEADING = /^(#{1,3})\s+(.+)/

/**
 * Splits into slides and also records, for each contents heading (in order),
 * the slide it sits on: `headingSlides[n]` is the slide of the nth heading.
 */
export function splitSlidesWithHeadings(markdown) {
  const slides = []
  const headingSlides = []
  let current = []
  let fence = null
  const flush = () => {
    const text = current.join('\n').trim()
    if (text) slides.push(text)
    current = []
  }
  for (const line of markdown.split('\n')) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
    } else if (fenceMatch) {
      fence = fenceMatch[1]
    } else if (/^\s{0,3}#{1,2}\s/.test(line)) {
      flush()
    }
    current.push(line)
    if (TOC_HEADING.test(line)) headingSlides.push(slides.length)
  }
  flush()
  return { slides: slides.length ? slides : [markdown.trim() || ' '], headingSlides }
}

/** The slide that contents heading number `ordinal` (0-based) is on. */
export function slideForHeading(markdown, ordinal) {
  const { slides, headingSlides } = splitSlidesWithHeadings(markdown)
  return Math.min(headingSlides[ordinal] ?? 0, slides.length - 1)
}

/**
 * Slides for only the chosen sections (contents heading numbers). A section runs
 * from its heading to the next heading of the same or a higher level; sections
 * inside an already chosen one aren't repeated. Each section starts a new slide.
 */
export function sectionSlides(markdown, ordinals) {
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
    if (section) slides.push(...splitSlides(section))
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
