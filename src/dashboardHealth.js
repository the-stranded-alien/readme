import { checkMarkdownQuality } from './documentAnalysis'
import { readFrontMatter } from './library'

export function healthIssues(file) {
  const issues = []
  const frontmatter = readFrontMatter(file.content)
  const hasFrontmatterTitle = frontmatter.entries.some(entry => entry.key?.toLowerCase() === 'title' && String(entry.value || '').trim())
  if (!/^\s*#\s+\S/m.test(file.content) && !hasFrontmatterTitle) issues.push({ type: 'title', message: 'No document title or H1 heading.' })
  const quality = checkMarkdownQuality(file.content, { fileName: file.name })
  for (const issue of quality.filter(item => item.type === 'heading-level-skip')) issues.push({ type: 'heading', message: issue.message, line: issue.line })
  const lines = file.content.split('\n')
  const sections = []
  let section = { heading: 'Before the first heading', words: 0 }
  for (const line of lines) {
    if (/^\s{0,3}#{1,6}\s+/.test(line)) { sections.push(section); section = { heading: line.replace(/^\s*#+\s*/, '').trim(), words: 0 } }
    else section.words += line.trim().split(/\s+/).filter(Boolean).length
  }
  sections.push(section)
  for (const long of sections.filter(item => item.words >= 1200)) issues.push({ type: 'long-section', message: `“${long.heading || 'Untitled section'}” has about ${long.words.toLocaleString()} words.` })
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  const staleDates = [...new Set(file.content.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [])].filter(date => date < cutoffKey)
  for (const date of staleDates) issues.push({ type: 'stale-date', message: `Review the older date ${date}.` })
  return issues
}
