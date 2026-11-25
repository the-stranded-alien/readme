import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import App from '../App.jsx'
import { analyzeDocument } from '../documentAnalysis.js'
import { readWorkspace, writeWorkspace } from '../workspaceDb.js'

const { html2canvasMock, pdfSaveMock, pdfCloneStageClass } = vi.hoisted(() => ({
  html2canvasMock: vi.fn(),
  pdfSaveMock: vi.fn(),
  pdfCloneStageClass: { value: '' },
}))

vi.mock('html2canvas-pro', () => ({ default: html2canvasMock }))
vi.mock('jspdf', () => ({
  jsPDF: class {
    setProperties() {}
    setFillColor() {}
    rect() {}
    setFontSize() {}
    setTextColor() {}
    text() {}
    addPage() {}
    addImage() {}
    save(name) { pdfSaveMock(name) }
  },
}))

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

    fireEvent.click(screen.getByTitle('Open Markdown files or folders'))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('# Disk document'))
    fireEvent.click(screen.getByTitle('Save file in place (or choose a location)'))
    await waitFor(() => expect(write).toHaveBeenCalledWith('# Disk document'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('analyzes headings, counts, and normalized search text for the worker', () => {
    const analysis = analyzeDocument('# **Setup**\n\nRead [the guide](https://example.test) &amp; `code`.')
    expect(analysis.headings).toEqual([{ level: 1, text: 'Setup', id: 'setup' }])
    expect(analysis.wordCount).toBe(7)
    expect(analysis.lineCount).toBe(3)
    expect(analysis.searchIndex).toContain('the guide')
    expect(analysis.searchIndex).toContain('&')
  })

  it('returns analysis messages from the document worker', async () => {
    const testDir = dirname(fileURLToPath(import.meta.url))
    const workerSource = await readFile(resolve(testDir, '../workers/documentWorker.js'), 'utf8')
    const executableSource = workerSource.replace(/^import .*\n/, '')
    const workerScope = { postMessage: vi.fn() }
    runInNewContext(executableSource, { self: workerScope, analyzeDocument })
    workerScope.onmessage({ data: { id: 42, markdown: '# Worker title\nbody' } })
    expect(workerScope.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 42,
      headings: [{ level: 1, text: 'Worker title', id: 'worker-title' }],
      lineCount: 2,
    }))
  })

  it('caches the app shell and serves the cached page during offline navigation', async () => {
    const testDir = dirname(fileURLToPath(import.meta.url))
    const swPath = resolve(testDir, '../../public/sw.js')
    const manifestPath = resolve(testDir, '../../public/manifest.webmanifest')
    const source = await readFile(swPath, 'utf8')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')

    const listeners = {}
    const cachedPage = { body: 'cached app shell' }
    const cache = { addAll: vi.fn(async () => {}), match: vi.fn(async key => key === '/index.html' ? cachedPage : null), put: vi.fn(async () => {}) }
    const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['readme-shell-old', 'unrelated']), delete: vi.fn(async () => true), match: vi.fn(async key => cache.match(key)) }
    const serviceWorkerGlobal = { location: { origin: 'https://readme.test' }, clients: { claim: vi.fn() }, skipWaiting: vi.fn(), addEventListener: (type, fn) => { listeners[type] = fn } }
    runInNewContext(source, { self: serviceWorkerGlobal, caches, URL, Promise, fetch: async () => { throw new Error('offline') } })

    let installPromise
    listeners.install({ waitUntil: promise => { installPromise = promise } })
    await installPromise
    expect(cache.addAll).toHaveBeenCalledWith(['/', '/index.html', '/manifest.webmanifest'])
    let navigationResponse
    listeners.fetch({
      request: { method: 'GET', url: 'https://readme.test/guide', mode: 'navigate' },
      respondWith: promise => { navigationResponse = promise },
    })
    await expect(navigationResponse).resolves.toBe(cachedPage)
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
    fireEvent.click(screen.getByTitle('Read document aloud'))
    await waitFor(() => expect(speak).toHaveBeenCalledOnce())
    expect(speak.mock.calls[0][0].text).toContain('Welcome to ReadMe')
  })

  it('requests a screen wake lock only after the reader toggles it on', async () => {
    const sentinel = { released: false, release: vi.fn(async () => {}) }
    const request = vi.fn(async () => sentinel)
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    installApp()
    fireEvent.click(screen.getByTitle('Keep screen awake while reading'))
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
    window.getSelection = vi.fn(() => ({ toString: () => 'Welcome to ReadMe' }))
    installApp()
    fireEvent.mouseDown(screen.getByTitle('Save selected text as a highlight or note'))
    fireEvent.click(screen.getByTitle('Save selected text as a highlight or note'))
    fireEvent.change(await screen.findByPlaceholderText('Add a note (optional)'), { target: { value: 'Review this section' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(highlights.set).toHaveBeenCalledWith('readme-annotations', expect.any(window.Highlight)))
    fireEvent.click(screen.getByTitle('Reading notes (1)'))
    expect(await screen.findByText('“Welcome to ReadMe”')).toBeInTheDocument()
    expect(screen.getByText('Review this section')).toBeInTheDocument()
  })

  it('imports a public Markdown URL with fetch', async () => {
    window.prompt = vi.fn(() => 'https://example.test/remote.md')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '# Imported URL' })))
    installApp()
    fireEvent.click(screen.getByTitle('Import Markdown from URL'))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('# Imported URL'))
    expect(fetch).toHaveBeenCalledWith('https://example.test/remote.md')
  })

  it('keeps the live theme and scroll position unchanged while PDF capture runs', async () => {
    localStorage.setItem('readme-theme', 'dark')
    html2canvasMock.mockImplementation(async (_block, options) => {
      const clonedStage = { className: '', style: { opacity: '0' } }
      const clonedDocument = { getElementById: id => id === 'readme-pdf-staging' ? clonedStage : null }
      options.onclone(clonedDocument)
      pdfCloneStageClass.value = clonedStage.className
      return { width: 100, height: 80, toDataURL: () => 'data:image/png;base64,AA==' }
    })
    const { container } = installApp()
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
    const scroller = container.querySelector('.surface-preview.overflow-auto')
    scroller.scrollTop = 90
    const originalScrollTop = scroller.scrollTop
    window.HTMLElement.prototype.scrollIntoView.mockClear()

    fireEvent.click(screen.getByTitle('Download & export options'))
    fireEvent.click(await screen.findByText('Download as PDF'))
    await waitFor(() => expect(pdfSaveMock).toHaveBeenCalledOnce())

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('pdf-export-active')).toBe(false)
    expect(scroller.scrollTop).toBe(originalScrollTop)
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
    expect(pdfCloneStageClass.value).toBe('')
    expect(document.getElementById('readme-pdf-staging')).toBeNull()
  })
})
