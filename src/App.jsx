import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { darkTheme, lightTheme } from './codeTheme'
import {
  Sun, Moon, Upload, Copy, Check, FileText, Eye, Code2,
  X, Download, Maximize2, Minimize2, Hash, ChevronRight,
  List, AlignLeft, PanelLeftOpen, PanelLeftClose,
  Bold, Italic, Strikethrough, Link, Code, Minus,
  WrapText, ArrowUp, Heading1, Heading2, Quote,
} from 'lucide-react'

// ── useIsDark — subscribes to <html class="dark"> ─────────────
function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// ── Custom view icons ──────────────────────────────────────────
const SplitEqualIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="2" width="6" height="12" rx="1.5" fill="currentColor" opacity=".55"/>
    <rect x="9" y="2" width="6" height="12" rx="1.5" fill="currentColor" opacity=".55"/>
  </svg>
)
const SplitWideIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="1"   y="2" width="3.5" height="12" rx="1.5" fill="currentColor" opacity=".4"/>
    <rect x="6.5" y="2" width="8.5" height="12" rx="1.5" fill="currentColor"/>
  </svg>
)

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
- 🎨 **Syntax highlighting** — 200+ languages, light & dark themes
- 🌙 **Dark & light mode** — follows your system, or toggle manually
- 📤 **File upload** — drag & drop or click to upload any .md file
- 🗂️ **Document outline** — navigate sections with the TOC sidebar
- ✏️ **Formatting toolbar** — quick markdown insertion buttons

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
  return \`# \${title}\\n*by \${author}*\\n\\n\${content}\`
}
\`\`\`

## Tables

| Feature          | Status  | Notes                    |
| ---------------- | ------- | ------------------------ |
| GFM Tables       | ✅ Done | Full GitHub spec         |
| Strikethrough    | ✅ Done | ~~like this~~            |
| Task lists       | ✅ Done | See below                |
| Syntax highlight | ✅ Done | Light + dark themes      |

## Task List

- [x] Upload .md files
- [x] Syntax highlighting — light & dark
- [x] TOC sidebar navigation
- [x] Formatting toolbar
- [ ] Export to PDF

## Inline Formatting

Write \`inline code\`, **bold**, *italic*, ~~strikethrough~~, and [links](https://guptasahil.in).

---

*Made with ♥ by Sahil Gupta*
`

// ── Extract headings from markdown ────────────────────────────
function extractHeadings(md) {
  return md.split('\n')
    .filter(l => /^#{1,3}\s/.test(l))
    .map(l => {
      const m = l.match(/^(#{1,3})\s+(.+)/)
      if (!m) return null
      const raw = m[2]
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim()
      return {
        level: m[1].length,
        text: raw,
        id: raw.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
      }
    })
    .filter(Boolean)
}

// ── Markdown formatting helpers ────────────────────────────────
function applyFormat(value, selStart, selEnd, before, after = '') {
  const selected = value.substring(selStart, selEnd) || 'text'
  const replacement = before + selected + after
  return {
    value: value.substring(0, selStart) + replacement + value.substring(selEnd),
    cursor: [selStart + before.length, selStart + before.length + selected.length],
  }
}

function applyBlockFormat(value, selStart, before) {
  // prefix the current line
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1
  const lineEnd = value.indexOf('\n', selStart)
  const end = lineEnd === -1 ? value.length : lineEnd
  const line = value.substring(lineStart, end)
  // toggle: if line already starts with prefix, remove it
  if (line.startsWith(before)) {
    const stripped = line.slice(before.length)
    return {
      value: value.substring(0, lineStart) + stripped + value.substring(end),
      cursor: [lineStart + stripped.length, lineStart + stripped.length],
    }
  }
  return {
    value: value.substring(0, lineStart) + before + line + value.substring(end),
    cursor: [lineStart + before.length + line.length, lineStart + before.length + line.length],
  }
}

// ── CopyButton ─────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])
  return (
    <button onClick={copy} className={`copy-btn ${copied ? 'copied' : ''}`}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── CodeBlock ──────────────────────────────────────────────────
function CodeBlock({ rawLang, code }) {
  const dark    = useIsDark()
  const [wrapped, setWrapped] = useState(false)
  const [showFade, setShowFade] = useState(false)
  const scrollRef = useRef(null)

  // Parse "language:filename.ext" or just "language"
  const colonIdx = (rawLang || '').indexOf(':')
  const language = colonIdx > -1 ? rawLang.slice(0, colonIdx) : (rawLang || '')
  const filename  = colonIdx > -1 ? rawLang.slice(colonIdx + 1) : null

  const theme  = dark ? darkTheme  : lightTheme
  const codeBg = dark ? '#0c0e1c'  : '#f0f1f7'
  const lnColor= dark ? '#252b48'  : '#bcc1d8'

  // Show right-fade when content overflows
  useEffect(() => {
    if (wrapped) { setShowFade(false); return }
    const el = scrollRef.current?.querySelector('pre, div[class*="language"]')
    if (!el) return
    const check = () => setShowFade(el.scrollWidth > el.clientWidth)
    check()
    const obs = new ResizeObserver(check)
    obs.observe(el)
    return () => obs.disconnect()
  }, [code, wrapped])

  const lineCount = code.split('\n').length

  return (
    <div className="code-wrapper anim-slide-up">
      {/* Header */}
      <div className="code-header">
        <div className="traffic-lights">
          <span className="tl tl-r"/>
          <span className="tl tl-y"/>
          <span className="tl tl-g"/>
        </div>

        <div className="code-filelang">
          {filename
            ? <>
                <span style={{ opacity: .55 }}>{language}</span>
                <span className="code-filename">{filename}</span>
              </>
            : <span>{language || 'plaintext'}</span>
          }
        </div>

        <div className="code-actions">
          {lineCount > 3 && (
            <button
              onClick={() => setWrapped(w => !w)}
              className={`wrap-btn ${wrapped ? 'active' : ''}`}
              title={wrapped ? 'Disable word wrap' : 'Enable word wrap'}
            >
              <WrapText size={12} />
            </button>
          )}
          <CopyButton text={code} />
        </div>
      </div>

      {/* Code body */}
      <div className="code-body" ref={scrollRef}>
        <SyntaxHighlighter
          style={theme}
          language={language || 'text'}
          PreTag="div"
          showLineNumbers={lineCount > 4}
          wrapLongLines={wrapped}
          lineNumberStyle={{ color: lnColor, fontSize: '11px', minWidth: '2.25em', paddingRight: '14px', userSelect: 'none', flexShrink: 0 }}
          customStyle={{
            margin: 0, borderRadius: 0,
            padding: lineCount > 4 ? '18px 20px 18px 16px' : '18px 22px',
            background: codeBg, fontSize: '.855rem',
            lineHeight: '1.8', overflowX: wrapped ? 'hidden' : 'auto',
          }}
          codeTagProps={{ style: { fontFamily: "'JetBrains Mono','Fira Code',monospace" } }}
        >
          {code}
        </SyntaxHighlighter>
        {showFade && !wrapped && <div className="code-fade-right" />}
      </div>
    </div>
  )
}

// ── MarkdownRenderer ───────────────────────────────────────────
function MarkdownRenderer({ content }) {
  const components = useMemo(() => ({
    pre({ children }) { return <>{children}</> },

    code({ className, children }) {
      // Support "language-ts:filename.ts" notation
      const raw = (className || '').replace('language-', '')
      const str = String(children).replace(/\n$/, '')
      const isBlock = Boolean(raw) || str.includes('\n')
      if (isBlock) return <CodeBlock rawLang={raw} code={str} />
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
      if (type === 'checkbox')
        return <input type="checkbox" checked={checked} readOnly style={{ marginRight: 6, cursor: 'default' }} />
      return <input type={type} />
    },

    hr() { return <hr /> },

    // Headings with hover-anchor links
    h1({ children }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return (
        <h1 id={id}>
          {children}
          <a href={`#${id}`} className="heading-anchor" aria-label="Link to section">
            <Hash size={14} />
          </a>
        </h1>
      )
    },
    h2({ children }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return (
        <h2 id={id}>
          {children}
          <a href={`#${id}`} className="heading-anchor" aria-label="Link to section">
            <Hash size={13} />
          </a>
        </h2>
      )
    },
    h3({ children }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return (
        <h3 id={id}>
          {children}
          <a href={`#${id}`} className="heading-anchor" aria-label="Link to section">
            <Hash size={12} />
          </a>
        </h3>
      )
    },
  }), [])

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
      {content}
    </ReactMarkdown>
  )
}

// ── TOCSidebar ─────────────────────────────────────────────────
function TocSidebar({ headings, activeId, onNavigate }) {
  if (!headings.length) return (
    <div className="py-8 text-center" style={{ color: 'var(--text-4)', fontSize: 11 }}>
      No headings found
    </div>
  )
  return (
    <nav className="flex flex-col gap-0.5 py-2">
      {headings.map((h, i) => (
        <button
          key={`${h.id}-${i}`}
          onClick={() => onNavigate(h.id)}
          className={`toc-item anim-slide-left ${activeId === h.id ? 'active' : ''}`}
          style={{
            paddingLeft: h.level === 1 ? 10 : h.level === 2 ? 18 : 28,
            animationDelay: `${Math.min(i * 30, 180)}ms`,
          }}
        >
          {h.level === 1 && <Hash size={9} style={{ opacity: .5, flexShrink: 0 }} />}
          {h.level === 2 && <span className="toc-dot" />}
          {h.level === 3 && <ChevronRight size={8} style={{ opacity: .35, flexShrink: 0 }} />}
          <span className="truncate" style={{ fontSize: h.level === 1 ? 12 : 11, fontWeight: h.level === 1 ? 600 : 400 }}>
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
  const [pill, setPill] = useState({ left: 4, width: 72, height: 29, top: 3 })

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
      <div className="pill-indicator" style={pill} />
      {VIEW_MODES.map(({ id, label, Icon }, i) => (
        <button key={id} ref={el => (btnRefs.current[i] = el)}
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

// ── FormattingToolbar ──────────────────────────────────────────
const FMT_ACTIONS = [
  { label: 'Heading 1', Icon: Heading1,    mode: 'block',  before: '# '  },
  { label: 'Heading 2', Icon: Heading2,    mode: 'block',  before: '## ' },
  null,
  { label: 'Bold',      Icon: Bold,        mode: 'wrap',   before: '**',  after: '**' },
  { label: 'Italic',    Icon: Italic,      mode: 'wrap',   before: '*',   after: '*'  },
  { label: 'Strike',    Icon: Strikethrough,mode:'wrap',   before: '~~',  after: '~~' },
  null,
  { label: 'Link',      Icon: Link,        mode: 'wrap',   before: '[',   after: '](url)' },
  { label: 'Inline code',Icon: Code,       mode: 'wrap',   before: '`',   after: '`'  },
  { label: 'Blockquote',Icon: Quote,       mode: 'block',  before: '> '  },
  { label: 'List item', Icon: List,        mode: 'block',  before: '- '  },
  null,
  { label: 'Divider',   Icon: Minus,       mode: 'insert', text: '\n---\n' },
]

function FormattingToolbar({ textareaRef, content, onChange }) {
  const apply = useCallback((action) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd

    let result
    if (action.mode === 'insert') {
      result = {
        value: content.substring(0, start) + action.text + content.substring(end),
        cursor: [start + action.text.length, start + action.text.length],
      }
    } else if (action.mode === 'block') {
      result = applyBlockFormat(content, start, action.before)
    } else {
      result = applyFormat(content, start, end, action.before, action.after || '')
    }

    onChange(result.value)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(result.cursor[0], result.cursor[1])
    })
  }, [content, onChange, textareaRef])

  return (
    <div className="fmt-toolbar no-print">
      {FMT_ACTIONS.map((action, i) =>
        action === null
          ? <div key={`sep-${i}`} className="fmt-divider" />
          : (
            <button
              key={action.label}
              onClick={() => apply(action)}
              title={action.label}
              className="fmt-btn"
            >
              <action.Icon size={13} />
            </button>
          )
      )}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const s = localStorage.getItem('readme-theme')
    return s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [content, setContent]       = useState(SAMPLE_MD)
  const [view, setView]             = useState('split')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName]     = useState(null)
  const [mobileTab, setMobileTab]   = useState('preview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [tocVisible, setTocVisible] = useState(true)
  const [activeHeadingId, setActiveHeadingId] = useState(null)
  const [showScrollTop, setShowScrollTop]     = useState(false)
  const [themeKey, setThemeKey]     = useState(0)
  const [copyAllDone, setCopyAllDone] = useState(false)

  const fileInputRef    = useRef(null)
  const appRef          = useRef(null)
  const textareaRef     = useRef(null)
  const previewScrollRef= useRef(null)

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

  // TOC
  const headings = useMemo(() => extractHeadings(content), [content])

  // Active heading via IntersectionObserver
  useEffect(() => {
    if (!previewScrollRef.current) return
    const els = previewScrollRef.current.querySelectorAll('h1[id],h2[id],h3[id]')
    if (!els.length) return
    const obs = new IntersectionObserver(
      entries => {
        const vis = entries.filter(e => e.isIntersecting)
        if (vis.length) setActiveHeadingId(vis[0].target.id)
      },
      { root: previewScrollRef.current, rootMargin: '-8% 0% -72% 0%', threshold: 0 }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [content, view, mobileTab])

  const navigateToHeading = useCallback((id) => {
    previewScrollRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Scroll-to-top in preview
  useEffect(() => {
    const el = previewScrollRef.current
    if (!el) return
    const onScroll = () => setShowScrollTop(el.scrollTop > 320)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [view, mobileTab])

  // File handling
  const handleFile = useCallback((file) => {
    if (!file) return
    if (!/\.(md|markdown|txt)$/.test(file.name)) return alert('Please upload a .md, .markdown, or .txt file')
    const reader = new FileReader()
    reader.onload = e => { setContent(e.target.result); setFileName(file.name); setMobileTab('preview') }
    reader.readAsText(file)
  }, [])

  const handleDrop      = useCallback(e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]) }, [handleFile])
  const handleDragOver  = useCallback(e => { e.preventDefault(); setIsDragging(true)  }, [])
  const handleDragLeave = useCallback(e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }, [])

  const handleDownload = useCallback(() => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type: 'text/markdown' })),
      download: fileName || 'document.md',
    })
    a.click(); URL.revokeObjectURL(a.href)
  }, [content, fileName])

  const handleCopyAll = useCallback(async () => {
    await navigator.clipboard.writeText(content)
    setCopyAllDone(true)
    setTimeout(() => setCopyAllDone(false), 2000)
  }, [content])

  const wordCount   = useMemo(() => content.trim() ? content.trim().split(/\s+/).length : 0, [content])
  const lineCount   = useMemo(() => content.split('\n').length, [content])
  const readingTime = useMemo(() => Math.max(1, Math.ceil(wordCount / 220)), [wordCount])

  const showEditor  = view !== 'preview'
  const showPreview = view !== 'editor'
  const editorWidth  = VIEW_MODES.find(v => v.id === view)?.edW ?? '50%'
  const previewWidth = VIEW_MODES.find(v => v.id === view)?.pvW ?? '50%'

  useEffect(() => { setTocVisible(view === 'preview' || view === 'focus') }, [view])

  return (
    <div
      ref={appRef}
      className="h-screen flex flex-col app-shell overflow-hidden anim-fade-in"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* ── Drag overlay ──────────────────────────────── */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center anim-drop-in"
          style={{ background: 'rgba(109,40,217,.07)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl px-14 py-12 text-center"
            style={{ background: 'var(--bg-preview)', border: '2px dashed var(--accent)', boxShadow: 'var(--shadow-xl)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--accent-soft)' }}>
              <Upload size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Drop your Markdown file</p>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>.md · .markdown · .txt</p>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────── */}
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

          <PillSwitcher view={view} onChange={setView} />

          <div className="flex items-center gap-0.5">
            {fileName && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 mr-1.5 rounded-full"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)', fontSize: 11, fontWeight: 500 }}>
                <FileText size={10} />
                <span className="max-w-[120px] truncate">{fileName}</span>
                <button onClick={() => { setFileName(null); setContent('') }}
                  className="cursor-pointer opacity-60 hover:opacity-100 ml-0.5">
                  <X size={9} />
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
              <Upload size={13} /><span className="hidden sm:inline">Upload</span>
            </button>
            <button onClick={handleDownload} title="Download .md" className="btn-icon"><Download size={15} /></button>
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="btn-icon hidden sm:flex">
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'} className="btn-icon" key={themeKey}>
              {isDark
                ? <Sun  size={15} className="theme-icon-enter" style={{ color: '#f59e0b' }} />
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

      {/* ── Main ──────────────────────────────────────── */}
      <main className="flex-1 flex min-h-0">

        {/* Editor pane */}
        <div
          className={`flex-col min-h-0 overflow-hidden ${mobileTab === 'editor' ? '!flex w-full' : 'hidden sm:flex'}`}
          style={{
            width: editorWidth,
            display: !showEditor ? 'none' : undefined,
            transition: 'width .28s cubic-bezier(.4,0,.2,1)',
            borderRight: '1px solid var(--border)',
          }}
        >
          {/* Formatting toolbar */}
          <FormattingToolbar textareaRef={textareaRef} content={content} onChange={setContent} />

          {/* Stats bar */}
          <div className="no-print shrink-0 flex items-center justify-between px-4 py-1.5 surface-toolbar"
            style={{ borderTop: 'none' }}>
            <div className="flex items-center gap-2">
              <AlignLeft size={11} style={{ color: 'var(--text-4)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
                Markdown
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 10, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                {lineCount} lines · {wordCount} words
              </span>
              <button onClick={() => setContent('')} title="Clear editor"
                className="cursor-pointer transition-colors"
                style={{ color: 'var(--text-4)' }}
                onMouseOver={e => e.currentTarget.style.color = '#f38ba8'}
                onMouseOut={e  => e.currentTarget.style.color = 'var(--text-4)'}>
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Textarea */}
          <div className="flex-1 overflow-auto grid-pattern" style={{ background: 'var(--bg-editor)' }}>
            <textarea
              ref={textareaRef}
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
          className={`flex-col min-h-0 ${mobileTab === 'preview' ? '!flex flex-1' : 'hidden sm:flex'}`}
          style={{
            width: previewWidth,
            display: !showPreview ? 'none' : undefined,
            transition: 'width .28s cubic-bezier(.4,0,.2,1)',
          }}
        >
          {/* Preview toolbar */}
          <div className="no-print shrink-0 flex items-center justify-between px-4 py-1.5 surface-toolbar">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTocVisible(v => !v)}
                title={tocVisible ? 'Hide outline' : 'Show outline'}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-all"
                style={{
                  background: tocVisible ? 'var(--accent-soft)' : 'transparent',
                  color: tocVisible ? 'var(--accent)' : 'var(--text-4)',
                  border: '1px solid', borderColor: tocVisible ? 'var(--accent-border)' : 'transparent',
                  fontSize: 10, fontWeight: 500,
                }}
              >
                {tocVisible ? <PanelLeftClose size={11} /> : <PanelLeftOpen size={11} />}
                <span className="hidden sm:inline">Outline</span>
              </button>
              <Eye size={11} style={{ color: 'var(--text-4)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
                Preview
              </span>
            </div>
            <div className="flex items-center gap-3">
              {wordCount > 0 && (
                <span className="status-badge">
                  ~{readingTime} min read
                </span>
              )}
              <button onClick={handleCopyAll}
                className="flex items-center gap-1 cursor-pointer transition-colors"
                style={{ fontSize: 10, fontWeight: 500, color: copyAllDone ? '#40a02b' : 'var(--text-4)' }}>
                {copyAllDone ? <Check size={11} /> : <Copy size={11} />}
                <span className="hidden sm:inline">{copyAllDone ? 'Copied!' : 'Copy MD'}</span>
              </button>
            </div>
          </div>

          {/* Preview body: TOC + content */}
          <div className="flex-1 flex min-h-0">
            {/* TOC */}
            <div
              className="shrink-0 overflow-y-auto surface-toc"
              style={{
                width: tocVisible ? 210 : 0,
                opacity: tocVisible ? 1 : 0,
                overflow: tocVisible ? 'auto' : 'hidden',
                transition: 'width .25s cubic-bezier(.4,0,.2,1), opacity .2s',
              }}
            >
              {tocVisible && (
                <div className="py-3 px-2">
                  <div className="flex items-center gap-2 px-2 pb-2 mb-1"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <List size={10} style={{ color: 'var(--text-4)' }} />
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
                      Contents
                    </span>
                  </div>
                  <TocSidebar headings={headings} activeId={activeHeadingId} onNavigate={navigateToHeading} />
                </div>
              )}
            </div>

            {/* Scrollable content */}
            <div ref={previewScrollRef} className="flex-1 overflow-auto surface-preview relative">
              {content.trim() ? (
                <div className="px-6 sm:px-10 md:px-14 py-10 max-w-[820px] mx-auto">
                  <div className="rm-prose anim-slide-up">
                    <MarkdownRenderer content={content} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-8 anim-fade-in">
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 anim-pop-in"
                    style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
                    <FileText size={34} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    Nothing to preview yet
                  </p>
                  <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--text-4)' }}>
                    Start typing Markdown in the editor, or upload a .md file using the button above.
                  </p>
                  <div className="mt-5 flex items-center gap-3">
                    <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
                      <Upload size={13} /> Upload file
                    </button>
                  </div>
                </div>
              )}

              {/* Scroll-to-top */}
              {showScrollTop && (
                <button
                  className="scroll-top-btn anim-pop-in no-print"
                  onClick={() => previewScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                  title="Back to top"
                >
                  <ArrowUp size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="no-print shrink-0"
        style={{ background: 'var(--bg-header)', borderTop: '1px solid var(--border)' }}>
        <div className="px-4 sm:px-5 h-8 flex items-center justify-between">
          <span style={{ fontSize: 10, color: 'var(--text-4)' }}>
            Drop a .md file anywhere · Use <code style={{ fontSize: 10, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 3 }}>lang:filename.ext</code> in code fences for filenames
          </span>
          <a href="https://guptasahil.in" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: 'var(--text-4)', textDecoration: 'none', transition: 'color .15s' }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseOut={e  => e.currentTarget.style.color = 'var(--text-4)'}>
            guptasahil.in
          </a>
        </div>
      </footer>
    </div>
  )
}
