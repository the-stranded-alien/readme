import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import {
  Sun, Moon, Upload, Copy, Check, FileText, Eye, Code2,
  ChevronDown, X, Download, Maximize2, Minimize2, Menu
} from 'lucide-react'

const SAMPLE_MD = `# Welcome to readme.guptasahil.in

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
| Math           | 🔜 Soon | KaTeX integration planned |

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

function CodeBlock({ children, className, isDark }) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : 'text'
  const code = String(children).replace(/\n$/, '')

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5
        bg-gray-800 dark:bg-gray-900 border-b border-gray-700/60">
        <span className="text-xs font-mono font-medium text-gray-400 uppercase tracking-wider">
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
          lineHeight: '1.6',
          padding: '1.25rem 1.5rem',
          background: isDark ? '#0f172a' : '#1e293b',
        }}
        codeTagProps={{ style: { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

function MarkdownRenderer({ content, isDark }) {
  const components = {
    code({ node, inline, className, children, ...props }) {
      if (inline) {
        return <code className={className} {...props}>{children}</code>
      }
      return <CodeBlock className={className} isDark={isDark}>{children}</CodeBlock>
    },
    // Style links
    a({ href, children, ...props }) {
      return (
        <a
          href={href}
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300
            underline underline-offset-2 decoration-violet-300/50 hover:decoration-violet-500
            transition-colors duration-150"
          {...props}
        >
          {children}
        </a>
      )
    },
    // Checkboxes
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
    // Horizontal rule
    hr() {
      return <hr className="my-8 border-none h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
    },
    // Headings with anchor IDs
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
      rehypePlugins={[rehypeRaw]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  )
}

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme')
      if (stored) return stored === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })
  const [content, setContent] = useState(SAMPLE_MD)
  const [view, setView] = useState('split') // 'split' | 'editor' | 'preview'
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobileTab, setMobileTab] = useState('preview') // 'editor' | 'preview'
  const fileInputRef = useRef(null)
  const previewRef = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && !file.name.endsWith('.txt')) {
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
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

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

  return (
    <div
      className={`min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200
        ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-violet-600/20 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-12 text-center border-2 border-dashed border-violet-400">
            <Upload className="mx-auto mb-4 text-violet-500" size={40} />
            <p className="text-xl font-semibold text-gray-800 dark:text-gray-100">Drop your Markdown file</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">.md, .markdown, or .txt</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="no-print sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md
        border-b border-gray-200/80 dark:border-gray-800/80">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <FileText size={14} className="text-white" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm tracking-tight">
              readme
              <span className="text-violet-500">.guptasahil.in</span>
            </span>
          </div>

          {/* View switcher — desktop */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 dark:bg-gray-800/70 rounded-lg p-1">
            {[
              { id: 'editor', label: 'Editor', icon: Code2 },
              { id: 'split', label: 'Split', icon: Menu },
              { id: 'preview', label: 'Preview', icon: Eye },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer
                  ${view === id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* File name badge */}
            {fileName && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 dark:bg-violet-900/20
                text-violet-700 dark:text-violet-300 rounded-full text-xs font-medium border border-violet-200/60 dark:border-violet-700/40">
                <FileText size={11} />
                {fileName}
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
                bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-500/20
                transition-all duration-150 cursor-pointer"
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
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="hidden sm:flex p-2 rounded-lg text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 cursor-pointer"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 cursor-pointer"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="sm:hidden no-print flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
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

      {/* Main */}
      <main className="flex-1 flex overflow-hidden max-w-screen-2xl mx-auto w-full">
        {/* Editor pane */}
        <div
          className={`flex flex-col
            ${view === 'split' ? 'hidden sm:flex sm:w-1/2 border-r border-gray-200 dark:border-gray-800' : ''}
            ${view === 'editor' ? 'flex w-full' : ''}
            ${view === 'preview' ? 'hidden' : ''}
            ${mobileTab === 'editor' ? 'flex sm:hidden w-full' : ''}
            ${mobileTab === 'preview' ? 'hidden sm:flex' : ''}
          `}
        >
          {/* Editor toolbar */}
          <div className="no-print flex items-center justify-between px-4 py-2
            bg-white dark:bg-gray-950 border-b border-gray-200/60 dark:border-gray-800/60">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide uppercase">
              Markdown
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {lineCount} lines · {wordCount} words
              </span>
              <button
                onClick={() => setContent('')}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                title="Clear"
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
              placeholder="# Start typing Markdown here…&#10;&#10;Or upload a .md file using the button above."
              spellCheck={false}
              className="w-full h-full min-h-96 p-6 resize-none outline-none font-mono text-sm
                leading-relaxed text-gray-700 dark:text-gray-300 bg-transparent
                placeholder:text-gray-300 dark:placeholder:text-gray-600"
              style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
            />
          </div>
        </div>

        {/* Divider — split only */}
        {view === 'split' && (
          <div className="hidden sm:block w-px bg-gray-200 dark:bg-gray-800 shrink-0" />
        )}

        {/* Preview pane */}
        <div
          ref={previewRef}
          className={`flex flex-col overflow-auto
            ${view === 'split' ? 'hidden sm:flex sm:flex-1' : ''}
            ${view === 'preview' ? 'flex flex-1' : ''}
            ${view === 'editor' ? 'hidden' : ''}
            ${mobileTab === 'preview' ? 'flex sm:hidden flex-1' : ''}
            ${mobileTab === 'editor' ? 'hidden sm:flex' : ''}
          `}
        >
          {/* Preview toolbar */}
          <div className="no-print sticky top-0 flex items-center justify-between px-4 sm:px-8 py-2
            bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm
            border-b border-gray-200/60 dark:border-gray-800/60 z-10">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide uppercase">
              Preview
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {charCount.toLocaleString()} chars
              </span>
              <button
                onClick={handleCopyAll}
                title="Copy raw Markdown"
                className="text-xs flex items-center gap-1 text-gray-400 hover:text-gray-700
                  dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <Copy size={12} />
                <span className="hidden sm:inline">Copy MD</span>
              </button>
            </div>
          </div>

          {/* Rendered content */}
          <div className="flex-1 px-6 sm:px-12 md:px-16 lg:px-24 py-10
            bg-white dark:bg-gray-950">
            {content.trim() ? (
              <div className="prose prose-gray dark:prose-invert max-w-3xl mx-auto
                prose-headings:font-semibold prose-headings:tracking-tight
                prose-h1:text-3xl prose-h1:mb-4
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-gray-200 prose-h2:dark:border-gray-800 prose-h2:pb-2
                prose-h3:text-xl prose-h3:mt-8
                prose-p:leading-7 prose-p:text-gray-700 dark:prose-p:text-gray-300
                prose-li:text-gray-700 dark:prose-li:text-gray-300
                prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-strong:font-semibold
                prose-table:text-sm
                prose-th:font-semibold prose-th:text-gray-900 dark:prose-th:text-gray-100
                prose-td:text-gray-700 dark:prose-td:text-gray-300
                prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-blockquote:not-italic
                prose-a:no-underline prose-img:rounded-xl prose-img:shadow-md
              ">
                <MarkdownRenderer content={content} isDark={isDark} />
              </div>
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

      {/* Footer */}
      <footer className="no-print border-t border-gray-200/60 dark:border-gray-800/60
        bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-10 flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-600">
            Drop a .md file anywhere to open it
          </span>
          <a
            href="https://guptasahil.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 dark:text-gray-600 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
          >
            guptasahil.in
          </a>
        </div>
      </footer>
    </div>
  )
}
