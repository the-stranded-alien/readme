// On-device AI via Chrome's built-in APIs (Summarizer, Translator,
// LanguageDetector, Proofreader). Nothing is sent to a server: the browser
// downloads a model once and runs it locally. Everything is feature-detected.

const scope = typeof self !== 'undefined' ? self : globalThis

export function aiSupport() {
  return {
    summarizer: 'Summarizer' in scope,
    translator: 'Translator' in scope,
    detector: 'LanguageDetector' in scope,
    proofreader: 'Proofreader' in scope,
  }
}
export const hasAnyAi = () => Object.values(aiSupport()).some(Boolean)

/** Resolves with the promise, or rejects with AbortError when the signal fires (so "Stop" always works). */
function abortable(promise, signal) {
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Stopped', 'AbortError'))
    if (signal.aborted) { onAbort(); return }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/**
 * Creates a model session. `onStatus('preparing')` fires when the model isn't
 * ready yet (first use downloads it); `onProgress(0–1)` reports the download.
 */
async function createSession(Api, options, { onProgress, onStatus, signal } = {}) {
  // availability() can take a while (or never answer) while Chrome sets the model up.
  const availability = await abortable(Promise.race([
    Api.availability ? Api.availability(options) : Promise.resolve('available'),
    new Promise(resolve => setTimeout(() => resolve('slow'), 4000)),
  ]), signal)
  if (availability === 'unavailable') throw new Error('This feature is not available on this device or for these languages.')
  if (availability !== 'available') onStatus?.('preparing')
  return abortable(Api.create({
    ...options,
    signal,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', event => onProgress?.(event.loaded ?? 0))
    },
  }), signal)
}

// Output languages the Summarizer currently supports.
const SUMMARY_LANGUAGES = ['en', 'es', 'ja']

/** Removes things that only add noise for a language model (code, embedded images, link targets). */
export function proseForModel(markdown) {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function summarize(markdown, { type = 'key-points', length = 'medium', language = 'en', onProgress, onStatus, onChunk, signal } = {}) {
  const outputLanguage = SUMMARY_LANGUAGES.includes(language) ? language : 'en'
  const summarizer = await createSession(scope.Summarizer, {
    type, length, format: 'markdown', sharedContext: 'A Markdown document written by the user.',
    expectedInputLanguages: [language], outputLanguage,
  }, { onProgress, onStatus, signal })
  try {
    let text = proseForModel(markdown)
    // Stay within the model's input limit when it tells us what that is.
    if (summarizer.inputQuota && summarizer.measureInputUsage) {
      while (text.length > 500 && await summarizer.measureInputUsage(text) > summarizer.inputQuota) text = text.slice(0, Math.floor(text.length * 0.8))
    }
    if (onChunk && summarizer.summarizeStreaming) {
      let result = ''
      for await (const chunk of summarizer.summarizeStreaming(text, { signal })) {
        // Older builds stream the whole text so far, newer ones stream deltas.
        result = chunk.startsWith(result) ? chunk : result + chunk
        onChunk(result)
      }
      return result
    }
    return await summarizer.summarize(text, { signal })
  } finally {
    summarizer.destroy?.()
  }
}

/** Best-effort language detection; gives up after `timeout` ms (the model may still be downloading). */
export async function detectLanguage(text, { timeout = 1500 } = {}) {
  if (!('LanguageDetector' in scope) || typeof scope.LanguageDetector?.create !== 'function') return null
  const attempt = (async () => {
    const detector = await scope.LanguageDetector.create()
    try {
      const [best] = await detector.detect(proseForModel(text).slice(0, 4000))
      return best && best.confidence > 0.4 ? best.detectedLanguage : null
    } finally {
      detector.destroy?.()
    }
  })()
  attempt.catch(() => {})
  return Promise.race([attempt, new Promise(resolve => setTimeout(() => resolve(null), timeout))])
}

/** Number of lines taken by leading YAML frontmatter (0 when there is none). */
function frontmatterLineCount(lines) {
  if (lines[0]?.trim() !== '---') return 0
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  return end === -1 ? 0 : end + 1
}

// ── Markdown-aware translation ────────────────────────────────
const LINE_PREFIX = /^(\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)*)(.*)$/
const SKIP_LINE = /^\s*(?:\[[^\]]+\]:\s|<!--|[-*_]{3,}\s*$|\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$)/

/** Splits a document into translatable segments, keeping Markdown structure and code intact. */
export function translationSegments(markdown) {
  const lines = markdown.split('\n')
  const segments = []
  let fence = null
  let paragraph = []
  const frontmatter = frontmatterLineCount(lines)
  const flush = () => {
    if (!paragraph.length) return
    segments.push({ kind: 'text', prefix: '', text: paragraph.join('\n') })
    paragraph = []
  }
  for (const [index, line] of lines.entries()) {
    if (index < frontmatter) { segments.push({ kind: 'keep', text: line }); continue }
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence || fenceMatch) {
      flush()
      segments.push({ kind: 'keep', text: line })
      if (fence && fenceMatch && fenceMatch[1][0] === fence[0]) fence = null
      else if (!fence && fenceMatch) fence = fenceMatch[1]
      continue
    }
    if (!line.trim() || SKIP_LINE.test(line)) { flush(); segments.push({ kind: 'keep', text: line }); continue }
    if (/^\s*\|/.test(line)) {
      flush()
      const cells = line.split('|')
      segments.push({ kind: 'row', cells })
      continue
    }
    const [, prefix, rest] = LINE_PREFIX.exec(line)
    if (prefix) { flush(); segments.push({ kind: 'text', prefix, text: rest }); continue }
    paragraph.push(line)
  }
  flush()
  return segments
}

export async function translateMarkdown(markdown, { sourceLanguage, targetLanguage, onProgress, onStatus, onStep, signal }) {
  const translator = await createSession(scope.Translator, { sourceLanguage, targetLanguage }, { onProgress, onStatus, signal })
  const cache = new Map()
  const translate = async text => {
    const trimmed = text.trim()
    if (!trimmed || !/\p{L}/u.test(trimmed)) return text
    if (!cache.has(trimmed)) cache.set(trimmed, await translator.translate(trimmed, { signal }))
    const lead = text.match(/^\s*/)[0]
    const trail = text.match(/\s*$/)[0]
    return lead + cache.get(trimmed) + trail
  }
  try {
    const segments = translationSegments(markdown)
    const work = segments.filter(segment => segment.kind !== 'keep').length
    let done = 0
    const out = []
    for (const segment of segments) {
      signal?.throwIfAborted?.()
      if (segment.kind === 'keep') { out.push(segment.text); continue }
      if (segment.kind === 'row') out.push((await Promise.all(segment.cells.map(cell => translate(cell)))).join('|'))
      else out.push(segment.prefix + await translate(segment.text))
      done += 1
      onStep?.(done, work)
    }
    return out.join('\n')
  } finally {
    translator.destroy?.()
  }
}

// ── Proofreading ──────────────────────────────────────────────
/** Prose paragraphs with their offsets in the document (code and tables are skipped). */
export function proseBlocks(markdown) {
  const blocks = []
  let fence = false
  let offset = 0
  let skipLines = frontmatterLineCount(markdown.split('\n'))
  for (const part of markdown.split(/(\n)/)) {
    if (part === '\n') { offset += 1; continue }
    if (skipLines > 0) { skipLines -= 1; offset += part.length; continue }
    if (/^\s{0,3}(```|~~~)/.test(part)) fence = !fence
    else if (!fence && part.trim() && !/^\s*(\||\[[^\]]+\]:|<!--)/.test(part)) {
      const [, prefix, rest] = LINE_PREFIX.exec(part)
      if (rest.trim()) blocks.push({ from: offset + prefix.length, text: rest })
    }
    offset += part.length
  }
  return blocks
}

export async function proofread(markdown, { onProgress, onStatus, onStep, signal } = {}) {
  const proofreader = await createSession(scope.Proofreader, { expectedInputLanguages: ['en'] }, { onProgress, onStatus, signal })
  try {
    const corrections = []
    const blocks = proseBlocks(markdown)
    for (let i = 0; i < blocks.length; i += 1) {
      signal?.throwIfAborted?.()
      const block = blocks[i]
      const result = await proofreader.proofread(block.text, { signal })
      for (const item of result.corrections || []) {
        const from = block.from + item.startIndex
        const to = block.from + item.endIndex
        const original = markdown.slice(from, to)
        if (original !== item.correction) corrections.push({ id: `${from}-${to}`, from, to, original, correction: item.correction, type: item.type || item.types?.[0] || '' })
      }
      onStep?.(i + 1, blocks.length)
    }
    return corrections
  } finally {
    proofreader.destroy?.()
  }
}

/** Applies corrections (from the end backwards so offsets stay valid). */
export function applyCorrections(markdown, corrections) {
  return [...corrections].sort((a, b) => b.from - a.from).reduce((text, item) => (
    text.slice(item.from, item.to) === item.original ? text.slice(0, item.from) + item.correction + text.slice(item.to) : text
  ), markdown)
}

export const TRANSLATION_LANGUAGES = [
  ['ar', 'Arabic'], ['bn', 'Bengali'], ['de', 'German'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['hi', 'Hindi'],
  ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['nl', 'Dutch'], ['pl', 'Polish'], ['pt', 'Portuguese'],
  ['ru', 'Russian'], ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'], ['zh', 'Chinese (Simplified)'],
]
