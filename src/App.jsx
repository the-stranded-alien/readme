import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { codeTheme } from './codeTheme'
import {
  Sun, Moon, Upload, Copy, Check, FileText, Eye, Code2,
  X, Download, Maximize2, Minimize2, Hash, ChevronRight,
  List, AlignLeft, PanelLeftOpen, PanelLeftClose
} from 'lucide-react'

// ── Custom SVG icons ───────────────────────────────────────────
const SplitEqualIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1"  y="2" width="6" height="12" rx="1.5" fill="currentColor" opacity="0.6"/>
    <rect x="9"  y="2" width="6" height="12" rx="1.5" fill="currentColor" opacity="0.6"/>
  </svg>
)
const SplitWideIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1"   y="2" width="3.5" height="12" rx="1.5" fill="currentColor" opacity="0.45"/>
    <rect x="6.5" y="2" width="8.5" height="12" rx="1.5" fill="currentColor"/>
  </svg>
)

// ── View modes ─────────────────────────────────────────────────
const VIEW_MODES = [
  { id: 'editor',  label: 'Editor',  Icon: Code2,          edW: '100%', pvW: '0%'   },
  { id: 'split',   label: 'Split',   Icon: SplitEqualIcon, edW: '50%',  pvW: '50%'  },
  { id: 'focus',   label: 'Focus',   Icon: SplitWideIcon,  edW: '25%',  pvW: '75%'  },
  { id: 'preview', label: 'Preview', Icon: Eye,            edW: '0%',   pvW: '100%' },
]

// ── Sample markdown ────────────────────────────────────────────
const SAMPLE_MD = `# Welcome to ReadMe

> Paste or upload any **Markdown** file and get a beautiful, readable document instantly. No sign-up, no storage — everything stays in your browser.

## Features

- ✨ **Live preview** — changes render as you type
- 🎨 **Syntax highlighting** — 200+ languages with a custom theme
- 🌙 **Dark & light mode** — follows your system, or toggle manually
- 📤 **File upload** — drag & drop or click to upload any .md file
- 🗂️ **Document outline** — navigate sections with the TOC sidebar
- 📋 **Copy to clipboard** — one-click copy for every code block

---

## Code Example

\`\`\`typescript
interface Document {
  title: string
  content: string
  author: string
  createdAt: Date
}

async function renderDocument(doc: Document): Promise<string> {
  const { title, content, author } = doc
  const header = \`# \${title}\\n*by \${author}*\\n\`
  return header + '\\n' + content
}
\`\`\`

## Tables

| Feature        | Status  | Notes                    |
| -------------- | ------- | ------------------------ |
| GFM Tables     | ✅ Done | Full GitHub spec support |
| Strikethrough  | ✅ Done | ~~like this~~            |
| Task lists     | ✅ Done | See below                |

## Task List

- [x] Upload .md files
- [x] Syntax highlighting with custom theme
- [x] Dark mode
- [x] TOC sidebar navigation
- [ ] Export to PDF

## Inline Formatting

You can write \`inline code\`, **bold text**, *italic*, ~~strikethrough~~, and [external links](https://guptasahil.in).

---

*Made with ♥ by Sahil Gupta*
`

// ── Utility: extract headings ──────────────────────────────────
function extractHeadings(md) {
  return md.split('\n')
    .filter(l => /^#{1,3}\s/.test(l))
    .map(l => {
      const m = l.match(/^(#{1,3})\s+(.+)/)
      if (!m) return null
      const raw = m[2].replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').replace(/`([^`]+)`/g, '$1').trim()
      return {
        level: m[1].length,
        text: raw,
        id: raw.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
      }
    })
    .filter(Boolean)
}

// ── CopyButton ─────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }, [text])
  return (
    <button onClick={copy} className={`copy-btn ${copied ? 'copied' : ''}`}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── CodeBlock ──────────────────────────────────────────────────
function CodeBlock({ language, code }) {
  return (
    <div className="code-wrapper anim-slide-up">
      <div className="code-header" style={{ position: 'relative' }}>
        <div className="traffic-lights">
          <span className="tl tl-r" />
          <span className="tl tl-y" />
          <span className="tl tl-g" />
        </div>
        <span className="code-lang">{language || 'plaintext'}</span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={codeTheme}
        language={language || 'text'}
        PreTag="div"
        showLineNumbers={code.split('\n').length > 4}
        lineNumberStyle={{ color: '#2e3454', fontSize: '11px', minWidth: '2.5em', paddingRight: '12px', userSelect: 'none' }}
        customStyle={{
          margin: 0,
          padding: '20px 24px',
          background: '#0d0f1a',
          fontSize: '0.85rem',
          lineHeight: '1.8',
          overflowX: 'auto',
        }}
        codeTagProps={{ style: { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

// ── MarkdownRenderer ───────────────────────────────────────────
function MarkdownRenderer({ content }) {
  const components = useMemo(() => ({
    pre({ children }) { return <>{children}</> },
    code({ className, children }) {
      const match = /language-(\w+)/.exec(className || '')
      const str = String(children).replace(/\n$/, '')
      if (Boolean(match) || str.includes('\n')) {
        return <CodeBlock language={match?.[1]} code={str} />
      }
      return <code>{children}</code>
    },
    a({ href, children }) {
      return (
        <a href={href}
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        >{children}</a>
      )
    },
    input({ type, checked }) {
      if (type === 'checkbox') {
        return <input type="checkbox" checked={checked} readOnly style={{ marginRight: 6, cursor: 'default' }} />
      }
      return <input type={type} />
    },
    hr() {
      return <hr />
    },
    h1({ children }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return <h1 id={id}>{children}</h1>
    },
    h2({ children }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return <h2 id={id}>{children}</h2>
    },
    h3({ children }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return <h3 id={id}>{children}</h3>
    },
  }), [])

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
      {content}
    </ReactMarkdown>
  )
}

// ── TOC Sidebar ────────────────────────────────────────────────
function TocSidebar({ headings, activeId, onNavigate }) {
  if (!headings.length) return null
  return (
    <nav className="flex flex-col gap-0.5 py-2">
      {headings.map((h, i) => (
        <button
          key={`${h.id}-${i}`}
          onClick={() => onNavigate(h.id)}
          className={`toc-item anim-slide-up delay-${Math.min(i * 50, 200)}`}
          style={{
            paddingLeft: h.level === 1 ? 10 : h.level === 2 ? 18 : 28,
            opacity: h.level === 3 ? 0.8 : 1,
          }}
        >
          {h.level === 1 && <Hash size={9} className="shrink-0 opacity-50" />}
          {h.level === 2 && <span className="toc-dot shrink-0" />}
          {h.level === 3 && <ChevronRight size={8} className="shrink-0 opacity-40" />}
          <span className={`truncate ${h.level === 1 ? 'font-semibold text-[11.5px]' : 'text-[11px]'}`}>
            {h.text}
          </span>
        </button>
      ))}
    </nav>
  )
}

// ── PillSwitcher ───────────────────────────────────────────────
function PillSwitcher({ view, onChange }) {
  const containerRef = useRef(null)
  const btnRefs = useRef([])
  const [pill, setPill] = useState({ left: 4, width: 70, height: 30, top: 4 })

  useLayoutEffect(() => {
    const idx = VIEW_MODES.findIndex(v => v.id === view)
    const btn = btnRefs.current[idx]
    if (btn && containerRef.current) {
      const cr = containerRef.current.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      setPill({ left: br.left - cr.left, top: br.top - cr.top, width: br.width, height: br.height })
    }
  }, [view])

  return (
    <div ref={containerRef} className="pill-track hidden sm:flex">
      <div
        className="pill-indicator"
        style={{ left: pill.left, top: pill.top, width: pill.width, height: pill.height }}
      />
      {VIEW_MODES.map(({ id, label, Icon }, i) => (
        <button
          key={id}
          ref={el => (btnRefs.current[i] = el)}
          onClick={() => onChange(id)}
          className={`pill-btn ${view === id ? 'active' : ''}`}
          title={label}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const s = localStorage.getItem('readme-theme')
    return s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [content, setContent] = useState(SAMPLE_MD)
  const [view, setView] = useState('split')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [mobileTab, setMobileTab] = useState('preview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [tocVisible, setTocVisible] = useState(true)
  const [activeHeadingId, setActiveHeadingId] = useState(null)
  const [themeKey, setThemeKey] = useState(0) // forces icon re-render for animation

  const fileInputRef = useRef(null)
  const appRef = useRef(null)
  const previewScrollRef = useRef(null)

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('readme-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleTheme = useCallback(() => {
    setIsDark(d => !d)
    setThemeKey(k => k + 1)
  }, [])

  // Fullscreen
  useEffect(() => {
    const cb = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', cb)
    return () => document.removeEventListener('fullscreenchange', cb)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) await appRef.current?.requestFullscreen?.()
    else await document.exitFullscreen?.()
  }, [])

  // TOC headings
  const headings = useMemo(() => extractHeadings(content), [content])

  // Active heading via IntersectionObserver
  useEffect(() => {
    if (!previewScrollRef.current) return
    const els = previewScrollRef.current.querySelectorAll('h1[id],h2[id],h3[id]')
    if (!els.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length) setActiveHeadingId(visible[0].target.id)
      },
      { root: previewScrollRef.current, rootMargin: '-10% 0% -70% 0%', threshold: 0 }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [content, view, mobileTab])

  const navigateToHeading = useCallback((id) => {
    const el = previewScrollRef.current?.querySelector(`#${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // File handling
  const handleFile = useCallback((file) => {
    if (!file) return
    if (!/\.(md|markdown|txt)$/.test(file.name)) return alert('Please upload a .md, .markdown, or .txt file')
    const reader = new FileReader()
    reader.onload = (e) => { setContent(e.target.result); setFileName(file.name); setMobileTab('preview') }
    reader.readAsText(file)
  }, [])

  const handleDrop     = useCallback((e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]) }, [handleFile])
  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave= useCallback((e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }, [])

  const handleDownload = useCallback(() => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type: 'text/markdown' })),
      download: fileName || 'document.md',
    })
    a.click(); URL.revokeObjectURL(a.href)
  }, [content, fileName])

  const [copyAllDone, setCopyAllDone] = useState(false)
  const handleCopyAll = useCallback(async () => {
    await navigator.clipboard.writeText(content)
    setCopyAllDone(true)
    setTimeout(() => setCopyAllDone(false), 2000)
  }, [content])

  const wordCount = useMemo(() => content.trim() ? content.trim().split(/\s+/).length : 0, [content])
  const lineCount = useMemo(() => content.split('\n').length, [content])

  const showEditor  = view !== 'preview'
  const showPreview = view !== 'editor'
  const editorWidth  = VIEW_MODES.find(v => v.id === view)?.edW ?? '50%'
  const previewWidth = VIEW_MODES.find(v => v.id === view)?.pvW ?? '50%'

  // TOC visible: default on in preview/focus, off in split (space constrained)
  useEffect(() => {
    setTocVisible(view === 'preview' || view === 'focus')
  }, [view])

  return (
    <div
      ref={appRef}
      className="h-screen flex flex-col app-shell overflow-hidden anim-fade-in"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >

      {/* ── Drag overlay ─────────────────────────────────── */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center anim-drop-in"
          style={{ background: 'rgba(124,58,237,0.08)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl px-14 py-12 text-center"
            style={{ background: 'var(--bg-preview)', border: '2px dashed var(--accent)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--accent-soft)' }}>
              <Upload size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Drop your Markdown file</p>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>.md · .markdown · .txt</p>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────── */}
      <header className="no-print shrink-0 z-40 surface-header header-blur">
        <div className="px-4 sm:px-5 h-14 flex items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0 select-none">
            <div className="w-7 h-7 rounded-lg logo-glow flex items-center justify-center">
              <FileText size={14} className="text-white" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-1)' }}>
              Read<span style={{ color: 'var(--accent)' }}>Me</span>
            </span>
          </div>

          {/* View switcher */}
          <PillSwitcher view={view} onChange={setView} />

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            {/* File badge */}
            {fileName && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 mr-1.5 rounded-full text-xs font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                <FileText size={10} />
                <span className="max-w-[120px] truncate">{fileName}</span>
                <button onClick={() => { setFileName(null); setContent('') }}
                  className="cursor-pointer opacity-70 hover:opacity-100 ml-0.5">
                  <X size={9} />
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />

            <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
              <Upload size={13} />
              <span className="hidden sm:inline">Upload</span>
            </button>

            <button onClick={handleDownload} title="Download .md" className="btn-icon">
              <Download size={15} />
            </button>

            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="btn-icon hidden sm:flex">
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'} className="btn-icon"
              key={themeKey}>
              {isDark
                ? <Sun size={15} className="theme-icon-enter" style={{ color: '#fbbf24' }} />
                : <Moon size={15} className="theme-icon-enter" />
              }
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className="sm:hidden no-print shrink-0 flex"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-editor)' }}>
        {['editor', 'preview'].map(tab => (
          <button key={tab} onClick={() => setMobileTab(tab)}
            className="flex-1 py-2.5 text-xs font-medium capitalize cursor-pointer transition-colors"
            style={{
              color: mobileTab === tab ? 'var(--accent)' : 'var(--text-4)',
              borderBottom: mobileTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Main ─────────────────────────────────────────── */}
      <main className="flex-1 flex min-h-0">

        {/* Editor pane */}
        <div
          className={`flex-col min-h-0 overflow-hidden
            ${mobileTab === 'editor' ? '!flex w-full' : 'hidden sm:flex'}
          `}
          style={{
            width: editorWidth,
            display: !showEditor ? 'none' : undefined,
            transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Editor toolbar */}
          <div className="no-print shrink-0 flex items-center justify-between px-4 py-2 surface-toolbar">
            <div className="flex items-center gap-2">
              <AlignLeft size={12} style={{ color: 'var(--text-4)' }} />
              <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'var(--text-4)' }}>
                Markdown
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-4)' }}>
                {lineCount} lines · {wordCount} words
              </span>
              <button onClick={() => setContent('')} title="Clear"
                className="cursor-pointer transition-colors"
                style={{ color: 'var(--text-4)' }}
                onMouseOver={e => e.currentTarget.style.color = '#f38ba8'}
                onMouseOut={e => e.currentTarget.style.color = 'var(--text-4)'}>
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Textarea with grid pattern */}
          <div className="flex-1 overflow-auto surface-editor grid-pattern"
            style={{ borderRight: '1px solid var(--border)' }}>
            <textarea
              className="editor-textarea"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={'# Start typing Markdown…\n\nOr drag & drop a .md file anywhere.'}
              spellCheck={false}
            />
          </div>
        </div>

        {/* Preview pane */}
        <div
          className={`flex-col min-h-0
            ${mobileTab === 'preview' ? '!flex flex-1' : 'hidden sm:flex'}
          `}
          style={{
            width: previewWidth,
            display: !showPreview ? 'none' : undefined,
            transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Preview toolbar */}
          <div className="no-print shrink-0 flex items-center justify-between px-4 py-2 surface-toolbar">
            <div className="flex items-center gap-2">
              {/* TOC toggle */}
              <button
                onClick={() => setTocVisible(v => !v)}
                title={tocVisible ? 'Hide outline' : 'Show outline'}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-all text-[10px] font-medium"
                style={{
                  background: tocVisible ? 'var(--accent-soft)' : 'transparent',
                  color: tocVisible ? 'var(--accent)' : 'var(--text-4)',
                  border: '1px solid',
                  borderColor: tocVisible ? 'var(--accent-border)' : 'transparent',
                }}
              >
                {tocVisible ? <PanelLeftClose size={11} /> : <PanelLeftOpen size={11} />}
                <span className="hidden sm:inline">Outline</span>
              </button>

              <Eye size={12} style={{ color: 'var(--text-4)' }} />
              <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'var(--text-4)' }}>
                Preview
              </span>
            </div>

            <button onClick={handleCopyAll}
              className="flex items-center gap-1 text-[10px] font-medium cursor-pointer transition-colors"
              style={{ color: copyAllDone ? '#a6e3a1' : 'var(--text-4)' }}>
              {copyAllDone ? <Check size={11} /> : <Copy size={11} />}
              <span className="hidden sm:inline">{copyAllDone ? 'Copied!' : 'Copy MD'}</span>
            </button>
          </div>

          {/* Preview body: TOC + content */}
          <div className="flex-1 flex min-h-0">

            {/* TOC sidebar */}
            <div
              className="shrink-0 overflow-y-auto surface-toc"
              style={{
                width: tocVisible ? 220 : 0,
                opacity: tocVisible ? 1 : 0,
                overflow: tocVisible ? 'auto' : 'hidden',
                transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
              }}
            >
              {tocVisible && headings.length > 0 && (
                <div className="py-3 px-2">
                  <div className="flex items-center gap-2 px-2 pb-2 mb-1"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <List size={11} style={{ color: 'var(--text-4)' }} />
                    <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'var(--text-4)' }}>
                      Contents
                    </span>
                  </div>
                  <TocSidebar
                    headings={headings}
                    activeId={activeHeadingId}
                    onNavigate={navigateToHeading}
                  />
                </div>
              )}
              {tocVisible && headings.length === 0 && (
                <div className="py-6 px-4 text-center">
                  <p className="text-[11px]" style={{ color: 'var(--text-4)' }}>
                    No headings found
                  </p>
                </div>
              )}
            </div>

            {/* Scrollable content area */}
            <div ref={previewScrollRef}
              className="flex-1 overflow-auto surface-preview">
              {content.trim() ? (
                <div className="px-6 sm:px-10 md:px-14 py-10 max-w-[800px] mx-auto">
                  <div className="rm-prose anim-slide-up">
                    <MarkdownRenderer content={content} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-8 anim-fade-in">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                    style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
                    <FileText size={26} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="text-base font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    Nothing to preview
                  </p>
                  <p className="text-sm max-w-xs" style={{ color: 'var(--text-4)', lineHeight: 1.6 }}>
                    Start typing in the editor, or upload a .md file above.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="no-print shrink-0" style={{ background: 'var(--bg-header)', borderTop: '1px solid var(--border)' }}>
        <div className="px-4 sm:px-5 h-8 flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>
            Drop a .md file anywhere to open it
          </span>
          <a href="https://guptasahil.in" target="_blank" rel="noopener noreferrer"
            className="text-[10px] transition-colors"
            style={{ color: 'var(--text-4)' }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--text-4)'}>
            guptasahil.in
          </a>
        </div>
      </footer>
    </div>
  )
}
