// Image attachments: pasted / dropped images are stored next to the workspace (IndexedDB) and
// documents refer to them by a short path — "![Chart](/attachments/chart.png)" — instead of a
// huge embedded data URI. "/attachments/…" is relative to the workspace root, so it keeps
// working when documents move between folders (and in GitHub / VS Code with a synced folder).

export const ATTACHMENT_DIR = 'attachments'
const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,/i
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' }

export const extensionFor = type => EXT[String(type).toLowerCase()] ?? 'png'
export const isAttachmentPath = path => typeof path === 'string' && path.startsWith(`${ATTACHMENT_DIR}/`)

/** A unique "attachments/name.ext" for a new image. */
export function attachmentPath(fileName, type, existing) {
  const base = (String(fileName || 'image').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image').slice(0, 40)
  const ext = extensionFor(type)
  const taken = new Set([...existing].map(path => path.toLowerCase()))
  let path = `${ATTACHMENT_DIR}/${base}.${ext}`
  for (let n = 2; taken.has(path.toLowerCase()); n += 1) path = `${ATTACHMENT_DIR}/${base}-${n}.${ext}`
  return path
}

/** The Markdown source for an attachment (root-relative so it survives moving the document). */
export const attachmentSrc = path => `/${path.split('/').map(encodeURIComponent).join('/')}`

/** Workspace path an image source points to (relative to the document, or "/…" from the root). */
export function resolveImagePath(src, docName = '') {
  const value = String(src ?? '').trim()
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') || value.startsWith('#')) return null
  let path
  try { path = decodeURIComponent(value.split(/[?#]/)[0]) } catch { path = value.split(/[?#]/)[0] }
  const parts = path.startsWith('/') ? [] : String(docName).split('/').slice(0, -1)
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/') || null
}

/**
 * Image references in Markdown: inline "![alt](src "title")" and reference definitions
 * "[id]: src". Each: { from, to (of the src), src, alt?, kind }. Code is skipped.
 */
export function imageReferences(markdown) {
  const text = String(markdown ?? '')
  const masked = text
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, block => block.replace(/[^\n]/g, ' '))
    .replace(/(`+)[^`\n]*?\1/g, span => ' '.repeat(span.length))
  const refs = []
  for (const match of masked.matchAll(/!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g)) {
    const raw = match[2]
    const start = match.index + match[0].indexOf(raw, 3 + match[1].length)
    const src = raw.replace(/^<|>$/g, '')
    refs.push({ kind: 'inline', from: start + (raw.startsWith('<') ? 1 : 0), to: start + raw.length - (raw.endsWith('>') ? 1 : 0), src, alt: match[1], altFrom: match.index + 2, altTo: match.index + 2 + match[1].length })
  }
  for (const match of masked.matchAll(/^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*(<[^>\n]+>|\S+)/gm)) {
    const raw = match[2]
    const start = match.index + match[0].length - raw.length
    refs.push({ kind: 'definition', from: start + (raw.startsWith('<') ? 1 : 0), to: start + raw.length - (raw.endsWith('>') ? 1 : 0), src: raw.replace(/^<|>$/g, ''), id: match[1] })
  }
  return refs.sort((a, b) => a.from - b.from)
}

/** Replaces image sources: fn(ref, path) returns the new src (or null to keep it). */
export function rewriteImageSources(markdown, docName, fn) {
  let out = String(markdown ?? '')
  for (const ref of imageReferences(out).reverse()) {
    const next = fn(ref, resolveImagePath(ref.src, docName))
    if (next != null && next !== ref.src) out = out.slice(0, ref.from) + next + out.slice(ref.to)
  }
  return out
}

/** Attachment paths a document uses. */
export function attachmentsUsed(markdown, docName) {
  return [...new Set(imageReferences(markdown).map(ref => resolveImagePath(ref.src, docName)).filter(isAttachmentPath))]
}

/** Points every reference to attachment `from` at `to` (rename / move). */
export const renameAttachmentRefs = (markdown, docName, from, to) => rewriteImageSources(markdown, docName, (_ref, path) => (path === from ? attachmentSrc(to) : null))

/** Sets the alt text of every inline reference to `path`. */
export function setAltText(markdown, docName, path, alt) {
  let out = String(markdown ?? '')
  const clean = String(alt).replace(/[[\]\n]/g, ' ').trim()
  for (const ref of imageReferences(out).reverse()) {
    if (ref.kind === 'inline' && resolveImagePath(ref.src, docName) === path) out = out.slice(0, ref.altFrom) + clean + out.slice(ref.altTo)
  }
  return out
}

/** Embedded images (data URIs) in a document: [{ from, to, src, type }]. */
export const embeddedImages = markdown => imageReferences(markdown).filter(ref => DATA_URL_RE.test(ref.src)).map(ref => ({ ...ref, type: DATA_URL_RE.exec(ref.src)[1].toLowerCase() }))

export function dataUrlToBlob(dataUrl) {
  const [head, data] = String(dataUrl).split(',')
  const type = DATA_URL_RE.exec(`${head},`)?.[1] ?? 'application/octet-stream'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}
export const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
