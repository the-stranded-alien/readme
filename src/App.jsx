import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import {
  Sun, Moon, Upload, Copy, Check, FileText, Eye, Code2,
  X, Download, Maximize2, Minimize2, Menu
} from 'lucide-react'

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
        bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white
        transition-all duration-150 cursor-pointer"
      title="Copy code"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ language, code }) {
  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-gray-700/60 shadow-md">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700/60">
        <span className="text-xs font-mono font-medium text-gray-400 uppercase tracking-wider">
          {language || 'text'}
        </span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
          lineHeight: '1.7',
          padding: '1.25rem 1.5rem',
          background: '#0f172a',
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
    // In react-markdown v10, pre wraps block code. We strip pre and let code handle it.
    pre({ children }) {
      return <>{children}</>
    },
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const codeStr = String(children).replace(/\n$/, '')
      // Block code: has a language class OR contains newlines (unfenced block)
      const isBlock = Boolean(match) || codeStr.includes('\n')

      if (isBlock) {
        return <CodeBlock language={match?.[1]} code={codeStr} />
      }
      // Inline code
      return (
        <code
          className="px-1.5 py-0.5 rounded text-[0.875em] font-mono font-medium
            bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400"
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
          className="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300
            underline underline-offset-2 decoration-violet-300/60 hover:decoration-violet-500
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
        <hr className="my-8 border-none h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
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
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  )
}

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
  const fileInputRef = useRef(null)
  const appRef = useRef(null)

  // Apply dark class to <html> for Tailwind v4 class-based dark mode
  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('readme-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // Native fullscreen API
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFSChange)
    return () => document.removeEventListener('fullscreenchange', onFSChange)
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

  const viewButtons = [
    { id: 'editor', label: 'Editor', icon: Code2 },
    { id: 'split',  label: 'Split',  icon: Menu },
    { id: 'preview',label: 'Preview',icon: Eye },
  ]

  const showEditor = view === 'editor' || view === 'split'
  const showPreview = view === 'preview' || view === 'split'

  return (
    <div
      ref={appRef}
      className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-violet-600/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-12 text-center border-2 border-dashed border-violet-400">
            <Upload className="mx-auto mb-4 text-violet-500" size={40} />
            <p className="text-xl font-semibold text-gray-800 dark:text-gray-100">Drop your Markdown file</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">.md · .markdown · .txt</p>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="shrink-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="px-4 sm:px-5 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <FileText size={14} className="text-white" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white text-[15px] tracking-tight select-none">
              Read<span className="text-violet-500">Me</span>
            </span>
          </div>

          {/* View switcher */}
          <div className="hidden sm:flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {viewButtons.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer
                  ${view === id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {fileName && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1
                bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300
                rounded-full text-xs font-medium border border-violet-200/60 dark:border-violet-700/40">
                <FileText size={11} />
                <span className="max-w-[140px] truncate">{fileName}</span>
                <button
                  onClick={() => { setFileName(null); setContent('') }}
                  className="hover:text-violet-900 dark:hover:text-violet-100 cursor-pointer"
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-violet-600 hover:bg-violet-700 active:bg-violet-800
                text-white shadow-sm shadow-violet-500/25
                transition-colors duration-150 cursor-pointer"
            >
              <Upload size={13} />
              <span className="hidden sm:inline">Upload .md</span>
            </button>

            <button
              onClick={handleDownload}
              title="Download as .md"
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 cursor-pointer"
            >
              <Download size={15} />
            </button>

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="hidden sm:flex p-2 rounded-lg text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 cursor-pointer"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 cursor-pointer"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="sm:hidden shrink-0 flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        {['editor', 'preview'].map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors cursor-pointer
              ${mobileTab === tab
                ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500'
                : 'text-gray-500 dark:text-gray-400'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="flex-1 flex min-h-0">

        {/* Editor pane */}
        <div
          className={`flex-col min-h-0
            ${view === 'split'
              ? 'hidden sm:flex w-1/2 border-r border-gray-200 dark:border-gray-800'
              : view === 'editor'
              ? 'flex w-full'
              : 'hidden'
            }
            ${mobileTab === 'editor' ? '!flex sm:hidden w-full' : ''}
          `}
        >
          {/* Editor toolbar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2
            border-b border-gray-100 dark:border-gray-800/70 bg-white dark:bg-gray-950">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold tracking-widest uppercase">
              Markdown
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {lineCount} lines · {wordCount} words
              </span>
              <button
                onClick={() => setContent('')}
                title="Clear editor"
                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Textarea */}
          <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'# Start typing Markdown here…\n\nOr upload a .md file using the button above.'}
              spellCheck={false}
              className="w-full h-full min-h-full p-5 resize-none outline-none text-sm leading-7
                text-gray-700 dark:text-gray-300 bg-transparent
                placeholder:text-gray-300 dark:placeholder:text-gray-700"
              style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
            />
          </div>
        </div>

        {/* Preview pane */}
        <div
          className={`flex-col min-h-0 overflow-auto
            ${view === 'split'
              ? 'hidden sm:flex flex-1'
              : view === 'preview'
              ? 'flex flex-1'
              : 'hidden'
            }
            ${mobileTab === 'preview' ? '!flex sm:hidden flex-1' : ''}
            bg-white dark:bg-gray-950
          `}
        >
          {/* Preview toolbar */}
          <div className="shrink-0 sticky top-0 z-10 flex items-center justify-between px-5 sm:px-8 py-2
            bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm
            border-b border-gray-100 dark:border-gray-800/70">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold tracking-widest uppercase">
              Preview
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {charCount.toLocaleString()} chars
              </span>
              <button
                onClick={handleCopyAll}
                title="Copy raw Markdown"
                className="flex items-center gap-1 text-[11px] text-gray-400
                  hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <Copy size={12} />
                <span className="hidden sm:inline">Copy MD</span>
              </button>
            </div>
          </div>

          {/* Rendered markdown */}
          <div className="flex-1 px-5 sm:px-10 md:px-16 lg:px-24 py-10">
            {content.trim() ? (
              <article className="prose prose-gray dark:prose-invert max-w-3xl mx-auto
                prose-headings:font-semibold prose-headings:tracking-tight
                prose-h1:text-[2rem] prose-h1:leading-tight prose-h1:mb-4
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-3 prose-h2:pb-2
                prose-h2:border-b prose-h2:border-gray-200 dark:prose-h2:border-gray-800
                prose-h3:text-xl prose-h3:mt-8
                prose-p:leading-7 prose-p:text-gray-700 dark:prose-p:text-gray-300
                prose-li:text-gray-700 dark:prose-li:text-gray-300
                prose-strong:font-semibold prose-strong:text-gray-900 dark:prose-strong:text-gray-100
                prose-em:text-gray-700 dark:prose-em:text-gray-300
                prose-table:text-sm prose-th:font-semibold
                prose-blockquote:not-italic
                prose-img:rounded-xl prose-img:shadow-md
                prose-a:no-underline
              ">
                <MarkdownRenderer content={content} />
              </article>
            ) : (
              <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-80 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100
                  dark:from-violet-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-4">
                  <FileText className="text-violet-400" size={28} />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Nothing to preview
                </h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
                  Start typing Markdown in the editor, or upload a .md file using the button above.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="px-4 sm:px-5 h-9 flex items-center justify-between">
          <span className="text-[11px] text-gray-400 dark:text-gray-600">
            Drop a .md file anywhere to open it
          </span>
          <a
            href="https://guptasahil.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-400 dark:text-gray-600
              hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
          >
            guptasahil.in
          </a>
        </div>
      </footer>
    </div>
  )
}
