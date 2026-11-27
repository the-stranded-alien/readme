// "Edit in preview": click a rendered block to edit it in place.
// The original block is hidden and an editor is put next to it (so React's own DOM is never
// typed into). Simple blocks (paragraphs, headings, list items) are edited as formatted text;
// everything else as its Markdown source. Changes are written back to the document on Enter,
// on leaving the block, or after a short pause — through `applyEdit`, so undo works as usual.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { editPlan, headingPrefix, htmlToInline, inlineToHtml, nextPrefix, separatorFor } from './previewEdit'
import { expandSnippet, filterSlashCommands } from './slashCommands'

const KIND_LABEL = { p: 'paragraph', h: 'heading', li: 'list item', quote: 'quote', code: 'code block', hr: 'divider' }
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
const textLength = html => { const div = document.createElement('div'); div.innerHTML = html; return div.textContent.length }

/** Character offset of a point inside `root` (by text content). */
function offsetWithin(root, node, offset) {
  const range = document.createRange()
  range.selectNodeContents(root)
  try { range.setEnd(node, offset) } catch { return root.textContent.length }
  return range.toString().length
}
/** Puts the caret `index` characters into `root` (or at its end). */
function placeCaret(root, index) {
  const selection = window.getSelection()
  const range = document.createRange()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let left = index
  let node = walker.nextNode()
  while (node) {
    if (left <= node.data.length) { range.setStart(node, left); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); return }
    left -= node.data.length
    node = walker.nextNode()
  }
  range.selectNodeContents(root)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}
/** Text of a rendered block without the heading's toggle / anchor buttons. */
function clickOffset(el, event) {
  const point = document.caretPositionFromPoint?.(event.clientX, event.clientY)
  const node = point?.offsetNode ?? document.caretRangeFromPoint?.(event.clientX, event.clientY)?.startContainer
  const offset = point?.offset ?? document.caretRangeFromPoint?.(event.clientX, event.clientY)?.startOffset
  if (!node || !el.contains(node) || node.nodeType !== Node.TEXT_NODE) return null
  const range = document.createRange()
  range.selectNodeContents(el)
  range.setEnd(node, offset)
  const fragment = range.cloneContents()
  fragment.querySelectorAll?.('button, .heading-anchor, input').forEach(item => item.remove())
  return fragment.textContent.length
}

/**
 * enabled: edit mode on; rootRef: the preview's prose element; body: the Markdown it renders;
 * applyEdit({ from, to, text }): writes a change (offsets in `body`); askText: our text dialog.
 * Returns { active, bubble, slash, format, setHeading, pickSlash, moveSlash, addParagraphAtEnd }.
 */
export function usePreviewEditing({ enabled, rootRef, body, applyEdit, askText }) {
  const bodyRef = useRef(body)
  const applyRef = useRef(applyEdit)
  useLayoutEffect(() => { bodyRef.current = body; applyRef.current = applyEdit })
  const session = useRef(null)
  const pickSlashRef = useRef(null)
  const [active, setActive] = useState(null) // { kind, mode }
  const [bubble, setBubble] = useState(null) // selection rect for the formatting bar
  const [slash, setSlash] = useState(null) // { query, items, index, rect }

  const close = useCallback(() => {
    const current = session.current
    if (!current) return
    session.current = null
    clearTimeout(current.timer)
    current.editor.remove()
    if (current.el) { current.el.style.display = current.display; current.el.removeAttribute('data-pe-hidden') }
    setActive(null); setBubble(null); setSlash(null)
  }, [])

  /** The block's new Markdown (or null when unchanged). */
  const pendingChange = current => {
    if (current.mode === 'source') {
      const text = current.input.value
      return text === current.source ? null : { from: current.from, to: current.to, text }
    }
    const inline = htmlToInline(current.input.innerHTML)
    if (current.insertAt != null) {
      return inline ? { from: current.insertAt, to: current.insertAt, text: `${current.leading}${current.prefix}${inline}` } : null
    }
    if (current.prefix === current.originalPrefix && inlineToHtml(inline) === inlineToHtml(current.inline)) return null
    if (!inline) {
      // An emptied block goes away (with the blank line / line break after it).
      const rest = bodyRef.current.slice(current.to)
      const trailing = /^\n{0,2}/.exec(rest)[0]
      const leading = current.kind === 'li' && !trailing ? (/\n$/.exec(bodyRef.current.slice(0, current.from))?.[0] ?? '') : ''
      return { from: current.from - leading.length, to: current.to + trailing.length, text: '' }
    }
    return { from: current.from, to: current.to, text: `${current.prefix}${inline}` }
  }

  /** Writes the open block (if changed) and closes the editor. Returns the edit made. */
  const commit = useCallback(() => {
    const current = session.current
    if (!current) return null
    const change = pendingChange(current)
    close()
    if (change) applyRef.current(change)
    return change
  }, [close])
  const cancel = useCallback(() => close(), [close])

  const openRef = useRef(null)
  /** Opens the block that starts at `from` (after the preview re-renders). */
  const openAt = useCallback(async (from, caret = 'end') => {
    await frames()
    const el = rootRef.current?.querySelector(`[data-src-from="${from}"]`)
    if (el) openRef.current(el, caret)
  }, [rootRef])

  // ── Keys inside a formatted-text editor ──
  const onRichKey = useCallback(event => {
    const current = session.current
    if (!current) return
    if (slash) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSlash(state => state && { ...state, index: (state.index + (event.key === 'ArrowDown' ? 1 : -1) + state.items.length) % state.items.length }); return }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pickSlashRef.current(slash.items[slash.index]); return }
      if (event.key === 'Escape') { event.preventDefault(); setSlash(null); return }
    }
    // Escape finishes editing and keeps the text (undo is there if it wasn't wanted).
    if (event.key === 'Escape') { event.preventDefault(); commit(); return }
    const selection = window.getSelection()
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      // Split at the caret: text before stays, text after starts the next block.
      const range = selection.getRangeAt(0)
      const before = document.createRange(); before.selectNodeContents(current.input); before.setEnd(range.startContainer, range.startOffset)
      const after = document.createRange(); after.selectNodeContents(current.input); after.setStart(range.endContainer, range.endOffset)
      const wrap = fragment => { const div = document.createElement('div'); div.append(fragment); return div.innerHTML }
      const beforeMd = htmlToInline(wrap(before.cloneContents()))
      const afterMd = htmlToInline(wrap(after.cloneContents()))
      const kind = current.kind === 'h' ? 'p' : current.kind
      const prefix = nextPrefix(current.kind, current.prefix)
      const separator = separatorFor(current.kind)
      if (current.insertAt != null && !beforeMd && !afterMd) return
      close()
      const head = current.insertAt != null ? `${current.leading}${current.prefix}${beforeMd}` : `${current.prefix}${beforeMd}`
      const from = current.insertAt ?? current.from
      const to = current.insertAt ?? current.to
      if (afterMd || kind === 'li') {
        applyRef.current({ from, to, text: `${head}${separator}${prefix}${afterMd}` })
        openAt(from + head.length + separator.length, 'start')
      } else {
        if (head !== `${current.prefix}${current.inline}` || current.insertAt != null) applyRef.current({ from, to, text: head })
        openRef.current(null, 'start', { insertAt: from + head.length, kind, prefix, leading: separator })
      }
      return
    }
    if (event.key === 'Backspace' && selection.isCollapsed && offsetWithin(current.input, selection.anchorNode, selection.anchorOffset) === 0) {
      // At the very start: join with the block before (when it's simple text too).
      const blocks = [...rootRef.current.querySelectorAll('[data-src-kind="p"], [data-src-kind="h"], [data-src-kind="li"]')]
      const anchor = current.el ?? current.editor
      const previous = blocks.filter(block => block !== current.el && (anchor.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_PRECEDING)).pop()
      if (!previous) return
      const prevFrom = Number(previous.dataset.srcFrom)
      const prevTo = Number(previous.dataset.srcTo)
      const plan = editPlan(previous.dataset.srcKind, bodyRef.current.slice(prevFrom, prevTo))
      if (plan.mode !== 'rich') return
      event.preventDefault()
      const inline = htmlToInline(current.input.innerHTML)
      const end = current.insertAt ?? current.to
      close()
      applyRef.current({ from: prevFrom, to: end, text: `${plan.prefix}${plan.inline}${inline}` })
      openAt(prevFrom, textLength(plan.html))
    }
  }, [commit, close, openAt, rootRef, slash])

  const onSourceKey = useCallback(event => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) { event.preventDefault(); commit() }
  }, [commit])

  const keyHandlers = useRef({})
  useLayoutEffect(() => { keyHandlers.current = { rich: onRichKey, source: onSourceKey } })

  /** Opens an editor for a rendered block (or, with `insert`, a new empty block). */
  const open = useCallback((el, caret = 'end', insert = null) => {
    if (session.current) return
    let kind, from, to, source, plan
    if (insert) {
      ({ kind } = insert)
      plan = { mode: 'rich', prefix: insert.prefix ?? '', inline: '', html: '' }
      from = to = insert.insertAt
      source = ''
    } else {
      kind = el.dataset.srcKind
      from = Number(el.dataset.srcFrom)
      to = Number(el.dataset.srcTo)
      source = bodyRef.current.slice(from, to)
      plan = editPlan(kind, source)
      if (plan.mode === 'table') { el.closest('.table-wrap')?.querySelector('[data-edit-table]')?.click(); return }
    }
    const rich = plan.mode === 'rich'
    const tag = rich ? (insert ? (kind === 'li' ? 'li' : 'p') : el.tagName.toLowerCase()) : 'div'
    const editor = document.createElement(tag)
    editor.className = `pe-editor no-print ${rich ? 'is-rich' : 'is-source'}`
    let input
    if (rich) {
      if (kind === 'li' && /\[[ xX]\]/.test(plan.prefix)) {
        const box = document.createElement('input')
        box.type = 'checkbox'; box.disabled = true; box.checked = /\[[xX]\]/.test(plan.prefix); box.tabIndex = -1
        box.setAttribute('aria-hidden', 'true')
        editor.append(box)
      }
      input = document.createElement('div')
      input.className = 'pe-text'
      input.contentEditable = 'true'
      input.spellcheck = true
      input.setAttribute('role', 'textbox')
      input.setAttribute('aria-multiline', 'true')
      input.setAttribute('aria-label', `Edit ${KIND_LABEL[kind] ?? 'block'}`)
      input.dataset.placeholder = insert ? 'Type, or “/” for blocks' : ''
      input.innerHTML = plan.html
      editor.append(input)
    } else {
      input = document.createElement('textarea')
      input.className = 'pe-source-input'
      input.value = source
      input.spellcheck = false
      input.setAttribute('aria-label', `Edit ${KIND_LABEL[kind] ?? 'block'} (Markdown)`)
      const hint = document.createElement('p')
      hint.className = 'pe-source-hint'
      hint.textContent = `Markdown source · ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}Enter or Esc to finish`
      editor.append(input, hint)
      const grow = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight + 2}px` }
      input.addEventListener('input', grow)
      requestAnimationFrame(grow)
    }
    let display = ''
    if (insert) {
      const after = insert.after ?? [...rootRef.current.querySelectorAll('[data-src-from]')].find(block => Number(block.dataset.srcTo) === insert.insertAt)
      if (after) (after.closest('.table-wrap') ?? after).after(editor)
      else rootRef.current.append(editor)
    } else {
      display = el.style.display
      el.before(editor)
      el.style.display = 'none'
      el.setAttribute('data-pe-hidden', '')
    }
    session.current = {
      el: insert ? null : el, editor, input, kind, mode: rich ? 'rich' : 'source', from, to, source, display,
      prefix: plan.prefix ?? '', originalPrefix: plan.prefix ?? '', inline: plan.inline ?? '', html: plan.html ?? '',
      insertAt: insert ? insert.insertAt : null, leading: insert?.leading ?? '',
    }
    input.addEventListener('keydown', event => keyHandlers.current[rich ? 'rich' : 'source'](event))
    input.addEventListener('focusout', event => {
      // Leaving the block (not for the formatting bar or a dialog) saves it.
      const next = event.relatedTarget
      if (next && (editor.contains(next) || next.closest?.('.pe-toolbar, .pe-slash, [role="dialog"], [role="alertdialog"]'))) return
      setTimeout(() => {
        const current = session.current
        if (!current || current.input !== input) return
        if (document.activeElement && (editor.contains(document.activeElement) || document.activeElement.closest?.('.pe-toolbar, .pe-slash, [role="dialog"], [role="alertdialog"]'))) return
        commit()
      }, 0)
    })
    if (rich) {
      input.addEventListener('input', () => {
        // "/" in an empty block opens the block menu.
        const text = input.textContent
        if (/^\/[\w ]{0,20}$/.test(text) && session.current?.inline === '') {
          const items = filterSlashCommands(text.slice(1)).slice(0, 8)
          const rect = input.getBoundingClientRect()
          setSlash(items.length ? { query: text.slice(1), items, index: 0, rect: { left: rect.left, top: rect.bottom + 6 } } : null)
        } else setSlash(null)
      })
    }
    setActive({ kind, mode: rich ? 'rich' : 'source' })
    input.focus({ preventScroll: true })
    if (rich) {
      if (caret === 'select') { const range = document.createRange(); range.selectNodeContents(input); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range) }
      else placeCaret(input, caret === 'start' ? 0 : caret === 'end' ? Infinity : caret)
    } else input.setSelectionRange(input.value.length, input.value.length)
    editor.scrollIntoView({ block: 'nearest' })
  }, [commit, rootRef])
  useLayoutEffect(() => { openRef.current = open })

  // ── Slash menu: turn the empty block into a heading, list, table, … ──
  const pickSlash = useCallback(command => {
    const current = session.current
    if (!current || !command) return
    const { text } = expandSnippet(command, 0)
    const from = current.insertAt ?? current.from
    const to = current.insertAt ?? current.to
    const lead = current.insertAt != null ? current.leading : ''
    close()
    applyRef.current({ from, to, text: `${lead}${text}` })
    if (/^(#|- |\d+\. |> )/.test(text)) openAt(from + lead.length, 'select')
    else if (command.id === 'table' || command.id === 'code' || command.id === 'mermaid' || command.id === 'math') openAt(from + lead.length)
  }, [close, openAt])
  useEffect(() => { pickSlashRef.current = pickSlash }, [pickSlash])

  // ── Formatting bar ──
  useEffect(() => {
    if (!active || active.mode !== 'rich') return undefined
    const onSelection = () => {
      const current = session.current
      const selection = window.getSelection()
      if (!current || !selection.rangeCount || selection.isCollapsed || !current.input.contains(selection.anchorNode)) { setBubble(null); return }
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      setBubble({ left: rect.left + rect.width / 2, top: rect.top })
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [active])

  const format = useCallback(async command => {
    const current = session.current
    if (!current || current.mode !== 'rich') return
    current.input.focus({ preventScroll: true })
    if (command === 'code') {
      const selection = window.getSelection()
      if (!selection.rangeCount || selection.isCollapsed) return
      const range = selection.getRangeAt(0)
      const code = document.createElement('code')
      code.append(range.extractContents())
      range.insertNode(code)
      selection.removeAllRanges()
      const after = document.createRange(); after.selectNodeContents(code); selection.addRange(after)
      return
    }
    if (command === 'link') {
      const selection = window.getSelection()
      const saved = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null
      const url = await askText?.({ title: 'Add a link', label: 'Link address', placeholder: 'https://', confirmLabel: 'Add link' })
      if (!url || !session.current || session.current !== current) return
      current.input.focus({ preventScroll: true })
      if (saved) { selection.removeAllRanges(); selection.addRange(saved) }
      document.execCommand('createLink', false, url.trim())
      return
    }
    document.execCommand(command === 'strike' ? 'strikeThrough' : command)
  }, [askText])

  /** Paragraph (0) or heading level 1–3 for the open block. */
  const setHeading = useCallback(level => {
    const current = session.current
    if (!current || current.mode !== 'rich' || (current.kind !== 'p' && current.kind !== 'h')) return
    const inline = htmlToInline(current.input.innerHTML)
    const from = current.insertAt ?? current.from
    const to = current.insertAt ?? current.to
    const lead = current.insertAt != null ? current.leading : ''
    if (!inline) { current.prefix = headingPrefix(level); return }
    close()
    applyRef.current({ from, to, text: `${lead}${headingPrefix(level)}${inline}` })
    openAt(from + lead.length, 'end')
  }, [close, openAt])

  // ── Clicks in the preview open the block under the pointer ──
  useEffect(() => {
    const root = rootRef.current
    if (!enabled || !root) return undefined
    const onClick = event => {
      if (event.target.closest('.pe-editor')) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.target.closest('button, input, select, textarea, summary, label, .heading-anchor, .code-header, .mermaid-actions')) return
      const selection = window.getSelection?.()
      if (selection && !selection.isCollapsed && root.contains(selection.anchorNode)) return // selecting (e.g. to highlight)
      const el = event.target.closest('[data-src-kind]')
      if (!el || !root.contains(el)) return
      event.preventDefault()
      event.stopPropagation()
      const caret = clickOffset(el, event) ?? 'end'
      if (session.current) {
        const change = commit()
        if (change) {
          // Offsets move after an edit: find the block again once the preview has updated.
          const from = Number(el.dataset.srcFrom)
          const shifted = from >= change.to ? from + change.text.length - (change.to - change.from) : from
          openAt(shifted, caret)
          return
        }
      }
      open(el, caret)
    }
    const onKey = event => {
      if (event.key !== 'Enter' || event.target === root || !event.target.matches?.('[data-src-kind]')) return
      event.preventDefault()
      open(event.target, 'end')
    }
    root.addEventListener('click', onClick, true)
    root.addEventListener('keydown', onKey)
    root.classList.add('pe-on')
    return () => { root.removeEventListener('click', onClick, true); root.removeEventListener('keydown', onKey); root.classList.remove('pe-on') }
  }, [enabled, rootRef, open, commit, openAt])

  // Keyboard users can reach each editable block with Tab (and open it with Enter).
  useEffect(() => {
    const root = rootRef.current
    if (!enabled || !root) return undefined
    const blocks = [...root.querySelectorAll('[data-src-kind]')].filter(block => !block.closest('[data-src-kind] [data-src-kind]') || block.dataset.srcKind === 'li')
    blocks.forEach(block => { block.tabIndex = 0 })
    return () => blocks.forEach(block => block.removeAttribute('tabindex'))
  }, [enabled, rootRef, body])

  // Turning edit mode off, or the document changing underneath (other pane, another file), closes the editor.
  useEffect(() => { if (!enabled && session.current) queueMicrotask(commit) }, [enabled, commit])
  // Our own edits happen with no editor open, so a change while one is open came from elsewhere.
  const lastBody = useRef(body)
  useEffect(() => {
    if (lastBody.current !== body && session.current) queueMicrotask(cancel)
    lastBody.current = body
  }, [body, cancel])
  useEffect(() => () => close(), [close])

  /** Starts a new paragraph at the end of the document. */
  const addParagraphAtEnd = useCallback(() => {
    if (session.current) commit()
    const text = bodyRef.current
    const trimmed = text.replace(/\s+$/, '')
    const leading = trimmed ? '\n\n' : ''
    if (trimmed.length !== text.length) applyRef.current({ from: trimmed.length, to: text.length, text: '' })
    requestAnimationFrame(() => open(null, 'start', { insertAt: trimmed.length, kind: 'p', prefix: '', leading, after: null }))
  }, [commit, open])

  return { active, bubble, slash, format, setHeading, pickSlash, setSlashIndex: index => setSlash(state => state && { ...state, index }), addParagraphAtEnd, commit, cancel }
}
