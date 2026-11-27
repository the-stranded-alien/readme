// The Library: what each document is (title, excerpt, folder, tags, status, words) and
// editing a document's front matter as typed properties. Front matter is rewritten one entry
// at a time: entries that weren't changed keep their exact text (comments, nested YAML, quotes).

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const INLINE_TAG_RE = /(?:^|[\s(])#([\p{L}\p{N}_-]*\p{L}[\p{L}\p{N}_/-]*)/gu
const stripExt = name => String(name).replace(/\.(md|markdown|mdx|txt)$/i, '')

// ── Front matter entries ───────────────────────────────────────
/** Parses front matter into entries: { key, type, value, raw, simple } (plus non-key lines). */
export function readFrontMatter(content) {
  const match = FRONT_MATTER_RE.exec(String(content ?? ''))
  if (!match) return { present: false, entries: [], bodyStart: 0 }
  const lines = match[1].split(/\r?\n/)
  const entries = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const kv = /^([A-Za-z0-9_][A-Za-z0-9_ -]*?)\s*:(?:\s+(.*)|\s*)$/.exec(line)
    if (!kv) { entries.push({ key: null, raw: [line] }); continue }
    const key = kv[1]
    const rest = (kv[2] ?? '').trim()
    const raw = [line]
    // Continuation lines (lists, nested maps, block strings) belong to this key.
    while (i + 1 < lines.length && /^(\s+\S|\s*-\s)/.test(lines[i + 1]) && !/^[A-Za-z0-9_]/.test(lines[i + 1])) { i += 1; raw.push(lines[i]) }
    entries.push({ key, raw, ...typedValue(rest, raw.slice(1)) })
  }
  return { present: true, entries, bodyStart: match[0].length }
}

const unquote = text => text.replace(/^(['"])(.*)\1$/, '$2')
function typedValue(rest, more) {
  if (more.length) {
    if (!rest && more.every(line => /^\s*-\s+\S/.test(line) && !/:\s/.test(line.replace(/^\s*-\s+/, '')))) {
      return { type: 'list', value: more.map(line => unquote(line.replace(/^\s*-\s+/, '').trim())), simple: true, style: 'block' }
    }
    return { type: 'yaml', value: [rest, ...more].join('\n'), simple: false }
  }
  if (/^\[.*\]$/.test(rest)) return { type: 'list', value: rest.slice(1, -1).split(',').map(item => unquote(item.trim())).filter(Boolean), simple: true, style: 'inline' }
  if (/^[|>]/.test(rest) || /^[{&*!]/.test(rest)) return { type: 'yaml', value: rest, simple: false }
  if (/^(true|false)$/i.test(rest)) return { type: 'checkbox', value: /^true$/i.test(rest), simple: true }
  if (/^\d{4}-\d{2}-\d{2}$/.test(unquote(rest))) return { type: 'date', value: unquote(rest), simple: true }
  if (/^-?\d+(\.\d+)?$/.test(rest)) return { type: 'number', value: rest, simple: true }
  return { type: 'text', value: unquote(rest), simple: true }
}

const needsQuotes = text => text === '' || /^[\s\-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|\s$|^(true|false|null|yes|no|~)$/i.test(text) || /^-?\d+(\.\d+)?$/.test(text)
const quoteYaml = text => (needsQuotes(text) ? JSON.stringify(text) : text)
/** YAML lines for one property. */
export function propertyLines({ key, type, value, style }) {
  if (type === 'list') {
    const items = (value ?? []).map(item => String(item).trim()).filter(Boolean)
    if (style === 'block' && items.length) return [`${key}:`, ...items.map(item => `  - ${quoteYaml(item)}`)]
    return [`${key}: [${items.map(item => (/[,[\]]/.test(item) ? JSON.stringify(item) : quoteYaml(item))).join(', ')}]`]
  }
  if (type === 'checkbox') return [`${key}: ${value ? 'true' : 'false'}`]
  if (type === 'number') return [`${key}: ${String(value).trim() || 0}`]
  if (type === 'date') return [`${key}: ${String(value).trim()}`]
  return [`${key}: ${quoteYaml(String(value ?? ''))}`]
}

/**
 * The document with its front matter set to `properties` ([{ key, type, value }]).
 * Unchanged and non-simple entries keep their text; removed keys go; new keys are appended.
 */
export function writeFrontMatter(content, properties) {
  const text = String(content ?? '')
  const { present, entries, bodyStart } = readFrontMatter(text)
  const byKey = new Map(properties.map(prop => [prop.key, prop]))
  const out = []
  const seen = new Set()
  for (const entry of entries) {
    if (!entry.key) { out.push(...entry.raw); continue }
    const next = byKey.get(entry.key)
    if (!next) continue // removed
    seen.add(entry.key)
    const same = next.type === entry.type && JSON.stringify(next.value) === JSON.stringify(entry.value)
    out.push(...(same || !entry.simple && next.type === 'yaml' ? entry.raw : propertyLines({ ...next, style: next.style ?? entry.style })))
  }
  for (const prop of properties) if (!seen.has(prop.key) && prop.key.trim()) out.push(...propertyLines(prop))
  const body = present ? text.slice(bodyStart) : text
  while (out.length && !out[out.length - 1].trim()) out.pop()
  if (!out.length) return body.replace(/^\r?\n/, '')
  return `---\n${out.join('\n')}\n---\n${present ? body : body.replace(/^(?!\n)/, '\n')}`
}

/** Front matter as a plain { key: value } object (simple entries only). */
export function frontMatterValues(content) {
  return Object.fromEntries(readFrontMatter(content).entries.filter(entry => entry.key && entry.simple).map(entry => [entry.key.toLowerCase(), entry.value]))
}

// ── Documents ──────────────────────────────────────────────────
function bodyText(content) {
  const match = FRONT_MATTER_RE.exec(String(content ?? ''))
  return match ? content.slice(match[0].length) : String(content ?? '')
}
/** Inline #tags in prose (not in code, not headings). */
export function inlineTags(markdown) {
  const tags = new Set()
  let fence = false
  for (const line of String(markdown).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence || /^\s{4}/.test(line)) continue
    const clean = line.replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ')
    for (const match of clean.matchAll(INLINE_TAG_RE)) tags.add(match[1].toLowerCase())
  }
  return [...tags]
}

const toList = value => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : []).map(item => String(item).replace(/^#/, '').trim().toLowerCase()).filter(Boolean)

/** What the Library shows for a file. */
export function documentInfo(file) {
  const content = String(file.content ?? '')
  const body = bodyText(content)
  const meta = frontMatterValues(content)
  const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/m.exec(body)?.[1]
  const plain = body
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, ' ')
    .replace(INLINE_TAG_RE, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, label) => label || target)
    .replace(/[*_`~>#|=-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tags = [...new Set([...toList(meta.tags), ...toList(meta.tag), ...inlineTags(body)])]
  return {
    id: file.id,
    name: file.name,
    title: String(meta.title || heading || stripExt(file.name.split('/').pop())).trim(),
    excerpt: plain.slice(0, 180),
    folder: file.name.split('/').slice(0, -1).join('/'),
    tags,
    status: typeof meta.status === 'string' ? meta.status.trim().toLowerCase() : '',
    words: (plain.match(/\S+/g) || []).length,
    updatedAt: Number(file.updatedAt) || 0,
    pinned: Boolean(file.pinned),
    closed: Boolean(file.closed),
  }
}

export const LIBRARY_SORTS = [
  ['updated', 'Last edited'],
  ['title', 'Title'],
  ['folder', 'Folder'],
  ['words', 'Length'],
  ['status', 'Status'],
  ['custom', 'Manual order'],
]
export function sortDocuments(list, sort, customOrder = []) {
  if (sort === 'custom') {
    const index = new Map(customOrder.map((id, i) => [id, i]))
    return [...list].sort((a, b) => {
      const ia = index.has(a.id) ? index.get(a.id) : Number.MAX_SAFE_INTEGER
      const ib = index.has(b.id) ? index.get(b.id) : Number.MAX_SAFE_INTEGER
      return (ia - ib) || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
    })
  }
  const by = {
    updated: (a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }),
    folder: (a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title),
    words: (a, b) => b.words - a.words,
    status: (a, b) => (a.status || '~').localeCompare(b.status || '~') || a.title.localeCompare(b.title),
  }[sort] ?? (() => 0)
  return [...list].sort((a, b) => (b.pinned - a.pinned) || by(a, b))
}
/** filter: { query, folder, tag, status, pinned, closed } → matching documents. */
export function filterDocuments(list, filter = {}) {
  const query = String(filter.query ?? '').trim().toLowerCase()
  return list.filter(doc => (!query || `${doc.title} ${doc.name} ${doc.excerpt} ${doc.tags.join(' ')} ${doc.status}`.toLowerCase().includes(query))
    && (!filter.folder || doc.folder === filter.folder || doc.folder.startsWith(`${filter.folder}/`))
    && (!filter.tag || doc.tags.includes(filter.tag))
    && (!filter.status || doc.status === filter.status)
    && (!filter.pinned || doc.pinned)
    && (filter.closed !== false || !doc.closed))
}

/** Adds tags to a document's front matter `tags` (keeping its style). */
export function addTags(content, tags) {
  const { entries } = readFrontMatter(content)
  const props = entries.filter(entry => entry.key).map(entry => ({ key: entry.key, type: entry.type, value: entry.value, style: entry.style }))
  const current = props.find(prop => prop.key.toLowerCase() === 'tags')
  const clean = tags.map(tag => tag.replace(/^#/, '').trim()).filter(Boolean)
  if (current && current.type === 'list') current.value = [...new Set([...current.value, ...clean])]
  else if (current && current.type === 'text') Object.assign(current, { type: 'list', value: [...new Set([...toList(current.value), ...clean])] })
  else if (!current) props.push({ key: 'tags', type: 'list', value: clean })
  else return content
  return writeFrontMatter(content, props)
}
