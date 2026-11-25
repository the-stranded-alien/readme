import { useEffect, useMemo, useRef, useState } from 'react'
import { GitCompare, History, RotateCcw, X } from 'lucide-react'
import { diffLines } from '../documentDiff'

const relativeTime = at => {
  const seconds = Math.round((Date.now() - at) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
const words = text => text.match(/\S+/g)?.length ?? 0

export default function HistoryDialog({ fileName, current, snapshots, loading, onCompare, onRestore, onSnapshot, onClose }) {
  const [selectedId, setSelectedId] = useState(null)
  const closeRef = useRef(null)
  const selected = snapshots.find(snapshot => snapshot.id === selectedId) ?? snapshots[0] ?? null
  const stats = useMemo(() => {
    if (!selected) return null
    const rows = diffLines(selected.content, current)
    return {
      added: rows.filter(row => row.kind === 'add').length,
      removed: rows.filter(row => row.kind === 'remove').length,
      changed: rows.filter(row => row.kind === 'change').length,
    }
  }, [selected, current])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="history-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="history-title" className="flex items-center gap-2"><History size={16} style={{ color: 'var(--accent)' }} />Version history</h2>
            <p>{fileName} · snapshots are taken when you save, every 10 minutes of editing, before restores, and on demand</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close version history"><X size={15} /></button>
        </div>
        <div className="history-body">
          {loading ? <p className="history-empty">Loading…</p> : snapshots.length === 0 ? (
            <p className="history-empty">No snapshots yet for this file.</p>
          ) : (
            <ul className="history-list" role="listbox" aria-label="Snapshots">
              {snapshots.map(snapshot => {
                const delta = words(current) - words(snapshot.content)
                return (
                  <li key={snapshot.id} role="option" aria-selected={selected?.id === snapshot.id}
                    className={`history-item${selected?.id === snapshot.id ? ' is-selected' : ''}`}
                    tabIndex={0}
                    onClick={() => setSelectedId(snapshot.id)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(snapshot.id) } }}>
                    <span className="history-time">{relativeTime(snapshot.at)}</span>
                    <span className="history-reason">{snapshot.reason}</span>
                    <span className="history-words">{words(snapshot.content).toLocaleString()} words{delta !== 0 && <em>{delta > 0 ? ` · ${delta} added since` : ` · ${-delta} removed since`}</em>}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {selected && (
            <div className="history-preview">
              <div className="history-preview-meta">
                <strong>{new Date(selected.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                {stats && <span>{stats.added + stats.removed + stats.changed === 0 ? 'Same as the current version' : `${stats.added} added · ${stats.removed} removed · ${stats.changed} changed lines vs current`}</span>}
              </div>
              <pre className="history-preview-text">{selected.content.slice(0, 4000)}{selected.content.length > 4000 ? '\n…' : ''}</pre>
            </div>
          )}
        </div>
        <div className="pdf-dialog-footer">
          <button type="button" className="reader-chip" onClick={onSnapshot}>Save snapshot now</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="reader-chip" disabled={!selected} onClick={() => onCompare(selected)}><GitCompare size={12} /> Compare with current</button>
          <button type="button" className="pdf-dialog-primary" disabled={!selected} onClick={() => onRestore(selected)}><RotateCcw size={13} />Restore this version</button>
        </div>
      </div>
    </div>
  )
}
