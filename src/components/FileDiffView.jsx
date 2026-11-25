import { useEffect, useRef, useState } from 'react'
import { useDialogKeys } from '../useDialogKeys'
import { ArrowLeftRight, Check, ChevronDown, Eye, GitCompare, Pencil, X } from '../icons'
import { diffLines } from '../documentDiff'

function DiffPane({ title, files, selectedId, otherSelectedId, onSelect, rows, side, scrollRef, onSyncScroll, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const selectRef = useRef(null)
  const availableFiles = files.filter(file => file.id === selectedId || file.id !== otherSelectedId)
  const selectedFile = availableFiles.find(file => file.id === selectedId)

  useEffect(() => {
    if (!selectOpen) return undefined
    const closeOnOutsideClick = event => {
      if (!selectRef.current?.contains(event.target)) setSelectOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setSelectOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectOpen])

  return (
    <section className="diff-pane">
      <div className="diff-pane-header">
        <span className="diff-pane-title">
          {title}
          {onEdit && selectedFile && (
            <button type="button" className={`diff-edit-toggle${editing ? ' is-on' : ''}`} onClick={() => setEditing(value => !value)}
              aria-pressed={editing} aria-label={editing ? `Show differences for ${title.toLowerCase()} file` : `Edit ${title.toLowerCase()} file`}>
              {editing ? <><Eye size={12} /> Differences</> : <><Pencil size={12} /> Edit</>}
            </button>
          )}
        </span>
        <div className="diff-file-select-wrap" ref={selectRef}>
          <button
            type="button"
            className="diff-file-select-trigger"
            aria-label={`${title} file: ${selectedFile?.name || 'Select file'}`}
            aria-haspopup="listbox"
            aria-expanded={selectOpen}
            onClick={() => setSelectOpen(open => !open)}
          >
            <span>{selectedFile?.name || 'Select file'}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {selectOpen && (
            <div className="diff-file-select-menu" role="listbox" aria-label={`${title} file options`}>
              {availableFiles.map(file => (
                <button
                  type="button"
                  role="option"
                  aria-selected={file.id === selectedId}
                  className={`diff-file-select-option${file.id === selectedId ? ' is-selected' : ''}`}
                  key={file.id}
                  onClick={() => { onSelect(file.id); setSelectOpen(false) }}
                >
                  <span>{file.name}</span>
                  {file.id === selectedId && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {editing && selectedFile ? (
        <textarea
          className="diff-editor"
          value={selectedFile.content}
          onChange={event => onEdit(selectedFile.id, event.target.value)}
          spellCheck={false}
          aria-label={`Edit ${selectedFile.name}`}
        />
      ) : (
      <div className="diff-lines" ref={scrollRef} onScroll={onSyncScroll} tabIndex={0} aria-label={`${title} lines`}>
        {!rows.length && <div className="diff-pending">Calculating comparison…</div>}
        {rows.map((row, index) => {
          const line = row[side]
          const lineNumber = row[`${side}Line`]
          return (
            <div className={`diff-line diff-line-${row.kind} diff-side-${side}`} key={`${index}-${lineNumber ?? 'blank'}`}>
              <span className="diff-line-number">{lineNumber ?? ''}</span>
              <code>{line ?? ''}</code>
            </div>
          )
        })}
      </div>
      )}
    </section>
  )
}

export default function FileDiffView({ files, activeFileId, compareWithId, onClose, onEdit }) {
  const initialLeftId = activeFileId || files[0]?.id
  const initialRightId = (compareWithId && compareWithId !== initialLeftId && files.some(file => file.id === compareWithId) ? compareWithId : null)
    || files.find(file => file.id !== initialLeftId)?.id || files[1]?.id
  const [leftId, setLeftId] = useState(initialLeftId)
  const [rightId, setRightId] = useState(initialRightId)
  const [diffResult, setDiffResult] = useState(null)
  const diffRequestRef = useRef(0)
  const leftScrollRef = useRef(null)
  const rightScrollRef = useRef(null)
  const syncLockRef = useRef(false)
  const left = files.find(file => file.id === leftId) || files[0]
  const right = files.find(file => file.id === rightId) || files.find(file => file.id !== left?.id) || files[0]
  const leftText = left?.content || ''
  const rightText = right?.content || ''
  // Keep showing the last result while a new comparison is calculated (no flicker while editing).
  const rows = diffResult?.left?.id === left?.id && diffResult?.right?.id === right?.id ? diffResult.rows : []
  useEffect(() => {
    const id = ++diffRequestRef.current
    let timer
    let worker
    const applyDiff = rows => { if (diffRequestRef.current === id) setDiffResult({ left, right, rows }) }
    const start = () => {
    if ('Worker' in window) {
      try {
        worker = new Worker(new URL('../workers/documentWorker.js', import.meta.url), { type: 'module' })
        worker.onmessage = event => { if (event.data.id === id) applyDiff(event.data.rows) }
        worker.onerror = () => {
          worker?.terminate()
          timer = setTimeout(() => applyDiff(diffLines(leftText, rightText)), 0)
        }
        worker.postMessage({ id, operation: 'diff', leftText, rightText })
      } catch { timer = setTimeout(() => applyDiff(diffLines(leftText, rightText)), 0) }
    } else {
      timer = setTimeout(() => applyDiff(diffLines(leftText, rightText)), 0)
    }
    }
    // Wait for a pause in typing before re-comparing.
    const delay = setTimeout(start, diffResult ? 200 : 0)
    return () => { clearTimeout(delay); worker?.terminate(); if (timer) clearTimeout(timer) }
  }, [leftText, rightText, left, right]) // eslint-disable-line react-hooks/exhaustive-deps
  const changed = rows.filter(row => ['remove', 'add', 'change', 'summary'].includes(row.kind)).length
  const syncScroll = (source, target) => {
    if (syncLockRef.current || !source.current || !target.current) return
    syncLockRef.current = true
    target.current.scrollTop = source.current.scrollTop
    requestAnimationFrame(() => { syncLockRef.current = false })
  }
  useDialogKeys(onClose)

  return (
    <div className="diff-backdrop no-print" role="dialog" aria-modal="true" aria-label="Compare open files" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="diff-dialog">
        <header className="diff-dialog-header">
          <div className="flex items-center gap-2 min-w-0">
            <GitCompare size={16} style={{ color: 'var(--accent)' }} />
            <strong>Compare files</strong>
            <span className="diff-summary">{changed} changed {changed === 1 ? 'line' : 'lines'}</span>
          </div>
          <button type="button" className="btn-icon !p-1" onClick={onClose} aria-label="Close comparison"><X size={15} /></button>
        </header>
        <div className="diff-panes">
          <DiffPane title="Original" files={files} selectedId={left?.id} otherSelectedId={right?.id} onSelect={id => { if (id !== right?.id) setLeftId(id) }} rows={rows} side="left" scrollRef={leftScrollRef} onSyncScroll={() => syncScroll(leftScrollRef, rightScrollRef)} onEdit={onEdit} />
          <div className="diff-gutter" aria-hidden="true"><ArrowLeftRight size={13} /></div>
          <DiffPane title="Changed" files={files} selectedId={right?.id} otherSelectedId={left?.id} onSelect={id => { if (id !== left?.id) setRightId(id) }} rows={rows} side="right" scrollRef={rightScrollRef} onSyncScroll={() => syncScroll(rightScrollRef, leftScrollRef)} onEdit={onEdit} />
        </div>
      </div>
    </div>
  )
}
