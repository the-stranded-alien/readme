// Wiki links between documents: [[Name]], [[folder/Name]], [[Name#Heading]], [[Name|label]],
// [[#Heading]] (same document). Names match file names without the extension, ignoring case;
// a bare name prefers a file in the same folder, then the shortest path.
import { headingSlug } from './headingSections'
import { relativeFileLink, resolveFileLink } from './fileUtils'

// target (optional when there's a #heading), #heading, |label
export const WIKI_LINK_RE = /\[\[([^[\]|#\n]*)(?:#([^[\]|\n]+))?(?:\|([^[\]\n]+))?\]\]/g

const stripExtension = name => String(name || '').replace(/\.(md|markdown|mdx|txt)$/i, '')
const folderOf = name => String(name || '').split('/').slice(0, -1).join('/')
const baseOf = name => stripExtension(String(name || '').split('/').pop())

/** The text a wiki link shows: its label, or "Name › Heading", or the name. */
export function wikiLabel({ target, heading, label }) {
  if (label) return label.trim()
  const name = target ? baseOf(target.trim()) : ''
  return heading ? (name ? `${name} › ${heading.trim()}` : heading.trim()) : name
}

/** Blank out code (fenced blocks and inline code) so links inside code are ignored. */
function maskCode(markdown) {
  return String(markdown || '')
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, block => block.replace(/[^\n]/g, ' '))
    .replace(/(`+)[^`\n]*?\1/g, span => ' '.repeat(span.length))
}

/** Every wiki link in a document: { target, heading, label, from, to }. */
export function parseWikiLinks(markdown) {
  const masked = maskCode(markdown)
  const links = []
  for (const match of masked.matchAll(WIKI_LINK_RE)) {
    const [, target = '', heading, label] = match
    if (!target.trim() && !heading) continue
    links.push({ target: target.trim(), heading: heading?.trim(), label: label?.trim(), from: match.index, to: match.index + match[0].length })
  }
  return links
}

/** The file a wiki link target points to (`files`: [{ id, name }]), or null. */
export function resolveWikiTarget(target, fromName, files) {
  const wanted = stripExtension(String(target || '').trim().replace(/^\/+/, '')).toLowerCase()
  if (!wanted) return null
  const exact = files.find(file => stripExtension(file.name).toLowerCase() === wanted)
  if (exact) return exact
  if (wanted.includes('/')) return null
  const matches = files.filter(file => baseOf(file.name).toLowerCase() === wanted)
  if (!matches.length) return null
  const here = folderOf(fromName)
  return matches.find(file => folderOf(file.name) === here)
    ?? [...matches].sort((a, b) => a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length)[0]
}

/** remark plugin: [[…]] in text becomes a link the app opens (outside code and existing links). */
export function remarkWikiLinks() {
  const visit = (node, inLink) => {
    if (!node.children) return
    const next = []
    for (const child of node.children) {
      if (child.type === 'text' && !inLink && child.value.includes('[[')) {
        let last = 0
        for (const match of child.value.matchAll(WIKI_LINK_RE)) {
          const [whole, target = '', heading, label] = match
          if (!target.trim() && !heading) continue
          if (match.index > last) next.push({ type: 'text', value: child.value.slice(last, match.index) })
          next.push({
            type: 'link', url: '#', title: null,
            data: { hProperties: { className: ['wiki-link'], 'data-wiki': target.trim(), 'data-wiki-heading': heading?.trim() ?? '' } },
            children: [{ type: 'text', value: wikiLabel({ target, heading, label }) }],
          })
          last = match.index + whole.length
        }
        if (last === 0) next.push(child)
        else if (last < child.value.length) next.push({ type: 'text', value: child.value.slice(last) })
      } else {
        visit(child, inLink || child.type === 'link' || child.type === 'linkReference')
        next.push(child)
      }
    }
    node.children = next
  }
  return tree => visit(tree, false)
}

/** For exports: [[links]] → relative Markdown links (or plain text when the file doesn't exist). */
export function wikiLinksToMarkdown(markdown, fromName, files) {
  const links = parseWikiLinks(markdown)
  if (!links.length) return markdown
  let out = ''
  let last = 0
  for (const link of links) {
    out += markdown.slice(last, link.from)
    const text = wikiLabel(link).replace(/[[\]]/g, '')
    const anchor = link.heading ? `#${headingSlug(link.heading)}` : ''
    const file = link.target ? resolveWikiTarget(link.target, fromName, files) : null
    if (!link.target) out += `[${text}](${anchor})`
    else out += file ? `[${text}](${relativeFileLink(fromName, file.name)}${anchor})` : text
    last = link.to
  }
  return out + markdown.slice(last)
}

/**
 * "Linked from": other files that link to `target` ({ name }) with a [[wiki link]] or a relative
 * Markdown link. Returns [{ file, snippet }] (one per linking file, with the first link's line).
 */
export function findBacklinks(target, files) {
  const results = []
  for (const file of files) {
    if (file.name === target.name) continue
    const content = String(file.content || '')
    let at = -1
    for (const link of parseWikiLinks(content)) {
      if (link.target && resolveWikiTarget(link.target, file.name, files)?.name === target.name) { at = link.from; break }
    }
    if (at < 0) {
      for (const match of maskCode(content).matchAll(/\]\(([^)\s]+)/g)) {
        if (resolveFileLink(file.name, match[1])?.name === target.name) { at = match.index; break }
      }
    }
    if (at < 0) continue
    const start = content.lastIndexOf('\n', at) + 1
    const end = content.indexOf('\n', at)
    const line = content.slice(start, end < 0 ? undefined : end)
      .replace(WIKI_LINK_RE, (_m, t, h, l) => wikiLabel({ target: t, heading: h, label: l }))
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[#>\-*+\s\d.]+/, '').trim()
    results.push({ file, snippet: line.length > 140 ? `${line.slice(0, 137)}…` : line })
  }
  return results
}

/**
 * Before renaming `oldName` → `newName` (`files` still has the old name): the new contents of
 * other files whose wiki links point to it. Returns [{ file, content }].
 */
export function renameWikiLinks(files, oldName, newName) {
  const after = files.map(item => (item.name === oldName ? { ...item, name: newName } : item))
  const changes = []
  for (const file of files) {
    if (file.name === oldName) continue
    const content = String(file.content || '')
    // A bare name stays bare when it still finds the renamed file; otherwise use the full path.
    const nextTarget = resolveWikiTarget(baseOf(newName), file.name, after)?.name === newName ? baseOf(newName) : stripExtension(newName)
    let out = ''
    let last = 0
    for (const link of parseWikiLinks(content)) {
      if (!link.target || resolveWikiTarget(link.target, file.name, files)?.name !== oldName) continue
      out += `${content.slice(last, link.from)}[[${nextTarget}${link.heading ? `#${link.heading}` : ''}${link.label ? `|${link.label}` : ''}]]`
      last = link.to
    }
    if (last) changes.push({ file, content: out + content.slice(last) })
  }
  return changes
}

/** While typing: the [[… being written at `caret` ({ from, query, file, heading }) or null. */
export function detectWikiLink(value, caret) {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const before = value.slice(lineStart, caret)
  const open = before.lastIndexOf('[[')
  if (open < 0 || before.slice(open).includes(']]')) return null
  const query = before.slice(open + 2)
  if (/[[\]|]/.test(query)) return null
  const hash = query.indexOf('#')
  return { from: lineStart + open, query, file: hash < 0 ? query : query.slice(0, hash), heading: hash < 0 ? null : query.slice(hash + 1) }
}
