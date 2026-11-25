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

export function analyzeDocument(markdown) {
  const trimmed = markdown.trim()
  return {
    headings: extractHeadings(markdown),
    lineCount: markdown.split('\n').length,
    wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
    searchIndex: makeSearchIndex(markdown),
  }
}
