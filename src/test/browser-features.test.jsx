import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import App from '../App.jsx'
import { analyzeDocument, checkMarkdownQuality } from '../documentAnalysis.js'
import { diffLines } from '../documentDiff.js'
import { fuzzyScore, isModifiedFromDisk, makeDuplicateFileName } from '../fileUtils.js'
import { readWorkspace, writeWorkspace } from '../workspaceDb.js'

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

  it('duplicates an open file into a new independent tab', async () => {
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Welcome.md' }))
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
    fireEvent.drop(document.querySelector('.app-shell'), { dataTransfer: { items: [item], files: [] } })
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
    await waitFor(() => expect(highlights.set).toHaveBeenCalledWith('readme-annotations', expect.any(window.Highlight)))
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
  })

  it('downloads a generated PDF instead of opening a print window', async () => {
    const exportMarkdownPdf = vi.fn(async () => {})
    vi.doMock('../pdfExport', () => ({ exportMarkdownPdf }))
    const open = vi.spyOn(window, 'open')
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Download and export options' }))
    fireEvent.click(await screen.findByText('Download PDF'))
    await waitFor(() => expect(exportMarkdownPdf).toHaveBeenCalledOnce())
    expect(exportMarkdownPdf.mock.calls[0][1].fileName).toMatch(/\.pdf$/)
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
