import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CaseSensitive, FileText, Search, X } from '../icons'

const MAX_PER_FILE = 50
const MAX_TOTAL = 400

function findMatches(files, query, caseSensitive) {
  if (query.trim().length < 2) return { groups: [], total: 0, truncated: false }
  const needle = caseSensitive ? query : query.toLowerCase()
  const groups = []
  let total = 0
  let truncated = false
  for (const file of files) {
    const lines = file.content.split('\n')
    const matches = []
    for (let i = 0; i < lines.length && matches.length < MAX_PER_FILE; i += 1) {
      const haystack = caseSensitive ? lines[i] : lines[i].toLowerCase()
      let from = 0
      let column
      while ((column = haystack.indexOf(needle, from)) !== -1 && matches.length < MAX_PER_FILE) {
        matches.push({ line: i + 1, column, text: lines[i] })
        from = column + needle.length
      }
    }
    if (matches.length) {
      groups.push({ file, matches })
      total += matches.length
      if (total >= MAX_TOTAL) { truncated = true; break }
    }
  }
  return { groups, total, truncated }
}

function Snippet({ text, column, length }) {
  const start = Math.max(0, column - 40)
  const end = Math.min(text.length, column + length + 80)
  return (
    <span className="global-search-snippet">
      {start > 0 && '…'}{text.slice(start, column)}
      <mark>{text.slice(column, column + length)}</mark>
      {text.slice(column + length, end)}{end < text.length && '…'}
    </span>
  )
}

export default function GlobalSearch({ files, activeFileId, initialQuery = '', onOpen, onClose }) {
  const [query, setQuery] = useState(initialQuery)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const deferredQuery = useDeferredValue(query)
  const { groups, total, truncated } = useMemo(() => findMatches(files, deferredQuery, caseSensitive), [files, deferredQuery, caseSensitive])
  const flat = useMemo(() => groups.flatMap(group => group.matches.map(match => ({ ...match, file: group.file }))), [groups])
  const groupOffsets = useMemo(() => groups.reduce((offsets, group, i) => [...offsets, i === 0 ? 0 : offsets[i - 1] + groups[i - 1].matches.length], []), [groups])
  const selected = Math.min(highlight, Math.max(0, flat.length - 1))

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const open = match => onOpen(match.file.id, match.line, match.column, deferredQuery.length, deferredQuery)
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((selected + 1) % Math.max(1, flat.length)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((selected - 1 + flat.length) % Math.max(1, flat.length)) }
    else if (event.key === 'Enter' && flat[selected]) { event.preventDefault(); open(flat[selected]) }
  }

  return (
    <div className="pdf-dialog-backdrop global-search-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="global-search anim-pop-in" role="dialog" aria-modal="true" aria-label="Search in all files">
        <div className="global-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => { setQuery(event.target.value); setHighlight(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search in all open files…"
            aria-label="Search in all open files"
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-results"
          />
          <button type="button" className={`global-search-case${caseSensitive ? ' is-active' : ''}`} onClick={() => setCaseSensitive(value => !value)}
            aria-pressed={caseSensitive} aria-label="Match case" title="Match case">
            <CaseSensitive size={16} />
          </button>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close search"><X size={15} /></button>
        </div>
        <div className="global-search-summary" aria-live="polite">
          {deferredQuery.trim().length < 2
            ? 'Type at least two characters'
            : `${total}${truncated ? '+' : ''} result${total === 1 ? '' : 's'} in ${groups.length} file${groups.length === 1 ? '' : 's'}`}
        </div>
        <div className="global-search-results" id="global-search-results" ref={listRef} role="listbox" aria-label="Results">
          {groups.map((group, groupIndex) => (
            <div key={group.file.id} className="global-search-group" role="group" aria-label={group.file.name}>
              <div className={`global-search-file${group.file.id === activeFileId ? ' is-active' : ''}`}>
                <FileText size={13} aria-hidden="true" />
                <span>{group.file.name}</span>
                <span className="global-search-count">{group.matches.length}</span>
              </div>
              {group.matches.map((match, matchIndex) => {
                const itemIndex = groupOffsets[groupIndex] + matchIndex
                return (
                  <div
                    key={`${match.line}:${match.column}`}
                    data-index={itemIndex}
                    role="option"
                    aria-selected={itemIndex === selected}
                    className={`global-search-hit${itemIndex === selected ? ' is-highlighted' : ''}`}
                    onMouseEnter={() => setHighlight(itemIndex)}
                    onClick={() => open({ ...match, file: group.file })}
                  >
                    <span className="global-search-line">{match.line}</span>
                    <Snippet text={match.text} column={match.column} length={deferredQuery.length} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
