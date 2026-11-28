import { createContext, createElement, useContext, useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import { createPortal, flushSync } from 'react-dom'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { gruvboxLight, materialOceanic, nord, okaidia, oneDark, oneLight, solarizedlight, synthwave84 } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import MermaidBlock from './components/MermaidBlock'
import CommandPalette from './components/CommandPalette'
import { MD_TEMPLATES, parseFrontmatter } from './templates'
import { rehypeHeadingSections, headingSlug, headingText } from './headingSections'
import { rehypeSourceRanges } from './previewEdit'
import { usePreviewEditing } from './usePreviewEditing'
import { rehypeCallouts, rehypeStandaloneImages } from './rehypeCallouts'
import { IMAGE_DATA_URL_RE, autoPair, continueMarkup, countWords, deletePair, formatMarkdownTables, imageFileToDataUrl, imageReferenceMarkdown } from './editorAssist'
import {
  Sun, Moon, Upload, Copy, CopyPlus, Check, FileText, FilePlus, Eye, Code2,
  X, Download, Maximize2, Minimize2, Hash, ChevronRight,
  List, AlignLeft, PanelLeftOpen, PanelLeftClose,
  Bold, Italic, Strikethrough, Link, Code, Minus,
  WrapText, ArrowUp, Heading1, Heading2, Heading3, ListOrdered, ListChecks, SquareCode, Table, Image, Superscript, MessageSquareQuote, Quote,
  FileDown, BookOpen, Search, ChevronUp, ChevronDown, Type, UnfoldHorizontal, FoldHorizontal, Contrast, BookmarkPlus, BookmarkCheck, ChevronsDownUp, ChevronsUpDown,
  Command, FileArchive, FileCode2, Link2, LayoutTemplate, Tag,
  Settings, SlidersHorizontal, FolderOpen, FolderPlus, Pencil, Trash2, Workflow, ArrowDown, Outdent, Indent, SendTo, MoreHorizontal, PanelWiden, PanelNarrow, CircleHelp, Star, Filter, Sunrise, Snowflake, SunDim, Palette, Zap, Waves, Leaf, Volume2, Pause, Play, Highlighter, RotateCcw, Pin, PinOff, Share2, Keyboard, SearchCode, History, ArchiveRestore, DatabaseBackup, Settings2, HardDrive, Replace, Presentation, FolderTree, FileWarning, Sparkles, ScrollText, RefreshCw, Loader2, BookOpenText, Crosshair, ChevronLeft, Info, Lightbulb, MessageSquareWarning, OctagonAlert, MonitorUp, MonitorDown, AppDownload, Library, ImageOff, Images, Display, Globe, Save, GitCompare, TriangleAlert, Cat, Footprints, PanelBottom, Plus,
  FolderSync,
} from './icons'
import { IconStyleContext } from './icons'
import Oneko, { ONEKO_SKINS } from 'oneko'
import { addSnapshot, readAllHistory, readHistory, readSyncFolder, readSyncState, readWorkspace, writeSyncFolder, writeSyncState, writeWorkspace } from './workspaceDb'
import { canSyncToFolder, existsInFolder, folderPermission, readFolder, removeFromFolder, syncPath, writeAttachmentsToFolder, writeToFolder } from './folderSync'
import { analyzeDocument, applyQualityFix, extractHeadings } from './documentAnalysis'
import { FILE_DRAG_TYPE, fileLinkTitle, fuzzyScore, makeDuplicateFileName, relativeFileLink, resolveFileLink, MAX_FOLDER_DEPTH, cleanFileStem, folderDepth, splitFileName } from './fileUtils'
import FileDiffView from './components/FileDiffView'
import FileTabBar from './components/FileTabBar'
import ImageLightbox from './components/ImageLightbox'
import LinkPreview from './components/LinkPreview'
import PdfExportDialog from './components/PdfExportDialog'
import PublishSiteDialog from './components/PublishSiteDialog'
import PreviewEditTools from './components/PreviewEditTools'
import PickerDropdown from './components/PickerDropdown'
import LibraryView from './components/LibraryView'
import PropertiesDialog from './components/PropertiesDialog'
import ImagesDialog from './components/ImagesDialog'
import { addTags, documentInfo, readFrontMatter, writeFrontMatter } from './library'
import { useAppInstall } from './appInstall'
import { APP_VERSION, RELEASES } from './version'
import { TIPS, TOUR_STEPS, markTourDone, markVersionSeen, startupNotice as computeStartupNotice, takeTip } from './onboarding'
import GuidedTour from './components/GuidedTour'
import StartupCard from './components/StartupCard'
import { DOC_STYLES, docStyleById, docStyleCss, documentStyleId } from './docStyles'

// Document style rules (shared with HTML / website exports), added once.
if (typeof document !== 'undefined' && !document.getElementById('doc-style-rules')) {
  const rules = document.createElement('style')
  rules.id = 'doc-style-rules'
  rules.textContent = docStyleCss()
  document.head.append(rules)
}
import { ATTACHMENT_DIR, attachmentPath, attachmentsUsed, embeddedImages, extensionFor, renameAttachmentRefs, setAltText, attachmentSrc, blobToDataUrl, dataUrlToBlob, imageReferences, isAttachmentPath, resolveImagePath, rewriteImageSources } from './attachments'
import { deleteAttachment, putAttachment, readAllAttachments } from './workspaceDb'
import EmptyWorkspace from './components/EmptyWorkspace'
import ShortcutsDialog from './components/ShortcutsDialog'
import GlobalSearch from './components/GlobalSearch'
import HistoryDialog from './components/HistoryDialog'
import CodeEditor from './components/CodeEditor'
import TemplateMenu from './components/TemplateMenu'
import StorageDialog from './components/StorageDialog'
import SettingsDialog, { FolderSyncCard, ThemePicker } from './components/SettingsDialog'
import HelpDialog from './components/HelpDialog'
import EmptyState from './components/EmptyState'
import { useHoverTooltip as useToolbarTooltip } from './useHoverTooltip'
import { MARK_COLORS, rehypeMarks } from './rehypeMarks'
import { CONTENT_FILTERS, applyContentFilter, clearContentFilter, filterLabel } from './contentFilter'
import { sectionSlides, slideForHeading, splitSlideNotes, splitSlides } from './presentation'
import { PRESENTATION_THEME_KEY, loadPresentationSettings, savePresentationSettings, splitOptions } from './presentationSettings'
import PresentationSettings from './components/PresentationSettings'
import PromptDialog from './components/PromptDialog'
import TableEditorDialog from './components/TableEditorDialog'
import TasksPanel from './components/TasksPanel'
import LinkCheckDialog from './components/LinkCheckDialog'
import RecoveryDialog from './components/RecoveryDialog'
import GraphView from './components/GraphView'
import { daysUntil, parseTasks, toggleTaskAt } from './tasks'
import { emptyTable, findTables, parseTable, tableAt, tableToMarkdown } from './tableModel'
import { detectWikiLink, findBacklinks, remarkWikiLinks, renameWikiLinks, resolveWikiTarget, wikiLinksToMarkdown } from './wikiLinks'
import ConfirmDialog from './components/ConfirmDialog'
import ChoiceDialog from './components/ChoiceDialog'
import { extractSection, insertSection, moveSection, moveSectionStep, shiftSection } from './outlineEdit'
import GlobalTooltip from './components/GlobalTooltip'
import { ALL_THEME_CLASSES, THEME_IDS, availableThemes, nextTheme, themeById, themeClasses } from './themes'
import TemplatesDialog from './components/TemplatesDialog'
import SlashMenu from './components/SlashMenu'
import FindReplacePanel from './components/FindReplacePanel'
import PresentationMode from './components/PresentationMode'
import SlideSplitControls from './components/SlideSplitControls'
import FileTree from './components/FileTree'
import AiToolsDialog from './components/AiToolsDialog'
import { aiSupport, canWriteWithAi, detectLanguage, hasAnyAi, readmeFromPrompt, summarizeDocument, writeReadmeWithAi } from './onDeviceAi'
import WriteReadmeDialog from './components/WriteReadmeDialog'
import { detectSlash, editorCaretRect, expandSnippet, filterSlashCommands, textareaCaretRect } from './slashCommands'
import { findMatches, replaceAllIn } from './findReplace'
import { requestPersistentStorage, sharedItemToFiles, takeSharedItems } from './pwaIntegration'
import { applyBackup, createBackup, readBackup } from './backup'
import { shortcut } from './platform'
import { buildShareUrl, readShareFromHash } from './shareLink'
import { EXPORT_EXTRA_CSS, embeddedFontCss } from './htmlExport'

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
const ENABLE_SEPIA_THEME = true

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

function useDocumentAnalysis(markdown, fileName = '', knownFiles = []) {
  const [analysis, setAnalysis] = useState({ headings: [], lineCount: 1, wordCount: 0, searchIndex: '', qualityIssues: [] })
  const workerRef = useRef(null)
  const requestIdRef = useRef(0)
  const knownFilesKey = knownFiles.map(file => file.name).join('\u0000')
  const knownFileNames = useMemo(() => knownFilesKey ? knownFilesKey.split('\u0000') : [], [knownFilesKey])
  const latestMarkdownRef = useRef({ markdown, fileName, knownFiles: knownFileNames })
  useEffect(() => {
    latestMarkdownRef.current = { markdown, fileName, knownFiles: knownFileNames }
  }, [markdown, fileName, knownFilesKey, knownFileNames])
  useEffect(() => {
    if (!('Worker' in window)) return
    try {
      const worker = new Worker(new URL('./workers/documentWorker.js', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = ({ data }) => {
        if (data.id === requestIdRef.current) setAnalysis(data)
      }
      worker.onerror = () => {
        worker.terminate()
        workerRef.current = null
        const id = ++requestIdRef.current
        const source = latestMarkdownRef.current
        setTimeout(() => {
          if (id === requestIdRef.current) setAnalysis({ id, ...analyzeDocument(source.markdown, source) })
        }, 0)
      }
      return () => { worker.terminate(); workerRef.current = null }
    } catch { /* use the synchronous fallback */ }
  }, [])
  useEffect(() => {
    const id = ++requestIdRef.current
    const options = { fileName, knownFiles: knownFileNames }
    if (workerRef.current) {
      try { workerRef.current.postMessage({ id, markdown, ...options }); return } catch { workerRef.current.terminate(); workerRef.current = null }
    }
    const timer = setTimeout(() => {
      if (id === requestIdRef.current) setAnalysis({ id, ...analyzeDocument(markdown, options) })
    }, 0)
    return () => clearTimeout(timer)
  }, [markdown, fileName, knownFilesKey, knownFileNames])
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

const vibrantLightCodeTheme = {
  ...oneLight,
  comment: { color: '#526175', fontStyle: 'italic' },
  prolog: { color: '#526175' },
  cdata: { color: '#526175' },
  keyword: { color: '#7c2d12', fontWeight: '600' },
  operator: { color: '#334155' },
  punctuation: { color: '#334155' },
  string: { color: '#166534' },
  char: { color: '#166534' },
  attrValue: { color: '#166534' },
  number: { color: '#9a3412' },
  boolean: { color: '#9a3412', fontWeight: '600' },
  function: { color: '#1d4ed8' },
  'class-name': { color: '#6d28d9' },
  builtin: { color: '#0e7490' },
  property: { color: '#9d174d' },
  tag: { color: '#9f1239' },
  'attr-name': { color: '#854d0e' },
  selector: { color: '#9f1239' },
  important: { color: '#9f1239', fontWeight: '700' },
}

// ── CodeBlock ──────────────────────────────────────────────────
// Lite mode: plain code blocks and diagrams as code (less memory and CPU).
const LiteContext = createContext(false)

// Code colours follow the app theme (Monokai code in the Monokai theme, and so on).
const CodeThemeContext = createContext(null)
function codeStyleFor(themeId, dark) {
  if (themeId === 'monokai') return okaidia
  if (themeId === 'nord') return nord
  if (themeId === 'solarized') return solarizedlight
  if (themeId === 'ocean') return materialOceanic
  if (themeId === 'sun') return gruvboxLight
  if (themeId?.startsWith('neon')) return synthwave84
  return dark ? oneDark : vibrantLightCodeTheme
}

function DiagramBlock({ code, dark }) {
  const lite = useContext(LiteContext)
  if (lite) return <CodeBlock rawLang="mermaid" code={code} dark={dark} />
  return <MermaidBlock code={code} dark={dark} />
}

function CodeBlock({ rawLang, code, dark }) {
  const lite = useContext(LiteContext)
  const codeTheme = useContext(CodeThemeContext)
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
        {lite ? (
          <pre className="code-plain" tabIndex={0} aria-label={`Code${language ? `: ${language}` : ''}`} style={{ whiteSpace: wrapped ? 'pre-wrap' : 'pre' }}><code>{code}</code></pre>
        ) : (
        <SyntaxHighlighter
          // Scrollable code must be reachable by keyboard.
          tabIndex={0}
          aria-label={`Code${language ? `: ${language}` : ''}`}
          language={prismLang}
          style={codeStyleFor(codeTheme, dark)}
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
        )}
      </div>
    </div>
  )
}

// ── FrontmatterCard ────────────────────────────────────────────
function FrontmatterCard({ meta, onEdit }) {
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
      {onEdit && <button type="button" className="frontmatter-edit no-print" onClick={onEdit} data-tooltip="Edit properties" aria-label="Edit properties"><SlidersHorizontal size={12} /></button>}
    </div>
  )
}

// ── MarkdownRenderer ───────────────────────────────────────────
// ── Collapsible heading sections ───────────────────────────────
const SectionCollapseContext = createContext(null)

function isSectionCollapsed(state, properties) {
  const key = properties?.dataSectionKey
  if (!state || !key || state.forceExpanded || properties.dataEmpty) return false
  const base = state.mode === 'collapsed' && !properties.dataTitleSection
  return state.overrides.has(key) ? !base : base
}

// Per-section extras in the page: bookmarks and on-device section summaries.
const SectionExtrasContext = createContext(null)
const InsideBookmarkContext = createContext(false)
const sectionSlug = key => String(key || '').replace(/~\d+$/, '')

function SectionSummary({ sectionKey }) {
  const extras = useContext(SectionExtrasContext)
  const summary = extras?.summaries?.[sectionKey]
  if (!summary) return null
  return (
    <div className="section-summary no-print anim-drop-in" role="region" aria-label="Section summary" aria-busy={summary.status === 'loading'}>
      <div className="section-summary-header">
        <span><Sparkles size={12} aria-hidden="true" />Section summary</span>
        <span className="section-summary-actions">
          {summary.status !== 'loading' && <button type="button" onClick={() => extras.summarizeSection(sectionKey)} aria-label="Summarize section again" title="Summarize again"><RefreshCw size={12} /></button>}
          <button type="button" onClick={() => extras.closeSummary(sectionKey)} aria-label="Close section summary" title="Close"><X size={12} /></button>
        </span>
      </div>
      {summary.status === 'error'
        ? <p className="summary-card-error" role="alert">{summary.error}</p>
        : summary.text
          ? <div className="section-summary-body">{extras.renderSummary(summary.text)}</div>
          : <p className="summary-card-status" aria-live="polite"><Loader2 size={12} className="animate-spin" />{summary.preparing ? 'Preparing the on-device model…' : 'Summarizing…'}</p>}
    </div>
  )
}

function CollapsibleSection({ node, children, ...rest }) {
  const state = useContext(SectionCollapseContext)
  const extras = useContext(SectionExtrasContext)
  const insideBookmark = useContext(InsideBookmarkContext)
  const properties = node?.properties ?? {}
  // Sections that are not heading sections (e.g. the GFM footnotes block) render unchanged.
  if (!properties.dataSectionKey) return <section {...rest}>{children}</section>
  const collapsed = isSectionCollapsed(state, properties)
  const bookmarked = Boolean(extras?.bookmarks?.has(sectionSlug(properties.dataSectionKey)))
  const [heading, ...body] = Array.isArray(children) ? children : [children]
  return (
    <section
      className={`md-section${state?.focusKey && state.focusKey === properties.dataSectionKey ? ' focus-target' : ''}`}
      data-section-key={properties.dataSectionKey}
      data-title-section={properties.dataTitleSection ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      data-bm={bookmarked ? 'self' : insideBookmark ? 'inside' : undefined}
    >
      {heading}
      {extras && <SectionSummary sectionKey={properties.dataSectionKey} />}
      <InsideBookmarkContext.Provider value={bookmarked || insideBookmark}>{body}</InsideBookmarkContext.Provider>
    </section>
  )
}

function SectionHeading({ as, iconSize, node, children, ...rest }) {
  const state = useContext(SectionCollapseContext)
  const extras = useContext(SectionExtrasContext)
  const properties = node?.properties ?? {}
  const text = headingText(node)
  const id = headingSlug(text)
  const key = properties.dataSectionKey
  // Headings outside the section structure (e.g. the hidden footnotes label) keep their own attributes.
  const range = properties.dataSrcFrom != null ? { 'data-src-from': properties.dataSrcFrom, 'data-src-to': properties.dataSrcTo, 'data-src-kind': properties.dataSrcKind } : {}
  if (!key) return createElement(as, { ...rest, id: rest.id || id }, children)
  const canToggle = Boolean(state && key && !properties.dataEmpty)
  const collapsed = isSectionCollapsed(state, properties)
  const bookmarked = Boolean(extras?.bookmarks?.has(id))
  const headingClass = [canToggle && `has-section-toggle${collapsed ? ' is-collapsed' : ''}`, bookmarked && 'is-bookmarked'].filter(Boolean).join(' ')
  return (
    createElement(as, { id, 'aria-label': text.trim() || undefined, className: headingClass || undefined, ...range }, <>
      {canToggle && (
        <button
          type="button"
          className="section-toggle"
          onClick={() => state.toggle(key)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${text}`}
          title={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <ChevronRight size={14} strokeWidth={2.4} />
        </button>
      )}
      {children}
      <a href={`#${id}`} className="heading-anchor" aria-label="Link to section">
        <Hash size={iconSize} />
      </a>
      {extras && (
        <span className="heading-tools no-print">
          {extras.canSummarize && !properties.dataEmpty && (
            <button type="button" className={`heading-tool${extras.summaries?.[key]?.status === 'loading' ? ' is-busy' : ''}`} onClick={() => extras.summarizeSection(key)}
              aria-label={`Summarize ${text}`} title="Summarize this section">
              <ScrollText size={13} />
            </button>
          )}
          <button type="button" className={`heading-tool${bookmarked ? ' is-on' : ''}`} onClick={() => extras.toggleBookmark(id)}
            aria-pressed={bookmarked} aria-label={`Bookmark heading ${text}`} title={bookmarked ? 'Remove bookmark' : 'Bookmark this section'}>
            <Star size={13} fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
        </span>
      )}
    </>)
  )
}

// Images get a caption from their alt text (rendered inline-safe inside paragraphs).
// Image attachments ("/attachments/…") resolve to the stored image for the current document.
const AttachmentContext = createContext({ urls: new Map(), docName: '', ready: false })
function MarkdownImage({ node, src: rawSrc, alt, title }) {
  const { urls, docName, ready } = useContext(AttachmentContext)
  const path = resolveImagePath(rawSrc, docName)
  const src = (path && urls.get(path)) || rawSrc
  const caption = (alt || '').trim()
  if (ready && isAttachmentPath(path) && !urls.has(path)) {
    return <span className="md-image-missing" role="img" aria-label={`Missing image: ${alt || path}`}><ImageOff size={14} aria-hidden="true" />Image not found: {path.slice(ATTACHMENT_DIR.length + 1)}</span>
  }
  if (!node?.properties?.dataStandalone) return <img src={src} alt={alt || ''} title={title} loading="lazy" decoding="async" />
  return (
    <span className={`md-figure${caption ? ' has-caption' : ''}`}>
      <img src={src} alt={alt || ''} title={title} loading="lazy" decoding="async" />
      {caption && <span className="md-figcaption" aria-hidden="true">{caption}</span>}
    </span>
  )
}

const CALLOUT_ICONS = { note: Info, tip: Lightbulb, important: MessageSquareWarning, warning: TriangleAlert, caution: OctagonAlert }

function Blockquote({ node, children }) {
  const type = node?.properties?.dataCallout
  if (!type) return <blockquote>{children}</blockquote>
  const Icon = CALLOUT_ICONS[type] ?? Info
  return (
    <div className={`callout callout-${type}`} role="note" aria-label={node.properties.dataCalloutTitle}>
      <div className="callout-title">
        <Icon size={18} aria-hidden="true" />
        <span>{node.properties.dataCalloutTitle}</span>
      </div>
      <div className="callout-body">{children}</div>
    </div>
  )
}

// Stable component types, so a theme switch never remounts document sections.
const SECTION_COMPONENTS = {
  h1: props => <SectionHeading as="h1" iconSize={14} {...props} />,
  h2: props => <SectionHeading as="h2" iconSize={13} {...props} />,
  h3: props => <SectionHeading as="h3" iconSize={12} {...props} />,
  h4: props => <SectionHeading as="h4" iconSize={12} {...props} />,
  h5: props => <SectionHeading as="h5" iconSize={11} {...props} />,
  h6: props => <SectionHeading as="h6" iconSize={11} {...props} />,
  section: CollapsibleSection,
  blockquote: Blockquote,
  img: MarkdownImage,
}

// Allow embedded (pasted / dropped) images; everything else uses the safe default.
function markdownUrlTransform(url, key, node) {
  if (key === 'src' && node?.tagName === 'img' && IMAGE_DATA_URL_RE.test(url)) return url
  return defaultUrlTransform(url)
}

/**
 * A dark, solid title-bar colour from the theme's accent: darkened until white text reads well
 * on it (contrast ≥ 7). Returns "#rrggbb", or null if the colour can't be read.
 */
function titleBarColor(accent) {
  if (!accent || typeof document === 'undefined') return null
  const context = document.createElement('canvas').getContext?.('2d')
  if (!context) return null
  context.fillStyle = '#000'
  context.fillStyle = accent
  const hex = String(context.fillStyle)
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) || null
  let rgb = match ? match.slice(1).map(part => parseInt(part, 16))
    : (/rgba?\(([^)]+)\)/.exec(hex)?.[1].split(',').slice(0, 3).map(Number) ?? null)
  if (!rgb) return null
  const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  for (let i = 0; i < 12 && 1.05 / (luminance(rgb) + 0.05) < 7; i += 1) rgb = rgb.map(value => Math.round(value * 0.85))
  return `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`
}

function MarkdownRenderer({ content, dark, sourceRanges = false }) {
  const components = useMemo(() => ({
    pre({ children }) { return <>{children}</> },

    code({ className, children, node }) {
      // Support "language-ts:filename.ts" notation
      const raw = (className || '').replace('language-', '')
      const str = String(children).replace(/\n$/, '')
      let block = null
      if (raw.toLowerCase() === 'mermaid') block = <DiagramBlock code={str} dark={dark} />
      else if (raw || str.includes('\n')) block = <CodeBlock rawLang={raw} code={str} dark={dark} />
      if (!block) return <code>{children}</code>
      // Edit in preview: code blocks carry their source range on a wrapper.
      const from = node?.properties?.dataSrcFrom
      if (sourceRanges && from != null) return <div className="pe-src" data-src-from={from} data-src-to={node.properties.dataSrcTo} data-src-kind="code">{block}</div>
      return block
    },

    a(props) {
      // Keep ids / data attributes (footnote refs and back-links rely on them).
      const { href, children } = props
      const rest = { ...props }
      delete rest.node
      delete rest.children
      return (
        <a {...rest} href={href}
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        >{children}</a>
      )
    },

    input({ type, checked }) {
      if (type === 'checkbox')
        return <input type="checkbox" checked={checked} readOnly aria-label={checked ? 'Completed task — click to mark as not done' : 'Open task — click to mark as done'} style={{ marginRight: 6, cursor: 'pointer' }} />
      return <input type={type} />
    },

    hr(props) {
      const rest = { ...props }
      delete rest.node
      return <hr {...rest} />
    },
    // Tables get an "Edit table" button (shown on hover); the app opens the table editor.
    table(props) {
      const rest = { ...props }
      delete rest.node
      delete rest.children
      return (
        <div className="table-wrap">
          <table {...rest}>{props.children}</table>
          <button type="button" className="table-edit no-print" data-edit-table="" aria-label="Edit table" data-tooltip="Edit table"><Table size={13} /></button>
        </div>
      )
    },
    // Headings with hover-anchor links and a collapse toggle for their section
    ...SECTION_COMPONENTS,
  }), [dark, sourceRanges])
  const rehypePlugins = useMemo(() => [
    ...(sourceRanges ? [rehypeSourceRanges] : []),
    rehypeKatex, rehypeMarks, rehypeCallouts, rehypeStandaloneImages, rehypeHeadingSections,
  ], [sourceRanges])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath, remarkWikiLinks]}
      rehypePlugins={rehypePlugins}
      urlTransform={markdownUrlTransform}
      components={components}
    >
      {content}
    </ReactMarkdown>
  )
}

// ── TOCSidebar ─────────────────────────────────────────────────
/** The icon each theme shows (in its own colour) in theme pickers. */
function ThemeIcon({ id, size = 14 }) {
  const theme = themeById(id)
  if (id.startsWith('neon')) return <Zap size={size} style={{ color: theme.swatch?.[1]?.startsWith?.('#') ? theme.swatch[1] : '#ec4899' }} />
  if (id === 'sun') return <Sunrise size={size} style={{ color: '#ea580c' }} />
  if (id === 'monokai') return <Palette size={size} style={{ color: '#a6e22e' }} />
  if (id === 'nord') return <Snowflake size={size} style={{ color: '#88c0d0' }} />
  if (id === 'solarized') return <SunDim size={size} style={{ color: '#268bd2' }} />
  if (id === 'marble') return <Contrast size={size} style={{ color: 'var(--text-1)' }} />
  if (id === 'ocean') return <Waves size={size} style={{ color: '#38bdf8' }} />
  if (id === 'forest') return <Leaf size={size} style={{ color: '#2f7d4f' }} />
  if (id === 'sepia') return <BookOpen size={size} style={{ color: '#a16207' }} />
  return theme.dark ? <Moon size={size} style={{ color: '#a78bfa' }} /> : <Sun size={size} style={{ color: '#f59e0b' }} />
}
const fontOptions = () => DOC_FONTS.map((font, index) => ({ value: index, label: font.label, icon: <span className="picker-font-sample" style={{ fontFamily: font.family }}>Aa</span> }))

// ── Header "View" menu: secondary display options in one place ─
function HeaderViewMenu({ items, extra }) {
  const [position, setPosition] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const close = useCallback(() => setPosition(null), [])
  useEffect(() => {
    if (!position) return undefined
    menuRef.current?.querySelector('button')?.focus()
    // A dropdown's list opens outside this menu (in a portal): it belongs to the menu.
    const onDown = event => { if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target) && !event.target.closest?.('.picker-menu')) close() }
    const onKey = event => {
      if (event.target.closest?.('.picker-menu') || menuRef.current?.querySelector('.picker-trigger[aria-expanded="true"]')) return
      if (event.key === 'Escape') { event.preventDefault(); close(); buttonRef.current?.focus() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const controls = [...(menuRef.current?.querySelectorAll('button') ?? [])]
        const index = controls.indexOf(document.activeElement)
        controls[(index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length]?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [position, close])
  const active = items.some(item => item.checked)
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`btn-icon${active ? ' is-active' : ''}`}
        data-tooltip="View options"
        aria-label="View options"
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          const width = 340
          setPosition(current => (current ? null : { top: rect.bottom + 8, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), width }))
        }}
      >
        <Display size={15} />
      </button>
      {position && createPortal(
        <div ref={menuRef} className="view-menu anim-pop-in no-print" role="menu" aria-label="View options" style={{ top: position.top, left: position.left, width: position.width }}>
          <div className="view-menu-title" aria-hidden="true">View options</div>
          {items.map(item => (
            <button key={item.id} type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} data-id={item.id}
              aria-checked={item.checked === undefined ? undefined : item.checked}
              className={`view-menu-item${item.checked ? ' is-on' : ''}`}
              onClick={() => { item.run(); if (!item.keepOpen && item.checked === undefined) close() }}>
              <span className="view-menu-icon"><item.icon size={15} /></span>
              <span className="view-menu-label">{item.label}</span>
              {item.hint && <span className="view-menu-hint">{item.hint}</span>}
              {item.checked !== undefined && <span className="view-menu-switch" aria-hidden="true" />}
            </button>
          ))}
          {extra}
        </div>,
        document.body,
      )}
    </>
  )
}

function filterMenuPosition(anchor) {
  const rect = anchor.getBoundingClientRect()
  const width = 220
  return { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), width }
}

function FilterMenu({ anchorRef, position, value, onPick, onClose }) {
  const menuRef = useRef(null)
  useEffect(() => {
    menuRef.current?.querySelector('[aria-checked="true"], button')?.focus()
    const onDown = event => { if (!menuRef.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) onClose() }
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); anchorRef.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [anchorRef, onClose])
  const options = [{ id: null, label: 'Everything' }, ...CONTENT_FILTERS]
  return createPortal(
    <div ref={menuRef} className="filter-menu anim-pop-in no-print" role="menu" aria-label="Filter content" style={position ? { top: position.top, left: position.left, width: position.width } : { visibility: 'hidden' }}>
      <div className="filter-menu-heading">Show only</div>
      {options.map(option => (
        <button key={option.id ?? 'all'} type="button" role="menuitemradio" aria-checked={value === option.id}
          className={`filter-menu-item${value === option.id ? ' is-active' : ''}`} onClick={() => onPick(option.id)}>
          <span>{option.label}</span>
          {value === option.id && <Check size={12} />}
        </button>
      ))}
    </div>,
    document.body,
  )
}

const SECTION_DRAG_TYPE = 'application/x-readme-section'
const OUTLINE_ACTIONS = [
  { label: 'Move up', keys: 'Alt+↑', icon: ArrowUp, action: { action: 'step', direction: -1 } },
  { label: 'Move down', keys: 'Alt+↓', icon: ArrowDown, action: { action: 'step', direction: 1 } },
  { label: 'Promote heading', keys: 'Alt+←', icon: Outdent, action: { action: 'shift', delta: -1 } },
  { label: 'Demote heading', keys: 'Alt+→', icon: Indent, action: { action: 'shift', delta: 1 } },
  { label: 'Move to another file…', icon: SendTo, action: { action: 'toFile' } },
  { label: 'Copy section', icon: Copy, action: { action: 'copy' } },
]
// The ⋯ menu of a heading in the Contents sidebar.
function OutlineMenu({ menu, onClose, onAction }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const onDown = event => { if (!ref.current?.contains(event.target) && !event.target.closest?.('.toc-more')) onClose() }
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const buttons = [...ref.current.querySelectorAll('button')]
        const index = buttons.indexOf(document.activeElement)
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return createPortal(
    <div ref={ref} className="outline-menu anim-drop-in" role="menu" aria-label={`Section “${menu.text}”`} style={{ top: menu.y, left: Math.max(8, menu.x - 240) }}>
      {OUTLINE_ACTIONS.map(item => (
        <button key={item.label} type="button" role="menuitem" onClick={() => onAction(item.action)}>
          <item.icon size={13} aria-hidden="true" /><span>{item.label}</span>{item.keys && <kbd>{item.keys}</kbd>}
        </button>
      ))}
    </div>,
    document.body,
  )
}

// "Linked from": documents with a [[wiki link]] or Markdown link to this one.
function Backlinks({ items, onOpen }) {
  if (!items.length) return null
  return (
    <section className="toc-backlinks" aria-label="Linked from">
      <div className="toc-backlinks-head">
        <Link2 size={10} aria-hidden="true" />
        <span>Linked from</span>
        <span className="toc-backlinks-count">{items.length}</span>
      </div>
      <ul>
        {items.map(({ file, snippet }) => (
          <li key={file.id}>
            <button type="button" onClick={() => onOpen(file.id)} data-tip={`Open ${file.name}`}>
              <strong>{file.name.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')}</strong>
              {snippet && <span>{snippet}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TocSidebar({ headings, activeId, onNavigate, bookmarks = new Set(), onToggleBookmark, onlyBookmarked = false, onOnlyBookmarked, widthToggle, onPresentFrom, onPresentBookmarked, backlinks = [], onOpenBacklink, onOutline, onOpenGraph }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  // Reorganising: drag a heading (drop line before / after a row) or use its ⋯ menu / Alt+arrows.
  const canReorganise = Boolean(onOutline) && !onlyBookmarked
  const [dragFrom, setDragFrom] = useState(null)
  const [dropAt, setDropAt] = useState(null) // { index, place }
  const [outlineMenu, setOutlineMenu] = useState(null) // { index, x, y }

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
    if (onlyBookmarked) return headings.flatMap((h, i) => (bookmarks.has(h.id) ? [{ h, i, key: `${h.level}-${h.id}-${i}`, hasChildren: false, isCollapsed: false }] : []))
    return items
  }, [headings, collapsed, onlyBookmarked, bookmarks])

  const toggleCollapse = useCallback((key) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const activeIndex = headings.findIndex(h => h.id === activeId)
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
      <EmptyState compact icon={Hash} title="No headings yet" text="Add # headings to build the contents." />
      <Backlinks items={backlinks} onOpen={onOpenBacklink} />
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
        <div className="flex items-center gap-0.5">
          {parentKeys.length > 0 && !onlyBookmarked && (
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
          {onOnlyBookmarked && (
            <button
              type="button"
              onClick={() => onOnlyBookmarked(!onlyBookmarked)}
              disabled={bookmarks.size === 0}
              className={`btn-icon !p-1 toc-bookmark-filter${onlyBookmarked ? ' is-on' : ''}`}
              aria-pressed={onlyBookmarked}
              title={bookmarks.size === 0 ? 'Bookmark a section (☆) to use this' : onlyBookmarked ? 'Show all sections' : 'Show only bookmarked sections'}
              aria-label="Show only bookmarked sections"
            >
              <Star size={12} fill={onlyBookmarked ? 'currentColor' : 'none'} />
            </button>
          )}
          {onPresentBookmarked && (
            <button
              type="button"
              onClick={onPresentBookmarked}
              disabled={bookmarks.size === 0}
              className="btn-icon !p-1 toc-present-bookmarks"
              title={bookmarks.size === 0 ? 'Bookmark a section (☆) to present only bookmarked sections' : 'Present only bookmarked sections'}
              aria-label="Present bookmarked sections"
            >
              <Presentation size={12} />
            </button>
          )}
          {onOpenGraph && (
            <button type="button" onClick={onOpenGraph} className="btn-icon !p-1" title="Graph of linked documents" aria-label="Graph of linked documents">
              <Workflow size={12} />
            </button>
          )}
          {widthToggle && (
            <button
              type="button"
              onClick={widthToggle.onToggle}
              className="btn-icon !p-1"
              title={widthToggle.isMax ? 'Narrow contents (smallest width)' : 'Widen contents (largest width)'}
              aria-label={widthToggle.isMax ? 'Narrow contents' : 'Widen contents'}
            >
              {widthToggle.isMax ? <PanelNarrow size={12} /> : <PanelWiden size={12} />}
            </button>
          )}
        </div>
      </div>
      <nav className="py-1">
        {visibleItems.map(({ h, i, key, hasChildren, isCollapsed }) => {
          const isActive = activeId === h.id
          const isRead = activeIndex >= 0 && i < activeIndex
          const isBookmarked = bookmarks.has(h.id)
          const depth = onlyBookmarked ? 0 : h.level - 1 // 0, 1, 2
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
                className={`toc-item anim-slide-left ${isActive ? 'active' : ''}${isBookmarked ? ' is-bookmarked' : ''}${isRead ? ' is-read' : ''}${dropAt?.index === i ? ` is-drop-${dropAt.place}` : ''}${dragFrom === i ? ' is-dragging' : ''}`}
                style={{
                  paddingLeft: `${depth * 14 + (depth > 0 ? 18 : 6)}px`,
                  animationDelay: `${Math.min(i * 25, 160)}ms`,
                }}
                // The whole row is clickable with a mouse; keyboard users use the heading button below.
                onClick={() => onNavigate(h.id)}
                draggable={canReorganise}
                onDragStart={canReorganise ? event => {
                  event.dataTransfer.setData(SECTION_DRAG_TYPE, String(i))
                  event.dataTransfer.effectAllowed = 'move'
                  setDragFrom(i)
                } : undefined}
                onDragEnd={() => { setDragFrom(null); setDropAt(null) }}
                onDragOver={canReorganise ? event => {
                  if (!Array.from(event.dataTransfer.types).includes(SECTION_DRAG_TYPE)) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  const box = event.currentTarget.getBoundingClientRect()
                  const place = event.clientY < box.top + box.height / 2 ? 'before' : 'after'
                  if (dropAt?.index !== i || dropAt.place !== place) setDropAt({ index: i, place })
                } : undefined}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropAt(current => (current?.index === i ? null : current)) }}
                onDrop={canReorganise ? event => {
                  const from = Number(event.dataTransfer.getData(SECTION_DRAG_TYPE))
                  event.preventDefault()
                  const place = dropAt?.place ?? 'before'
                  setDragFrom(null); setDropAt(null)
                  if (Number.isInteger(from) && from !== i) onOutline({ action: 'move', ordinal: from, target: i, place, text: visibleItems.find(item => item.i === from)?.h.text })
                } : undefined}
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
                <button type="button" className="toc-link truncate"
                  aria-current={isActive ? 'location' : undefined}
                  aria-keyshortcuts={canReorganise ? 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight' : undefined}
                  onClick={event => { event.stopPropagation(); onNavigate(h.id) }}
                  onKeyDown={canReorganise ? event => {
                    if (!event.altKey || event.metaKey || event.ctrlKey) return
                    const move = { ArrowUp: { action: 'step', direction: -1 }, ArrowDown: { action: 'step', direction: 1 }, ArrowLeft: { action: 'shift', delta: -1 }, ArrowRight: { action: 'shift', delta: 1 } }[event.key]
                    if (!move) return
                    event.preventDefault()
                    onOutline({ ...move, ordinal: i, text: h.text, keepFocus: true })
                  } : undefined}
                  style={{
                    fontSize: h.level === 1 ? 13 : h.level === 2 ? 12 : 11.5,
                    fontWeight: h.level === 1 ? 600 : h.level === 2 ? 500 : 400,
                    letterSpacing: h.level === 1 ? '-0.01em' : 'normal',
                    opacity: h.level === 3 && !isActive ? 0.75 : 1,
                  }}>
                  {h.text}
                </button>
                {canReorganise && (
                  <button
                    type="button"
                    className="toc-more"
                    onClick={event => {
                      event.stopPropagation()
                      const box = event.currentTarget.getBoundingClientRect()
                      setOutlineMenu(current => (current?.index === i ? null : { index: i, text: h.text, x: box.right, y: box.bottom + 4 }))
                    }}
                    aria-haspopup="menu"
                    aria-expanded={outlineMenu?.index === i}
                    aria-label={`Section options for ${h.text}`}
                    data-tip="Move, promote, demote or copy this section"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                )}
                {onPresentFrom && (
                  <button
                    type="button"
                    className="toc-present"
                    onClick={event => { event.stopPropagation(); onPresentFrom(i) }}
                    aria-label={`Present from ${h.text}`}
                    title="Present from here"
                  >
                    <Presentation size={11} />
                  </button>
                )}
                {onToggleBookmark && (
                  <button
                    type="button"
                    className={`toc-star${isBookmarked ? ' is-on' : ''}`}
                    onClick={event => { event.stopPropagation(); onToggleBookmark(h.id) }}
                    aria-pressed={isBookmarked}
                    aria-label={`Bookmark ${h.text}`}
                    title={isBookmarked ? 'Remove bookmark' : 'Bookmark this section'}
                  >
                    <Star size={11} fill={isBookmarked ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </nav>
      {outlineMenu && <OutlineMenu menu={outlineMenu} onClose={() => setOutlineMenu(null)} onAction={action => { setOutlineMenu(null); onOutline({ ...action, ordinal: outlineMenu.index, text: outlineMenu.text }) }} />}
      <Backlinks items={backlinks} onOpen={onOpenBacklink} />
    </div>
  )
}

// ── PillSwitcher ───────────────────────────────────────────────
function PillSwitcher({ view, onChange, onPresent, canPresent = false, presentationSettings, onPresentationSettings }) {
  const containerRef = useRef(null)
  const btnRefs = useRef([])
  const [splitOpen, setSplitOpen] = useState(false)
  const [pill, setPill] = useState({ left: 4, width: 72, height: 29, top: 3 })

  useLayoutEffect(() => {
    const measure = () => {
      const idx = VIEW_MODES.findIndex(v => v.id === view)
      const btn = btnRefs.current[idx]
      if (btn && containerRef.current) {
        const cr = containerRef.current.getBoundingClientRect()
        const br = btn.getBoundingClientRect()
        setPill({ left: br.left - cr.left, top: br.top - cr.top, width: br.width, height: br.height })
      }
    }
    measure()
    // Labels hide on narrower windows, which changes the button sizes.
    const observer = typeof ResizeObserver !== 'undefined' && containerRef.current ? new ResizeObserver(measure) : null
    if (observer) observer.observe(containerRef.current)
    return () => observer?.disconnect()
  }, [view])

  useEffect(() => {
    if (!splitOpen) return undefined
    const onPointerDown = event => { if (!containerRef.current?.contains(event.target)) setSplitOpen(false) }
    const onKeyDown = event => { if (event.key === 'Escape') setSplitOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
  }, [splitOpen])

  return (
    <div ref={containerRef} className="pill-track hidden sm:flex" data-tour="views">
      <div className="pill-indicator" style={pill} />
      {VIEW_MODES.map((mode, i) => {
        const { id, label } = mode
        return (
        <button key={id} ref={el => (btnRefs.current[i] = el)}
          onClick={() => onChange(id)}
          className={`pill-btn ${view === id ? 'active' : ''}`}
          title={label}
          aria-label={label}
        >
          {createElement(mode.Icon, { size: 13 })}
          <span className="pill-label">{label}</span>
        </button>
        )
      })}
      {onPresent && (
        <>
          <span className="pill-divider" aria-hidden="true" />
          {/* Not a layout: opens the full-screen slide view. */}
          <button
            type="button"
            onClick={onPresent}
            disabled={!canPresent}
            className="pill-btn pill-present"
            title={canPresent ? 'Present as slides (one per heading)' : 'Add some content to present'}
            aria-label="Present as slides"
          >
            <Presentation size={13} />
            <span className="pill-label">Present</span>
          </button>
          <span className="home-slide-split">
            <button type="button" className="pill-btn pill-split-settings" onClick={() => setSplitOpen(open => !open)}
              aria-label="Choose slide split" aria-expanded={splitOpen} title="Choose where new slides start">
              <Settings2 size={13} /><span className="pill-label">Split</span>
            </button>
            {splitOpen && <SlideSplitControls settings={presentationSettings} onChange={onPresentationSettings} label="Home slide splitting options" className="home-slide-split-popover" />}
          </span>
        </>
      )}
    </div>
  )
}

// ── FormattingToolbar ──────────────────────────────────────────
const ANNOTATION_COLORS = [
  { id: 'yellow', label: 'Yellow', swatch: '#facc15', fill: 'rgba(250, 204, 21, .34)', line: 'rgba(202, 138, 4, .75)' },
  { id: 'green', label: 'Green', swatch: '#4ade80', fill: 'rgba(74, 222, 128, .3)', line: 'rgba(22, 163, 74, .75)' },
  { id: 'blue', label: 'Blue', swatch: '#60a5fa', fill: 'rgba(96, 165, 250, .3)', line: 'rgba(37, 99, 235, .75)' },
  { id: 'pink', label: 'Pink', swatch: '#f472b6', fill: 'rgba(244, 114, 182, .3)', line: 'rgba(219, 39, 119, .75)' },
  { id: 'purple', label: 'Purple', swatch: '#a78bfa', fill: 'rgba(167, 139, 250, .32)', line: 'rgba(124, 58, 237, .75)' },
  { id: 'orange', label: 'Orange', swatch: '#fb923c', fill: 'rgba(251, 146, 60, .3)', line: 'rgba(234, 88, 12, .75)' },
]

const FMT_ACTIONS = [
  { label: 'Heading 1', Icon: Heading1,    mode: 'block',  before: '# '  },
  { label: 'Heading 2', Icon: Heading2,    mode: 'block',  before: '## ' },
  { label: 'Heading 3', Icon: Heading3,    mode: 'block',  before: '### ' },
  null,
  { label: 'Bold',      Icon: Bold,        mode: 'wrap',   before: '**',  after: '**' },
  { label: 'Italic',    Icon: Italic,      mode: 'wrap',   before: '*',   after: '*'  },
  { label: 'Strike',    Icon: Strikethrough,mode:'wrap',   before: '~~',  after: '~~' },
  'highlight',
  { label: 'Inline code',Icon: Code,       mode: 'wrap',   before: '`',   after: '`'  },
  null,
  { label: 'Link',      Icon: Link,        mode: 'wrap',   before: '[',   after: '](url)' },
  { label: 'Image',     Icon: Image,       mode: 'wrap',   before: '![',  after: '](image-url)' },
  { label: 'Footnote',  Icon: Superscript, mode: 'footnote' },
  null,
  { label: 'Blockquote',Icon: Quote,       mode: 'block',  before: '> '  },
  { label: 'Callout',   Icon: MessageSquareQuote, mode: 'insert', text: '\n> [!NOTE]\n> ' },
  { label: 'Bullet list', Icon: List,      mode: 'block',  before: '- '  },
  { label: 'Numbered list', Icon: ListOrdered, mode: 'block', before: '1. ' },
  { label: 'Task list', Icon: ListChecks,  mode: 'block',  before: '- [ ] ' },
  null,
  { label: 'Code block', Icon: SquareCode, mode: 'wrap',   before: '\n```\n', after: '\n```\n' },
  { label: 'Table (insert or edit)', Icon: Table, mode: 'table' },
  { label: 'Divider',   Icon: Minus,       mode: 'insert', text: '\n---\n' },
]

// The toolbar shows FMT_ACTIONS as labelled groups (split at each null).
const FMT_GROUP_LABELS = ['Headings', 'Text style', 'Insert', 'Blocks', 'Code and layout']
const FMT_GROUPS = FMT_ACTIONS.reduce((groups, action) => {
  if (action === null) groups.push({ label: FMT_GROUP_LABELS[groups.length] ?? `Group ${groups.length + 1}`, actions: [] })
  else groups[groups.length - 1].actions.push(action)
  return groups
}, [{ label: FMT_GROUP_LABELS[0], actions: [] }])

function HighlightPicker({ position, onPick, onClose }) {
  const menuRef = useRef(null)
  useEffect(() => {
    menuRef.current?.querySelector('button')?.focus()
    const onDown = event => { if (!menuRef.current?.contains(event.target)) onClose() }
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return createPortal(
    <div ref={menuRef} className="highlight-picker anim-pop-in no-print" role="menu" aria-label="Highlight colour" style={{ top: position.top, left: position.left }}>
      {MARK_COLORS.map(color => (
        <button key={color.id} type="button" role="menuitem" className="highlight-swatch" style={{ background: color.swatch }}
          onClick={() => onPick(color.id)} aria-label={`${color.label} highlight`} title={`${color.label} highlight`} />
      ))}
    </div>,
    document.body,
  )
}

function FormattingToolbar({ textareaRef, content, onChange, onOpenTable, onCreateFromTemplate, templates = MD_TEMPLATES, onManageTemplates, onFindReplace, onWriteReadme, aiHidden, aiBusy = false }) {
  const [tplOpen, setTplOpen] = useState(false)
  const tplRef = useRef(null)
  const closeTemplates = useCallback(() => setTplOpen(false), [])
  const [highlightMenu, setHighlightMenu] = useState(null)
  const closeHighlightMenu = useCallback(() => setHighlightMenu(null), [])
  const [tipHandlers, tooltip] = useToolbarTooltip()

  const apply = useCallback((action) => {
    if (action.mode === 'table') { onOpenTable?.(); return }
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd

    let result
    if (action.mode === 'footnote') {
      // Reference at the cursor, definition at the end of the document.
      const numbers = [...content.matchAll(/\[\^(\d+)\]/g)].map(match => Number(match[1]))
      const n = (numbers.length ? Math.max(...numbers) : 0) + 1
      const ref = `[^${n}]`
      const withRef = content.substring(0, start) + ref + content.substring(end)
      const definition = `${withRef.endsWith('\n') ? '' : '\n'}\n[^${n}]: Footnote text`
      result = { value: withRef + definition, cursor: [start + ref.length, start + ref.length] }
    } else if (action.mode === 'insert') {
      result = {
        value: content.substring(0, start) + action.text + content.substring(end),
        cursor: [start + action.text.length, start + action.text.length],
      }
    } else if (action.mode === 'block') {
      result = applyBlockFormat(content, start, action.before)
    } else {
      result = applyFormat(content, start, end, action.before, action.after || '')
    }

    // Apply only the changed span through the editing commands, so ⌘Z / Ctrl+Z can undo it
    // (replacing the whole value would wipe the browser's undo history).
    const next = result.value
    let from = 0
    while (from < content.length && from < next.length && content[from] === next[from]) from += 1
    let tail = 0
    while (tail < content.length - from && tail < next.length - from && content[content.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1
    if (next !== content) {
      applyTextareaEdit(ta, { from, to: content.length - tail, text: next.slice(from, next.length - tail), cursor: result.cursor[0], cursorEnd: result.cursor[1] })
      if (ta.value !== next) onChange(next)
    }
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(result.cursor[0], result.cursor[1])
    })
  }, [content, onChange, textareaRef, onOpenTable])

  return (
    <div className="fmt-toolbar no-print justify-between" {...tipHandlers}>
      {tooltip}
      <div className="fmt-scroll" role="toolbar" aria-label="Formatting" onScroll={tipHandlers.onScroll}
        onWheel={event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY }}>
        {FMT_GROUPS.map(group => (
          <div key={group.label} className="fmt-group" role="group" aria-label={group.label}>
            {group.actions.map(action => (action === 'highlight' ? (
              <button key="highlight" type="button" className="fmt-btn fmt-btn-highlight" data-tip="Highlight (choose a colour)" aria-label="Highlight"
                aria-haspopup="menu" aria-expanded={Boolean(highlightMenu)}
                onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setHighlightMenu(menu => (menu ? null : { top: rect.bottom + 6, left: Math.max(8, rect.left - 40) })) }}>
                <Highlighter size={13} />
              </button>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={() => apply(action)}
                data-tip={action.label}
                aria-label={action.label}
                className="fmt-btn"
              >
                <action.Icon size={13} />
              </button>
            )))}
          </div>
        ))}
        {highlightMenu && (
          <HighlightPicker position={highlightMenu} onClose={closeHighlightMenu}
            onPick={color => { setHighlightMenu(null); apply({ mode: 'wrap', before: color === 'yellow' ? '==' : `=={${color}}`, after: '==' }) }} />
        )}
      </div>

      <div className="relative shrink-0 ml-2 flex items-center gap-0.5">
        {onWriteReadme && (
          <button type="button" onClick={onWriteReadme} data-tip={aiHidden ? 'Write a README' : 'Write a README with AI'} aria-label={aiHidden ? 'Write a README' : 'Write a README with AI'} className={`fmt-btn fmt-btn-ai${aiBusy ? ' is-busy' : ''}`}>
            <Sparkles size={13} />
          </button>
        )}
        {onFindReplace && (
          <button type="button" onClick={onFindReplace} data-tip={`Find & replace (${shortcut('F', { alt: true })})`} aria-label="Find and replace" className="fmt-btn">
            <Replace size={13} />
          </button>
        )}
        <button
          ref={tplRef}
          type="button"
          onClick={() => setTplOpen(o => !o)}
          data-tip="New file from a template"
          aria-label="New file from a template"
          aria-haspopup="menu"
          aria-expanded={tplOpen}
          className="fmt-btn"
          style={tplOpen ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
        >
          <LayoutTemplate size={13} />
        </button>
        {tplOpen && (
          <TemplateMenu anchorRef={tplRef} templates={templates} onPick={onCreateFromTemplate} onWriteReadme={onWriteReadme} onManage={onManageTemplates} onClose={closeTemplates} />
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
        return { files: orderPinnedFirst(valid), activeId }
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
  { id: 'inter',    num: 1,  label: 'Inter (Clean Sans)',         family: "'Inter', system-ui, sans-serif",          isSerif: false },
  { id: 'lora',     num: 2,  label: 'Lora (Book Serif)',          family: "'Lora', Georgia, serif",                  isSerif: true  },
  { id: 'plex',     num: 3,  label: 'IBM Plex Sans (Tech)',       family: "'IBM Plex Sans', system-ui, sans-serif",  isSerif: false },
  { id: 'serif4',   num: 4,  label: 'Source Serif 4 (Editorial)', family: "'Source Serif 4', Georgia, serif",        isSerif: true  },
  { id: 'roboto',   num: 5,  label: 'Roboto (Neutral Sans)',      family: "'Roboto', Arial, sans-serif",             isSerif: false },
  { id: 'merri',    num: 6,  label: 'Merriweather (Classic)',     family: "'Merriweather', Georgia, serif",          isSerif: true  },
  { id: 'playfair', num: 7,  label: 'Playfair Display (Heading)', family: "'Playfair Display', Georgia, serif",      isSerif: true  },
  { id: 'jakarta',  num: 8,  label: 'Plus Jakarta Sans (Modern)', family: "'Plus Jakarta Sans', system-ui, sans-serif", isSerif: false },
  { id: 'mono',     num: 9,  label: 'JetBrains Mono (Code)',      family: "'JetBrains Mono', 'Fira Code', monospace", isSerif: false },
  { id: 'georgia',  num: 10, label: 'Georgia (Traditional)',      family: "Georgia, 'Times New Roman', serif",       isSerif: true  },
  { id: 'system',   num: 11, label: 'System UI (Native)',         family: "system-ui, -apple-system, sans-serif",    isSerif: false },
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
const READER_LINE_HEIGHTS = {
  compact: { label: 'Compact', value: 1.6 },
  normal:  { label: 'Normal',  value: 1.82 },
  relaxed: { label: 'Relaxed', value: 2.05 },
}
const READER_FONT_WEIGHTS = {
  light:   { label: 'Light',   value: 300 },
  regular: { label: 'Regular', value: 400 },
  medium:  { label: 'Medium',  value: 500 },
  bold:    { label: 'Bold',    value: 600 },
}
const READER_PARAGRAPH_SPACING = {
  tight:  { label: 'Tight',  value: '0.45rem' },
  normal: { label: 'Normal', value: '0.8rem' },
  airy:   { label: 'Airy',   value: '1.3rem' },
}
const READER_PREFS_VERSION = 2
const DEFAULT_READER_PREFS = { fontIndex: 0, size: 'md', width: 'full', fontWeight: 'regular', lineHeight: 'normal', paragraphSpacing: 'normal', version: READER_PREFS_VERSION }

function loadReaderPrefs() {
  try {
    const raw = localStorage.getItem('readme-reader-prefs')
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged = { ...DEFAULT_READER_PREFS, ...parsed, version: READER_PREFS_VERSION }
      delete merged.paper // paper tones were removed
      // v2 made Wide the default preview width; move older saved prefs over once.
      if (parsed.version !== READER_PREFS_VERSION) merged.width = 'full'
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

function ReaderSettingsPopover({ prefs, onChange, onClose, density, onDensityChange, docStyle, docStyleExplicit, defaultDocStyle, onDocStyle }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.reader-settings-control')) onClose()
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
        {onDocStyle && (
          <div role="radiogroup" aria-label="Document style">
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center justify-between" style={{ color: 'var(--text-4)' }}>
              <span>Document style</span><span className="normal-case tracking-normal font-normal">saved in the document</span>
            </div>
            <div className="doc-style-grid">
              {DOC_STYLES.map(style => (
                <button key={style.id} type="button" role="radio" aria-checked={docStyle === style.id} aria-label={`${style.label} style`}
                  className={`doc-style-tile is-${style.id}${docStyle === style.id ? ' is-active' : ''}`} data-tip={style.description}
                  onClick={() => onDocStyle(style.id === defaultDocStyle && !docStyleExplicit ? null : style.id)}>
                  <span className="doc-style-sample" style={{ fontFamily: style.headingFont }} aria-hidden="true">Aa</span>
                  <span className="doc-style-lines" aria-hidden="true"><i /><i /><i /></span>
                  <span className="doc-style-name">{style.label}</span>
                </button>
              ))}
            </div>
            {docStyleExplicit && <button type="button" className="doc-style-reset" onClick={() => onDocStyle(null)}>Use the default ({docStyleById(defaultDocStyle).label})</button>}
          </div>
        )}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>
            Typography
          </div>
          {docStyle && docStyle !== 'readme' && <p className="doc-style-note">Fonts come from the {docStyleById(docStyle).label} style. Pick ReadMe above to choose your own.</p>}
          <PickerDropdown label="Reading font" value={prefs.fontIndex} options={fontOptions()} className="reader-picker"
            disabled={Boolean(docStyle && docStyle !== 'readme')} onChange={index => onChange({ ...prefs, fontIndex: index })} />
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
            Font Weight
          </div>
          <div className="flex gap-1.5">
            {Object.entries(READER_FONT_WEIGHTS).map(([id, cfg]) => (
              <button key={id} type="button"
                onClick={() => onChange({ ...prefs, fontWeight: id })}
                className={`reader-chip ${prefs.fontWeight === id ? 'active' : ''}`}
                aria-pressed={prefs.fontWeight === id}
                style={{ fontWeight: cfg.value }}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>
            Line Height
          </div>
          <div className="flex gap-1.5">
            {Object.entries(READER_LINE_HEIGHTS).map(([id, cfg]) => (
              <button key={id} type="button"
                onClick={() => onChange({ ...prefs, lineHeight: id })}
                className={`reader-chip ${prefs.lineHeight === id ? 'active' : ''}`}
                aria-pressed={prefs.lineHeight === id}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>
            Paragraph Spacing
          </div>
          <div className="flex gap-1.5">
            {Object.entries(READER_PARAGRAPH_SPACING).map(([id, cfg]) => (
              <button key={id} type="button"
                onClick={() => onChange({ ...prefs, paragraphSpacing: id })}
                className={`reader-chip ${prefs.paragraphSpacing === id ? 'active' : ''}`}
                aria-pressed={prefs.paragraphSpacing === id}
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
            Interface Density
          </div>
          <div className="flex gap-1.5">
            {['comfortable', 'compact'].map(option => (
              <button key={option} type="button"
                onClick={() => onDensityChange(option)}
                className={`reader-chip capitalize ${density === option ? 'active' : ''}`}
                aria-pressed={density === option}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentQualityPopover({ issues, onClose, onFix, onGoToLine }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = event => {
      if (ref.current && !ref.current.contains(event.target) && !event.target.closest?.('.quality-control')) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div ref={ref} className="reader-popover quality-popover anim-drop-in no-print" role="region" aria-label="Document quality checks">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Document checks</span>
        <span className="text-[10px] font-semibold" style={{ color: issues.length ? 'var(--accent)' : '#15803d' }}>
          {issues.length ? `${issues.length} ${issues.length === 1 ? 'item' : 'items'}` : 'All clear'}
        </span>
      </div>
      {issues.length ? (
        <ul className="quality-issue-list">
          {issues.map(issue => (
            <li key={issue.id}>
              <TriangleAlert size={13} />
              <div>
                <strong>Line {issue.line}: {issue.message}</strong>
                <span>{issue.suggestion}</span>
                <div className="quality-issue-actions">
                  {issue.fix && (
                    <button type="button" className="quality-fix" onClick={() => onFix(issue)}>
                      <Check size={11} />{issue.fix.label}
                    </button>
                  )}
                  <button type="button" className="quality-goto" onClick={() => onGoToLine(issue.line)}>Go to line {issue.line}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>No missing image descriptions, broken document or heading links, empty links, or skipped heading levels found.</p>
      )}
    </div>
  )
}

// Header "New" split button: blank file, or pick a template from the caret.
function NewFileButton({ onNew, onTemplate, templates = MD_TEMPLATES, onManageTemplates, onWriteReadme }) {
  const [open, setOpen] = useState(false)
  const caretRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  return (
    <div className="split-download split-new">
      <button type="button" onClick={onNew} data-tooltip="Create a new Markdown file" aria-label="New file" className="split-download-main" data-tour="new">
        <FilePlus size={14} /><span className="hidden sm:inline">New</span>
      </button>
      <button
        ref={caretRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        data-tooltip={open ? undefined : 'New from a template'}
        aria-label="New file options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="split-download-caret"
      >
        <ChevronDown size={13} />
      </button>
      {open && (
        <TemplateMenu anchorRef={caretRef} templates={templates} onBlank={onNew} onWriteReadme={onWriteReadme} onPick={onTemplate} onManage={onManageTemplates} onClose={close} align="left" label="New file" />
      )}
    </div>
  )
}

// ── Upload split button: open files, or import from a URL ─────
function UploadMenuButton({ onOpen, onImportUrl }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="split-download">
      <button type="button" onClick={onOpen} className="split-download-main" data-tooltip="Open Markdown files or folders" aria-label="Open Markdown files or folders">
        <Upload size={13} /><span className="hidden sm:inline">Upload</span>
      </button>
      <button type="button" onClick={() => setOpen(value => !value)} className="split-download-caret"
        data-tooltip="More ways to open" aria-label="Upload options" aria-haspopup="menu" aria-expanded={open}>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="download-menu anim-drop-in" role="menu">
          <button type="button" role="menuitem" className="download-menu-item" onClick={() => { setOpen(false); onOpen() }}>
            <span className="flex items-center gap-2">
              <FolderOpen size={13} style={{ color: 'var(--accent)' }} />
              <span>Open Files or Folder…</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>.md</span>
          </button>
          <button type="button" role="menuitem" className="download-menu-item" onClick={() => { setOpen(false); onImportUrl() }}>
            <span className="flex items-center gap-2">
              <Globe size={13} style={{ color: 'var(--accent)' }} />
              <span>Import Markdown from URL…</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>URL</span>
          </button>
        </div>
      )}
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
  onExportDocx,
  onExportConfluence,
  onExportSlides,
  onCopyShareLink,
  onExportZip,
  onPublishSite,
  onInstallApp,
  onBackup,
  onRestore,
  onStorage,
  onSaveInPlace,
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
        data-tour="download"
        aria-haspopup="menu"
        aria-expanded={open}
        className="split-download-caret"
      >
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="download-menu anim-drop-in" role="menu">
          {onSaveInPlace && (
            <>
              <button type="button" role="menuitem" className="download-menu-item" disabled={disabled} onClick={() => { setOpen(false); onSaveInPlace() }}>
                <span className="flex items-center gap-2">
                  <Save size={13} style={{ color: 'var(--accent)' }} />
                  <span>Save File in Place…</span>
                </span>
              </button>
              <div className="download-menu-separator" role="separator" />
            </>
          )}
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
              <span>Download PDF…</span>
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
            disabled={!canExportPdf}
            onClick={() => { setOpen(false); onExportDocx() }}
          >
            <span className="flex items-center gap-2">
              <FileText size={13} style={{ color: 'var(--accent)' }} />
              <span>Export Word Document</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              .docx
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="download-menu-item"
            disabled={!canExportPdf}
            onClick={() => { setOpen(false); onExportSlides('pdf') }}
            data-tooltip="Landscape, one slide per page, like presentation mode"
          >
            <span className="flex items-center gap-2">
              <Presentation size={13} style={{ color: 'var(--accent)' }} />
              <span>Presentation PDF</span>
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
            onClick={() => { setOpen(false); onExportSlides('pptx') }}
            data-tooltip="PowerPoint slides with speaker notes"
          >
            <span className="flex items-center gap-2">
              <Presentation size={13} style={{ color: 'var(--accent)' }} />
              <span>Presentation PowerPoint</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              .pptx
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="download-menu-item"
            disabled={!canExportPdf}
            onClick={() => { setOpen(false); onExportConfluence() }}
            data-tooltip="Confluence storage format: XHTML with Confluence macros"
          >
            <span className="flex items-center gap-2">
              <Code2 size={13} style={{ color: 'var(--accent)' }} />
              <span>Export for Confluence</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              .xml
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="download-menu-item"
            disabled={!canExportPdf}
            onClick={() => { setOpen(false); onCopyShareLink() }}
          >
            <span className="flex items-center gap-2">
              <Share2 size={13} style={{ color: 'var(--accent)' }} />
              <span>Copy Share Link</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              link
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
          {onPublishSite && (
            <button type="button" role="menuitem" className="download-menu-item" disabled={fileCount === 0} onClick={() => { setOpen(false); onPublishSite() }}>
              <span className="flex items-center gap-2">
                <Globe size={13} style={{ color: 'var(--accent)' }} />
                <span>Publish as a Website…</span>
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>site</span>
            </button>
          )}
          <div className="download-menu-separator" role="separator" />
          <button type="button" role="menuitem" className="download-menu-item" onClick={() => { setOpen(false); onBackup() }}>
            <span className="flex items-center gap-2">
              <DatabaseBackup size={13} style={{ color: 'var(--accent)' }} />
              <span>Back Up Workspace</span>
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>.zip</span>
          </button>
          <button type="button" role="menuitem" className="download-menu-item" onClick={() => { setOpen(false); onRestore() }}>
            <span className="flex items-center gap-2">
              <ArchiveRestore size={13} style={{ color: 'var(--accent)' }} />
              <span>Restore from Backup…</span>
            </span>
          </button>
          <button type="button" role="menuitem" className="download-menu-item" onClick={() => { setOpen(false); onStorage() }}>
            <span className="flex items-center gap-2">
              <HardDrive size={13} style={{ color: 'var(--accent)' }} />
              <span>Storage &amp; Data Safety…</span>
            </span>
          </button>
          {onInstallApp && (
            <>
              <div className="download-menu-separator" role="separator" />
              <button type="button" role="menuitem" className="download-menu-item" onClick={() => { setOpen(false); onInstallApp() }}>
                <span className="flex items-center gap-2">
                  <AppDownload size={13} style={{ color: 'var(--accent)' }} />
                  <span>Download ReadMe App</span>
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>app</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── FileTabBar ─────────────────────────────────────────────────
const READING_PET_SKINS = ONEKO_SKINS.map(skin => skin.id)
const READING_PET_SKIN_COLORS = {
  classic: '#9b6b45', black: '#64748b', gray: '#94a3b8', calico: '#d97706', tora: '#c2410c',
  catppuccin: '#cba6f7', ghost: '#cbd5e1', silver: '#94a3b8', spirit: '#a78bfa', valentine: '#e11d48',
  maia: '#e879a9', vaporwave: '#d946ef', ginger: '#ea580c', sage: '#65a30d', siamese: '#8b5e3c',
  'strawberry-milk': '#f472b6', 'blue-frost': '#38bdf8', lavender: '#a78bfa', tuxedo: '#475569',
  peach: '#fb923c', honey: '#ca8a04', mocha: '#92400e', mint: '#14b8a6', 'midnight-blue': '#3b82f6',
}
const petSkinColor = id => READING_PET_SKIN_COLORS[id] || '#a78bfa'

function ReadingPetCoatDropdown({ value, onChange, ariaLabel = 'Cat coat' }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedSkin = ONEKO_SKINS.find(skin => skin.id === value)

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="reading-pet-coat" ref={rootRef}>
      <button
        type="button"
        className="reading-pet-coat-trigger"
        onClick={() => setOpen(current => !current)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Cat className="reading-pet-coat-cat" size={15} style={{ color: petSkinColor(value) }} aria-hidden="true" />
        <span>{selectedSkin?.name || 'Lavender'}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="reading-pet-coat-menu" role="listbox" aria-label="Cat coats">
          {READING_PET_SKINS.map(skinId => {
            const skin = ONEKO_SKINS.find(item => item.id === skinId)
            if (!skin) return null
            return (
              <button
                key={skin.id}
                type="button"
                className={`reading-pet-coat-option${skin.id === value ? ' is-selected' : ''}`}
                role="option"
                aria-selected={skin.id === value}
                onClick={() => { onChange(skin.id); setOpen(false) }}
              >
                <Cat className="reading-pet-coat-cat" size={15} style={{ color: petSkinColor(skin.id) }} aria-hidden="true" />
                <span>{skin.name}</span>
                {skin.id === value && <Check size={13} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ReadingPetToggle({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`reading-pet-toggle-row${disabled ? ' is-disabled' : ''}`}>
      <span>{label}</span>
      <button
        type="button"
        className="reading-pet-switch"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      ><span /></button>
    </label>
  )
}

function loadReadingPetPrefs() {
  const defaults = {
    enabled: true, roaming: false, skin: 'lavender', speed: 10, scale: 1.25, catCount: 1,
    customSprite: '',
    sleepEnabled: true, zoomies: false, freerunChance: .06, animationSpeed: 1, idleThreshold: 1000,
    napWhileTyping: false, followFocus: false, perchOnHover: false, parade: true,
    pettable: true, grabbable: false, treats: false, bubbleEnabled: false, bubbleText: '',
    meow: false, volume: .35, rememberPosition: false, avoidControls: true, visitHeadings: false,
  }
  try {
    const parsed = JSON.parse(localStorage.getItem('readme-reading-pet') || '{}')
    const saved = parsed && typeof parsed === 'object' ? parsed : {}
    const savedPrefs = { ...saved }
    delete savedPrefs.individualCats
    delete savedPrefs.catProfiles
    const migratedSkin = saved.version !== 4 && saved.skin === 'classic' ? 'lavender' : saved.skin
    const boolPrefs = [
      'enabled', 'roaming', 'sleepEnabled', 'zoomies', 'napWhileTyping',
      'followFocus', 'perchOnHover', 'parade', 'pettable', 'grabbable', 'treats',
      'bubbleEnabled', 'meow', 'rememberPosition', 'avoidControls', 'visitHeadings',
    ]
    const normalizedBooleans = Object.fromEntries(boolPrefs.map(key => [key, typeof saved[key] === 'boolean' ? saved[key] : defaults[key]]))
    return {
      ...defaults,
      ...savedPrefs,
      ...normalizedBooleans,
      version: 4,
      skin: READING_PET_SKINS.includes(migratedSkin) ? migratedSkin : defaults.skin,
      speed: Number.isFinite(saved.speed) ? Math.min(18, Math.max(4, saved.speed)) : defaults.speed,
      scale: Number.isFinite(saved.scale) ? Math.min(1.75, Math.max(.75, saved.scale)) : defaults.scale,
      catCount: Number.isFinite(saved.catCount) ? Math.min(10, Math.max(1, Math.round(saved.catCount))) : defaults.catCount,
      customSprite: '',
      freerunChance: Number.isFinite(saved.freerunChance) ? Math.min(.2, Math.max(.01, saved.freerunChance)) : defaults.freerunChance,
      animationSpeed: Number.isFinite(saved.animationSpeed) ? Math.min(2, Math.max(.5, saved.animationSpeed)) : defaults.animationSpeed,
      idleThreshold: Number.isFinite(saved.idleThreshold) ? Math.min(5000, Math.max(400, saved.idleThreshold)) : defaults.idleThreshold,
      volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : defaults.volume,
      bubbleText: typeof saved.bubbleText === 'string' ? saved.bubbleText.slice(0, 180) : defaults.bubbleText,
    }
  } catch {
    return defaults
  }
}

function ReadingPetSettings({ prefs, onChange, lite }) {
  const updatePref = (key, value) => onChange(key, value)
  return (
    <div className="settings-pet-panel">
      {lite && <p className="settings-muted">Lite mode is on in Features, so the reading cats are hidden until you turn Lite mode off.</p>}

      <section className="reading-pet-section" aria-label="Basic settings">
        <label className="reading-pet-setting">
          <span>Coat</span>
          <ReadingPetCoatDropdown value={prefs.skin} onChange={skin => updatePref('skin', skin)} />
        </label>
        <div className="reading-pet-count-row">
          <span>Number of cats</span>
          <div className="reading-pet-count-control" aria-label="Number of cats">
            <button type="button" onClick={() => updatePref('catCount', Math.max(1, prefs.catCount - 1))} disabled={prefs.catCount <= 1} aria-label="Remove a cat"><Minus size={13} /></button>
            <output aria-live="polite" aria-label="Cat count">{prefs.catCount}</output>
            <button type="button" onClick={() => updatePref('catCount', Math.min(10, prefs.catCount + 1))} disabled={prefs.catCount >= 10} aria-label="Add a cat"><Plus size={13} /></button>
          </div>
        </div>
        <div className="reading-pet-popover-sliders">
          <label className="reading-pet-setting reading-pet-range">
            <span>Speed <b>{prefs.speed}</b></span>
            <input type="range" min="4" max="18" step="1" value={prefs.speed} onChange={event => updatePref('speed', Number(event.target.value))} aria-label="Cat speed" />
          </label>
          <label className="reading-pet-setting reading-pet-range">
            <span>Size <b>{prefs.scale.toFixed(2)}×</b></span>
            <input type="range" min="0.75" max="1.75" step="0.25" value={prefs.scale} onChange={event => updatePref('scale', Number(event.target.value))} aria-label="Cat size" />
          </label>
        </div>
        <div className="reading-pet-actions">
          <button type="button" className="reading-pet-button reading-pet-roam" onClick={() => updatePref('roaming', !prefs.roaming)} aria-pressed={prefs.roaming}>
            {prefs.roaming ? <PanelBottom size={13} /> : <Footprints size={13} />}
            <span>{prefs.roaming ? 'Footer only' : 'Roam screen'}</span>
          </button>
          <button type="button" className={`reading-pet-button reading-pet-toggle${prefs.enabled ? '' : ' is-disabled'}`} onClick={() => updatePref('enabled', !prefs.enabled)} aria-pressed={prefs.enabled}>
            {prefs.enabled ? <span className="reading-pet-status-dot" /> : <Cat size={13} />}
            <span>{prefs.enabled ? 'Disable' : 'Enable'}</span>
          </button>
        </div>
      </section>

      <div className="reading-pet-advanced">
        <h3 className="reading-pet-advanced-title">Advanced options</h3>
        <div className="reading-pet-advanced-options">
          <section className="reading-pet-section" aria-label="Behavior">
            <h3>Behavior</h3>
            <ReadingPetToggle label="Sleep when idle" checked={prefs.sleepEnabled} onChange={value => updatePref('sleepEnabled', value)} />
            <ReadingPetToggle label="Zoomies while roaming" checked={prefs.zoomies} onChange={value => updatePref('zoomies', value)} disabled={!prefs.roaming} />
            {prefs.zoomies && prefs.roaming && <label className="reading-pet-setting reading-pet-range"><span>Zoomies chance <b>{Math.round(prefs.freerunChance * 100)}%</b></span><input type="range" min="0.01" max="0.2" step="0.01" value={prefs.freerunChance} onChange={event => updatePref('freerunChance', Number(event.target.value))} aria-label="Zoomies chance" /></label>}
            <div className="reading-pet-popover-sliders">
              <label className="reading-pet-setting reading-pet-range"><span>Idle after <b>{(prefs.idleThreshold / 1000).toFixed(1)}s</b></span><input type="range" min="400" max="5000" step="200" value={prefs.idleThreshold} onChange={event => updatePref('idleThreshold', Number(event.target.value))} aria-label="Idle animation delay" /></label>
              <label className="reading-pet-setting reading-pet-range"><span>Animation <b>{prefs.animationSpeed.toFixed(1)}×</b></span><input type="range" min="0.5" max="2" step="0.1" value={prefs.animationSpeed} onChange={event => updatePref('animationSpeed', Number(event.target.value))} aria-label="Idle animation speed" /></label>
            </div>
          </section>

          <section className="reading-pet-section" aria-label="Page reactions">
            <h3>Page reactions</h3>
            <ReadingPetToggle label="Nap while I type" checked={prefs.napWhileTyping} onChange={value => updatePref('napWhileTyping', value)} disabled={!prefs.roaming} />
            <ReadingPetToggle label="Follow keyboard focus" checked={prefs.followFocus} onChange={value => updatePref('followFocus', value)} disabled={!prefs.roaming} />
            <ReadingPetToggle label="Perch on hovered controls" checked={prefs.perchOnHover} onChange={value => updatePref('perchOnHover', value)} disabled={!prefs.roaming} />
          </section>

          <section className="reading-pet-section" aria-label="Play">
            <h3>Play</h3>
            <ReadingPetToggle label="Allow keyboard petting" checked={prefs.pettable} onChange={value => updatePref('pettable', value)} />
            <ReadingPetToggle label="Drag and toss" checked={prefs.grabbable} onChange={value => updatePref('grabbable', value)} disabled={!prefs.roaming} />
            <ReadingPetToggle label="Drop fish treats on double-click" checked={prefs.treats} onChange={value => updatePref('treats', value)} disabled={!prefs.roaming} />
            <ReadingPetToggle label="Thought bubbles" checked={prefs.bubbleEnabled} onChange={value => updatePref('bubbleEnabled', value)} />
            {prefs.bubbleEnabled && <label className="reading-pet-setting"><span>Thoughts (one per line)</span><textarea rows="2" value={prefs.bubbleText} maxLength={180} onChange={event => updatePref('bubbleText', event.target.value)} aria-label="Pet thought bubbles" /></label>}
            <ReadingPetToggle label="Meow sounds" checked={prefs.meow} onChange={value => updatePref('meow', value)} />
            {prefs.meow && <label className="reading-pet-setting reading-pet-range"><span>Volume <b>{Math.round(prefs.volume * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={event => updatePref('volume', Number(event.target.value))} aria-label="Pet sound volume" /></label>}
          </section>

          <section className="reading-pet-section" aria-label="Movement">
            <h3>Movement</h3>
            <ReadingPetToggle label="Cats follow one another" checked={prefs.parade} onChange={value => updatePref('parade', value)} disabled={prefs.catCount < 2} />
            <ReadingPetToggle label="Remember roaming positions" checked={prefs.rememberPosition} onChange={value => updatePref('rememberPosition', value)} />
            <ReadingPetToggle label="Avoid app toolbars" checked={prefs.avoidControls} onChange={value => updatePref('avoidControls', value)} disabled={!prefs.roaming} />
            <ReadingPetToggle label="Visit document headings" checked={prefs.visitHeadings} onChange={value => updatePref('visitHeadings', value)} disabled={!prefs.roaming} />
          </section>
        </div>
      </div>
    </div>
  )
}

function ReadingPetFooter({ prefs }) {
  const footerRef = useRef(null)
  const catRefs = useRef([])
  const speakingCatRef = useRef(0)
  const thoughtIndexRef = useRef(0)
  const [footerBounds, setFooterBounds] = useState(null)

  useLayoutEffect(() => {
    const measure = () => {
      const rect = footerRef.current?.getBoundingClientRect()
      if (!rect) return
      setFooterBounds({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight })
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' && footerRef.current
      ? new ResizeObserver(measure)
      : null
    if (footerRef.current) observer?.observe(footerRef.current)
    window.addEventListener('resize', measure)
    document.addEventListener('fullscreenchange', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('fullscreenchange', measure)
    }
  }, [])

  const bubbleMessages = useMemo(() => prefs.bubbleText
    .split('\n')
    .map(message => message.trim())
    .filter(Boolean), [prefs.bubbleText])

  useEffect(() => {
    if (!prefs.enabled || !prefs.bubbleEnabled || bubbleMessages.length === 0) return undefined
    const sayNextThought = () => {
      const catIndex = speakingCatRef.current % prefs.catCount
      const thought = bubbleMessages[thoughtIndexRef.current % bubbleMessages.length]
      catRefs.current[catIndex]?.say(thought, { duration: 4500 })
      speakingCatRef.current = (catIndex + 1) % prefs.catCount
      thoughtIndexRef.current = (thoughtIndexRef.current + 1) % bubbleMessages.length
    }
    let interval
    const firstThought = setTimeout(() => {
      sayNextThought()
      interval = setInterval(sayNextThought, 18_000)
    }, 1200)
    return () => {
      clearTimeout(firstThought)
      clearInterval(interval)
    }
  }, [prefs.enabled, prefs.bubbleEnabled, prefs.catCount, bubbleMessages])

  useEffect(() => {
    if (!prefs.enabled || prefs.roaming || !footerBounds) return undefined
    const left = Math.min(footerBounds.right - 80, Math.max(40, footerBounds.left + 40))
    const right = Math.max(left, footerBounds.right - 80)
    const y = Math.min(footerBounds.height - 20, Math.max(20, (footerBounds.top + footerBounds.bottom) / 2))
    let cancelled = false
    const timers = []
    const laneWidth = right - left
    const segmentWidth = laneWidth / prefs.catCount
    for (let index = 0; index < prefs.catCount; index += 1) {
      const laneRadius = 16 * prefs.scale
      const segmentLeft = left + segmentWidth * index
      const segmentRight = index === prefs.catCount - 1 ? right : left + segmentWidth * (index + 1)
      const inset = Math.min(laneRadius + 4, Math.max(0, (segmentRight - segmentLeft) / 2 - 8))
      const targetLeft = segmentLeft + inset
      const targetRight = Math.max(targetLeft, segmentRight - inset)
      let walkingRight = index % 2 === 0
      const walk = () => {
        if (cancelled) return
        const cat = catRefs.current[index]
        if (!cat) {
          timers[index] = setTimeout(walk, 300)
          return
        }
        const target = { x: walkingRight ? targetRight : targetLeft, y }
        walkingRight = !walkingRight
        cat.goTo(target).then(() => {
          if (!cancelled) timers[index] = setTimeout(walk, 900 + index * 110)
        })
      }
      timers[index] = setTimeout(walk, 300 + index * 220)
    }
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [prefs.enabled, prefs.roaming, prefs.speed, prefs.scale, prefs.catCount, footerBounds])

  const zones = useMemo(() => {
    const result = []
    if (!prefs.roaming && footerBounds) {
      const { width, height } = footerBounds
      const catRadius = 16 * prefs.scale * Math.SQRT2 + 1
      const laneTop = Math.max(0, Math.min(height * .9, height - catRadius * 2 - 2))
      result.push({ id: 'pet-bottom-lane', type: 'avoid', rect: { left: 0, top: 0, right: width, bottom: laneTop } })
    }
    if (prefs.roaming && prefs.avoidControls) {
      result.push({ id: 'readme-controls', type: 'avoid', selector: '.surface-header, .file-tabs-bar, .reader-preview-toolbar', padding: 4 })
    }
    if (prefs.roaming && prefs.visitHeadings) {
      result.push({ id: 'document-headings', type: 'attract', selector: '.book-page h1, .book-page h2, .book-page h3' })
    }
    return result
  }, [footerBounds, prefs.avoidControls, prefs.roaming, prefs.scale, prefs.visitHeadings])

  return (
    <>
      {createPortal(<footer ref={footerRef} className="reading-pet-footer no-print" aria-hidden="true" />, document.body)}
      {prefs.enabled && Array.from({ length: prefs.catCount }, (_, index) => {
        const left = 40
        const right = Math.max(left, window.innerWidth - 80)
        const fraction = (index + .5) / prefs.catCount
        const initialPos = prefs.roaming
          ? { x: window.innerWidth * (index + 1) / (prefs.catCount + 1), y: window.innerHeight * .9 }
          : { x: left + (right - left) * fraction, y: Math.max(24, (footerBounds?.top ?? window.innerHeight - 64) + 32) }
        return (
          <Oneko
            key={`${prefs.roaming ? 'pet-screen-roam' : 'pet-footer-lane'}-${index}`}
            ref={cat => { catRefs.current[index] = cat }}
            skin={prefs.skin}
            speed={prefs.speed}
            scale={prefs.scale}
            followCursor={prefs.roaming}
            chase={prefs.parade && index > 0 ? 'cat' : 'cursor'}
            freerunChance={prefs.roaming && prefs.zoomies ? prefs.freerunChance : 0}
            sleepEnabled={prefs.sleepEnabled}
            idleThreshold={prefs.idleThreshold}
            animationSpeed={prefs.animationSpeed}
            napWhileTyping={prefs.roaming && prefs.napWhileTyping}
            followFocus={prefs.roaming && prefs.followFocus}
            perchOnHover={prefs.roaming && prefs.perchOnHover}
            grabbable={prefs.roaming && prefs.grabbable}
            treats={prefs.roaming && prefs.treats}
            meow={prefs.meow}
            volume={prefs.volume}
            soundBasePath="/cat-sounds"
            zones={zones}
            zoneAttractionChance={prefs.roaming && prefs.visitHeadings ? .25 : 0}
            bubbleEnabled={false}
            pettable={prefs.pettable}
            persistPosition={prefs.rememberPosition}
            storageKey={`readme-reading-pet:${index}`}
            initialPos={initialPos}
            seasonal={false}
            onSleep={() => {
              if (prefs.bubbleEnabled && bubbleMessages.length > 0) {
                catRefs.current[index]?.say(bubbleMessages[index % bubbleMessages.length], { duration: 4500 })
              }
            }}
            zIndex={50}
          />
        )
      })}
    </>
  )
}

// Per-file reading state (collapsed sections + preview scroll position),
// cached in memory and persisted to localStorage.
const READING_STATE_KEY = 'readme-reading-state'
let readingStateCache = null
function readingState() {
  if (!readingStateCache) {
    try {
      const parsed = JSON.parse(localStorage.getItem(READING_STATE_KEY) || '{}')
      readingStateCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      readingStateCache = {}
    }
  }
  return readingStateCache
}
let readingStateTimer = null
function updateReadingState(fileId, patch) {
  if (!fileId) return
  const all = readingState()
  all[fileId] = { ...all[fileId], ...patch, at: Date.now() }
  clearTimeout(readingStateTimer)
  readingStateTimer = setTimeout(() => {
    const entries = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 200)
    readingStateCache = Object.fromEntries(entries)
    try { localStorage.setItem(READING_STATE_KEY, JSON.stringify(readingStateCache)) } catch { /* storage is optional */ }
  }, 250)
}
function initialSectionState(docKey, fileId, isLong) {
  const saved = fileId ? readingState()[fileId] : null
  return {
    docKey,
    mode: saved?.mode === 'collapsed' || saved?.mode === 'expanded' ? saved.mode : (isLong ? 'collapsed' : 'expanded'),
    overrides: new Set(Array.isArray(saved?.overrides) ? saved.overrides : []),
  }
}

// Cross-fades theme changes with the View Transitions API when available
// (skipped for reduced motion). flushSync applies the new classes inside the
// transition callback so the "after" snapshot is the new theme.
function withThemeTransition(update) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduceMotion) { update(); return }
  document.startViewTransition(() => flushSync(update))
}

// Smooth scrolling unless the user prefers reduced motion.
const scrollBehavior = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

// True for drags that carry files from the operating system (not in-app drags).
function isExternalFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

// Pinned tabs always sit before the others; order inside each group is kept.
// Files ReadMe can open; Word and HTML ones are converted to Markdown.
const IMPORTABLE_FILE_RE = /\.(md|markdown|txt|docx|html?)$/i
const CONVERTIBLE_FILE_RE = /\.(docx|html?)$/i
// At most this many files can be pinned (they stay first in the tab bar).
const MAX_PINNED = 5
const uniqueName = (name, taken) => {
  const lower = new Set(taken.map(item => item.toLowerCase()))
  if (!lower.has(name.toLowerCase())) return name
  const slash = name.lastIndexOf('/')
  const dir = slash === -1 ? '' : name.slice(0, slash + 1)
  return dir + makeDuplicateFileName(name.slice(slash + 1), taken.filter(item => item.startsWith(dir)).map(item => item.slice(dir.length)))
}
const cleanFolderName = raw => raw.trim().replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/').replace(/[\\:*?"<>|]+/g, '-')
function orderPinnedFirst(list) {
  return [...list.filter(file => file.pinned), ...list.filter(file => !file.pinned)]
}
// Fields that are safe to persist in localStorage and share with other browser tabs.
function syncableFile({ id, name, content, pinned, color, wordGoal, updatedAt }) {
  return { id, name, content, ...(pinned ? { pinned: true } : {}), ...(color ? { color } : {}), ...(wordGoal > 0 ? { wordGoal } : {}), ...(updatedAt ? { updatedAt } : {}) }
}

// Applies an edit to the textarea through the browser's editing commands so
// native undo / redo keep working; falls back to setRangeText.
function applyTextareaEdit(textarea, edit) {
  if (textarea.applyEdit) { textarea.applyEdit(edit); return } // CodeMirror adapter
  textarea.focus()
  textarea.setSelectionRange(edit.from, edit.to)
  let applied = false
  try {
    applied = edit.text
      ? document.execCommand('insertText', false, edit.text)
      : edit.from === edit.to || document.execCommand('delete', false)
  } catch { applied = false }
  if (!applied) {
    textarea.setRangeText(edit.text, edit.from, edit.to, 'end')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
  textarea.setSelectionRange(edit.cursor, edit.cursorEnd ?? edit.cursor)
}

// ── Editor preferences ─────────────────────────────────────────
const MAX_CLOSED_FILES = 100
const EDITOR_PREFS_KEY = 'readme-editor-prefs'
// The simple (textarea) editor is the default; the code editor is opt-in.
const EDITOR_PREFS_VERSION = 2
const DEFAULT_EDITOR_PREFS = { engine: 'plain', keymap: 'default', lineNumbers: false, syntaxColors: true, version: EDITOR_PREFS_VERSION }
function loadEditorPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(EDITOR_PREFS_KEY) || '{}')
    return {
      // Before v2 the code editor was the default and got saved for everyone: move back to simple once.
      engine: saved.version === EDITOR_PREFS_VERSION && saved.engine === 'code' ? 'code' : 'plain',
      version: EDITOR_PREFS_VERSION,
      keymap: ['vim', 'emacs'].includes(saved.keymap) ? saved.keymap : 'default',
      lineNumbers: saved.lineNumbers === true,
      syntaxColors: saved.syntaxColors !== false,
    }
  } catch {
    return DEFAULT_EDITOR_PREFS
  }
}

function EditorOptions({ prefs, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = event => { if (!ref.current?.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const set = (key, value) => onChange({ ...prefs, [key]: value })
  const option = (key, value, label) => (
    <button key={value} type="button" role="radio" aria-checked={prefs[key] === value}
      className={prefs[key] === value ? 'is-active' : ''} onClick={() => set(key, value)}
      disabled={key === 'keymap' && prefs.engine !== 'code'}>
      {label}
    </button>
  )
  return (
    <div className="editor-options" ref={ref}>
      <button type="button" className={`editor-options-trigger${prefs.engine === 'code' && prefs.keymap !== 'default' ? ' has-label' : ''}`} onClick={() => setOpen(value => !value)}
        aria-label="Editor options" aria-expanded={open} data-tooltip="Editor options">
        <Settings2 size={11} />
        {prefs.engine === 'code' && prefs.keymap !== 'default' && <span>{prefs.keymap === 'vim' ? 'Vim' : 'Emacs'}</span>}
      </button>
      {open && (
        <div className="editor-options-popover anim-drop-in" role="dialog" aria-label="Editor options">
          <div className="pdf-option" role="radiogroup" aria-label="Editor">
            <span className="pdf-option-label">Editor</span>
            <div className="pdf-segmented">{option('engine', 'code', 'Code editor')}{option('engine', 'plain', 'Simple')}</div>
            <span className="pdf-toggle-hint">{prefs.engine === 'code' ? 'Syntax colours, heading folding synced with the preview' : 'A plain text box — lightest and most compatible'}</span>
          </div>
          <div className="pdf-option" role="radiogroup" aria-label="Key bindings">
            <span className="pdf-option-label">Key bindings</span>
            <div className="pdf-segmented">{option('keymap', 'default', 'Standard')}{option('keymap', 'vim', 'Vim')}{option('keymap', 'emacs', 'Emacs')}</div>
            {prefs.engine !== 'code' && <span className="pdf-toggle-hint">Available in the code editor</span>}
          </div>
          <label className="pdf-toggle">
            <span>
              <span className="pdf-option-label">Syntax colours</span>
              <span className="pdf-toggle-hint">Off shows plain text, like the simple editor</span>
            </span>
            <input type="checkbox" checked={prefs.syntaxColors && prefs.engine === 'code'} disabled={prefs.engine !== 'code'}
              onChange={event => set('syntaxColors', event.target.checked)} />
            <span className="pdf-switch" aria-hidden="true" />
          </label>
          <label className="pdf-toggle">
            <span><span className="pdf-option-label">Line numbers</span></span>
            <input type="checkbox" checked={prefs.lineNumbers && prefs.engine === 'code'} disabled={prefs.engine !== 'code'}
              onChange={event => set('lineNumbers', event.target.checked)} />
            <span className="pdf-switch" aria-hidden="true" />
          </label>
        </div>
      )}
    </div>
  )
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function WritingGoal({ words, goal, sessionWords, activeMs, onGoalChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = event => { if (!ref.current?.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const progress = goal > 0 ? Math.min(1, words / goal) : 0
  const wpm = activeMs > 60000 ? Math.max(0, Math.round(sessionWords / (activeMs / 60000))) : null
  const commit = () => {
    const value = Math.round(Number(draft))
    onGoalChange(Number.isFinite(value) && value > 0 ? Math.min(value, 1_000_000) : null)
  }
  return (
    <div className="writing-goal" ref={ref}>
      <button
        type="button"
        className={`writing-goal-trigger${goal > 0 ? ' has-goal' : ''}${progress >= 1 ? ' is-complete' : ''}`}
        onClick={() => { setDraft(goal > 0 ? String(goal) : ''); setOpen(value => !value) }}
        aria-label={goal > 0 ? `${words} of ${goal} words. Writing goal and session stats` : `${words} words. Set a writing goal`}
        aria-expanded={open}
        title="Writing goal & session stats"
      >
        {goal > 0 && (
          <svg width="12" height="12" viewBox="0 0 36 36" aria-hidden="true" className="writing-goal-ring">
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="5" className="writing-goal-ring-track" />
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="5" className="writing-goal-ring-value"
              strokeDasharray={`${progress * 94.25} 94.25`} transform="rotate(-90 18 18)" strokeLinecap="round" />
          </svg>
        )}
        <span className="tabular-nums">{goal > 0 ? `${words.toLocaleString()} / ${goal.toLocaleString()}` : `${words.toLocaleString()} words`}</span>
      </button>
      {open && (
        <div className="writing-goal-popover anim-drop-in" role="dialog" aria-label="Writing goal">
          <form onSubmit={event => { event.preventDefault(); commit(); setOpen(false) }} className="writing-goal-form">
            <label htmlFor="writing-goal-input">Word goal for this file</label>
            <div>
              <input id="writing-goal-input" type="number" min="1" step="1" inputMode="numeric" placeholder="e.g. 1000"
                value={draft} onChange={event => setDraft(event.target.value)} autoFocus />
              <button type="submit" className="reader-chip active">Set</button>
              {goal > 0 && <button type="button" className="reader-chip" onClick={() => { onGoalChange(null); setOpen(false) }}>Clear</button>}
            </div>
          </form>
          {goal > 0 && (
            <div className="writing-goal-progress">
              <div className="writing-goal-bar"><span style={{ width: `${progress * 100}%` }} /></div>
              <span>{progress >= 1 ? 'Goal reached 🎉' : `${Math.max(0, goal - words).toLocaleString()} words to go`}</span>
            </div>
          )}
          <dl className="writing-goal-stats">
            <div><dt>This session</dt><dd className={sessionWords > 0 ? 'is-positive' : sessionWords < 0 ? 'is-negative' : ''}>{sessionWords > 0 ? '+' : ''}{sessionWords.toLocaleString()} words</dd></div>
            <div><dt>Writing time</dt><dd>{formatDuration(activeMs)}</dd></div>
            <div><dt>Pace</dt><dd>{wpm === null ? '—' : `${wpm} words/min`}</dd></div>
          </dl>
        </div>
      )}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState(() => {
    // A default theme chosen in Settings wins over the last-used one on every launch.
    let preferred = ''
    try { preferred = JSON.parse(localStorage.getItem('readme-app-settings') || '{}').defaultTheme ?? '' } catch { /* ignore */ }
    if (THEME_IDS.includes(preferred)) return preferred
    const saved = localStorage.getItem('readme-theme')
    return THEME_IDS.includes(saved)
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const isDark = themeById(theme).dark
  const isSepia = ENABLE_SEPIA_THEME && theme === 'sepia'
  // Small icons: two-tone on light themes, filled on dark ones.
  const smallIconStyle = isDark ? 'filled' : 'two-tone'
  const [highContrast, setHighContrast] = useState(
    () => localStorage.getItem('readme-high-contrast') === 'true'
  )
  const [appSettings, setAppSettings] = useState(() => {
    const defaults = { hideAi: false, lite: false, extraThemes: false, defaultTheme: '', embedImages: false, defaultDocStyle: 'readme', workspaceSyncDisabled: false, workspaceAutosaveMs: 300, recoverySnapshotMinutes: 10 }
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('readme-app-settings') || '{}') } } catch { return defaults }
  })
  const updateAppSetting = useCallback((key, value) => setAppSettings(current => ({ ...current, [key]: value })), [])
  const [petPrefs, setPetPrefs] = useState(loadReadingPetPrefs)
  const updatePetPref = useCallback((key, value) => setPetPrefs(current => ({ ...current, [key]: value })), [])
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem('readme-reading-pet', JSON.stringify({ ...petPrefs, version: 4 })) } catch { /* storage is optional */ }
    }, 160)
    return () => clearTimeout(timer)
  }, [petPrefs])

  // ── Guided start: welcome + tour on a first visit, "What's new" after an update ──
  const [startupNotice, setStartupNotice] = useState(() => {
    try {
      // Automated browsers (tests) skip it unless asked to show it.
      if (navigator.webdriver && !localStorage.getItem('readme-show-onboarding')) return null
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(key => key && key !== 'readme-show-onboarding')
      return computeStartupNotice({ storedKeys: keys, appVersion: APP_VERSION, releases: RELEASES })
    } catch { return null }
  })
  useEffect(() => { markVersionSeen(APP_VERSION) }, [])
  const [tourOpen, setTourOpen] = useState(false)
  const startTour = useCallback(() => { setStartupNotice(null); setTourOpen(true) }, [])
  useEffect(() => {
    try { localStorage.setItem('readme-app-settings', JSON.stringify(appSettings)) } catch { /* storage is optional */ }
  }, [appSettings])
  useLayoutEffect(() => { document.documentElement.classList.toggle('lite-mode', appSettings.lite) }, [appSettings.lite])
  const [settingsOpen, setSettingsOpen] = useState(null) // section id when open
  const [helpOpen, setHelpOpen] = useState(false)
  const hideAi = appSettings.hideAi
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
  const [copyAllDone, setCopyAllDone] = useState(false)
  const [copyConfluenceDone, setCopyConfluenceDone] = useState(false)
  const [readerPrefs, setReaderPrefs] = useState(loadReaderPrefs)
  const [uiDensity, setUiDensity] = useState(() => localStorage.getItem('readme-ui-density') === 'compact' ? 'compact' : 'comfortable')
  const [readingBookmarks, setReadingBookmarks] = useState(loadReadingBookmarks)
  const [readerOpen, setReaderOpen]   = useState(false)
  const [readProgress, setReadProgress] = useState(0)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [searchCount, setSearchCount] = useState(0)
  const [lightbox, setLightbox] = useState(null)
  const [syncScroll, setSyncScroll]   = useState(true)
  const [cmdOpen, setCmdOpen]         = useState(false)
  const [cmdQuery, setCmdQuery]       = useState('')
  const [diffOpen, setDiffOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [linkCheckOpen, setLinkCheckOpen] = useState(false)
  const [recoveryData, setRecoveryData] = useState(null)
  const appInstall = useAppInstall()
  const [speechActive, setSpeechActive] = useState(false)
  const [speechPaused, setSpeechPaused] = useState(false)
  const [keepAwake, setKeepAwake] = useState(false)
  const [annotations, setAnnotations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('readme-annotations') || '[]') } catch { return [] }
  })
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [annotationNote, setAnnotationNote] = useState('')
  const [annotationColor, setAnnotationColor] = useState(() => localStorage.getItem('readme-annotation-color') || 'yellow')
  useEffect(() => { try { localStorage.setItem('readme-annotation-color', annotationColor) } catch { /* optional */ } }, [annotationColor])
  // The highlights popover closes with its × button, Escape, or a click (not a hover) anywhere outside it.
  const annotationControlRef = useRef(null)
  useEffect(() => {
    if (!annotationOpen) return undefined
    const onDown = event => { if (!annotationControlRef.current?.contains(event.target)) setAnnotationOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setAnnotationOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [annotationOpen])
  const [selectedQuote, setSelectedQuote] = useState('')

  const activeFile = useMemo(
    () => files.find(f => f.id === activeFileId) ?? null,
    [files, activeFileId]
  )
  const content = activeFile?.content ?? ''
  const [recentIds, setRecentIds] = useState(() => (activeFileId ? [activeFileId] : []))
  const currentWords = useMemo(() => countWords(content), [content])
  if (activeFileId && recentIds[0] !== activeFileId) {
    setRecentIds([activeFileId, ...recentIds.filter(id => id !== activeFileId)].slice(0, 30))
  }
  const fileName = activeFile?.name ?? null
  const fileNameRef = useRef(fileName)
  useEffect(() => { fileNameRef.current = fileName }, [fileName])
  const { meta: frontmatterMeta, body: markdownBody } = useMemo(
    () => parseFrontmatter(content),
    [content]
  )

  // Collapsible heading sections. Long documents (> 5 min read) start
  // collapsed; each file remembers its own collapse state across reloads.
  const isLongDocument = useMemo(
    () => Math.ceil((markdownBody.match(/\S+/g)?.length ?? 0) / 220) > 5,
    [markdownBody]
  )
  const sectionDocKey = `${activeFileId}:${workspaceReady}`
  const [sectionCollapse, setSectionCollapse] = useState(() => initialSectionState(sectionDocKey, activeFileId, isLongDocument))
  if (sectionCollapse.docKey !== sectionDocKey) {
    setSectionCollapse(initialSectionState(sectionDocKey, activeFileId, isLongDocument))
  }
  useEffect(() => {
    if (!workspaceReady || !sectionCollapse.docKey.endsWith(':true')) return
    const fileId = sectionCollapse.docKey.slice(0, sectionCollapse.docKey.lastIndexOf(':'))
    if (fileId && fileId !== 'null') updateReadingState(fileId, { mode: sectionCollapse.mode, overrides: [...sectionCollapse.overrides] })
  }, [sectionCollapse, workspaceReady])
  const toggleSection = useCallback(key => {
    setSectionCollapse(state => {
      const overrides = new Set(state.overrides)
      if (overrides.has(key)) overrides.delete(key)
      else overrides.add(key)
      return { ...state, overrides }
    })
  }, [])
  const toggleAllSections = useCallback(() => {
    setSectionCollapse(state => ({ ...state, mode: state.mode === 'collapsed' ? 'expanded' : 'collapsed', overrides: new Set() }))
  }, [])
  // Section state shared with the code editor so folds mirror preview collapse.
  const handleEditorSectionToggle = useCallback((key, folded, title = false) => {
    setSectionCollapse(state => {
      const collapsed = isSectionCollapsed({ mode: state.mode, overrides: state.overrides }, { dataSectionKey: key, dataTitleSection: title })
      if (collapsed === folded) return state
      const overrides = new Set(state.overrides)
      if (overrides.has(key)) overrides.delete(key)
      else overrides.add(key)
      return { ...state, overrides }
    })
  }, [])

  // "Focus on section" mode: only one chapter-level section is shown at a time.
  const [focusSection, setFocusSection] = useState(null)
  if (focusSection && focusSection.docKey !== sectionDocKey) setFocusSection(null)
  const searchingDocument = Boolean(searchOpen && searchQuery.trim())
  const [contentFilter, setContentFilter] = useState(null)
  const [onlyBookmarked, setOnlyBookmarked] = useState(false)
  const sectionCollapseValue = useMemo(() => ({
    mode: sectionCollapse.mode,
    overrides: sectionCollapse.overrides,
    // Show everything while searching or filtering so every hit is visible.
    forceExpanded: searchingDocument || Boolean(contentFilter) || onlyBookmarked,
    focusKey: searchingDocument ? null : focusSection?.key ?? null,
    toggle: toggleSection,
  }), [sectionCollapse.mode, sectionCollapse.overrides, searchingDocument, focusSection, toggleSection, contentFilter, onlyBookmarked])
  const editorSectionState = useMemo(() => ({
    isCollapsed: (key, title) => isSectionCollapsed(sectionCollapseValue, { dataSectionKey: key, dataTitleSection: title }),
  }), [sectionCollapseValue])

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
  // Files closed from the tab bar stay listed in the Files panel (newest last) so they can be reopened.
  const [closedFiles, setClosedFiles] = useState([])
  const canReopen = closedFiles.length > 0
  const closedFileList = useMemo(() => closedFiles.map(entry => entry.file), [closedFiles])
  // Every document (open and closed), for wiki links and "Linked from".
  const linkableFiles = useMemo(() => [...files, ...closedFiles.map(entry => entry.file)], [files, closedFiles])
  // Exports get [[wiki links]] as ordinary relative links (Markdown, PDF, Word, Confluence, slides).
  const exportContent = useMemo(() => wikiLinksToMarkdown(content, fileName ?? '', linkableFiles), [content, fileName, linkableFiles])
  // ── Image attachments ───────────────────────────────────────
  const [attachments, setAttachments] = useState(() => new Map()) // path → { path, blob, type, size, createdAt, url }
  const [attachmentsReady, setAttachmentsReady] = useState(false)
  const attachmentsRef = useRef(attachments)
  useEffect(() => { attachmentsRef.current = attachments }, [attachments])
  useEffect(() => {
    let cancelled = false
    readAllAttachments().then(list => {
      if (cancelled) return
      setAttachments(new Map(list.map(record => [record.path, { ...record, url: URL.createObjectURL(record.blob) }])))
    }).catch(() => {}).finally(() => { if (!cancelled) setAttachmentsReady(true) })
    return () => { cancelled = true }
  }, [])
  const attachmentUrls = useMemo(() => new Map([...attachments].map(([path, record]) => [path, record.url])), [attachments])
  /** Stores an image and returns its path ("attachments/name.png"). */
  const addAttachment = useCallback(async (blob, name, path = null) => {
    const target = path ?? attachmentPath(name, blob.type, attachmentsRef.current.keys())
    const record = { path: target, blob, type: blob.type, size: blob.size, createdAt: Date.now() }
    await putAttachment(record)
    const url = URL.createObjectURL(blob)
    attachmentsRef.current = new Map(attachmentsRef.current).set(target, { ...record, url })
    setAttachments(prev => { const old = prev.get(target); if (old?.url) URL.revokeObjectURL(old.url); return new Map(prev).set(target, { ...record, url }) })
    return target
  }, [])
  const removeAttachment = useCallback(async path => {
    await deleteAttachment(path)
    setAttachments(prev => { const next = new Map(prev); const old = next.get(path); if (old?.url) URL.revokeObjectURL(old.url); next.delete(path); return next })
  }, [])
  /** The document with its attachments embedded as data (for share links, which carry everything). */
  const inlineAttachments = useCallback(async (markdown, docName) => {
    const data = new Map()
    for (const ref of imageReferences(markdown)) {
      const path = resolveImagePath(ref.src, docName)
      const record = path && attachmentsRef.current.get(path)
      if (record && !data.has(path)) data.set(path, await blobToDataUrl(record.blob))
    }
    return data.size ? rewriteImageSources(markdown, docName, (_ref, path) => data.get(path) ?? null) : markdown
  }, [])
  /** Adds the attachments these documents use to a ZIP (as "attachments/…" files). */
  const zipAttachments = useCallback((zip, docs) => {
    const paths = new Set(docs.flatMap(doc => attachmentsUsed(doc.content, doc.name)))
    for (const path of paths) { const record = attachmentsRef.current.get(path); if (record) zip.file(path, record.blob) }
    return paths.size
  }, [])
  const attachmentContext = useMemo(() => ({ urls: attachmentUrls, docName: fileName ?? '', ready: attachmentsReady }), [attachmentUrls, fileName, attachmentsReady])
  // Exports read images by URL: attachments become in-memory URLs for them.
  const exportBody = useMemo(() => rewriteImageSources(wikiLinksToMarkdown(markdownBody, fileName ?? '', linkableFiles), fileName ?? '', (_ref, path) => attachmentUrls.get(path) ?? null), [markdownBody, fileName, linkableFiles, attachmentUrls])
  const backlinks = useMemo(() => (activeFile ? findBacklinks(activeFile, linkableFiles) : []), [activeFile, linkableFiles])
  // Tasks across every document (a file is parsed again only when its text changes).
  const taskCacheRef = useRef(new Map())
  const allTasks = useMemo(() => {
    const cache = taskCacheRef.current
    const closedIds = new Set(closedFiles.map(entry => entry.file.id))
    return linkableFiles.flatMap(file => {
      let entry = cache.get(file.id)
      if (!entry || entry.content !== file.content) { entry = { content: file.content, tasks: parseTasks(file.content) }; cache.set(file.id, entry) }
      return entry.tasks.map(task => ({ ...task, fileId: file.id, fileName: file.name, closed: closedIds.has(file.id) }))
    })
  }, [linkableFiles, closedFiles])
  const agendaDocuments = useMemo(() => [
    ...files.map(file => documentInfo(file)),
    ...closedFiles.map(entry => documentInfo({ ...entry.file, closed: true })),
  ], [files, closedFiles])
  const tasksDueCount = useMemo(() => allTasks.filter(task => !task.checked && task.due && daysUntil(task.due) <= 0).length + agendaDocuments.filter(doc => doc.due && daysUntil(doc.due) <= 0).length, [allTasks, agendaDocuments])
  const [tasksOpen, setTasksOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const graphFiles = useMemo(() => [...files, ...closedFiles.map(entry => ({ ...entry.file, closed: true }))], [files, closedFiles])
  const [writingStats, setWritingStats] = useState({})
  const [presenting, setPresenting] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  // The last writing review, kept per document while its text is unchanged.
  const aiReviewRef = useRef(null)
  const [aiSupported] = useState(() => hasAnyAi())
  const aiAvailable = aiSupported && !hideAi
  const [summarizerSupported] = useState(() => aiSupport().summarizer)
  const canSummarize = summarizerSupported && !hideAi
  // On-page summaries, one per file: { status, text, error, progress, preparing, source, visible }
  const [summaries, setSummaries] = useState({})
  const summaryAbortRef = useRef(null)
  // File tree sidebar (folders come from "folder/file.md" names).
  const [fileTreeOpen, setFileTreeOpen] = useState(() => { try { return localStorage.getItem('readme-file-tree-open') === 'true' } catch { return false } })
  // Folders made with "New folder" that don't hold a file yet (folders otherwise come from file paths).
  const [emptyFolders, setEmptyFolders] = useState(() => {
    try { const list = JSON.parse(localStorage.getItem('readme-empty-folders') || '[]'); return Array.isArray(list) ? list.filter(item => typeof item === 'string') : [] } catch { return [] }
  })
  useEffect(() => { try { localStorage.setItem('readme-empty-folders', JSON.stringify(emptyFolders)) } catch { /* storage is optional */ } }, [emptyFolders])
  useEffect(() => {
    const onStorage = event => {
      if (event.key !== 'readme-empty-folders') return
      try { const list = JSON.parse(event.newValue || '[]'); if (Array.isArray(list)) setEmptyFolders(list) } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const [folderPrompt, setFolderPrompt] = useState(null) // { mode: 'new', parent? } | { mode: 'rename', path }
  // The app's own confirm / text-input dialogs (never the browser's confirm() or prompt()).
  // Both return a promise: askConfirm → true/false, askText → the text or null.
  const [appDialog, setAppDialog] = useState(null)
  const askConfirm = useCallback(options => new Promise(resolve => setAppDialog({ kind: 'confirm', options, resolve })), [])
  const askText = useCallback(options => new Promise(resolve => setAppDialog({ kind: 'text', options, resolve })), [])
  const askChoice = useCallback(options => new Promise(resolve => setAppDialog({ kind: 'choice', options, resolve })), [])
  const settleAppDialog = useCallback(value => setAppDialog(current => { current?.resolve(value); return null }), [])
  const [treeCollapsed, setTreeCollapsed] = useState(() => { try { return JSON.parse(localStorage.getItem('readme-file-tree-collapsed') || '[]') } catch { return [] } })
  useEffect(() => {
    try {
      localStorage.setItem('readme-file-tree-open', String(fileTreeOpen))
      localStorage.setItem('readme-file-tree-collapsed', JSON.stringify(treeCollapsed))
    } catch { /* storage is optional */ }
  }, [fileTreeOpen, treeCollapsed])
  const [findOpen, setFindOpen] = useState(false)
  const [findKey, setFindKey] = useState(0)
  const [slash, setSlash] = useState(null) // { from, to, query, rect, highlight }
  const [wiki, setWiki] = useState(null) // [[link being typed: { from, query, file, heading, rect, highlight }
  const [failedImages, setFailedImages] = useState({ key: '', srcs: [] })
  const [editorPrefs, setEditorPrefs] = useState(loadEditorPrefs)
  useEffect(() => {
    try { localStorage.setItem(EDITOR_PREFS_KEY, JSON.stringify(editorPrefs)) } catch { /* storage is optional */ }
  }, [editorPrefs])
  if (activeFileId && workspaceReady && !writingStats[activeFileId]) {
    setWritingStats(prev => ({ ...prev, [activeFileId]: { baseWords: currentWords, activeMs: 0, lastEditAt: 0 } }))
  }
  const activeWritingStats = activeFileId ? writingStats[activeFileId] : null

  const [diffCompareId, setDiffCompareId] = useState(null)
  const speechRef = useRef(null)
  const broadcastRef = useRef(null)
  const remoteUpdateRef = useRef(null)
  const lastLocalEditAtRef = useRef(0)
  const syncClientIdRef = useRef(createFileId())
  const analysis = useDocumentAnalysis(content, fileName || '', files)

  const activeFont = DOC_FONTS[readerPrefs.fontIndex] ?? DOC_FONTS[0]
  // Document style: front matter "style:" or the default from Settings.
  const activeDocStyle = documentStyleId(content, appSettings.defaultDocStyle)
  const docStyleExplicit = useMemo(() => readFrontMatter(content).entries.some(entry => entry.key?.toLowerCase() === 'style'), [content])
  const proseFont = activeDocStyle !== 'readme' ? docStyleById(activeDocStyle).font : activeFont.family
  const cycleDocFont = useCallback(() => {
    setReaderPrefs(p => ({ ...p, fontIndex: (p.fontIndex + 1) % DOC_FONTS.length }))
  }, [])
  const markWorkspaceEdit = useCallback(() => {
    lastLocalEditAtRef.current = Math.max(Date.now(), lastLocalEditAtRef.current + 1)
  }, [])

  // Theme classes live only on <html> and are applied before paint, so every
  // surface (including portals) switches in the same frame.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    root.classList.toggle('theme-sepia', isSepia)
    const active = themeClasses(themeById(theme))
    for (const name of ALL_THEME_CLASSES) root.classList.toggle(name, active.includes(name))
    root.classList.toggle('high-contrast', highContrast)
    // The installed app's title bar (and mobile browser bars) use the theme's dark colour.
    const solid = titleBarColor(getComputedStyle(root).getPropertyValue('--accent').trim())
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta) }
    if (solid) { meta.content = solid; root.style.setProperty('--titlebar-bg', solid) }
  }, [isDark, isSepia, highContrast, theme])
  // Installed app with "window controls overlay": ReadMe draws its own title bar (see .wco-titlebar).
  useEffect(() => {
    const query = window.matchMedia?.('(display-mode: window-controls-overlay)')
    if (!query) return undefined
    const apply = () => document.documentElement.classList.toggle('wco', query.matches)
    apply()
    query.addEventListener?.('change', apply)
    return () => query.removeEventListener?.('change', apply)
  }, [])
  // Turning additional themes off while one is active falls back to Dark.
  useEffect(() => {
    if (!appSettings.extraThemes && themeById(theme).extra) setTheme('dark')
  }, [appSettings.extraThemes, theme])

  useEffect(() => {
    try {
      localStorage.setItem('readme-theme', theme)
      localStorage.setItem('readme-high-contrast', String(highContrast))
    } catch { /* storage is optional */ }
  }, [theme, highContrast])

  useEffect(() => {
    localStorage.setItem('readme-ui-density', uiDensity)
  }, [uiDensity])

  const handleInstallApp = useCallback(async () => {
    const accepted = await appInstall.install()
    if (accepted) setToast({ message: 'ReadMe is installed. Open it from your apps, Dock or Start menu.', tone: 'success', duration: 5000 })
  }, [appInstall])

  const toggleTheme = useCallback(() => {
    withThemeTransition(() => {
      setTheme(t => nextTheme(t, appSettings.extraThemes))
    })
  }, [appSettings.extraThemes])
  const chooseTheme = useCallback(id => {
    withThemeTransition(() => { setTheme(id) })
  }, [])

  // ── Presentation: settings, and its own theme (the app theme comes back on exit) ──
  const [presentationSettings, setPresentationSettings] = useState(loadPresentationSettings)
  useEffect(() => { savePresentationSettings(presentationSettings) }, [presentationSettings])
  const themeBeforePresentRef = useRef(null)
  const openPresentation = useCallback((options = {}) => {
    themeBeforePresentRef.current = theme
    const allowed = availableThemes(appSettings.extraThemes).map(item => item.id)
    let lastUsed = null
    try { lastUsed = localStorage.getItem(PRESENTATION_THEME_KEY) } catch { /* storage is optional */ }
    const wanted = presentationSettings.theme || lastUsed
    if (wanted && wanted !== theme && allowed.includes(wanted)) chooseTheme(wanted)
    setPresenting(options)
  }, [theme, appSettings.extraThemes, presentationSettings.theme, chooseTheme])
  const choosePresentationTheme = useCallback(id => {
    try { localStorage.setItem(PRESENTATION_THEME_KEY, id) } catch { /* storage is optional */ }
    chooseTheme(id)
  }, [chooseTheme])
  const closePresentation = useCallback(() => {
    setPresenting(false)
    const before = themeBeforePresentRef.current
    themeBeforePresentRef.current = null
    if (before) setTheme(current => (current === before ? current : before))
  }, [])
  const toggleHighContrast = useCallback(() => {
    withThemeTransition(() => setHighContrast(h => !h))
  }, [])

  // Sync in-memory file list + active tab to browser localStorage (best-effort)
  useEffect(() => {
    let cancelled = false
    readWorkspace().then(saved => {
      if (cancelled) return
      if (Array.isArray(saved?.closed)) {
        setClosedFiles(saved.closed.filter(entry => entry?.file?.id && typeof entry.file.content === 'string' && !saved.files?.some(file => file.id === entry.file.id)))
      }
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
        localStorage.setItem('readme-files', JSON.stringify(files.map(syncableFile)))
        if (activeFileId) localStorage.setItem('readme-active-file', activeFileId)
        else localStorage.removeItem('readme-active-file')
      } catch {
        // Quota exceeded or storage disabled — keep everything working in memory
      }
      if (workspaceReady) writeWorkspace({ files, activeId: activeFileId, closed: closedFiles }).catch(() => {})
    }, Math.max(100, Number(appSettings.workspaceAutosaveMs ?? 300)))
    return () => clearTimeout(timer)
  }, [files, activeFileId, workspaceReady, closedFiles, appSettings.workspaceAutosaveMs])

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const channel = new BroadcastChannel('readme-workspace-sync')
    broadcastRef.current = channel
    channel.onmessage = ({ data }) => {
      if (!data || data.source === syncClientIdRef.current || !Array.isArray(data.files)) return
      const updatedAt = Number(data.updatedAt) || 0
      if (updatedAt <= lastLocalEditAtRef.current) return
      lastLocalEditAtRef.current = updatedAt
      const remoteClosed = Array.isArray(data.closed) ? data.closed.filter(entry => entry?.file?.id) : null
      remoteUpdateRef.current = JSON.stringify({
        files: data.files.map(syncableFile),
        activeId: data.activeId ?? null,
        closed: (remoteClosed ?? []).map(entry => ({ index: entry.index, file: syncableFile(entry.file) })),
      })
      // Keep this tab's disk handles for closed files too.
      if (remoteClosed) setClosedFiles(prev => remoteClosed.map(entry => { const mine = prev.find(item => item.file.id === entry.file.id); return mine?.file.diskHandle ? { ...entry, file: { ...entry.file, diskHandle: mine.file.diskHandle, diskSavedContent: mine.file.diskSavedContent } } : entry }))
      // Keep this tab's disk handles / saved baselines, which are not shared.
      setFiles(prev => {
        const local = new Map(prev.map(file => [file.id, file]))
        return data.files.map(file => {
          const mine = local.get(file.id)
          return mine ? { ...file, diskHandle: mine.diskHandle, diskSavedContent: mine.diskSavedContent } : file
        })
      })
      setActiveFileId(data.activeId ?? null)
    }
    return () => { channel.close(); broadcastRef.current = null }
  }, [])

  useEffect(() => {
    const safeFiles = files.map(syncableFile)
    const safeClosed = closedFiles.map(entry => ({ index: entry.index, file: syncableFile(entry.file) }))
    const snapshot = JSON.stringify({ files: safeFiles, activeId: activeFileId, closed: safeClosed })
    if (remoteUpdateRef.current === snapshot) { remoteUpdateRef.current = null; return }
    remoteUpdateRef.current = null
    const timer = setTimeout(() => {
      try { broadcastRef.current?.postMessage({ source: syncClientIdRef.current, files: safeFiles, activeId: activeFileId, closed: safeClosed, updatedAt: lastLocalEditAtRef.current }) } catch { /* handles may not be cloneable in this browser */ }
    }, 180)
    return () => clearTimeout(timer)
  }, [files, activeFileId, closedFiles])

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
      scroller.scrollTo({ top: maxScroll * bookmark.ratio, behavior: scrollBehavior() })
    })
  }, [activeFileId, readingBookmarks])

  // Cmd/Ctrl + K opens Command Palette; Cmd/Ctrl + F opens in-document search; Esc closes overlays
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      } else if (activeFile && ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.altKey ? e.code === 'KeyF' : e.key.toLowerCase() === 'f') && (e.altKey || view === 'editor' || e.target.closest?.('.editor-pane-host'))
        || (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'h' && !/Mac|iPhone|iPad/.test(navigator.platform)))) {
        // Find & replace in the editor.
        e.preventDefault()
        setFindOpen(true)
        setFindKey(k => k + 1)
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'f' && view !== 'editor' && activeFile) {
        e.preventDefault()
        setSearchOpen(true)
        requestAnimationFrame(() => searchInputRef.current?.focus())
      } else if (e.key === 'Escape') {
        if (cmdOpen) setCmdOpen(false)
        else if (searchOpen) setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, activeFile, cmdOpen, searchOpen])

  // Fullscreen
  useEffect(() => {
    const cb = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', cb)
    return () => document.removeEventListener('fullscreenchange', cb)
  }, [])
  const toggleFullscreen = useCallback(async () => {
    // Fullscreen the whole document so body-level layers (reading pets, popovers) stay visible.
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.()
    else await document.exitFullscreen?.()
  }, [])

  // TOC (computed from body without YAML frontmatter)
  const headings = analysis.headings

  // Track preview images that fail to load (reported in the document checks).
  useEffect(() => {
    const root = previewScrollRef.current
    if (!root) return undefined
    const key = `${activeFileId}:${content.length}`
    const report = src => setFailedImages(prev => {
      const base = prev.key === key ? prev.srcs : []
      return base.includes(src) ? (prev.key === key ? prev : { key, srcs: base }) : { key, srcs: [...base, src] }
    })
    const onError = event => {
      if (event.target?.tagName === 'IMG' && event.target.closest('.rm-prose')) report(event.target.getAttribute('src') || '')
    }
    root.addEventListener('error', onError, true)
    const frame = requestAnimationFrame(() => {
      root.querySelectorAll('.rm-prose img').forEach(img => { if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) report(img.getAttribute('src')) })
    })
    return () => { root.removeEventListener('error', onError, true); cancelAnimationFrame(frame) }
  }, [activeFileId, content, view, mobileTab])

  // Remember each file's preview scroll position and restore it when the file is shown again.
  useEffect(() => {
    const el = previewScrollRef.current
    if (!el || !activeFileId || !workspaceReady) return undefined
    const saved = readingState()[activeFileId]?.scrollTop
    const frame = requestAnimationFrame(() => { el.scrollTop = Number.isFinite(saved) ? saved : 0 })
    const onScroll = () => updateReadingState(activeFileId, { scrollTop: Math.round(el.scrollTop) })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', onScroll) }
  }, [activeFileId, workspaceReady, view, mobileTab])

  // Active heading: the last visible h1–h3 whose top has passed the upper quarter of the preview.
  // Computed from scroll position so jumps (TOC, search, restore) are tracked too.
  useEffect(() => {
    const container = previewScrollRef.current
    if (!container) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      const limit = container.getBoundingClientRect().top + container.clientHeight * 0.25
      let current = null
      for (const heading of container.querySelectorAll('.rm-prose h1[id], .rm-prose h2[id], .rm-prose h3[id]')) {
        if (!heading.offsetParent) continue
        if (heading.getBoundingClientRect().top <= limit) current = heading.id
        else break
      }
      setActiveHeadingId(previous => (previous === current ? previous : current))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    schedule()
    container.addEventListener('scroll', schedule, { passive: true })
    return () => { container.removeEventListener('scroll', schedule); if (frame) cancelAnimationFrame(frame) }
  }, [activeFileId, content, view, mobileTab, sectionCollapseValue])

  // Chapter-level sections: children of a lone title section, otherwise the top-level sections.
  const getFocusUnits = useCallback(() => {
    const prose = previewScrollRef.current?.querySelector('.rm-prose')
    if (!prose) return []
    const sectionsOf = parent => Array.from(parent.children).filter(child => child.matches('section[data-section-key]'))
    const top = sectionsOf(prose)
    const units = top.length === 1 && top[0].dataset.titleSection ? sectionsOf(top[0]) : top
    return (units.length ? units : top).map(section => {
      const heading = section.firstElementChild?.cloneNode(true)
      heading?.querySelectorAll('.heading-anchor, .section-toggle, .heading-tools').forEach(el => el.remove())
      return { key: section.dataset.sectionKey, title: heading?.textContent.trim() || 'Section', el: section }
    })
  }, [])
  const showFocusUnit = useCallback((units, index) => {
    const unit = units[index]
    if (!unit) return
    setFocusSection({ docKey: sectionDocKey, key: unit.key, index, total: units.length, title: unit.title })
    requestAnimationFrame(() => { if (previewScrollRef.current) previewScrollRef.current.scrollTop = 0 })
  }, [sectionDocKey])
  const startSectionFocus = useCallback(() => {
    const units = getFocusUnits()
    if (!units.length) return
    if (view === 'editor') setView('split')
    const active = activeHeadingId ? previewScrollRef.current?.querySelector(`[id="${CSS.escape(activeHeadingId)}"]`) : null
    const index = Math.max(0, units.findIndex(unit => active && unit.el.contains(active)))
    showFocusUnit(units, index)
  }, [getFocusUnits, showFocusUnit, activeHeadingId, view])
  const stepSectionFocus = useCallback(step => {
    const units = getFocusUnits()
    if (!units.length || !focusSection) return
    const current = units.findIndex(unit => unit.key === focusSection.key)
    const next = Math.min(units.length - 1, Math.max(0, (current === -1 ? 0 : current) + step))
    if (next !== current) showFocusUnit(units, next)
  }, [getFocusUnits, showFocusUnit, focusSection])
  const exitSectionFocus = useCallback(() => setFocusSection(null), [])
  useEffect(() => {
    if (!focusSection) return undefined
    const onKeyDown = event => {
      if (event.target.closest?.('input, textarea, [contenteditable="true"], .cm-editor')) return
      if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); stepSectionFocus(1) }
      else if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); stepSectionFocus(-1) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusSection, stepSectionFocus])

  const navigateToHeading = useCallback((id) => {
    const el = previewScrollRef.current?.querySelector(`[id="${id}"]`)
    if (!el) return
    // In section focus mode, jump to the chapter that contains the heading first.
    let switchedFocus = false
    if (focusSection) {
      const units = getFocusUnits()
      const index = units.findIndex(unit => unit.el.contains(el))
      if (index !== -1 && units[index].key !== focusSection.key) {
        setFocusSection({ docKey: sectionDocKey, key: units[index].key, index, total: units.length, title: units[index].title })
        switchedFocus = true
      }
    }
    const container = previewScrollRef.current
    const scrollToHeading = () => {
      const elTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top
      container.scrollBy({ top: elTop - 20, behavior: scrollBehavior() })
    }
    // Open every collapsed section that hides (or is owned by) this heading.
    const collapsedKeys = []
    for (let section = el.closest('section[data-section-key]'); section; section = section.parentElement?.closest('section[data-section-key]')) {
      if (section.dataset.collapsed === 'true') collapsedKeys.push(section.dataset.sectionKey)
    }
    if (!collapsedKeys.length && !switchedFocus) {
      scrollToHeading()
      return
    }
    if (collapsedKeys.length) {
      setSectionCollapse(state => {
        const overrides = new Set(state.overrides)
        collapsedKeys.forEach(key => (overrides.has(key) ? overrides.delete(key) : overrides.add(key)))
        return { ...state, overrides }
      })
    }
    requestAnimationFrame(() => requestAnimationFrame(scrollToHeading))
  }, [focusSection, getFocusUnits, sectionDocKey])

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
    hits[searchIndex]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
  }, [searchIndex, searchCount])

  useEffect(() => {
    const root = previewScrollRef.current?.querySelector('.doc-prose')
    if (!root || !window.CSS?.highlights || !window.Highlight) return
    if (!document.getElementById('readme-highlight-style')) {
      const style = document.createElement('style')
      style.id = 'readme-highlight-style'
      style.textContent = ANNOTATION_COLORS.map(color => `::highlight(readme-annotations-${color.id}) { background: ${color.fill}; color: inherit; text-decoration: underline; text-decoration-color: ${color.line}; text-decoration-thickness: 1px; }`).join('\n')
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
    const ranges = Object.fromEntries(ANNOTATION_COLORS.map(color => [color.id, []]))
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
      ranges[ranges[annotation.color] ? annotation.color : 'yellow'].push(range)
    }
    for (const color of ANNOTATION_COLORS) {
      const name = `readme-annotations-${color.id}`
      if (ranges[color.id].length) window.CSS.highlights.set(name, new window.Highlight(...ranges[color.id]))
      else window.CSS.highlights.delete(name)
    }
    return () => ANNOTATION_COLORS.forEach(color => window.CSS.highlights.delete(`readme-annotations-${color.id}`))
  }, [annotations, activeFileId, content, view, mobileTab])

  const stepSearch = useCallback((dir) => {
    if (!searchCount) return
    setSearchIndex(i => (i + dir + searchCount) % searchCount)
  }, [searchCount])

  // Multi-file in-memory handlers
  const updateActiveContent = useCallback((nextContent) => {
    if (!activeFileId) return
    markWorkspaceEdit()
    setFiles(prev => prev.map(f => (f.id === activeFileId ? { ...f, content: nextContent, updatedAt: Date.now() } : f)))
    // Writing-session time: edits less than a minute apart count as active writing.
    const now = Date.now()
    setWritingStats(prev => {
      const current = prev[activeFileId]
      if (!current) return prev
      const gap = current.lastEditAt ? now - current.lastEditAt : 0
      return { ...prev, [activeFileId]: { ...current, activeMs: current.activeMs + (gap > 0 && gap < 60000 ? gap : 0), lastEditAt: now } }
    })
  }, [activeFileId, markWorkspaceEdit])

  // The editor textarea is not controlled by React: React 19 also rewrites a controlled
  // textarea's defaultValue on every change, which splits the browser's undo history into
  // single characters (Cmd/Ctrl+Z would undo one letter at a time). Instead the text is written
  // only when it changes from outside the textarea (switching files, restoring a version…).
  useLayoutEffect(() => {
    const ta = textareaRef.current
    // Only the simple editor's real <textarea> (the code editor manages its own text).
    if (ta instanceof HTMLTextAreaElement && ta.value !== content) ta.value = content
  })

  const handleSetWordGoal = useCallback(goal => {
    if (!activeFileId) return
    markWorkspaceEdit()
    setFiles(prev => prev.map(f => (f.id === activeFileId ? { ...f, wordGoal: goal || undefined } : f)))
  }, [activeFileId, markWorkspaceEdit])

  // Select a line in the editor (from quality checks, global search, …).
  const goToEditorLine = useCallback((line, column = 0, length = 0) => {
    if (view === 'preview') setView('split')
    setMobileTab('editor')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      const lines = ta.value.split('\n')
      const start = lines.slice(0, Math.max(0, line - 1)).reduce((sum, text) => sum + text.length + 1, 0) + column
      const end = length ? start + length : start + (lines[line - 1]?.length ?? 0) - column
      ta.focus()
      ta.setSelectionRange(start, end)
      if (ta.scrollToLine) { ta.scrollToLine(line); return }
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 24
      ta.scrollTop = Math.max(0, (line - 4) * lineHeight)
    }))
  }, [view])
  // Tick / untick a task. In the open document it's an undoable edit that keeps the cursor,
  // scroll position and focus where they were; other documents are updated directly.
  const toggleTask = useCallback(task => {
    if (task.fileId === activeFileId) {
      const ta = textareaRef.current
      if (ta instanceof HTMLTextAreaElement && view !== 'preview' && ta.value === content) {
        const focused = document.activeElement
        const { selectionStart, selectionEnd, scrollTop } = ta
        applyTextareaEdit(ta, { from: task.offset, to: task.offset + 1, text: task.checked ? ' ' : 'x', cursor: selectionStart, cursorEnd: selectionEnd })
        ta.scrollTop = scrollTop
        if (focused && focused !== ta && focused.isConnected) focused.focus({ preventScroll: true })
      } else updateActiveContent(toggleTaskAt(content, task.offset, !task.checked))
      return
    }
    markWorkspaceEdit()
    const flip = value => toggleTaskAt(value, task.offset, !task.checked)
    setFiles(prev => prev.map(file => (file.id === task.fileId ? { ...file, content: flip(file.content) } : file)))
    setClosedFiles(prev => prev.map(entry => (entry.file.id === task.fileId ? { ...entry, file: { ...entry.file, content: flip(entry.file.content) } } : entry)))
  }, [activeFileId, view, content, updateActiveContent, markWorkspaceEdit])
  // Checkboxes in the preview tick the task in the document.
  useEffect(() => {
    const root = previewScrollRef.current
    if (!root || !activeFile) return undefined
    const onClick = event => {
      const box = event.target.closest?.('.rm-prose input[type="checkbox"]')
      if (!box || !root.contains(box)) return
      event.preventDefault()
      const boxes = [...root.querySelectorAll('.rm-prose input[type="checkbox"]')]
      const task = parseTasks(content)[boxes.indexOf(box)]
      if (task) toggleTask({ ...task, fileId: activeFile.id })
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [activeFile, content, toggleTask])
  const handleQualityFix = useCallback(issue => {
    if (!issue.fix) return
    const ta = textareaRef.current
    const next = applyQualityFix(content, issue.fix)
    if (next === content) return
    const lines = content.split('\n')
    const lineStart = lines.slice(0, issue.fix.line - 1).reduce((sum, text) => sum + text.length + 1, 0)
    const from = lineStart + lines[issue.fix.line - 1].indexOf(issue.fix.search)
    const edit = { from, to: from + issue.fix.search.length, text: issue.fix.replace, cursor: from + issue.fix.replace.length }
    if (ta) applyTextareaEdit(ta, edit)
    else updateActiveContent(next)
  }, [content, updateActiveContent])

  // ── Find & replace in the editor ─────────────────────────────
  const selectEditorMatch = useCallback((match, { keepFocus = false } = {}) => {
    const ta = textareaRef.current
    if (!ta || !match) return
    const restore = keepFocus ? document.activeElement : null
    ta.setSelectionRange(match.from, match.to)
    if (!ta.view) {
      // Textarea: scroll the match into view and show the selection.
      ta.focus({ preventScroll: true })
      const caret = textareaCaretRect(ta, match.from)
      const box = ta.getBoundingClientRect()
      const parent = ta.parentElement
      const offset = caret.top - box.top
      if (offset < 40 || offset > parent.clientHeight - 60) parent.scrollTop += offset - parent.clientHeight / 3
    }
    if (restore && restore !== document.body) restore.focus({ preventScroll: true })
  }, [])
  const replaceEditorRange = useCallback((match, text) => {
    const ta = textareaRef.current
    if (!ta) return
    const restore = document.activeElement
    applyTextareaEdit(ta, { from: match.from, to: match.to, text, cursor: match.from + text.length })
    if (restore && restore !== document.body) restore.focus({ preventScroll: true })
  }, [])
  const replaceAllInActive = useCallback((regex, replacement, useRegex) => {
    const ta = textareaRef.current
    const { text, count } = replaceAllIn(content, regex, replacement, useRegex)
    if (!count) return 0
    const restore = document.activeElement
    if (ta) applyTextareaEdit(ta, { from: 0, to: content.length, text, cursor: Math.min(ta.selectionStart, text.length) })
    else updateActiveContent(text)
    if (restore && restore !== document.body) restore.focus({ preventScroll: true })
    return count
  }, [content, updateActiveContent])

  // ── Slash commands ───────────────────────────────────────────
  const slashDismissedRef = useRef(null)
  const wikiDismissedRef = useRef(null)
  const refreshSlash = useCallback(() => {
    // Read after the editor has applied the input (CodeMirror updates asynchronously).
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta || ta.selectionStart !== ta.selectionEnd) { setSlash(null); setWiki(null); return }
      // Typing a [[wiki link]]: suggest documents (and headings after #).
      const link = detectWikiLink(ta.value, ta.selectionStart)
      if (link && wikiDismissedRef.current !== link.from) {
        const rect = editorCaretRect(ta, link.from)
        if (rect) {
          setSlash(null)
          setWiki(prev => ({ ...link, rect, highlight: prev && prev.from === link.from && prev.query === link.query ? prev.highlight : 0 }))
          return
        }
      }
      setWiki(null)
      const found = detectSlash(ta.value, ta.selectionStart)
      if (!found || slashDismissedRef.current === found.from) { setSlash(null); return }
      const rect = editorCaretRect(ta, found.from)
      if (!rect) { setSlash(null); return }
      setSlash(prev => ({ ...found, rect, highlight: prev && prev.from === found.from && prev.query === found.query ? prev.highlight : 0 }))
    })
  }, [])
  const insertSlashCommand = useCallback(command => {
    const ta = textareaRef.current
    if (!ta || !slash) return
    const caret = ta.selectionStart
    const { text, cursor, cursorEnd } = expandSnippet(command, slash.from)
    applyTextareaEdit(ta, { from: slash.from, to: Math.max(caret, slash.to), text, cursor, cursorEnd })
    setSlash(null)
  }, [slash])
  const slashCommands = useMemo(() => (slash ? filterSlashCommands(slash.query) : []), [slash])
  const wikiSuggestions = useMemo(() => {
    if (!wiki || !activeFile) return []
    const base = name => name.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')
    const folder = name => name.split('/').slice(0, -1).join('/')
    if (wiki.heading == null) {
      const query = wiki.file.trim()
      return linkableFiles
        .filter(file => file.id !== activeFile.id)
        .map(file => ({ file, score: query ? Math.max(fuzzyScore(query, base(file.name)), fuzzyScore(query, file.name) - 1) : 1 }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name))
        .slice(0, 8)
        .map(({ file }) => {
          // The shortest name that still finds this file from here.
          const short = resolveWikiTarget(base(file.name), activeFile.name, linkableFiles)?.id === file.id ? base(file.name) : file.name.replace(/\.(md|markdown|txt)$/i, '')
          return { id: file.id, label: base(file.name), detail: folder(file.name), icon: 'FileText', insert: short }
        })
    }
    const target = wiki.file.trim() ? resolveWikiTarget(wiki.file, activeFile.name, linkableFiles) : activeFile
    if (!target) return []
    const query = wiki.heading.trim().toLowerCase()
    return extractHeadings(String(target.content || ''))
      .filter(heading => !query || heading.text.toLowerCase().includes(query))
      .slice(0, 8)
      .map((heading, index) => ({ id: `${heading.id}-${index}`, label: heading.text, detail: `H${heading.level}`, icon: 'Hash', insert: `${wiki.file.trim()}#${heading.text}` }))
  }, [wiki, activeFile, linkableFiles])
  const insertWikiLink = useCallback(item => {
    const ta = textareaRef.current
    if (!ta || !wiki) return
    const caret = ta.selectionStart
    // Replace "[[query" (and a "]]" already after the caret) with the complete link.
    const closing = ta.value.slice(caret, caret + 2) === ']]' ? 2 : 0
    const text = `[[${item.insert}]]`
    applyTextareaEdit(ta, { from: wiki.from, to: caret + closing, text, cursor: wiki.from + text.length })
    setWiki(null)
  }, [wiki])
  const handleEditorPaneKeyDown = useCallback(event => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v') plainPasteRef.current = true
    if (wiki) {
      const count = wikiSuggestions.length
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
        event.preventDefault(); event.stopPropagation()
        setWiki(current => current && { ...current, highlight: (current.highlight + (event.key === 'ArrowDown' ? 1 : -1) + count) % count })
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && count) {
        event.preventDefault(); event.stopPropagation()
        insertWikiLink(wikiSuggestions[Math.min(wiki.highlight, count - 1)])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation()
        wikiDismissedRef.current = wiki.from
        setWiki(null)
        return
      }
    }
    if (!slash) {
      if (event.key === '/') slashDismissedRef.current = null
      return
    }
    const count = slashCommands.length
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!count) return
      event.preventDefault()
      event.stopPropagation()
      setSlash(current => current && { ...current, highlight: (current.highlight + (event.key === 'ArrowDown' ? 1 : -1) + count) % count })
    } else if ((event.key === 'Enter' || event.key === 'Tab') && count) {
      event.preventDefault()
      event.stopPropagation()
      insertSlashCommand(slashCommands[Math.min(slash.highlight, count - 1)])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      slashDismissedRef.current = slash.from
      setSlash(null)
    }
  }, [slash, slashCommands, insertSlashCommand, wiki, wikiSuggestions, insertWikiLink])

  const handleFormatTables = useCallback(() => {
    const ta = textareaRef.current
    const formatted = formatMarkdownTables(content)
    if (formatted === content) return
    if (ta) queueMicrotask(() => applyTextareaEdit(ta, { from: 0, to: content.length, text: formatted, cursor: Math.min(ta.selectionStart, formatted.length) }))
    else updateActiveContent(formatted)
  }, [content, updateActiveContent])

  // ── Visual table editor ──
  // Opens on the table at the caret (or the `index`-th table, from the preview's Edit button);
  // with no table there it inserts a new one. Saving replaces the table as one undoable edit.
  const [tableEdit, setTableEdit] = useState(null) // { mode, from, to, table }
  const openTableEditor = useCallback(({ index } = {}) => {
    if (!activeFile) return
    const source = content
    const ta = textareaRef.current
    const caret = ta?.selectionStart ?? source.length
    const target = index != null ? findTables(source)[index] : tableAt(source, caret)
    if (target) setTableEdit({ mode: 'edit', from: target.from, to: target.to, table: parseTable(source.slice(target.from, target.to)) })
    else setTableEdit({ mode: 'insert', from: caret, to: ta?.selectionEnd ?? caret, table: emptyTable() })
  }, [activeFile, content])
  const saveTable = useCallback(table => {
    if (!tableEdit) return
    const { mode, from, to } = tableEdit
    let text = tableToMarkdown(table)
    if (mode === 'insert') {
      // A new table needs blank lines around it.
      const before = content.slice(0, from), after = content.slice(to)
      text = `${!before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'}${text}${after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'}`
    }
    setTableEdit(null)
    const ta = textareaRef.current
    if (ta && view !== 'preview') applyTextareaEdit(ta, { from, to, text, cursor: from + text.length })
    else updateActiveContent(content.slice(0, from) + text + content.slice(to))
    setToast({ message: mode === 'insert' ? 'Table inserted.' : 'Table updated.', tone: 'success' })
  }, [tableEdit, content, view, updateActiveContent])
  // Removes the table being edited (one undoable edit, like any other change).
  const deleteTable = useCallback(() => {
    if (!tableEdit || tableEdit.mode !== 'edit') return
    const { from, to } = tableEdit
    const end = to + (/^\n{1,2}/.exec(content.slice(to))?.[0].length ?? 0)
    setTableEdit(null)
    const ta = textareaRef.current
    if (ta && view !== 'preview') applyTextareaEdit(ta, { from, to: end, text: '', cursor: from })
    else updateActiveContent(content.slice(0, from) + content.slice(end))
    setToast({ message: `Table deleted. Undo with ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}Z.`, tone: 'success' })
  }, [tableEdit, content, view, updateActiveContent])

  useEffect(() => {
    const root = previewScrollRef.current
    if (!root) return undefined
    const onClick = event => {
      const button = event.target.closest?.('[data-edit-table]')
      if (!button || !root.contains(button)) return
      event.preventDefault()
      // Tables inside quotes aren't editable here (the source scan doesn't count them).
      const tables = [...root.querySelectorAll('.table-wrap')].filter(wrap => !wrap.closest('blockquote'))
      const index = tables.indexOf(button.closest('.table-wrap'))
      if (index >= 0) openTableEditor({ index })
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [openTableEditor])

  // Smart Enter (list / quote continuation), bracket auto-pairing and pair deletion.
  const handleEditorKeyDown = useCallback(event => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    const ta = event.currentTarget
    const { value, selectionStart, selectionEnd } = ta
    let edit = null
    if (event.key === 'Enter' && !event.shiftKey) edit = continueMarkup(value, selectionStart, selectionEnd)
    else if (event.key === 'Backspace') edit = deletePair(value, selectionStart, selectionEnd)
    else if (event.key.length === 1) edit = autoPair(value, selectionStart, selectionEnd, event.key)
    if (!edit) return
    event.preventDefault()
    applyTextareaEdit(ta, edit)
  }, [])

  // Paste / drop images into the editor: embed them as data URLs (reference-style,
  // with the definitions appended at the end so the text stays readable).
  const insertImages = useCallback(async (imageFiles, textarea) => {
    if (!imageFiles.length || !textarea) return
    if (!appSettings.embedImages) {
      // Stored as attachments: the document only gets a short reference.
      let paths
      try {
        paths = []
        for (const file of imageFiles) {
          const dataUrl = await imageFileToDataUrl(file)
          paths.push(await addAttachment(dataUrlToBlob(dataUrl), file.name || 'pasted-image.png'))
        }
      } catch (error) {
        setToast({ message: `Could not store the image: ${error?.message || 'storage is full or unavailable'}.`, tone: 'warning', duration: 6000 })
        return
      }
      const alts = imageFiles.map(file => (file.name || 'Image').replace(/\.[^.]+$/, '').replace(/[[\]]/g, '').replace(/[-_]+/g, ' ').trim() || 'Image')
      const inline = paths.map((path, index) => `![${alts[index]}](${attachmentSrc(path)})`).join('\n\n')
      const at = textarea.selectionStart
      const before = textarea.value.slice(0, at)
      const after = textarea.value.slice(textarea.selectionEnd)
      const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      const trail = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
      const insertText = `${lead}${inline}${trail}`
      applyTextareaEdit(textarea, { from: at, to: textarea.selectionEnd, text: insertText, cursor: at + insertText.length })
      const last = paths[paths.length - 1]
      setToast({
        message: paths.length === 1 ? 'Image added. A short description helps screen-reader users.' : `${paths.length} images added.`,
        tone: 'success', duration: 7000,
        action: paths.length === 1 ? { label: 'Describe', run: async () => {
          const alt = await askText({ title: 'Describe the image', label: 'Description (alt text)', initialValue: alts[0], placeholder: 'e.g. Sales grew 20% in March', confirmLabel: 'Save' })
          const ta = textareaRef.current
          if (alt == null || !ta) return
          const ref = imageReferences(ta.value).find(item => item.kind === 'inline' && resolveImagePath(item.src, fileNameRef.current) === last)
          if (ref) applyTextareaEdit(ta, { from: ref.altFrom, to: ref.altTo, text: alt.replace(/[[\]\n]/g, ' ').trim(), cursor: ta.selectionStart })
        } } : undefined,
      })
      return
    }
    const entries = await Promise.all(imageFiles.map(async file => ({ name: file.name || 'pasted-image.png', dataUrl: await imageFileToDataUrl(file) })))
    const { inline, definitions } = imageReferenceMarkdown(entries, textarea.value)
    const at = textarea.selectionStart
    const before = textarea.value.slice(0, at)
    const after = textarea.value.slice(textarea.selectionEnd)
    const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const trail = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    const insertText = `${lead}${inline}${trail}`
    applyTextareaEdit(textarea, { from: at, to: textarea.selectionEnd, text: insertText, cursor: at + insertText.length })
    const caret = textarea.selectionStart
    const end = textarea.value.length
    const tail = textarea.value.endsWith('\n') ? '\n' : '\n\n'
    applyTextareaEdit(textarea, { from: end, to: end, text: `${tail}${definitions}\n`, cursor: caret })
  }, [appSettings.embedImages, addAttachment, askText])
  // Paste: images are embedded; rich text (Word, Google Docs, Confluence, web pages) and
  // spreadsheet cells become Markdown. The plain text goes in first and the Markdown replaces
  // it as a second edit, so one Cmd/Ctrl+Z gives the plain text back. Cmd/Ctrl+Shift+V = plain.
  const plainPasteRef = useRef(false)
  const handleEditorPaste = useCallback(event => {
    const images = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
    if (images.length) {
      event.preventDefault()
      insertImages(images, event.currentTarget)
      return
    }
    const plainOnly = plainPasteRef.current
    plainPasteRef.current = false
    if (plainOnly) return
    const html = event.clipboardData?.getData('text/html') || ''
    const plain = event.clipboardData?.getData('text/plain') || ''
    const tabular = !html && /\t/.test(plain) && plain.includes('\n')
    if (!html && !tabular) return
    const ta = event.currentTarget
    event.preventDefault()
    const from = ta.selectionStart
    applyTextareaEdit(ta, { from, to: ta.selectionEnd, text: plain, cursor: from + plain.length })
    import('./htmlToMarkdown').then(({ looksRich, htmlToMarkdown, parseDelimited, rowsToMarkdownTable }) => {
      let markdown = ''
      if (html && looksRich(html, plain)) markdown = htmlToMarkdown(html)
      else {
        const rows = parseDelimited(plain)
        if (rows) markdown = rowsToMarkdownTable(rows)
      }
      // Only replace if the pasted plain text is still where we put it.
      if (!markdown || markdown === plain || ta.value.slice(from, from + plain.length) !== plain) return
      applyTextareaEdit(ta, { from, to: from + plain.length, text: markdown, cursor: from + markdown.length })
      setToast({ message: `Pasted as Markdown. Undo (${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}Z) to keep the plain text instead.`, tone: 'success', duration: 5000 })
    }).catch(error => console.warn('Could not convert the pasted text', error))
  }, [insertImages])
  const handleEditorDrop = useCallback(event => {
    // A file dragged from the Files panel: insert a relative link to it where it was dropped.
    const linkedId = event.dataTransfer?.getData(FILE_DRAG_TYPE)
    if (linkedId) {
      const target = files.find(file => file.id === linkedId) ?? closedFiles.find(entry => entry.file.id === linkedId)?.file
      if (!target || !activeFile) return
      event.preventDefault()
      event.stopPropagation()
      const ta = event.currentTarget
      const position = document.caretPositionFromPoint?.(event.clientX, event.clientY)
      const at = position && (position.offsetNode === ta || position.offsetNode?.parentNode === ta) ? position.offset : ta.selectionStart
      const link = `[${fileLinkTitle(target)}](${relativeFileLink(activeFile.name, target.name)})`
      applyTextareaEdit(ta, { from: at, to: at, text: link, cursor: at + link.length })
      return
    }
    const images = Array.from(event.dataTransfer?.files || []).filter(file => file.type.startsWith('image/'))
    if (!images.length) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    const ta = event.currentTarget
    // Place the caret where the image was dropped when the browser supports it.
    const position = document.caretPositionFromPoint?.(event.clientX, event.clientY)
    if (position?.offsetNode === ta || position?.offsetNode?.parentNode === ta) ta.setSelectionRange(position.offset, position.offset)
    insertImages(images, ta)
  }, [insertImages, files, closedFiles, activeFile])

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

  const handleDuplicateFile = useCallback((fileId) => {
    const source = files.find(file => file.id === fileId)
    if (!source) return
    markWorkspaceEdit()
    const id = createFileId()
    const name = makeDuplicateFileName(source.name, files.map(file => file.name))
    setFiles(prev => [...prev, { id, name, content: source.content }])
    setActiveFileId(id)
    setActiveHeadingId(null)
    setShowScrollTop(false)
    setMobileTab('editor')
    if (view === 'preview') setView('split')
  }, [files, markWorkspaceEdit, view])

  const handleSelectFile = useCallback((id) => {
    if (id === activeFileId) return
    markWorkspaceEdit()
    setActiveFileId(id)
    setActiveHeadingId(null)
    setShowScrollTop(false)
  }, [activeFileId, markWorkspaceEdit])

  // Closes several tabs at once and remembers them so they can be reopened (unless deleting).
  const closeFiles = useCallback((ids, { remember = true } = {}) => {
    const closing = new Set(ids)
    if (!closing.size) return
    const closedEntries = files
      .map((file, index) => ({ file, index }))
      .filter(entry => closing.has(entry.file.id))
    if (!closedEntries.length) return
    markWorkspaceEdit()
    setClosedFiles(prev => [...prev.filter(entry => !closing.has(entry.file.id)), ...(remember ? closedEntries : [])].slice(-MAX_CLOSED_FILES))
    const next = files.filter(f => !closing.has(f.id))
    setFiles(next)
    if (closing.has(activeFileId)) {
      const activeIndex = files.findIndex(f => f.id === activeFileId)
      const fallback = next.find((_, i) => i >= activeIndex - closedEntries.filter(e => e.index < activeIndex).length) ?? next[next.length - 1] ?? null
      setActiveFileId(fallback?.id ?? null)
      setActiveHeadingId(null)
      setShowScrollTop(false)
    }
  }, [files, activeFileId, markWorkspaceEdit])
  const handleCloseFile = useCallback(id => closeFiles([id]), [closeFiles])
  const handleCloseOthers = useCallback(id => {
    closeFiles(files.filter(f => f.id !== id && !f.pinned).map(f => f.id))
    setActiveFileId(id)
  }, [files, closeFiles])
  const handleCloseToRight = useCallback(id => {
    const index = files.findIndex(f => f.id === id)
    closeFiles(files.slice(index + 1).filter(f => !f.pinned).map(f => f.id))
  }, [files, closeFiles])
  const reopenClosedEntry = useCallback(entry => {
    if (!entry) return
    removedFromFolderRef.current?.delete(entry.file.id)
    setClosedFiles(prev => prev.filter(item => item.file.id !== entry.file.id))
    markWorkspaceEdit()
    if (entry.file.diskHandle) diskHandlesRef.current.set(entry.file.id, entry.file.diskHandle)
    setFiles(prev => {
      if (prev.some(f => f.id === entry.file.id)) return prev
      const next = [...prev]
      next.splice(Math.min(entry.index, next.length), 0, entry.file)
      return orderPinnedFirst(next)
    })
    setActiveFileId(entry.file.id)
    setActiveHeadingId(null)
  }, [markWorkspaceEdit])
  const handleReopenClosed = useCallback(() => reopenClosedEntry(closedFiles.at(-1)), [closedFiles, reopenClosedEntry])
  const handleReopenFile = useCallback(id => reopenClosedEntry(closedFiles.find(entry => entry.file.id === id)), [closedFiles, reopenClosedEntry])
  const openTask = useCallback(task => {
    setTasksOpen(false)
    if (closedFiles.some(entry => entry.file.id === task.fileId)) handleReopenFile(task.fileId)
    else if (task.fileId !== activeFileId) handleSelectFile(task.fileId)
    goToEditorLine(task.line + 1)
  }, [closedFiles, activeFileId, handleReopenFile, handleSelectFile, goToEditorLine])
  const handleForgetClosed = useCallback(ids => {
    const forget = new Set(ids)
    markWorkspaceEdit()
    setClosedFiles(prev => prev.filter(entry => !forget.has(entry.file.id)))
  }, [markWorkspaceEdit])

  // A [[link]] to a document that doesn't exist yet: offer to create it (next to the current file).
  const createLinkedDocument = useCallback(async target => {
    const folder = activeFile?.name.split('/').slice(0, -1).join('/') ?? ''
    const name = `${target.includes('/') ? target.replace(/^\/+/, '') : `${folder ? `${folder}/` : ''}${target}`}`.replace(/\.(md|markdown|txt)$/i, '')
    const ok = await askConfirm({ title: `Create “${target}”?`, message: `There’s no document called “${target}” yet. Create ${name}.md and open it?`, confirmLabel: 'Create document', icon: FilePlus })
    if (!ok) return false
    const id = createFileId()
    markWorkspaceEdit()
    setFiles(prev => [...prev, { id, name: `${name}.md`, content: `# ${name.split('/').pop()}\n\n` }])
    setActiveFileId(id)
    return true
  }, [activeFile, askConfirm, markWorkspaceEdit])

  // Relative links to other workspace files (e.g. dragged in from the Files panel) open that file.
  const pendingLinkAnchorRef = useRef(null)
  useEffect(() => {
    const onClick = event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target.closest?.('a[href]')
      if (!link || !previewScrollRef.current?.contains(link) || !activeFile) return
      // [[Wiki links]]: open the document (and heading), or offer to create a missing one.
      if (link.hasAttribute('data-wiki')) {
        event.preventDefault()
        const wikiTarget = link.getAttribute('data-wiki')
        const heading = link.getAttribute('data-wiki-heading')
        const anchor = heading ? headingSlug(heading) : null
        if (!wikiTarget) {
          if (anchor) previewScrollRef.current?.querySelector(`[id="${CSS.escape(anchor)}"]`)?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
          return
        }
        const found = resolveWikiTarget(wikiTarget, activeFile.name, linkableFiles)
        if (found) {
          if (found.id === activeFile.id) {
            if (anchor) previewScrollRef.current?.querySelector(`[id="${CSS.escape(anchor)}"]`)?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
            return
          }
          pendingLinkAnchorRef.current = anchor
          if (files.some(file => file.id === found.id)) handleSelectFile(found.id)
          else handleReopenFile(found.id)
          return
        }
        createLinkedDocument(wikiTarget)
        return
      }
      const target = resolveFileLink(activeFile.name, link.getAttribute('href'))
      if (!target) return
      const found = files.find(file => file.name === target.name) ?? closedFiles.find(entry => entry.file.name === target.name)?.file
      event.preventDefault()
      if (!found) { setToast({ message: `“${target.name}” isn’t open in ReadMe.`, tone: 'warning' }); return }
      pendingLinkAnchorRef.current = target.anchor || null
      if (files.some(file => file.id === found.id)) handleSelectFile(found.id)
      else handleReopenFile(found.id)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [activeFile, files, closedFiles, linkableFiles, handleSelectFile, handleReopenFile, createLinkedDocument])
  // Wiki links to documents that don't exist yet look different (and say so on hover).
  useEffect(() => {
    const root = previewScrollRef.current
    if (!root || !activeFile) return
    root.querySelectorAll('a[data-wiki]').forEach(link => {
      const wikiTarget = link.getAttribute('data-wiki')
      const missing = Boolean(wikiTarget) && !resolveWikiTarget(wikiTarget, activeFile.name, linkableFiles)
      link.classList.toggle('is-missing', missing)
      link.setAttribute('data-tip', missing ? `No document called “${wikiTarget}” yet — click to create it` : `Open ${wikiTarget || 'heading'}${link.getAttribute('data-wiki-heading') ? ` › ${link.getAttribute('data-wiki-heading')}` : ''}`)
    })
  })
  useEffect(() => {
    const anchorId = pendingLinkAnchorRef.current
    if (!anchorId) return undefined
    pendingLinkAnchorRef.current = null
    const timer = setTimeout(() => {
      const el = previewScrollRef.current?.querySelector(`[id="${CSS.escape(anchorId)}"]`)
      el?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
    }, 250)
    return () => clearTimeout(timer)
  }, [activeFileId])

  // Global search (Cmd/Ctrl+Shift+F) and the keyboard shortcut sheet (?).
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  useEffect(() => {
    const onKeyDown = event => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setGlobalSearchOpen(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setTasksOpen(open => !open)
        return
      }
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
        event.preventDefault()
        setShortcutsOpen(open => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ── Version history ──────────────────────────────────────────
  const [historyState, setHistoryState] = useState(null) // { fileId, snapshots, loading }
  const lastSnapshotAtRef = useRef({})
  const takeSnapshot = useCallback(async (fileId, text, reason) => {
    if (!fileId || typeof text !== 'string') return null
    try {
      const snapshots = await addSnapshot(fileId, { content: text, reason })
      lastSnapshotAtRef.current[fileId] = Date.now()
      setHistoryState(state => (state?.fileId === fileId ? { ...state, snapshots } : state))
      return snapshots
    } catch {
      return null
    }
  }, [])

  // ── Reorganising the outline (Contents sidebar) ──
  // Replaces the document with `next` as one minimal, undoable edit in the editor.
  const replaceDocument = useCallback(next => {
    const ta = textareaRef.current
    if (!ta || view === 'preview') { updateActiveContent(next); return }
    const current = ta.value
    let start = 0
    while (start < current.length && start < next.length && current[start] === next[start]) start += 1
    let end = 0
    while (end < current.length - start && end < next.length - start && current[current.length - 1 - end] === next[next.length - 1 - end]) end += 1
    applyTextareaEdit(ta, { from: start, to: current.length - end, text: next.slice(start, next.length - end), cursor: start })
  }, [view, updateActiveContent])
  const handleOutline = useCallback(async ({ action, ordinal, target, place, direction, delta, text, keepFocus }) => {
    if (!activeFile) return
    let next = null
    if (action === 'move') next = moveSection(content, ordinal, target, place)
    else if (action === 'step') next = moveSectionStep(content, ordinal, direction)
    else if (action === 'shift') next = shiftSection(content, ordinal, delta)
    else if (action === 'copy') {
      const section = extractSection(content, ordinal)
      if (!section) return
      try { await navigator.clipboard.writeText(section.text); setToast({ message: `Copied “${text}”.`, tone: 'success' }) } catch { setToast({ message: 'Could not access the clipboard.', tone: 'warning' }) }
      return
    } else if (action === 'toFile') {
      const others = linkableFiles.filter(file => file.id !== activeFile.id)
      if (!others.length) { setToast({ message: 'Open or create another file first.', tone: 'warning' }); return }
      const choice = await askChoice({
        title: 'Move section to another file', icon: SendTo, confirmLabel: 'Move section',
        message: `“${text}” and everything under it moves out of this file. You can undo it right after.`,
        fields: [
          { id: 'file', label: 'File', options: others.map(file => ({ value: file.id, label: file.name })) },
          { id: 'where', label: 'Position', options: [{ value: 'end', label: 'At the end' }, { value: 'start', label: 'At the start (after the title)' }] },
        ],
      })
      const section = choice && extractSection(content, ordinal)
      const destination = choice && others.find(file => file.id === choice.file)
      if (!section || !destination) return
      await takeSnapshot(activeFile.id, content, 'Before moving a section')
      const previousTarget = destination.content
      const setTargetContent = value => {
        markWorkspaceEdit()
        setFiles(prev => prev.map(f => (f.id === destination.id ? { ...f, content: value } : f)))
        setClosedFiles(prev => prev.map(entry => (entry.file.id === destination.id ? { ...entry, file: { ...entry.file, content: value } } : entry)))
      }
      const original = content
      setTargetContent(insertSection(previousTarget, section.text, choice.where))
      replaceDocument(section.rest)
      setToast({
        message: `Moved “${text}” to ${destination.name}.`, tone: 'success', duration: 8000,
        action: { label: 'Undo', run: () => { setTargetContent(previousTarget); replaceDocument(original) } },
      })
      return
    }
    if (!next) {
      setToast({ message: action === 'shift' ? 'Headings go from level 1 to 6 — this one can’t go further.' : 'That section can’t move there.', tone: 'warning' })
      return
    }
    replaceDocument(next)
    // Keyboard moves: keep focus on the moved heading. The Contents list is rebuilt a moment later
    // (the document is analysed in the background), so keep focusing it until the list settles.
    if (keepFocus) {
      const until = Date.now() + 1200
      const refocus = () => {
        const active = document.activeElement
        if (!(active?.classList.contains('toc-link') && active.isConnected && active.textContent === text)) {
          [...document.querySelectorAll('.toc-panel .toc-link')].find(link => link.textContent === text)?.focus()
        }
        if (Date.now() < until) setTimeout(refocus, 60)
      }
      requestAnimationFrame(refocus)
    }
  }, [activeFile, content, linkableFiles, askChoice, takeSnapshot, markWorkspaceEdit, replaceDocument])


  // Clear editor: undoable (⌘Z), kept in version history, and the toast offers Undo.
  const handleClearEditor = useCallback(() => {
    const ta = textareaRef.current
    const fileId = activeFileId
    const previous = content
    if (!previous) return
    takeSnapshot(fileId, previous, 'Before clearing')
    if (ta) applyTextareaEdit(ta, { from: 0, to: previous.length, text: '', cursor: 0 })
    if (!ta || ta.value !== '') updateActiveContent('')
    setToast({
      message: 'Editor cleared.', tone: 'info', duration: 7000,
      action: {
        label: 'Undo',
        run: () => {
          const current = textareaRef.current
          // Still on the cleared file and still empty: put the text back as an undoable edit.
          if (current && current.value === '' && current.dataset.fileId === fileId) applyTextareaEdit(current, { from: 0, to: 0, text: previous, cursor: 0 })
          else setFiles(prev => prev.map(f => (f.id === fileId ? { ...f, content: previous } : f)))
        },
      },
    })
  }, [activeFileId, content, takeSnapshot, updateActiveContent])
  // Recovery snapshots are written after a short pause, using the workspace cadence setting.
  useEffect(() => {
    const minutes = Number(appSettings.recoverySnapshotMinutes ?? 10)
    if (!activeFileId || !workspaceReady || !content.trim() || minutes <= 0) return undefined
    const timer = setTimeout(() => {
      readHistory(activeFileId).then(history => {
        const last = lastSnapshotAtRef.current[activeFileId] ?? history[0]?.at ?? 0
        lastSnapshotAtRef.current[activeFileId] = last
        if (Date.now() - last >= minutes * 60 * 1000) takeSnapshot(activeFileId, content, 'Recovery snapshot')
      }).catch(() => { if (Date.now() - (lastSnapshotAtRef.current[activeFileId] ?? 0) >= minutes * 60 * 1000) takeSnapshot(activeFileId, content, 'Recovery snapshot') })
    }, 4000)
    return () => clearTimeout(timer)
  }, [activeFileId, content, workspaceReady, takeSnapshot, appSettings.recoverySnapshotMinutes])
  const openHistory = useCallback(async () => {
    if (!activeFileId) return
    setHistoryState({ fileId: activeFileId, snapshots: [], loading: true })
    const snapshots = await readHistory(activeFileId).catch(() => [])
    setHistoryState(state => (state?.fileId === activeFileId ? { fileId: activeFileId, snapshots, loading: false } : state))
  }, [activeFileId])
  const openRecovery = useCallback(async () => {
    setRecoveryData({ loading: true, snapshots: {} })
    const snapshots = await readAllHistory().catch(() => ({}))
    setRecoveryData({ loading: false, snapshots })
  }, [])
  const restoreSnapshot = useCallback(async snapshot => {
    if (!activeFile || !snapshot) return
    if (!(await askConfirm({ title: 'Restore this version?', message: 'The current text is saved as a snapshot first, so you can undo this from history.', confirmLabel: 'Restore', icon: History }))) return
    await takeSnapshot(activeFile.id, content, 'Before restore')
    const ta = textareaRef.current
    if (ta) applyTextareaEdit(ta, { from: 0, to: ta.value.length, text: snapshot.content, cursor: 0 })
    else updateActiveContent(snapshot.content)
    setHistoryState(null)
    setToast({ message: 'Version restored. The previous text is in history.', tone: 'success' })
  }, [activeFile, content, takeSnapshot, updateActiveContent, askConfirm])
  const [historyCompare, setHistoryCompare] = useState(null)

  // ── Browser integration: open files from the OS, share target, storage ──
  const addExternalFiles = useCallback((incoming, { activate = true } = {}) => {
    if (!incoming.length) return
    markWorkspaceEdit()
    const created = incoming.map(file => ({ id: createFileId(), ...file }))
    setFiles(prev => [...prev, ...created])
    if (activate) {
      setActiveFileId(created[0].id)
      setActiveHeadingId(null)
      setMobileTab('preview')
    }
    return created
  }, [markWorkspaceEdit])

  // File Handling API: files opened from Finder / Explorer with the installed app.
  useEffect(() => {
    if (!('launchQueue' in window) || !workspaceReady) return
    window.launchQueue.setConsumer(async params => {
      if (!params.files?.length) return
      const opened = []
      for (const handle of params.files) {
        try {
          const file = await handle.getFile()
          if (!/\.(md|markdown|txt)$/i.test(file.name)) continue
          const text = await readFileAsText(file)
          opened.push({ name: file.name, content: text, diskHandle: handle, diskSavedContent: text })
        } catch (error) {
          console.warn('Could not open launched file', error)
        }
      }
      const created = addExternalFiles(opened)
      created?.forEach(file => diskHandlesRef.current.set(file.id, file.diskHandle))
    })
  }, [workspaceReady, addExternalFiles])

  // Web Share Target: content shared to the app from other apps.
  useEffect(() => {
    if (!workspaceReady) return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('shared')) return
    history.replaceState(null, '', window.location.pathname + window.location.hash)
    if (params.get('shared') === 'error') {
      setToast({ message: 'Something went wrong receiving the shared content.', tone: 'warning' })
      return
    }
    takeSharedItems().then(items => {
      const incoming = items.flatMap(sharedItemToFiles)
      if (!incoming.length) return
      addExternalFiles(incoming)
      setToast({ message: `Added ${incoming.length} shared file${incoming.length === 1 ? '' : 's'}.`, tone: 'success' })
    }).catch(() => {})
  }, [workspaceReady, addExternalFiles])

  // Storage API: ask once (on the first edit) for storage the browser won't evict.
  const persistAskedRef = useRef(false)
  useEffect(() => {
    if (!workspaceReady || persistAskedRef.current || !lastLocalEditAtRef.current) return
    persistAskedRef.current = true
    try {
      if (localStorage.getItem('readme-storage-persist-asked')) return
      localStorage.setItem('readme-storage-persist-asked', '1')
    } catch { /* storage is optional */ }
    navigator.storage?.persisted?.().then(persisted => { if (!persisted) requestPersistentStorage() }).catch(() => {})
  }, [files, workspaceReady])
  const [storageOpen, setStorageOpen] = useState(false)

  // ── Custom templates (stored with the other settings, so backups include them) ──
  const [customTemplates, setCustomTemplates] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('readme-custom-templates') || '[]')
      return Array.isArray(saved) ? saved.filter(t => t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.content === 'string') : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try { localStorage.setItem('readme-custom-templates', JSON.stringify(customTemplates)) } catch { /* storage is optional */ }
  }, [customTemplates])
  const allTemplates = useMemo(() => [...customTemplates, ...MD_TEMPLATES], [customTemplates])
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const saveCustomTemplate = useCallback(template => {
    const saved = { ...template, id: template.id || `tpl-${Date.now().toString(36)}`, custom: true }
    setCustomTemplates(prev => (prev.some(t => t.id === saved.id) ? prev.map(t => (t.id === saved.id ? saved : t)) : [saved, ...prev]))
    return saved
  }, [])
  const deleteCustomTemplate = useCallback(id => setCustomTemplates(prev => prev.filter(t => t.id !== id)), [])

  // ── Outside changes to disk files (File System Observer + polling fallback) ──
  const [diskConflicts, setDiskConflicts] = useState({}) // fileId -> { text, at, source?: 'folder', path? }
  const [syncNudge, setSyncNudge] = useState(0) // bump to run a folder sync now
  const [diskCompare, setDiskCompare] = useState(null)
  const diskStampRef = useRef(new Map()) // fileId -> lastModified we have seen
  const filesRef = useRef(files)
  useEffect(() => { filesRef.current = files }, [files])
  const checkDiskFile = useCallback(async fileId => {
    const file = filesRef.current.find(item => item.id === fileId)
    const handle = file && (diskHandlesRef.current.get(file.id) || file.diskHandle)
    if (!handle?.getFile) return
    try {
      if (handle.queryPermission && await handle.queryPermission({ mode: 'read' }) !== 'granted') return
      const disk = await handle.getFile()
      if (diskStampRef.current.get(fileId) === disk.lastModified) return
      const firstLook = !diskStampRef.current.has(fileId)
      diskStampRef.current.set(fileId, disk.lastModified)
      const text = await disk.text()
      const latest = filesRef.current.find(item => item.id === fileId)
      if (!latest || typeof latest.diskSavedContent !== 'string' || text === latest.diskSavedContent) return
      if (latest.content === latest.diskSavedContent || latest.content === text) {
        // No local edits: just take the new version.
        setFiles(prev => prev.map(item => (item.id === fileId ? { ...item, content: text, diskSavedContent: text } : item)))
        if (!firstLook) setToast({ message: `Reloaded “${latest.name}” — it was changed outside ReadMe.`, tone: 'success' })
      } else {
        setDiskConflicts(current => ({ ...current, [fileId]: { text, at: Date.now() } }))
      }
    } catch { /* file moved or permission revoked */ }
  }, [])
  const checkAllDiskFiles = useCallback(() => {
    for (const file of filesRef.current) {
      if (file.diskHandle || diskHandlesRef.current.has(file.id)) checkDiskFile(file.id)
    }
  }, [checkDiskFile])
  const diskFileIds = files.filter(file => file.diskHandle || typeof file.diskSavedContent === 'string').map(file => file.id).join('|')
  useEffect(() => {
    if (!diskFileIds) return undefined
    checkAllDiskFiles()
    const poll = setInterval(() => { if (document.visibilityState === 'visible') checkAllDiskFiles() }, 3000)
    const onFocus = () => checkAllDiskFiles()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    // Native change notifications where supported (Chromium's FileSystemObserver).
    let observer = null
    if ('FileSystemObserver' in window) {
      try {
        observer = new window.FileSystemObserver(() => checkAllDiskFiles())
        for (const file of filesRef.current) {
          const handle = diskHandlesRef.current.get(file.id) || file.diskHandle
          if (handle) observer.observe(handle).catch?.(() => {})
        }
      } catch { observer = null }
    }
    return () => {
      clearInterval(poll)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      observer?.disconnect?.()
    }
  }, [diskFileIds, checkAllDiskFiles])
  const resolveDiskConflict = useCallback(async (fileId, action) => {
    const conflict = diskConflicts[fileId]
    const file = files.find(item => item.id === fileId)
    if (!conflict || !file) return
    if (conflict.source === 'folder' && action !== 'compare') {
      // Sync folder: "reload" takes the folder's version, "keep" writes yours to the folder on the next sync.
      if (action === 'reload') {
        await takeSnapshot(fileId, file.content, 'Before using the sync folder version')
        if (fileId === activeFileId && textareaRef.current) applyTextareaEdit(textareaRef.current, { from: 0, to: textareaRef.current.value.length, text: conflict.text, cursor: 0 })
        setFiles(prev => prev.map(item => (item.id === fileId ? { ...item, content: conflict.text } : item)))
        setToast({ message: 'Using the folder version. Your previous text is in version history.', tone: 'success' })
      } else {
        await takeSnapshot(fileId, conflict.text, 'Sync folder version (replaced)')
      }
      syncWrittenRef.current.set(conflict.path, conflict.text)
      folderConflictIdsRef.current.delete(fileId)
      setSyncNudge(n => n + 1)
      setDiskConflicts(current => { const next = { ...current }; delete next[fileId]; return next })
      return
    }
    if (action === 'reload') {
      await takeSnapshot(fileId, file.content, 'Before reloading from disk')
      if (fileId === activeFileId && textareaRef.current) {
        applyTextareaEdit(textareaRef.current, { from: 0, to: textareaRef.current.value.length, text: conflict.text, cursor: 0 })
      }
      setFiles(prev => prev.map(item => (item.id === fileId ? { ...item, content: conflict.text, diskSavedContent: conflict.text } : item)))
      setToast({ message: 'Reloaded from disk. Your previous text is in version history.', tone: 'success' })
    } else if (action === 'keep') {
      // The disk now holds the other version: your text shows as unsaved until you save.
      setFiles(prev => prev.map(item => (item.id === fileId ? { ...item, diskSavedContent: conflict.text } : item)))
    } else if (action === 'compare') {
      setDiskCompare({
        files: [
          { id: 'disk-version', name: `${file.name} — ${conflict.source === 'folder' ? 'in sync folder' : 'on disk'}`, content: conflict.text },
          { id: 'your-version', name: `${file.name} — your version`, content: file.content },
        ],
      })
      return
    }
    setDiskConflicts(current => { const next = { ...current }; delete next[fileId]; return next })
  }, [diskConflicts, files, activeFileId, takeSnapshot])

  // ── Summary card at the top of the page ──────────────────────
  const runSummary = useCallback(async () => {
    if (!activeFile || !markdownBody.trim()) return
    const fileId = activeFile.id
    const source = markdownBody
    summaryAbortRef.current?.abort()
    const controller = new AbortController()
    summaryAbortRef.current = controller
    const update = patch => setSummaries(current => ({ ...current, [fileId]: { ...current[fileId], ...patch } }))
    update({ status: 'loading', text: '', error: '', progress: null, preparing: false, source, visible: true })
    try {
      const language = await detectLanguage(source).catch(() => null)
      const text = await summarizeDocument(source, {
        language: language || 'en', signal: controller.signal,
        onStatus: status => update({ preparing: status === 'preparing' }),
        onProgress: loaded => update({ progress: loaded < 1 ? loaded : null }),
        onChunk: partial => update({ text: partial, preparing: false, progress: null }),
      })
      update({ status: 'ready', text, preparing: false, progress: null })
    } catch (error) {
      if (error?.name === 'AbortError') update({ status: 'idle', visible: false })
      else update({ status: 'error', error: error?.message || 'Could not create a summary.', preparing: false, progress: null })
    }
  }, [activeFile, markdownBody])
  const activeSummary = activeFileId ? summaries[activeFileId] : null
  const toggleSummary = useCallback(() => {
    if (!activeFileId) return
    const current = summaries[activeFileId]
    if (current?.visible && current.status !== 'error') {
      if (current.status === 'loading') summaryAbortRef.current?.abort()
      setSummaries(all => ({ ...all, [activeFileId]: { ...all[activeFileId], visible: false } }))
    } else if (current?.status === 'ready' && current.source === markdownBody) {
      setSummaries(all => ({ ...all, [activeFileId]: { ...all[activeFileId], visible: true } }))
    } else {
      runSummary()
    }
  }, [activeFileId, summaries, markdownBody, runSummary])
  useEffect(() => () => summaryAbortRef.current?.abort(), [])

  // ── Section bookmarks (per file, by heading id) ─────────────
  const [sectionBookmarks, setSectionBookmarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('readme-section-bookmarks') || '{}') } catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem('readme-section-bookmarks', JSON.stringify(sectionBookmarks)) } catch { /* storage is optional */ }
  }, [sectionBookmarks])
  const activeBookmarkIds = useMemo(() => {
    const valid = new Set(headings.map(heading => heading.id))
    return new Set((sectionBookmarks[activeFileId] || []).filter(id => valid.has(id)))
  }, [sectionBookmarks, activeFileId, headings])
  const toggleSectionBookmark = useCallback(id => {
    if (!activeFileId) return
    setSectionBookmarks(all => {
      const list = all[activeFileId] || []
      const next = list.includes(id) ? list.filter(item => item !== id) : [...list, id]
      return { ...all, [activeFileId]: next }
    })
  }, [activeFileId])
  const showOnlyBookmarked = onlyBookmarked && activeBookmarkIds.size > 0

  // ── Section summaries ────────────────────────────────────────
  const [sectionSummaries, setSectionSummaries] = useState({}) // { [fileId]: { [sectionKey]: state } }
  const sectionAbortRef = useRef(new Map())
  const summarizeSection = useCallback(async key => {
    const fileId = activeFileId
    const section = previewScrollRef.current?.querySelector(`.doc-prose section[data-section-key="${CSS.escape(key)}"]`)
    if (!fileId || !section) return
    const clone = section.cloneNode(true)
    clone.querySelectorAll('.heading-tools, .section-summary, .heading-anchor, .section-toggle, .code-actions, svg').forEach(el => el.remove())
    const text = clone.innerText || clone.textContent || ''
    sectionAbortRef.current.get(key)?.abort()
    const controller = new AbortController()
    sectionAbortRef.current.set(key, controller)
    const update = patch => setSectionSummaries(all => ({ ...all, [fileId]: { ...all[fileId], [key]: { ...all[fileId]?.[key], ...patch } } }))
    update({ status: 'loading', text: '', error: '', preparing: false })
    try {
      const result = await summarizeDocument(text, {
        signal: controller.signal,
        onStatus: status => update({ preparing: status === 'preparing' }),
        onChunk: partial => update({ text: partial, preparing: false }),
      })
      update({ status: 'ready', text: result, preparing: false })
    } catch (error) {
      if (error?.name === 'AbortError') return
      update({ status: 'error', error: error?.message || 'Could not summarize this section.', preparing: false })
    }
  }, [activeFileId])
  const closeSectionSummary = useCallback(key => {
    sectionAbortRef.current.get(key)?.abort()
    setSectionSummaries(all => {
      const forFile = { ...all[activeFileId] }
      delete forFile[key]
      return { ...all, [activeFileId]: forFile }
    })
  }, [activeFileId])
  useEffect(() => () => sectionAbortRef.current.forEach(controller => controller.abort()), [])
  const sectionExtrasValue = useMemo(() => ({
    bookmarks: activeBookmarkIds,
    toggleBookmark: toggleSectionBookmark,
    canSummarize,
    summaries: sectionSummaries[activeFileId] || {},
    summarizeSection,
    closeSummary: closeSectionSummary,
    renderSummary: text => <MarkdownRenderer content={text} dark={isDark} />,
  }), [activeBookmarkIds, toggleSectionBookmark, canSummarize, sectionSummaries, activeFileId, summarizeSection, closeSectionSummary, isDark])

  // ── Content filter (show only headings / tables / code …) ────
  const [filterCount, setFilterCount] = useState(0)
  const docProseRef = useRef(null)

  // ── Edit in preview ─────────────────────────────────────────
  const [previewEditOn, setPreviewEditOn] = useState(() => { try { return localStorage.getItem('readme-preview-edit') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('readme-preview-edit', previewEditOn ? '1' : '0') } catch { /* optional */ } }, [previewEditOn])
  // Edits made while only the preview is showing get their own undo / redo (the editor is hidden).
  const previewHistoryRef = useRef({ fileId: null, undo: [], redo: [] })
  const applyPreviewEdit = useCallback(({ from, to, text }) => {
    const offset = content.length - markdownBody.length
    const ta = textareaRef.current
    if (view !== 'preview' && ta && (ta.applyEdit || (ta instanceof HTMLTextAreaElement && ta.value === content))) {
      // The editor is showing: one undoable edit there (and the caret follows the change).
      const before = document.activeElement
      applyTextareaEdit(ta, { from: from + offset, to: to + offset, text, cursor: from + offset + text.length })
      if (before && before !== ta && before !== document.body && before.isConnected) before.focus({ preventScroll: true })
      else ta.blur?.()
      return
    }
    const history = previewHistoryRef.current
    if (history.fileId !== activeFileId) Object.assign(history, { fileId: activeFileId, undo: [], redo: [] })
    history.undo.push(content)
    if (history.undo.length > 100) history.undo.shift()
    history.redo = []
    updateActiveContent(content.slice(0, from + offset) + text + content.slice(to + offset))
  }, [content, markdownBody, view, activeFileId, updateActiveContent])
  const previewEditing = usePreviewEditing({
    enabled: previewEditOn && view !== 'editor' && Boolean(activeFile) && !presenting,
    rootRef: docProseRef, body: markdownBody, applyEdit: applyPreviewEdit, askText,
  })
  useEffect(() => {
    if (!previewEditOn || view !== 'preview') return undefined
    const onKey = event => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor')) return
      const history = previewHistoryRef.current
      if (history.fileId !== activeFileId) return
      const stack = event.shiftKey ? history.redo : history.undo
      if (!stack.length) return
      event.preventDefault()
      const target = stack.pop()
      ;(event.shiftKey ? history.undo : history.redo).push(content)
      updateActiveContent(target)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewEditOn, view, activeFileId, content, updateActiveContent])
  // Re-apply after every render of the page content (React may replace nodes).
  useLayoutEffect(() => {
    const root = docProseRef.current
    if (!root) return
    if (!contentFilter) { clearContentFilter(root); return }
    setFilterCount(applyContentFilter(root, contentFilter))
  }, [contentFilter, markdownBody, sectionExtrasValue, sectionCollapseValue, isDark, appSettings.lite])
  useEffect(() => { setContentFilter(null); setOnlyBookmarked(false) }, [activeFileId])
  const [filterMenuOpen, setFilterMenuOpen] = useState(null) // menu position while open
  const closeFilterMenu = useCallback(() => setFilterMenuOpen(null), [])
  const filterButtonRef = useRef(null)

  // ── Resizable contents bar ───────────────────────────────────
  const TOC_MIN_WIDTH = 230
  const tocMaxWidth = () => Math.max(TOC_MIN_WIDTH, Math.round(window.innerWidth * 0.3))
  const [tocWidth, setTocWidth] = useState(() => {
    const saved = Number(localStorage.getItem('readme-toc-width'))
    return Number.isFinite(saved) && saved > 0 ? Math.min(Math.max(saved, TOC_MIN_WIDTH), tocMaxWidth()) : TOC_MIN_WIDTH
  })
  const [tocResizing, setTocResizing] = useState(false)
  useEffect(() => {
    try { localStorage.setItem('readme-toc-width', String(tocWidth)) } catch { /* storage is optional */ }
  }, [tocWidth])
  useEffect(() => {
    const clamp = () => setTocWidth(width => Math.min(Math.max(width, TOC_MIN_WIDTH), tocMaxWidth()))
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [])
  const startTocResize = useCallback(event => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = tocWidth
    setTocResizing(true)
    const onMove = moveEvent => setTocWidth(Math.min(Math.max(startWidth + moveEvent.clientX - startX, TOC_MIN_WIDTH), tocMaxWidth()))
    const onUp = () => {
      setTocResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [tocWidth])

  // ── Write a README from a description ───────────────────────
  const [writeReadmeOpen, setWriteReadmeOpen] = useState(false)
  const [readmeWriting, setReadmeWriting] = useState(null) // { fileId, preparing, progress }
  const readmeAbortRef = useRef(null)
  const readmeQuickRef = useRef(false) // "Use quick version": skip the AI and use the generator
  const [aiWriterSupported] = useState(() => canWriteWithAi())
  const aiWriter = aiWriterSupported && !hideAi
  const handleWriteReadme = useCallback(async prompt => {
    readmeAbortRef.current?.abort()
    const controller = new AbortController()
    readmeAbortRef.current = controller
    readmeQuickRef.current = false
    const id = createFileId()
    markWorkspaceEdit()
    setFiles(prev => {
      const taken = new Set(prev.map(file => file.name.toLowerCase()))
      const name = taken.has('readme.md') ? makeDuplicateFileName('README.md', prev.map(file => file.name)) : 'README.md'
      return [...prev, { id, name, content: '' }]
    })
    setActiveFileId(id)
    setActiveHeadingId(null)
    if (view === 'editor' || view === 'preview') setView('split')
    setMobileTab('preview')
    setReadmeWriting({ fileId: id, preparing: false, progress: null, streaming: false, ai: aiWriter })

    // Batch streamed text into ~10 updates per second so typing the file stays smooth.
    let pending = null
    let timer = null
    const write = text => setFiles(prev => prev.map(file => (file.id === id ? { ...file, content: text } : file)))
    const schedule = text => {
      pending = text
      if (!timer) timer = setTimeout(() => { timer = null; write(pending) }, 100)
    }
    const reveal = async (text, signal = controller.signal) => {
      // Without AI the README is ready at once; reveal it line by line so it visibly fills in.
      const lines = text.split('\n')
      for (let count = 4; count < lines.length; count += 4) {
        if (signal.aborted) return
        write(lines.slice(0, count).join('\n'))
        await new Promise(resolve => setTimeout(resolve, 30))
      }
      write(text)
    }
    try {
      if (aiWriter) {
        try {
          const text = await writeReadmeWithAi(prompt, {
            signal: controller.signal,
            onStatus: status => setReadmeWriting(current => current && { ...current, preparing: status === 'preparing' }),
            onProgress: loaded => setReadmeWriting(current => current && { ...current, progress: loaded < 1 ? loaded : null }),
            onChunk: partial => { setReadmeWriting(current => current && { ...current, preparing: false, progress: null, streaming: true }); schedule(partial) },
          })
          clearTimeout(timer)
          write(text.trim() ? `${text.trim()}\n` : readmeFromPrompt(prompt))
        } catch (error) {
          if (error?.name === 'AbortError' && readmeQuickRef.current) {
            // The user chose the quick version while the AI was still getting ready.
            clearTimeout(timer)
            setReadmeWriting(current => current && { ...current, ai: false, preparing: false, progress: null })
            await reveal(readmeFromPrompt(prompt), new AbortController().signal)
            setToast({ message: 'README ready — edit it like any other file.', tone: 'success' })
            return
          }
          if (error?.name === 'AbortError') throw error
          clearTimeout(timer)
          setToast({ message: 'The on-device AI writer is unavailable right now, so the README was generated from your description.', tone: 'warning', duration: 5000 })
          await reveal(readmeFromPrompt(prompt))
        }
      } else {
        await reveal(readmeFromPrompt(prompt))
      }
      if (!controller.signal.aborted) setToast({ message: 'README ready — edit it like any other file.', tone: 'success' })
    } catch {
      clearTimeout(timer)
      if (pending) write(pending)
      setToast({ message: 'Stopped writing. What was written so far is kept.', tone: 'info' })
    } finally {
      if (readmeAbortRef.current === controller) readmeAbortRef.current = null
      setReadmeWriting(current => (current?.fileId === id ? null : current))
    }
  }, [aiWriter, markWorkspaceEdit, view])
  useEffect(() => () => readmeAbortRef.current?.abort(), [])

  // ── Backup / restore ─────────────────────────────────────────
  const restoreInputRef = useRef(null)
  const handleBackup = useCallback(async () => {
    try {
      const blob = await createBackup({ files, activeId: activeFileId, closed: closedFiles })
      const date = new Date().toISOString().slice(0, 10)
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `ReadMe backup ${date}.zip` })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      const closedNote = closedFiles.length ? ` + ${closedFiles.length} closed` : ''
      setToast({ message: `Backup downloaded (${files.length} file${files.length === 1 ? '' : 's'}${closedNote}, settings and history).`, tone: 'success' })
    } catch (error) {
      console.error('Backup failed', error)
      setToast({ message: 'Could not create the backup.', tone: 'warning' })
    }
  }, [files, activeFileId, closedFiles])
  const handleRestoreFile = useCallback(async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const backup = await readBackup(file)
      const when = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'an unknown date'
      const existing = [...files, ...closedFiles.map(entry => entry.file)]
      const incoming = [...backup.files, ...backup.closed.map(entry => entry.file)]
      const currentNames = new Set(existing.map(item => item.name.toLowerCase()))
      const backupNames = new Set(incoming.map(item => item.name.toLowerCase()))
      const replaced = incoming.filter(item => currentNames.has(item.name.toLowerCase())).length
      const added = incoming.filter(item => !currentNames.has(item.name.toLowerCase())).length
      const removed = existing.filter(item => !backupNames.has(item.name.toLowerCase())).length
      const ok = await askConfirm({
        title: 'Restore this backup?', danger: true, confirmLabel: 'Replace and restore', icon: ArchiveRestore,
        message: `The backup is from ${when}. Restoring replaces the current workspace and settings.`,
        details: [`${added} file${added === 1 ? '' : 's'} will be added`, `${replaced} file${replaced === 1 ? '' : 's'} will be replaced`, `${removed} current file${removed === 1 ? '' : 's'} will be removed`, `${backup.closed.length} backup file${backup.closed.length === 1 ? '' : 's'} are closed`],
      })
      if (!ok) return
      await applyBackup(backup)
      window.location.reload()
    } catch (error) {
      setToast({ message: error?.message || 'Could not restore this backup.', tone: 'warning', duration: 6000 })
    }
  }, [askConfirm, files, closedFiles])

  // Cmd/Ctrl+Shift+T (installed app) or Alt+Shift+T (anywhere) reopens the last closed tab.
  useEffect(() => {
    const onKeyDown = event => {
      // Cmd/Ctrl+Shift+T is reserved by browsers in a normal tab, so Alt+Shift+T also works.
      // (event.code: on macOS, Option changes event.key.)
      const reopenCombo = event.shiftKey && event.code === 'KeyT' && ((event.metaKey || event.ctrlKey) || (event.altKey && !event.metaKey && !event.ctrlKey))
      if (reopenCombo) {
        event.preventDefault()
        handleReopenClosed()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleReopenClosed])

  const handleReorderFiles = useCallback((sourceId, targetId, placeAfter) => {
    setFiles(prev => {
      const source = prev.find(f => f.id === sourceId)
      const target = prev.find(f => f.id === targetId)
      if (!source || !target || source === target || Boolean(source.pinned) !== Boolean(target.pinned)) return prev
      const without = prev.filter(f => f.id !== sourceId)
      const targetIndex = without.findIndex(f => f.id === targetId)
      without.splice(targetIndex + (placeAfter ? 1 : 0), 0, source)
      return without
    })
    markWorkspaceEdit()
  }, [markWorkspaceEdit])
  // Up to MAX_PINNED files can be pinned. The file pinned last goes first; unpinning moves a
  // file to the start of the unpinned ones.
  const handleTogglePin = useCallback(id => {
    const target = files.find(f => f.id === id)
    if (!target) return
    if (!target.pinned && files.filter(f => f.pinned).length >= MAX_PINNED) {
      setToast({ message: `You can pin up to ${MAX_PINNED} files. Unpin one to pin “${target.name}”.`, tone: 'warning', duration: 5000 })
      return
    }
    markWorkspaceEdit()
    setFiles(prev => {
      const current = prev.find(f => f.id === id)
      if (!current) return prev
      const updated = { ...current, pinned: !current.pinned }
      const rest = prev.filter(f => f.id !== id)
      if (updated.pinned) return [updated, ...rest]
      const firstUnpinned = rest.findIndex(f => !f.pinned)
      rest.splice(firstUnpinned === -1 ? rest.length : firstUnpinned, 0, updated)
      return rest
    })
  }, [files, markWorkspaceEdit])
  const handleSetFileColor = useCallback((id, color) => {
    markWorkspaceEdit()
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, color: color || undefined } : f)))
  }, [markWorkspaceEdit])
  const handleDownloadFile = useCallback(id => {
    const file = files.find(f => f.id === id)
    if (!file) return
    const name = (file.name.split('/').pop() || 'document.md')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([file.content], { type: 'text/markdown' })),
      download: /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`,
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }, [files])

  // Publish documents as a static website (ZIP), made on this device.
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishProgress, setPublishProgress] = useState(0)
  const handlePublishSite = useCallback(async ({ includeClosed, ...options }) => {
    setPublishBusy(true)
    setPublishProgress(0)
    try {
      const { publishSite, renderSiteDiagrams } = await import('./sitePublisher')
      const pool = includeClosed ? [...files, ...closedFileList] : files
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6d28d9'
      const attachments = new Map([...attachmentsRef.current].map(([path, record]) => [path, record.blob]))
      const { blob, pages } = await publishSite(pool, { ...options, accent, attachments, defaultStyle: appSettings.defaultDocStyle, renderDiagrams: renderSiteDiagrams, onProgress: setPublishProgress })
      const slug = (options.title || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${slug}-website.zip` })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      setPublishOpen(false)
      setToast({ message: `Website ready: ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}. Unzip and upload the folder to any static host.`, tone: 'success', duration: 5000 })
    } catch (error) {
      console.error(error)
      setToast({ message: `Could not make the website: ${error?.message || 'unknown error'}`, tone: 'warning' })
    } finally {
      setPublishBusy(false)
    }
  }, [files, closedFileList, appSettings.defaultDocStyle])

  const moveFileToFolder = useCallback((id, folder) => {
    setFiles(prev => {
      const file = prev.find(item => item.id === id)
      if (!file) return prev
      const base = file.name.split('/').pop()
      const target = folder ? `${folder}/${base}` : base
      if (target === file.name) return prev
      const name = uniqueName(target, prev.filter(item => item.id !== id).map(item => item.name))
      return prev.map(item => (item.id === id ? { ...item, name } : item))
    })
    // Closed files (listed in the Files panel and the Library) move too.
    setClosedFiles(prev => {
      const entry = prev.find(item => item.file.id === id)
      if (!entry) return prev
      const base = entry.file.name.split('/').pop()
      const target = folder ? `${folder}/${base}` : base
      if (target === entry.file.name) return prev
      const name = uniqueName(target, prev.filter(item => item.file.id !== id).map(item => item.file.name))
      return prev.map(item => (item.file.id === id ? { ...item, file: { ...item.file, name } } : item))
    })
    markWorkspaceEdit()
  }, [markWorkspaceEdit])
  const createFileInFolder = useCallback(folder => {
    markWorkspaceEdit()
    const id = createFileId()
    setFiles(prev => {
      const inFolder = prev.filter(file => (folder ? file.name.startsWith(`${folder}/`) && !file.name.slice(folder.length + 1).includes('/') : !file.name.includes('/')))
        .map(file => ({ ...file, name: file.name.split('/').pop() }))
      const name = `${folder ? `${folder}/` : ''}${getNextUntitledName(inFolder)}`
      return [...prev, { id, name, content: '' }]
    })
    setActiveFileId(id)
    if (view === 'preview') setView('split')
    setMobileTab('editor')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [markWorkspaceEdit, view])
  const folderExists = useCallback(path => (
    emptyFolders.includes(path)
    || files.some(file => file.name.startsWith(`${path}/`))
    || closedFiles.some(entry => entry.file.name.startsWith(`${path}/`))
  ), [emptyFolders, files, closedFiles])
  // How many folder levels sit inside `path` (so a rename can't push them past the limit).
  const folderLevelsInside = useCallback(path => {
    const paths = [...emptyFolders, ...[...files, ...closedFiles.map(entry => entry.file)].map(file => file.name.split('/').slice(0, -1).join('/'))]
    return paths.filter(item => item.startsWith(`${path}/`)).reduce((max, item) => Math.max(max, folderDepth(item) - folderDepth(path)), 0)
  }, [emptyFolders, files, closedFiles])
  // New folder: asks for a name in the app's own dialog and adds an empty folder (no file).
  const createFolder = useCallback(() => setFolderPrompt({ mode: 'new' }), [])
  const createSubfolder = useCallback(parent => setFolderPrompt({ mode: 'new', parent }), [])
  const renameFolder = useCallback(path => setFolderPrompt({ mode: 'rename', path }), [])
  const submitFolderPrompt = useCallback(raw => {
    const prompt = folderPrompt
    setFolderPrompt(null)
    const typed = cleanFolderName(raw)
    if (!prompt || !typed) return
    const name = prompt.parent ? `${prompt.parent}/${typed}` : typed
    if (prompt.mode === 'new') {
      setEmptyFolders(list => (list.includes(name) ? list : [...list, name]))
      // Open the new folder and the folders around it.
      setTreeCollapsed(list => list.filter(item => !(name === item || name.startsWith(`${item}/`))))
      return
    }
    const path = prompt.path
    if (name === path) return
    markWorkspaceEdit()
    const moveName = value => (value === path ? name : value.startsWith(`${path}/`) ? `${name}/${value.slice(path.length + 1)}` : value)
    const move = file => ({ ...file, name: moveName(file.name) })
    setFiles(prev => prev.map(file => (file.name.startsWith(`${path}/`) ? move(file) : file)))
    setClosedFiles(prev => prev.map(entry => (entry.file.name.startsWith(`${path}/`) ? { ...entry, file: move(entry.file) } : entry)))
    setEmptyFolders(list => [...new Set(list.map(moveName))])
    setTreeCollapsed(list => list.map(moveName))
  }, [folderPrompt, markWorkspaceEdit])
  const closeFolder = useCallback(path => {
    const ids = files.filter(file => file.name.startsWith(`${path}/`)).map(file => file.id)
    if (ids.length) closeFiles(ids)
    // An empty folder (or one left empty) is removed from the list.
    else setEmptyFolders(list => list.filter(item => item !== path && !item.startsWith(`${path}/`)))
  }, [files, closeFiles])

  const handleRevealOutline = useCallback(id => {
    setActiveFileId(id)
    if (view === 'editor') setView('split')
    setTocVisible(true)
    setMobileTab('preview')
  }, [view])

  const handleRenameFile = useCallback(async (id, rawName) => {
    const trimmed = rawName.trim()
    const renamed = files.find(f => f.id === id)
    if (!trimmed || !renamed || renamed.name === trimmed) return
    // [[Wiki links]] to the old name in other documents: offer to update them.
    const changes = renameWikiLinks(linkableFiles, renamed.name, trimmed)
    markWorkspaceEdit()
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, name: trimmed } : f)))
    if (!changes.length) return
    const ok = await askConfirm({
      title: 'Update links?', confirmLabel: `Update ${changes.length} document${changes.length === 1 ? '' : 's'}`, cancelLabel: 'Leave them', icon: Link2,
      message: `${changes.length} other document${changes.length === 1 ? ' links' : 's link'} to “${renamed.name}” with [[wiki links]]. Update ${changes.length === 1 ? 'it' : 'them'} to the new name?`,
      details: changes.slice(0, 5).map(change => change.file.name).concat(changes.length > 5 ? [`and ${changes.length - 5} more`] : []),
    })
    if (!ok) return
    const before = new Map(changes.map(change => [change.file.id, change.file.content]))
    const after = new Map(changes.map(change => [change.file.id, change.content]))
    const apply = map => {
      markWorkspaceEdit()
      setFiles(prev => prev.map(f => (map.has(f.id) ? { ...f, content: map.get(f.id) } : f)))
      setClosedFiles(prev => prev.map(entry => (map.has(entry.file.id) ? { ...entry, file: { ...entry.file, content: map.get(entry.file.id) } } : entry)))
    }
    apply(after)
    setToast({ message: `Updated links in ${changes.length} document${changes.length === 1 ? '' : 's'}.`, tone: 'success', duration: 8000, action: { label: 'Undo', run: () => apply(before) } })
  }, [files, linkableFiles, markWorkspaceEdit, askConfirm])

  const handleFiles = useCallback(async (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    const valid = incoming.filter(f => IMPORTABLE_FILE_RE.test(f.name))
    const invalidCount = incoming.length - valid.length
    if (!valid.length) {
      setToast({ message: 'Please upload Markdown (.md), text, Word (.docx) or HTML files.', tone: 'warning' })
      return
    }
    try {
      let converted = 0
      const loaded = await Promise.all(
        valid.map(async f => {
          const id = createFileId()
          // Word and HTML files become new Markdown files (converted on this device).
          if (CONVERTIBLE_FILE_RE.test(f.name)) {
            const { docxToMarkdown, htmlToMarkdown } = await import('./htmlToMarkdown')
            const markdown = /\.docx$/i.test(f.name) ? await docxToMarkdown(await f.arrayBuffer()) : htmlToMarkdown(await readFileAsText(f))
            converted += 1
            return { id, name: (f.readmePath || f.name).replace(/\.(docx|html?)$/i, '.md'), content: markdown }
          }
          if (f.readmeHandle) diskHandlesRef.current.set(id, f.readmeHandle)
          const text = await readFileAsText(f)
          return { id, name: f.readmePath || f.name, content: text, ...(f.readmeHandle ? { diskHandle: f.readmeHandle, diskSavedContent: text } : {}) }
        })
      )
      if (converted) setToast({ message: `Converted ${converted} file${converted === 1 ? '' : 's'} from Word / HTML to Markdown.`, tone: 'success' })
      markWorkspaceEdit()
      setFiles(prev => [...prev, ...loaded])
      setActiveFileId(loaded[0].id)
      setActiveHeadingId(null)
      setShowScrollTop(false)
      setMobileTab('preview')
      if (invalidCount > 0) {
        setToast({ message: `${invalidCount} unsupported file${invalidCount === 1 ? '' : 's'} skipped. ReadMe opens Markdown, text, Word (.docx) and HTML files.`, tone: 'warning', duration: 6000 })
      }
    } catch (err) {
      console.error('Failed to read uploaded file(s)', err)
      setToast({ message: 'Could not read one or more files. Please try again.', tone: 'warning' })
    }
  }, [markWorkspaceEdit])

  const handleDrop = useCallback(async (e) => {
    // Only files dragged in from the computer are imported; in-app drags
    // (tab reordering, moving files in the tree) are handled by their targets.
    if (!isExternalFileDrag(e)) { setIsDragging(false); return }
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.items || [])
    const fileSystemHandles = await Promise.all(items.map(item => item.getAsFileSystemHandle?.()?.catch(() => null)))
    const collected = []
    const walk = async (handle, prefix = '') => {
      if (!handle) return
      if (handle.kind === 'file') {
        if (IMPORTABLE_FILE_RE.test(handle.name)) {
          const file = await handle.getFile()
          // Converted files don't keep a link to the original (they're new Markdown files).
          collected.push(Object.assign(file, CONVERTIBLE_FILE_RE.test(handle.name) ? { readmePath: `${prefix}${handle.name}` } : { readmeHandle: handle, readmePath: `${prefix}${handle.name}` }))
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
  const handleDragOver  = useCallback(e => {
    if (!isExternalFileDrag(e)) return
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback(e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }, [])

  const handleOpenDiskFiles = useCallback(async () => {
    if (!window.showOpenFilePicker) { fileInputRef.current?.click(); return }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }, { description: 'Word and HTML (converted to Markdown)', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'text/html': ['.html', '.htm'] } }] })
      const loaded = await Promise.all(handles.map(async handle => {
        const file = await handle.getFile()
        const id = createFileId()
        diskHandlesRef.current.set(id, handle)
        const text = await readFileAsText(file)
        return { id, name: file.name, content: text, diskHandle: handle, diskSavedContent: text }
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
        setToast({ message: 'Allow file access to save this document in place.', tone: 'warning' })
        return
      }
      // Align table pipes on save.
      const savedContent = formatMarkdownTables(content)
      if (savedContent !== content) updateActiveContent(savedContent)
      const writable = await handle.createWritable()
      await writable.write(savedContent)
      await writable.close()
      const savedId = activeFile.id
      setFiles(prev => prev.map(f => (f.id === savedId ? { ...f, diskHandle: handle, diskSavedContent: savedContent } : f)))
      takeSnapshot(savedId, savedContent, 'Saved to disk')
      handle.getFile?.().then(file => diskStampRef.current.set(savedId, file.lastModified)).catch(() => {})
    } catch (error) {
      if (error?.name !== 'AbortError') { console.error('Save file failed', error); setToast({ message: 'Could not save this file. Use Download instead.', tone: 'warning', duration: 6000 }) }
    }
  }, [activeFile, content, fileName, updateActiveContent, takeSnapshot])

  // ── Sync to a folder on this computer ───────────────────────
  const [syncFolder, setSyncFolder] = useState(null) // { handle, name, status, error, lastSync }
  const [syncActivity, setSyncActivity] = useState(() => { try { return JSON.parse(localStorage.getItem('readme-sync-activity') || '[]') } catch { return [] } })
  const syncWrittenRef = useRef(new Map()) // path → content last written to / read from the folder
  const syncPathsRef = useRef(new Map()) // file id → path it was last written to (so renames move the file)
  const closedFilesRef = useRef(closedFiles)
  useEffect(() => { closedFilesRef.current = closedFiles }, [closedFiles])
  const resetSyncState = useCallback(() => {
    syncWrittenRef.current = new Map()
    syncPathsRef.current = new Map()
    writeSyncState(null).catch(() => {})
  }, [])
  // Files edited both here and in the folder since the last sync: not written until the user picks a version.
  const folderConflictIdsRef = useRef(new Set())
  const removedFromFolderRef = useRef(new Set()) // ids closed because they were deleted from the folder
  const closeFilesRef = useRef(null)
  useEffect(() => { closeFilesRef.current = closeFiles }, [closeFiles])
  const pullFromFolder = useCallback(async (handle, { first = false } = {}) => {
    const disk = await readFolder(handle)
    const written = syncWrittenRef.current
    const byPath = new Map(filesRef.current.map(file => [syncPath(file.name), file]))
    const closedByPath = new Map(closedFilesRef.current.map(entry => [syncPath(entry.file.name), entry.file]))
    const onDisk = new Set(disk.map(entry => entry.path))
    const imports = []
    const updates = new Map()
    const closedUpdates = new Map()
    const conflicts = []
    for (const entry of disk) {
      const local = byPath.get(entry.path) ?? closedByPath.get(entry.path)
      const isClosed = !byPath.has(entry.path) && closedByPath.has(entry.path)
      if (!local) {
        // New in the folder (or present before syncing started): open it.
        if (!written.has(entry.path)) imports.push({ name: entry.path, content: entry.content })
        written.set(entry.path, entry.content)
        continue
      }
      if (local.content === entry.content) {
        written.set(entry.path, entry.content)
        if (folderConflictIdsRef.current.delete(local.id)) conflicts.push({ id: local.id, resolved: true })
        continue
      }
      const last = written.get(entry.path)
      if (last === undefined) {
        // Never synced before and the two differ: keep the workspace version,
        // and keep the folder's version in the file's history so nothing is lost.
        if (first) takeSnapshot(local.id, entry.content, 'Folder version before syncing')
        continue
      }
      if (entry.content === last) continue // only changed here: written below
      if (local.content === last) {
        // Changed in the folder by another app, unchanged here: take the folder's version.
        if (isClosed) closedUpdates.set(local.id, entry.content)
        else updates.set(local.id, entry.content)
        written.set(entry.path, entry.content)
      } else {
        // Changed in both places: ask which to keep (nothing is written until then).
        folderConflictIdsRef.current.add(local.id)
        conflicts.push({ id: local.id, text: entry.content, path: entry.path })
      }
    }
    // Synced files that were deleted from the folder by another app: close them (still listed in the Files panel).
    const removed = []
    for (const [path, file] of byPath) {
      if (onDisk.has(path) || !written.has(path) || folderConflictIdsRef.current.has(file.id)) continue
      if (await existsInFolder(handle, path)) continue
      removed.push(file)
      written.delete(path)
      syncPathsRef.current.delete(file.id)
    }
    const removedClosedIds = []
    for (const [path, file] of closedByPath) {
      if (onDisk.has(path) || !written.has(path) || folderConflictIdsRef.current.has(file.id)) continue
      if (await existsInFolder(handle, path)) continue
      removedClosedIds.push(file.id)
      written.delete(path)
      syncPathsRef.current.delete(file.id)
    }
    if (updates.size) setFiles(prev => prev.map(file => (updates.has(file.id) ? { ...file, content: updates.get(file.id) } : file)))
    if (closedUpdates.size) setClosedFiles(prev => prev.map(entry => (closedUpdates.has(entry.file.id) ? { ...entry, file: { ...entry.file, content: closedUpdates.get(entry.file.id) } } : entry)))
    if (imports.length) setFiles(prev => [...prev, ...imports.map(item => ({ id: createFileId(), ...item }))])
    if (conflicts.length) {
      setDiskConflicts(current => {
        const next = { ...current }
        for (const item of conflicts) {
          if (item.resolved) { if (next[item.id]?.source === 'folder') delete next[item.id] } else next[item.id] = { text: item.text, at: Date.now(), source: 'folder', path: item.path }
        }
        return next
      })
    }
    if (removed.length) {
      closeFilesRef.current?.(removed.map(file => file.id))
      setToast({
        message: removed.length === 1
          ? `“${removed[0].name}” was deleted from the sync folder, so it was closed. Reopen it from the Files panel to put it back.`
          : `${removed.length} files were deleted from the sync folder, so they were closed. Reopen them from the Files panel to put them back.`,
        tone: 'warning', duration: 8000,
      })
    }
    return { imported: imports.length, updated: updates.size + closedUpdates.size, removedIds: removed.map(file => file.id), removedClosedIds }
  }, [takeSnapshot])
  // One sync at a time; a request while one runs queues a single follow-up.
  const syncRunRef = useRef({ running: null, queued: null })
  const [syncBusy, setSyncBusy] = useState(false)
  const runFolderSync = useCallback(async (handle, options) => {
    const state = syncRunRef.current
    if (state.running) {
      state.queued = state.queued || state.running.then(() => { state.queued = null; return runFolderSync(handle, options) })
      return state.queued
    }
    const run = (async () => {
      setSyncBusy(true)
      try {
        const pulled = await pullFromFolder(handle, options)
        const conflicted = folderConflictIdsRef.current
        // Removed files are closed by a state update that hasn't landed in filesRef yet: never write them back.
        for (const id of pulled.removedIds) removedFromFolderRef.current.add(id)
        for (const id of pulled.removedClosedIds) removedFromFolderRef.current.add(id)
        const skip = id => conflicted.has(id) || removedFromFolderRef.current.has(id)
        const allSyncFiles = [...filesRef.current, ...closedFilesRef.current.map(entry => entry.file)].filter(file => !skip(file.id))
        const beforeWritten = new Map(syncWrittenRef.current)
        const pushed = await writeToFolder(handle, allSyncFiles, syncWrittenRef.current, syncPathsRef.current)
        await writeAttachmentsToFolder(handle, [...attachmentsRef.current.values()], syncWrittenRef.current).catch(() => {})
        writeSyncState({ name: handle.name, written: syncWrittenRef.current, paths: syncPathsRef.current }).catch(() => {})
        const changedPaths = [...syncWrittenRef.current].filter(([path, value]) => beforeWritten.get(path) !== value).map(([path]) => path)
        const removedNames = [...filesRef.current, ...closedFilesRef.current.map(entry => entry.file)].filter(item => [...pulled.removedIds, ...pulled.removedClosedIds].includes(item.id)).map(item => item.name)
        const skippedFiles = [...filesRef.current, ...closedFilesRef.current.map(entry => entry.file)].filter(item => conflicted.has(item.id)).map(item => item.name)
        const record = { at: Date.now(), name: handle.name, changed: pulled.imported + pulled.updated + pushed, changedFiles: [...new Set([...changedPaths, ...removedNames])], added: pulled.imported, updated: pulled.updated + pushed, removed: pulled.removedIds.length + pulled.removedClosedIds.length, skipped: skippedFiles.length, skippedFiles, conflicts: skippedFiles.length }
        setSyncActivity(previous => { const next = [record, ...previous].slice(0, 30); try { localStorage.setItem('readme-sync-activity', JSON.stringify(next)) } catch { /* optional */ } return next })
        setSyncFolder(current => current && { ...current, status: 'connected', error: '', lastSync: record.at })
        return { ...pulled, pushed }
      } catch (error) {
        const permission = await folderPermission(handle).catch(() => 'denied')
        setSyncFolder(current => current && {
          ...current,
          status: permission === 'granted' ? 'error' : 'needs-permission',
          error: permission === 'granted' ? (error?.message || 'Could not sync with the folder.') : '',
        })
        return null
      } finally {
        setSyncBusy(false)
      }
    })()
    state.running = run
    try { return await run } finally { state.running = null }
  }, [pullFromFolder])
  // Delete permanently: removes files from ReadMe (open or closed) and from the sync folder
  // (only copies nobody changed there). Files opened from disk stay on disk. Asks first in the
  // app's own dialog; the toast offers Undo. `folder` deletes a whole folder (and its empty sub-folders).
  const deleteEntries = useCallback(async (ids, { folder } = {}) => {
    const entries = ids.map(id => {
      const openIndex = files.findIndex(file => file.id === id)
      const closedEntry = closedFiles.find(entry => entry.file.id === id)
      return { id, openIndex, closedEntry, file: openIndex >= 0 ? files[openIndex] : closedEntry?.file }
    }).filter(entry => entry.file)
    const removedFolders = folder ? emptyFolders.filter(item => item === folder || item.startsWith(`${folder}/`)) : []
    if (!entries.length && !removedFolders.length) return
    const syncConnected = Boolean(syncFolder?.handle && syncFolder.status === 'connected')
    const synced = syncConnected ? entries.filter(entry => {
      const path = syncPathsRef.current.get(entry.id) || syncPath(entry.file.name)
      return syncWrittenRef.current.has(path)
    }) : []
    const onDisk = entries.filter(entry => entry.file.diskHandle || diskHandlesRef.current.has(entry.id))
    const count = entries.length
    const details = [
      count > 1 && !folder && `Files: ${entries.slice(0, 10).map(entry => entry.file.name).join(', ')}${count > 10 ? `, and ${count - 10} more` : ''}.`,
      synced.length > 0 && `${synced.length === count && count === 1 ? 'It is' : `${synced.length} ${synced.length === 1 ? 'file is' : 'files are'}`} also deleted from the sync folder “${syncFolder.name}”.`,
      onDisk.length > 0 && `${onDisk.length === count && count === 1 ? 'The file' : `${onDisk.length} ${onDisk.length === 1 ? 'file' : 'files'}`} on your computer ${onDisk.length === 1 ? 'is' : 'are'} not touched.`,
      'You can undo this right after.',
    ].filter(Boolean)
    const ok = await askConfirm(folder ? {
      title: 'Delete folder?', danger: true, icon: Trash2, confirmLabel: count ? `Delete folder and ${count} file${count === 1 ? '' : 's'}` : 'Delete folder',
      message: count ? `Delete “${folder}” and the ${count} file${count === 1 ? '' : 's'} in it permanently?` : `Delete the empty folder “${folder}”?`,
      details,
    } : {
      title: count > 1 ? `Delete ${count} files?` : 'Delete file?', danger: true, icon: Trash2, confirmLabel: 'Delete',
      message: count > 1 ? `Delete these ${count} files permanently?` : `Delete “${entries[0].file.name}” permanently?`,
      details,
    })
    if (!ok) return false
    const openIds = entries.filter(entry => entry.openIndex >= 0).map(entry => entry.id)
    const closedIds = new Set(entries.filter(entry => entry.openIndex < 0).map(entry => entry.id))
    if (openIds.length) closeFiles(openIds, { remember: false })
    if (closedIds.size) setClosedFiles(prev => prev.filter(entry => !closedIds.has(entry.file.id)))
    if (removedFolders.length) setEmptyFolders(list => list.filter(item => !removedFolders.includes(item)))
    markWorkspaceEdit()
    let keptInFolder = 0
    for (const entry of synced) {
      const path = syncPathsRef.current.get(entry.id) || syncPath(entry.file.name)
      const removed = await removeFromFolder(syncFolder.handle, path, syncWrittenRef.current.get(path))
      if (!removed) keptInFolder += 1
      syncWrittenRef.current.delete(path)
      syncPathsRef.current.delete(entry.id)
    }
    if (synced.length) writeSyncState({ name: syncFolder.handle.name, written: syncWrittenRef.current, paths: syncPathsRef.current }).catch(() => {})
    const what = folder ? `folder “${folder}”` : `“${entries[0].file.name}”`
    setToast({
      message: `Deleted ${what}.${keptInFolder ? ` ${keptInFolder === 1 ? 'A copy' : `${keptInFolder} copies`} in the sync folder changed elsewhere, so ${keptInFolder === 1 ? 'it was' : 'they were'} kept.` : ''}`,
      tone: 'info', duration: 8000,
      action: {
        label: 'Undo',
        run: () => {
          markWorkspaceEdit()
          const reopen = entries.filter(entry => entry.openIndex >= 0).sort((a, b) => a.openIndex - b.openIndex)
          if (reopen.length) {
            setFiles(prev => {
              const next = [...prev]
              for (const entry of reopen) if (!next.some(item => item.id === entry.id)) next.splice(Math.min(entry.openIndex, next.length), 0, entry.file)
              return orderPinnedFirst(next)
            })
            setActiveFileId(reopen[0].id)
          }
          const closedBack = entries.filter(entry => entry.openIndex < 0 && entry.closedEntry).map(entry => entry.closedEntry)
          if (closedBack.length) setClosedFiles(prev => [...prev, ...closedBack.filter(entry => !prev.some(item => item.file.id === entry.file.id))])
          if (removedFolders.length) setEmptyFolders(list => [...new Set([...list, ...removedFolders])])
        },
      },
    })
    return true
  }, [files, closedFiles, emptyFolders, syncFolder, closeFiles, markWorkspaceEdit, askConfirm])
  const handleDeleteFile = useCallback(id => deleteEntries([id]), [deleteEntries])

  const [itemOrder, setItemOrder] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('readme-item-order') || '{}')
      return { files: Array.isArray(parsed.files) ? parsed.files : [], folders: Array.isArray(parsed.folders) ? parsed.folders : [] }
    } catch { return { files: [], folders: [] } }
  })
  useEffect(() => {
    try { localStorage.setItem('readme-item-order', JSON.stringify(itemOrder)) } catch { /* optional */ }
  }, [itemOrder])
  // Drag-and-drop order, shared by the Files panel and the Library. A drop reorders what was
  // shown (`displayed`, in on-screen order); those keys then come first in the saved order and
  // everything else keeps its relative order (items are only ever compared with their neighbours
  // in the same folder, or in the Library's "Manual order" list).
  const applyOrder = (saved, displayed, source, target, after) => {
    const base = displayed.includes(source) ? displayed : [...displayed, source]
    const without = base.filter(key => key !== source)
    const at = without.indexOf(target)
    if (at < 0) return saved
    without.splice(at + (after ? 1 : 0), 0, source)
    return [...without, ...saved.filter(key => !without.includes(key))]
  }
  const reorderFileItem = useCallback((sourceId, targetId, placeAfter, displayed = []) => {
    setItemOrder(prev => ({ ...prev, files: applyOrder(prev.files, displayed, sourceId, targetId, placeAfter) }))
  }, [])
  const reorderFolderItem = useCallback((sourcePath, targetPath, placeAfter, displayed = []) => {
    setItemOrder(prev => ({ ...prev, folders: applyOrder(prev.folders, displayed, sourcePath, targetPath, placeAfter) }))
  }, [])

  // ── Library & properties ────────────────────────────────────
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [propertiesFor, setPropertiesFor] = useState(null) // file id
  const libraryDocs = useMemo(() => (libraryOpen ? graphFiles.map(documentInfo) : []), [libraryOpen, graphFiles])
  const openDocument = useCallback(id => {
    if (closedFiles.some(entry => entry.file.id === id)) handleReopenFile(id)
    else handleSelectFile(id)
  }, [closedFiles, handleReopenFile, handleSelectFile])
  /** Changes the content of several documents (open or closed) at once, with an Undo toast. */
  const changeDocuments = useCallback((changes, message) => {
    if (!changes.size) return
    const before = new Map()
    const apply = (map, remember) => {
      setFiles(prev => prev.map(file => {
        if (!map.has(file.id)) return file
        if (remember) before.set(file.id, file.content)
        return { ...file, content: map.get(file.id), updatedAt: Date.now() }
      }))
      setClosedFiles(prev => prev.map(entry => {
        if (!map.has(entry.file.id)) return entry
        if (remember) before.set(entry.file.id, entry.file.content)
        return { ...entry, file: { ...entry.file, content: map.get(entry.file.id), updatedAt: Date.now() } }
      }))
      markWorkspaceEdit()
    }
    apply(changes, true)
    setToast({ message, tone: 'success', duration: 6000, action: { label: 'Undo', run: () => apply(before, false) } })
  }, [markWorkspaceEdit])
  const restoreRecoverySnapshot = useCallback(async (fileId, snapshot) => {
    const file = linkableFiles.find(item => item.id === fileId)
    if (!file || !snapshot) return
    const accepted = await askConfirm({ title: 'Restore this recovery snapshot?', message: `The current version of “${file.name}” will be saved to history first.`, confirmLabel: 'Restore snapshot', icon: History })
    if (!accepted) return
    await takeSnapshot(file.id, file.content, 'Before recovery restore')
    changeDocuments(new Map([[file.id, snapshot.content]]), `Recovered “${file.name}” from an earlier snapshot.`)
    setRecoveryData(null)
  }, [linkableFiles, askConfirm, takeSnapshot, changeDocuments])
  const updateAgendaProperty = useCallback((id, key, value) => {
    const file = linkableFiles.find(item => item.id === id)
    if (!file) return
    const { entries } = readFrontMatter(file.content)
    const existing = entries.find(entry => entry.key?.toLowerCase() === key.toLowerCase())
    const properties = entries.filter(entry => entry.key).map(entry => ({ key: entry.key, type: entry.type, value: entry.value, style: entry.style }))
    const retained = properties.filter(property => property.key.toLowerCase() !== key.toLowerCase())
    if (value !== '' && value != null && value !== false) retained.push({ key: existing?.key || key, type: key === 'reminder' ? 'checkbox' : 'date', value })
    const next = writeFrontMatter(file.content, retained)
    if (next !== file.content) changeDocuments(new Map([[id, next]]), `${key === 'due' ? 'Deadline' : 'Reminder'} updated for “${file.name}”.`)
  }, [linkableFiles, changeDocuments])
  const libraryMove = useCallback(async ids => {
    const raw = await askText({ title: `Move ${ids.length === 1 ? 'document' : `${ids.length} documents`} to a folder`, label: 'Folder (empty for the top level)', placeholder: 'e.g. notes/2026', confirmLabel: 'Move', allowEmpty: true })
    if (raw == null) return
    const folder = cleanFolderName(raw)
    ids.forEach(id => moveFileToFolder(id, folder))
    setToast({ message: `Moved ${ids.length === 1 ? '1 document' : `${ids.length} documents`} to ${folder || 'the top level'}.`, tone: 'success' })
  }, [askText, moveFileToFolder])
  const libraryAddTag = useCallback(async ids => {
    const raw = await askText({ title: 'Add a tag', label: 'Tag (several: separate with commas)', placeholder: 'e.g. work', confirmLabel: 'Add tag' })
    const tags = String(raw ?? '').split(',').map(tag => tag.replace(/^#/, '').trim()).filter(Boolean)
    if (!tags.length) return
    const all = [...files, ...closedFileList]
    const changes = new Map()
    for (const id of ids) {
      const file = all.find(item => item.id === id)
      if (!file) continue
      const next = addTags(file.content, tags)
      if (next !== file.content) changes.set(id, next)
    }
    changeDocuments(changes, `Tagged ${changes.size === 1 ? '1 document' : `${changes.size} documents`} with ${tags.map(tag => `#${tag}`).join(', ')}.`)
  }, [askText, files, closedFileList, changeDocuments])
  const libraryBulkStatus = useCallback(async ids => {
    const status = (await askText({ title: 'Set status', label: 'Status (leave empty to remove)', placeholder: 'draft, review, published…', confirmLabel: 'Apply', allowEmpty: true }))
    if (status == null) return
    const changes = new Map()
    for (const file of [...files, ...closedFileList]) if (ids.includes(file.id)) {
      const { entries } = readFrontMatter(file.content)
      const props = entries.filter(entry => entry.key).map(entry => ({ key: entry.key, type: entry.type, value: entry.value, style: entry.style }))
      const current = props.find(prop => prop.key.toLowerCase() === 'status')
      const next = props.filter(prop => prop.key.toLowerCase() !== 'status')
      if (status.trim()) next.push({ key: current?.key || 'status', type: 'text', value: status.trim() })
      const content = writeFrontMatter(file.content, next)
      if (content !== file.content) changes.set(file.id, content)
    }
    changeDocuments(changes, `Updated status on ${changes.size} document${changes.size === 1 ? '' : 's'}.`)
  }, [askText, files, closedFileList, changeDocuments])
  const libraryBulkProperty = useCallback(async ids => {
    const key = (await askText({ title: 'Set front matter', label: 'Property name', placeholder: 'owner', confirmLabel: 'Next' }))?.trim()
    if (!key) return
    const value = await askText({ title: `Set “${key}”`, label: 'Value (leave empty to remove)', placeholder: 'Value', confirmLabel: 'Apply', allowEmpty: true })
    if (value == null) return
    const changes = new Map()
    for (const file of [...files, ...closedFileList]) if (ids.includes(file.id)) {
      const { entries } = readFrontMatter(file.content)
      const props = entries.filter(entry => entry.key).map(entry => ({ key: entry.key, type: entry.type, value: entry.value, style: entry.style }))
      const existing = props.find(prop => prop.key.toLowerCase() === key.toLowerCase())
      const next = props.filter(prop => prop.key.toLowerCase() !== key.toLowerCase())
      if (value.trim()) next.push({ key: existing?.key || key, type: 'text', value: value.trim() })
      const content = writeFrontMatter(file.content, next)
      if (content !== file.content) changes.set(file.id, content)
    }
    changeDocuments(changes, `Updated “${key}” on ${changes.size} document${changes.size === 1 ? '' : 's'}.`)
  }, [askText, files, closedFileList, changeDocuments])
  const libraryExport = useCallback(async ids => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const chosen = [...files, ...closedFileList].filter(item => ids.includes(item.id))
    for (const file of chosen) zip.file(file.name, file.content)
    zipAttachments(zip, chosen)
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'readme-documents.zip' })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }, [files, closedFileList, zipAttachments])
  const saveProperties = useCallback(async (id, next, message = 'Properties saved.') => {
    const file = files.find(item => item.id === id)
    if (!file) return
    if (id === activeFileId) {
      const ta = textareaRef.current
      if (ta && view !== 'preview' && (ta.applyEdit || (ta instanceof HTMLTextAreaElement && ta.value === file.content))) {
        // One undoable edit: replace only the front matter part that changed.
        let start = 0
        while (start < next.length && next[start] === file.content[start]) start += 1
        let endOld = file.content.length, endNew = next.length
        while (endOld > start && endNew > start && file.content[endOld - 1] === next[endNew - 1]) { endOld -= 1; endNew -= 1 }
        applyTextareaEdit(ta, { from: start, to: endOld, text: next.slice(start, endNew), cursor: start + (endNew - start) })
        setToast({ message, tone: 'success' })
        return
      }
    }
    changeDocuments(new Map([[id, next]]), message)
  }, [files, activeFileId, view, changeDocuments])

  // ── Images panel ────────────────────────────────────────────
  const [imagesOpen, setImagesOpen] = useState(false)
  const allDocuments = useMemo(() => [...files, ...closedFileList], [files, closedFileList])
  const embeddedSummary = useMemo(() => {
    if (!imagesOpen) return { count: 0, docs: 0, bytes: 0 }
    let count = 0, docs = 0, bytes = 0
    for (const doc of allDocuments) {
      const found = embeddedImages(doc.content)
      if (found.length) { docs += 1; count += found.length; bytes += found.reduce((sum, ref) => sum + ref.src.length, 0) }
    }
    return { count, docs, bytes }
  }, [imagesOpen, allDocuments])
  /** Rewrites every document that uses `path` with fn(content, name). */
  const rewriteUsers = useCallback((path, fn, message, undo = true) => {
    const changes = new Map()
    for (const doc of allDocuments) {
      if (!attachmentsUsed(doc.content, doc.name).includes(path)) continue
      const next = fn(doc.content, doc.name)
      if (next !== doc.content) changes.set(doc.id, next)
    }
    if (undo) changeDocuments(changes, message)
    else if (changes.size) {
      setFiles(prev => prev.map(file => (changes.has(file.id) ? { ...file, content: changes.get(file.id), updatedAt: Date.now() } : file)))
      setClosedFiles(prev => prev.map(entry => (changes.has(entry.file.id) ? { ...entry, file: { ...entry.file, content: changes.get(entry.file.id) } } : entry)))
      markWorkspaceEdit()
      setToast({ message, tone: 'success' })
    }
    return changes.size
  }, [allDocuments, changeDocuments, markWorkspaceEdit])
  const imageActions = useMemo(() => ({
    onConvert: async () => {
      // Embedded data URIs → attachments (identical images are stored once).
      const stored = new Map()
      const changes = new Map()
      let count = 0
      for (const doc of allDocuments) {
        const found = embeddedImages(doc.content)
        if (!found.length) continue
        for (const ref of found) {
          if (stored.has(ref.src)) continue
          const name = (ref.alt || ref.id || 'image').replace(/^img-/, '')
          stored.set(ref.src, await addAttachment(dataUrlToBlob(ref.src), `${name}.${extensionFor(ref.type)}`))
          count += 1
        }
        changes.set(doc.id, rewriteImageSources(doc.content, doc.name, ref => (stored.has(ref.src) ? attachmentSrc(stored.get(ref.src)) : null)))
      }
      changeDocuments(changes, `Moved ${count} ${count === 1 ? 'image' : 'images'} out of ${changes.size} ${changes.size === 1 ? 'document' : 'documents'}.`)
    },
    onDescribe: async path => {
      const alt = await askText({ title: 'Describe the image', label: 'Description (alt text), used everywhere this image appears', placeholder: 'e.g. Sales grew 20% in March', confirmLabel: 'Save' })
      if (alt == null) return
      rewriteUsers(path, (content, name) => setAltText(content, name, path, alt), 'Description saved.')
    },
    onRename: async path => {
      const ext = path.split('.').pop()
      const current = path.slice(ATTACHMENT_DIR.length + 1).replace(/\.[^.]+$/, '')
      const raw = await askText({ title: 'Rename image', label: 'Name', initialValue: current, suffix: `.${ext}`, confirmLabel: 'Rename' })
      if (raw == null || !raw.trim() || raw.trim() === current) return
      const record = attachmentsRef.current.get(path)
      if (!record) return
      const target = attachmentPath(`${raw.trim()}.${ext}`, record.type, [...attachmentsRef.current.keys()].filter(item => item !== path))
      await addAttachment(record.blob, '', target)
      await removeAttachment(path)
      rewriteUsers(path, (content, name) => renameAttachmentRefs(content, name, path, target), `Renamed to ${target.slice(ATTACHMENT_DIR.length + 1)}.`, false)
    },
    onReplace: async (path, file) => {
      const blob = dataUrlToBlob(await imageFileToDataUrl(file))
      await addAttachment(blob, '', path)
      setToast({ message: 'Image replaced everywhere it is used.', tone: 'success' })
    },
    onRotate: async path => {
      const record = attachmentsRef.current.get(path)
      if (!record) return
      const bitmap = await createImageBitmap(record.blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.height; canvas.height = bitmap.width
      const context = canvas.getContext('2d')
      context.translate(canvas.width, 0); context.rotate(Math.PI / 2); context.drawImage(bitmap, 0, 0)
      bitmap.close?.()
      const type = /png|webp/.test(record.type) ? record.type : 'image/jpeg'
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.9))
      if (blob) await addAttachment(blob, '', path)
    },
    onCompress: async path => {
      const record = attachmentsRef.current.get(path)
      if (!record) return
      const smaller = dataUrlToBlob(await imageFileToDataUrl(new File([record.blob], path, { type: record.type }), { maxSide: 1600, quality: 0.8 }))
      if (smaller.size < record.size * 0.95) {
        await addAttachment(smaller, '', path)
        setToast({ message: `Image made smaller: ${Math.round(record.size / 1024)} KB → ${Math.round(smaller.size / 1024)} KB.`, tone: 'success' })
      } else setToast({ message: 'This image is already about as small as it can be.', tone: 'success' })
    },
    onDelete: async (path, usedCount) => {
      const ok = await askConfirm({
        title: 'Delete image?', danger: true, icon: Trash2, confirmLabel: 'Delete',
        message: `Delete “${path.slice(ATTACHMENT_DIR.length + 1)}” permanently?`,
        details: usedCount ? [`${usedCount} ${usedCount === 1 ? 'document uses' : 'documents use'} it; ${usedCount === 1 ? 'it' : 'they'} will show “Image not found” instead.`] : [],
      })
      if (ok) await removeAttachment(path)
    },
  }), [allDocuments, addAttachment, removeAttachment, changeDocuments, rewriteUsers, askText, askConfirm])
  // Rename from the Files panel: only the name is editable; the folder and the extension stay.
  const renameFileFromTree = useCallback(async id => {
    const file = files.find(item => item.id === id)
    if (!file) return
    const { dir, stem, ext } = splitFileName(file.name)
    const taken = new Set([...files, ...closedFiles.map(entry => entry.file)].filter(item => item.id !== id).map(item => item.name.toLowerCase()))
    const value = await askText({
      title: 'Rename file', icon: Pencil, label: 'File name', initialValue: stem, confirmLabel: 'Rename',
      prefix: dir || undefined, suffix: ext || undefined,
      hint: ext ? `The ${ext} extension stays the same.` : undefined,
      validate: input => {
        const next = cleanFileStem(input)
        if (!next) return 'Enter a file name.'
        if (taken.has(`${dir}${next}${ext}`.toLowerCase())) return `“${next}${ext}” already exists here.`
        return null
      },
    })
    const next = value == null ? '' : cleanFileStem(value)
    if (next && `${dir}${next}${ext}` !== file.name) handleRenameFile(id, `${dir}${next}${ext}`)
  }, [files, closedFiles, askText, handleRenameFile])
  const handleDeleteFolder = useCallback(path => {
    const ids = [...files, ...closedFiles.map(entry => entry.file)].filter(file => file.name.startsWith(`${path}/`)).map(file => file.id)
    return deleteEntries(ids, { folder: path })
  }, [files, closedFiles, deleteEntries])
  // Reconnect the saved folder once the workspace has loaded (so its files aren't mistaken for new ones).
  const syncStartedRef = useRef(false)
  useEffect(() => {
    if (!workspaceReady || syncStartedRef.current) return undefined
    syncStartedRef.current = true
    let cancelled = false
    readSyncFolder().then(async handle => {
      if (cancelled || !handle) return
      const saved = await readSyncState().catch(() => null)
      if (saved?.name === handle.name && saved.written instanceof Map && saved.paths instanceof Map) {
        syncWrittenRef.current = saved.written
        syncPathsRef.current = saved.paths
      }
      const permission = await folderPermission(handle).catch(() => 'denied')
      setSyncFolder({ handle, name: handle.name, status: permission === 'granted' ? 'connected' : 'needs-permission', error: '', lastSync: null })
      if (permission === 'granted') runFolderSync(handle, { first: true })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [workspaceReady, runFolderSync])
  const connectSyncFolder = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'readme-sync', mode: 'readwrite' })
      if (await folderPermission(handle, true) !== 'granted') throw new Error('Permission to edit the folder was not given.')
      resetSyncState()
      updateAppSetting('workspaceSyncDisabled', false)
      await writeSyncFolder(handle).catch(() => {})
      setSyncFolder({ handle, name: handle.name, status: 'connected', error: '', lastSync: null })
      const result = await runFolderSync(handle, { first: true })
      if (result) setToast({ message: `Syncing with “${handle.name}”: ${result.pushed} file${result.pushed === 1 ? '' : 's'} written${result.imported ? `, ${result.imported} opened from the folder` : ''}.`, tone: 'success', duration: 4500 })
    } catch (error) {
      if (error?.name !== 'AbortError') setToast({ message: error?.message || 'Could not use that folder.', tone: 'warning', duration: 5000 })
    }
  }, [runFolderSync, resetSyncState, updateAppSetting])
  const reconnectSyncFolder = useCallback(async () => {
    if (!syncFolder?.handle) return
    if (await folderPermission(syncFolder.handle, true).catch(() => 'denied') === 'granted') {
      setSyncFolder(current => current && { ...current, status: 'connected' })
      runFolderSync(syncFolder.handle, { first: true })
    }
  }, [syncFolder, runFolderSync])
  const disconnectSyncFolder = useCallback(() => {
    writeSyncFolder(null).catch(() => {})
    resetSyncState()
    setSyncFolder(null)
  }, [resetSyncState])
  // Write changes shortly after editing stops; pick up outside changes when the window regains focus.
  const syncHandle = syncFolder?.status === 'connected' ? syncFolder.handle : null
  useEffect(() => {
    if (!syncHandle) return
    const timer = setTimeout(() => runFolderSync(syncHandle), 1200)
    return () => clearTimeout(timer)
  }, [files, closedFiles, syncHandle, runFolderSync, syncNudge])
  useEffect(() => {
    if (!syncHandle) return
    const onFocus = () => runFolderSync(syncHandle)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [syncHandle, runFolderSync])

  // Cmd/Ctrl+S: save everything open in the app (never the browser's "save page as HTML").
  const handleSaveAll = useCallback(async () => {
    try {
      localStorage.setItem('readme-files', JSON.stringify(files.map(syncableFile)))
      if (activeFileId) localStorage.setItem('readme-active-file', activeFileId)
    } catch { /* quota — IndexedDB below still has it */ }
    let browserSaved = true
    try { await writeWorkspace({ files, activeId: activeFileId, closed: closedFiles }) } catch { browserSaved = false }
    if (syncHandle) await runFolderSync(syncHandle)
    let diskSaved = 0
    const diskFailed = []
    for (const file of files) {
      const handle = diskHandlesRef.current.get(file.id) || file.diskHandle
      if (!handle || file.content === file.diskSavedContent) continue
      try {
        if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted'
          && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('permission')
        const writable = await handle.createWritable()
        await writable.write(file.content)
        await writable.close()
        diskSaved += 1
        setFiles(prev => prev.map(item => (item.id === file.id ? { ...item, diskSavedContent: file.content } : item)))
        takeSnapshot(file.id, file.content, 'Saved to disk')
        handle.getFile?.().then(saved => diskStampRef.current.set(file.id, saved.lastModified)).catch(() => {})
      } catch {
        diskFailed.push(file.name)
      }
    }
    const count = files.length
    if (diskFailed.length) {
      setToast({ message: `Saved in the browser, but couldn't write ${diskFailed.join(', ')} to disk.`, tone: 'warning', duration: 5000 })
    } else if (!browserSaved) {
      setToast({ message: 'Could not save to browser storage. Download a backup to be safe.', tone: 'warning', duration: 5000 })
    } else {
      setToast({ message: `Saved ${count} file${count === 1 ? '' : 's'}${diskSaved ? ` (${diskSaved} written to disk)` : ''}.`, tone: 'success' })
    }
  }, [files, activeFileId, closedFiles, takeSnapshot, syncHandle, runFolderSync])
  useEffect(() => {
    const onKey = event => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSaveAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSaveAll])

  const handleImportUrl = useCallback(async () => {
    const url = await askText({
      title: 'Import from a URL', icon: Globe, label: 'Markdown file or web page URL', placeholder: 'https://example.com/README.md', confirmLabel: 'Import',
      description: 'ReadMe downloads it in your browser. Web pages are converted to Markdown.', hint: 'The server must allow cross-origin (CORS) access.',
      validate: value => { try { return ['http:', 'https:'].includes(new URL(value.trim()).protocol) ? null : 'Use an http or https URL.' } catch { return value.trim() ? 'Enter a full URL, starting with https://' : 'Paste a URL.' } },
    })
    if (!url) return
    try {
      const parsed = new URL(url.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https URL')
      const response = await fetch(parsed.href)
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      let markdown = await response.text()
      let name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || 'remote-document.md')
      // A web page (not a Markdown file): keep its main content, converted to Markdown.
      if (/text\/html/i.test(response.headers?.get?.('content-type') || '') || /^\s*<(!doctype html|html)/i.test(markdown)) {
        const { webPageToMarkdown } = await import('./htmlToMarkdown')
        markdown = webPageToMarkdown(markdown, parsed.href)
        name = name.replace(/\.html?$/i, '') || parsed.hostname
      }
      const id = createFileId()
      markWorkspaceEdit()
      setFiles(prev => [...prev, { id, name: /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`, content: markdown }])
      setActiveFileId(id)
      setMobileTab('preview')
    } catch (error) {
      setToast({ message: `Could not import the URL: ${error.message}. The server must allow cross-origin (CORS) access.`, tone: 'warning', duration: 8000 })
    }
  }, [markWorkspaceEdit, askText])

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
    setAnnotations(prev => [...prev, { id: createFileId(), fileId: activeFileId, quote: annotationText.trim(), note: annotationNote.trim(), color: annotationColor, headingId: activeHeadingId, progress: readProgress, createdAt: Date.now() }])
    window.getSelection()?.removeAllRanges?.()
    setSelectedQuote('')
    setAnnotationOpen(false)
  }, [activeFileId, annotationText, annotationNote, annotationColor, activeHeadingId, readProgress])

  const handleDownload = useCallback(() => {
    if (!activeFile) return
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type: 'text/markdown' })),
      download: fileName || 'document.md',
    })
    a.click(); URL.revokeObjectURL(a.href)
  }, [activeFile, content, fileName])

  // Build a real PDF from the Markdown source (pdfmake) so the output has
  // selectable text and consistent document styling.
  const [pdfExporting, setPdfExporting] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  // Share links + transient toast messages.
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!workspaceReady) return
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    let due = []
    try {
      due = agendaDocuments.filter(doc => {
        if (!doc.reminder || !doc.due || doc.due > today) return false
        const key = `readme-reminder-shown:${doc.id}`
        if (localStorage.getItem(key) === today) return false
        localStorage.setItem(key, today)
        return true
      })
    } catch { due = [] }
    if (due.length) setToast({
      message: due.length === 1 ? `Reminder: “${due[0].title}” is due ${due[0].due === today ? 'today' : 'overdue'}.` : `${due.length} document reminders are due or overdue.`,
      tone: 'info', duration: 9000,
      action: { label: 'Open agenda', run: () => setTasksOpen(true) },
    })
  }, [agendaDocuments, workspaceReady])
  // One-time tips (at most one per session; Settings → Features → Show tips turns them off).
  const tipsQuiet = appSettings.showTips === false || presenting || tourOpen || Boolean(startupNotice)
  const tipCountRef = useRef({ links: null })
  useEffect(() => {
    if (tipsQuiet || !activeFile) return undefined
    const links = (content.match(/\[\[/g) || []).length
    const previousLinks = tipCountRef.current.links
    tipCountRef.current.links = links
    let tip = null
    if (previousLinks != null && links > previousLinks && document.activeElement?.matches?.('textarea.editor-textarea, .cm-content')) tip = 'wiki'
    else if (/^\s*[-*+] \[ \]/m.test(content)) tip = 'tasks'
    else if (files.length + closedFiles.length >= 6) tip = 'library'
    else if (view === 'preview' && !previewEditOn && markdownBody.length > 200) tip = 'editPreview'
    if (!tip) return undefined
    const timer = setTimeout(() => {
      if (!takeTip(tip)) return
      setToast({ message: TIPS[tip], tone: 'success', duration: 9000, action: { label: 'Turn off tips', run: () => updateAppSetting('showTips', false) } })
    }, 1500)
    return () => clearTimeout(timer)
  }, [tipsQuiet, activeFile, content, files.length, closedFiles.length, view, previewEditOn, markdownBody.length, updateAppSetting])
  // A newer ReadMe is out (or a file this older tab needs is gone): offer a reload. Shown after
  // any error message from the action that failed, so it isn't replaced by it.
  useEffect(() => {
    const onUpdate = event => {
      const stale = event.detail?.reason === 'stale-file'
      setTimeout(() => setToast({
        message: stale ? 'ReadMe has been updated. Reload to finish this action — your files are saved.' : 'A new version of ReadMe is ready.',
        tone: stale ? 'warning' : 'info', duration: stale ? 60000 : 20000,
        action: { label: 'Reload', run: () => window.location.reload() },
      }), 0)
    }
    window.addEventListener('readme:update-available', onUpdate)
    return () => window.removeEventListener('readme:update-available', onUpdate)
  }, [])
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), toast.duration ?? 3200)
    return () => clearTimeout(timer)
  }, [toast])
  const handleCopyShareLink = useCallback(async () => {
    if (!activeFile || !content.trim()) return
    try {
      const url = await buildShareUrl(await inlineAttachments(content, fileName ?? ''), fileName)
      await navigator.clipboard.writeText(url)
      const kb = (url.length / 1024).toFixed(1)
      setToast(url.length > 64_000
        ? { message: `Share link copied (${kb} KB). Very long links can be cut off by some chat apps.`, tone: 'warning', duration: 6000 }
        : { message: `Share link copied (${kb} KB). Anyone with the link can read this document.`, tone: 'success' })
    } catch (error) {
      console.error('Share link failed', error)
      setToast({ message: 'Could not create a share link in this browser.', tone: 'warning' })
    }
  }, [activeFile, content, fileName, inlineAttachments])
  const [sharedDoc, setSharedDoc] = useState(null)
  useEffect(() => {
    const load = () => {
      readShareFromHash(window.location.hash)
        .then(doc => { if (doc) setSharedDoc(doc) })
        .catch(() => setToast({ message: 'This share link is damaged or incomplete.', tone: 'warning', duration: 5000 }))
    }
    load()
    window.addEventListener('hashchange', load)
    return () => window.removeEventListener('hashchange', load)
  }, [])
  const closeSharedDoc = useCallback(() => {
    setSharedDoc(null)
    if (window.location.hash.includes('share=')) history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
  const saveSharedCopy = useCallback(() => {
    if (!sharedDoc) return
    markWorkspaceEdit()
    const id = createFileId()
    setFiles(prev => {
      const taken = new Set(prev.map(f => f.name.toLowerCase()))
      const name = taken.has(sharedDoc.name.toLowerCase()) ? makeDuplicateFileName(sharedDoc.name, prev.map(f => f.name)) : sharedDoc.name
      return [...prev, { id, name, content: sharedDoc.content }]
    })
    setActiveFileId(id)
    setActiveHeadingId(null)
    closeSharedDoc()
    setToast({ message: 'Saved a copy to your files.', tone: 'success' })
  }, [sharedDoc, markWorkspaceEdit, closeSharedDoc])

  const handleExportDocx = useCallback(async () => {
    if (!activeFile || !markdownBody.trim()) return
    const baseName = (fileName || 'document').replace(/\.[^.]+$/, '') || 'document'
    try {
      const { exportMarkdownDocx } = await import('./docxExport')
      // Same style and cover / header choices as the PDF dialog.
      let pdfChoices = {}
      try { pdfChoices = JSON.parse(localStorage.getItem('readme-pdf-options') || '{}') || {} } catch { pdfChoices = {} }
      await exportMarkdownDocx(exportBody, { title: headings[0]?.text || baseName, fileName: `${baseName}.docx`, meta: frontmatterMeta.filter(entry => entry.key.toLowerCase() !== 'style'), look: docStyleById(activeDocStyle).docx, options: { cover: Boolean(pdfChoices.cover), header: Boolean(pdfChoices.header) } })
    } catch (error) {
      console.error('Could not generate the Word document', error)
      setToast({ message: 'Could not create the Word document. Please try again.', tone: 'warning' })
    }
  }, [activeFile, markdownBody, exportBody, fileName, headings, frontmatterMeta, activeDocStyle])
  const openPdfDialog = useCallback(() => { if (activeFile && markdownBody.trim()) setPdfDialogOpen(true) }, [activeFile, markdownBody])
  const handleExportPdf = useCallback(async (options) => {
    if (!activeFile || !markdownBody.trim() || pdfExporting) return
    const baseName = (fileName || 'document').replace(/\.[^.]+$/, '') || 'document'
    setPdfExporting(true)
    try {
      const { exportMarkdownPdf } = await import('./pdfExport')
      await exportMarkdownPdf(exportBody, {
        title: headings[0]?.text || baseName,
        fileName: `${baseName}.pdf`,
        meta: frontmatterMeta.filter(entry => entry.key.toLowerCase() !== 'style'),
        options,
        look: docStyleById(options?.style || activeDocStyle).pdf,
      })
      setPdfDialogOpen(false)
    } catch (error) {
      console.error('Could not generate the PDF', error)
      setToast({ message: 'Could not create the PDF. Please try again.', tone: 'warning' })
    } finally {
      setPdfExporting(false)
    }
  }, [activeFile, markdownBody, exportBody, fileName, headings, frontmatterMeta, pdfExporting, activeDocStyle])

  // Presentation as a landscape PDF or a PowerPoint file. `deck` ([{ body, notes }]) is the deck
  // being presented (e.g. bookmarked sections); without it, the whole file split like Present.
  const [slidesExporting, setSlidesExporting] = useState(null)
  const handleExportSlides = useCallback(async (format, deck) => {
    if (!activeFile || !markdownBody.trim() || slidesExporting) return
    const baseName = (fileName || 'presentation').replace(/\.[^.]+$/, '') || 'presentation'
    const slides = deck ?? splitSlides(exportBody, splitOptions(presentationSettings)).map(splitSlideNotes)
    // The slide frame uses the current theme's accent, as in presentation mode.
    const probe = document.createElement('canvas').getContext('2d')
    probe.fillStyle = '#6d28d9'
    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6d28d9'
    const accent = probe.fillStyle
    setSlidesExporting(format)
    try {
      if (format === 'pptx') {
        const { exportPresentationPptx } = await import('./pptxExport')
        await exportPresentationPptx(slides, { title: headings[0]?.text || baseName, fileName: `${baseName}.pptx`, accent, font: docStyleById(activeDocStyle).docx.body })
      } else {
        const { exportPresentationPdf } = await import('./pdfExport')
        await exportPresentationPdf(slides.map(slide => slide.body), { title: headings[0]?.text || baseName, fileName: `${baseName} (slides).pdf`, accent, look: docStyleById(activeDocStyle).pdf })
      }
      setToast({ message: format === 'pptx' ? 'Presentation saved as PowerPoint (.pptx).' : 'Presentation saved as a landscape PDF.', tone: 'success' })
    } catch (error) {
      console.error('Could not export the presentation', error)
      setToast({ message: `Could not create the ${format === 'pptx' ? 'PowerPoint file' : 'PDF'}. Please try again.`, tone: 'warning' })
    } finally {
      setSlidesExporting(null)
    }
  }, [activeFile, markdownBody, exportBody, fileName, headings, presentationSettings, slidesExporting, activeDocStyle])

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
      setToast({ message: 'Could not access the clipboard. Check the browser’s clipboard permission.', tone: 'warning' })
    }
  }, [content])

  // Confluence: storage format (XHTML + ac: macros) as plain text, for Confluence's source /
  // storage editor or its API, plus clean HTML so pasting into the page editor works too.
  const handleCopyConfluence = useCallback(async () => {
    try {
      const { toConfluenceStorage, toConfluenceHtml } = await import('./confluenceExport')
      const storage = toConfluenceStorage(exportContent)
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([toConfluenceHtml(exportContent)], { type: 'text/html' }),
          'text/plain': new Blob([storage], { type: 'text/plain' }),
        })])
      } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(storage)
      else throw new Error('Clipboard is unavailable')
      setCopyConfluenceDone(true)
      setTimeout(() => setCopyConfluenceDone(false), 2000)
      setToast({ message: 'Copied for Confluence. Paste into a page, or into its storage-format (source) editor.', tone: 'success' })
    } catch (error) {
      console.error('Copy failed', error)
      setToast({ message: 'Could not access the clipboard. Check browser clipboard permissions.', tone: 'warning' })
    }
  }, [exportContent])
  const handleExportConfluence = useCallback(async () => {
    const { toConfluenceStorage } = await import('./confluenceExport')
    const docTitle = (fileName ? fileName.replace(/\.[^.]+$/, '') : headings[0]?.text) || 'Document'
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([toConfluenceStorage(exportContent)], { type: 'application/xml' })),
      download: `${docTitle}.confluence.xml`,
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }, [exportContent, fileName, headings])

  const handleCreateFromTemplate = useCallback((tpl) => {
    const folder = cleanFolderName(tpl.folder || '').split('/').filter(part => part && part !== '.' && part !== '..').join('/')
    if (folderDepth(folder) > MAX_FOLDER_DEPTH) {
      setToast({ message: `Template folder can be at most ${MAX_FOLDER_DEPTH} levels deep.`, tone: 'warning' })
      return
    }
    markWorkspaceEdit()
    const id = createFileId()
    const requestedName = [folder, tpl.fileName || 'Untitled.md'].filter(Boolean).join('/')
    const name = uniqueName(requestedName, linkableFiles.map(file => file.name))
    setFiles(prev => [...prev, { id, name, content: tpl.content }])
    setActiveFileId(id)
    setActiveHeadingId(null)
    setShowScrollTop(false)
    if (view === 'preview') setView('split')
    setMobileTab('editor')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [view, markWorkspaceEdit, linkableFiles])

  const handleExportHtml = useCallback(async () => {
    const article = previewScrollRef.current?.querySelector('.book-page')
    if (!article) return
    const docTitle = (fileName ? fileName.replace(/\.[^.]+$/, '') : headings[0]?.text) || 'Document'
    const clone = article.cloneNode(true)
    clone.querySelectorAll('.heading-anchor, .section-toggle, .heading-tools, .section-summary, .code-actions, .book-folio-footer, .focus-section-bar, .summary-card, .table-edit, .frontmatter-edit, .pe-add, .pe-editor').forEach(el => el.remove())
    // Collapsed / focus-hidden sections are part of the document: export everything.
    clone.querySelectorAll('[data-collapsed]').forEach(el => el.removeAttribute('data-collapsed'))
    // Attachment images are in-memory URLs here: embed them so the file stands on its own.
    await Promise.all([...clone.querySelectorAll('img[src^="blob:"]')].map(async img => {
      try { img.src = await blobToDataUrl(await (await fetch(img.src)).blob()) } catch { /* leave it */ }
    }))
    const fontCss = await embeddedFontCss(proseFont)

    const html = `<!doctype html>
<html lang="en"${isDark ? ' class="dark"' : ''}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${docTitle.replace(/</g, '&lt;')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css" />
<style>
  :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
  body { margin: 0; padding: 36px 20px; font-family: ${proseFont}; background: ${isDark ? '#121320' : isSepia ? '#e7e3dc' : '#ebecf6'}; color: ${isDark ? '#d8ddf6' : isSepia ? '#514d46' : '#2f3460'}; line-height: 1.8; }
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
${EXPORT_EXTRA_CSS}
${activeDocStyle !== 'readme' ? docStyleCss() : ''}
${fontCss}
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
  }, [fileName, headings, isDark, isSepia, proseFont, activeDocStyle])

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
    zipAttachments(zip, files)
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'readme-workspace.zip',
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }, [files, zipAttachments])

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
    ...(appInstall.status === 'available' ? [{ id: 'install', label: 'Install ReadMe app', hint: 'App', icon: AppDownload, run: handleInstallApp }] : []),
    { id: 'upload', label: 'Open files…', hint: 'Action', icon: Upload, run: handleOpenDiskFiles },
    { id: 'url-import', label: 'Import Markdown from URL…', hint: 'Action', icon: Globe, run: handleImportUrl },
    ...(activeFile ? [{ id: 'save-in-place', label: 'Save file in place…', hint: 'Disk', icon: Save, run: handleSaveInPlace }] : []),
    { id: 'fullscreen', label: isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen', hint: 'View', icon: isFullscreen ? Minimize2 : Maximize2, run: toggleFullscreen },
    { id: 'reading-font', label: `Next reading font (now ${activeFont.label})`, hint: 'Reading', icon: Type, run: cycleDocFont },
    { id: 'keep-awake', label: keepAwake ? 'Allow screen to sleep' : 'Keep screen awake while reading', hint: 'Reading', icon: keepAwake ? MonitorUp : MonitorDown, run: () => setKeepAwake(value => !value) },
    { id: 'quality', label: 'Check document quality', hint: 'Document', icon: TriangleAlert, run: () => { setQualityOpen(true); if (view === 'editor') setView('split') } },
    ...(files.length > 1 ? [{ id: 'compare', label: 'Compare open files', hint: 'Document', icon: GitCompare, run: () => { setDiffCompareId(null); setDiffOpen(true) } }] : []),
    ...(activeFile && /\|.*\n\s*\|?\s*:?-+/.test(content) ? [{ id: 'format-tables', label: 'Format tables (align pipes)', hint: 'Editor', icon: AlignLeft, run: handleFormatTables }] : []),
    { id: 'global-search', label: 'Search in all files…', hint: shortcut('F', { shift: true }), icon: SearchCode, run: () => setGlobalSearchOpen(true) },
    ...(activeFile ? [{ id: 'preview-edit', label: previewEditOn ? 'Stop editing in the preview' : 'Edit in preview', hint: 'View', icon: Pencil, run: () => { setPreviewEditOn(on => !on); if (view === 'editor') setView('preview') } }] : []),
    { id: 'library', label: 'Library: all documents', hint: 'View', icon: Library, run: () => setLibraryOpen(true) },
    { id: 'check-links', label: 'Check workspace links…', hint: 'Workspace', icon: Link2, run: () => setLinkCheckOpen(true) },
    { id: 'recovery', label: 'Recovery & unsaved changes…', hint: 'Workspace', icon: HardDrive, run: openRecovery },
    { id: 'tour', label: 'Take the tour', hint: 'Help', icon: Sparkles, run: startTour },
    ...(activeFile ? [{ id: 'doc-style', label: 'Document style…', hint: 'Document', icon: Palette, run: () => { if (view === 'editor') setView('split'); setReaderOpen(true) } }] : []),
    { id: 'images', label: 'Images (attachments)', hint: 'View', icon: Images, run: () => setImagesOpen(true) },
    ...(activeFile ? [{ id: 'properties', label: 'Document properties (front matter)', hint: 'Document', icon: SlidersHorizontal, run: () => setPropertiesFor(activeFileId) }] : []),
    { id: 'graph', label: 'Graph of linked documents', hint: 'View', icon: Workflow, run: () => setGraphOpen(true) },
    { id: 'publish-site', label: 'Publish as a website', hint: 'Export', icon: Globe, run: () => setPublishOpen(true) },
    { id: 'tasks', label: 'Tasks & document agenda…', hint: shortcut('K', { shift: true }), icon: ListChecks, run: () => setTasksOpen(true) },
    { id: 'shortcuts', label: 'Keyboard shortcuts', hint: '?', icon: Keyboard, run: () => setShortcutsOpen(true) },
    { id: 'help', label: 'Help: how to use ReadMe', hint: 'Guide', icon: CircleHelp, run: () => setHelpOpen(true) },
    ...(activeFile ? [
      { id: 'history', label: 'Version history…', hint: 'File', icon: History, run: openHistory },
      { id: 'snapshot', label: 'Save a snapshot of this file', hint: 'File', icon: History, run: () => takeSnapshot(activeFile.id, content, 'Manual snapshot').then(list => list && setToast({ message: 'Snapshot saved to version history.', tone: 'success' })) },
    ] : []),
    ...(activeFile ? [{ id: 'find-replace', label: 'Find & replace in editor', hint: shortcut('F', { alt: true }), icon: Replace, run: () => { setFindOpen(true); setFindKey(k => k + 1) } }] : []),
    ...(activeFile && canSummarize ? [{ id: 'summarize', label: 'Summarize this document', hint: 'On-device', icon: ScrollText, run: toggleSummary }] : []),
    ...(activeFile && !hideAi ? [
      { id: 'ai-tools', label: 'AI tools: summarize, translate, proofread, review…', hint: aiAvailable ? 'On-device' : 'Not supported here', icon: Sparkles, run: () => setAiOpen(true) },
      { id: 'ai-review', label: 'Review writing (AI)', hint: 'AI · On-device', icon: ScrollText, run: () => setAiOpen('review') },
    ] : []),
    ...(activeFile ? [{ id: 'present', label: 'Present as slides', hint: 'Reader', icon: Presentation, run: () => openPresentation() }] : []),
    { id: 'file-tree', label: fileTreeOpen ? 'Hide file tree' : 'Show file tree', hint: 'Files', icon: FolderTree, run: () => setFileTreeOpen(open => !open) },
    { id: 'write-readme', label: 'Write a README from a description…', hint: aiWriter ? 'AI' : 'Generator', icon: BookOpenText, run: () => setWriteReadmeOpen(true) },
    { id: 'templates', label: 'Manage templates…', hint: 'Templates', icon: LayoutTemplate, run: () => setTemplatesOpen(true) },
    { id: 'settings', label: 'Settings…', hint: 'App', icon: Settings, run: () => setSettingsOpen('workspace') },
    { id: 'storage', label: 'Storage & backup…', hint: 'Settings', icon: HardDrive, run: () => setSettingsOpen('storage') },
    { id: 'about', label: 'About ReadMe', hint: 'Settings', icon: Info, run: () => setSettingsOpen('about') },
    { id: 'backup', label: 'Back up workspace (.zip)', hint: 'Workspace', icon: DatabaseBackup, run: handleBackup },
    { id: 'restore', label: 'Restore workspace from backup…', hint: 'Workspace', icon: ArchiveRestore, run: () => restoreInputRef.current?.click() },
    ...(headings.length > 0 ? [{ id: 'focus-section', label: focusSection ? 'Exit section focus' : 'Focus on current section', hint: 'Reader', icon: Crosshair, run: focusSection ? exitSectionFocus : startSectionFocus }] : []),
    ...(canReopen ? [{ id: 'reopen', label: 'Reopen closed tab', hint: 'Tabs', icon: RotateCcw, run: handleReopenClosed }] : []),
    ...(activeFile ? [
      { id: 'pin', label: activeFile.pinned ? 'Unpin current tab' : 'Pin current tab', hint: 'Tabs', icon: activeFile.pinned ? PinOff : Pin, run: () => handleTogglePin(activeFile.id) },
      ...(files.length > 1 ? [{ id: 'close-others', label: 'Close other tabs', hint: 'Tabs', icon: X, run: () => handleCloseOthers(activeFile.id) }] : []),
    ] : []),
    { id: 'wide', label: readerPrefs.width === 'full' ? 'Switch to Book page width' : 'Expand to Wide mode', hint: 'Reader', icon: UnfoldHorizontal, run: () => setReaderPrefs(p => ({ ...p, width: p.width === 'full' ? 'book' : 'full' })) },
    { id: 'contrast', label: highContrast ? 'Disable High Contrast' : 'Enable High Contrast', hint: 'Theme', icon: Contrast, run: toggleHighContrast },
    { id: 'theme', label: `Switch to ${themeById(nextTheme(theme, appSettings.extraThemes)).label} mode`, hint: 'Theme', icon: ENABLE_SEPIA_THEME && theme === 'sepia' ? BookOpen : isDark ? Sun : Moon, run: toggleTheme },
    { id: 'sync', label: syncScroll ? 'Disable Synchronized Scroll' : 'Enable Synchronized Scroll', hint: 'Editor', icon: Link2, run: () => setSyncScroll(s => !s) },
    ...(activeFile ? [
      { id: 'dl-md', label: 'Download Markdown (.md)', hint: 'Export', icon: Download, run: handleDownload },
      { id: 'dl-html', label: 'Export Standalone HTML (.html)', hint: 'Export', icon: FileCode2, run: handleExportHtml },
      { id: 'table-editor', label: 'Insert or edit table', hint: 'Edit', icon: Table, run: () => openTableEditor() },
      { id: 'dl-slides-pdf', label: 'Download presentation as PDF (landscape)', hint: 'Export', icon: Presentation, run: () => handleExportSlides('pdf') },
      { id: 'dl-slides-pptx', label: 'Download presentation as PowerPoint (.pptx)', hint: 'Export', icon: Presentation, run: () => handleExportSlides('pptx') },
      { id: 'dl-confluence', label: 'Export for Confluence (storage format XHTML)', hint: 'Export', icon: Code2, run: handleExportConfluence },
      { id: 'copy-confluence', label: 'Copy as XHTML (Confluence)', hint: 'Copy', icon: Copy, run: handleCopyConfluence },
    { id: 'dl-pdf', label: 'Download PDF…', hint: 'Export', icon: FileDown, run: openPdfDialog },
    { id: 'dl-docx', label: 'Export Word Document (.docx)', hint: 'Export', icon: FileText, run: handleExportDocx },
    { id: 'share-link', label: 'Copy share link', hint: 'Share', icon: Share2, run: handleCopyShareLink },
    ] : []),
    ...(files.length > 0 ? [
      { id: 'dl-zip', label: `Export All Files (${files.length}) as ZIP`, hint: 'Export', icon: FileArchive, run: handleExportZip },
    ] : []),
  ], [
    handleNewFile, appInstall.status, handleInstallApp, previewEditOn, activeFileId, startTour, handleOpenDiskFiles, handleImportUrl, readerPrefs.width, highContrast, theme, isDark,
    toggleTheme, toggleHighContrast, syncScroll, activeFile, files.length, view, handleDownload,
    handleExportHtml, handleExportConfluence, handleCopyConfluence, handleExportSlides, openTableEditor, openPdfDialog, handleExportDocx, handleCopyShareLink, handleExportZip, canReopen, handleReopenClosed, handleTogglePin, handleCloseOthers,
    headings.length, focusSection, exitSectionFocus, startSectionFocus, content, handleFormatTables, openRecovery,
    openHistory, takeSnapshot, handleBackup, fileTreeOpen, aiAvailable, canSummarize, toggleSummary, aiWriter, hideAi, appSettings.extraThemes, activeFont.label, cycleDocFont, handleSaveInPlace, isFullscreen, keepAwake, toggleFullscreen, openPresentation,
  ])

  const qualityIssues = useMemo(() => {
    const base = analysis.qualityIssues ?? []
    const current = failedImages.key === `${activeFileId}:${content.length}` ? failedImages.srcs : []
    if (!current.length) return base
    const lines = content.split('\n')
    const extra = current.flatMap((src, index) => {
      const lineIndex = lines.findIndex(text => text.includes(src))
      return src.startsWith('data:') ? [] : [{
        id: `image-failed-${index}`, type: 'image-failed', line: lineIndex + 1 || 1,
        message: `Image “${src.length > 60 ? `${src.slice(0, 57)}…` : src}” could not be loaded.`,
        suggestion: 'Check the URL or path, or embed the image by pasting it into the editor.',
      }]
    })
    return [...base, ...extra].sort((a, b) => a.line - b.line)
  }, [analysis.qualityIssues, failedImages, activeFileId, content])
  const wordCount   = analysis.wordCount
  const lineCount   = analysis.lineCount
  const readingTime = useMemo(() => Math.max(1, Math.ceil(wordCount / 220)), [wordCount])
  const minutesLeft = Math.max(1, Math.ceil(readingTime * (1 - readProgress / 100)))
  // Heading trail (H1 › H2 › H3) leading to the heading currently being read.
  const headingTrail = useMemo(() => {
    const index = headings.findIndex(heading => heading.id === activeHeadingId)
    if (index === -1) return []
    const trail = []
    for (let i = 0; i <= index; i += 1) {
      const heading = headings[i]
      while (trail.length && trail[trail.length - 1].level >= heading.level) trail.pop()
      trail.push(heading)
    }
    return trail
  }, [headings, activeHeadingId])

  const showEditor  = view !== 'preview'
  const showPreview = view !== 'editor'
  const editorWidth  = VIEW_MODES.find(v => v.id === view)?.edW ?? '50%'
  const previewWidth = VIEW_MODES.find(v => v.id === view)?.pvW ?? '50%'

  useEffect(() => { setTocVisible(view === 'preview' || view === 'focus') }, [view])

  return (
    <AttachmentContext.Provider value={attachmentContext}>
    <IconStyleContext.Provider value={smallIconStyle}>
    <LiteContext.Provider value={appSettings.lite}>
    <CodeThemeContext.Provider value={highContrast ? null : theme}>
    <div className="wco-titlebar no-print" aria-hidden="true"><span>ReadMe</span></div>
    <div
      ref={appRef}
      className="h-screen flex flex-col app-shell overflow-hidden anim-fade-in"
      data-density={uiDensity}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* ── Drag overlay ──────────────────────────────── */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center anim-drop-in"
          style={{ background: 'color-mix(in srgb, var(--accent) 7%, transparent)', backdropFilter: 'blur(8px)' }}>
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
        <div className="px-4 sm:px-5 h-14 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
          {/* Logo */}
          <div className="flex items-center shrink-0">
            <div className="flex items-center gap-2.5 select-none">
              <div className="w-7 h-7 rounded-lg logo-glow flex items-center justify-center">
                <FileText size={14} variant="filled" className="text-white" />
              </div>
              <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-1)' }}>
                Read<span className="brand-accent" style={{ color: 'var(--accent)' }}>Me</span>
              </span>
            </div>
          </div>
          <div className="justify-self-center">
            <PillSwitcher view={view} onChange={setView} onPresent={() => openPresentation()} canPresent={Boolean(activeFile && markdownBody.trim())}
              presentationSettings={presentationSettings} onPresentationSettings={setPresentationSettings} />
          </div>

          <div className="flex items-center gap-1 justify-self-end shrink-0">
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,.docx,.html,.htm" multiple className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
            <NewFileButton onNew={handleNewFile} onTemplate={handleCreateFromTemplate} templates={allTemplates} onManageTemplates={() => setTemplatesOpen(true)} onWriteReadme={() => setWriteReadmeOpen(true)} />
            <UploadMenuButton onOpen={handleOpenDiskFiles} onImportUrl={handleImportUrl} />
            <DownloadMenuButton
              disabled={!activeFile}
              canExportPdf={Boolean(activeFile && content.trim())}
              fileCount={files.length}
              onDownloadMd={handleDownload}
              onExportPdf={openPdfDialog}
              onExportHtml={handleExportHtml}
              onExportDocx={handleExportDocx}
              onExportConfluence={handleExportConfluence}
              onExportSlides={handleExportSlides}
              onCopyShareLink={handleCopyShareLink}
              onExportZip={handleExportZip}
              onPublishSite={() => setPublishOpen(true)}
              onInstallApp={appInstall.status === 'available' ? handleInstallApp : undefined}
              onBackup={handleBackup}
              onRestore={() => restoreInputRef.current?.click()}
              onStorage={() => setSettingsOpen('storage')}
              onSaveInPlace={handleSaveInPlace}
            />
            <button onClick={toggleFullscreen} data-tooltip={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="btn-icon hidden sm:flex">
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <HeaderViewMenu
              items={[
                { id: 'awake', label: 'Keep screen awake while reading', icon: keepAwake ? MonitorUp : MonitorDown, run: () => setKeepAwake(value => !value), checked: keepAwake },
                { id: 'contrast', label: 'High contrast', icon: Contrast, run: toggleHighContrast, checked: highContrast },
              ]}
              extra={(
                <>
                  <div className="view-menu-select-row">
                    <span className="view-menu-icon" aria-hidden="true"><Type size={15} /></span>
                    <span className="view-menu-select-label">Reading font</span>
                    <PickerDropdown label="Reading font" value={readerPrefs.fontIndex} width={240}
                      options={fontOptions()} onChange={index => setReaderPrefs(p => ({ ...p, fontIndex: index }))} className="view-menu-picker"
                      disabled={activeDocStyle !== 'readme'} />
                  </div>
                  <div className="view-menu-select-row">
                    <span className="view-menu-icon" aria-hidden="true"><Palette size={15} /></span>
                    <span className="view-menu-select-label">Theme</span>
                    <PickerDropdown label="Theme" value={theme} width={200} className="view-menu-picker"
                      options={availableThemes(appSettings.extraThemes).map(item => ({ value: item.id, label: item.label, icon: <ThemeIcon id={item.id} /> }))}
                      onChange={chooseTheme} />
                  </div>
                </>
              )}
            />
            {!appSettings.workspaceSyncDisabled && (() => {
              const conflictCount = Object.values(diskConflicts).filter(item => item.source === 'folder').length
              const state = !syncFolder ? 'unconnected' : syncFolder.status !== 'connected' ? syncFolder.status : conflictCount ? 'conflict' : syncBusy ? 'syncing' : 'synced'
              const label = !syncFolder
                ? 'No workspace folder connected — click to set up or disable'
                : {
                    synced: `Synced with “${syncFolder.name}”${syncFolder.lastSync ? ` at ${new Date(syncFolder.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`,
                    syncing: `Syncing with “${syncFolder.name}”…`,
                    conflict: `${conflictCount} file${conflictCount === 1 ? '' : 's'} changed in “${syncFolder.name}” and here — choose a version`,
                    'needs-permission': `Sync paused: allow access to “${syncFolder.name}” again`,
                    error: `Sync error: ${syncFolder.error || 'could not sync'}`,
                  }[state]
              return (
                <button type="button" onClick={() => setSettingsOpen('workspace')} className={`btn-icon sync-status is-${state}`} data-tooltip={label} aria-label={label}>
                  <FolderSync size={15} />
                  <span className="sync-status-dot" aria-hidden="true" />
                </button>
              )
            })()}
            <button type="button" onClick={() => setSettingsOpen('workspace')} className="btn-icon" data-tooltip="Settings" aria-label="Settings">
              <Settings size={15} />
            </button>
            <button type="button" onClick={() => setHelpOpen(true)} className="btn-icon tooltip-end" data-tooltip="How to use ReadMe" aria-label="Help: how to use ReadMe" data-tour="help">
              <CircleHelp size={15} />
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
        onDuplicate={handleDuplicateFile}
        onCompare={withId => { setDiffCompareId(withId ?? null); setDiffOpen(true) }}
        recentIds={recentIds}
        canReopen={canReopen}
        onReorder={handleReorderFiles}
        onTogglePin={handleTogglePin}
        onSetColor={handleSetFileColor}
        onCloseOthers={handleCloseOthers}
        onCloseToRight={handleCloseToRight}
        onRevealOutline={handleRevealOutline}
        onDownload={handleDownloadFile}
        onReopenClosed={handleReopenClosed}
        onDelete={handleDeleteFile}
        fileTreeOpen={fileTreeOpen}
        onToggleFileTree={() => setFileTreeOpen(open => !open)}
        onOpenTasks={() => setTasksOpen(true)}
        onOpenLibrary={() => setLibraryOpen(true)}
        tasksDueCount={tasksDueCount}
        searchValue={cmdQuery}
        onSearchChange={value => { setCmdQuery(value); setCmdOpen(true) }}
        onSearchFocus={() => setCmdOpen(true)}
        onOpenCommandPalette={() => setCmdOpen(true)}
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
        {fileTreeOpen && (
          <FileTree
            files={files}
            closedFiles={closedFiles}
            emptyFolders={emptyFolders}
            activeFileId={activeFileId}
            collapsed={treeCollapsed}
            onToggleFolder={path => setTreeCollapsed(list => (list.includes(path) ? list.filter(item => item !== path) : [...list, path]))}
            onSelect={handleSelectFile}
            onReopen={handleReopenFile}
            onForget={handleForgetClosed}
            onDelete={handleDeleteFile}
            onDeleteClosed={ids => deleteEntries(ids)}
            onMoveFile={moveFileToFolder}
            onNewFile={createFileInFolder}
            onNewFolder={createFolder}
            onRenameFolder={renameFolder}
            onCloseFolder={closeFolder}
            onDeleteFolder={handleDeleteFolder}
            onNewSubfolder={createSubfolder}
            onRenameFile={renameFileFromTree}
            onTogglePin={handleTogglePin}
            canPin={files.filter(file => file.pinned).length < MAX_PINNED}
            fileOrder={itemOrder.files}
            folderOrder={itemOrder.folders}
            onReorderFile={reorderFileItem}
            onReorderFolder={reorderFolderItem}
            onClose={() => setFileTreeOpen(false)}
          />
        )}
        {!activeFile ? (
          <EmptyWorkspace
            templates={allTemplates}
            canReopen={canReopen}
            onNew={handleNewFile}
            onOpen={handleOpenDiskFiles}
            onImportUrl={handleImportUrl}
            onReopen={handleReopenClosed}
            onRestore={() => restoreInputRef.current?.click()}
            onTemplate={handleCreateFromTemplate}
            onWriteReadme={() => setWriteReadmeOpen(true)}
            onTour={startTour}
          />
        ) : (
          <>
            <div className="flex-1 flex min-w-0 min-h-0">
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
                onOpenTable={() => openTableEditor()}
                templates={allTemplates}
                onManageTemplates={() => setTemplatesOpen(true)}
                onFindReplace={() => { setFindOpen(true); setFindKey(k => k + 1) }}
                onWriteReadme={() => setWriteReadmeOpen(true)}
                aiHidden={hideAi}
                aiBusy={Boolean(readmeWriting)}
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
                  <EditorOptions prefs={editorPrefs} onChange={setEditorPrefs} />
                  <span style={{ fontSize: 10, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                    {lineCount} lines ·
                  </span>
                  <WritingGoal
                    words={wordCount}
                    goal={activeFile?.wordGoal || 0}
                    sessionWords={activeWritingStats ? currentWords - activeWritingStats.baseWords : 0}
                    activeMs={activeWritingStats?.activeMs || 0}
                    onGoalChange={handleSetWordGoal}
                  />
                  <button type="button" onClick={openHistory} data-tooltip="Version history" aria-label="Version history"
                    className="cursor-pointer transition-colors history-trigger editor-icon-btn">
                    <History size={11} />
                  </button>
                  <button onClick={handleClearEditor} data-tooltip="Clear editor" aria-label="Clear editor"
                    className="cursor-pointer transition-colors editor-icon-btn is-danger"
                    style={{ color: 'var(--text-4)' }}
                    onMouseOver={e => e.currentTarget.style.color = '#f38ba8'}
                    onMouseOut={e  => e.currentTarget.style.color = 'var(--text-4)'}>
                    <X size={11} />
                  </button>
                </div>
              </div>

              {readmeWriting?.fileId === activeFileId && (
                <div className="ai-writing-banner no-print" role="status" aria-live="polite">
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  <span>
                    {readmeWriting.progress != null
                      ? `Downloading the on-device model… ${Math.round(readmeWriting.progress * 100)}%`
                      : readmeWriting.preparing
                        ? 'Preparing the on-device writer… the first use downloads it, which can take a few minutes.'
                        : 'Writing your README…'}
                  </span>
                  {readmeWriting.ai && !readmeWriting.streaming && (
                    <button type="button" onClick={() => { readmeQuickRef.current = true; readmeAbortRef.current?.abort() }}
                      title="Skip the AI and build the README from your description now">Use quick version</button>
                  )}
                  <button type="button" onClick={() => readmeAbortRef.current?.abort()}>Stop</button>
                </div>
              )}
              {diskConflicts[activeFileId] && (
                <div className="disk-conflict no-print" role="alert">
                  <FileWarning size={15} aria-hidden="true" />
                  {diskConflicts[activeFileId].source === 'folder'
                    ? <span><strong>{activeFile.name}</strong> was changed in the sync folder and here. Which version should be kept?</span>
                    : <span><strong>{activeFile.name}</strong> was changed outside ReadMe while you have unsaved edits.</span>}
                  <span className="disk-conflict-actions">
                    <button type="button" onClick={() => resolveDiskConflict(activeFileId, 'reload')}>{diskConflicts[activeFileId].source === 'folder' ? 'Use folder version' : 'Reload from disk'}</button>
                    <button type="button" onClick={() => resolveDiskConflict(activeFileId, 'compare')}>Compare</button>
                    <button type="button" onClick={() => resolveDiskConflict(activeFileId, 'keep')}>Keep mine</button>
                  </span>
                </div>
              )}
              {findOpen && (
                <FindReplacePanel
                  key={findKey}
                  content={content}
                  editorRef={textareaRef}
                  files={files}
                  activeFileId={activeFileId}
                  initialQuery={(() => {
                    const ta = textareaRef.current
                    const selected = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : ''
                    return selected && !selected.includes('\n') ? selected : ''
                  })()}
                  onSelectMatch={selectEditorMatch}
                  onReplaceCurrent={replaceEditorRange}
                  onReplaceAllHere={(regex, replacement, useRegex) => {
                    const count = replaceAllInActive(regex, replacement, useRegex)
                    setToast({ message: count ? `Replaced ${count} match${count === 1 ? '' : 'es'}.` : 'Nothing to replace.', tone: count ? 'success' : 'info' })
                  }}
                  onReplaceAllFiles={async (regex, replacement, useRegex) => {
                    let total = 0
                    let changedFiles = 0
                    const updates = new Map()
                    for (const file of files) {
                      if (file.id === activeFileId) continue
                      const { text, count } = replaceAllIn(file.content, regex, replacement, useRegex)
                      if (!count) continue
                      await takeSnapshot(file.id, file.content, 'Before replace all')
                      updates.set(file.id, text)
                      total += count
                      changedFiles += 1
                    }
                    if (findMatches(content, regex).length) {
                      await takeSnapshot(activeFileId, content, 'Before replace all')
                      total += replaceAllInActive(regex, replacement, useRegex)
                      changedFiles += 1
                    }
                    if (updates.size) {
                      markWorkspaceEdit()
                      setFiles(prev => prev.map(file => (updates.has(file.id) ? { ...file, content: updates.get(file.id) } : file)))
                    }
                    setToast({ message: total ? `Replaced ${total} match${total === 1 ? '' : 'es'} in ${changedFiles} file${changedFiles === 1 ? '' : 's'} (previous versions are in history).` : 'Nothing to replace.', tone: total ? 'success' : 'info', duration: 5000 })
                  }}
                  onClose={() => { setFindOpen(false); textareaRef.current?.focus() }}
                />
              )}

              {/* Editor host: slash commands listen here for both editor engines */}
              <div
                className="editor-pane-host flex-1 min-h-0 flex flex-col"
                onKeyDownCapture={handleEditorPaneKeyDown}
                onInput={refreshSlash}
                onKeyUp={event => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key) || !slash) refreshSlash() }}
                onMouseUp={refreshSlash}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setSlash(null); setWiki(null) } }}
              >
              {/* Editor: CodeMirror (opt-in) or a plain textarea */}
              {editorPrefs.engine === 'code' ? (
                <div className="flex-1 min-h-0 overflow-hidden grid-pattern code-editor-pane" style={{ background: 'var(--bg-editor)' }}>
                  <CodeEditor
                    key={activeFileId}
                    value={content}
                    onChange={updateActiveContent}
                    onScroll={handleSyncEditorScroll}
                    onImageFiles={files => insertImages(files, textareaRef.current)}
                    editorRef={textareaRef}
                    placeholder={'# Start typing Markdown…\n\nOr drag & drop .md files anywhere. Paste or drop images to embed them.'}
                    keymapMode={editorPrefs.keymap}
                    showLineNumbers={editorPrefs.lineNumbers}
                    syntaxColors={editorPrefs.syntaxColors}
                    sectionState={editorSectionState}
                    onSectionToggle={handleEditorSectionToggle}
                  />
                </div>
              ) : (
              <div
                className="flex-1 overflow-auto grid-pattern"
                style={{ background: 'var(--bg-editor)' }}
              >
                <textarea
                  ref={textareaRef}
                  onScroll={handleSyncEditorScroll}
                  className="editor-textarea"
                  data-file-id={activeFileId ?? ''}
                  onChange={e => updateActiveContent(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  onPaste={handleEditorPaste}
                  onDrop={handleEditorDrop}
                  placeholder={'# Start typing Markdown…\n\nOr drag & drop .md files anywhere. Paste or drop images to embed them. Type / for blocks.'}
                  spellCheck={false}
                />
              </div>
              )}
              </div>
              {wiki && (
                <SlashMenu
                  commands={wikiSuggestions}
                  highlight={Math.min(wiki.highlight, Math.max(0, wikiSuggestions.length - 1))}
                  rect={wiki.rect}
                  query={wiki.query}
                  label="Link to a document"
                  title={wiki.heading == null ? (wiki.file ? `Link to “${wiki.file}”` : 'Link to a document') : 'Link to a heading'}
                  emptyText={wiki.heading == null ? 'No matching documents — finish typing to link to a new one' : 'No matching headings'}
                  hint="↑↓ to choose · Enter to link · Esc to dismiss"
                  onPick={insertWikiLink}
                  onHover={index => setWiki(current => current && { ...current, highlight: index })}
                />
              )}
              {slash && (
                <SlashMenu
                  commands={slashCommands}
                  highlight={Math.min(slash.highlight, Math.max(0, slashCommands.length - 1))}
                  rect={slash.rect}
                  query={slash.query}
                  onPick={insertSlashCommand}
                  onHover={index => setSlash(current => current && { ...current, highlight: index })}
                />
              )}
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
              <div className={`no-print shrink-0 flex items-center justify-between gap-3 px-4 py-1.5 surface-toolbar relative reader-preview-toolbar${view === 'split' || view === 'focus' ? ' is-icons-only' : ''}`}>
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
                    <span className="status-badge" title={`${readProgress}% read · ~${minutesLeft} of ${readingTime} min left`}>
                      <span className="tabular-nums">{readProgress}%</span><span className="reader-toolbar-label"> · </span>
                      <span className="reader-toolbar-full-time reader-toolbar-label">{readProgress >= 99 ? 'Finished' : `~${minutesLeft} min left`}</span>
                      <span className="reader-toolbar-compact-time">{readProgress >= 99 ? 'Done' : `~${minutesLeft}m`}</span>
                    </span>
                  )}
                  <div className="relative quality-control">
                    <button
                      type="button"
                      onClick={() => setQualityOpen(open => !open)}
                      className="btn-icon !p-1 quality-trigger"
                      data-tooltip={`Document checks: ${qualityIssues.length} issues`}
                      aria-label={`Document quality checks, ${qualityIssues.length} issues`}
                      aria-expanded={qualityOpen}
                    >
                      <TriangleAlert size={12} />
                      {qualityIssues.length > 0 && <span>{qualityIssues.length}</span>}
                    </button>
                    {qualityOpen && <DocumentQualityPopover issues={qualityIssues} onClose={() => setQualityOpen(false)} onFix={handleQualityFix} onGoToLine={goToEditorLine} />}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewEditOn(on => !on)}
                    disabled={!activeFile}
                    aria-pressed={previewEditOn}
                    data-tooltip={previewEditOn ? 'Stop editing in the preview' : 'Edit in preview: click any paragraph, heading or list item to change it'}
                    aria-label="Edit in preview"
                    className={`btn-icon !p-1 disabled:opacity-40${previewEditOn ? ' is-active' : ''}`}
                    style={{ color: previewEditOn ? 'var(--accent)' : 'var(--text-4)', background: previewEditOn ? 'var(--accent-soft)' : 'transparent' }}
                  >
                    <Pencil size={12} />
                    {view === 'preview' && <span className="reader-toolbar-label text-[10px] font-medium whitespace-nowrap">{previewEditOn ? 'Editing' : 'Edit'}</span>}
                  </button>
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
                  <div className="relative reader-settings-control" ref={annotationControlRef}>
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
                      <div className="reader-popover anim-drop-in no-print" role="dialog" aria-label={selectedQuote ? 'Save highlight or note' : 'Highlights and notes'} style={{ right: 0, top: 'calc(100% + 8px)', width: 300 }}>
                        <button type="button" className="btn-icon !p-1 annotation-close" onClick={() => setAnnotationOpen(false)}
                          aria-label="Close highlights and notes" data-tooltip="Close (Esc)">
                          <X size={12} />
                        </button>
                        {selectedQuote ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Save highlight or note</div>
                            <div className="text-[11px] line-clamp-3 rounded p-2" style={{ color: 'var(--text-2)', background: 'var(--bg-editor)' }}>{selectedQuote}</div>
                            <div className="annotation-colors" role="radiogroup" aria-label="Highlight colour">
                              {ANNOTATION_COLORS.map(color => (
                                <button key={color.id} type="button" role="radio" aria-checked={annotationColor === color.id} aria-label={color.label}
                                  title={color.label} className={`annotation-color${annotationColor === color.id ? ' is-active' : ''}`}
                                  style={{ background: color.swatch }} onClick={() => setAnnotationColor(color.id)} />
                              ))}
                            </div>
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
                                    else previewScrollRef.current?.scrollTo({ top: previewScrollRef.current.scrollHeight * item.progress / 100, behavior: scrollBehavior() })
                                  }}><span className="line-clamp-3"><span className="annotation-dot" style={{ background: (ANNOTATION_COLORS.find(color => color.id === item.color) ?? ANNOTATION_COLORS[0]).swatch }} aria-hidden="true" />“{item.quote}”</span>{item.note && <span className="block mt-1 opacity-80">{item.note}</span>}</button>
                                  <button className="mt-1 opacity-60 hover:opacity-100" onClick={() => setAnnotations(prev => prev.filter(value => value.id !== item.id))}>Remove</button>
                                </div>
                              ))}
                              {!annotations.some(item => item.fileId === activeFileId) && <EmptyState compact icon={Highlighter} title="No highlights yet" text="Select text in the page, then choose the highlighter to save it here." />}
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
                    aria-label={readerPrefs.width === 'full' ? 'Restore book page width' : 'Expand to full width'}
                    aria-pressed={readerPrefs.width === 'full'}
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
                  {canSummarize && markdownBody.trim() && (
                    <button
                      type="button"
                      onClick={toggleSummary}
                      data-tooltip={activeSummary?.visible ? 'Hide summary' : 'Summarize this document (on-device)'}
                      aria-label={activeSummary?.visible ? 'Hide summary' : 'Summarize document'}
                      aria-pressed={Boolean(activeSummary?.visible)}
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                      style={{
                        fontSize: 10, fontWeight: 500,
                        color: activeSummary?.visible ? 'var(--accent)' : 'var(--text-4)',
                        background: activeSummary?.visible ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      {activeSummary?.status === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <ScrollText size={11} />}
                      <span className="hidden xl:inline reader-toolbar-label">Summarize</span>
                    </button>
                  )}
                  {markdownBody.trim() && !hideAi && (
                    <button
                      type="button"
                      onClick={() => setAiOpen(true)}
                      data-tooltip="On-device AI: summarize, translate, proofread"
                      aria-label="AI tools"
                      data-tour="ai"
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                      style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-4)' }}
                    >
                      <Sparkles size={11} />
                      <span className="hidden xl:inline reader-toolbar-label">AI</span>
                    </button>
                  )}
                  {markdownBody.trim() && (
                    <button
                      type="button"
                      onClick={() => openPresentation()}
                      data-tooltip="Present as slides (one per heading)"
                      aria-label="Present document as slides"
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                      style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-4)' }}
                    >
                      <Presentation size={11} />
                      <span className="hidden xl:inline reader-toolbar-label">Present</span>
                    </button>
                  )}
                  {headings.length > 0 && (
                    <button
                      type="button"
                      onClick={focusSection ? exitSectionFocus : startSectionFocus}
                      data-tooltip={focusSection ? 'Show the whole document' : 'Focus on one section at a time'}
                      aria-label={focusSection ? 'Exit section focus' : 'Focus on section'}
                      aria-pressed={Boolean(focusSection)}
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                      style={{
                        fontSize: 10, fontWeight: 500,
                        color: focusSection ? 'var(--accent)' : 'var(--text-4)',
                        background: focusSection ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      <Crosshair size={11} />
                      <span className="hidden lg:inline reader-toolbar-label">Section</span>
                    </button>
                  )}
                  {headings.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllSections}
                      data-tooltip={sectionCollapse.mode === 'collapsed' ? 'Expand all sections' : 'Collapse all sections'}
                      aria-label={sectionCollapse.mode === 'collapsed' ? 'Expand all sections' : 'Collapse all sections'}
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                      style={{
                        fontSize: 10, fontWeight: 500,
                        color: sectionCollapse.mode === 'collapsed' ? 'var(--accent)' : 'var(--text-4)',
                        background: sectionCollapse.mode === 'collapsed' ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      {sectionCollapse.mode === 'collapsed' ? <ChevronsUpDown size={11} /> : <ChevronsDownUp size={11} />}
                      <span className="hidden md:inline reader-toolbar-label">{sectionCollapse.mode === 'collapsed' ? 'Expand all' : 'Collapse all'}</span>
                    </button>
                  )}
                  {markdownBody.trim() && (
                    <div className="relative">
                      <button
                        ref={filterButtonRef}
                        type="button"
                        onClick={event => { const anchor = event.currentTarget; setFilterMenuOpen(open => (open ? null : filterMenuPosition(anchor))) }}
                        data-tooltip={contentFilter ? `Showing: ${filterLabel(contentFilter)}` : 'Filter content (headings, tables, code…)'}
                        aria-label="Filter content"
                        aria-haspopup="menu"
                        aria-expanded={Boolean(filterMenuOpen)}
                        className="flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                        style={{
                          fontSize: 10, fontWeight: 500,
                          color: contentFilter || filterMenuOpen ? 'var(--accent)' : 'var(--text-4)',
                          background: contentFilter || filterMenuOpen ? 'var(--accent-soft)' : 'transparent',
                        }}
                      >
                        <Filter size={11} />
                        <span className="hidden lg:inline reader-toolbar-label">{contentFilter ? filterLabel(contentFilter) : 'Filter'}</span>
                      </button>
                      {filterMenuOpen && (
                        <FilterMenu anchorRef={filterButtonRef} position={filterMenuOpen} value={contentFilter}
                          onPick={value => { setContentFilter(value); setFilterMenuOpen(null) }}
                          onClose={closeFilterMenu} />
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setSearchOpen(s => !s)
                      requestAnimationFrame(() => searchInputRef.current?.focus())
                    }}
                    data-tooltip={`Find in document (${shortcut('F')})`}
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
                      aria-expanded={readerOpen}
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
                        docStyle={activeFile ? activeDocStyle : null}
                        docStyleExplicit={docStyleExplicit}
                        defaultDocStyle={appSettings.defaultDocStyle}
                        onDocStyle={activeFile ? id => {
                          // Saved in the document's front matter (one undoable edit); null = use the default.
                          const props = readFrontMatter(content).entries.filter(entry => entry.key && entry.key.toLowerCase() !== 'style').map(({ key, type, value, style }) => ({ key, type, value, style }))
                          if (id) props.push({ key: 'style', type: 'text', value: id })
                          const next = writeFrontMatter(content, props)
                          if (next !== content) saveProperties(activeFileId, next, id ? `Style: ${docStyleById(id).label}.` : 'Using the default style.')
                        } : undefined}
                        density={uiDensity}
                        onDensityChange={setUiDensity}
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
                  <button onClick={handleCopyConfluence}
                    data-tooltip={copyConfluenceDone ? 'Copied' : 'Copy as XHTML (Confluence)'}
                    aria-label={copyConfluenceDone ? 'Copied' : 'Copy as XHTML (Confluence)'}
                    className="reader-toolbar-copy flex shrink-0 items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                    style={{ fontSize: 10, fontWeight: 500, color: copyConfluenceDone ? '#40a02b' : 'var(--text-4)' }}>
                    {copyConfluenceDone ? <Check size={11} /> : <Code2 size={11} />}
                    <span className="hidden sm:inline reader-toolbar-label">{copyConfluenceDone ? 'Copied!' : 'Copy XHTML'}</span>
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
                  className={`shrink-0 overflow-y-auto surface-toc toc-panel${tocResizing ? ' is-resizing' : ''}`}
                  style={{
                    width: tocVisible ? tocWidth : 0,
                    opacity: tocVisible ? 1 : 0,
                    overflow: tocVisible ? 'auto' : 'hidden',
                    transition: tocResizing ? 'none' : 'width .25s cubic-bezier(.4,0,.2,1), opacity .2s',
                  }}
                >
                  {tocVisible && (
                    <div className="py-3 px-2">
                      <TocSidebar headings={headings} activeId={activeHeadingId} onNavigate={navigateToHeading}
                        bookmarks={activeBookmarkIds} onToggleBookmark={toggleSectionBookmark}
                        onlyBookmarked={showOnlyBookmarked} onOnlyBookmarked={setOnlyBookmarked}
                        backlinks={backlinks}
                        onOutline={markdownBody.trim() ? handleOutline : undefined}
                        onOpenGraph={() => setGraphOpen(true)}
                        onOpenBacklink={id => (files.some(file => file.id === id) ? handleSelectFile(id) : handleReopenFile(id))}
                        onPresentFrom={markdownBody.trim() ? ordinal => openPresentation({ startAt: slideForHeading(markdownBody, ordinal, splitOptions(presentationSettings)) }) : undefined}
                        onPresentBookmarked={markdownBody.trim() ? () => {
                          const ordinals = headings.flatMap((heading, index) => (activeBookmarkIds.has(heading.id) ? [index] : []))
                          const slides = sectionSlides(markdownBody, ordinals, splitOptions(presentationSettings))
                          if (slides.length) openPresentation({ slides, label: 'Bookmarked' })
                        } : undefined}
                        widthToggle={tocMaxWidth() > TOC_MIN_WIDTH ? {
                          isMax: tocWidth >= tocMaxWidth(),
                          onToggle: () => setTocWidth(tocWidth >= tocMaxWidth() ? TOC_MIN_WIDTH : tocMaxWidth()),
                        } : null} />
                    </div>
                  )}
                </div>
                {tocVisible && (
                  <div
                    className={`toc-resize-handle no-print${tocResizing ? ' is-active' : ''}`}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize contents"
                    aria-valuemin={TOC_MIN_WIDTH}
                    aria-valuemax={tocMaxWidth()}
                    aria-valuenow={tocWidth}
                    tabIndex={0}
                    title="Drag to resize the contents (double-click to reset)"
                    onPointerDown={startTocResize}
                    onDoubleClick={() => setTocWidth(TOC_MIN_WIDTH)}
                    onKeyDown={event => {
                      const step = event.shiftKey ? 40 : 16
                      if (event.key === 'ArrowRight') { event.preventDefault(); setTocWidth(width => Math.min(width + step, tocMaxWidth())) }
                      else if (event.key === 'ArrowLeft') { event.preventDefault(); setTocWidth(width => Math.max(width - step, TOC_MIN_WIDTH)) }
                    }}
                  />
                )}

                {/* Scrollable content — Book desk & folio page */}
                <div
                  ref={previewScrollRef}
                  onScroll={handleSyncPreviewScroll}
                  className="flex-1 overflow-auto surface-preview"
                >
                  {content.trim() && (
                    <div className="reading-progress no-print" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readProgress}>
                      <span style={{ width: `${readProgress}%` }} />
                    </div>
                  )}
                  {content.trim() && headingTrail.length > 0 && (
                    <div className="reading-breadcrumb-anchor no-print">
                      <nav className={`reading-breadcrumb${showScrollTop ? ' is-visible' : ''}`} aria-label="Current section" aria-hidden={!showScrollTop}>
                        {headingTrail.map((heading, i) => (
                          <span key={heading.id} className="reading-breadcrumb-item">
                            {i > 0 && <ChevronRight size={11} aria-hidden="true" />}
                            <button
                              type="button"
                              tabIndex={showScrollTop ? 0 : -1}
                              onClick={() => navigateToHeading(heading.id)}
                              aria-current={i === headingTrail.length - 1 ? 'location' : undefined}
                              title={heading.text}
                            >
                              {heading.text}
                            </button>
                          </span>
                        ))}
                      </nav>
                    </div>
                  )}
                  {content.trim() ? (
                    <div className={readerPrefs.width === 'full' ? 'px-2 sm:px-4 py-3 sm:py-5' : 'px-4 sm:px-8 md:px-10 py-6 sm:py-9'}>
                      <article
                        className="book-page px-6 sm:px-11 md:px-14 py-8 sm:py-11 anim-slide-up"
                        style={{ maxWidth: READER_WIDTHS[readerPrefs.width]?.maxW ?? '740px' }}
                        onClick={e => {
                          if (e.target.tagName !== 'IMG' || !e.target.src || !e.target.closest('.rm-prose')) return
                          const images = Array.from(e.currentTarget.querySelectorAll('.rm-prose img'))
                            .filter(img => img.src && !img.closest('.mermaid-svg'))
                          const index = Math.max(0, images.indexOf(e.target))
                          setLightbox({ images: images.map(img => ({ src: img.currentSrc || img.src, alt: img.alt || '' })), index })
                        }}
                      >
                        <div className="book-folio-header">
                          <span className="truncate">{fileName || 'Document'}</span>
                          <span className="shrink-0">{wordCount} words · ~{readingTime} min read</span>
                        </div>

                        {activeSummary?.visible && !hideAi && (
                          <section className="summary-card no-print anim-drop-in" aria-label="Document summary" aria-busy={activeSummary.status === 'loading'}>
                            <div className="summary-card-header">
                              <span className="summary-card-title"><Sparkles size={14} aria-hidden="true" />Summary</span>
                              <span className="summary-card-note">On-device</span>
                              <span className="summary-card-actions">
                                {activeSummary.status === 'ready' && (
                                  <>
                                    <button type="button" onClick={() => navigator.clipboard?.writeText(activeSummary.text).then(() => setToast({ message: 'Summary copied.', tone: 'success' })).catch(() => {})} title="Copy summary" aria-label="Copy summary"><Copy size={13} /></button>
                                    <button type="button" onClick={() => {
                                      const ta = textareaRef.current
                                      const frontmatterEnd = /^---\n[\s\S]*?\n---\n/.exec(content)?.[0].length ?? 0
                                      const block = `> [!NOTE] Summary\n${activeSummary.text.trim().split('\n').map(line => `> ${line}`.trimEnd()).join('\n')}\n\n`
                                      if (ta) applyTextareaEdit(ta, { from: frontmatterEnd, to: frontmatterEnd, text: block, cursor: frontmatterEnd + block.length })
                                      else updateActiveContent(content.slice(0, frontmatterEnd) + block + content.slice(frontmatterEnd))
                                      setSummaries(all => ({ ...all, [activeFileId]: { ...all[activeFileId], visible: false } }))
                                    }} title="Insert into the document as a callout" aria-label="Insert summary into document"><FilePlus size={13} /></button>
                                  </>
                                )}
                                {activeSummary.status !== 'loading' && (
                                  <button type="button" onClick={runSummary} title="Summarize again" aria-label="Summarize again"><RefreshCw size={13} /></button>
                                )}
                                <button type="button" onClick={toggleSummary} title="Hide summary" aria-label="Hide summary"><X size={13} /></button>
                              </span>
                            </div>
                            {activeSummary.status === 'error' ? (
                              <p className="summary-card-error" role="alert">{activeSummary.error}</p>
                            ) : activeSummary.text ? (
                              <div className="summary-card-body rm-prose">
                                <MarkdownRenderer content={activeSummary.text} dark={isDark} />
                              </div>
                            ) : (
                              <p className="summary-card-status" aria-live="polite">
                                <Loader2 size={13} className="animate-spin" />
                                {activeSummary.progress != null
                                  ? `Downloading the on-device model… ${Math.round(activeSummary.progress * 100)}%`
                                  : activeSummary.preparing
                                    ? 'Preparing the on-device model… the first use downloads it, which can take a few minutes.'
                                    : 'Summarizing…'}
                              </p>
                            )}
                            {activeSummary.status === 'ready' && activeSummary.source !== markdownBody && (
                              <p className="summary-card-stale">The document has changed since this summary. <button type="button" onClick={runSummary}>Refresh</button></p>
                            )}
                          </section>
                        )}

                        {(contentFilter || showOnlyBookmarked) && (
                          <div className="filter-banner no-print" role="status">
                            {contentFilter ? <Filter size={13} aria-hidden="true" /> : <Star size={13} aria-hidden="true" />}
                            <span>
                              {contentFilter
                                ? (filterCount ? `Showing ${filterCount} ${filterCount === 1 ? 'match' : 'matches'}: ${filterLabel(contentFilter)}` : `No ${filterLabel(contentFilter).toLowerCase()} in this document.`)
                                : `Showing ${activeBookmarkIds.size} bookmarked section${activeBookmarkIds.size === 1 ? '' : 's'}`}
                            </span>
                            <button type="button" onClick={() => { setContentFilter(null); setOnlyBookmarked(false) }}>Show everything</button>
                          </div>
                        )}

                        {contentFilter && filterCount === 0 && (
                          <EmptyState icon={Filter} title={`No ${filterLabel(contentFilter).toLowerCase()} here`} text="Try another filter, or choose Show everything." className="filter-empty no-print" />
                        )}

                        <FrontmatterCard meta={frontmatterMeta} onEdit={() => setPropertiesFor(activeFileId)} />

                        <div
                          ref={docProseRef}
                          data-doc-style={activeDocStyle !== 'readme' ? activeDocStyle : undefined}
                          className={`rm-prose doc-prose ${activeFont.isSerif && activeDocStyle === 'readme' ? 'font-book' : ''}${sectionCollapseValue.focusKey ? ' focus-section-mode' : ''}${showOnlyBookmarked ? ' bm-only' : ''}${contentFilter ? ' is-filtered' : ''}`}
                          style={{
                            fontSize: READER_SIZES[readerPrefs.size]?.px ?? '17px',
                            maxWidth: 'none',
                            fontFamily: proseFont,
                            '--rm-line-height': READER_LINE_HEIGHTS[readerPrefs.lineHeight]?.value ?? 1.82,
                            '--rm-font-weight': READER_FONT_WEIGHTS[readerPrefs.fontWeight]?.value ?? 400,
                            '--rm-para-space': READER_PARAGRAPH_SPACING[readerPrefs.paragraphSpacing]?.value ?? '0.8rem',
                          }}
                        >
                          <SectionCollapseContext.Provider value={sectionCollapseValue}>
                            <SectionExtrasContext.Provider value={sectionExtrasValue}>
                              <MarkdownRenderer content={markdownBody} dark={isDark} sourceRanges={previewEditOn} />
                            </SectionExtrasContext.Provider>
                          </SectionCollapseContext.Provider>
                        </div>
                        {previewEditOn && (
                          <button type="button" className="pe-add no-print" onClick={previewEditing.addParagraphAtEnd}>
                            <Plus size={13} /> Add a paragraph
                          </button>
                        )}
                        {previewEditOn && <PreviewEditTools editing={previewEditing} />}

                        {focusSection && !searchingDocument && (
                          <nav className="focus-section-bar no-print" aria-label="Section focus">
                            <button type="button" onClick={() => stepSectionFocus(-1)} disabled={focusSection.index === 0} aria-label="Previous section" title={`Previous section (${shortcut('←', { alt: true, mod: false })})`}>
                              <ChevronLeft size={15} /><span className="hidden sm:inline">Previous</span>
                            </button>
                            <span className="focus-section-status">
                              <span className="tabular-nums">{focusSection.index + 1} / {focusSection.total}</span>
                              <span className="focus-section-title">{focusSection.title}</span>
                            </span>
                            <button type="button" onClick={() => stepSectionFocus(1)} disabled={focusSection.index >= focusSection.total - 1} aria-label="Next section" title={`Next section (${shortcut('→', { alt: true, mod: false })})`}>
                              <span className="hidden sm:inline">Next</span><ChevronRight size={15} />
                            </button>
                            <button type="button" className="focus-section-exit" onClick={exitSectionFocus} aria-label="Exit section focus" title="Show the whole document">
                              <X size={14} />
                            </button>
                          </nav>
                        )}

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
                    onClick={() => previewScrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })}
                    title="Back to top"
                  >
                    <ArrowUp size={15} />
                  </button>
                )}
              </div>
            </div>
            </div>
          </>
        )}
      </main>

      {cmdOpen && (
        <CommandPalette
          open={cmdOpen}
          initialQuery={cmdQuery}
          onQueryChange={setCmdQuery}
          onClose={() => { setCmdOpen(false); setCmdQuery('') }}
          files={files}
          closedFiles={closedFileList}
          onReopenFile={handleReopenFile}
          activeFileId={activeFileId}
          headings={headings}
          templates={allTemplates}
          actions={paletteActions}
          onSelectFile={handleSelectFile}
          onNavigateHeading={navigateToHeading}
          onCreateFromTemplate={handleCreateFromTemplate}
          onRunSavedSearch={query => { setCmdQuery(query); setCmdOpen(true) }}
        />
      )}

      {diffOpen && files.length > 1 && (
        <FileDiffView files={files} activeFileId={activeFileId} compareWithId={diffCompareId} onClose={() => setDiffOpen(false)}
          onEdit={(id, text) => { markWorkspaceEdit(); setFiles(prev => prev.map(file => (file.id === id ? { ...file, content: text } : file))) }} />
      )}

      <LinkPreview rootRef={previewScrollRef} disabled={!content.trim() || appSettings.lite} />

      {sharedDoc && (
        <div className="shared-doc-view anim-fade-in" role="dialog" aria-modal="true" aria-label={`Shared document: ${sharedDoc.name}`}>
          <div className="shared-doc-bar">
            <div className="shared-doc-title">
              <Share2 size={14} aria-hidden="true" />
              <span className="truncate">{sharedDoc.name}</span>
              <span className="shared-doc-badge">Read-only</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="pdf-dialog-primary" onClick={saveSharedCopy}><Save size={13} />Save a copy</button>
              <button type="button" className="btn-icon" onClick={closeSharedDoc} aria-label="Close shared document"><X size={15} /></button>
            </div>
          </div>
          <div className="shared-doc-scroll surface-preview">
            <article className="book-page px-6 sm:px-11 md:px-14 py-8 sm:py-11" style={{ maxWidth: '860px' }}>
              <div className="rm-prose" style={{ fontSize: READER_SIZES[readerPrefs.size]?.px ?? '17px', fontFamily: activeFont.family }}>
                <MarkdownRenderer content={parseFrontmatter(sharedDoc.content).body} dark={isDark} />
              </div>
            </article>
          </div>
        </div>
      )}

      {folderPrompt && (
        <PromptDialog
          key={folderPrompt.mode + (folderPrompt.path ?? folderPrompt.parent ?? '')}
          icon={folderPrompt.mode === 'new' ? FolderPlus : Pencil}
          title={folderPrompt.mode === 'new' ? 'New folder' : 'Rename folder'}
          description={folderPrompt.mode === 'new' ? (folderPrompt.parent ? `Inside “${folderPrompt.parent}”.` : 'Folders group your files in the Files panel.') : `Files inside “${folderPrompt.path}” move with it.`}
          prefix={folderPrompt.parent ? `${folderPrompt.parent}/` : undefined}
          label="Folder name"
          initialValue={folderPrompt.mode === 'new' ? '' : folderPrompt.path}
          placeholder="notes"
          hint={folderPrompt.parent ? `Folders go up to ${MAX_FOLDER_DEPTH} levels deep.` : `Use "/" for a folder inside another, like notes/2026 (up to ${MAX_FOLDER_DEPTH} levels).`}
          confirmLabel={folderPrompt.mode === 'new' ? 'Create folder' : 'Rename'}
          validate={value => {
            const typed = cleanFolderName(value)
            if (!typed) return 'Enter a folder name.'
            const name = folderPrompt.parent ? `${folderPrompt.parent}/${typed}` : typed
            if (folderDepth(name) > MAX_FOLDER_DEPTH) return `Folders can go up to ${MAX_FOLDER_DEPTH} levels deep.`
            if (folderPrompt.mode === 'rename' && folderDepth(name) + folderLevelsInside(folderPrompt.path) > MAX_FOLDER_DEPTH) return `Its sub-folders would go deeper than ${MAX_FOLDER_DEPTH} levels.`
            if (folderPrompt.mode === 'rename' && name === folderPrompt.path) return null
            if (folderExists(name)) return `A folder called “${name}” already exists.`
            return null
          }}
          onSubmit={submitFolderPrompt}
          onCancel={() => setFolderPrompt(null)}
        />
      )}
      {graphOpen && (
        <GraphView files={graphFiles} activeId={activeFileId}
          onOpen={id => { setGraphOpen(false); if (closedFiles.some(entry => entry.file.id === id)) handleReopenFile(id); else handleSelectFile(id) }}
          onCreate={name => { createLinkedDocument(name).then(created => { if (created) setGraphOpen(false) }) }}
          onClose={() => setGraphOpen(false)} />
      )}
      {imagesOpen && (
        <ImagesDialog attachments={[...attachments.values()]} documents={allDocuments} embedded={embeddedSummary}
          {...imageActions} onOpenDocument={openDocument} onClose={() => setImagesOpen(false)} />
      )}
      {libraryOpen && (
        <LibraryView documents={libraryDocs} emptyFolders={emptyFolders} activeId={activeFileId} askText={askText}
          fileOrder={itemOrder.files} folderOrder={itemOrder.folders}
          onReorderFile={reorderFileItem} onReorderFolder={reorderFolderItem}
          onOpen={openDocument} onProperties={id => setPropertiesFor(id)}
          onMove={libraryMove} onAddTag={libraryAddTag} onBulkStatus={libraryBulkStatus} onBulkProperty={libraryBulkProperty} onExport={libraryExport} onDelete={ids => deleteEntries(ids)}
          onOpenImages={() => { setLibraryOpen(false); setImagesOpen(true) }} imageCount={attachments.size}
          onClose={() => setLibraryOpen(false)} />
      )}
      {propertiesFor && files.some(file => file.id === propertiesFor) && (
        <PropertiesDialog fileName={files.find(file => file.id === propertiesFor).name} content={files.find(file => file.id === propertiesFor).content}
          onSave={next => saveProperties(propertiesFor, next)}
          onEditYaml={propertiesFor === activeFileId ? () => goToEditorLine(2) : undefined}
          onClose={() => setPropertiesFor(null)} />
      )}
      {tasksOpen && <TasksPanel tasks={allTasks} documents={agendaDocuments} onToggle={toggleTask} onOpen={openTask}
        onOpenDocument={id => { setTasksOpen(false); openDocument(id) }}
        onSetDocumentDue={(id, value) => updateAgendaProperty(id, 'due', value)}
        onToggleDocumentReminder={(id, value) => updateAgendaProperty(id, 'reminder', value)}
        onClose={() => setTasksOpen(false)} />}
      {linkCheckOpen && <LinkCheckDialog files={[...files, ...closedFiles.map(entry => ({ ...entry.file, closed: true }))]}
        attachmentPaths={[...attachments.keys()]} onOpen={id => { setLinkCheckOpen(false); openDocument(id) }} onClose={() => setLinkCheckOpen(false)} />}
      {recoveryData && <RecoveryDialog files={[...files, ...closedFiles.map(entry => ({ ...entry.file, closed: true }))]}
        snapshots={recoveryData.snapshots} loading={recoveryData.loading}
        onOpen={id => { setRecoveryData(null); openDocument(id) }}
        onRestore={restoreRecoverySnapshot} onClose={() => setRecoveryData(null)} />}
      {tableEdit && (
        <TableEditorDialog key={`${tableEdit.mode}-${tableEdit.from}`} initial={tableEdit.table} mode={tableEdit.mode}
          onSave={saveTable} onCancel={() => setTableEdit(null)} onDelete={tableEdit.mode === 'edit' ? deleteTable : undefined} />
      )}
      {appDialog?.kind === 'confirm' && (
        <ConfirmDialog {...appDialog.options} onConfirm={() => settleAppDialog(true)} onCancel={() => settleAppDialog(false)} />
      )}
      {appDialog?.kind === 'choice' && (
        <ChoiceDialog {...appDialog.options} onSubmit={values => settleAppDialog(values)} onCancel={() => settleAppDialog(null)} />
      )}
      {appDialog?.kind === 'text' && (
        <PromptDialog {...appDialog.options} onSubmit={value => settleAppDialog(value)} onCancel={() => settleAppDialog(null)} />
      )}
      <GlobalTooltip />

      {toast && (
        <div className={`app-toast anim-pop-in is-${toast.tone || 'info'}`} role="status" aria-live="polite">
          {toast.tone === 'warning' ? <TriangleAlert size={14} /> : <Check size={14} />}
          <span>{toast.message}</span>
          {toast.action && (
            <button type="button" className="app-toast-action" onClick={() => { toast.action.run(); setToast(null) }}>{toast.action.label}</button>
          )}
        </div>
      )}

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {helpOpen && <HelpDialog hideAi={hideAi} onTour={() => { setHelpOpen(false); startTour() }} onShortcuts={() => { setHelpOpen(false); setShortcutsOpen(true) }} onClose={() => setHelpOpen(false)} />}
      {!presenting && !tourOpen && (
        <StartupCard notice={startupNotice} onTour={startTour} onClose={() => setStartupNotice(null)}
          onShow={id => { setStartupNotice(null); requestAnimationFrame(() => paletteActions.find(action => action.id === id)?.run()) }} />
      )}
      {tourOpen && (
        <GuidedTour steps={TOUR_STEPS} onDone={completed => {
          setTourOpen(false)
          markTourDone()
          if (completed) setToast({ message: 'You’re all set. Help (?) explains everything else, and the tour is there any time.', tone: 'success', duration: 5000 })
        }} />
      )}

      {aiOpen && activeFile && !hideAi && (
        <AiToolsDialog
          fileName={activeFile.name}
          markdown={content}
          initialTab={typeof aiOpen === 'string' ? aiOpen : undefined}
          savedReview={aiReviewRef.current?.fileId === activeFile.id && aiReviewRef.current.content === content ? aiReviewRef.current.review : null}
          onReviewChange={review => { aiReviewRef.current = review ? { fileId: activeFile.id, content, review } : null }}
          onReveal={(from, to) => {
            const before = content.slice(0, from).split('\n')
            setAiOpen(false)
            goToEditorLine(before.length, before[before.length - 1].length, to - from)
          }}
          renderMarkdown={markdown => <MarkdownRenderer content={markdown} dark={isDark} />}
          onClose={() => setAiOpen(false)}
          onCreateFile={(name, text) => addExternalFiles([{ name, content: text }])}
          onInsertSummary={summary => {
            const ta = textareaRef.current
            const frontmatterEnd = /^---\n[\s\S]*?\n---\n/.exec(content)?.[0].length ?? 0
            const block = `> [!NOTE] Summary\n${summary.trim().split('\n').map(line => `> ${line}`.trimEnd()).join('\n')}\n\n`
            if (ta) applyTextareaEdit(ta, { from: frontmatterEnd, to: frontmatterEnd, text: block, cursor: frontmatterEnd + block.length })
            else updateActiveContent(content.slice(0, frontmatterEnd) + block + content.slice(frontmatterEnd))
          }}
          onApplyText={async (text, source) => {
            await takeSnapshot(activeFile.id, content, source === 'review' ? 'Before writing review changes' : 'Before proofreading fixes')
            const ta = textareaRef.current
            if (ta) applyTextareaEdit(ta, { from: 0, to: content.length, text, cursor: 0 })
            else updateActiveContent(text)
            setToast({ message: `${source === 'review' ? 'Suggestions' : 'Corrections'} applied. Undo with ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}Z; the previous text is also in version history.`, tone: 'success' })
          }}
        />
      )}

      {presenting && activeFile && (
        <PresentationMode
          markdown={exportBody}
          startAt={presenting.startAt ?? 0}
          slides={presenting.slides}
          label={presenting.label}
          docStyle={activeDocStyle}
          renderMarkdown={markdown => <MarkdownRenderer content={markdown} dark={isDark} />}
          themes={availableThemes(appSettings.extraThemes)}
          theme={theme}
          onTheme={choosePresentationTheme}
          settings={presentationSettings}
          onSettings={setPresentationSettings}
          onClose={closePresentation}
          onExport={handleExportSlides}
          exporting={slidesExporting}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          initialSection={settingsOpen}
          settings={appSettings}
          onChange={updateAppSetting}
          fileCount={files.length}
          onBackup={handleBackup}
          onRestore={() => restoreInputRef.current?.click()}
          onExportZip={handleExportZip}
          appInstall={{ status: appInstall.status, standalone: appInstall.standalone, onInstall: handleInstallApp }}
          density={uiDensity}
          onDensity={setUiDensity}
          highContrast={highContrast}
          onHighContrast={value => { if (value !== highContrast) toggleHighContrast() }}
          workspaceExtra={(
            <>
              <FolderSyncCard supported={canSyncToFolder()} state={syncFolder} disabled={Boolean(appSettings.workspaceSyncDisabled)}
                activity={syncActivity}
                onConnect={connectSyncFolder} onReconnect={reconnectSyncFolder}
                onSyncNow={() => syncFolder?.handle && runFolderSync(syncFolder.handle)} onDisconnect={disconnectSyncFolder}
                onToggleDisabled={value => updateAppSetting('workspaceSyncDisabled', value)} />
              <label className="settings-field recovery-interval-setting">
                <span className="settings-toggle-text"><strong>Browser autosave</strong><span>Keep edits in this browser automatically, with this short pause after typing.</span></span>
                <span className="settings-select-wrap"><select className="settings-select" value={appSettings.workspaceAutosaveMs ?? 300} onChange={event => updateAppSetting('workspaceAutosaveMs', Number(event.target.value))} aria-label="Browser autosave delay">
                  <option value={100}>After 0.1 seconds</option><option value={300}>After 0.3 seconds</option><option value={1000}>After 1 second</option><option value={3000}>After 3 seconds</option>
                </select></span>
              </label>
              <label className="settings-field recovery-interval-setting">
                <span className="settings-toggle-text"><strong>Recovery snapshot interval</strong><span>Save an earlier version after you pause editing. Browser autosave remains immediate.</span></span>
                <span className="settings-select-wrap"><select className="settings-select" value={appSettings.recoverySnapshotMinutes ?? 10} onChange={event => updateAppSetting('recoverySnapshotMinutes', Number(event.target.value))} aria-label="Recovery snapshot interval">
                  <option value={0}>Off</option><option value={1}>Every minute</option><option value={5}>Every 5 minutes</option><option value={10}>Every 10 minutes</option><option value={30}>Every 30 minutes</option>
                </select></span>
              </label>
              <div className="settings-actions"><button type="button" className="reader-chip" onClick={openRecovery}><History size={12} />Recovery &amp; unsaved changes</button></div>
            </>
          )}
          petExtra={(
            <ReadingPetSettings prefs={petPrefs} onChange={updatePetPref} lite={appSettings.lite} />
          )}
          presentationExtra={(
            <PresentationSettings settings={presentationSettings} onChange={setPresentationSettings}
              themes={availableThemes(appSettings.extraThemes)} />
          )}
          appearanceExtra={(
            <ThemePicker themes={availableThemes(appSettings.extraThemes)} value={theme} onChange={chooseTheme}
              extraThemes={appSettings.extraThemes} onExtraThemes={value => {
                updateAppSetting('extraThemes', value)
                // An additional default theme can't apply once additional themes are off.
                if (!value && themeById(appSettings.defaultTheme).extra) updateAppSetting('defaultTheme', '')
              }}
              defaultTheme={appSettings.defaultTheme} onDefaultTheme={id => {
                updateAppSetting('defaultTheme', id)
                if (!id) return
                if (themeById(id).extra) updateAppSetting('extraThemes', true)
                chooseTheme(id)
              }} />
          )}
          onClose={() => setSettingsOpen(null)}
        />
      )}

      {writeReadmeOpen && (
        <WriteReadmeDialog withAi={aiWriter} aiHidden={hideAi} onGenerate={handleWriteReadme} onClose={() => setWriteReadmeOpen(false)} />
      )}

      {templatesOpen && (
        <TemplatesDialog
          builtIn={MD_TEMPLATES}
          custom={customTemplates}
          currentFile={activeFile}
          onSave={saveCustomTemplate}
          onDelete={deleteCustomTemplate}
          onUse={handleCreateFromTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {storageOpen && (
        <StorageDialog
          fileCount={files.length}
          onBackup={handleBackup}
          onRestore={() => restoreInputRef.current?.click()}
          onClose={() => setStorageOpen(false)}
        />
      )}

      <input ref={restoreInputRef} type="file" accept=".zip,application/zip" hidden onChange={handleRestoreFile} aria-label="Restore workspace from backup" />

      {historyState && activeFile && historyState.fileId === activeFile.id && (
        <HistoryDialog
          fileName={activeFile.name}
          current={content}
          snapshots={historyState.snapshots}
          loading={historyState.loading}
          onClose={() => setHistoryState(null)}
          onSnapshot={() => takeSnapshot(activeFile.id, content, 'Manual snapshot')}
          onRestore={restoreSnapshot}
          onCompare={snapshot => {
            setHistoryCompare({
              files: [
                { id: 'history-snapshot', name: `${activeFile.name} — ${new Date(snapshot.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`, content: snapshot.content },
                { id: 'history-current', name: `${activeFile.name} — current`, content },
              ],
            })
          }}
        />
      )}
      {diskCompare && (
        <FileDiffView files={diskCompare.files} activeFileId="disk-version" compareWithId="your-version" onClose={() => setDiskCompare(null)} />
      )}
      {historyCompare && (
        <FileDiffView files={historyCompare.files} activeFileId="history-snapshot" compareWithId="history-current" onClose={() => setHistoryCompare(null)} />
      )}

      {globalSearchOpen && (
        <GlobalSearch
          files={files}
          closedFiles={closedFileList}
          activeFileId={activeFileId}
          onClose={() => setGlobalSearchOpen(false)}
          onOpen={(fileId, line, column, length, query) => {
            setGlobalSearchOpen(false)
            if (closedFiles.some(entry => entry.file.id === fileId)) handleReopenFile(fileId)
            else if (fileId !== activeFileId) handleSelectFile(fileId)
            goToEditorLine(line, column, length)
            setSearchQuery(query)
            setSearchOpen(true)
          }}
        />
      )}

      {publishOpen && (
        <PublishSiteDialog files={files} closedFiles={closedFileList} activeId={activeFileId} busy={publishBusy} progress={publishProgress}
          onPublish={handlePublishSite} onClose={() => { if (!publishBusy) setPublishOpen(false) }} />
      )}
      {pdfDialogOpen && (
        <PdfExportDialog
          fileName={(fileName || 'document').replace(/\.[^.]+$/, '') + '.pdf'}
          hasFrontmatter={frontmatterMeta.length > 0}
          hasHeadings={headings.length > 0}
          hasDiagrams={/```mermaid|\$\$/.test(markdownBody)}
          busy={pdfExporting}
          docStyle={activeDocStyle}
          onExport={handleExportPdf}
          onClose={() => setPdfDialogOpen(false)}
        />
      )}

      {/* ── Image lightbox ────────────────────────────── */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={index => setLightbox(current => (current ? { ...current, index } : current))}
          onClose={() => setLightbox(null)}
        />
      )}
      {!appSettings.lite && <ReadingPetFooter prefs={petPrefs} />}
    </div>
    </CodeThemeContext.Provider>
    </LiteContext.Provider>
    </IconStyleContext.Provider>
    </AttachmentContext.Provider>
  )
}
