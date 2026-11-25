import { useEffect, useRef } from 'react'
import { Compartment, EditorSelection, EditorState, Prec } from '@codemirror/state'
import {
  EditorView, drawSelection, dropCursor, highlightActiveLine, keymap, lineNumbers, placeholder as placeholderExt,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  HighlightStyle, bracketMatching, foldEffect, foldGutter, foldKeymap, foldable, foldedRanges, indentOnInput,
  syntaxHighlighting, syntaxTree, unfoldEffect,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { tags } from '@lezer/highlight'
import { headingSlug } from '../headingSections'

// Markdown highlighting that uses the app's theme tokens (works in every theme).
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.18em', color: 'var(--text-1)' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.1em', color: 'var(--text-1)' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '650', color: 'var(--text-1)' },
  { tag: tags.processingInstruction, color: 'var(--accent)' },
  { tag: tags.strong, fontWeight: '700', color: 'var(--text-1)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.monospace, color: 'var(--cm-code, #9f1239)' },
  { tag: tags.quote, color: 'var(--text-3)', fontStyle: 'italic' },
  { tag: [tags.list, tags.contentSeparator], color: 'var(--accent)' },
  { tag: tags.meta, color: 'var(--text-4)' },
  { tag: tags.comment, color: 'var(--text-4)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--cm-keyword, #7c3aed)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--cm-string, #0f766e)' },
  { tag: [tags.number, tags.bool, tags.atom], color: 'var(--cm-number, #b45309)' },
  { tag: [tags.function(tags.variableName), tags.typeName, tags.className], color: 'var(--cm-function, #2563eb)' },
])

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text-2)', fontSize: '13.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.85', overflow: 'auto' },
  '.cm-content': { padding: '22px 26px 22px 6px', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 2px 0 4px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent) !important' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--text-4)', paddingLeft: '8px' },
  '.cm-lineNumbers .cm-gutterElement': { fontSize: '11px', minWidth: '28px', paddingRight: '6px' },
  '.cm-foldGutter .cm-gutterElement': { width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  '.cm-foldPlaceholder': {
    margin: '0 4px', padding: '0 7px', border: '1px solid var(--accent-border)', borderRadius: '999px',
    backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '11px', fontWeight: '700', letterSpacing: '.1em',
  },
  '.cm-placeholder': { color: 'var(--text-4)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: '1px solid var(--accent-border)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--bg-toolbar)', color: 'var(--text-2)', borderColor: 'var(--border)' },
  '.cm-fat-cursor': { background: 'color-mix(in srgb, var(--accent) 55%, transparent) !important', border: 'none' },
  '&:not(.cm-focused) .cm-fat-cursor': { background: 'none !important', outline: '1px solid var(--accent)' },
  '.cm-vim-panel, .cm-vim-panel input': { fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-1)', backgroundColor: 'var(--bg-toolbar)' },
})

function foldMarker(open) {
  const marker = document.createElement('span')
  marker.className = `cm-fold-marker${open ? ' is-open' : ''}`
  marker.setAttribute('aria-hidden', 'true')
  marker.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'
  return marker
}

/** Strips Markdown inline syntax so heading text matches the rendered heading slug. */
function headingPlainText(line) {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s+#+\s*$/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
    .replace(/<[^>]+>/g, '')
}

/**
 * Heading sections in the document, keyed exactly like the preview's
 * rehypeHeadingSections plugin (slug~occurrence), with their foldable range.
 */
function headingSections(state) {
  const headings = []
  syntaxTree(state).iterate({
    enter: node => {
      const match = /^ATXHeading(\d)$/.exec(node.name)
      if (!match) return
      // Only top-level headings (not inside lists / quotes) get sections in the preview.
      if (node.node.parent?.name !== 'Document') return false
      headings.push({ level: Number(match[1]), from: node.from, line: state.doc.lineAt(node.from) })
      return false
    },
  })
  const seen = new Map()
  const result = headings.map((heading, index) => {
    const slug = headingSlug(headingPlainText(heading.line.text))
    const occurrence = seen.get(slug) ?? 0
    seen.set(slug, occurrence + 1)
    const next = headings.slice(index + 1).find(other => other.level <= heading.level)
    const bodyEnd = next ? state.doc.lineAt(next.from).from - 1 : state.doc.length
    const body = state.doc.sliceString(heading.line.to, Math.max(heading.line.to, bodyEnd))
    return { key: `${slug || 'section'}~${occurrence}`, level: heading.level, lineFrom: heading.line.from, lineTo: heading.line.to, empty: !body.trim() }
  })
  const minLevel = Math.min(...result.map(section => section.level))
  const topLevel = result.filter(section => section.level === minLevel)
  return result.map(section => ({ ...section, title: topLevel.length === 1 && section === topLevel[0] }))
}

const isFoldedAt = (state, from, to) => {
  let folded = false
  foldedRanges(state).between(from, to, () => { folded = true })
  return folded
}

// Enter on an empty top-level list item / quote line ends the list and leaves a
// blank line (same behaviour as the simple editor); everything else falls
// through to the Markdown keymap (continue markup, outdent nested items).
const EMPTY_MARKUP_RE = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?$|^(?:>\s?)+$/
function endEmptyMarkup(view) {
  const { state } = view
  const range = state.selection.main
  if (!range.empty) return false
  const line = state.doc.lineAt(range.head)
  if (range.head !== line.to || !EMPTY_MARKUP_RE.test(line.text)) return false
  view.dispatch({ changes: { from: line.from, to: line.to, insert: '\n' }, selection: { anchor: line.from + 1 }, userEvent: 'input' })
  return true
}

async function loadKeymap(mode) {
  if (mode === 'vim') {
    const { vim } = await import('@replit/codemirror-vim')
    return Prec.highest(vim())
  }
  if (mode === 'emacs') {
    const { emacs } = await import('@replit/codemirror-emacs')
    return Prec.highest(emacs())
  }
  return []
}

export default function CodeEditor({
  value, onChange, onScroll, onImageFiles, editorRef, placeholder, keymapMode = 'default', showLineNumbers = false,
  sectionState, onSectionToggle,
}) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const compartments = useRef({ keymap: new Compartment(), lineNumbers: new Compartment() })
  const callbacks = useRef({})
  // Keep the latest callbacks without recreating the editor.
  useEffect(() => { callbacks.current = { onChange, onScroll, onImageFiles, onSectionToggle, sectionState } })

  useEffect(() => {
    const syncingFolds = { current: false }
    const imageFiles = list => Array.from(list || []).filter(file => file.type.startsWith('image/'))
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          compartments.current.keymap.of([]),
          Prec.high(keymap.of([{ key: 'Enter', run: endEmptyMarkup }])),
          compartments.current.lineNumbers.of(showLineNumbers ? lineNumbers() : []),
          foldGutter({ markerDOM: foldMarker }),
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          // Markdown keymap: Enter continues lists / quotes, Backspace removes markup.
          markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
          syntaxHighlighting(markdownHighlight),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
          placeholderExt(placeholder || ''),
          editorTheme,
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', 'aria-multiline': 'true', tabindex: '0', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) callbacks.current.onChange?.(update.state.doc.toString())
            // Folding a heading in the editor collapses the same section in the preview.
            if (syncingFolds.current || !callbacks.current.onSectionToggle) return
            for (const tr of update.transactions) {
              for (const effect of tr.effects) {
                if (!effect.is(foldEffect) && !effect.is(unfoldEffect)) continue
                const line = update.state.doc.lineAt(effect.value.from)
                const section = headingSections(update.state).find(item => item.lineFrom === line.from)
                if (section) callbacks.current.onSectionToggle(section.key, effect.is(foldEffect), section.title)
              }
            }
          }),
          EditorView.domEventHandlers({
            paste: event => {
              const files = imageFiles(event.clipboardData?.files)
              if (!files.length) return false
              event.preventDefault()
              callbacks.current.onImageFiles?.(files)
              return true
            },
            drop: (event, editorView) => {
              const files = imageFiles(event.dataTransfer?.files)
              if (!files.length) return false
              event.preventDefault()
              event.stopPropagation()
              const pos = editorView.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos != null) editorView.dispatch({ selection: { anchor: pos } })
              callbacks.current.onImageFiles?.(files)
              return true
            },
          }),
        ],
      }),
    })
    viewRef.current = view
    const scroller = view.scrollDOM
    const handleScroll = event => callbacks.current.onScroll?.(event)
    scroller.addEventListener('scroll', handleScroll, { passive: true })

    // Textarea-compatible adapter so the rest of the app can drive the editor.
    const adapter = {
      isCodeMirror: true,
      view,
      get value() { return view.state.doc.toString() },
      get selectionStart() { return view.state.selection.main.from },
      get selectionEnd() { return view.state.selection.main.to },
      get scrollTop() { return scroller.scrollTop },
      set scrollTop(top) { scroller.scrollTop = top },
      get scrollHeight() { return scroller.scrollHeight },
      get clientHeight() { return scroller.clientHeight },
      focus() { view.focus() },
      setSelectionRange(start, end = start) {
        const length = view.state.doc.length
        view.dispatch({ selection: EditorSelection.single(Math.min(start, length), Math.min(end, length)), scrollIntoView: true })
      },
      applyEdit(edit) {
        view.dispatch({
          changes: { from: edit.from, to: edit.to, insert: edit.text },
          selection: EditorSelection.single(edit.cursor, edit.cursorEnd ?? edit.cursor),
          scrollIntoView: true,
          userEvent: 'input',
        })
        view.focus()
      },
      scrollToLine(line) {
        const target = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)))
        view.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: 'center' }) })
      },
    }
    if (editorRef) editorRef.current = adapter
    view.syncingFolds = syncingFolds
    return () => {
      scroller.removeEventListener('scroll', handleScroll)
      if (editorRef?.current === adapter) editorRef.current = null
      view.destroy()
      viewRef.current = null
    }
    // The editor is created once; later prop changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External value changes (file switch, toolbar, sync from another tab).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: EditorSelection.single(Math.min(from, value.length), Math.min(to, value.length)),
    })
  }, [value])

  useEffect(() => {
    let cancelled = false
    loadKeymap(keymapMode).then(extension => {
      if (!cancelled) viewRef.current?.dispatch({ effects: compartments.current.keymap.reconfigure(extension) })
    })
    return () => { cancelled = true }
  }, [keymapMode])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.lineNumbers.reconfigure(showLineNumbers ? lineNumbers() : []) })
  }, [showLineNumbers])

  // Mirror the preview's collapsed sections as folds in the editor.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !sectionState?.isCollapsed) return
    const effects = []
    for (const section of headingSections(view.state)) {
      if (section.empty) continue
      const range = foldable(view.state, section.lineFrom, section.lineTo)
      if (!range) continue
      const shouldFold = sectionState.isCollapsed(section.key, section.title)
      const folded = isFoldedAt(view.state, range.from, range.to)
      if (shouldFold && !folded) effects.push(foldEffect.of(range))
      else if (!shouldFold && folded) effects.push(unfoldEffect.of(range))
    }
    if (!effects.length) return
    view.syncingFolds.current = true
    view.dispatch({ effects })
    view.syncingFolds.current = false
  }, [sectionState, value])

  return <div ref={hostRef} className="code-editor-host" />
}
