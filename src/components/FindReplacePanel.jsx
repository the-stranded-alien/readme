import { useEffect, useMemo, useRef, useState } from 'react'
import { CaseSensitive, ChevronDown, ChevronUp, Regex, Replace, ReplaceAll, WholeWord, X } from 'lucide-react'
import { buildSearchRegex, findMatches, replacementFor } from '../findReplace'

export default function FindReplacePanel({ content, editorRef, files, activeFileId, onSelectMatch, onReplaceCurrent, onReplaceAllHere, onReplaceAllFiles, onClose, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState({ matchCase: false, wholeWord: false, regex: false })
  const [allFiles, setAllFiles] = useState(false)
  const [current, setCurrent] = useState(-1)
  const findRef = useRef(null)
  const selectNextAfterReplace = useRef(false)

  const { regex, error } = useMemo(() => buildSearchRegex(query, options), [query, options])
  const matches = useMemo(() => findMatches(content, regex), [content, regex])
  const otherFileCount = useMemo(() => {
    if (!allFiles || !regex) return { files: 0, matches: 0 }
    let fileCount = 0
    let matchCount = 0
    for (const file of files) {
      if (file.id === activeFileId) continue
      const count = findMatches(file.content, regex).length
      if (count) { fileCount += 1; matchCount += count }
    }
    return { files: fileCount, matches: matchCount }
  }, [allFiles, regex, files, activeFileId])
  const shownIndex = current >= 0 && current < matches.length ? current : -1

  useEffect(() => { findRef.current?.focus(); findRef.current?.select() }, [])
  // After "Replace", select the match that now sits at the same index (the next one).
  useEffect(() => {
    if (!selectNextAfterReplace.current) return
    selectNextAfterReplace.current = false
    if (!matches.length) return
    const index = Math.min(Math.max(current, 0), matches.length - 1)
    onSelectMatch(matches[index], { keepFocus: true })
  }, [matches, current, onSelectMatch])

  const go = step => {
    if (!matches.length) return
    const caret = editorRef.current?.selectionEnd ?? 0
    let index
    if (shownIndex === -1) {
      index = step > 0 ? matches.findIndex(match => match.from >= caret) : [...matches].reverse().findIndex(match => match.to <= caret)
      if (step < 0 && index !== -1) index = matches.length - 1 - index
      if (index === -1) index = step > 0 ? 0 : matches.length - 1
    } else {
      index = (shownIndex + step + matches.length) % matches.length
    }
    setCurrent(index)
    onSelectMatch(matches[index], { keepFocus: true })
  }
  const replaceCurrent = () => {
    const match = matches[shownIndex]
    if (!match) { go(1); return }
    selectNextAfterReplace.current = true
    onReplaceCurrent(match, replacementFor(match, replacement, options.regex))
  }
  const replaceAll = () => {
    if (!regex) return
    if (allFiles) onReplaceAllFiles(regex, replacement, options.regex)
    else onReplaceAllHere(regex, replacement, options.regex)
    setCurrent(-1)
  }
  const toggle = key => { setOptions(value => ({ ...value, [key]: !value[key] })); setCurrent(-1) }

  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    else if (event.key === 'Enter' && event.currentTarget === findRef.current) { event.preventDefault(); go(event.shiftKey ? -1 : 1) }
    else if (event.key === 'Enter') { event.preventDefault(); if (event.metaKey || event.ctrlKey || event.altKey) replaceAll(); else replaceCurrent() }
  }

  const status = error ? error
    : !query ? 'Type to search'
      : matches.length === 0 ? 'No results'
        : shownIndex >= 0 ? `${shownIndex + 1} of ${matches.length}` : `${matches.length} result${matches.length === 1 ? '' : 's'}`

  return (
    <div className="find-replace no-print" role="search" aria-label="Find and replace in the editor">
      <div className="find-replace-row">
        <label className={`find-replace-field${error ? ' has-error' : ''}`}>
          <span className="sr-only">Find</span>
          <input ref={findRef} value={query} onChange={event => { setQuery(event.target.value); setCurrent(-1) }} onKeyDown={onKeyDown}
            placeholder="Find" aria-label="Find" aria-invalid={Boolean(error)} spellCheck={false} />
          <span className="find-replace-toggles">
            <button type="button" className={options.matchCase ? 'is-active' : ''} onClick={() => toggle('matchCase')} aria-pressed={options.matchCase} title="Match case" aria-label="Match case"><CaseSensitive size={14} /></button>
            <button type="button" className={options.wholeWord ? 'is-active' : ''} onClick={() => toggle('wholeWord')} aria-pressed={options.wholeWord} title="Whole word" aria-label="Whole word"><WholeWord size={14} /></button>
            <button type="button" className={options.regex ? 'is-active' : ''} onClick={() => toggle('regex')} aria-pressed={options.regex} title="Regular expression" aria-label="Regular expression"><Regex size={14} /></button>
          </span>
        </label>
        <span className={`find-replace-status${error ? ' is-error' : ''}`} aria-live="polite">{status}</span>
        <button type="button" className="find-replace-btn" onClick={() => go(-1)} disabled={!matches.length} aria-label="Previous match" title="Previous (Shift+Enter)"><ChevronUp size={14} /></button>
        <button type="button" className="find-replace-btn" onClick={() => go(1)} disabled={!matches.length} aria-label="Next match" title="Next (Enter)"><ChevronDown size={14} /></button>
        <button type="button" className="find-replace-btn" onClick={onClose} aria-label="Close find and replace" title="Close (Esc)"><X size={14} /></button>
      </div>
      <div className="find-replace-row">
        <label className="find-replace-field">
          <span className="sr-only">Replace</span>
          <input value={replacement} onChange={event => setReplacement(event.target.value)} onKeyDown={onKeyDown}
            placeholder={options.regex ? 'Replace ($1 for groups)' : 'Replace'} aria-label="Replace with" spellCheck={false} />
        </label>
        <button type="button" className="find-replace-action" onClick={replaceCurrent} disabled={!matches.length} title="Replace (Enter)"><Replace size={13} />Replace</button>
        <button type="button" className="find-replace-action" onClick={replaceAll} disabled={!matches.length && !otherFileCount.matches}
          title={allFiles ? 'Replace in all open files' : 'Replace all in this file'}><ReplaceAll size={13} />{allFiles ? 'All files' : 'All'}</button>
        <label className="find-replace-scope" title="Replace all across every open file">
          <input type="checkbox" checked={allFiles} onChange={event => setAllFiles(event.target.checked)} />
          <span>All open files{allFiles && otherFileCount.matches ? ` (+${otherFileCount.matches} in ${otherFileCount.files})` : ''}</span>
        </label>
      </div>
    </div>
  )
}
