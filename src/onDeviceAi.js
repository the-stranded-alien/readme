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

// ── README writer ─────────────────────────────────────────────
export const canWriteWithAi = () => 'Writer' in scope || 'LanguageModel' in scope

const README_GUIDE = 'You write clear, friendly README.md files in GitHub-flavoured Markdown. '
  + 'Use: a "# Title" line, a one-sentence description, then "## Features" (bullets), "## Installation", '
  + '"## Usage" (with a fenced code example), "## Contributing" and "## License". Keep it concise. '
  + 'Output only the Markdown, without surrounding code fences or commentary.'

/** Streams a README for `prompt` from the on-device Writer / Prompt API. */
export async function writeReadmeWithAi(prompt, { onChunk, onStatus, onProgress, signal } = {}) {
  const request = `Write a README.md for this project: ${prompt.trim()}`
  const collect = async stream => {
    let text = ''
    for await (const chunk of stream) {
      text = chunk.startsWith(text) ? chunk : text + chunk
      onChunk?.(stripOuterFence(text))
    }
    return stripOuterFence(text)
  }
  if ('Writer' in scope) {
    const writer = await createSession(scope.Writer, {
      tone: 'neutral', format: 'markdown', length: 'long', sharedContext: README_GUIDE,
      expectedInputLanguages: ['en'], outputLanguage: 'en',
    }, { onProgress, onStatus, signal })
    try {
      return writer.writeStreaming ? await collect(writer.writeStreaming(request, { signal })) : stripOuterFence(await writer.write(request, { signal }))
    } finally {
      writer.destroy?.()
    }
  }
  const session = await createSession(scope.LanguageModel, {
    initialPrompts: [{ role: 'system', content: README_GUIDE }],
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  }, { onProgress, onStatus, signal })
  try {
    return session.promptStreaming ? await collect(session.promptStreaming(request, { signal })) : stripOuterFence(await session.prompt(request, { signal }))
  } finally {
    session.destroy?.()
  }
}

/** Models sometimes wrap the whole answer in ```markdown fences; unwrap that. */
function stripOuterFence(text) {
  const match = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)(?:\n```\s*)?$/.exec(text)
  return match ? match[1] : text
}

// ── README from a description, without AI ─────────────────────
const TECH = [
  { test: /\b(react|vue|svelte|next\.?js|vite|node|npm|javascript|typescript|js|ts|express|angular)\b/i, install: 'npm install', run: 'npm run dev', lang: 'bash', stack: 'JavaScript / Node.js' },
  { test: /\b(python|django|flask|fastapi|pip|pandas|pytorch|tensorflow)\b/i, install: 'pip install -r requirements.txt', run: 'python main.py', lang: 'bash', stack: 'Python' },
  { test: /\b(rust|cargo)\b/i, install: 'cargo build --release', run: 'cargo run', lang: 'bash', stack: 'Rust' },
  { test: /\b(go|golang)\b/i, install: 'go mod download', run: 'go run .', lang: 'bash', stack: 'Go' },
  { test: /\b(java|spring|maven|gradle|kotlin)\b/i, install: './gradlew build', run: './gradlew run', lang: 'bash', stack: 'Java / Kotlin' },
  { test: /\b(swift|ios|xcode)\b/i, install: 'open the project in Xcode', run: 'press ⌘R in Xcode', lang: 'text', stack: 'Swift' },
]

const titleCase = text => text.replace(/\b([a-z])/g, char => char.toUpperCase())

export function readmeFromPrompt(prompt) {
  const text = prompt.trim().replace(/\s+/g, ' ')
  // Name: quoted text, "called X" / "named X", or the first few words.
  const quoted = /["“'`]([^"”'`]{2,40})["”'`]/.exec(text)?.[1]
  const called = /\b(?:called|named)\s+([A-Z0-9][\w.-]*(?:\s+[A-Z0-9][\w.-]*){0,2})/.exec(text)?.[1]
  const fallback = text.replace(/^(?:an?|the|build|create|make|write)\s+/i, '').split(/[,.:;]|\s+(?:that|which|for|to|with)\s+/i)[0].split(' ').slice(0, 4).join(' ')
  const name = (quoted || called || titleCase(fallback) || 'My Project').trim()
  let sentence = text.endsWith('.') ? text : `${text}.`
  // "A React app called TaskFlow that …" → "TaskFlow is a React app that …"
  if (called) {
    const without = sentence.replace(new RegExp(`\\s+(?:called|named)\\s+${called.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '')
    sentence = `${called} is ${without.charAt(0).toLowerCase()}${without.slice(1)}`
  }
  const description = sentence.charAt(0).toUpperCase() + sentence.slice(1)

  // Features: clauses after "that / which / with / to", split on commas and "and".
  const featureSource = (/\b(?:that|which|with|to|so|for)\b\s+(.+)/i.exec(text)?.[1] || text).replace(/\.$/, '')
  const features = featureSource.split(/,|;|\band\b|\bplus\b/i)
    .map(part => part.trim().replace(/^(?:it\s+|can\s+|also\s+|lets?\s+(?:you|users)\s+)/i, ''))
    .filter(part => part.length > 3)
    .slice(0, 6)
    .map(part => `- ${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  const tech = TECH.find(item => item.test.test(text))
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-project'

  return [
    `# ${name}`,
    '',
    `> ${description}`,
    '',
    '## Features',
    '',
    ...(features.length ? features : ['- Describe the main features here']),
    '',
    ...(tech ? ['## Tech stack', '', `- ${tech.stack}`, ''] : []),
    '## Installation',
    '',
    `\`\`\`${tech?.lang || 'bash'}`,
    `git clone https://github.com/your-username/${slug}.git`,
    `cd ${slug}`,
    tech ? tech.install : '# install dependencies',
    '```',
    '',
    '## Usage',
    '',
    `\`\`\`${tech?.lang || 'bash'}`,
    tech ? tech.run : '# run the project',
    '```',
    '',
    '## Contributing',
    '',
    'Contributions are welcome! Open an issue to discuss what you would like to change, then submit a pull request.',
    '',
    '## License',
    '',
    'MIT',
    '',
  ].join('\n')
}

// ── Summaries sized to the document ───────────────────────────
export const countWords = text => (proseForModel(text).match(/\S+/g) || []).length
/** Summary length for a text of `words` words: longer texts get longer summaries. */
export const summaryLengthFor = words => (words < 250 ? 'short' : words < 900 ? 'medium' : 'long')

/** Split Markdown into parts of roughly `target` words at heading boundaries. */
export function splitForSummary(markdown, target = 1200) {
  const blocks = markdown.split(/\n(?=#{1,3}\s)/)
  const parts = []
  let current = { title: '', text: '', words: 0 }
  for (const block of blocks) {
    const words = countWords(block)
    if (current.words && current.words + words > target) {
      parts.push(current)
      current = { title: '', text: '', words: 0 }
    }
    if (!current.title) current.title = /^#{1,3}\s+(.+)$/m.exec(block)?.[1]?.trim() ?? ''
    current.text += `${current.text ? '\n' : ''}${block}`
    current.words += words
  }
  if (current.words) parts.push(current)
  return parts
}

/**
 * Summarize a whole document (or one section). Short texts get one summary
 * whose length follows the text; long documents are summarized part by part
 * so the summary grows with the document.
 */
export async function summarizeDocument(markdown, { language = 'en', onProgress, onStatus, onChunk, signal } = {}) {
  const words = countWords(markdown)
  if (words <= 1800) return summarize(markdown, { type: 'key-points', length: summaryLengthFor(words), language, onProgress, onStatus, onChunk, signal })
  const parts = splitForSummary(markdown)
  const outputLanguage = SUMMARY_LANGUAGES.includes(language) ? language : 'en'
  const summarizer = await createSession(scope.Summarizer, {
    type: 'key-points', length: 'medium', format: 'markdown', sharedContext: 'One part of a longer Markdown document written by the user.',
    expectedInputLanguages: [language], outputLanguage,
  }, { onProgress, onStatus, signal })
  try {
    const done = []
    for (const [index, part] of parts.entries()) {
      const heading = `**${part.title || `Part ${index + 1}`}**`
      let text = proseForModel(part.text)
      if (summarizer.inputQuota && summarizer.measureInputUsage) {
        while (text.length > 500 && await summarizer.measureInputUsage(text) > summarizer.inputQuota) text = text.slice(0, Math.floor(text.length * 0.8))
      }
      let result = ''
      if (onChunk && summarizer.summarizeStreaming) {
        for await (const chunk of summarizer.summarizeStreaming(text, { signal })) {
          result = chunk.startsWith(result) ? chunk : result + chunk
          onChunk([...done, `${heading}\n\n${result}`].join('\n\n'))
        }
      } else {
        result = await summarizer.summarize(text, { signal })
      }
      done.push(`${heading}\n\n${result.trim()}`)
      onChunk?.(done.join('\n\n'))
    }
    return done.join('\n\n')
  } finally {
    summarizer.destroy?.()
  }
}
