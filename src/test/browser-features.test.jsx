import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import App from '../App.jsx'
import { APP_VERSION } from '../version.js'
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
    fireEvent.click(screen.getByRole('button', { name: 'Download and export options' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Save File in Place/ }))
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
    fireEvent.click(document.querySelector('[data-tip="Duplicate Welcome.md"]'))
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

  it('offers the app in the Download menu and Settings → App, and shows when it is installed', async () => {
    const prompt = vi.fn(async () => {})
    const installEvent = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(installEvent, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    installApp()
    window.dispatchEvent(installEvent)
    fireEvent.click(await screen.findByRole('button', { name: 'Download and export options' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Download ReadMe App/ }))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    // Once installed, the menu no longer offers it and Settings → App says so, with the version.
    fireEvent.click(await screen.findByRole('button', { name: 'Download and export options' }))
    expect(screen.queryByRole('menuitem', { name: /Download ReadMe App/ })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    fireEvent.change(screen.getByPlaceholderText('Jump to file, heading, template, or command…'), { target: { value: 'Settings' } })
    fireEvent.click((await screen.findAllByText(/^Settings/))[0])
    const settings = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(settings).getByRole('button', { name: 'App' }))
    const card = within(settings).getByRole('group', { name: 'ReadMe app' })
    expect(card).toHaveTextContent(`Version ${APP_VERSION}`)
    expect(card).toHaveTextContent('Already installed')
    localStorage.removeItem('readme-app-installed')
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
    fireEvent.click(screen.getByRole('button', { name: 'View options' }))
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Keep screen awake/ }))
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
    window.prompt = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '# Imported URL' })))
    installApp()
    fireEvent.click(screen.getByRole('button', { name: 'Upload options' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Import Markdown from URL/ }))
    // The app's own dialog asks for the URL.
    const ask = await screen.findByRole('dialog', { name: 'Import from a URL' })
    const field = within(ask).getByRole('textbox', { name: 'Markdown file or web page URL' })
    fireEvent.change(field, { target: { value: 'ftp://nope' } })
    expect(within(ask).getByText('Use an http or https URL.')).toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'https://example.test/remote.md' } })
    fireEvent.click(within(ask).getByRole('button', { name: 'Import' }))
    expect(window.prompt).not.toHaveBeenCalled()
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

  it('moves renamed files in the sync folder and only deletes unchanged copies', async () => {
    const { writeToFolder, existsInFolder, syncPath } = await import('../folderSync.js')
    // A tiny in-memory directory handle.
    const makeDir = () => {
      const entries = new Map()
      const dir = {
        kind: 'directory', entries,
        async getDirectoryHandle(name, { create } = {}) {
          if (!entries.has(name)) { if (!create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' }); entries.set(name, makeDir()) }
          return entries.get(name)
        },
        async getFileHandle(name, { create } = {}) {
          if (!entries.has(name)) { if (!create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' }); entries.set(name, { kind: 'file', text: '' }) }
          const file = entries.get(name)
          return { kind: 'file', getFile: async () => ({ text: async () => file.text }), createWritable: async () => ({ write: async t => { file.text = t }, close: async () => {} }) }
        },
        async removeEntry(name) { entries.delete(name) },
      }
      return dir
    }
    const root = makeDir()
    const written = new Map(), paths = new Map()
    await writeToFolder(root, [{ id: 'a', name: 'notes/a.md', content: 'A' }, { id: 'b', name: 'b.md', content: 'B' }], written, paths)
    expect(await existsInFolder(root, 'notes/a.md')).toBe(true)
    // Rename a (unchanged on disk) → moved; rename b after an outside edit → old copy kept.
    root.entries.get('b.md').text = 'B edited elsewhere'
    await writeToFolder(root, [{ id: 'a', name: 'notes/a2.md', content: 'A' }, { id: 'b', name: 'b2.md', content: 'B' }], written, paths)
    expect(await existsInFolder(root, 'notes/a.md')).toBe(false)
    expect(await existsInFolder(root, 'notes/a2.md')).toBe(true)
    expect(await existsInFolder(root, 'b.md')).toBe(true)
    expect(paths.get('a')).toBe('notes/a2.md')
    expect(syncPath('../x/y')).toBe('x/y.md')
  })

  it('finds closed files in search, reopens them, and deletes files with undo', async () => {
    await writeWorkspace({ activeId: 'a', files: [
      { id: 'a', name: 'main.md', content: '# Main' },
      { id: 'd', name: 'doomed.md', content: '# Doomed' },
    ], closed: [{ index: 1, file: { id: 'z', name: 'archive.md', content: '# Archive\n\nneedle in closed file' } }] })
    installApp()
    await screen.findByRole('tab', { name: 'main.md' })
    // Search all files includes the closed file and opening the result reopens it.
    fireEvent.keyDown(window, { key: 'f', metaKey: true, shiftKey: true })
    const search = await screen.findByRole('combobox', { name: 'Search in all files' })
    fireEvent.change(search, { target: { value: 'needle' } })
    const dialog = screen.getByRole('dialog', { name: 'Search in all files' })
    await within(dialog).findByText('archive.md')
    expect(within(dialog).getByText('closed')).toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(await screen.findByRole('tab', { name: 'archive.md' })).toBeInTheDocument()
    // Delete permanently with confirmation, then Undo.
    window.confirm = vi.fn(() => true)
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'doomed.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete permanently/ }))
    const confirmDelete = await screen.findByRole('alertdialog', { name: 'Delete file?' })
    expect(confirmDelete).toHaveTextContent('Delete “doomed.md” permanently?')
    // Cancel is focused, so Enter can't delete by accident.
    expect(within(confirmDelete).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(within(confirmDelete).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'doomed.md' })).not.toBeInTheDocument())
    expect(window.confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    expect(within(await screen.findByRole('tree', { name: 'Files' })).queryByText('doomed.md')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('tab', { name: 'doomed.md' })).toBeInTheDocument()
  })

  it('splits speaker notes, clamps zoom and builds links between files', async () => {
    const { splitSlideNotes, clampZoom } = await import('../presentation.js')
    expect(splitSlideNotes('## A\n\nBody\n\n???\nSay hello')).toEqual({ body: '## A\n\nBody', notes: 'Say hello' })
    expect(splitSlideNotes('## A\n\n```\n???\n```')).toEqual({ body: '## A\n\n```\n???\n```', notes: '' })
    expect(clampZoom(5)).toBe(2)
    expect(clampZoom(0.1)).toBe(0.6)
    expect(clampZoom(1.25)).toBe(1.3)
    const { relativeFileLink, resolveFileLink, fileLinkTitle } = await import('../fileUtils.js')
    expect(relativeFileLink('notes/plan.md', 'notes/ideas.md')).toBe('ideas.md')
    expect(relativeFileLink('notes/plan.md', 'docs/My Guide.md')).toBe('../docs/My%20Guide.md')
    expect(relativeFileLink('todo.md', 'notes/a.md')).toBe('notes/a.md')
    expect(resolveFileLink('notes/plan.md', '../docs/My%20Guide.md#setup')).toEqual({ name: 'docs/My Guide.md', anchor: 'setup' })
    expect(resolveFileLink('notes/plan.md', 'https://x.dev/a.md')).toBeNull()
    expect(resolveFileLink('notes/plan.md', '#intro')).toBeNull()
    expect(fileLinkTitle({ name: 'x/y.md', content: 'text\n\n## The [Title]\n' })).toBe('The Title')
    expect(fileLinkTitle({ name: 'x/y.md', content: '' })).toBe('y')
  })

  it('zooms presentation text and keeps the size across slides', async () => {
    localStorage.removeItem('readme-presentation-zoom')
    await writeWorkspace({ activeId: 'p', files: [{ id: 'p', name: 'Deck.md', content: '# One\n\nA\n\n???\nnote one\n\n## Two\n\nB' }] })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Present document as slides' }))
    const deck = await screen.findByRole('dialog', { name: /Presentation, slide 1 of 2/ })
    expect(deck).not.toHaveTextContent('note one')
    fireEvent.click(within(deck).getByRole('button', { name: 'Larger text' }))
    fireEvent.click(within(deck).getByRole('button', { name: 'Larger text' }))
    expect(within(deck).getByRole('button', { name: /Text size 120%/ })).toBeInTheDocument()
    fireEvent.keyDown(deck, { key: 'ArrowRight' })
    await waitFor(() => expect(deck.querySelector('.presentation-slide').style.getPropertyValue('--slide-zoom')).toBe('1.2'))
    expect(localStorage.getItem('readme-presentation-zoom')).toBe('1.2')
    fireEvent.keyDown(deck, { key: '0' })
    expect(within(deck).getByRole('button', { name: /Text size 100%/ })).toBeInTheDocument()
  })

  it('keeps closed files in backups', async () => {
    const { createBackup, readBackup, applyBackup } = await import('../backup.js')
    const blob = await createBackup({ files: [{ id: 'o1', name: 'open.md', content: '# Open' }], activeId: 'o1', closed: [{ index: 1, file: { id: 'c1', name: 'docs/old.md', content: '# Old' } }] })
    const backup = await readBackup(blob)
    expect(backup.closed).toEqual([{ index: 1, file: { id: 'c1', name: 'docs/old.md', content: '# Old' } }])
    await applyBackup(backup)
    expect((await readWorkspace()).closed.map(entry => entry.file.name)).toEqual(['docs/old.md'])
  })

  it('clears the editor in a way that can be undone from the toast', async () => {
    await writeWorkspace({ activeId: 'k', files: [{ id: 'k', name: 'Keep.md', content: '# Keep me\n\nImportant text' }] })
    installApp()
    await screen.findByRole('tab', { name: 'Keep.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Editor', exact: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear editor' }))
    await waitFor(() => expect(document.querySelector('.editor-textarea').value).toBe(''))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(document.querySelector('.editor-textarea').value).toContain('Important text'))
  })

  it('keeps per-file snapshots, newest first, skipping duplicates', async () => {
    await addSnapshot('h1', { content: 'one', reason: 'Auto-saved' })
    await addSnapshot('h1', { content: 'one', reason: 'Auto-saved' })
    await addSnapshot('h1', { content: 'two', reason: 'Saved to disk' })
    const history = await readHistory('h1')
    expect(history.map(entry => entry.content)).toEqual(['two', 'one'])
    expect(history[0].reason).toBe('Saved to disk')
  })

  it('never rewrites the editor textarea while typing (keeps the browser undo history whole)', async () => {
    await writeWorkspace({ activeId: 'u', files: [{ id: 'u', name: 'Undo.md', content: '# Undo' }, { id: 'v', name: 'Other.md', content: '# Other' }] })
    installApp()
    const editor = await screen.findByDisplayValue('# Undo')
    // React would otherwise copy the text into the textarea's defaultValue on every change,
    // which splits Cmd/Ctrl+Z into single characters.
    fireEvent.change(editor, { target: { value: '# Undo\n\ntyped' } })
    await waitFor(() => expect(document.querySelector('.rm-prose')).toHaveTextContent('typed'))
    expect(editor.defaultValue).toBe('')
    expect(editor.value).toBe('# Undo\n\ntyped')
    // Changes from outside the editor (switching files) still reach it.
    fireEvent.click(screen.getByRole('tab', { name: 'Other.md' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea')).toHaveValue('# Other'))
  })

  it('restores a version from history through the confirmation on top', async () => {
    await writeWorkspace({ activeId: 'r1', files: [{ id: 'r1', name: 'Restore.md', content: '# Now' }] })
    await addSnapshot('r1', { content: '# Earlier version', reason: 'Manual snapshot' })
    installApp()
    await screen.findByDisplayValue('# Now')
    fireEvent.click(screen.getByRole('button', { name: 'Version history' }))
    const history = await screen.findByRole('dialog', { name: 'Version history' })
    fireEvent.click(await within(history).findByRole('option', { name: /Manual snapshot/ }))
    fireEvent.click(within(history).getByRole('button', { name: 'Restore this version' }))
    const ask = await screen.findByRole('alertdialog', { name: 'Restore this version?' })
    // The question is drawn above the history dialog.
    expect(ask.parentElement).toHaveClass('is-topmost')
    // Escape closes only the question; history stays open.
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Version history' })).toBeInTheDocument()
    fireEvent.click(within(history).getByRole('button', { name: 'Restore this version' }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Restore this version?' })).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea')).toHaveValue('# Earlier version'))
    expect(screen.queryByRole('dialog', { name: 'Version history' })).toBeNull()
  })

  it('pastes rich text as Markdown (plain text first, so one undo keeps it plain)', async () => {
    await writeWorkspace({ activeId: 'p', files: [{ id: 'p', name: 'Paste.md', content: 'Start\n' }] })
    installApp()
    const editor = await screen.findByDisplayValue(/Start/)
    editor.setSelectionRange(6, 6)
    const clipboard = types => ({ files: [], getData: type => types[type] ?? '' })
    fireEvent.paste(editor, { clipboardData: clipboard({ 'text/html': '<h2>Title</h2><p>A <b>bold</b> <a href="https://x.dev">link</a></p>', 'text/plain': 'Title\nA bold link' }) })
    await waitFor(() => expect(editor.value).toBe('Start\n## Title\n\nA **bold** [link](https://x.dev)'))
    expect(await screen.findByText(/Pasted as Markdown/)).toBeInTheDocument()
    // Spreadsheet cells (tabs) become a table; plain HTML paragraphs stay plain text.
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.paste(editor, { clipboardData: clipboard({ 'text/plain': 'a\tb\n1\t2' }) })
    await waitFor(() => expect(editor.value).toContain('| a | b |\n| --- | --- |\n| 1 | 2 |'))
    const before = editor.value
    fireEvent.paste(editor, { clipboardData: clipboard({ 'text/html': '<p>just text</p>', 'text/plain': 'just text' }) })
    await waitFor(() => expect(editor.value).toBe(`${before}just text`))
  })

  it('edits a table in a grid from the preview, and inserts one from the toolbar', async () => {
    await writeWorkspace({ activeId: 't', files: [{ id: 't', name: 'Table.md', content: '# T\n\n| Name | Qty |\n| --- | --- |\n| Pear | 5 |\n\nAfter' }] })
    installApp()
    await screen.findByDisplayValue(/Pear/)
    fireEvent.click(document.querySelector('.table-wrap [data-edit-table]'))
    const dialog = await screen.findByRole('dialog', { name: 'Edit table' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Row 1, column 1' }), { target: { value: 'Apple | red' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert row below' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Row 2, column 1' }), { target: { value: 'Fig' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Center column' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update table' }))
    const editor = document.querySelector('textarea.editor-textarea')
    await waitFor(() => expect(editor.value).toContain('|     Name     | Qty |\n| :----------: | --- |\n| Apple \\| red | 5   |\n|     Fig      |     |'))
    expect(editor.value.endsWith('\n\nAfter')).toBe(true)
    // With the caret outside a table, the toolbar button inserts a new one.
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name: 'Table (insert or edit)' }))
    const insert = await screen.findByRole('dialog', { name: 'Insert table' })
    fireEvent.keyDown(within(insert).getByRole('textbox', { name: 'Row 2, column 3' }), { key: 'Tab' })
    expect(within(insert).getByText('3 rows × 3 columns')).toBeInTheDocument()
    fireEvent.click(within(insert).getByRole('button', { name: 'Insert table' }))
    await waitFor(() => expect(editor.value).toMatch(/After\n\n\| Column 1 \| Column 2 \| Column 3 \|/))
  })

  it('links documents with [[wiki links]]: opens them, creates missing ones, shows backlinks, updates on rename', async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    await writeWorkspace({ activeId: 'home', files: [
      { id: 'home', name: 'Home.md', content: '# Home\n\nSee [[Plan#Goals|the goals]] and [[Ideas]].' },
      { id: 'plan', name: 'notes/Plan.md', content: '# Plan\n\n## Goals\n\nShip it.' },
    ] })
    installApp()
    const link = await screen.findByRole('link', { name: 'the goals' })
    expect(link).toHaveClass('wiki-link')
    await waitFor(() => expect(screen.getByRole('link', { name: 'Ideas' })).toHaveClass('is-missing'))
    fireEvent.click(link)
    expect(await screen.findByRole('tab', { name: 'notes/Plan.md' })).toHaveAttribute('aria-selected', 'true')
    // "Linked from" in the Contents sidebar (shown in Preview).
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const linkedFrom = await screen.findByRole('region', { name: 'Linked from' })
    expect(linkedFrom).toHaveTextContent('Home')
    expect(linkedFrom).toHaveTextContent('See the goals and Ideas.')
    fireEvent.click(within(linkedFrom).getByRole('button', { name: /Home/ }))
    fireEvent.click(await screen.findByRole('link', { name: 'Ideas' }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Create “Ideas”?' })).getByRole('button', { name: 'Create document' }))
    expect(await screen.findByRole('tab', { name: 'Ideas.md' })).toBeInTheDocument()
    // Renaming Plan updates the link in Home.
    fireEvent.doubleClick(within(screen.getByRole('tab', { name: 'notes/Plan.md' })).getByText('Plan.md'))
    const rename = screen.getByRole('textbox', { name: /Rename Plan/ })
    fireEvent.change(rename, { target: { value: 'Roadmap' } })
    fireEvent.keyDown(rename, { key: 'Enter' })
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Update links?' })).getByRole('button', { name: 'Update 1 document' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Home.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Split' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea')).toHaveValue('# Home\n\nSee [[Roadmap#Goals|the goals]] and [[Ideas]].'))
  })

  it('moves, promotes and demotes sections from the Contents sidebar', async () => {
    await writeWorkspace({ activeId: 'o', files: [{ id: 'o', name: 'Outline.md', content: '# Doc\n\n## One\n\nfirst\n\n### Sub\n\nsub\n\n## Two\n\nsecond' }] })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    const toc = document.querySelector('.toc-panel')
    fireEvent.click(await within(toc).findByRole('button', { name: 'Section options for One' }))
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Section “One”' })).getByRole('menuitem', { name: /Move down/ }))
    const text = () => document.querySelector('.rm-prose').textContent
    await waitFor(() => expect(text().indexOf('Two')).toBeLessThan(text().indexOf('One')))
    expect(text().indexOf('One')).toBeLessThan(text().indexOf('sub'))
    // Alt+→ demotes "Two" (now first) to an H3.
    fireEvent.keyDown(within(toc).getByRole('button', { name: 'Two' }), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(document.querySelector('.rm-prose h3')).toHaveTextContent('Two'))
    fireEvent.keyDown(within(toc).getByRole('button', { name: 'Two' }), { key: 'ArrowLeft', altKey: true })
    await waitFor(() => expect([...document.querySelectorAll('.rm-prose h2')].map(h => h.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Two')])))
    // H1 can't be promoted.
    fireEvent.keyDown(within(toc).getByRole('button', { name: 'Doc' }), { key: 'ArrowLeft', altKey: true })
    expect(await screen.findByText(/can’t go further/)).toBeInTheDocument()
  })

  it('collects tasks from all documents, ticks them from the panel and the preview', async () => {
    const pad = n => String(n).padStart(2, '0')
    const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    await writeWorkspace({ activeId: 'a', files: [
      { id: 'a', name: 'Work.md', content: `# Work\n\n- [ ] Send report due:${today} #ops !high\n- [x] Book room\n` },
      { id: 'b', name: 'notes/Home.md', content: '# Home\n\n- [ ] Buy milk #errands\n\n```\n- [ ] not a task\n```' },
    ] })
    installApp()
    await screen.findByDisplayValue(/Send report/)
    // Header button shows tasks due today or overdue.
    expect(screen.getByRole('button', { name: 'Tasks, 1 due today or overdue' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', metaKey: true, shiftKey: true })
    const panel = await screen.findByRole('dialog', { name: 'Tasks' })
    expect(within(panel).getByRole('region', { name: 'Work.md' })).toHaveTextContent('Send report')
    expect(within(panel).getByText('Today')).toBeInTheDocument()
    expect(within(panel).getByText('High')).toBeInTheDocument()
    expect(within(panel).queryByText('not a task')).toBeNull()
    expect(within(panel).queryByText('Book room')).toBeNull() // "Open" filter
    // Tick a task in another document.
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Mark as done: Buy milk' }))
    fireEvent.click(within(panel).getByRole('radio', { name: /Done/ }))
    expect(within(panel).getByText('Buy milk')).toBeInTheDocument()
    // Filter by tag and group by due date.
    fireEvent.click(within(panel).getByRole('radio', { name: /All/ }))
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Tag' }), { target: { value: 'ops' } })
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(within(panel).getByRole('radio', { name: 'By due date' }))
    expect(within(panel).getByRole('region', { name: 'Today' })).toHaveTextContent('Send report')
    // Tick the open document's task from the panel.
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Mark as done: Send report' }))
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toContain('- [x] Send report'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Close tasks' }))
    // Ticking in the preview changes the document.
    await waitFor(() => expect(document.querySelectorAll('.rm-prose input[type="checkbox"]')).toHaveLength(2))
    fireEvent.click(document.querySelectorAll('.rm-prose input[type="checkbox"]')[1])
    await waitFor(() => expect(document.querySelector('textarea.editor-textarea').value).toContain('- [ ] Book room'))
  })

  it('shows a graph of linked documents with an accessible list, opening and creating documents', async () => {
    await writeWorkspace({ activeId: 'h', files: [
      { id: 'h', name: 'Home.md', content: '# Home\n\n[[Plan]] and [[Ghost]] and [idea](notes/Idea.md)' },
      { id: 'p', name: 'Plan.md', content: '# Plan\n\nBack to [[Home]].' },
      { id: 'i', name: 'notes/Idea.md', content: '# Idea' },
      { id: 'o', name: 'Orphan.md', content: '# Orphan' },
    ] })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Graph of linked documents' }))
    const graph = await screen.findByRole('dialog', { name: 'Graph of linked documents' })
    expect(graph).toHaveTextContent('4 documents · 4 links · 1 without links')
    fireEvent.click(within(graph).getByRole('button', { name: 'List of documents and links' }))
    const list = within(graph).getByRole('navigation', { name: 'Documents and links' })
    expect(within(list).getByRole('button', { name: /→ Ghost \(missing\)/ })).toBeInTheDocument()
    fireEvent.click(within(graph).getByRole('checkbox', { name: 'Only without links' }))
    expect(within(list).getAllByRole('button').map(button => button.textContent)).toEqual(['Orphan.md0 links'])
    fireEvent.click(within(graph).getByRole('checkbox', { name: 'Only without links' }))
    fireEvent.click(within(list).getByRole('button', { name: /^Plan\.md/ }))
    expect(await screen.findByRole('tab', { name: 'Plan.md' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('dialog', { name: 'Graph of linked documents' })).toBeNull()
    // A missing document can be created from the graph.
    fireEvent.click(await screen.findByRole('button', { name: 'Graph of linked documents' }))
    const again = await screen.findByRole('dialog', { name: 'Graph of linked documents' })
    fireEvent.click(within(again).getByRole('button', { name: 'List of documents and links' }))
    fireEvent.click(within(again).getByRole('button', { name: /→ Ghost/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Create “Ghost”?' })).getByRole('button', { name: 'Create document' }))
    expect(await screen.findByRole('tab', { name: 'Ghost.md' })).toBeInTheDocument()
  })

  it('publishes documents as a website from the Download menu, per folder, with a home page', async () => {
    await writeWorkspace({ activeId: 'h', files: [
      { id: 'h', name: 'Home.md', content: '# Home' },
      { id: 'g', name: 'guides/Start.md', content: '# Start' },
      { id: 'r', name: 'guides/README.md', content: '# Guides' },
    ] })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Download and export options' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Publish as a Website/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish as a website' })
    expect(dialog).toHaveTextContent('3 pages.')
    expect(within(dialog).getByRole('combobox', { name: 'Home page' })).toHaveValue('h')
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Pages from' }), { target: { value: 'guides' } })
    expect(dialog).toHaveTextContent('2 pages.')
    // A README in the folder becomes its home page.
    expect(within(dialog).getByRole('combobox', { name: 'Home page' })).toHaveValue('r')
    expect(within(dialog).getByRole('button', { name: 'Download website (.zip)' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Publish as a website' })).toBeNull())
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
    // The slide toolbar offers PDF and PowerPoint downloads; so does the Download menu.
    const show = screen.getByRole('dialog', { name: /Presentation, slide 1 of 3/ })
    fireEvent.click(within(show).getByRole('button', { name: 'Download slides' }))
    const menu = within(show).getByRole('menu', { name: 'Download slides' })
    expect(within(menu).getByRole('menuitem', { name: /PDF \(landscape\)/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /PowerPoint/ })).toBeInTheDocument()
    fireEvent.keyDown(show, { key: 'Escape' })
    expect(within(show).queryByRole('menu', { name: 'Download slides' })).toBeNull()
    fireEvent.keyDown(show, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Presentation/ })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Download and export options' }))
    expect(await screen.findByRole('menuitem', { name: /Presentation PDF/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Presentation PowerPoint/ })).toBeInTheDocument()
  })

  it('splits slides at the chosen heading level and at horizontal rules', async () => {
    const { splitSlides } = await import('../presentation.js')
    const md = '# A\n\na\n\n## B\n\nb\n\n### C\n\nc\n\n---\n\nd\n\nSetext\n---'
    expect(splitSlides(md, { level: 1 })).toHaveLength(1)
    expect(splitSlides(md)).toHaveLength(2)
    expect(splitSlides(md, { level: 6 })).toHaveLength(3)
    // A --- after a blank line breaks; a setext underline (after text) doesn't.
    expect(splitSlides(md, { level: 6, rules: true })).toEqual(['# A\n\na', '## B\n\nb', '### C\n\nc', 'd\n\nSetext\n---'])
  })

  it('presents with a contents panel, pen, laser, blank screen and settings', async () => {
    localStorage.setItem('readme-presentation-settings', JSON.stringify({ splitLevel: 1, showTimer: true, autoAdvance: 10 }))
    await writeWorkspace({ activeId: 'p', files: [{ id: 'p', name: 'Deck.md', content: '# Deck\n\nIntro\n\n## One\n\nFirst\n\n# Two\n\nSecond\n\n# Three\n\nThird' }] })
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Present document as slides' }))
    // Only H1 starts a slide.
    const deck = await screen.findByRole('dialog', { name: /Presentation, slide 1 of 3/ })
    expect(within(deck).getByLabelText('Elapsed time')).toBeInTheDocument()
    expect(within(deck).getByRole('button', { name: 'Pause auto-advance' })).toBeInTheDocument()

    // Contents: collapsed by default; toolbar button opens it, its own button closes it.
    expect(within(deck).queryByRole('complementary', { name: 'Slides' })).toBeNull()
    fireEvent.click(within(deck).getByRole('button', { name: 'Show slide contents' }))
    const contents = within(deck).getByRole('complementary', { name: 'Slides' })
    fireEvent.click(within(contents).getByRole('button', { name: /Three/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: /slide 3 of 3/ })).toHaveTextContent('Third'))
    fireEvent.click(within(contents).getByRole('button', { name: 'Hide slide contents' }))
    expect(within(deck).queryByRole('complementary', { name: 'Slides' })).toBeNull()
    fireEvent.keyDown(deck, { key: 'o' })
    expect(within(deck).getByRole('complementary', { name: 'Slides' })).toBeInTheDocument()

    // Pen (fading by default) with a mode switch, and the laser.
    fireEvent.click(within(deck).getByRole('button', { name: 'Pen' }))
    expect(within(deck).getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true')
    const modes = within(deck).getByRole('radiogroup', { name: 'Pen mode' })
    expect(within(modes).getByRole('radio', { name: 'Fading' })).toBeChecked()
    fireEvent.click(within(modes).getByRole('radio', { name: 'Permanent' }))
    expect(within(modes).getByRole('radio', { name: 'Permanent' })).toBeChecked()
    // Nothing drawn yet, so Clear is off. A toolbar colour becomes the default.
    expect(within(deck).getByRole('button', { name: 'Clear drawings on this slide' })).toBeDisabled()
    fireEvent.click(within(within(deck).getByRole('radiogroup', { name: 'Pen colour' })).getByRole('radio', { name: 'Blue' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('readme-presentation-settings')).penColor).toBe('blue'))
    // Drawing folds the options into one button; it opens them again.
    fireEvent.pointerDown(deck.querySelector('.presentation-ink'), { clientX: 50, clientY: 50, button: 0, pointerId: 1 })
    fireEvent.pointerUp(deck.querySelector('.presentation-ink'), { pointerId: 1 })
    expect(within(deck).queryByRole('radiogroup', { name: 'Pen mode' })).toBeNull()
    fireEvent.click(within(deck).getByRole('button', { name: /Pen options: Blue permanent ink/ }))
    expect(within(deck).getByRole('radiogroup', { name: 'Pen mode' })).toBeInTheDocument()
    fireEvent.keyDown(deck, { key: 'l' })
    expect(within(deck).getByRole('button', { name: 'Laser pointer' })).toHaveAttribute('aria-pressed', 'true')
    expect(deck).toHaveClass('has-tool-laser')
    // Escape puts the tool away before it exits.
    fireEvent.keyDown(deck, { key: 'Escape' })
    expect(deck).not.toHaveClass('has-tool-laser')

    // Blank screen.
    fireEvent.keyDown(deck, { key: 'b' })
    fireEvent.click(await screen.findByRole('button', { name: /Screen blanked/ }))
    expect(screen.queryByRole('button', { name: /Screen blanked/ })).toBeNull()
    fireEvent.keyDown(deck, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Presentation/ })).toBeNull())

    // Settings → Presentation changes the defaults.
    fireEvent.click(screen.getByRole('button', { name: 'Settings', exact: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Presentation' }))
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'New slide at' }), { target: { value: '2' } })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Pen mode' }), { target: { value: 'permanent' } })
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Laser colour' })).getByRole('radio', { name: 'Green' }))
    const saved = JSON.parse(localStorage.getItem('readme-presentation-settings'))
    expect(saved).toMatchObject({ splitLevel: 2, penMode: 'permanent', laserColor: 'green' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Present document as slides' }))
    const again = await screen.findByRole('dialog', { name: /Presentation, slide 1 of 4/ })
    fireEvent.click(within(again).getByRole('button', { name: 'Pen' }))
    expect(within(within(again).getByRole('radiogroup', { name: 'Pen mode' })).getByRole('radio', { name: 'Permanent' })).toBeChecked()
    expect(within(within(again).getByRole('radiogroup', { name: 'Pen colour' })).getByRole('radio', { name: 'Blue' })).toBeChecked()
  })

  it('closes the highlights popover with its button and with a click outside', async () => {
    window.getSelection = vi.fn(() => ({ toString: () => '', removeAllRanges() {} }))
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Highlights and notes' }))
    open()
    expect(await screen.findByRole('dialog', { name: 'Highlights and notes' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close highlights and notes' }))
    expect(screen.queryByRole('dialog', { name: 'Highlights and notes' })).toBeNull()
    open()
    const popover = await screen.findByRole('dialog', { name: 'Highlights and notes' })
    fireEvent.pointerDown(popover) // clicks inside keep it open
    fireEvent.mouseOver(document.body) // hovering out doesn't close it
    expect(screen.getByRole('dialog', { name: 'Highlights and notes' })).toBeInTheDocument()
    fireEvent.pointerDown(document.querySelector('.book-page'))
    expect(screen.queryByRole('dialog', { name: 'Highlights and notes' })).toBeNull()
  })

  it('ships a Markdown Guide template that covers every supported feature', async () => {
    const { MD_TEMPLATES } = await import('../templates.js')
    const guide = MD_TEMPLATES.find(template => template.id === 'markdown-guide')
    expect(guide).toBeTruthy()
    for (const piece of ['---\ntitle:', '###### Heading 6', '**Bold**', '~~strikethrough~~', '==highlight==', '[Inline link]', '![', '- [x] Done',
      '| :----------- | :------: |', '> > And quotes', '> [!CAUTION]', '```javascript', '```mermaid', '$E = mc^2$', '[^1]:', '\\*not italic', '???']) {
      expect(guide.content).toContain(piece)
    }
    // The figure image is an inline data URL, so the guide works offline.
    expect(guide.content).toMatch(/!\[[^\]]+\]\(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+ "The title shows on hover"\)/)
  })

  it('builds a landscape presentation PDF: a centred page per slide, same text size', async () => {
    const { buildPresentationPdfDefinition } = await import('../pdfExport.js')
    const def = await buildPresentationPdfDefinition(['# Deck\n\nIntro', '## Two\n\n- a\n- b', '## Three\n\n| A |\n| - |\n| 1 |'], { title: 'Deck', accent: '#123456', options: { diagrams: false } })
    expect(def.pageSize).toEqual({ width: 960, height: 540 })
    expect(def.content).toHaveLength(3)
    // Every slide after the first starts a new page, unless the page is still empty.
    const ink = [{ text: 'something' }]
    expect(def.pageBreakBefore(def.content[0], { getPreviousNodesOnPage: () => ink })).toBe(false)
    expect(def.pageBreakBefore(def.content[1], { getPreviousNodesOnPage: () => ink })).toBe(true)
    expect(def.pageBreakBefore(def.content[1], { getPreviousNodesOnPage: () => [{ stack: [] }] })).toBe(false)
    // Each slide is one full-height cell with its content centred vertically, like presentation mode.
    const cell = def.content[0].table.body[0][0]
    expect(cell.verticalAlignment).toBe('middle')
    expect(def.content[0].table.heights[0]).toBeGreaterThan(300)
    // Slide text is larger than document text.
    expect(def.defaultStyle.fontSize).toBeGreaterThan(14)
    const frame = def.background().canvas[1]
    expect(frame).toMatchObject({ lineColor: '#123456', r: expect.any(Number) })
    expect(def.footer(2, 3).text).toBe('2 / 3')
  })

  it('lays out PowerPoint slides: title, text and visuals', async () => {
    const { describeSlide } = await import('../pptxExport.js')
    const slide = describeSlide('## Plan\n\nIntro **bold**\n\n- one\n- two\n\n1. first\n\n- [x] done\n\n> [!TIP] Hint\n> Be brief\n\n```js\nlet a = 1\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```mermaid\ngraph TD; A-->B\n```\n\n![Logo](https://example.com/a.png)')
    expect(slide.title).toBe('Plan')
    expect(slide.text).toContain('Intro |bold')
    expect(slide.text).toContain('☑ |done')
    expect(slide.text).toContain('Hint|Be brief')
    expect(slide.text).toContain('let a = 1')
    expect(slide.bullets).toBe(3)
    expect(slide.visuals).toEqual(['table', 'mermaid', 'image'])
    const { firstParagraphPropsOnly } = await import('../pptxExport.js')
    expect(firstParagraphPropsOnly('<a:p><a:pPr marL="1"><a:buChar char="•"/></a:pPr><a:r><a:t>a</a:t></a:r><a:pPr indent="0"><a:buNone/></a:pPr><a:r><a:t>b</a:t></a:r></a:p>'))
      .toBe('<a:p><a:pPr marL="1"><a:buChar char="•"/></a:pPr><a:r><a:t>a</a:t></a:r><a:r><a:t>b</a:t></a:r></a:p>')
  })

  it('converts Markdown to well-formed Confluence storage format', async () => {
    const { toConfluenceStorage, toConfluenceHtml, isWellFormedStorage } = await import('../confluenceExport.js')
    const md = [
      '---', 'title: Hidden', '---',
      '# Title & 1 < 2', '',
      'Some **bold**, *em*, ~~gone~~, `x < y`, a [link](https://example.com?a=1&b=2) and line  ', 'break.', '',
      '> [!WARNING] Careful', '> Do not do this.', '',
      '> Plain quote', '',
      '- [x] done', '- [ ] todo', '',
      '1. one', '2. two', '',
      '| A | B |', '| :- | -: |', '| 1 | 2 |', '',
      '```ts', 'const a = "]]>" && 1 < 2', '```', '',
      '```mermaid', 'graph TD; A-->B', '```', '',
      '![Logo](https://example.com/logo.png) ![Local](images/pic%20one.png)', '',
      'Press <kbd>Ctrl</kbd> + <kbd>S</kbd><br>now.', '',
      '$$', 'e = mc^2', '$$', '',
      'Note[^1].', '', '[^1]: The footnote.', '',
      '---',
    ].join('\n')
    const out = toConfluenceStorage(md)
    expect(isWellFormedStorage(out)).toBe(true)
    expect(out).not.toContain('Hidden')
    expect(out).toContain('<h1>Title &amp; 1 &lt; 2</h1>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<del>gone</del>')
    expect(out).toContain('<code>x &lt; y</code>')
    expect(out).toContain('<a href="https://example.com?a=1&amp;b=2">link</a>')
    expect(out).toContain('<br />')
    expect(out).toContain('<ac:structured-macro ac:name="note" ac:schema-version="1"><ac:parameter ac:name="title">Careful</ac:parameter><ac:rich-text-body><p>Do not do this.</p>')
    expect(out).toContain('<blockquote><p>Plain quote</p></blockquote>')
    expect(out).toContain('<ac:task-list><ac:task><ac:task-status>complete</ac:task-status><ac:task-body>done</ac:task-body></ac:task><ac:task><ac:task-status>incomplete</ac:task-status>')
    expect(out).toContain('<ol><li>one</li><li>two</li></ol>')
    expect(out).toContain('<th style="text-align: left;">A</th><th style="text-align: right;">B</th>')
    expect(out).toContain('<ac:parameter ac:name="language">typescript</ac:parameter>')
    expect(out).toContain('<![CDATA[const a = "]]]]><![CDATA[>" && 1 < 2]]>')
    expect(out).toContain('<ac:parameter ac:name="title">Mermaid diagram</ac:parameter>')
    expect(out).toContain('<ac:image ac:alt="Logo"><ri:url ri:value="https://example.com/logo.png" /></ac:image>')
    expect(out).toContain('<ri:attachment ri:filename="pic one.png" />')
    expect(out).toContain('<kbd>Ctrl</kbd> + <kbd>S</kbd><br />now.')
    expect(out).toContain('<ac:parameter ac:name="title">Math (LaTeX)</ac:parameter>')
    expect(out).toContain('<sup>[1]</sup>')
    expect(out).toContain('<li>The footnote.</li>')
    // The paste-friendly HTML has no Confluence macros.
    const html = toConfluenceHtml(md)
    expect(html).not.toContain('ac:')
    expect(html).toContain('<pre><code class="language-typescript">')
    expect(html).toContain('☑ done')
  })

  it('shows folders in a file tree and moves files between them', async () => {
    window.prompt = vi.fn()
    await writeWorkspace({ activeId: 'a', files: [
      { id: 'a', name: 'notes/plan.md', content: '# Plan' },
      { id: 'b', name: 'notes/ideas.md', content: '# Ideas' },
      { id: 'c', name: 'todo.md', content: '# Todo' },
    ] })
    installApp()
    await screen.findByRole('tab', { name: 'notes/plan.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    const tree = await screen.findByRole('tree', { name: 'Files' })
    expect(within(tree).getByRole('treeitem', { name: 'Folder notes' })).toHaveTextContent('2')
    const data = new Map()
    const dataTransfer = { setData: (k, v) => data.set(k, v), getData: k => data.get(k) || '', get types() { return [...data.keys()] }, effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(within(tree).getByRole('treeitem', { name: 'todo.md' }).querySelector('button'), { dataTransfer })
    const folderRow = within(tree).getByRole('treeitem', { name: 'Folder notes' }).querySelector('.file-tree-row')
    fireEvent.dragOver(folderRow, { dataTransfer })
    fireEvent.drop(folderRow, { dataTransfer })
    await waitFor(() => expect(screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-label'))).toContain('notes/todo.md'))
    fireEvent.click(within(tree).getByRole('button', { name: 'Rename folder notes' }))
    // The app's own dialog, not the browser's prompt.
    const rename = await screen.findByRole('dialog', { name: 'Rename folder' })
    expect(window.prompt).not.toHaveBeenCalled()
    fireEvent.change(within(rename).getByRole('textbox', { name: 'Folder name' }), { target: { value: 'archive' } })
    fireEvent.click(within(rename).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['archive/plan.md', 'archive/ideas.md', 'archive/todo.md'])))
  })

  it('renames files without touching the folder or the extension', async () => {
    await writeWorkspace({ activeId: 'a', files: [
      { id: 'a', name: 'notes/plan.md', content: '# Plan' },
      { id: 'b', name: 'notes/ideas.md', content: '# Ideas' },
    ] })
    installApp()
    // In the tab: only "plan" is editable; ".md" is shown beside it.
    fireEvent.doubleClick(within(await screen.findByRole('tab', { name: 'notes/plan.md' })).getByText('plan.md'))
    const input = screen.getByRole('textbox', { name: /Rename plan/ })
    expect(input).toHaveValue('plan')
    expect(input.parentElement).toHaveTextContent('.md')
    fireEvent.change(input, { target: { value: 'road/map' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('tab', { name: 'notes/road-map.md' })).toBeInTheDocument()
    // In the Files panel: the app's dialog shows the folder and extension as fixed text.
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    const tree = await screen.findByRole('tree', { name: 'Files' })
    fireEvent.click(within(tree).getByRole('button', { name: 'Rename notes/ideas.md' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename file' })
    const field = within(dialog).getByRole('textbox', { name: 'File name' })
    expect(field).toHaveValue('ideas')
    expect(dialog).toHaveTextContent('notes/')
    expect(dialog).toHaveTextContent('.md')
    fireEvent.change(field, { target: { value: 'road-map' } })
    expect(within(dialog).getByText(/already exists here/)).toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'backlog' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(await screen.findByRole('tab', { name: 'notes/backlog.md' })).toBeInTheDocument()
  })

  it('makes sub-folders up to three levels deep', async () => {
    await writeWorkspace({ activeId: 'a', files: [{ id: 'a', name: 'one.md', content: '# One' }] })
    installApp()
    await screen.findByRole('tab', { name: 'one.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    const tree = await screen.findByRole('tree', { name: 'Files' })
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    let dialog = await screen.findByRole('dialog', { name: 'New folder' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Folder name' }), { target: { value: 'a/b/c/d' } })
    expect(within(dialog).getByText('Folders can go up to 3 levels deep.')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Folder name' }), { target: { value: 'a' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create folder' }))
    // a → a/b → a/b/c through "New folder inside".
    for (const [parent, child] of [['a', 'b'], ['b', 'c']]) {
      fireEvent.click(await within(tree).findByRole('button', { name: `New folder inside ${parent}` }))
      dialog = await screen.findByRole('dialog', { name: 'New folder' })
      expect(dialog).toHaveTextContent(`Inside “`)
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Folder name' }), { target: { value: child } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create folder' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).toBeNull())
    }
    expect(within(tree).getByRole('treeitem', { name: 'Folder c' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('readme-empty-folders'))).toContain('a/b/c')
    // The third level can't get another folder inside it.
    expect(within(tree).queryByRole('button', { name: 'New folder inside c' })).toBeNull()
    expect(within(tree).getByRole('button', { name: 'New folder inside b' })).toBeInTheDocument()
  })

  it('pins up to five files, the last pinned first', async () => {
    await writeWorkspace({ activeId: 'f1', files: Array.from({ length: 7 }, (_, i) => ({ id: `f${i + 1}`, name: `f${i + 1}.md`, content: `# ${i + 1}` })) })
    installApp()
    await screen.findByRole('tab', { name: 'f1.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    const tree = await screen.findByRole('tree', { name: 'Files' })
    const order = () => screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-label').replace(', pinned', '*'))
    for (const n of [2, 5, 3]) fireEvent.click(within(tree).getByRole('button', { name: `Pin f${n}.md` }))
    // Newest pin first.
    expect(order().slice(0, 3)).toEqual(['f3.md*', 'f5.md*', 'f2.md*'])
    fireEvent.click(within(tree).getByRole('button', { name: 'Pin f7.md' }))
    fireEvent.click(within(tree).getByRole('button', { name: 'Pin f1.md' }))
    expect(order().filter(name => name.endsWith('*'))).toHaveLength(5)
    // A sixth pin is refused with a message.
    fireEvent.click(within(tree).getByRole('button', { name: 'Pin f4.md' }))
    expect(await screen.findByText(/You can pin up to 5 files/)).toBeInTheDocument()
    expect(order().filter(name => name.endsWith('*'))).toHaveLength(5)
    // Unpinning makes room.
    fireEvent.click(within(tree).getByRole('button', { name: 'Unpin f5.md' }))
    fireEvent.click(within(tree).getByRole('button', { name: 'Pin f4.md' }))
    expect(order()[0]).toBe('f4.md*')
  })

  it('creates an empty folder from its own dialog, without a file', async () => {
    window.prompt = vi.fn()
    await writeWorkspace({ activeId: 'a', files: [{ id: 'a', name: 'notes/plan.md', content: '# Plan' }] })
    installApp()
    await screen.findByRole('tab', { name: 'notes/plan.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    const tree = await screen.findByRole('tree', { name: 'Files' })
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    const input = within(dialog).getByRole('textbox', { name: 'Folder name' })
    expect(within(dialog).getByRole('button', { name: 'Create folder' })).toBeDisabled()
    fireEvent.change(input, { target: { value: 'notes' } })
    expect(within(dialog).getByText(/already exists/)).toBeInTheDocument()
    fireEvent.change(input, { target: { value: ' drafts / 2026 ' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).toBeNull())
    expect(window.prompt).not.toHaveBeenCalled()
    // The folder shows, empty, and no file was created.
    const drafts = within(tree).getByRole('treeitem', { name: 'Folder drafts' })
    expect(within(drafts).getByRole('treeitem', { name: 'Folder 2026' })).toHaveTextContent('0')
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('readme-empty-folders'))).toEqual(['drafts/2026'])
    // Escape cancels the dialog.
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await screen.findByRole('dialog', { name: 'New folder' })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).toBeNull())
    // An empty folder can be removed.
    fireEvent.click(within(tree).getByRole('button', { name: 'Remove empty folder 2026' }))
    await waitFor(() => expect(within(tree).queryByRole('treeitem', { name: 'Folder drafts' })).toBeNull())

    // Deleting a folder with files asks in the app's dialog and can be undone.
    fireEvent.click(within(tree).getByRole('button', { name: 'Delete folder notes' }))
    const ask = await screen.findByRole('alertdialog', { name: 'Delete folder?' })
    expect(ask).toHaveTextContent('Delete “notes” and the 1 file in it permanently?')
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('tab', { name: 'notes/plan.md' })).toBeInTheDocument()
    fireEvent.click(within(tree).getByRole('button', { name: 'Delete folder notes' }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Delete folder?' })).getByRole('button', { name: 'Delete folder and 1 file' }))
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'notes/plan.md' })).toBeNull())
    expect(within(tree).queryByRole('treeitem', { name: 'Folder notes' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('tab', { name: 'notes/plan.md' })).toBeInTheDocument()
  })

  it('keeps closed files in the file tree so they can be reopened, across reloads', async () => {
    await writeWorkspace({ activeId: 'a', files: [
      { id: 'a', name: 'keep.md', content: '# Keep' },
      { id: 'b', name: 'docs/closed.md', content: '# Closed body' },
    ], closed: [{ index: 2, file: { id: 'z', name: 'old.md', content: '# Old file' } }] })
    installApp()
    await screen.findByRole('tab', { name: 'keep.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Show file tree' }))
    const tree = await screen.findByRole('tree', { name: 'Files' })
    // Restored from the saved workspace.
    expect(within(tree).getByRole('treeitem', { name: 'old.md (closed)' })).toBeInTheDocument()
    // Closing a tab keeps the file listed (inside its folder).
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'docs/closed.md' }))
    fireEvent.click((await screen.findAllByRole('menuitem', { name: /^Close/ }))[0])
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'docs/closed.md' })).not.toBeInTheDocument())
    const folder = within(tree).getByRole('treeitem', { name: 'Folder docs' })
    expect(within(folder).getByRole('treeitem', { name: 'docs/closed.md (closed)' })).toBeInTheDocument()
    await waitFor(async () => expect((await readWorkspace()).closed.map(entry => entry.file.id)).toEqual(['z', 'b']))
    // Clicking it reopens the file with its content.
    fireEvent.click(within(folder).getByRole('button', { name: 'Reopen docs/closed.md' }))
    expect(await screen.findByRole('tab', { name: 'docs/closed.md' })).toBeInTheDocument()
    expect(within(tree).queryByRole('treeitem', { name: 'docs/closed.md (closed)' })).not.toBeInTheDocument()
    // Removing it from the list forgets it.
    fireEvent.click(within(tree).getByRole('button', { name: 'Remove old.md from the list' }))
    expect(within(tree).queryByRole('treeitem', { name: 'old.md (closed)' })).not.toBeInTheDocument()
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
    expect(within(dialog).getByText(/^Version \d+\.\d+$/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Versions' }))
    const { APP_VERSION, RELEASES } = await import('../version.js')
    expect(RELEASES[0].version).toBe(APP_VERSION)
    expect(within(dialog).getByText(`Version ${APP_VERSION}`)).toBeInTheDocument()
    expect(within(dialog).getByText('Current')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem').filter(item => item.classList.contains('release-item')).length).toBeLessThanOrEqual(5)
    fireEvent.click(within(dialog).getByRole('button', { name: 'About' }))
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
    for (const name of ['Sun', 'Monokai', 'Nord', 'Solarized', 'Marble']) expect(within(dialog).getByRole('radio', { name })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Monokai' }))
    await waitFor(() => expect(document.documentElement).toHaveClass('theme-monokai'))
    fireEvent.click(within(dialog).getByRole('switch', { name: /High contrast/ }))
    await waitFor(() => expect(document.documentElement).toHaveClass('high-contrast'))
    expect(document.documentElement).toHaveClass('theme-monokai')
    fireEvent.click(within(dialog).getByRole('switch', { name: /Additional themes/ }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass('theme-neon'))
  })

  it('opens with the default theme chosen in Settings', async () => {
    const { unmount } = installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appearance' }))
    const select = within(dialog).getByRole('combobox', { name: /Default theme/ })
    expect(select).toHaveValue('')
    fireEvent.change(select, { target: { value: 'marble' } })
    await waitFor(() => expect(document.documentElement).toHaveClass('theme-marble'))
    expect(within(dialog).getByRole('switch', { name: /Additional themes/ })).toBeChecked()
    expect(JSON.parse(localStorage.getItem('readme-app-settings')).defaultTheme).toBe('marble')
    unmount()
    // Last used was Dark, but the default theme wins on the next launch.
    localStorage.setItem('readme-theme', 'dark')
    installApp()
    await waitFor(() => expect(document.documentElement).toHaveClass('theme-marble'))
    expect(document.documentElement).not.toHaveClass('dark')
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

  it('jumps the contents bar between its smallest and largest width', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    const handle = await screen.findByRole('separator', { name: 'Resize contents' })
    const max = Math.max(230, Math.round(window.innerWidth * 0.3))
    fireEvent.click(screen.getByRole('button', { name: 'Widen contents' }))
    await waitFor(() => expect(Number(handle.getAttribute('aria-valuenow'))).toBe(max))
    fireEvent.click(screen.getByRole('button', { name: 'Narrow contents' }))
    await waitFor(() => expect(Number(handle.getAttribute('aria-valuenow'))).toBe(230))
    // From a width in between, the button widens.
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: 'Widen contents' })).toBeInTheDocument()
  })

  it('presents from a heading in the contents, and only bookmarked sections', async () => {
    installApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    const toc = document.querySelector('.toc-panel')
    fireEvent.click(await within(toc).findByRole('button', { name: 'Present from Tables' }))
    let show = await screen.findByRole('dialog', { name: /Presentation, slide/ })
    expect(within(show).getByRole('heading', { name: 'Tables' })).toBeInTheDocument()
    fireEvent.click(within(show).getByRole('button', { name: 'Previous slide' }))
    await waitFor(() => expect(within(show).getByRole('heading', { name: 'Code Example' })).toBeInTheDocument())
    fireEvent.keyDown(show, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Presentation/ })).toBeNull())

    expect(within(toc).getByRole('button', { name: 'Present bookmarked sections' })).toBeDisabled()
    fireEvent.click(within(toc).getByRole('button', { name: 'Bookmark Task List' }))
    fireEvent.click(within(toc).getByRole('button', { name: 'Bookmark Features' }))
    fireEvent.click(within(toc).getByRole('button', { name: 'Present bookmarked sections' }))
    show = await screen.findByRole('dialog', { name: /Bookmarked presentation, slide 1 of 2/ })
    expect(within(show).getByRole('heading', { name: 'Features' })).toBeInTheDocument()
    fireEvent.click(within(show).getByRole('button', { name: 'Next slide' }))
    await waitFor(() => expect(within(show).getByRole('heading', { name: 'Task List' })).toBeInTheDocument())
    expect(within(show).getByRole('button', { name: 'Next slide' })).toBeDisabled()
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
    for (const name of ['Heading 3', 'Numbered list', 'Task list', 'Table (insert or edit)', 'Code block', 'Image', 'Footnote', 'Callout']) {
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
