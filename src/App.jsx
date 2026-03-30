import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import {
  Sun, Moon, Upload, Copy, Check, FileText, Eye, Code2,
  X, Download, Maximize2, Minimize2
} from 'lucide-react'

// ── Custom icons ──────────────────────────────────────────
const SplitEqualIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="2" width="6" height="12" rx="1.5" fill="currentColor" opacity="0.55"/>
    <rect x="9" y="2" width="6" height="12" rx="1.5" fill="currentColor" opacity="0.55"/>
  </svg>
)
const SplitWideIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="2" width="3.5" height="12" rx="1.5" fill="currentColor" opacity="0.45"/>
    <rect x="6.5" y="2" width="8.5" height="12" rx="1.5" fill="currentColor"/>
  </svg>
)

// ── Sample content ────────────────────────────────────────
const SAMPLE_MD = `# Welcome to ReadMe

> Paste or upload any **Markdown** file and get a beautiful, readable document instantly.

## Features

- ✨ **Live preview** — changes render as you type
- 🎨 **Syntax highlighting** — for 200+ languages
- 🌙 **Dark & light mode** — easy on your eyes
- 📤 **File upload** — drag & drop or click to upload
- 📋 **Copy to clipboard** — one-click copy for code blocks

---

## Code Example

\`\`\`typescript
interface Document {
  title: string
  content: string
  createdAt: Date
}

async function render(doc: Document): Promise<string> {
  const { title, content } = doc
  return \`# \${title}\\n\\n\${content}\`
}
\`\`\`

## Tables

| Feature        | Status  | Notes                     |
| -------------- | ------- | ------------------------- |
| GFM Tables     | ✅ Done | Full GitHub spec support  |
| Strikethrough  | ✅ Done | ~~like this~~             |
| Task lists     | ✅ Done | See below                 |

## Task List

- [x] Upload .md files
- [x] Syntax highlighting
- [x] Dark mode
- [ ] Export to PDF

## Inline Formatting

You can write \`inline code\`, **bold**, *italic*, ~~strikethrough~~, and [links](https://guptasahil.in).

---

*Made with ♥ by Sahil Gupta*
`

// ── Components ────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md
        bg-white/10 hover:bg-white/18 text-slate-300 hover:text-white
        transition-all duration-150 cursor-pointer select-none"
      title="Copy code"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeBlock({ language, code }) {
  return (
    <div className="my-5 rounded-xl overflow-hidden shadow-lg"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Code block header */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: '#161c2d', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[11px] font-mono font-medium text-slate-400 uppercase tracking-wider ml-1">
            {language || 'plaintext'}
          </span>
        </div>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.855rem',
          lineHeight: '1.75',
          padding: '1.25rem 1.5rem',
          background: '#0d1117',
        }}
        codeTagProps={{
          style: { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

function MarkdownRenderer({ content }) {
  const components = {
    pre({ children }) {
      return <>{children}</>
    },
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const codeStr = String(children).replace(/\n$/, '')
      const isBlock = Boolean(match) || codeStr.includes('\n')
      if (isBlock) return <CodeBlock language={match?.[1]} code={codeStr} />
      return (
        <code
          className="px-1.5 py-0.5 rounded text-[0.875em] font-mono font-medium
            bg-[#f0f2f8] dark:bg-[#1a1f30] text-[#c0264b] dark:text-[#f28cb0]
            border border-[#e2e6f0] dark:border-[#252c42]"
          {...props}
        >
          {children}
        </code>
      )
    },
    a({ href, children, ...props }) {
      return (
        <a
          href={href}
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200
            underline underline-offset-2 decoration-violet-300/50 hover:decoration-violet-500
            transition-colors duration-150"
          {...props}
        >
          {children}
        </a>
      )
    },
    input({ type, checked, ...props }) {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mr-2 rounded accent-violet-600 cursor-default"
            {...props}
          />
        )
      }
      return <input type={type} {...props} />
    },
    hr() {
      return (
        <hr className="my-8 border-none h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
      )
    },
    h1({ children, ...props }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return <h1 id={id} {...props}>{children}</h1>
    },
    h2({ children, ...props }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return <h2 id={id} {...props}>{children}</h2>
    },
    h3({ children, ...props }) {
      const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      return <h3 id={id} {...props}>{children}</h3>
    },
  }
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
      {content}
    </ReactMarkdown>
  )
}

// ── View modes ────────────────────────────────────────────
// editor | split | focus | preview
// editor=100%/0   split=50/50   focus=25/75   preview=0/100%

const VIEW_MODES = [
  { id: 'editor',  label: 'Editor',  Icon: Code2,          title: 'Editor only' },
  { id: 'split',   label: 'Split',   Icon: SplitEqualIcon, title: '50 / 50 split' },
  { id: 'focus',   label: 'Focus',   Icon: SplitWideIcon,  title: '25 / 75 — wide preview' },
  { id: 'preview', label: 'Preview', Icon: Eye,            title: 'Preview only' },
]

// ── App ───────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('readme-theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [content, setContent] = useState(SAMPLE_MD)
  const [view, setView] = useState('split')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [mobileTab, setMobileTab] = useState('preview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fileInputRef = useRef(null)
  const appRef = useRef(null)

  // Dark mode → apply .dark to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('readme-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // Native fullscreen
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await appRef.current?.requestFullscreen?.()
    } else {
      await document.exitFullscreen?.()
    }
  }, [])

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!/\.(md|markdown|txt)$/.test(file.name)) {
      alert('Please upload a .md, .markdown, or .txt file')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setContent(e.target.result)
      setFileName(file.name)
      setMobileTab('preview')
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || 'document.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [content, fileName])

  const handleCopyAll = useCallback(async () => {
    await navigator.clipboard.writeText(content)
  }, [content])

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
  const charCount = content.length
  const lineCount = content.split('\n').length

  // Pane widths based on view mode
  const editorWidth  = { editor: '100%', split: '50%', focus: '25%', preview: '0%' }[view]
  const previewWidth = { editor: '0%',  split: '50%', focus: '75%', preview: '100%' }[view]
  const showEditor  = view !== 'preview'
  const showPreview = view !== 'editor'

  return (
    <div
      ref={appRef}
      className="h-screen flex flex-col app-shell overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* ── Drag overlay ───────────────────────────────── */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-violet-500/10 backdrop-blur-sm
          flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-[#111520] rounded-2xl shadow-2xl px-14 py-12
            text-center border-2 border-dashed border-violet-400/70">
            <div className="w-14 h-14 rounded-xl bg-violet-100 dark:bg-violet-900/30
              flex items-center justify-center mx-auto mb-4">
              <Upload className="text-violet-500" size={26} />
            </div>
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Drop your Markdown file
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              .md · .markdown · .txt
            </p>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────── */}
      <header className="no-print shrink-0 z-40 header-bg">
        <div className="px-4 sm:px-5 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0 select-none">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600
              flex items-center justify-center shadow shadow-violet-500/25">
              <FileText size={14} className="text-white" />
            </div>
            <span className="font-semibold text-slate-800 dark:text-slate-100 text-[15px] tracking-tight">
              Read<span className="text-violet-500">Me</span>
            </span>
          </div>

          {/* View mode switcher — desktop */}
          <div className="hidden sm:flex items-center gap-0.5 rounded-lg p-1
            bg-slate-100/80 dark:bg-[#151a28]
            border border-slate-200/60 dark:border-[#1e2538]">
            {VIEW_MODES.map(({ id, label, Icon, title }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={title}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                  transition-all duration-150 cursor-pointer
                  ${view === id
                    ? 'bg-white dark:bg-[#252d42] text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {fileName && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 mr-1
                bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300
                rounded-full text-xs font-medium border border-violet-200/70 dark:border-violet-800/50">
                <FileText size={11} />
                <span className="max-w-[130px] truncate">{fileName}</span>
                <button
                  onClick={() => { setFileName(null); setContent('') }}
                  className="hover:text-violet-900 dark:hover:text-violet-100 cursor-pointer ml-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
                bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white
                shadow shadow-violet-500/20 transition-colors duration-150 cursor-pointer"
            >
              <Upload size={13} />
              <span className="hidden sm:inline">Upload .md</span>
            </button>

            <button
              onClick={handleDownload}
              title="Download as .md"
              className="p-2 rounded-lg text-slate-400 dark:text-slate-500
                hover:bg-slate-100 dark:hover:bg-[#151a28] hover:text-slate-600 dark:hover:text-slate-300
                transition-colors duration-150 cursor-pointer"
            >
              <Download size={15} />
            </button>

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="hidden sm:flex p-2 rounded-lg text-slate-400 dark:text-slate-500
                hover:bg-slate-100 dark:hover:bg-[#151a28] hover:text-slate-600 dark:hover:text-slate-300
                transition-colors duration-150 cursor-pointer"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-lg text-slate-400 dark:text-slate-500
                hover:bg-slate-100 dark:hover:bg-[#151a28] hover:text-slate-600 dark:hover:text-slate-300
                transition-colors duration-150 cursor-pointer"
            >
              {isDark
                ? <Sun size={15} className="text-amber-400" />
                : <Moon size={15} />
              }
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="sm:hidden no-print shrink-0 flex
        border-b border-slate-200 dark:border-[#1a1f30]
        bg-white dark:bg-[#0e1018]">
        {['editor', 'preview'].map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors cursor-pointer
              ${mobileTab === tab
                ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500'
                : 'text-slate-400 dark:text-slate-500'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Main ───────────────────────────────────────── */}
      <main className="flex-1 flex min-h-0">

        {/* Editor pane */}
        <div
          className={`flex-col min-h-0 transition-[width] duration-300 ease-in-out overflow-hidden
            ${mobileTab === 'editor' ? '!flex sm:hidden w-full' : 'hidden sm:flex'}
          `}
          style={{ width: editorWidth, display: !showEditor ? 'none' : undefined }}
        >
          {/* Editor toolbar */}
          <div className="no-print shrink-0 flex items-center justify-between px-4 py-2 toolbar-bg">
            <span className="text-[10px] font-bold tracking-[0.12em] uppercase
              text-slate-400 dark:text-slate-500">
              Markdown
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                {lineCount} lines · {wordCount} words
              </span>
              <button
                onClick={() => setContent('')}
                title="Clear"
                className="text-slate-300 dark:text-slate-600
                  hover:text-red-400 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Editor textarea */}
          <div className="flex-1 overflow-auto editor-pattern pane-border">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'# Start typing Markdown here…\n\nOr upload a .md file using the button above.'}
              spellCheck={false}
              className="w-full h-full min-h-full p-5 sm:p-6 resize-none outline-none
                text-[13.5px] leading-[1.8] text-slate-600 dark:text-slate-400 bg-transparent
                placeholder:text-slate-300 dark:placeholder:text-slate-700"
              style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
            />
          </div>
        </div>

        {/* Preview pane */}
        <div
          className={`flex-col min-h-0 overflow-auto preview-surface transition-[width] duration-300 ease-in-out
            ${mobileTab === 'preview' ? '!flex sm:hidden flex-1' : 'hidden sm:flex'}
          `}
          style={{ width: previewWidth, display: !showPreview ? 'none' : undefined }}
        >
          {/* Preview toolbar */}
          <div className="no-print shrink-0 sticky top-0 z-10 flex items-center justify-between
            px-5 sm:px-8 py-2 toolbar-bg">
            <span className="text-[10px] font-bold tracking-[0.12em] uppercase
              text-slate-400 dark:text-slate-500">
              Preview
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                {charCount.toLocaleString()} chars
              </span>
              <button
                onClick={handleCopyAll}
                title="Copy raw Markdown"
                className="flex items-center gap-1 text-[10px] font-medium
                  text-slate-400 dark:text-slate-500
                  hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <Copy size={11} />
                <span className="hidden sm:inline">Copy MD</span>
              </button>
            </div>
          </div>

          {/* Rendered content */}
          <div className="flex-1 px-5 sm:px-10 md:px-14 lg:px-20 py-10">
            {content.trim() ? (
              <article className="prose max-w-[72ch] mx-auto
                prose-headings:font-semibold prose-headings:tracking-tight
                prose-headings:text-slate-800 dark:prose-headings:text-slate-100
                prose-h1:text-[1.9rem] prose-h1:leading-tight prose-h1:mb-5
                prose-h2:text-[1.4rem] prose-h2:mt-10 prose-h2:mb-4
                prose-h3:text-[1.15rem] prose-h3:mt-7 prose-h3:mb-2
                prose-h3:text-slate-700 dark:prose-h3:text-slate-200
                prose-p:text-slate-600 dark:prose-p:text-slate-400
                prose-p:leading-[1.8] prose-p:text-[0.96rem]
                prose-li:text-slate-600 dark:prose-li:text-slate-400
                prose-li:text-[0.96rem] prose-li:leading-[1.75]
                prose-strong:text-slate-800 dark:prose-strong:text-slate-200 prose-strong:font-600
                prose-em:text-slate-600 dark:prose-em:text-slate-400
                prose-blockquote:not-italic
                prose-blockquote:text-slate-500 dark:prose-blockquote:text-slate-400
                prose-img:rounded-xl prose-img:shadow-md
                prose-a:no-underline
                dark:prose-invert
              ">
                <MarkdownRenderer content={content} />
              </article>
            ) : (
              <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-80 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br
                  from-violet-100 to-indigo-100 dark:from-violet-900/25 dark:to-indigo-900/25
                  flex items-center justify-center mb-5 shadow-sm">
                  <FileText className="text-violet-400" size={28} />
                </div>
                <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Nothing to preview yet
                </h3>
                <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed">
                  Start typing Markdown in the editor, or upload a .md file.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="no-print shrink-0 border-t border-slate-200/70 dark:border-[#1a1f30]
        bg-white/70 dark:bg-[#0e1018]/70 backdrop-blur-sm">
        <div className="px-4 sm:px-5 h-8 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 dark:text-slate-600">
            Drop a .md file anywhere to open it
          </span>
          <a
            href="https://guptasahil.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-slate-400 dark:text-slate-600
              hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
          >
            guptasahil.in
          </a>
        </div>
      </footer>
    </div>
  )
}
