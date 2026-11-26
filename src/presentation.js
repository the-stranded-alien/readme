// Splits a Markdown document into slides: a new slide starts at every H1 or H2
// (outside fenced code). Content before the first heading becomes its own slide.

export function splitSlides(markdown) {
  const slides = []
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
  }
  flush()
  return slides.length ? slides : [markdown.trim() || ' ']
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
