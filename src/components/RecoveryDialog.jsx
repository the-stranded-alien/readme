import { useMemo, useRef } from 'react'
import { HardDrive, History, RotateCcw, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import EmptyState from './EmptyState'
import { isModifiedFromDisk } from '../fileUtils'

const relative = at => {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function RecoveryDialog({ files, snapshots, loading, onOpen, onRestore, onClose }) {
  const closeRef = useRef(null)
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })
  const current = useMemo(() => new Map(files.map(file => [file.id, file])), [files])
  const unsaved = files.filter(isModifiedFromDisk)
  const recoverable = Object.entries(snapshots ?? {}).flatMap(([fileId, history]) => {
    const file = current.get(fileId)
    if (!file) return []
    return (Array.isArray(history) ? history : [])
      .filter(snapshot => snapshot.content !== file.content)
      .map(snapshot => ({ file, snapshot }))
  }).sort((a, b) => b.snapshot.at - a.snapshot.at).slice(0, 60)

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="recovery-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <div className="pdf-dialog-header">
          <div><h2 id="recovery-title" className="flex items-center gap-2"><HardDrive size={16} style={{ color: 'var(--accent)' }} />Recovery &amp; unsaved changes</h2>
            <p>Browser autosave keeps the workspace current. Recovery snapshots preserve earlier versions; disk files can still have changes waiting to be written.</p></div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close recovery"><X size={15} /></button>
        </div>
        <div className="recovery-body">
          {unsaved.length > 0 && <section className="recovery-section"><h3>Changes not saved to disk ({unsaved.length})</h3><ul>
            {unsaved.map(file => <li key={`disk-${file.id}`}><span><strong>{file.name}</strong><small>Latest edits are safe in this browser; use Save to write them to disk.</small></span><button type="button" className="reader-chip" onClick={() => onOpen(file.id)}>Open file</button></li>)}
          </ul></section>}
          <section className="recovery-section"><h3>Earlier recoverable versions ({loading ? '…' : recoverable.length})</h3>
            {loading ? <p className="history-empty">Loading recovery snapshots…</p> : recoverable.length ? <ul>{recoverable.map(({ file, snapshot }) => <li key={`${file.id}-${snapshot.id}`}>
              <span><strong>{file.name}</strong><small><History size={11} /> {snapshot.reason} · {relative(snapshot.at)}</small></span>
              <button type="button" className="reader-chip" onClick={() => onOpen(file.id)}>Open</button>
              <button type="button" className="reader-chip" onClick={() => onRestore(file.id, snapshot)}><RotateCcw size={12} />Restore</button>
            </li>)}</ul> : <EmptyState compact icon={History} title="No earlier versions to recover" text="Recovery snapshots appear here after you edit a file and pause." />}
          </section>
        </div>
      </div>
    </div>
  )
}
