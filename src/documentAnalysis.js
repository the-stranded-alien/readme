export function extractHeadings(markdown) {
  return markdown.split('\n')
    .filter(line => /^#{1,3}\s/.test(line))
    .map(line => {
      const match = line.match(/^(#{1,3})\s+(.+)/)
      if (!match) return null
      const text = match[2]
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim()
      return {
        level: match[1].length,
        text,
        id: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
      }
    })
    .filter(Boolean)
}

export function makeSearchIndex(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(`+)(.*?)\1/g, '$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .toLocaleLowerCase()
}

function headingSlug(text) {
  return text
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
}

function normalizeDocPath(path) {
  const result = []
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') result.pop()
    else result.push(segment.toLowerCase())
  }
  return result.join('/')
}

function collectHeadingSlugs(lines) {
  const headings = new Set()
  let fence = null
  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      continue
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) headings.add(headingSlug(heading[2]))
  }
  return headings
}

export function checkMarkdownQuality(markdown, { fileName = '', knownFiles = [] } = {}) {
  const issues = []
  const lines = markdown.split('\n')
  const headings = collectHeadingSlugs(lines)
  const basePath = fileName.includes('/') ? fileName.slice(0, fileName.lastIndexOf('/') + 1) : ''
  const availableFiles = new Set(knownFiles.map(normalizeDocPath))
  let previousLevel = 0
  let fence = null

  const add = (id, line, message, suggestion) => issues.push({ id: `${id}-${line}`, type: id, line, message, suggestion })

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
      return
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      return
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      const level = heading[1].length
      if (previousLevel && level > previousLevel + 1) {
        add('heading-level-skip', lineNumber, `Heading level jumps from H${previousLevel} to H${level}.`, `Add an H${previousLevel + 1} heading or adjust this heading level.`)
      }
      previousLevel = level
    }

    for (const image of line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      if (!image[1].trim()) add('missing-image-alt', lineNumber, 'Image has no alternative text.', 'Add a short description inside the square brackets.')
    }

    if (/\[[^\]]+\]\(\s*\)/.test(line)) {
      add('empty-link', lineNumber, 'Link destination is empty.', 'Add a URL or a heading anchor inside the parentheses.')
    }

    for (const link of line.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
      const destination = link[1].trim().replace(/^<|>$/g, '').split(/\s+['"]?/)[0]
      if (!destination || destination.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) continue
      let path = destination.split(/[?#]/, 1)[0]
      if (!/\.(?:md|markdown|txt)$/i.test(path)) continue
      try { path = decodeURIComponent(path) } catch { /* keep malformed escapes as a non-matching path */ }
      const resolved = normalizeDocPath(`${basePath}${path}`)
      if (!availableFiles.has(resolved)) {
        add('broken-file-link', lineNumber, `Local document link “${path}” does not match an open file.`, 'Check the file name and relative path.')
      }
    }

    for (const anchor of line.matchAll(/\]\(#([^\s)]+)\)/g)) {
      let target = anchor[1].replace(/^#/, '').toLowerCase()
      try { target = decodeURIComponent(target) } catch { /* leave malformed escapes visible as a broken anchor */ }
      if (!headings.has(target)) {
        add('broken-anchor', lineNumber, `Heading link “#${anchor[1]}” has no matching heading.`, 'Correct the anchor or add the missing heading.')
      }
    }
  })

  return issues
}

export function analyzeDocument(markdown, options) {
  const trimmed = markdown.trim()
  return {
    headings: extractHeadings(markdown),
    lineCount: markdown.split('\n').length,
    wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
    searchIndex: makeSearchIndex(markdown),
    qualityIssues: checkMarkdownQuality(markdown, options),
  }
}
