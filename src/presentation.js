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
