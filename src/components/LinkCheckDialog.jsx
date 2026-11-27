import { useMemo, useRef, useState } from 'react'
import { CircleHelp, FileText, Link2, TriangleAlert, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import EmptyState from './EmptyState'
import { checkWorkspaceLinks } from '../linkChecker'

const FILTERS = [['all', 'All'], ['broken', 'Broken links'], ['attachment', 'Missing images'], ['orphan', 'Orphaned files']]

export default function LinkCheckDialog({ files, attachmentPaths, onOpen, onClose }) {
  const [filter, setFilter] = useState('all')
  const closeRef = useRef(null)
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })
  const issues = useMemo(() => checkWorkspaceLinks(files, attachmentPaths), [files, attachmentPaths])
  const visible = filter === 'all' ? issues : issues.filter(issue => issue.type === filter)
  const counts = Object.fromEntries(FILTERS.map(([id]) => [id, id === 'all' ? issues.length : issues.filter(issue => issue.type === id).length]))

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="link-check-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="link-check-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="link-check-title" className="flex items-center gap-2"><Link2 size={16} style={{ color: 'var(--accent)' }} />Check workspace links</h2>
            <p>{files.length} document{files.length === 1 ? '' : 's'} checked · {counts.broken} broken link{counts.broken === 1 ? '' : 's'} · {counts.attachment} missing image{counts.attachment === 1 ? '' : 's'} · {counts.orphan} orphan{counts.orphan === 1 ? '' : 's'}</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close link check"><X size={15} /></button>
        </div>
        <div className="pdf-segmented link-check-filters" role="radiogroup" aria-label="Filter link issues">
          {FILTERS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={filter === id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label} <span className="tasks-count">{counts[id]}</span></button>)}
        </div>
        <div className="link-check-body">
          {visible.length ? <ul className="link-check-list">{visible.map(issue => (
            <li key={issue.id} className={`link-check-item is-${issue.type}`}>
              {issue.type === 'orphan' ? <CircleHelp size={14} /> : <TriangleAlert size={14} />}
              <span><strong>{issue.message}</strong><small>In {issue.sourceName}</small></span>
              <button type="button" className="reader-chip" onClick={() => onOpen(issue.sourceId)}><FileText size={12} />Open source</button>
            </li>
          ))}</ul> : <EmptyState compact icon={Link2} title="No issues in this view" text="Workspace links, image attachments and inbound links look good." />}
        </div>
      </div>
    </div>
  )
}
