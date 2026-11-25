import { createElement, useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import MermaidBlock from './components/MermaidBlock'
import CommandPalette from './components/CommandPalette'
import { MD_TEMPLATES, parseFrontmatter } from './templates'
import {
  Sun, Moon, Upload, Copy, Check, FileText, FilePlus, Eye, Code2,
  X, Download, Maximize2, Minimize2, Hash, ChevronRight,
  List, AlignLeft, PanelLeftOpen, PanelLeftClose,
  Bold, Italic, Strikethrough, Link, Code, Minus,
  WrapText, ArrowUp, Heading1, Heading2, Quote,
  FileDown, BookOpen, Search, ChevronUp, ChevronDown, Type, UnfoldHorizontal, FoldHorizontal, Contrast, BookmarkPlus, BookmarkCheck, ChevronsDownUp, ChevronsUpDown,
  Command, FileArchive, FileCode2, Link2, LayoutTemplate, Tag,
  Volume2, Pause, Play, Highlighter, MonitorUp, Globe, Save,
} from 'lucide-react'
import { readWorkspace, writeWorkspace } from './workspaceDb'
import { analyzeDocument } from './documentAnalysis'

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

function useIsSepia() {
  const [sepia, setSepia] = useState(() => document.documentElement.classList.contains('sepia'))
  useEffect(() => {
    const observer = new MutationObserver(() => setSepia(document.documentElement.classList.contains('sepia')))
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return sepia
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

// Keep the parchment color mode out of the UI until it is ready to ship.
const ENABLE_SEPIA_THEME = false

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
`

function useDocumentAnalysis(markdown) {
  const [analysis, setAnalysis] = useState(() => analyzeDocument(markdown))
  const workerRef = useRef(null)
  const requestIdRef = useRef(0)
  useEffect(() => {
    if (!('Worker' in window)) return
    try {
      const worker = new Worker(new URL('./workers/documentWorker.js', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = ({ data }) => {
        if (data.id === requestIdRef.current) setAnalysis(data)
      }
      return () => { worker.terminate(); workerRef.current = null }
    } catch { /* use the synchronous fallback */ }
  }, [])
  useEffect(() => {
    const id = ++requestIdRef.current
    if (workerRef.current) workerRef.current.postMessage({ id, markdown })
    else {
      const timer = setTimeout(() => setAnalysis(analyzeDocument(markdown)), 0)
      return () => clearTimeout(timer)
    }
  }, [markdown])
  return analysis
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

// ── Language alias map ────────────────────────────────────────
const LANG_ALIASES = {
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
  py: 'python', rb: 'ruby',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash',
  yml: 'yaml',
  c: 'c', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  md: 'markdown',
  rs: 'rust',
  dockerfile: 'docker',
}
function normalizeLang(lang) {
  const l = (lang || '').toLowerCase().trim()
  return LANG_ALIASES[l] || l || 'text'
}

// ── CodeBlock ──────────────────────────────────────────────────
const sepiaCodeTheme = {
  ...oneLight,
  comment: { color: '#62697a', fontStyle: 'italic' },
  prolog: { color: '#62697a' },
  cdata: { color: '#62697a' },
}

function CodeBlock({ rawLang, code }) {
  const dark = useIsDark()
  const sepia = useIsSepia()
  const [wrapped, setWrapped] = useState(false)
  const [copied, setCopied] = useState(false)

  // Parse "language:filename.ext" or just "language"
  const colonIdx = (rawLang || '').indexOf(':')
  const language = colonIdx > -1 ? rawLang.slice(0, colonIdx) : (rawLang || '')
  const filename  = colonIdx > -1 ? rawLang.slice(colonIdx + 1) : null

  const lineCount = code.split('\n').length
  const prismLang = useMemo(() => normalizeLang(language), [language])

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

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
          <button onClick={copy} className={`copy-btn ${copied ? 'copied' : ''}`}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Code body */}
      <div className="code-body">
        <SyntaxHighlighter
          language={prismLang}
          style={dark ? oneDark : sepia ? sepiaCodeTheme : oneLight}
          showLineNumbers={lineCount > 4}
          wrapLongLines={wrapped}
          customStyle={{
            margin: 0,
            padding: lineCount > 4 ? '16px 20px 16px 12px' : '16px 20px',
            background: 'var(--code-bg)',
            color: dark ? '#d8dee9' : '#383a42',
            fontSize: '0.86rem',
            lineHeight: '1.75',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            overflowX: wrapped ? 'hidden' : 'auto',
          }}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '14px',
            color: 'var(--code-ln-color)',
            userSelect: 'none',
            fontSize: '11px',
          }}
          codeTagProps={{
            style: {
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              background: 'transparent',
              color: dark ? '#d8dee9' : '#383a42',
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

// ── FrontmatterCard ────────────────────────────────────────────
function FrontmatterCard({ meta }) {
  if (!meta.length) return null
  return (
    <div className="frontmatter-card anim-fade-in">
      {meta.map(({ key, value }) =>
        Array.isArray(value) ? (
          <div key={key} className="frontmatter-pill">
            <span className="frontmatter-key">{key}</span>
            <span className="flex flex-wrap gap-1">
              {value.map((tag, i) => (
                <span key={`${tag}-${i}`} className="frontmatter-tag">
                  <Tag size={9} />{tag}
                </span>
              ))}
            </span>
          </div>
        ) : (
          <div key={key} className="frontmatter-pill">
            <span className="frontmatter-key">{key}</span>
            <span className="font-medium">{value}</span>
          </div>
        )
      )}
    </div>
  )
}

// ── MarkdownRenderer ───────────────────────────────────────────
function MarkdownRenderer({ content, dark }) {
  const components = useMemo(() => ({
    pre({ children }) { return <>{children}</> },

    code({ className, children }) {
      // Support "language-ts:filename.ts" notation
      const raw = (className || '').replace('language-', '')
      const str = String(children).replace(/\n$/, '')
      if (raw.toLowerCase() === 'mermaid') {
        return <MermaidBlock code={str} dark={dark} />
      }
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
  }), [dark])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  )
}

// ── TOCSidebar ─────────────────────────────────────────────────
function TocSidebar({ headings, activeId, onNavigate }) {
  const [collapsed, setCollapsed] = useState(() => new Set())

  const parentKeys = useMemo(() => {
    const keys = []
    for (let i = 0; i < headings.length; i += 1) {
      if (i + 1 < headings.length && headings[i + 1].level > headings[i].level) {
        keys.push(`${headings[i].level}-${headings[i].id}-${i}`)
      }
    }
    return keys
  }, [headings])

  const visibleItems = useMemo(() => {
    const items = []
    const stack = []
    for (let i = 0; i < headings.length; i += 1) {
      const h = headings[i]
      const key = `${h.level}-${h.id}-${i}`
      while (stack.length && stack[stack.length - 1].level >= h.level) {
        stack.pop()
      }
      const hiddenByAncestor = stack.some(s => s.collapsed)
      const hasChildren = i + 1 < headings.length && headings[i + 1].level > h.level
      const isCollapsed = collapsed.has(key)
      if (!hiddenByAncestor) {
        items.push({ h, i, key, hasChildren, isCollapsed })
      }
      if (hasChildren) {
        stack.push({ level: h.level, collapsed: isCollapsed })
      }
    }
    return items
  }, [headings, collapsed])

  const toggleCollapse = useCallback((key) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const allCollapsed = parentKeys.length > 0 && parentKeys.every(k => collapsed.has(k))
  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? new Set() : new Set(parentKeys))
  }, [allCollapsed, parentKeys])

  if (!headings.length) return (
    <div>
      <div className="flex items-center justify-between px-2 pb-2 mb-1"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <List size={10} style={{ color: 'var(--text-4)' }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
            Contents
          </span>
        </div>
      </div>
      <div className="py-8 text-center" style={{ color: 'var(--text-4)', fontSize: 11 }}>
        No headings found
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-2 mb-1"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <List size={10} style={{ color: 'var(--text-4)' }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
            Contents
          </span>
        </div>
        {parentKeys.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="btn-icon !p-1"
            title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            aria-label={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
          >
            {allCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
          </button>
        )}
      </div>
      <nav className="py-1">
        {visibleItems.map(({ h, i, key, hasChildren, isCollapsed }) => {
          const isActive = activeId === h.id
          const depth = h.level - 1 // 0, 1, 2
          const guides = Array.from({ length: depth })
          return (
            <div key={key} className="relative">
              {/* Vertical tree guide lines for nested items */}
              {guides.map((_, d) => (
                <div
                  key={d}
                  className="toc-guide"
                  style={{ left: `${d * 14 + 10}px` }}
                />
              ))}
              <div
                className={`toc-item anim-slide-left ${isActive ? 'active' : ''}`}
                style={{
                  paddingLeft: `${depth * 14 + (depth > 0 ? 18 : 6)}px`,
                  animationDelay: `${Math.min(i * 25, 160)}ms`,
                }}
                onClick={() => onNavigate(h.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onNavigate(h.id)
                  }
                }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      toggleCollapse(key)
                    }}
                    className={`toc-toggle ${isCollapsed ? '' : 'expanded'}`}
                    title={isCollapsed ? 'Expand section' : 'Collapse section'}
                    aria-label={isCollapsed ? `Expand ${h.text}` : `Collapse ${h.text}`}
                  >
                    <ChevronRight size={11} />
                  </button>
                ) : (
                  <span className="w-4 flex items-center justify-center shrink-0">
                    {h.level === 1 && (
                      <Hash size={9} style={{ opacity: isActive ? 1 : 0.45 }} />
                    )}
                    {h.level === 2 && (
                      <span className="toc-dot" style={{ opacity: isActive ? 1 : 0.5 }} />
                    )}
                    {h.level === 3 && (
                      <span className="toc-subdot" />
                    )}
                  </span>
                )}
                <span className="truncate" style={{
                  fontSize: h.level === 1 ? 13 : h.level === 2 ? 12 : 11.5,
                  fontWeight: h.level === 1 ? 600 : h.level === 2 ? 500 : 400,
                  letterSpacing: h.level === 1 ? '-0.01em' : 'normal',
                  opacity: h.level === 3 && !isActive ? 0.75 : 1,
                }}>
                  {h.text}
                </span>
              </div>
            </div>
          )
        })}
      </nav>
    </div>
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
      {VIEW_MODES.map((mode, i) => {
        const { id, label } = mode
        return (
        <button key={id} ref={el => (btnRefs.current[i] = el)}
          onClick={() => onChange(id)}
          className={`pill-btn ${view === id ? 'active' : ''}`}
          title={label}
        >
          {createElement(mode.Icon, { size: 13 })}
          {label}
        </button>
        )
      })}
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

function FormattingToolbar({ textareaRef, content, onChange, onCreateFromTemplate }) {
  const [tplOpen, setTplOpen] = useState(false)
  const tplRef = useRef(null)

  useEffect(() => {
    if (!tplOpen) return
    const onDown = (e) => { if (tplRef.current && !tplRef.current.contains(e.target)) setTplOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [tplOpen])

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
    <div className="fmt-toolbar no-print justify-between">
      <div className="flex items-center gap-0.5">
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

      <div ref={tplRef} className="relative shrink-0 ml-2">
        <button
          type="button"
          onClick={() => setTplOpen(o => !o)}
          title="New from template"
          className="fmt-btn !px-2 gap-1"
          style={tplOpen ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
        >
          <LayoutTemplate size={12} />
          <span className="hidden lg:inline text-[10px] font-semibold">Templates</span>
        </button>
        {tplOpen && (
          <div className="download-menu anim-drop-in" style={{ minWidth: 230 }} role="menu">
            {MD_TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                role="menuitem"
                className="download-menu-item"
                onClick={() => { setTplOpen(false); onCreateFromTemplate(tpl) }}
              >
                <span className="min-w-0">
                  <div className="font-semibold text-xs truncate">{tpl.name}</div>
                  <div className="text-[10px] truncate opacity-70">{tpl.description}</div>
                </span>
                <span className="text-[10px] font-mono opacity-60 shrink-0">{tpl.fileName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── In-memory client-side file helpers ─────────────────────────
function createFileId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getNextUntitledName(existingFiles) {
  const taken = new Set(existingFiles.map(f => f.name.toLowerCase()))
  let n = 1
  while (taken.has(`untitled-${n}.md`)) n += 1
  return `Untitled-${n}.md`
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(String(e.target.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function removeSampleAttribution(markdown) {
  return markdown.replace(/^\s*\*Made with ♥ by Sahil Gupta\*\s*$/m, '').trimEnd()
}

function loadInitialWorkspace() {
  try {
    const rawFiles = localStorage.getItem('readme-files')
    if (rawFiles !== null) {
      const parsed = JSON.parse(rawFiles)
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          f => f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.content === 'string'
        ).map(f => ({ ...f, content: removeSampleAttribution(f.content) }))
        const savedActive = localStorage.getItem('readme-active-file')
        const activeId = valid.some(f => f.id === savedActive) ? savedActive : (valid[0]?.id ?? null)
        return { files: valid, activeId }
      }
    }

    const legacyContent = localStorage.getItem('readme-content')
    if (legacyContent !== null) {
      const legacyName = localStorage.getItem('readme-filename') || 'Untitled-1.md'
      const id = createFileId()
      return { files: [{ id, name: legacyName, content: removeSampleAttribution(legacyContent) }], activeId: id }
    }
  } catch {
    // Ignore storage read errors and fall back to default in-memory document
  }

  return {
    files: [{ id: 'welcome', name: 'Welcome.md', content: SAMPLE_MD }],
    activeId: 'welcome',
  }
}

// ── Reader preferences (long-form book reading) ───────────────
const DOC_FONTS = [
  { id: 'inter',  num: 1, label: 'Inter (Clean Sans)',         family: "'Inter', system-ui, sans-serif",          isSerif: false },
  { id: 'lora',   num: 2, label: 'Lora (Book Serif)',          family: "'Lora', Georgia, serif",                  isSerif: true  },
  { id: 'plex',   num: 3, label: 'IBM Plex Sans (Tech)',       family: "'IBM Plex Sans', system-ui, sans-serif",  isSerif: false },
  { id: 'serif4', num: 4, label: 'Source Serif 4 (Editorial)', family: "'Source Serif 4', Georgia, serif",        isSerif: true  },
  { id: 'roboto', num: 5, label: 'Roboto (Neutral Sans)',       family: "'Roboto', Arial, sans-serif",               isSerif: false },
]
const READER_SIZES = {
  sm: { label: 'S',  px: '15px' },
  md: { label: 'M',  px: '17px' },
  lg: { label: 'L',  px: '19px' },
  xl: { label: 'XL', px: '21px' },
}
const READER_WIDTHS = {
  narrow: { label: 'Focused', maxW: '620px' },
  book:   { label: 'Book',    maxW: '740px' },
  wide:   { label: 'Wide',    maxW: '960px' },
  full:   { label: 'Full',    maxW: '100%'  },
}
const READER_PAPERS = [
  { id: 'ivory', label: 'Ivory' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'crisp', label: 'Crisp' },
]
const DEFAULT_READER_PREFS = { fontIndex: 0, size: 'md', width: 'book', paper: 'ivory' }

function loadReaderPrefs() {
  try {
    const raw = localStorage.getItem('readme-reader-prefs')
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged = { ...DEFAULT_READER_PREFS, ...parsed }
      if (typeof merged.fontIndex !== 'number' || merged.fontIndex < 0 || merged.fontIndex >= DOC_FONTS.length) {
        merged.fontIndex = parsed.font === 'book' ? 1 : 0
      }
      return merged
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_READER_PREFS
}

function loadReadingBookmarks() {
  try {
    const parsed = JSON.parse(localStorage.getItem('readme-reading-bookmarks') || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function ReaderSettingsPopover({ prefs, onChange, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div ref={ref} className="reader-popover anim-drop-in no-print">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
          <BookOpen size={13} style={{ color: 'var(--accent)' }} />
          Reader Comfort
        </span>
        <button onClick={onClose} className="btn-icon !p-1" aria-label="Close reader settings">
          <X size={12} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>
            Typography
          </div>
          <div className="grid grid-cols-1 gap-1">
            {DOC_FONTS.map((f, idx) => (
              <button key={f.id}
                onClick={() => onChange({ ...prefs, fontIndex: idx })}
                className={`reader-chip text-left flex items-center justify-between ${prefs.fontIndex === idx ? 'active' : ''}`}
                style={{ fontFamily: f.family }}
              >
                <span>{f.label}</span>
                <span className="text-[10px] opacity-70">{f.num}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>
            Text Size
          </div>
          <div className="flex gap-1.5">
            {Object.entries(READER_SIZES).map(([id, cfg]) => (
              <button key={id}
                onClick={() => onChange({ ...prefs, size: id })}
                className={`reader-chip ${prefs.size === id ? 'active' : ''}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>
            Page Width
          </div>
          <div className="flex gap-1.5">
            {Object.entries(READER_WIDTHS).map(([id, cfg]) => (
              <button key={id}
                onClick={() => onChange({ ...prefs, width: id })}
                className={`reader-chip ${prefs.width === id ? 'active' : ''}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>
            Paper Tone
          </div>
          <div className="flex gap-1.5">
            {READER_PAPERS.map(p => (
              <button key={p.id}
                onClick={() => onChange({ ...prefs, paper: p.id })}
                className={`reader-chip ${prefs.paper === p.id ? 'active' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DownloadMenuButton({
  disabled,
  canExportPdf,
  fileCount,
  onDownloadMd,
  onExportPdf,
  onExportHtml,
  onExportZip,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={`split-download ${disabled && fileCount === 0 ? 'disabled' : ''}`}>
      <button
        type="button"
        onClick={onDownloadMd}
        disabled={disabled}
        data-tooltip="Download Markdown (.md)"
        aria-label="Download Markdown"
        className="split-download-main"
      >
        <Download size={13} />
        <span className="hidden sm:inline">Download</span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled && fileCount === 0}
        data-tooltip="Download and export options"
        aria-label="Download and export options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="split-download-caret"
      >
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="download-menu anim-drop-in" role="menu">
          <button
            type="button"
            role="menuitem"
            className="download-menu-item"
            disabled={disabled}
            onClick={() => { setOpen(false); onDownloadMd() }}
          >
            <span className="flex items-center gap-2">
              <Download size={13} style={{ color: 'var(--accent)' }} />
              <span>Download Markdown</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              .md
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="download-menu-item"
            disabled={!canExportPdf}
            onClick={() => { setOpen(false); onExportPdf() }}
          >
            <span className="flex items-center gap-2">
              <FileDown size={13} style={{ color: 'var(--accent)' }} />
              <span>Print / Save as PDF</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              .pdf
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="download-menu-item"
            disabled={!canExportPdf}
            onClick={() => { setOpen(false); onExportHtml() }}
          >
            <span className="flex items-center gap-2">
              <FileCode2 size={13} style={{ color: 'var(--accent)' }} />
              <span>Export Standalone HTML</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              .html
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="download-menu-item"
            disabled={fileCount === 0}
            onClick={() => { setOpen(false); onExportZip() }}
          >
            <span className="flex items-center gap-2">
              <FileArchive size={13} style={{ color: 'var(--accent)' }} />
              <span>Export All Files ({fileCount})</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              .zip
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── FileTabBar ─────────────────────────────────────────────────
function FileTabBar({ files, activeFileId, onSelect, onClose, onCreate, onRename }) {
  const tabRefs = useRef({})
  const [editingId, setEditingId] = useState(null)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    if (!activeFileId) return
    tabRefs.current[activeFileId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeFileId, files.length])

  const startRename = (file) => {
    setEditingId(file.id)
    setDraftName(file.name)
  }

  const commitRename = (id) => {
    onRename(id, draftName)
    setEditingId(null)
  }

  return (
    <div className="file-tabs-bar no-print" role="tablist" aria-label="Open files">
      <div className="file-tabs-scroll">
        {files.map(file => {
          const isActive = file.id === activeFileId
          const isEditing = editingId === file.id
          return (
            <div
              key={file.id}
              ref={el => {
                if (el) tabRefs.current[file.id] = el
                else delete tabRefs.current[file.id]
              }}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => onSelect(file.id)}
              onAuxClick={e => {
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(file.id)
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(file.id)
                }
              }}
              title={`${file.name} (double-click to rename)`}
              className={`file-tab ${isActive ? 'active' : ''}`}
            >
              <FileText
                size={12}
                style={{
                  flexShrink: 0,
                  color: isActive ? 'var(--accent)' : 'var(--text-4)',
                }}
              />
              {isEditing ? (
                <input
                  className="file-tab-rename"
                  value={draftName}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  onChange={e => setDraftName(e.target.value)}
                  onBlur={() => commitRename(file.id)}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commitRename(file.id)
                    else if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span
                  className="truncate"
                  onDoubleClick={e => {
                    e.stopPropagation()
                    startRename(file)
                  }}
                >
                  {file.name}
                </span>
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  onClose(file.id)
                }}
                className="file-tab-close"
                title={`Close ${file.name}`}
                aria-label={`Close ${file.name}`}
              >
                <X size={10} />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={onCreate}
          className="file-tab-add"
          title="New file"
          aria-label="New file"
        >
          <FilePlus size={12} />
          <span>New</span>
        </button>
      </div>

      <span
        className="file-tab-count hidden sm:inline shrink-0 pb-1"
        style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
      >
        {files.length} {files.length === 1 ? 'file' : 'files'}
      </span>
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('readme-theme')
    return ['light', 'dark'].includes(saved) || (ENABLE_SEPIA_THEME && saved === 'sepia')
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const isDark = theme === 'dark'
  const isSepia = ENABLE_SEPIA_THEME && theme === 'sepia'
  const [highContrast, setHighContrast] = useState(
    () => localStorage.getItem('readme-high-contrast') === 'true'
  )
  const [initialWorkspace] = useState(loadInitialWorkspace)
  const [files, setFiles]               = useState(initialWorkspace.files)
  const [activeFileId, setActiveFileId] = useState(initialWorkspace.activeId)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [view, setView]             = useState('split')
  const [isDragging, setIsDragging] = useState(false)
  const [mobileTab, setMobileTab]   = useState('preview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [tocVisible, setTocVisible] = useState(true)
  const [activeHeadingId, setActiveHeadingId] = useState(null)
  const [showScrollTop, setShowScrollTop]     = useState(false)
  const [themeKey, setThemeKey]     = useState(0)
  const [copyAllDone, setCopyAllDone] = useState(false)
  const [readerPrefs, setReaderPrefs] = useState(loadReaderPrefs)
  const [readingBookmarks, setReadingBookmarks] = useState(loadReadingBookmarks)
  const [readerOpen, setReaderOpen]   = useState(false)
  const [readProgress, setReadProgress] = useState(0)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [searchCount, setSearchCount] = useState(0)
  const [lightboxImg, setLightboxImg] = useState(null)
  const [syncScroll, setSyncScroll]   = useState(true)
  const [cmdOpen, setCmdOpen]         = useState(false)
  const [speechActive, setSpeechActive] = useState(false)
  const [speechPaused, setSpeechPaused] = useState(false)
  const [keepAwake, setKeepAwake] = useState(false)
  const [annotations, setAnnotations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('readme-annotations') || '[]') } catch { return [] }
  })
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [annotationNote, setAnnotationNote] = useState('')
  const [selectedQuote, setSelectedQuote] = useState('')

  const activeFile = useMemo(
    () => files.find(f => f.id === activeFileId) ?? null,
    [files, activeFileId]
  )
  const content = activeFile?.content ?? ''
  const fileName = activeFile?.name ?? null
  const { meta: frontmatterMeta, body: markdownBody } = useMemo(
    () => parseFrontmatter(content),
    [content]
  )

  const fileInputRef    = useRef(null)
  const appRef          = useRef(null)
  const textareaRef     = useRef(null)
  const previewScrollRef= useRef(null)
  const searchInputRef  = useRef(null)
  const searchHitsRef   = useRef([])
  const syncLockRef     = useRef(null)
  const syncTimerRef    = useRef(null)
  const syncRafRef      = useRef(null)
  const diskHandlesRef = useRef(new Map())
  const speechRef = useRef(null)
  const broadcastRef = useRef(null)
  const remoteUpdateRef = useRef(null)
  const lastLocalEditAtRef = useRef(0)
  const syncClientIdRef = useRef(createFileId())
  const analysis = useDocumentAnalysis(content)

  const activeFont = DOC_FONTS[readerPrefs.fontIndex] ?? DOC_FONTS[0]
  const cycleDocFont = useCallback(() => {
    setReaderPrefs(p => ({ ...p, fontIndex: (p.fontIndex + 1) % DOC_FONTS.length }))
  }, [])
  const markWorkspaceEdit = useCallback(() => {
    lastLocalEditAtRef.current = Math.max(Date.now(), lastLocalEditAtRef.current + 1)
  }, [])

  // Dark mode & high-contrast mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.classList.toggle('sepia', isSepia)
    localStorage.setItem('readme-theme', theme)
  }, [theme, isDark, isSepia])

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast)
    localStorage.setItem('readme-high-contrast', String(highContrast))
  }, [highContrast])

  const toggleTheme = useCallback(() => {
    setTheme(t => {
      if (!ENABLE_SEPIA_THEME) return t === 'dark' ? 'light' : 'dark'
      return t === 'light' ? 'dark' : t === 'dark' ? 'sepia' : 'light'
    })
    setThemeKey(k => k + 1)
  }, [])

  // Sync in-memory file list + active tab to browser localStorage (best-effort)
  useEffect(() => {
    let cancelled = false
    readWorkspace().then(saved => {
      if (cancelled) return
      if (saved?.files && Array.isArray(saved.files)) {
        setFiles(saved.files)
        saved.files.forEach(file => { if (file.diskHandle) diskHandlesRef.current.set(file.id, file.diskHandle) })
        setActiveFileId(saved.files.some(file => file.id === saved.activeId) ? saved.activeId : saved.files[0]?.id ?? null)
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setWorkspaceReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('readme-files', JSON.stringify(files.map(({ id, name, content }) => ({ id, name, content }))))
        if (activeFileId) localStorage.setItem('readme-active-file', activeFileId)
        else localStorage.removeItem('readme-active-file')
      } catch {
        // Quota exceeded or storage disabled — keep everything working in memory
      }
      if (workspaceReady) writeWorkspace({ files, activeId: activeFileId }).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [files, activeFileId, workspaceReady])

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const channel = new BroadcastChannel('readme-workspace-sync')
    broadcastRef.current = channel
    channel.onmessage = ({ data }) => {
      if (!data || data.source === syncClientIdRef.current || !Array.isArray(data.files)) return
      const updatedAt = Number(data.updatedAt) || 0
      if (updatedAt <= lastLocalEditAtRef.current) return
      lastLocalEditAtRef.current = updatedAt
      remoteUpdateRef.current = JSON.stringify({
        files: data.files.map(({ id, name, content }) => ({ id, name, content })),
        activeId: data.activeId ?? null,
      })
      setFiles(data.files)
      setActiveFileId(data.activeId ?? null)
    }
    return () => { channel.close(); broadcastRef.current = null }
  }, [])

  useEffect(() => {
    const safeFiles = files.map(({ id, name, content }) => ({ id, name, content }))
    const snapshot = JSON.stringify({ files: safeFiles, activeId: activeFileId })
    if (remoteUpdateRef.current === snapshot) { remoteUpdateRef.current = null; return }
    remoteUpdateRef.current = null
    const timer = setTimeout(() => {
      try { broadcastRef.current?.postMessage({ source: syncClientIdRef.current, files: safeFiles, activeId: activeFileId, updatedAt: lastLocalEditAtRef.current }) } catch { /* handles may not be cloneable in this browser */ }
    }, 180)
    return () => clearTimeout(timer)
  }, [files, activeFileId])

  useEffect(() => {
    try { localStorage.setItem('readme-reader-prefs', JSON.stringify(readerPrefs)) } catch { /* ignore */ }
  }, [readerPrefs])

  useEffect(() => {
    try { localStorage.setItem('readme-reading-bookmarks', JSON.stringify(readingBookmarks)) } catch { /* ignore */ }
  }, [readingBookmarks])

  useEffect(() => {
    try { localStorage.setItem('readme-annotations', JSON.stringify(annotations)) } catch { /* ignore */ }
  }, [annotations])

  useEffect(() => {
    if (!keepAwake || !('wakeLock' in navigator)) return
    let sentinel
    let disposed = false
    const request = async () => {
      try { sentinel = await navigator.wakeLock.request('screen') } catch { /* unavailable or denied */ }
    }
    const onVisibility = () => { if (document.visibilityState === 'visible' && !sentinel?.released) request() }
    request()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (!disposed) return
      sentinel?.release().catch(() => {})
    }
  }, [keepAwake])

  useEffect(() => () => {
    window.speechSynthesis?.cancel()
    speechRef.current = null
  }, [])

  useEffect(() => {
    window.speechSynthesis?.cancel()
    speechRef.current = null
    setSpeechActive(false)
    setSpeechPaused(false)
  }, [activeFileId])

  const activeBookmark = activeFileId ? readingBookmarks[activeFileId] : null
  const saveReadingBookmark = useCallback(() => {
    if (!activeFileId || !previewScrollRef.current) return
    const scroller = previewScrollRef.current
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const ratio = maxScroll > 0 ? scroller.scrollTop / maxScroll : 0
    setReadingBookmarks(prev => ({
      ...prev,
      [activeFileId]: { ratio, progress: Math.round(ratio * 100), savedAt: Date.now() },
    }))
  }, [activeFileId])

  const jumpToReadingBookmark = useCallback(() => {
    if (!activeFileId) return
    const bookmark = readingBookmarks[activeFileId]
    if (!bookmark) return
    requestAnimationFrame(() => {
      const scroller = previewScrollRef.current
      if (!scroller) return
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      scroller.scrollTo({ top: maxScroll * bookmark.ratio, behavior: 'smooth' })
    })
  }, [activeFileId, readingBookmarks])

  // Cmd/Ctrl + K opens Command Palette; Cmd/Ctrl + F opens in-document search; Esc closes overlays
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && view !== 'editor' && activeFile) {
        e.preventDefault()
        setSearchOpen(true)
        requestAnimationFrame(() => searchInputRef.current?.focus())
      } else if (e.key === 'Escape') {
        if (cmdOpen) setCmdOpen(false)
        else if (lightboxImg) setLightboxImg(null)
        else if (searchOpen) setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, activeFile, cmdOpen, lightboxImg, searchOpen])

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

  // TOC (computed from body without YAML frontmatter)
  const headings = analysis.headings

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
  }, [activeFileId, content, view, mobileTab])

  const navigateToHeading = useCallback((id) => {
    const el = previewScrollRef.current?.querySelector(`[id="${id}"]`)
    if (!el) return
    const container = previewScrollRef.current
    const elTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollBy({ top: elTop - 20, behavior: 'smooth' })
  }, [])

  // Scroll-to-top & reading progress in preview
  useEffect(() => {
    const el = previewScrollRef.current
    if (!el) return
    const onScroll = () => {
      setShowScrollTop(el.scrollTop > 320)
      const max = el.scrollHeight - el.clientHeight
      setReadProgress(max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 0)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [activeFileId, content, view, mobileTab])

  // In-document search highlighting (DOM TreeWalker with clean teardown)
  useEffect(() => {
    const root = previewScrollRef.current?.querySelector('.rm-prose')
    const q = searchQuery.trim()
    const lowerQuery = q.toLocaleLowerCase()
    const safeToPrefilter = /^[\p{L}\p{N}\s-]+$/u.test(lowerQuery)
    if (!root || !searchOpen || !q || (safeToPrefilter && !analysis.searchIndex.includes(lowerQuery))) {
      searchHitsRef.current = []
      setSearchCount(0)
      return
    }

    const lowerQ = q.toLowerCase()
    const hits = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
        if (node.parentElement?.closest('.cm-editor, script, style')) return NodeFilter.FILTER_REJECT
        return node.nodeValue.toLowerCase().includes(lowerQ)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      },
    })

    const nodes = []
    let curr
    while ((curr = walker.nextNode())) nodes.push(curr)

    for (const textNode of nodes) {
      const text = textNode.nodeValue
      const lower = text.toLowerCase()
      let idx = lower.indexOf(lowerQ)
      if (idx === -1) continue
      const frag = document.createDocumentFragment()
      let last = 0
      while (idx !== -1) {
        if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)))
        const mark = document.createElement('mark')
        mark.className = 'rm-search-hit'
        mark.textContent = text.slice(idx, idx + q.length)
        frag.appendChild(mark)
        hits.push(mark)
        last = idx + q.length
        idx = lower.indexOf(lowerQ, last)
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
      textNode.parentNode?.replaceChild(frag, textNode)
    }

    searchHitsRef.current = hits
    setSearchCount(hits.length)
    setSearchIndex(prev => (hits.length ? Math.min(prev, hits.length - 1) : 0))

    return () => {
      for (const mark of hits) {
        const parent = mark.parentNode
        if (!parent) continue
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      }
      searchHitsRef.current = []
    }
  }, [searchOpen, searchQuery, content, activeFileId, view, mobileTab, analysis.searchIndex])

  useEffect(() => {
    const hits = searchHitsRef.current
    if (!hits.length) return
    hits.forEach((m, i) => m.classList.toggle('current', i === searchIndex))
    hits[searchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchIndex, searchCount])

  useEffect(() => {
    const root = previewScrollRef.current?.querySelector('.rm-prose')
    if (!root || !window.CSS?.highlights || !window.Highlight) return
    if (!document.getElementById('readme-highlight-style')) {
      const style = document.createElement('style')
      style.id = 'readme-highlight-style'
      style.textContent = '::highlight(readme-annotations) { background: rgba(250, 204, 21, .34); color: inherit; text-decoration: underline; text-decoration-color: rgba(202, 138, 4, .75); text-decoration-thickness: 1px; }'
      document.head.append(style)
    }
    const textNodes = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node
    let joined = ''
    while ((node = walker.nextNode())) {
      const start = joined.length
      joined += node.nodeValue || ''
      textNodes.push({ node, start, end: joined.length })
    }
    const ranges = []
    for (const annotation of annotations.filter(item => item.fileId === activeFileId)) {
      const quote = annotation.quote
      const offset = quote ? joined.indexOf(quote) : -1
      if (offset < 0) continue
      const end = offset + quote.length
      const first = textNodes.find(entry => entry.start <= offset && entry.end > offset)
      const last = textNodes.find(entry => entry.start < end && entry.end >= end)
      if (!first || !last) continue
      const range = document.createRange()
      range.setStart(first.node, offset - first.start)
      range.setEnd(last.node, end - last.start)
      ranges.push(range)
    }
    if (ranges.length) window.CSS.highlights.set('readme-annotations', new window.Highlight(...ranges))
    else window.CSS.highlights.delete('readme-annotations')
    return () => window.CSS.highlights.delete('readme-annotations')
  }, [annotations, activeFileId, content, view, mobileTab])

  const stepSearch = useCallback((dir) => {
    if (!searchCount) return
    setSearchIndex(i => (i + dir + searchCount) % searchCount)
  }, [searchCount])

  // Multi-file in-memory handlers
  const updateActiveContent = useCallback((nextContent) => {
    if (!activeFileId) return
    markWorkspaceEdit()
    setFiles(prev => prev.map(f => (f.id === activeFileId ? { ...f, content: nextContent } : f)))
  }, [activeFileId, markWorkspaceEdit])

  const handleNewFile = useCallback(() => {
    markWorkspaceEdit()
    const id = createFileId()
    setFiles(prev => [...prev, { id, name: getNextUntitledName(prev), content: '' }])
    setActiveFileId(id)
    setActiveHeadingId(null)
    setShowScrollTop(false)
    if (view === 'preview') setView('split')
    setMobileTab('editor')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [view, markWorkspaceEdit])

  const handleSelectFile = useCallback((id) => {
    if (id === activeFileId) return
    markWorkspaceEdit()
    setActiveFileId(id)
    setActiveHeadingId(null)
    setShowScrollTop(false)
    previewScrollRef.current?.scrollTo({ top: 0 })
  }, [activeFileId, markWorkspaceEdit])

  const handleCloseFile = useCallback((id) => {
    const idx = files.findIndex(f => f.id === id)
    if (idx === -1) return
    markWorkspaceEdit()
    const next = files.filter(f => f.id !== id)
    setFiles(next)
    if (id === activeFileId) {
      const fallback = next[idx] ?? next[idx - 1] ?? null
      setActiveFileId(fallback?.id ?? null)
      setActiveHeadingId(null)
      setShowScrollTop(false)
    }
  }, [files, activeFileId, markWorkspaceEdit])

  const handleRenameFile = useCallback((id, rawName) => {
    const trimmed = rawName.trim()
    if (!trimmed) return
    markWorkspaceEdit()
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, name: trimmed } : f)))
  }, [markWorkspaceEdit])

  const handleFiles = useCallback(async (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    const valid = incoming.filter(f => /\.(md|markdown|txt)$/i.test(f.name))
    const invalidCount = incoming.length - valid.length
    if (!valid.length) {
      alert('Please upload .md, .markdown, or .txt files')
      return
    }
    try {
      const loaded = await Promise.all(
        valid.map(async f => {
          const id = createFileId()
          if (f.readmeHandle) diskHandlesRef.current.set(id, f.readmeHandle)
          return { id, name: f.readmePath || f.name, content: await readFileAsText(f), ...(f.readmeHandle ? { diskHandle: f.readmeHandle } : {}) }
        })
      )
      markWorkspaceEdit()
      setFiles(prev => [...prev, ...loaded])
      setActiveFileId(loaded[0].id)
      setActiveHeadingId(null)
      setShowScrollTop(false)
      setMobileTab('preview')
      if (invalidCount > 0) {
        alert(`${invalidCount} unsupported file(s) skipped. Only .md, .markdown, and .txt files are supported.`)
      }
    } catch (err) {
      console.error('Failed to read uploaded file(s)', err)
      alert('Failed to read one or more files. Please try again.')
    }
  }, [markWorkspaceEdit])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.items || [])
    const fileSystemHandles = await Promise.all(items.map(item => item.getAsFileSystemHandle?.()?.catch(() => null)))
    const collected = []
    const walk = async (handle, prefix = '') => {
      if (!handle) return
      if (handle.kind === 'file') {
        if (/\.(md|markdown|txt)$/i.test(handle.name)) {
          const file = await handle.getFile()
          collected.push(Object.assign(file, { readmeHandle: handle, readmePath: `${prefix}${handle.name}` }))
        }
      } else if (handle.kind === 'directory') {
        for await (const child of handle.values()) await walk(child, `${prefix}${handle.name}/`)
      }
    }
    if (fileSystemHandles.some(Boolean)) {
      for (const handle of fileSystemHandles) await walk(handle)
      await handleFiles(collected)
    } else {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])
  const handleDragOver  = useCallback(e => { e.preventDefault(); setIsDragging(true)  }, [])
  const handleDragLeave = useCallback(e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }, [])

  const handleOpenDiskFiles = useCallback(async () => {
    if (!window.showOpenFilePicker) { fileInputRef.current?.click(); return }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }] })
      const loaded = await Promise.all(handles.map(async handle => {
        const file = await handle.getFile()
        const id = createFileId()
        diskHandlesRef.current.set(id, handle)
        return { id, name: file.name, content: await readFileAsText(file), diskHandle: handle }
      }))
      if (loaded.length) {
        markWorkspaceEdit()
        setFiles(prev => [...prev, ...loaded])
        setActiveFileId(loaded[0].id)
        setMobileTab('preview')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') { console.error('Open file failed', error); fileInputRef.current?.click() }
    }
  }, [markWorkspaceEdit])

  const handleSaveInPlace = useCallback(async () => {
    if (!activeFile) return
    let handle = diskHandlesRef.current.get(activeFile.id) || activeFile.diskHandle
    try {
      if (!handle && window.showSaveFilePicker) {
        handle = await window.showSaveFilePicker({ suggestedName: fileName || 'document.md', types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }] })
        diskHandlesRef.current.set(activeFile.id, handle)
      }
      if (!handle) {
        const download = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(new Blob([content], { type: 'text/markdown' })),
          download: fileName || 'document.md',
        })
        download.click()
        URL.revokeObjectURL(download.href)
        return
      }
      if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted' && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
        alert('Allow file access to save this document in place.')
        return
      }
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
    } catch (error) {
      if (error?.name !== 'AbortError') { console.error('Save file failed', error); alert('Could not save this file. Use Download as a fallback.') }
    }
  }, [activeFile, content, fileName])

  const handleImportUrl = useCallback(async () => {
    const url = window.prompt('Paste a public Markdown file URL (the server must allow CORS):')
    if (!url) return
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https URL')
      const response = await fetch(parsed.href)
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      const markdown = await response.text()
      const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || 'remote-document.md')
      const id = createFileId()
      markWorkspaceEdit()
      setFiles(prev => [...prev, { id, name: /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`, content: markdown }])
      setActiveFileId(id)
      setMobileTab('preview')
    } catch (error) {
      alert(`Could not import URL: ${error.message}. Cross-origin servers must allow browser CORS access.`)
    }
  }, [markWorkspaceEdit])

  const toggleSpeech = useCallback(() => {
    if (!('speechSynthesis' in window)) return
    if (speechActive && !speechPaused) {
      window.speechSynthesis.pause(); setSpeechPaused(true); return
    }
    if (speechPaused) {
      window.speechSynthesis.resume(); setSpeechPaused(false); return
    }
    const article = previewScrollRef.current?.querySelector('.rm-prose')
    const clone = article?.cloneNode(true)
    clone?.querySelectorAll('pre, .code-block, .mermaid-block, .code-actions, .heading-anchor, button, svg, table, img').forEach(node => node.remove())
    const text = clone?.innerText?.trim() || content.replace(/```[\s\S]*?```/g, ' code block ')
    if (!text) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => { setSpeechActive(false); setSpeechPaused(false); speechRef.current = null }
    utterance.onerror = utterance.onend
    speechRef.current = utterance
    setSpeechActive(true); setSpeechPaused(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }, [speechActive, speechPaused, content])

  const captureSelection = useCallback(() => {
    const quote = window.getSelection()?.toString().trim()
    if (!quote) return
    setSelectedQuote(quote)
    setAnnotationText(quote)
    setAnnotationNote('')
    setAnnotationOpen(true)
  }, [])

  const saveAnnotation = useCallback(() => {
    if (!activeFileId || !annotationText.trim()) return
    setAnnotations(prev => [...prev, { id: createFileId(), fileId: activeFileId, quote: annotationText.trim(), note: annotationNote.trim(), headingId: activeHeadingId, progress: readProgress, createdAt: Date.now() }])
    window.getSelection()?.removeAllRanges?.()
    setSelectedQuote('')
    setAnnotationOpen(false)
  }, [activeFileId, annotationText, annotationNote, activeHeadingId, readProgress])

  const handleDownload = useCallback(() => {
    if (!activeFile) return
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type: 'text/markdown' })),
      download: fileName || 'document.md',
    })
    a.click(); URL.revokeObjectURL(a.href)
  }, [activeFile, content, fileName])

  // Use the browser's print layout engine so text, code colors, and diagrams
  // remain vector content instead of rasterized screenshots.
  const handleExportPdf = useCallback(() => {
    const sourceArticle = previewScrollRef.current?.querySelector('.book-page')
    if (!sourceArticle) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Allow pop-ups for this page to print or save as PDF.')
      return
    }

    try {
      const printDocument = printWindow.document
      printDocument.documentElement.className = document.documentElement.className
      printDocument.documentElement.lang = document.documentElement.lang || 'en'
      printDocument.title = `${(fileName || 'Document').replace(/\.[^.]+$/, '')} — Print`

      const base = printDocument.createElement('base')
      base.href = document.baseURI
      printDocument.head.append(base)

      document.head.querySelectorAll('link[rel="stylesheet"], style').forEach(sourceStyle => {
        const copiedStyle = sourceStyle.cloneNode(true)
        if (copiedStyle.tagName === 'LINK') copiedStyle.href = sourceStyle.href
        printDocument.head.append(copiedStyle)
      })

      const printStyles = printDocument.createElement('style')
      printStyles.textContent = `
        @page { size: A4 portrait; margin: 16mm; }
        html, body { width: auto !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
        body { display: block !important; margin: 0 !important; padding: 0 !important; background: var(--bg-preview) !important; color: var(--text-1) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .book-page { width: auto !important; max-width: 100% !important; margin: 0 auto !important; box-shadow: none !important; }
        .rm-prose { max-width: none !important; }
        .rm-prose h1, .rm-prose h2, .rm-prose h3 { break-after: avoid-page; page-break-after: avoid; }
        .rm-prose p, .rm-prose li { orphans: 3; widows: 3; }
        .rm-prose table, .rm-prose tr, .code-wrapper, blockquote, img, .mermaid-svg { break-inside: avoid-page; page-break-inside: avoid; }
        .code-body { overflow: visible !important; }
        .code-body pre { white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
        *, *::before, *::after { animation: none !important; transition: none !important; }
      `
      printDocument.head.append(printStyles)

      const article = sourceArticle.cloneNode(true)
      article.querySelectorAll('.book-folio-header, .book-folio-footer, .heading-anchor, .code-actions, button').forEach(element => element.remove())
      article.querySelectorAll('*').forEach(element => {
        Array.from(element.classList).filter(className => className.startsWith('anim-')).forEach(className => element.classList.remove(className))
      })
      article.classList.remove('anim-slide-up')
      printDocument.body.replaceChildren(article)

      printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true })
      const startPrint = () => {
        printWindow.requestAnimationFrame(() => {
          printWindow.focus()
          printWindow.print()
        })
      }
      const stylesheetLoads = Array.from(printDocument.querySelectorAll('link[rel="stylesheet"]')).map(link => {
        if (link.sheet) return Promise.resolve()
        return new Promise(resolve => {
          link.addEventListener('load', resolve, { once: true })
          link.addEventListener('error', resolve, { once: true })
        })
      })
      Promise.all([...stylesheetLoads, printDocument.fonts?.ready]).then(startPrint, startPrint)
    } catch (error) {
      printWindow.close()
      console.error('Could not prepare the print view', error)
      alert('Could not prepare the print view. Please try again.')
    }
  }, [fileName])

  const handleCopyAll = useCallback(async () => {
    try {
      const article = previewScrollRef.current?.querySelector('.rm-prose')
      if (navigator.clipboard?.write && window.ClipboardItem && article) {
        const clone = article.cloneNode(true)
        clone.querySelectorAll('button, .heading-anchor, svg').forEach(node => node.remove())
        const html = clone.innerHTML
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([content], { type: 'text/plain' }),
        })])
      } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content)
      else throw new Error('Clipboard is unavailable')
      setCopyAllDone(true)
      setTimeout(() => setCopyAllDone(false), 2000)
    } catch (error) {
      console.error('Copy failed', error)
      alert('Could not access the clipboard. Check browser clipboard permissions.')
    }
  }, [content])

  const handleCreateFromTemplate = useCallback((tpl) => {
    markWorkspaceEdit()
    const id = createFileId()
    setFiles(prev => {
      const taken = new Set(prev.map(f => f.name.toLowerCase()))
      let name = tpl.fileName
      if (taken.has(name.toLowerCase())) {
        const dot = name.lastIndexOf('.')
        const base = dot > -1 ? name.slice(0, dot) : name
        const ext = dot > -1 ? name.slice(dot) : '.md'
        let n = 2
        while (taken.has(`${base}-${n}${ext}`.toLowerCase())) n += 1
        name = `${base}-${n}${ext}`
      }
      return [...prev, { id, name, content: tpl.content }]
    })
    setActiveFileId(id)
    setActiveHeadingId(null)
    setShowScrollTop(false)
    if (view === 'preview') setView('split')
    setMobileTab('editor')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [view, markWorkspaceEdit])

  const handleExportHtml = useCallback(() => {
    const article = previewScrollRef.current?.querySelector('.book-page')
    if (!article) return
    const docTitle = (fileName ? fileName.replace(/\.[^.]+$/, '') : headings[0]?.text) || 'Document'
    const clone = article.cloneNode(true)
    clone.querySelectorAll('.heading-anchor, .code-actions, .book-folio-footer').forEach(el => el.remove())

    const html = `<!doctype html>
<html lang="en"${isDark ? ' class="dark"' : ''}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${docTitle.replace(/</g, '&lt;')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css" />
<style>
  :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
  body { margin: 0; padding: 36px 20px; font-family: ${activeFont.family}; background: ${isDark ? '#121320' : isSepia ? '#e7e3dc' : '#ebecf6'}; color: ${isDark ? '#d8ddf6' : isSepia ? '#514d46' : '#2f3460'}; line-height: 1.8; }
  .page { max-width: 780px; margin: 0 auto; padding: 44px 48px; border-radius: 14px; background: ${isDark ? '#1b1c2f' : isSepia ? '#faf8f3' : '#fcfaf5'}; border: 1px solid ${isDark ? '#262842' : isSepia ? '#d8d2c8' : '#dfe2f0'}; box-shadow: 0 14px 36px rgba(0,0,0,0.12); }
  h1,h2,h3 { color: ${isDark ? '#f3f5ff' : isSepia ? '#35332f' : '#14172b'}; line-height: 1.25; }
  h1 { border-bottom: 1px solid ${isDark ? '#262842' : isSepia ? '#d8d2c8' : '#dfe2f0'}; padding-bottom: 12px; }
  a { color: ${isDark ? '#a78bfa' : isSepia ? '#79664f' : '#6d28d9'}; }
  pre { padding: 14px 16px; border-radius: 10px; overflow-x: auto; background: ${isDark ? '#16182a' : isSepia ? '#efede7' : '#f2f3f9'}; border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : isSepia ? '#d8d2c8' : '#d5d8ec'}; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; }
  blockquote { margin: 1.4rem 0; padding: 12px 18px; border-left: 3.5px solid ${isDark ? '#a78bfa' : isSepia ? '#79664f' : '#6d28d9'}; background: ${isDark ? 'rgba(167,139,250,0.1)' : isSepia ? 'rgba(121,102,79,0.07)' : 'rgba(109,40,217,0.07)'}; border-radius: 0 8px 8px 0; }
  table { width: 100%; border-collapse: collapse; margin: 1.4rem 0; }
  th, td { padding: 8px 12px; border: 1px solid ${isDark ? '#262842' : isSepia ? '#d8d2c8' : '#dfe2f0'}; text-align: left; }
  img { max-width: 100%; border-radius: 10px; }
  .frontmatter-card { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .frontmatter-pill { padding: 3px 10px; border-radius: 99px; font-size: 12px; border: 1px solid ${isDark ? '#262842' : isSepia ? '#d8d2c8' : '#dfe2f0'}; }
</style>
</head>
<body><div class="page">${clone.innerHTML}</div></body>
</html>`
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([html], { type: 'text/html' })),
      download: `${docTitle}.html`,
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }, [fileName, headings, isDark, isSepia, activeFont])

  const handleExportZip = useCallback(async () => {
    if (!files.length) return
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const used = new Set()
    for (const f of files) {
      let name = f.name || 'document.md'
      if (used.has(name.toLowerCase())) {
        const dot = name.lastIndexOf('.')
        const base = dot > -1 ? name.slice(0, dot) : name
        const ext = dot > -1 ? name.slice(dot) : '.md'
        let n = 2
        while (used.has(`${base}-${n}${ext}`.toLowerCase())) n += 1
        name = `${base}-${n}${ext}`
      }
      used.add(name.toLowerCase())
      zip.file(name, f.content)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'readme-workspace.zip',
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }, [files])

  const handleSyncEditorScroll = useCallback(() => {
    if (!syncScroll || syncLockRef.current === 'preview') return
    const ed = textareaRef.current
    const pv = previewScrollRef.current
    if (!ed || !pv) return
    syncLockRef.current = 'editor'
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => { syncLockRef.current = null }, 120)
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current)
    syncRafRef.current = requestAnimationFrame(() => {
      const maxEd = ed.scrollHeight - ed.clientHeight
      const maxPv = pv.scrollHeight - pv.clientHeight
      if (maxEd > 0 && maxPv > 0) {
        pv.scrollTop = (ed.scrollTop / maxEd) * maxPv
      }
    })
  }, [syncScroll])

  const handleSyncPreviewScroll = useCallback(() => {
    if (!syncScroll || syncLockRef.current === 'editor') return
    const ed = textareaRef.current
    const pv = previewScrollRef.current
    if (!ed || !pv) return
    syncLockRef.current = 'preview'
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => { syncLockRef.current = null }, 120)
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current)
    syncRafRef.current = requestAnimationFrame(() => {
      const maxEd = ed.scrollHeight - ed.clientHeight
      const maxPv = pv.scrollHeight - pv.clientHeight
      if (maxEd > 0 && maxPv > 0) {
        ed.scrollTop = (pv.scrollTop / maxPv) * maxEd
      }
    })
  }, [syncScroll])

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current)
  }, [])

  const paletteActions = useMemo(() => [
    { id: 'new', label: 'New blank file', hint: 'Action', icon: FilePlus, run: handleNewFile },
    { id: 'upload', label: 'Open files…', hint: 'Action', icon: Upload, run: handleOpenDiskFiles },
    { id: 'url-import', label: 'Import Markdown from URL…', hint: 'Action', icon: Globe, run: handleImportUrl },
    { id: 'wide', label: readerPrefs.width === 'full' ? 'Switch to Book page width' : 'Expand to Wide mode', hint: 'Reader', icon: UnfoldHorizontal, run: () => setReaderPrefs(p => ({ ...p, width: p.width === 'full' ? 'book' : 'full' })) },
    { id: 'sepia', label: readerPrefs.paper === 'sepia' ? 'Paper tone: Ivory' : 'Paper tone: Sepia', hint: 'Reader', icon: BookOpen, run: () => setReaderPrefs(p => ({ ...p, paper: p.paper === 'sepia' ? 'ivory' : 'sepia' })) },
    { id: 'contrast', label: highContrast ? 'Disable High Contrast' : 'Enable High Contrast', hint: 'Theme', icon: Contrast, run: () => setHighContrast(h => !h) },
    { id: 'theme', label: `Switch to ${ENABLE_SEPIA_THEME && theme === 'dark' ? 'Sepia' : isDark ? 'Light' : 'Dark'} mode`, hint: 'Theme', icon: ENABLE_SEPIA_THEME && theme === 'sepia' ? BookOpen : isDark ? Sun : Moon, run: toggleTheme },
    { id: 'sync', label: syncScroll ? 'Disable Synchronized Scroll' : 'Enable Synchronized Scroll', hint: 'Editor', icon: Link2, run: () => setSyncScroll(s => !s) },
    ...(activeFile ? [
      { id: 'dl-md', label: 'Download Markdown (.md)', hint: 'Export', icon: Download, run: handleDownload },
      { id: 'dl-html', label: 'Export Standalone HTML (.html)', hint: 'Export', icon: FileCode2, run: handleExportHtml },
    { id: 'dl-pdf', label: 'Print / Save as PDF', hint: 'Export', icon: FileDown, run: handleExportPdf },
    ] : []),
    ...(files.length > 0 ? [
      { id: 'dl-zip', label: `Export All Files (${files.length}) as ZIP`, hint: 'Export', icon: FileArchive, run: handleExportZip },
    ] : []),
  ], [
    handleNewFile, handleOpenDiskFiles, handleImportUrl, readerPrefs.width, readerPrefs.paper, highContrast, theme, isDark,
    toggleTheme, syncScroll, activeFile, files.length, handleDownload,
    handleExportHtml, handleExportPdf, handleExportZip,
  ])

  const wordCount   = analysis.wordCount
  const lineCount   = analysis.lineCount
  const readingTime = useMemo(() => Math.max(1, Math.ceil(wordCount / 220)), [wordCount])

  const showEditor  = view !== 'preview'
  const showPreview = view !== 'editor'
  const editorWidth  = VIEW_MODES.find(v => v.id === view)?.edW ?? '50%'
  const previewWidth = VIEW_MODES.find(v => v.id === view)?.pvW ?? '50%'

  useEffect(() => { setTocVisible(view === 'preview' || view === 'focus') }, [view])

  return (
    <div
      ref={appRef}
      className={`h-screen flex flex-col app-shell overflow-hidden anim-fade-in${isSepia ? ' sepia' : ''}${isSepia && highContrast ? ' high-contrast' : ''}`}
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
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Drop your Markdown files</p>
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

          <div className="flex items-center gap-1">
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
            <button
              onClick={() => setCmdOpen(true)}
              data-tooltip="Command palette (Cmd/Ctrl + K)"
              aria-label="Command palette"
              className="btn-icon hidden sm:flex"
            >
              <Command size={15} />
            </button>
            <button onClick={handleNewFile} data-tooltip="Create a new Markdown file" aria-label="New file" className="btn-header">
              <FilePlus size={14} /><span className="hidden sm:inline">New</span>
            </button>
            <button onClick={handleOpenDiskFiles} className="btn-header" data-tooltip="Open Markdown files or folders" aria-label="Open Markdown files or folders">
              <Upload size={13} /><span className="hidden sm:inline">Upload</span>
            </button>
            <DownloadMenuButton
              disabled={!activeFile}
              canExportPdf={Boolean(activeFile && content.trim())}
              fileCount={files.length}
              onDownloadMd={handleDownload}
              onExportPdf={handleExportPdf}
              onExportHtml={handleExportHtml}
              onExportZip={handleExportZip}
            />
            <button onClick={handleImportUrl} className="btn-icon hidden sm:flex" data-tooltip="Import Markdown from URL" aria-label="Import Markdown from URL">
              <Globe size={14} />
            </button>
            <button onClick={handleSaveInPlace} disabled={!activeFile} className="btn-icon hidden sm:flex disabled:opacity-40" data-tooltip="Save file in place or choose a location" aria-label="Save file in place">
              <Save size={14} />
            </button>
            <button onClick={toggleFullscreen} data-tooltip={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="btn-icon hidden sm:flex">
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              onClick={cycleDocFont}
              data-tooltip={`Reading font: ${activeFont.label} (click to change)`}
              aria-label={`Reading font ${activeFont.label} (${readerPrefs.fontIndex + 1} of ${DOC_FONTS.length}). Click to change.`}
              className="btn-icon"
              style={{ position: 'relative' }}
            >
              <Type size={15} />
              <span className="font-cycle-badge">{activeFont.label.slice(0, 2).toUpperCase()}</span>
            </button>
            <button
              onClick={() => setHighContrast(h => !h)}
              data-tooltip={highContrast ? 'Standard contrast' : 'High contrast'}
              aria-label={highContrast ? 'Standard contrast' : 'High contrast'}
              aria-pressed={highContrast}
              className="btn-icon"
              style={highContrast ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' } : undefined}
            >
              <Contrast size={15} />
            </button>
            <button onClick={toggleTheme} data-tooltip={`Color mode: ${theme[0].toUpperCase()}${theme.slice(1)} (click to change)`} aria-label={`Color mode ${theme}. Click to switch to ${ENABLE_SEPIA_THEME && theme === 'dark' ? 'sepia' : isDark ? 'light' : 'dark'} mode.`} className="btn-icon" key={themeKey}>
              {ENABLE_SEPIA_THEME && theme === 'sepia'
                ? <BookOpen size={15} className="theme-icon-enter" style={{ color: '#a16207' }} />
                : isDark
                  ? <Sun size={15} className="theme-icon-enter" style={{ color: '#f59e0b' }} />
                  : <Moon size={15} className="theme-icon-enter" />
              }
            </button>
          </div>
        </div>
      </header>

      {/* ── File Tabs ─────────────────────────────────── */}
      <FileTabBar
        files={files}
        activeFileId={activeFileId}
        onSelect={handleSelectFile}
        onClose={handleCloseFile}
        onCreate={handleNewFile}
        onRename={handleRenameFile}
      />

      {/* Mobile tabs */}
      {activeFile && (
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
      )}

      {/* ── Main ──────────────────────────────────────── */}
      <main className="flex-1 flex min-h-0">
        {!activeFile ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 surface-preview anim-fade-in">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 anim-pop-in"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
              <FileText size={34} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
              No files open
            </p>
            <p className="text-sm leading-relaxed max-w-sm" style={{ color: 'var(--text-4)' }}>
              Create a new Markdown file or upload one or more files. Everything stays in memory in your browser.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={handleNewFile} className="btn-primary">
                <FilePlus size={14} /> New file
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                <Upload size={13} /> Upload files
              </button>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-md">
              {MD_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => handleCreateFromTemplate(tpl)}
                  className="reader-chip !flex-none px-3 py-1.5 flex items-center gap-1.5"
                >
                  <LayoutTemplate size={11} style={{ color: 'var(--accent)' }} />
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
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
              <FormattingToolbar
                textareaRef={textareaRef}
                content={content}
                onChange={updateActiveContent}
                onCreateFromTemplate={handleCreateFromTemplate}
              />

              {/* Stats bar */}
              <div className="no-print shrink-0 flex items-center justify-between px-4 py-1.5 surface-toolbar"
                style={{ borderTop: 'none' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <AlignLeft size={11} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                  <span className="truncate" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
                    {fileName || 'Markdown'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSyncScroll(s => !s)}
                    data-tooltip={syncScroll ? 'Synchronized scroll on' : 'Synchronized scroll off'}
                    aria-label={syncScroll ? 'Synchronized scroll on' : 'Synchronized scroll off'}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                    style={{
                      fontSize: 10, fontWeight: 500,
                      color: syncScroll ? 'var(--accent)' : 'var(--text-4)',
                      background: syncScroll ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <Link2 size={10} />
                    <span>Sync</span>
                  </button>
                  <span style={{ fontSize: 10, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                    {lineCount} lines · {wordCount} words
                  </span>
                  <button onClick={() => updateActiveContent('')} data-tooltip="Clear editor" aria-label="Clear editor"
                    className="cursor-pointer transition-colors"
                    style={{ color: 'var(--text-4)' }}
                    onMouseOver={e => e.currentTarget.style.color = '#f38ba8'}
                    onMouseOut={e  => e.currentTarget.style.color = 'var(--text-4)'}>
                    <X size={11} />
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <div
                className="flex-1 overflow-auto grid-pattern"
                style={{ background: 'var(--bg-editor)' }}
              >
                <textarea
                  ref={textareaRef}
                  onScroll={handleSyncEditorScroll}
                  className="editor-textarea"
                  value={content}
                  onChange={e => updateActiveContent(e.target.value)}
                  placeholder={'# Start typing Markdown…\n\nOr drag & drop .md files anywhere.'}
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
              <div className="no-print shrink-0 flex items-center justify-between gap-3 px-4 py-1.5 surface-toolbar relative reader-preview-toolbar">
                <div className="flex items-center gap-2 reader-toolbar-left">
                  <button
                    onClick={() => setTocVisible(v => !v)}
                    data-tooltip={tocVisible ? 'Hide outline' : 'Show outline'}
                    aria-label={tocVisible ? 'Hide outline' : 'Show outline'}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-all"
                    style={{
                      background: tocVisible ? 'var(--accent-soft)' : 'transparent',
                      color: tocVisible ? 'var(--accent)' : 'var(--text-4)',
                      border: '1px solid', borderColor: tocVisible ? 'var(--accent-border)' : 'transparent',
                      fontSize: 10, fontWeight: 500,
                    }}
                  >
                    {tocVisible ? <PanelLeftClose size={11} /> : <PanelLeftOpen size={11} />}
                    <span className="hidden sm:inline reader-toolbar-label">Outline</span>
                  </button>
                  <BookOpen size={11} style={{ color: 'var(--text-4)' }} />
                  <span className="hidden md:inline reader-toolbar-label" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
                    Reader
                  </span>
                </div>
                <div className="flex items-center gap-2.5 reader-toolbar-controls">
                  {wordCount > 0 && (
                    <span className="status-badge" title={`${readProgress}% read · ~${readingTime} min read`}>
                      <span className="tabular-nums">{readProgress}%</span><span className="reader-toolbar-label"> · </span>
                      <span className="reader-toolbar-full-time reader-toolbar-label">~{readingTime} min read</span>
                      <span className="reader-toolbar-compact-time">~{readingTime}m</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={saveReadingBookmark}
                    disabled={!activeFile}
                    data-tooltip={activeBookmark ? 'Update saved reading position' : 'Bookmark this reading position'}
                    aria-label={activeBookmark ? 'Update bookmark at current reading position' : 'Bookmark current reading position'}
                    className="btn-icon !p-1 disabled:opacity-40"
                    style={{
                      color: activeBookmark ? 'var(--accent)' : 'var(--text-4)',
                      background: activeBookmark ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <BookmarkPlus size={12} />
                    {view === 'preview' && <span className="reader-toolbar-label text-[10px] font-medium whitespace-nowrap">{activeBookmark ? 'Update spot' : 'Save spot'}</span>}
                  </button>
                  {activeBookmark && (
                    <button
                      type="button"
                      onClick={jumpToReadingBookmark}
                      data-tooltip={`Return to saved reading position (${activeBookmark.progress}%)`}
                      aria-label={`Return to saved reading position at ${activeBookmark.progress} percent`}
                      className="btn-icon !p-1"
                      style={{ color: 'var(--accent)' }}
                    >
                      <BookmarkCheck size={12} />
                      {view === 'preview' && <span className="reader-toolbar-label text-[10px] font-medium whitespace-nowrap">Resume {activeBookmark.progress}%</span>}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleSpeech}
                    data-tooltip={!speechActive ? 'Read document aloud' : speechPaused ? 'Resume read aloud' : 'Pause read aloud'}
                    aria-label={!speechActive ? 'Read document aloud' : speechPaused ? 'Resume reading' : 'Pause reading'}
                    className="btn-icon !p-1"
                  >
                    {!speechActive ? <Volume2 size={12} /> : speechPaused ? <Play size={12} /> : <Pause size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeepAwake(value => !value)}
                    data-tooltip={keepAwake ? 'Allow screen to sleep' : 'Keep screen awake while reading'}
                    aria-label={keepAwake ? 'Allow screen to sleep' : 'Keep screen awake while reading'}
                    aria-pressed={keepAwake}
                    className="btn-icon !p-1"
                    style={{ color: keepAwake ? 'var(--accent)' : undefined }}
                  >
                    <MonitorUp size={12} />
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (window.getSelection()?.toString().trim()) captureSelection()
                        else {
                          setSelectedQuote('')
                          setAnnotationText('')
                          setAnnotationNote('')
                          setAnnotationOpen(value => !value)
                        }
                      }}
                      data-tooltip={`Highlights and notes (${annotations.filter(item => item.fileId === activeFileId).length})`}
                      aria-label="Highlights and notes"
                      className="btn-icon !p-1"
                      style={{ color: annotationOpen || annotations.some(item => item.fileId === activeFileId) ? 'var(--accent)' : undefined }}
                    >
                      <Highlighter size={12} />
                    </button>
                    {annotationOpen && (
                      <div className="reader-popover anim-drop-in no-print" style={{ right: 0, top: 'calc(100% + 8px)', width: 300 }}>
                        {selectedQuote ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Save highlight or note</div>
                            <div className="text-[11px] line-clamp-3 rounded p-2" style={{ color: 'var(--text-2)', background: 'var(--bg-editor)' }}>{selectedQuote}</div>
                            <textarea value={annotationNote} onChange={e => setAnnotationNote(e.target.value)} placeholder="Add a note (optional)" className="w-full rounded p-2 text-xs outline-none" rows={3} style={{ background: 'var(--bg-editor)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
                            <div className="flex justify-end gap-2">
                              <button className="reader-chip" onClick={() => setAnnotationOpen(false)}>Cancel</button>
                              <button className="reader-chip active" onClick={saveAnnotation}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Highlights and notes</div>
                            <div className="max-h-64 overflow-auto space-y-2">
                              {annotations.filter(item => item.fileId === activeFileId).map(item => (
                                <div key={item.id} className="rounded p-2 text-[11px]" style={{ background: 'var(--bg-editor)', color: 'var(--text-2)' }}>
                                  <button className="text-left w-full" onClick={() => {
                                    if (item.headingId) navigateToHeading(item.headingId)
                                    else previewScrollRef.current?.scrollTo({ top: previewScrollRef.current.scrollHeight * item.progress / 100, behavior: 'smooth' })
                                  }}><span className="line-clamp-3">“{item.quote}”</span>{item.note && <span className="block mt-1 opacity-80">{item.note}</span>}</button>
                                  <button className="mt-1 opacity-60 hover:opacity-100" onClick={() => setAnnotations(prev => prev.filter(value => value.id !== item.id))}>Remove</button>
                                </div>
                              ))}
                              {!annotations.some(item => item.fileId === activeFileId) && <p style={{ color: 'var(--text-4)' }}>Select text, then choose the highlighter to save it here.</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setReaderPrefs(p => ({ ...p, width: p.width === 'full' ? 'book' : 'full' }))
                    }
                    data-tooltip={readerPrefs.width === 'full' ? 'Restore book page width' : 'Expand to full width'}
                    className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                    style={{
                      fontSize: 10, fontWeight: 500,
                      color: readerPrefs.width === 'full' ? 'var(--accent)' : 'var(--text-4)',
                      background: readerPrefs.width === 'full' ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    {readerPrefs.width === 'full' ? <FoldHorizontal size={11} /> : <UnfoldHorizontal size={11} />}
                    <span className="hidden md:inline reader-toolbar-label">{readerPrefs.width === 'full' ? 'Compact' : 'Wide'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setSearchOpen(s => !s)
                      requestAnimationFrame(() => searchInputRef.current?.focus())
                    }}
                    data-tooltip="Find in document (Cmd/Ctrl + F)"
                    aria-label="Find in document"
                    className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                    style={{
                      fontSize: 10, fontWeight: 500,
                      color: searchOpen ? 'var(--accent)' : 'var(--text-4)',
                      background: searchOpen ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <Search size={11} />
                    <span className="hidden md:inline reader-toolbar-label">Find</span>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setReaderOpen(o => !o)}
                      data-tooltip="Reader comfort settings"
                      aria-label="Reader comfort settings"
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                      style={{
                        fontSize: 10, fontWeight: 600,
                        color: readerOpen ? 'var(--accent)' : 'var(--text-4)',
                        background: readerOpen ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      <Type size={11} />
                      <span className="hidden md:inline reader-toolbar-label">Aa</span>
                    </button>
                    {readerOpen && (
                      <ReaderSettingsPopover
                        prefs={readerPrefs}
                        onChange={setReaderPrefs}
                        onClose={() => setReaderOpen(false)}
                      />
                    )}
                  </div>
                  <button onClick={handleCopyAll}
                    data-tooltip={copyAllDone ? 'Markdown copied' : 'Copy Markdown'}
                    aria-label={copyAllDone ? 'Markdown copied' : 'Copy Markdown'}
                    className="reader-toolbar-copy flex shrink-0 items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                    style={{ fontSize: 10, fontWeight: 500, color: copyAllDone ? '#40a02b' : 'var(--text-4)' }}>
                    {copyAllDone ? <Check size={11} /> : <Copy size={11} />}
                    <span className="hidden sm:inline reader-toolbar-label">{copyAllDone ? 'Copied!' : 'Copy MD'}</span>
                  </button>
                </div>
              </div>

              {/* Preview body: TOC + content */}
              <div className="flex-1 flex min-h-0 relative">
                {/* Reading progress bar */}
                {content.trim() && (
                  <div className="reading-progress-track no-print">
                    <div className="reading-progress-bar" style={{ width: `${readProgress}%` }} />
                  </div>
                )}

                {/* In-document search bar */}
                {searchOpen && (
                  <div className="preview-search-bar anim-drop-in no-print">
                    <Search size={12} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setSearchIndex(0) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          stepSearch(e.shiftKey ? -1 : 1)
                        } else if (e.key === 'Escape') {
                          setSearchOpen(false)
                        }
                      }}
                      placeholder="Find in document…"
                      className="bg-transparent outline-none text-xs w-36 sm:w-44"
                      style={{ color: 'var(--text-1)' }}
                    />
                    {searchQuery.trim() && (
                      <span style={{ fontSize: 10, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                        {searchCount ? `${searchIndex + 1}/${searchCount}` : '0/0'}
                      </span>
                    )}
                    <button onClick={() => stepSearch(-1)} disabled={!searchCount} className="btn-icon !p-1" title="Previous match">
                      <ChevronUp size={12} />
                    </button>
                    <button onClick={() => stepSearch(1)} disabled={!searchCount} className="btn-icon !p-1" title="Next match">
                      <ChevronDown size={12} />
                    </button>
                    <button onClick={() => setSearchOpen(false)} className="btn-icon !p-1" title="Close search">
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* TOC */}
                <div
                  className="shrink-0 overflow-y-auto surface-toc"
                  style={{
                    width: tocVisible ? 230 : 0,
                    opacity: tocVisible ? 1 : 0,
                    overflow: tocVisible ? 'auto' : 'hidden',
                    transition: 'width .25s cubic-bezier(.4,0,.2,1), opacity .2s',
                  }}
                >
                  {tocVisible && (
                    <div className="py-3 px-2">
                      <TocSidebar headings={headings} activeId={activeHeadingId} onNavigate={navigateToHeading} />
                    </div>
                  )}
                </div>

                {/* Scrollable content — Book desk & folio page */}
                <div
                  ref={previewScrollRef}
                  onScroll={handleSyncPreviewScroll}
                  className="flex-1 overflow-auto surface-preview"
                  data-paper={readerPrefs.paper}
                >
                  {content.trim() ? (
                    <div className={readerPrefs.width === 'full' ? 'px-2 sm:px-4 py-3 sm:py-5' : 'px-4 sm:px-8 md:px-10 py-6 sm:py-9'}>
                      <article
                        className="book-page px-6 sm:px-11 md:px-14 py-8 sm:py-11 anim-slide-up"
                        data-paper={readerPrefs.paper}
                        style={{ maxWidth: READER_WIDTHS[readerPrefs.width]?.maxW ?? '740px' }}
                        onClick={e => {
                          if (e.target.tagName === 'IMG' && e.target.src) {
                            setLightboxImg({ src: e.target.src, alt: e.target.alt || '' })
                          }
                        }}
                      >
                        <div className="book-folio-header">
                          <span className="truncate">{fileName || 'Document'}</span>
                          <span className="shrink-0">{wordCount} words · ~{readingTime} min read</span>
                        </div>

                        <FrontmatterCard meta={frontmatterMeta} />

                        <div
                          className={`rm-prose ${activeFont.isSerif ? 'font-book' : ''}`}
                          style={{
                            fontSize: READER_SIZES[readerPrefs.size]?.px ?? '17px',
                            maxWidth: 'none',
                            fontFamily: activeFont.family,
                          }}
                        >
                          <MarkdownRenderer content={markdownBody} dark={isDark} />
                        </div>

                        <div className="book-folio-footer">
                          <span style={{ color: 'var(--accent)', fontSize: 13 }}>❦</span>
                          <span>End of {fileName || 'document'} · {lineCount} lines</span>
                        </div>
                      </article>
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
                        Start typing Markdown in the editor, or upload .md files using the buttons above.
                      </p>
                      <div className="mt-5 flex items-center gap-3">
                        <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
                          <Upload size={13} /> Upload files
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scroll-to-top — outside the scroll container so it stays fixed */}
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
          </>
        )}
      </main>

      {cmdOpen && (
        <CommandPalette
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          files={files}
          activeFileId={activeFileId}
          headings={headings}
          templates={MD_TEMPLATES}
          actions={paletteActions}
          onSelectFile={handleSelectFile}
          onNavigateHeading={navigateToHeading}
          onCreateFromTemplate={handleCreateFromTemplate}
        />
      )}

      {/* ── Image lightbox ────────────────────────────── */}
      {lightboxImg && (
        <div
          className="lightbox-backdrop anim-fade-in no-print"
          onClick={() => setLightboxImg(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="btn-icon absolute top-5 right-5"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            aria-label="Close image preview"
          >
            <X size={18} />
          </button>
          <img
            src={lightboxImg.src}
            alt={lightboxImg.alt}
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-[88vh] rounded-xl shadow-2xl anim-pop-in"
          />
        </div>
      )}
    </div>
  )
}
