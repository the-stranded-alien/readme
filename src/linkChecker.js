import { headingSlug } from './headingSections'
import { resolveFileLink } from './fileUtils'
import { imageReferences, resolveImagePath } from './attachments'
import { parseWikiLinks, resolveWikiTarget } from './wikiLinks'

const maskCode = text => String(text ?? '')
  .replace(/^\s*(```|~~~)[^\n]*\n[\s\S]*?^\s*\1[^\n]*$/gm, block => block.replace(/[^\n]/g, ' '))
  .replace(/(`+)[^`\n]*?\1/g, span => ' '.repeat(span.length))

const headings = content => [...String(content ?? '').matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)]
  .map(match => headingSlug(match[1]))

const headingExists = (content, anchor) => {
  if (!anchor) return true
  let decoded = anchor
  try { decoded = decodeURIComponent(anchor) } catch { /* malformed link stays visible */ }
  return headings(content).includes(headingSlug(decoded))
}

/** Find broken workspace links, unavailable attachments, and documents without inbound links. */
export function checkWorkspaceLinks(files, attachmentPaths = []) {
  const docs = files.filter(file => file && typeof file.name === 'string')
  const byPath = new Map(docs.map(file => [file.name.toLowerCase(), file]))
  const attachments = new Set(attachmentPaths.map(path => String(path).toLowerCase()))
  const inbound = new Set()
  const issues = []
  const add = issue => issues.push({ id: `${issue.type}:${issue.sourceId}:${issues.length}`, ...issue })

  for (const file of docs) {
    const masked = maskCode(file.content)
    for (const link of parseWikiLinks(file.content)) {
      const target = link.target ? resolveWikiTarget(link.target, file.name, docs) : file
      if (!target) {
        add({ type: 'broken', sourceId: file.id, sourceName: file.name, targetName: link.target, message: `Missing wiki link: ${link.target}` })
        continue
      }
      if (target.id !== file.id) inbound.add(target.id)
      if (link.heading && !headingExists(target.content, link.heading)) {
        add({ type: 'broken', sourceId: file.id, sourceName: file.name, targetName: target.name, message: `Missing heading “${link.heading}” in ${target.name}` })
      }
    }

    const imageRefIds = new Set([...masked.matchAll(/!\[([^\]\n]*)\](?:\[([^\]\n]*)\])?/g)]
      .map(([, alt, id]) => (id || alt).trim().replace(/\s+/g, ' ').toLowerCase()))
    for (const ref of imageReferences(file.content).filter(item => item.kind !== 'definition'
      || imageRefIds.has(item.id.trim().replace(/\s+/g, ' ').toLowerCase()))) {
      const path = resolveImagePath(ref.src, file.name)
      if (path && !attachments.has(path.toLowerCase())) {
        add({ type: 'attachment', sourceId: file.id, sourceName: file.name, targetName: path, message: `Missing image attachment: ${path}` })
      }
    }

    for (const match of masked.matchAll(/(?<!!\])\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1].replace(/^<|>$/g, '')
      if (href.startsWith('#')) {
        if (!headingExists(file.content, href.slice(1))) add({ type: 'broken', sourceId: file.id, sourceName: file.name, targetName: file.name, message: `Missing heading “${href.slice(1)}” in ${file.name}` })
        continue
      }
      const resolved = resolveFileLink(file.name, href)
      if (!resolved) continue
      const target = byPath.get(resolved.name.toLowerCase())
      if (!target) {
        add({ type: 'broken', sourceId: file.id, sourceName: file.name, targetName: resolved.name, message: `Missing document link: ${resolved.name}` })
        continue
      }
      if (target.id !== file.id) inbound.add(target.id)
      if (resolved.anchor && !headingExists(target.content, resolved.anchor)) {
        add({ type: 'broken', sourceId: file.id, sourceName: file.name, targetName: target.name, message: `Missing heading “${resolved.anchor}” in ${target.name}` })
      }
    }
  }

  for (const file of docs) if (!inbound.has(file.id)) {
    add({ type: 'orphan', sourceId: file.id, sourceName: file.name, targetName: file.name, message: 'No other workspace document links here.' })
  }
  return issues
}
