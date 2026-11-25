import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import App from '../App.jsx'
import { analyzeDocument, applyQualityFix, checkMarkdownQuality } from '../documentAnalysis.js'
import { diffLines } from '../documentDiff.js'
import { fuzzyScore, isModifiedFromDisk, makeDuplicateFileName } from '../fileUtils.js'
import { autoPair, continueMarkup, deletePair, formatMarkdownTables, imageReferenceMarkdown } from '../editorAssist.js'
import { addSnapshot, readHistory, readWorkspace, writeWorkspace } from '../workspaceDb.js'

function installApp(root = document.body) {
  return render(<App />, { container: root === document.body ? undefined : root })
}

function makeFileHandle(name, text) {
  const file = new File([text], name, { type: 'text/markdown' })
  const write = vi.fn(async () => {})
  const close = vi.fn(async () => {})
  const handle = {
    kind: 'file',
    name,
    getFile: vi.fn(async () => file),
    queryPermission: vi.fn(async () => 'granted'),
    createWritable: vi.fn(async () => ({ write, close })),
  }
  return { handle, write, close }
}

describe('advanced browser features', () => {
  afterEach(() => {
    window.speechSynthesis = undefined
    window.showOpenFilePicker = undefined
    window.showSaveFilePicker = undefined
  })

  it('persists large workspace records through IndexedDB', async () => {
    const value = { activeId: 'doc-1', files: [{ id: 'doc-1', name: 'Large.md', content: 'x'.repeat(500_000) }] }
    await writeWorkspace(value)
    await expect(readWorkspace()).resolves.toEqual(value)
  })

  it('opens and saves a file through the File System Access API', async () => {
    const { handle, write, close } = makeFileHandle('guide.md', '# Disk document')
    window.showOpenFilePicker = vi.fn(async () => [handle])
    installApp()

    fireEvent.click(screen.getByRole('button', { name: 'Open Markdown files or folders' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('# Disk document'))
    fireEvent.click(screen.getByRole('button', { name: 'Save file in place' }))
    await waitFor(() => expect(write).toHaveBeenCalledWith('# Disk document'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('reloads untouched disk files and flags conflicting outside changes', async () => {
    let diskText = '# Version 1'
    let modified = 1
    const handle = {
      kind: 'file', name: 'live.md',
      queryPermission: vi.fn(async () => 'granted'),
      createWritable: vi.fn(async () => ({ write: vi.fn(), close: vi.fn() })),
    }
    // File.lastModified is read-only in jsdom: expose it through a getter.
    handle.getFile = vi.fn(async () => {
      const file = new File([diskText], 'live.md')
      Object.defineProperty(file, 'lastModified', { value: modified })
      return file
    })
    window.showOpenFilePicker = vi.fn(async () => [handle])
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Open Markdown files or folders' }))
    const editor = await screen.findByDisplayValue('# Version 1')

    // Untouched locally → reloads silently.
    diskText = '# Version 2'; modified = 2
    fireEvent.focus(window)
    await waitFor(() => expect(editor).toHaveValue('# Version 2'))

    // Edited locally → conflict banner instead of overwriting.
    fireEvent.change(editor, { target: { value: '# Version 2\n\nMy edit' } })
    diskText = '# Version 3'; modified = 3
    fireEvent.focus(window)
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('was changed outside ReadMe')
    expect(editor).toHaveValue('# Version 2\n\nMy edit')
    fireEvent.click(within(banner).getByRole('button', { name: 'Reload from disk' }))
    await waitFor(() => expect(editor).toHaveValue('# Version 3'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('duplicates an open file into a new independent tab', async () => {
    installApp()
    fireEvent.click(screen.getByTitle('Duplicate Welcome.md'))
    await waitFor(() => expect(screen.getAllByText('Welcome copy.md').length).toBeGreaterThan(0))
    const editor = screen.getByRole('textbox')
    const sourceText = editor.value
    expect(sourceText).toMatch(/^# Welcome to ReadMe/)
    fireEvent.change(editor, { target: { value: `${sourceText}\nIndependent edit` } })
    const sourceTab = screen.getAllByRole('tab').find(tab => tab.textContent.includes('Welcome.md') && !tab.textContent.includes('copy'))
    fireEvent.click(sourceTab)
    await waitFor(() => expect(editor).toHaveValue(sourceText))
  })

  it('opens the quality review and reports when the document is clean', async () => {
    installApp()
    fireEvent.click(screen.getByRole('button', { name: /Document quality checks/ }))
    expect(await screen.findByText('All clear')).toBeInTheDocument()
  })

  it('opens a synchronized side-by-side comparison of two files', async () => {
    installApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'New file' })[0])
    const editor = document.querySelector('textarea.editor-textarea')
    fireEvent.change(editor, { target: { value: '# Revised\nnew line' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    const paletteSearch = screen.getByPlaceholderText('Jump to file, heading, template, or command…')
    fireEvent.change(paletteSearch, { target: { value: 'Compare open files' } })
    fireEvent.click(await screen.findByText('Compare open files'))
    const diffDialog = await screen.findByRole('dialog', { name: 'Compare open files' })
    await waitFor(() => expect(within(diffDialog).getByText('new line')).toBeInTheDocument())
    expect(within(diffDialog).getByRole('button', { name: /^Original file:/ })).toBeInTheDocument()
    expect(within(diffDialog).getByRole('button', { name: /^Changed file:/ })).toBeInTheDocument()
  })

  it('customizes, confines, and disables the reading companion', async () => {
    localStorage.setItem('readme-reading-pet', JSON.stringify({ skin: 'classic' }))
    installApp()
    expect(screen.getByRole('button', { name: /Color mode/ }).getAttribute('data-tooltip')).not.toMatch(/click to change/i)
    const petFooter = document.querySelector('.reading-pet-footer')
    expect(petFooter).toBeInTheDocument()
    expect(petFooter.querySelector('button')).toBeNull()
    const petSettingsButton = screen.getByRole('button', { name: 'Reading pet settings' })
    expect(petSettingsButton.closest('.surface-header')).toBeInTheDocument()
    fireEvent.click(petSettingsButton)
    expect(screen.getByRole('button', { name: 'Cat coat' })).toHaveTextContent('Lavender')
    await waitFor(() => expect(JSON.parse(localStorage.getItem('readme-reading-pet')).version).toBe(4))
    fireEvent.click(screen.getByRole('button', { name: 'Cat coat' }))
    fireEvent.click(screen.getByRole('option', { name: 'Calico' }))
    expect(screen.getByRole('button', { name: 'Cat coat' })).toHaveTextContent('Calico')
    expect(screen.getByLabelText('Cat count')).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: 'Add a cat' }))
    expect(screen.getByLabelText('Cat count')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: 'Remove a cat' }))
    expect(screen.getByLabelText('Cat count')).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: 'Roam screen' }))
    expect(screen.getByRole('button', { name: 'Footer only' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Footer only' }))
    expect(screen.getByRole('button', { name: 'Roam screen' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
    for (let count = 1; count < 10; count += 1) fireEvent.click(screen.getByRole('button', { name: 'Add a cat' }))
    expect(screen.getByLabelText('Cat count')).toHaveTextContent('10')
    expect(screen.getByRole('button', { name: 'Add a cat' })).toBeDisabled()
    await waitFor(() => expect(JSON.parse(localStorage.getItem('readme-reading-pet'))).toMatchObject({ enabled: false, catCount: 10 }))
  })

  it('exposes and persists the companion appearance, behavior, play, and roaming controls', async () => {
    localStorage.removeItem('readme-reading-pet')
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Reading pet settings' }))
    expect(screen.getByRole('button', { name: 'Cat coat' })).toHaveTextContent('Lavender')
    expect(screen.queryByRole('switch', { name: 'Customize each cat' })).not.toBeInTheDocument()
    const advanced = screen.getByText('Advanced').closest('details')
    expect(advanced).not.toHaveAttribute('open')
    expect(screen.queryByRole('button', { name: /custom artwork/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cat coat' }))
    expect(screen.getAllByRole('option')).toHaveLength(24)
    fireEvent.click(screen.getByRole('button', { name: 'Roam screen' }))
    fireEvent.click(screen.getByText('Advanced'))

    for (const name of ['Sleep when idle', 'Zoomies while roaming', 'Nap while I type', 'Follow keyboard focus', 'Perch on hovered controls', 'Allow keyboard petting', 'Drag and toss', 'Drop fish treats on double-click', 'Thought bubbles', 'Meow sounds', 'Cats follow one another', 'Remember roaming positions', 'Avoid app toolbars', 'Visit document headings']) {
      expect(screen.getByRole('switch', { name })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('switch', { name: 'Follow keyboard focus' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Thought bubbles' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Pet thought bubbles' }), { target: { value: 'Reading\nTaking a break' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Meow sounds' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Pet sound volume' }), { target: { value: '0.7' } })

    await waitFor(() => expect(JSON.parse(localStorage.getItem('readme-reading-pet'))).toMatchObject({
      roaming: true,
      followFocus: true,
      bubbleEnabled: true,
      bubbleText: 'Reading\nTaking a break',
      meow: true,
      volume: 0.7,
    }))
  })

  it('switches interface density and keeps the choice in the workspace UI', async () => {
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Reader comfort settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'compact' }))
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-density', 'compact')
    await waitFor(() => expect(localStorage.getItem('readme-ui-density')).toBe('compact'))
  })

  it('analyzes headings, counts, quality issues, and normalized search text for the worker', () => {
    const analysis = analyzeDocument('# **Setup**\n\nRead [the guide](https://example.test) &amp; `code`.')
    expect(analysis.headings).toEqual([{ level: 1, text: 'Setup', id: 'setup' }])
    expect(analysis.wordCount).toBe(7)
    expect(analysis.lineCount).toBe(3)
    expect(analysis.searchIndex).toContain('the guide')
    expect(analysis.searchIndex).toContain('&')
  })

  it('finds common documentation quality issues with line numbers and fixes', () => {
    const issues = checkMarkdownQuality('# Start\n### Skipped\n![ ](cover.png)\n[broken](#missing)\n[empty]()')
    expect(issues.map(issue => issue.type)).toEqual(['heading-level-skip', 'missing-image-alt', 'broken-anchor', 'empty-link'])
    expect(issues.map(issue => issue.line)).toEqual([2, 3, 4, 5])
    expect(issues[1].suggestion).toMatch(/description/i)
    expect(checkMarkdownQuality('```md\n### code sample\n![ ](not-real.png)\n```')).toEqual([])
    expect(checkMarkdownQuality('Text [#ghost](#ghost)\n```md\n# ghost\n```')).toHaveLength(1)
    const fileLinks = checkMarkdownQuality('[ok](./guide.md)\n[missing](missing.md)', {
      fileName: 'docs/readme.md',
      knownFiles: ['docs/guide.md'],
    })
    expect(fileLinks).toHaveLength(1)
    expect(fileLinks[0].type).toBe('broken-file-link')
  })

  it('aligns modified lines and preserves matching lines in file diffs', () => {
    expect(diffLines('before\nold\nafter', 'before\nnew\nafter')).toEqual([
      { kind: 'equal', left: 'before', right: 'before', leftLine: 1, rightLine: 1 },
      { kind: 'change', left: 'old', right: 'new', leftLine: 2, rightLine: 2 },
      { kind: 'equal', left: 'after', right: 'after', leftLine: 3, rightLine: 3 },
    ])
    const manyLines = Array.from({ length: 5000 }, (_, index) => `line ${index}`).join('\n')
    expect(diffLines(manyLines, `${manyLines}\nnew`).length).toBeLessThan(100)
  })

  it('creates unique duplicate names without changing the source extension', () => {
    expect(makeDuplicateFileName('guide.md', ['guide.md'])).toBe('guide copy.md')
    expect(makeDuplicateFileName('guide.md', ['guide.md', 'guide copy.md'])).toBe('guide copy 2.md')
  })

  it('returns analysis messages from the document worker', async () => {
    const testDir = dirname(fileURLToPath(import.meta.url))
    const workerSource = await readFile(resolve(testDir, '../workers/documentWorker.js'), 'utf8')
    const executableSource = workerSource.replace(/^import .*\n/gm, '')
    const workerScope = { postMessage: vi.fn() }
    runInNewContext(executableSource, { self: workerScope, analyzeDocument, diffLines })
    workerScope.onmessage({ data: { id: 42, markdown: '# Worker title\nbody' } })
    expect(workerScope.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 42,
      headings: [{ level: 1, text: 'Worker title', id: 'worker-title' }],
      lineCount: 2,
    }))
    workerScope.onmessage({ data: { id: 43, operation: 'diff', leftText: 'old', rightText: 'new' } })
    expect(workerScope.postMessage).toHaveBeenLastCalledWith({ id: 43, rows: [{ kind: 'change', left: 'old', right: 'new', leftLine: 1, rightLine: 1 }] })
  })

  it('caches the app shell and serves the cached page during offline navigation', async () => {
    const testDir = dirname(fileURLToPath(import.meta.url))
    const swPath = resolve(testDir, '../../public/sw.js')
    const manifestPath = resolve(testDir, '../../public/manifest.webmanifest')
    const source = await readFile(swPath, 'utf8')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.icons.some(icon => icon.src === '/favicon.svg')).toBe(true)

    const listeners = {}
    const cachedPage = { body: 'cached app shell' }
    const cache = { addAll: vi.fn(async () => {}), match: vi.fn(async key => key === '/index.html' ? cachedPage : null), put: vi.fn(async () => {}) }
    const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['readme-shell-old', 'unrelated']), delete: vi.fn(async () => true), match: vi.fn(async key => cache.match(key)) }
    const serviceWorkerGlobal = { location: { origin: 'https://readme.test' }, clients: { claim: vi.fn() }, skipWaiting: vi.fn(), addEventListener: (type, fn) => { listeners[type] = fn } }
    runInNewContext(source, { self: serviceWorkerGlobal, caches, URL, Promise, fetch: async url => {
      if (url === '/precache-manifest.json') return { ok: true, json: async () => ['/assets/app.js', '/assets/app.css'] }
      throw new Error('offline')
    } })

    let installPromise
    listeners.install({ waitUntil: promise => { installPromise = promise } })
    await installPromise
    expect(cache.addAll).toHaveBeenCalledWith(['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/precache-manifest.json'])
    expect(cache.addAll).toHaveBeenCalledWith(['/assets/app.js', '/assets/app.css'])
    let navigationResponse
    listeners.fetch({
      request: { method: 'GET', url: 'https://readme.test/guide', mode: 'navigate' },
      respondWith: promise => { navigationResponse = promise },
    })
    await expect(navigationResponse).resolves.toBe(cachedPage)
  })

  it('offers browser installation from the command palette when supported', async () => {
    const prompt = vi.fn(async () => {})
    const installEvent = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(installEvent, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    installApp()
    window.dispatchEvent(installEvent)
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    const paletteSearch = screen.getByPlaceholderText('Jump to file, heading, template, or command…')
    fireEvent.change(paletteSearch, { target: { value: 'Install ReadMe' } })
    fireEvent.click(await screen.findByText('Install ReadMe app'))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
  })

  it('copies rich HTML and plain Markdown through the Clipboard API', async () => {
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } })
    window.ClipboardItem = class { constructor(items) { this.items = items } }
    installApp()
    fireEvent.click(screen.getByText('Copy MD'))
    await waitFor(() => expect(write).toHaveBeenCalledOnce())
    const [item] = write.mock.calls[0][0]
    expect(Object.keys(item.items)).toEqual(['text/html', 'text/plain'])
  })

  it('synchronizes workspace edits between same-origin tabs', async () => {
    const channels = []
    class TestBroadcastChannel {
      constructor(name) { this.name = name; channels.push(this) }
      postMessage(data) { channels.filter(channel => channel !== this && channel.name === this.name).forEach(channel => channel.onmessage?.({ data })) }
      close() { channels.splice(channels.indexOf(this), 1) }
    }
    window.BroadcastChannel = TestBroadcastChannel
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
    const first = document.createElement('div')
    const second = document.createElement('div')
    document.body.append(first, second)
    installApp(first)
    installApp(second)
    const editors = document.querySelectorAll('textarea.editor-textarea')
    fireEvent.change(editors[0], { target: { value: '# Shared update' } })
    expect(editors[0]).toHaveValue('# Shared update')
    await waitFor(() => expect(editors[1]).toHaveValue('# Shared update'), { timeout: 2500 })
  })

  it('reads a rendered document aloud with SpeechSynthesis', async () => {
    const speak = vi.fn()
    const speech = { speak, cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() }
    window.speechSynthesis = speech
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Read document aloud' }))
    await waitFor(() => expect(speak).toHaveBeenCalledOnce())
    expect(speak.mock.calls[0][0].text).toContain('Welcome to ReadMe')
  })

  it('requests a screen wake lock only after the reader toggles it on', async () => {
    const sentinel = { released: false, release: vi.fn(async () => {}) }
    const request = vi.fn(async () => sentinel)
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Keep screen awake while reading' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
  })

  it('imports Markdown files from a dropped folder handle', async () => {
    const file = makeFileHandle('inside.md', '# Folder import')
    const directory = {
      kind: 'directory', name: 'docs',
      async *values() { yield file.handle },
    }
    const item = { getAsFileSystemHandle: vi.fn(async () => directory) }
    installApp()
    fireEvent.drop(document.querySelector('.app-shell'), { dataTransfer: { items: [item], files: [], types: ['Files'] } })
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('# Folder import'))
  })

  it('saves selected text as a note and restores a native highlight', async () => {
    const highlights = { set: vi.fn(), delete: vi.fn() }
    vi.stubGlobal('CSS', { highlights })
    window.Highlight = class { constructor(...ranges) { this.ranges = ranges } }
    let selectionText = 'Welcome to ReadMe'
    window.getSelection = vi.fn(() => ({ toString: () => selectionText, removeAllRanges: () => { selectionText = '' } }))
    installApp()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Highlights and notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Highlights and notes' }))
    fireEvent.change(await screen.findByPlaceholderText('Add a note (optional)'), { target: { value: 'Review this section' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(highlights.set).toHaveBeenCalledWith('readme-annotations-yellow', expect.any(window.Highlight)))
    fireEvent.click(screen.getByRole('button', { name: 'Highlights and notes' }))
    expect(await screen.findByText('“Welcome to ReadMe”')).toBeInTheDocument()
    expect(screen.getByText('Review this section')).toBeInTheDocument()
  })

  it('imports a public Markdown URL with fetch', async () => {
    window.prompt = vi.fn(() => 'https://example.test/remote.md')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '# Imported URL' })))
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Import Markdown from URL' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('# Imported URL'))
    expect(fetch).toHaveBeenCalledWith('https://example.test/remote.md')
  })

  it('builds a styled pdfmake document from Markdown source', async () => {
    const { buildPdfDefinition } = await import('../pdfExport.js')
    const markdown = [
      '# Title 🚀',
      '',
      'Some **bold** and *italic* text with `code` and a [link](https://example.com).',
      '',
      '- [x] done',
      '- [ ] todo',
      '',
      '> quoted',
      '',
      '```js',
      'const x = 1',
      '```',
      '',
      '| A | B |',
      '|:--|--:|',
      '| 1 | 2 |',
    ].join('\n')
    const definition = await buildPdfDefinition(markdown, { title: 'Title', meta: [{ key: 'author', value: 'Me' }] })
    const serialized = JSON.stringify(definition.content)
    expect(definition.pageSize).toBe('A4')
    expect(serialized).toContain('Title ')
    expect(serialized).not.toContain('🚀')
    expect(serialized).toContain('"bold":true')
    expect(serialized).toContain('"italics":true')
    expect(serialized).toContain('"link":"https://example.com"')
    expect(serialized).toContain('const x = 1')
    expect(serialized).toContain('"font":"Courier"')
    expect(serialized).toContain('[x] ')
    expect(serialized).toContain('author: ')
    expect(definition.content.some(block => block.table?.headerRows === 1)).toBe(true)

    const letter = await buildPdfDefinition('# A\n\n## B\n\ntext', { title: 'T', options: { pageSize: 'LETTER', margins: 'wide', toc: true, paper: 'sepia', diagrams: false } })
    expect(letter.pageSize).toBe('LETTER')
    expect(letter.pageMargins[0]).toBe(72)
    expect(letter.content[0].toc).toBeTruthy()
    expect(typeof letter.background).toBe('function')
  })

  it('downloads a generated PDF instead of opening a print window', async () => {
    const exportMarkdownPdf = vi.fn(async () => {})
    vi.doMock('../pdfExport', () => ({ exportMarkdownPdf }))
    const open = vi.spyOn(window, 'open')
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Download and export options' }))
    fireEvent.click(await screen.findByText('Download PDF…'))
    const dialog = await screen.findByRole('dialog', { name: 'Export PDF' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'US Letter' }))
    fireEvent.submit(dialog.querySelector('form'))
    await waitFor(() => expect(exportMarkdownPdf).toHaveBeenCalledOnce())
    expect(exportMarkdownPdf.mock.calls[0][1].fileName).toMatch(/\.pdf$/)
    expect(exportMarkdownPdf.mock.calls[0][1].options).toMatchObject({ pageSize: 'LETTER', margins: 'normal' })
    expect(open).not.toHaveBeenCalled()
    vi.doUnmock('../pdfExport')
  })

  it('names the installed app ReadMe', async () => {
    const testDir = dirname(fileURLToPath(import.meta.url))
    const manifest = JSON.parse(await readFile(resolve(testDir, '../../public/manifest.webmanifest'), 'utf8'))
    expect(manifest.name).toBe('ReadMe')
    expect(manifest.short_name).toBe('ReadMe')
  })

  it('pins, labels, closes others and reopens tabs from the tab context menu', async () => {
    installApp()
    fireEvent.click(document.querySelector('.file-tab-add'))
    fireEvent.click(document.querySelector('.file-tab-add'))
    const tabs = () => screen.getAllByRole('tab')
    expect(tabs()).toHaveLength(3)

    const lastTab = tabs()[2]
    const lastName = lastTab.getAttribute('aria-label')
    fireEvent.contextMenu(lastTab, { clientX: 40, clientY: 40 })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Pin tab/ }))
    expect(tabs()[0].getAttribute('aria-label')).toBe(`${lastName}, pinned`)

    fireEvent.contextMenu(tabs()[1], { clientX: 40, clientY: 40 })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Green label' }))
    expect(tabs()[1].className).toContain('has-label')

    // Close others keeps pinned tabs.
    fireEvent.contextMenu(tabs()[1], { clientX: 40, clientY: 40 })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Close others/ }))
    expect(tabs()).toHaveLength(2)

    fireEvent.contextMenu(tabs()[1], { clientX: 40, clientY: 40 })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Reopen closed tab/ }))
    expect(tabs()).toHaveLength(3)

    // Alt+Shift+T reopens too (works in a normal browser tab).
    fireEvent.contextMenu(tabs()[2], { clientX: 40, clientY: 40 })
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Close(?! others| to)/ }))
    expect(tabs()).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'T', code: 'KeyT', altKey: true, shiftKey: true })
    await waitFor(() => expect(tabs()).toHaveLength(3))
  })

  it('opens a fuzzy file switcher from the files pill', async () => {
    installApp()
    fireEvent.click(document.querySelector('.file-tab-add'))
    fireEvent.click(screen.getByRole('button', { name: /2 open files/ }))
    const input = await screen.findByRole('combobox', { name: 'Find a file' })
    fireEvent.change(input, { target: { value: 'wlcm' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Welcome.md')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'Welcome.md')
    expect(fuzzyScore('wlcm', 'Welcome.md')).toBeGreaterThan(0)
    expect(fuzzyScore('zzz', 'Welcome.md')).toBe(-1)
    expect(fuzzyScore('unt 5', 'Untitled-5.md')).toBeGreaterThan(0)
  })

  it('reorders tabs with drag and drop', async () => {
    installApp()
    fireEvent.click(document.querySelector('.file-tab-add'))
    const [first, second] = screen.getAllByRole('tab')
    const names = [first.getAttribute('aria-label'), second.getAttribute('aria-label')]
    const data = new Map()
    const dataTransfer = { setData: (k, v) => data.set(k, v), getData: k => data.get(k) || '', get types() { return [...data.keys()] }, effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(second, { dataTransfer })
    fireEvent.dragOver(first, { dataTransfer, clientX: 0 })
    fireEvent.drop(first, { dataTransfer, clientX: 0 })
    expect(screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-label'))).toEqual([names[1], names[0]])
  })

  it('flags disk-backed files with unsaved changes', () => {
    expect(isModifiedFromDisk({ content: 'a', diskSavedContent: 'a' })).toBe(false)
    expect(isModifiedFromDisk({ content: 'ab', diskSavedContent: 'a' })).toBe(true)
    expect(isModifiedFromDisk({ content: 'ab' })).toBe(false)
  })

  it('renders callouts, captioned standalone images and inline images without captions', async () => {
    const doc = ['# Doc', '', '> [!WARNING]', '> Careful here', '', '> [!TIP] Pro tip', '> Use shortcuts', '', '![A cat](https://example.test/cat.png)', '', 'Badge ![build](https://example.test/b.svg) inline'].join('\n')
    await writeWorkspace({ activeId: 'c', files: [{ id: 'c', name: 'Callouts.md', content: doc }] })
    installApp()
    const warning = await screen.findByRole('note', { name: 'Warning' })
    expect(warning).toHaveTextContent('Careful here')
    expect(warning).not.toHaveTextContent('[!WARNING]')
    expect(screen.getByRole('note', { name: 'Pro tip' })).toHaveTextContent('Use shortcuts')
    expect(document.querySelector('.md-figure .md-figcaption')).toHaveTextContent('A cat')
    expect(document.querySelectorAll('.md-figure')).toHaveLength(1)
  })

  it('focuses one section at a time with previous / next navigation', async () => {
    const doc = ['# Book', '', 'Intro', '', '## One', '', 'First body', '', '## Two', '', 'Second body', '', '## Three', '', 'Third body'].join('\n')
    await writeWorkspace({ activeId: 'f', files: [{ id: 'f', name: 'Focus.md', content: doc }] })
    installApp()
    await screen.findByText('Second body')
    fireEvent.click(await screen.findByRole('button', { name: 'Focus on section' }))
    const prose = document.querySelector('.rm-prose')
    await waitFor(() => expect(prose.className).toContain('focus-section-mode'))
    expect(document.querySelector('.focus-target h2')).toHaveTextContent('One')
    expect(screen.getByRole('navigation', { name: 'Section focus' })).toHaveTextContent('1 / 3')
    fireEvent.click(screen.getByRole('button', { name: 'Next section' }))
    expect(document.querySelector('.focus-target h2')).toHaveTextContent('Two')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Section focus' })).getByRole('button', { name: 'Exit section focus' }))
    expect(prose.className).not.toContain('focus-section-mode')
  })

  it('applies line height and paragraph spacing from Reader Comfort', async () => {
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Reader comfort settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Relaxed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Airy' }))
    const prose = document.querySelector('.rm-prose')
    expect(prose.style.getPropertyValue('--rm-line-height')).toBe('2.05')
    expect(prose.style.getPropertyValue('--rm-para-space')).toBe('1.3rem')
  })

  it('continues lists, tasks and quotes on Enter and ends them on an empty item', () => {
    const apply = (value, edit) => value.slice(0, edit.from) + edit.text + value.slice(edit.to)
    let value = '- one'
    expect(apply(value, continueMarkup(value, 5, 5))).toBe('- one\n- ')
    value = '3. three'
    expect(apply(value, continueMarkup(value, 8, 8))).toBe('3. three\n4. ')
    value = '- [x] done'
    expect(apply(value, continueMarkup(value, 10, 10))).toBe('- [x] done\n- [ ] ')
    value = '> quote'
    expect(apply(value, continueMarkup(value, 7, 7))).toBe('> quote\n> ')
    value = '- one\n- '
    expect(apply(value, continueMarkup(value, value.length, value.length))).toBe('- one\n\n')
    value = '- one\n  - '
    expect(apply(value, continueMarkup(value, value.length, value.length))).toBe('- one\n- ')
    value = '```\n- not a list'
    expect(continueMarkup(value, value.length, value.length)).toBeNull()
  })

  it('auto-pairs brackets, wraps selections and steps over closers', () => {
    expect(autoPair('', 0, 0, '(')).toMatchObject({ text: '()', cursor: 1 })
    expect(autoPair('word', 0, 4, '[')).toMatchObject({ text: '[word]', cursor: 1, cursorEnd: 5 })
    expect(autoPair('()', 1, 1, ')')).toMatchObject({ from: 1, to: 2, text: ')', cursor: 2 })
    expect(autoPair('abc', 1, 1, '(')).toBeNull()
    expect(autoPair("it", 2, 2, '`')).toBeNull()
    expect(deletePair('()', 1, 1)).toMatchObject({ from: 0, to: 2, text: '' })
  })

  it('aligns table pipes and keeps column alignment markers', () => {
    const table = ['| Name | Qty |', '|:--|--:|', '| Apple | 3 |', '| Kiwi | 12 |'].join('\n')
    expect(formatMarkdownTables(table)).toBe(['| Name  | Qty |', '| :---- | --: |', '| Apple |   3 |', '| Kiwi  |  12 |'].join('\n'))
    const fenced = ['```', '| a | b |', '|---|---|', '```'].join('\n')
    expect(formatMarkdownTables(fenced)).toBe(fenced)
  })

  it('builds unique reference-style markdown for embedded images', () => {
    const { inline, definitions } = imageReferenceMarkdown([{ name: 'Screen Shot.png', dataUrl: 'data:image/png;base64,AAA' }], '[img-screen-shot]: data:x')
    expect(inline).toBe('![Screen Shot][img-screen-shot-2]')
    expect(definitions).toBe('[img-screen-shot-2]: data:image/png;base64,AAA')
  })

  it('sets a per-file word goal from the editor status bar', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: /words\. Set a writing goal/ }))
    fireEvent.change(screen.getByLabelText('Word goal for this file'), { target: { value: '1000' } })
    fireEvent.submit(screen.getByLabelText('Word goal for this file').closest('form'))
    expect(document.querySelector('.writing-goal-trigger').getAttribute('aria-label')).toMatch(/of 1000 words/)
  })

  it('builds a Word document with headings, lists, tables and footnotes', async () => {
    const { buildDocx } = await import('../docxExport.js')
    const { Packer } = await import('docx')
    const md = ['# Title', '', 'Text with **bold**, a [link](https://example.com) and a note[^1].', '', '1. one', '2. two', '', '- [x] task', '', '| a | b |', '|---|--:|', '| 1 | 2 |', '', '> [!NOTE]', '> Callout', '', '```js', 'const x = 1', '```', '', '[^1]: Footnote text.'].join('\n')
    const document = await buildDocx(md, { title: 'Title', meta: [{ key: 'author', value: 'Me' }] })
    const buffer = await Packer.toBuffer(document)
    expect(buffer.byteLength).toBeGreaterThan(3000)
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml').async('string')
    expect(xml).toContain('Heading1')
    expect(xml).toContain('Callout')
    expect(xml).toContain('const x = 1')
    expect(xml).toContain('w:tbl')
    expect(await zip.file('word/footnotes.xml').async('string')).toContain('Footnote text.')
  })

  it('round-trips share links and opens them read-only with a save option', async () => {
    const { encodeSharePayload, decodeSharePayload } = await import('../shareLink.js')
    const text = '# Shared ✨\n\nHello **world** — ünïcödé'
    expect(await decodeSharePayload(await encodeSharePayload(text))).toBe(text)

    window.location.hash = `#share=${await encodeSharePayload('# From a friend\n\nShared body')}&name=Friend.md`
    installApp()
    const view = await screen.findByRole('dialog', { name: 'Shared document: Friend.md' })
    expect(view).toHaveTextContent('Shared body')
    fireEvent.click(within(view).getByRole('button', { name: /Save a copy/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Shared document/ })).toBeNull())
    expect(screen.getAllByRole('tab').some(tab => tab.getAttribute('aria-label') === 'Friend.md')).toBe(true)
    expect(window.location.hash).toBe('')
  })

  it('offers one-click fixes for broken anchors, missing alt text and empty links', () => {
    const md = ['# Getting Started', '', 'See [setup](#getting-startd).', '', '![](images/team-photo.png)', '', 'An [empty]() link.'].join('\n')
    const issues = checkMarkdownQuality(md)
    const anchor = issues.find(issue => issue.type === 'broken-anchor')
    expect(anchor.fix.label).toBe('Change to #getting-started')
    let fixed = applyQualityFix(md, anchor.fix)
    const alt = issues.find(issue => issue.type === 'missing-image-alt')
    expect(alt.fix.replace).toBe('![team photo](images/team-photo.png)')
    fixed = applyQualityFix(fixed, alt.fix)
    fixed = applyQualityFix(fixed, issues.find(issue => issue.type === 'empty-link').fix)
    expect(fixed).toContain('[setup](#getting-started)')
    expect(fixed).toContain('![team photo](images/team-photo.png)')
    expect(fixed).toContain('An empty link.')
    expect(checkMarkdownQuality(fixed)).toHaveLength(0)
  })

  it('searches all open files and opens a result', async () => {
    await writeWorkspace({ activeId: 'a', files: [
      { id: 'a', name: 'Alpha.md', content: '# Alpha\n\nnothing here' },
      { id: 'b', name: 'Beta.md', content: '# Beta\n\nThe needle is here.\nAnother needle.' },
    ] })
    installApp()
    await screen.findByRole('tab', { name: 'Alpha.md' })
    fireEvent.keyDown(window, { key: 'f', metaKey: true, shiftKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Search in all files' })
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'needle' } })
    await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(2))
    expect(within(dialog).getByText('2 results in 1 file')).toBeInTheDocument()
    fireEvent.keyDown(within(dialog).getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'Beta.md'))
  })

  it('shows the keyboard shortcut sheet with ?', async () => {
    installApp()
    fireEvent.keyDown(document.body, { key: '?' })
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog).toHaveTextContent('Command palette')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull())
  })

  it('backs up and reads back files, settings and history', async () => {
    const { createBackup, readBackup } = await import('../backup.js')
    localStorage.setItem('readme-theme', 'sepia')
    await addSnapshot('w1', { content: 'old text', reason: 'Manual snapshot' })
    const blob = await createBackup({ files: [{ id: 'w1', name: 'notes/Plan.md', content: '# Plan', pinned: true, color: 'green' }], activeId: 'w1' })
    const backup = await readBackup(blob)
    expect(backup.files).toEqual([{ id: 'w1', name: 'notes/Plan.md', content: '# Plan', pinned: true, color: 'green' }])
    expect(backup.settings['readme-theme']).toBe('sepia')
    expect(backup.history.w1[0].content).toBe('old text')
    await expect(readBackup(new Blob(['not a zip']))).rejects.toThrow('not a ZIP')
  })

  it('keeps per-file snapshots, newest first, skipping duplicates', async () => {
    await addSnapshot('h1', { content: 'one', reason: 'Auto-saved' })
    await addSnapshot('h1', { content: 'one', reason: 'Auto-saved' })
    await addSnapshot('h1', { content: 'two', reason: 'Saved to disk' })
    const history = await readHistory('h1')
    expect(history.map(entry => entry.content)).toEqual(['two', 'one'])
    expect(history[0].reason).toBe('Saved to disk')
  })

  it('uses the CodeMirror editor (opt-in) with folds that mirror the preview', async () => {
    localStorage.setItem('readme-editor-prefs', JSON.stringify({ engine: 'code', version: 2 }))
    const doc = ['# Book', '', 'Intro', '', '## One', '', 'First body', '', '## Two', '', 'Second body'].join('\n')
    await writeWorkspace({ activeId: 'cm', files: [{ id: 'cm', name: 'Code.md', content: doc }] })
    installApp()
    await waitFor(() => expect(document.querySelector('.cm-content')?.textContent).toContain('First body'))
    expect(document.querySelector('.cm-content')).toHaveAttribute('aria-label', 'Markdown editor')

    // Collapsing a section in the preview folds it in the editor…
    fireEvent.click(await screen.findByRole('button', { name: 'Collapse section One' }))
    await waitFor(() => expect(document.querySelector('.cm-foldPlaceholder')).toBeTruthy())
    expect(document.querySelector('.cm-content').textContent).not.toContain('First body')
    // …and expanding it unfolds the editor again.
    fireEvent.click(screen.getByRole('button', { name: 'Expand section One' }))
    await waitFor(() => expect(document.querySelector('.cm-foldPlaceholder')).toBeNull())

    // Edits through the editor reach the document (and the preview).
    const { EditorView } = await import('@codemirror/view')
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'))
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n\nAdded from CodeMirror' } })
    await waitFor(() => expect(document.querySelector('.rm-prose')).toHaveTextContent('Added from CodeMirror'))
  })

  it('switches between the code editor, the simple editor and Vim keys', async () => {
    localStorage.setItem('readme-editor-prefs', JSON.stringify({ engine: 'code', version: 2 }))
    installApp()
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Editor options' }))
    const options = await screen.findByRole('dialog', { name: 'Editor options' })
    fireEvent.click(within(options).getByRole('radio', { name: 'Vim' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('readme-editor-prefs')).keymap).toBe('vim'))
    await waitFor(() => expect(document.querySelector('.cm-vimMode, .cm-fat-cursor')).toBeTruthy())
    // Syntax colours can be switched off for the plain text look.
    await waitFor(() => expect(document.querySelector('.cm-line span')).toBeTruthy())
    fireEvent.click(within(options).getByRole('checkbox', { name: /Syntax colours/ }))
    await waitFor(() => expect(document.querySelector('.cm-line span')).toBeNull())
    expect(JSON.parse(localStorage.getItem('readme-editor-prefs')).syntaxColors).toBe(false)
    fireEvent.click(within(options).getByRole('checkbox', { name: /Syntax colours/ }))
    await waitFor(() => expect(document.querySelector('.cm-line span')).toBeTruthy())
    fireEvent.click(within(options).getByRole('radio', { name: 'Simple' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea')).toBeTruthy())
    expect(document.querySelector('.cm-editor')).toBeNull()
    expect(within(options).getByRole('radio', { name: 'Vim' })).toBeDisabled()
  })

  it('creates files from templates via the editor toolbar and the New menu', async () => {
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'New file from a template' }))
    const toolbarMenu = await screen.findByRole('menu', { name: 'Templates' })
    fireEvent.click(within(toolbarMenu).getByRole('menuitem', { name: /Meeting Notes/ }))
    await waitFor(() => expect(screen.getByRole('tab', { selected: true }).getAttribute('aria-label')).toMatch(/meeting/i))

    fireEvent.click(screen.getByRole('button', { name: 'New file options' }))
    const newMenu = await screen.findByRole('menu', { name: 'New file' })
    expect(within(newMenu).getByRole('menuitem', { name: /Blank file/ })).toBeInTheDocument()
    fireEvent.click(within(newMenu).getByRole('menuitem', { name: /Changelog/ }))
    await waitFor(() => expect(screen.getByRole('tab', { selected: true }).getAttribute('aria-label')).toMatch(/changelog/i))
    expect(screen.queryByRole('menu', { name: 'New file' })).toBeNull()
  })

  it('applies the reading font weight from Reader Comfort', async () => {
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Reader comfort settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Medium' }))
    expect(document.querySelector('.rm-prose').style.getPropertyValue('--rm-font-weight')).toBe('500')
  })

  it('opens files launched from the operating system (File Handling API)', async () => {
    let consumer
    window.launchQueue = { setConsumer: fn => { consumer = fn } }
    installApp()
    await waitFor(() => expect(consumer).toBeTypeOf('function'))
    const { handle } = makeFileHandle('Launched.md', '# Opened from Finder')
    await consumer({ files: [handle] })
    await waitFor(() => expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'Launched.md'))
    delete window.launchQueue
  })

  it('turns shared text, links and files into new files (Web Share Target)', async () => {
    const { sharedItemToFiles } = await import('../pwaIntegration.js')
    expect(sharedItemToFiles({ title: 'Article', text: 'Worth reading', url: 'https://example.com/a' })).toEqual([
      { name: 'Article.md', content: '# Article\n\nWorth reading\n\n[https://example.com/a](https://example.com/a)\n' },
    ])
    expect(sharedItemToFiles({ files: [{ name: 'notes.md', content: '# Notes' }] })).toEqual([{ name: 'notes.md', content: '# Notes' }])

    const inbox = [{ title: '', text: 'Hello from my phone', url: '', files: [] }]
    const store = new Map([['/__share-inbox__', new Response(JSON.stringify(inbox))]])
    vi.stubGlobal('caches', {
      keys: async () => ['readme-shell-v4'],
      open: async () => ({ match: async key => store.get(key), delete: async key => store.delete(key) }),
    })
    window.history.replaceState(null, '', '/?shared=1')
    installApp()
    await waitFor(() => expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'Shared note.md'))
    expect(window.location.search).toBe('')
    expect(store.has('/__share-inbox__')).toBe(false)
  })

  it('shows storage usage and asks the browser to keep data', async () => {
    let persisted = false
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {
      estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
      persisted: async () => persisted,
      persist: vi.fn(async () => { persisted = true; return true }),
    } })
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Download and export options' }))
    fireEvent.click(await screen.findByText(/Storage & Data Safety/))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    await within(dialog).findByText('2.0 MB')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep my data' }))
    await within(dialog).findByText('Protected from automatic clean-up')
    expect(navigator.storage.persist).toHaveBeenCalled()
    delete navigator.storage
  })

  it('finds and replaces with case, whole-word and regex options', async () => {
    const { buildSearchRegex, findMatches, replaceAllIn } = await import('../findReplace.js')
    const text = 'Cat cat catalog. Dog: 2024-01-05'
    expect(findMatches(text, buildSearchRegex('cat').regex)).toHaveLength(3)
    expect(findMatches(text, buildSearchRegex('cat', { matchCase: true }).regex)).toHaveLength(2)
    expect(findMatches(text, buildSearchRegex('cat', { wholeWord: true }).regex)).toHaveLength(2)
    const dates = buildSearchRegex('(\\d{4})-(\\d{2})-(\\d{2})', { regex: true }).regex
    expect(replaceAllIn(text, dates, '$3/$2/$1', true).text).toBe('Cat cat catalog. Dog: 05/01/2024')
    expect(replaceAllIn('a.b.c', buildSearchRegex('.').regex, '$1', false).text).toBe('a$1b$1c')
    expect(buildSearchRegex('(', { regex: true }).error).toBeTruthy()
    expect(buildSearchRegex('a*', { regex: true }).error).toMatch(/empty/)
  })

  it('replaces in the editor and across all open files', async () => {
    await writeWorkspace({ activeId: 'r1', files: [
      { id: 'r1', name: 'One.md', content: 'colour colour' },
      { id: 'r2', name: 'Two.md', content: 'A colour here' },
    ] })
    installApp()
    await screen.findByRole('tab', { name: 'One.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Find and replace' }))
    const panel = await screen.findByRole('search', { name: 'Find and replace in the editor' })
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Find' }), { target: { value: 'colour' } })
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Replace with' }), { target: { value: 'color' } })
    expect(within(panel).getByText('2 results')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('checkbox'))
    fireEvent.click(within(panel).getByTitle('Replace in all open files'))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toBe('color color'))
    fireEvent.click(screen.getByRole('tab', { name: 'Two.md' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toBe('A color here'))
    expect((await readHistory('r2'))[0].reason).toBe('Before replace all')
  })

  it('inserts blocks with slash commands', async () => {
    const { detectSlash, expandSnippet, filterSlashCommands } = await import('../slashCommands.js')
    expect(detectSlash('Intro\n/tab', 10)).toEqual({ from: 6, to: 10, query: 'tab' })
    expect(detectSlash('word /tab', 9)).toBeNull()
    expect(detectSlash('```\n/tab', 8)).toBeNull()
    expect(filterSlashCommands('tab')[0].id).toBe('table')
    expect(filterSlashCommands('todo')[0].id).toBe('checklist')
    const table = expandSnippet(filterSlashCommands('table')[0], 6)
    expect(table.text.split('\n')[1]).toBe('| --- | --- | --- |')
    expect([table.cursor, table.cursorEnd]).toEqual([8, 16])

    await writeWorkspace({ activeId: 's', files: [{ id: 's', name: 'Slash.md', content: '' }] })
    installApp()
    await screen.findByRole('tab', { name: 'Slash.md' })
    const editor = document.querySelector('textarea.editor-textarea')
    editor.focus()
    fireEvent.change(editor, { target: { value: '/note' } })
    editor.setSelectionRange(5, 5)
    fireEvent.input(editor)
    const menu = await screen.findByRole('listbox', { name: 'Insert block' })
    expect(within(menu).getAllByRole('option')[0]).toHaveTextContent('Callout: Note')
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(editor.value).toBe('> [!NOTE]\n> '))
    expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull()
  })

  it('manages custom templates and uses them from the New menu', async () => {
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'New file options' }))
    fireEvent.click(within(await screen.findByRole('menu', { name: 'New file' })).getByRole('menuitem', { name: /Manage templates/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Templates' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^New$/ }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Weekly report' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Content/ }), { target: { value: '# Weekly report\n\n## Wins' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Save template/ }))
    expect(JSON.parse(localStorage.getItem('readme-custom-templates'))[0]).toMatchObject({ name: 'Weekly report', fileName: 'Weekly report.md' })
    fireEvent.click(within(dialog).getByRole('button', { name: /New file from template/ }))
    await waitFor(() => expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'Weekly report.md'))
    expect(document.querySelector('textarea.editor-textarea').value).toBe('# Weekly report\n\n## Wins')
    fireEvent.click(screen.getByRole('button', { name: 'New file options' }))
    expect(within(await screen.findByRole('menu', { name: 'New file' })).getByRole('menuitem', { name: /Weekly report/ })).toBeInTheDocument()
  })

  it('presents the document as slides split at headings', async () => {
    const { splitSlides } = await import('../presentation.js')
    expect(splitSlides('# Deck\n\nIntro\n\n## One\n\nA\n\n```\n## not a slide\n```\n\n## Two\n\nB')).toEqual([
      '# Deck\n\nIntro', '## One\n\nA\n\n```\n## not a slide\n```', '## Two\n\nB',
    ])
    await writeWorkspace({ activeId: 'p', files: [{ id: 'p', name: 'Deck.md', content: '# Deck\n\nIntro\n\n## One\n\nFirst\n\n## Two\n\nSecond' }] })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Present document as slides' }))
    const deck = await screen.findByRole('dialog', { name: /Presentation, slide 1 of 3/ })
    fireEvent.keyDown(deck, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /slide 2 of 3/ })).toHaveTextContent('First'))
    fireEvent.keyDown(deck, { key: 'End' })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /slide 3 of 3/ })).toHaveTextContent('Second'))
    fireEvent.keyDown(deck, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Presentation/ })).toBeNull())

    // The header mode switcher opens it too.
    fireEvent.click(screen.getByRole('button', { name: 'Present as slides' }))
    expect(await screen.findByRole('dialog', { name: /Presentation, slide 1 of 3/ })).toBeInTheDocument()
  })

  it('shows folders in a file tree and moves files between them', async () => {
    window.prompt = vi.fn(() => 'archive')
    await writeWorkspace({ activeId: 'a', files: [
      { id: 'a', name: 'notes/plan.md', content: '# Plan' },
      { id: 'b', name: 'notes/ideas.md', content: '# Ideas' },
      { id: 'c', name: 'todo.md', content: '# Todo' },
    ] })
    installApp()
    await screen.findByRole('tab', { name: 'notes/plan.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    const tree = await screen.findByRole('tree', { name: 'Open files' })
    expect(within(tree).getByRole('treeitem', { name: 'Folder notes' })).toHaveTextContent('2')
    const data = new Map()
    const dataTransfer = { setData: (k, v) => data.set(k, v), getData: k => data.get(k) || '', get types() { return [...data.keys()] }, effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(within(tree).getByRole('treeitem', { name: 'todo.md' }).querySelector('button'), { dataTransfer })
    const folderRow = within(tree).getByRole('treeitem', { name: 'Folder notes' }).querySelector('.file-tree-row')
    fireEvent.dragOver(folderRow, { dataTransfer })
    fireEvent.drop(folderRow, { dataTransfer })
    await waitFor(() => expect(screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-label'))).toContain('notes/todo.md'))
    fireEvent.click(within(tree).getByRole('button', { name: 'Rename folder notes' }))
    await waitFor(() => expect(screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['archive/plan.md', 'archive/ideas.md', 'archive/todo.md'])))
  })

  it('summarizes, translates and proofreads with on-device AI when the browser supports it', async () => {
    const created = []
    vi.stubGlobal('Summarizer', { availability: async () => 'available', create: async () => ({ summarize: async text => `- Summary of ${text.split(' ').length} words`, destroy() {} }) })
    vi.stubGlobal('Translator', { availability: async () => 'available', create: async options => { created.push(options); return { translate: async text => `[${options.targetLanguage}] ${text}`, destroy() {} } } })
    vi.stubGlobal('LanguageDetector', { create: async () => ({ detect: async () => [{ detectedLanguage: 'en', confidence: 0.95 }], destroy() {} }) })
    vi.stubGlobal('Proofreader', { availability: async () => 'available', create: async () => ({ proofread: async text => ({ corrections: text.includes('teh') ? [{ startIndex: text.indexOf('teh'), endIndex: text.indexOf('teh') + 3, correction: 'the' }] : [] }), destroy() {} }) })
    await writeWorkspace({ activeId: 'ai', files: [{ id: 'ai', name: 'Doc.md', content: '# Title\n\nThis is teh text.\n\n```js\nconst teh = 1\n```' }] })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'AI tools' }))
    const dialog = await screen.findByRole('dialog', { name: 'AI tools' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Summarize$/ }))
    await within(dialog).findByText(/Summary of/, {}, { timeout: 4000 })

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Translate' }))
    await within(dialog).findByText('English (detected)')
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Translate to' }), { target: { value: 'fr' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Translate to French' }))
    const translated = await within(dialog).findByText(/\[fr\] Title/, {}, { timeout: 4000 })
    expect(translated.textContent).toContain('# [fr] Title')
    expect(translated.textContent).toContain('const teh = 1')
    expect(created[0]).toMatchObject({ sourceLanguage: 'en', targetLanguage: 'fr' })

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Proofread' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check document' }))
    await within(dialog).findByRole('list', { name: 'Suggested corrections' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Apply 1 correction/ }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toBe('# Title\n\nThis is the text.\n\n```js\nconst teh = 1\n```'))
  })

  it('shows an on-device summary at the top of the page from the Summarize button', async () => {
    vi.stubGlobal('Summarizer', { availability: async () => 'available', create: async () => ({ summarize: async () => '- First point\n- Second point', destroy() {} }) })
    await writeWorkspace({ activeId: 'sm', files: [{ id: 'sm', name: 'Doc.md', content: '# Doc\n\nSome long text.' }] })
    installApp()
    await screen.findByRole('tab', { name: 'Doc.md' })
    fireEvent.click(await screen.findByRole('button', { name: 'Summarize document' }))
    const card = await screen.findByRole('region', { name: 'Document summary' })
    await within(card).findByText('First point', {}, { timeout: 4000 })
    // The card sits at the top of the page, before the document content.
    const page = card.closest('.book-page')
    expect(page).toBeTruthy()
    expect(card.compareDocumentPosition(page.querySelector('.rm-prose:not(.summary-card-body) h1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide summary', pressed: true }))
    expect(screen.queryByRole('region', { name: 'Document summary' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Summarize document' }))
    expect(await screen.findByRole('region', { name: 'Document summary' })).toHaveTextContent('Second point')
    // Editing marks the summary as out of date; inserting adds it as a callout.
    fireEvent.change(document.querySelector('textarea.editor-textarea'), { target: { value: '# Doc\n\nSome long text. More.' } })
    expect(await screen.findByText(/changed since this summary/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Insert summary into document' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toMatch(/^> \[!NOTE\] Summary\n> - First point/))
  })

  it('writes a README from a description without AI and fills the editor and page', async () => {
    const { readmeFromPrompt } = await import('../onDeviceAi.js')
    const readme = readmeFromPrompt('A React app called TaskFlow that tracks daily habits, shows streaks and sends reminders')
    expect(readme).toMatch(/^# TaskFlow\n\n> TaskFlow is a React app that tracks daily habits/)
    expect(readme).toContain('- Shows streaks')
    expect(readme).toContain('npm install')

    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'New file options' }))
    fireEvent.click(within(await screen.findByRole('menu', { name: 'New file' })).getByRole('menuitem', { name: /Write a README/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Write a README' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project description' }), { target: { value: 'A Python CLI tool called PhotoSort for renaming photos by date' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Write README/ }))
    await waitFor(() => expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'README.md'))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toContain('pip install -r requirements.txt'), { timeout: 4000 })
    expect(document.querySelector('.rm-prose h1')).toHaveTextContent('PhotoSort')
  })

  it('streams a README from the on-device AI writer into a new file', async () => {
    vi.stubGlobal('Writer', {
      availability: async () => 'available',
      create: async () => ({
        async *writeStreaming() { yield '```markdown\n# Orbit\n\nA tiny'; yield ' space game.\n\n## Features\n\n- Planets\n```' },
        destroy() {},
      }),
    })
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'New file options' }))
    fireEvent.click(within(await screen.findByRole('menu', { name: 'New file' })).getByRole('menuitem', { name: /Write a README/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Write a README' })
    expect(dialog).toHaveTextContent('on-device AI')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project description' }), { target: { value: 'A space game called Orbit' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Write README/ }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toBe('# Orbit\n\nA tiny space game.\n\n## Features\n\n- Planets\n'), { timeout: 4000 })
    expect(document.querySelector('.rm-prose h1')).toHaveTextContent('Orbit')
  })

  it('offers a quick README while the on-device writer is still preparing', async () => {
    vi.stubGlobal('Writer', { availability: async () => 'downloadable', create: () => new Promise(() => {}) })
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'New file options' }))
    fireEvent.click(within(await screen.findByRole('menu', { name: 'New file' })).getByRole('menuitem', { name: /Write a README/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Write a README' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project description' }), { target: { value: 'A Go service called Relay that forwards webhooks' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Write README/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use quick version' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toMatch(/^# Relay\n\n> Relay is a Go service/), { timeout: 4000 })
    expect(screen.queryByRole('status', { name: '' })?.textContent || '').not.toContain('Preparing')
  })

  it('saves every file with Cmd/Ctrl+S instead of the browser saving the page', async () => {
    installApp()
    await screen.findAllByRole('tab')
    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(await screen.findByText(/^Saved \d+ files?/)).toBeInTheDocument()
  })

  it('shows the AI tools and explains when in-browser AI is not supported', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'AI tools' }))
    const dialog = await screen.findByRole('dialog', { name: 'AI tools' })
    expect(dialog).toHaveTextContent('In-browser AI isn’t supported in this browser.')
    expect(within(dialog).getAllByRole('tab')).toHaveLength(3)
  })

  it('opens Write a README from the editor toolbar', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Write a README with AI' }))
    expect(await screen.findByRole('dialog', { name: 'Write a README' })).toBeInTheDocument()
  })

  it('has settings to hide AI, turn on lite mode, and an About section', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'AI tools' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'AI tools' })).getByRole('button', { name: 'Close AI tools' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Features' }))
    fireEvent.click(within(dialog).getByRole('switch', { name: /Hide AI features/ }))
    fireEvent.click(within(dialog).getByRole('switch', { name: /Lite mode/ }))
    expect(document.documentElement).toHaveClass('lite-mode')
    expect(screen.queryByRole('button', { name: 'AI tools' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('readme-app-settings'))).toMatchObject({ hideAi: true, lite: true })
    fireEvent.click(within(dialog).getByRole('button', { name: 'About' }))
    expect(within(dialog).getByText('Sahil Gupta')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', 'https://github.com/the-stranded-alien/readme')
    document.documentElement.classList.remove('lite-mode')
  })

  it('offers additional themes from Settings, including Neon', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appearance' }))
    expect(within(dialog).queryByRole('radio', { name: 'Neon Pink' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('switch', { name: /Additional themes/ }))
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Neon Pink' }))
    await waitFor(() => expect(document.documentElement).toHaveClass('theme-neon'))
    expect(document.documentElement).toHaveClass('dark')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Neon Rainbow' }))
    await waitFor(() => expect(document.documentElement).toHaveClass('theme-neon-rainbow'))
    expect(document.documentElement).toHaveClass('theme-neon')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Neon Green' }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass('theme-neon-rainbow'))
    expect(document.documentElement).toHaveClass('theme-neon-green')
    for (const name of ['Sun', 'Monokai', 'Nord', 'Solarized']) expect(within(dialog).getByRole('radio', { name })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Monokai' }))
    await waitFor(() => expect(document.documentElement).toHaveClass('theme-monokai'))
    fireEvent.click(within(dialog).getByRole('switch', { name: /High contrast/ }))
    await waitFor(() => expect(document.documentElement).toHaveClass('high-contrast'))
    expect(document.documentElement).toHaveClass('theme-monokai')
    fireEvent.click(within(dialog).getByRole('switch', { name: /Additional themes/ }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass('theme-neon'))
  })

  it('switches theme inside presentation mode', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Present document as slides' }))
    const show = await screen.findByRole('dialog', { name: /Presentation/ })
    const before = document.documentElement.className
    fireEvent.click(within(show).getByRole('button', { name: /Switch theme/ }))
    await waitFor(() => expect(document.documentElement.className).not.toBe(before))
  })

  it('opens the help guide and searches it', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Help: how to use ReadMe' }))
    const dialog = await screen.findByRole('dialog', { name: 'How to use ReadMe' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search help' }), { target: { value: 'slash' } })
    expect(within(dialog).getByText('Slash commands')).toBeInTheDocument()
  })

  it('explains why the browser refused to keep data', async () => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {
      estimate: async () => ({ usage: 1024, quota: 100 * 1024 * 1024 }),
      persisted: async () => false,
      persist: vi.fn(async () => false),
    } })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Storage' }))
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Keep my data' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t protect your data.')
    delete navigator.storage
  })

  it('sizes summaries to the document and splits long documents into parts', async () => {
    const { summaryLengthFor, splitForSummary } = await import('../onDeviceAi.js')
    expect(summaryLengthFor(100)).toBe('short')
    expect(summaryLengthFor(500)).toBe('medium')
    expect(summaryLengthFor(3000)).toBe('long')
    const long = Array.from({ length: 6 }, (_, i) => `## Part ${i}\n\n${'word '.repeat(500)}`).join('\n\n')
    const parts = splitForSummary(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[0].title).toBe('Part 0')
  })

  it('summarizes a single section under its heading', async () => {
    const summarizeStreaming = vi.fn(async function* () { yield '- Section point' })
    vi.stubGlobal('Summarizer', { availability: async () => 'available', create: async () => ({ summarizeStreaming, destroy() {} }) })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Summarize Features' }))
    const card = await screen.findByRole('region', { name: 'Section summary' })
    await within(card).findByText('Section point')
    expect(card.closest('section[data-section-key]').querySelector('h2')).toHaveTextContent('Features')
  })

  it('bookmarks sections, highlights them and shows only bookmarked sections', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    const onlyToggle = await screen.findByRole('button', { name: 'Show only bookmarked sections' })
    expect(onlyToggle).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Bookmark heading Features' }))
    await waitFor(() => expect(document.querySelector('.doc-prose h2#features')).toHaveClass('is-bookmarked'))
    expect(onlyToggle).not.toBeDisabled()
    fireEvent.click(onlyToggle)
    expect(document.querySelector('.doc-prose')).toHaveClass('bm-only')
    expect(screen.getByText('Showing 1 bookmarked section')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('readme-section-bookmarks'))).toEqual(expect.any(Object))
  })

  it('filters the page to one kind of content', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Filter content' }))
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Filter content' })).getByRole('menuitemradio', { name: 'Tables' }))
    await waitFor(() => expect(document.querySelector('.doc-prose').querySelector('[data-filter-match]')).toBeTruthy())
    const visible = [...document.querySelectorAll('.doc-prose p, .doc-prose ul')].filter(el => !el.closest('[data-filter-hidden]'))
    expect(visible.filter(el => !el.closest('table'))).toHaveLength(0)
    expect(screen.getByText(/Showing \d+ match/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    await waitFor(() => expect(document.querySelector('[data-filter-hidden]')).toBeNull())
  })

  it('resizes the contents bar between its minimum and 30% of the window', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    const handle = await screen.findByRole('separator', { name: 'Resize contents' })
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(Math.max(230, Math.round(window.innerWidth * 0.3)))
    for (let i = 0; i < 80; i += 1) fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(230)
  })

  it('edits a file inside the comparison and re-compares', async () => {
    installApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'New file' })[0])
    fireEvent.change(document.querySelector('textarea.editor-textarea'), { target: { value: '# Revised\nnew line' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    fireEvent.change(screen.getByPlaceholderText('Jump to file, heading, template, or command…'), { target: { value: 'Compare open files' } })
    fireEvent.click(await screen.findByText('Compare open files'))
    const diffDialog = await screen.findByRole('dialog', { name: 'Compare open files' })
    fireEvent.click(within(diffDialog).getByRole('button', { name: 'Edit original file' }))
    const editor = within(diffDialog).getByRole('textbox', { name: /^Edit / })
    fireEvent.change(editor, { target: { value: '# Revised\nedited in compare' } })
    fireEvent.click(within(diffDialog).getByRole('button', { name: 'Show differences for original file' }))
    await waitFor(() => expect(within(diffDialog).getByText('edited in compare')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('renders ==highlights== in colours and offers more editor formatting', async () => {
    const { rehypeMarks } = await import('../rehypeMarks.js')
    expect(rehypeMarks).toBeTypeOf('function')
    installApp()
    const editor = document.querySelector('textarea.editor-textarea')
    fireEvent.change(editor, { target: { value: '# Doc\n\nSome ==yellow== and =={green}green== text.' } })
    await waitFor(() => expect(document.querySelector('.doc-prose mark.md-mark-green')).toHaveTextContent('green'))
    expect(document.querySelector('.doc-prose mark.md-mark-yellow')).toHaveTextContent('yellow')
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    for (const name of ['Heading 3', 'Numbered list', 'Task list', 'Table', 'Code block', 'Image', 'Footnote', 'Callout']) {
      expect(within(toolbar).getByRole('button', { name })).toHaveAttribute('data-tip', name)
    }
    editor.setSelectionRange(10, 14)
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Highlight' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Blue highlight' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toContain('=={blue}'))
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Footnote' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toMatch(/\[\^1\]: Footnote text$/))
  })

  it('syncs the workspace to a folder on the computer', async () => {
    const written = new Map()
    const makeFile = (name, content) => ({
      kind: 'file', name,
      getFile: async () => new File([content], name),
      createWritable: async () => ({ write: async text => { written.set(name, text) }, close: async () => {} }),
    })
    const existing = makeFile('notes.md', '# Notes from the folder')
    const folder = {
      kind: 'directory', name: 'My Docs',
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      async *entries() { yield ['notes.md', existing] },
      getFileHandle: async (name, { create } = {}) => (name === 'notes.md' ? existing : create ? makeFile(name, '') : Promise.reject(new Error('missing'))),
      getDirectoryHandle: async () => folder,
    }
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => folder))
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Choose a folder/ }))
    await waitFor(() => expect(written.has('Welcome.md')).toBe(true))
    expect(await within(dialog).findByText('My Docs')).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'notes.md' })).toBeInTheDocument()
  })

  it('collapses and expands heading sections, individually and all at once', async () => {
    installApp()
    const toggle = await screen.findByRole('button', { name: 'Collapse section Features' })
    const section = toggle.closest('section')
    expect(section.getAttribute('data-collapsed')).toBeNull()
    fireEvent.click(toggle)
    expect(section.getAttribute('data-collapsed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Expand section Features' }))
    expect(section.getAttribute('data-collapsed')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all sections' }))
    expect(section.getAttribute('data-collapsed')).toBe('true')
    // The lone title section stays open so the outline remains visible.
    expect(screen.getByRole('button', { name: /section Welcome to ReadMe/ }).closest('section').getAttribute('data-collapsed')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all sections' }))
    expect(section.getAttribute('data-collapsed')).toBeNull()
  })

  it('starts long documents (over 5 minutes) collapsed', async () => {
    const long = ['# Long read', '', '## Part one', '', 'word '.repeat(800), '', '## Part two', '', 'word '.repeat(800)].join('\n')
    await writeWorkspace({ activeId: 'long', files: [{ id: 'long', name: 'Long.md', content: long }] })
    localStorage.setItem('readme-files', JSON.stringify([{ id: 'long', name: 'Long.md', content: long }]))
    localStorage.setItem('readme-active-file', 'long')
    installApp()
    const toggle = await screen.findByRole('button', { name: 'Expand section Part one' })
    expect(toggle.closest('section').getAttribute('data-collapsed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Expand all sections' })).toBeInTheDocument()
  })

  it('defaults the preview to wide mode, migrating older saved prefs', () => {
    localStorage.setItem('readme-reader-prefs', JSON.stringify({ fontIndex: 0, size: 'md', width: 'book' }))
    const { container } = installApp()
    expect(container.querySelector('.book-page').style.maxWidth).toBe('100%')
  })

  it('cycles light, dark and sepia color modes', async () => {
    localStorage.setItem('readme-theme', 'dark')
    installApp()
    fireEvent.click(screen.getByRole('button', { name: /Color mode dark/ }))
    await waitFor(() => expect(document.documentElement.classList.contains('theme-sepia')).toBe(true))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
