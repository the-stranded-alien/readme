import { useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, FileText, Link2, ListChecks, Plus, Trash2, TriangleAlert, X } from '../icons'
import { documentInfo } from '../library'
import { healthIssues } from '../dashboardHealth'
import { useDialogKeys } from '../useDialogKeys'

const makeDashboard = title => ({ id: `dash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title, documentIds: [], createdAt: Date.now() })

export default function DashboardDialog({ dashboards, documents, tasks, onCreate, onUpdate, onDelete, onOpenDocument, onSetDocumentDue, onClose }) {
  const closeRef = useRef(null)
  const [selectedId, setSelectedId] = useState(dashboards[0]?.id || '')
  const [draftTitle, setDraftTitle] = useState('')
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })
  const dashboard = dashboards.find(item => item.id === selectedId) || dashboards[0]
  const folders = useMemo(() => [...new Set(documents.flatMap(file => {
    const parts = file.name.split('/').slice(0, -1)
    return parts.map((_part, index) => parts.slice(0, index + 1).join('/'))
  }))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [documents])
  const selectedDocs = useMemo(() => {
    const ids = new Set(dashboard?.documentIds || [])
    const excluded = new Set(dashboard?.excludedDocumentIds || [])
    const folderPaths = dashboard?.folderPaths || []
    return documents.filter(file => {
      const inFolder = folderPaths.some(path => file.name.startsWith(`${path}/`))
      return !excluded.has(file.id) && (ids.has(file.id) || inFolder)
    })
  }, [dashboard, documents])
  const selectedIds = new Set(selectedDocs.map(file => file.id))
  const dashboardTasks = tasks.filter(task => selectedIds.has(task.fileId))
  const deadlines = selectedDocs.map(file => ({ file, due: documentInfo(file).due })).filter(item => item.due).sort((a, b) => a.due.localeCompare(b.due))
  const issues = selectedDocs.flatMap(file => healthIssues(file).map(issue => ({ ...issue, file })))
  const linkCount = selectedDocs.reduce((count, file) => count + [...file.content.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)].length, 0)
  const links = selectedDocs.flatMap(file => [...file.content.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)].map(match => ({ target: match[2] || match[1], file })))
  const create = () => {
    const title = draftTitle.trim() || 'New dashboard'
    const next = makeDashboard(title)
    onCreate(next)
    setSelectedId(next.id)
    setDraftTitle('')
  }
  const update = changes => dashboard && onUpdate(dashboard.id, changes)
  const toggleDocument = id => {
    const ids = new Set(dashboard?.documentIds || [])
    const excluded = new Set(dashboard?.excludedDocumentIds || [])
    if (selectedIds.has(id)) {
      if (ids.has(id)) ids.delete(id)
      if ((dashboard?.folderPaths || []).some(path => documents.find(file => file.id === id)?.name.startsWith(`${path}/`))) excluded.add(id)
    } else {
      ids.add(id)
      excluded.delete(id)
    }
    update({ documentIds: [...ids], excludedDocumentIds: [...excluded] })
  }
  const toggleFolder = path => {
    const paths = new Set(dashboard?.folderPaths || [])
    const ids = new Set(dashboard?.documentIds || [])
    const excluded = new Set(dashboard?.excludedDocumentIds || [])
    const folderDocs = documents.filter(file => file.name.startsWith(`${path}/`))
    const isSelected = folderDocs.length > 0 && folderDocs.every(file => selectedIds.has(file.id))
    if (isSelected) {
      paths.delete(path)
      folderDocs.forEach(file => {
        ids.delete(file.id)
        if ([...paths].some(parent => file.name.startsWith(`${parent}/`))) excluded.add(file.id)
      })
    } else {
      paths.add(path)
      folderDocs.forEach(file => excluded.delete(file.id))
    }
    update({ folderPaths: [...paths], documentIds: [...ids], excludedDocumentIds: [...excluded] })
  }

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print dashboard-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dashboard-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="dashboard-title">
        <header className="dashboard-header">
          <div className="dashboard-title-icon"><FileText size={17} /></div>
          <div><h2 id="dashboard-title">Document dashboards</h2><p>Group documents, tasks, deadlines and health checks by project.</p></div>
          <button ref={closeRef} type="button" className="btn-icon" aria-label="Close dashboards" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="dashboard-layout">
          <aside className="dashboard-sidebar" aria-label="Dashboards">
            <div className="dashboard-sidebar-heading"><strong>Projects</strong><span>{dashboards.length}</span></div>
            <nav>{dashboards.map(item => <button key={item.id} type="button" className={dashboard?.id === item.id ? 'is-active' : ''} onClick={() => setSelectedId(item.id)}>{item.title}</button>)}</nav>
            <form className="dashboard-create" onSubmit={event => { event.preventDefault(); create() }}>
              <input value={draftTitle} onChange={event => setDraftTitle(event.target.value)} placeholder="Project name" aria-label="New dashboard name" />
              <button type="submit" aria-label="Create dashboard"><Plus size={15} /></button>
            </form>
          </aside>
          <main className="dashboard-main">
            {dashboard ? <>
              <div className="dashboard-main-heading">
                <input aria-label="Dashboard name" value={dashboard.title} onChange={event => update({ title: event.target.value })} />
                <button type="button" className="dashboard-delete" aria-label="Delete dashboard" onClick={() => { onDelete(dashboard.id); setSelectedId(dashboards.find(item => item.id !== dashboard.id)?.id || '') }}><Trash2 size={14} />Delete</button>
              </div>
              <div className="dashboard-metrics">
                <div><FileText size={15} /><strong>{selectedDocs.length}</strong><span>Documents</span></div>
                <div><ListChecks size={15} /><strong>{dashboardTasks.filter(task => !task.checked).length}</strong><span>Open tasks</span></div>
                <div><CalendarDays size={15} /><strong>{deadlines.length}</strong><span>Deadlines</span></div>
                <div className={!selectedDocs.length ? '' : issues.length ? 'has-issues' : 'is-clear'}>{!selectedDocs.length ? <FileText size={15} /> : issues.length ? <TriangleAlert size={15} /> : <Check size={15} />}<strong>{selectedDocs.length ? issues.length : '—'}</strong><span>Health checks</span></div>
              </div>
              <div className="dashboard-columns">
                <section className="dashboard-card"><h3><FileText size={14} />Project documents</h3>
                  {folders.length > 0 && <><h4 className="dashboard-subheading">Folders</h4><ul className="dashboard-document-list dashboard-folder-list">{folders.map(path => { const folderDocs = documents.filter(file => file.name.startsWith(`${path}/`)); return <li key={path}><label><input type="checkbox" checked={folderDocs.length > 0 && folderDocs.every(file => selectedIds.has(file.id))} onChange={() => toggleFolder(path)} /><span>{path}</span></label><small>{folderDocs.length}</small></li> })}</ul></>}
                  {documents.length ? <><h4 className="dashboard-subheading">Documents</h4><ul className="dashboard-document-list">{documents.map(file => <li key={file.id}><label><input type="checkbox" checked={selectedIds.has(file.id)} onChange={() => toggleDocument(file.id)} /><span>{file.name}</span></label>{selectedIds.has(file.id) && <button type="button" aria-label={`Open ${file.name}`} onClick={() => onOpenDocument(file.id)}><Link2 size={13} /></button>}</li>)}</ul></> : <p className="dashboard-empty">Create or open documents to add them here.</p>}
                </section>
                <div className="dashboard-card-stack">
                  <section className="dashboard-card"><h3><CalendarDays size={14} />Upcoming deadlines <small>{deadlines.length} scheduled</small></h3>
                    {selectedDocs.length ? <ul className="dashboard-deadline-list">{(deadlines.length ? deadlines.map(item => item.file) : selectedDocs).map(file => { const due = documentInfo(file).due; return <li key={file.id} className={due ? '' : 'is-unscheduled'}><span className="dashboard-row-icon"><CalendarDays size={14} /></span><div className="dashboard-row-copy"><button type="button" onClick={() => onOpenDocument(file.id)}>{file.name}</button><span>{due ? new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline set'}</span></div><input type="date" value={due} aria-label={`Deadline for ${file.name}`} onChange={event => onSetDocumentDue(file.id, event.target.value)} /></li> })}</ul> : <p className="dashboard-empty">Add documents or folders to this project to set deadlines.</p>}
                  </section>
                  <section className="dashboard-card"><h3><ListChecks size={14} />Task list <small>{dashboardTasks.length} total</small></h3>
                    {dashboardTasks.length ? <ul className="dashboard-compact-list">{dashboardTasks.filter(task => !task.checked).slice(0, 6).map(task => <li key={`${task.fileId}-${task.offset}`}><span className="dashboard-task-mark" /><div className="dashboard-row-copy"><span>{task.text}</span><button type="button" onClick={() => onOpenDocument(task.fileId)}>{task.fileName}</button></div></li>)}</ul> : <p className="dashboard-empty">No tasks in the selected documents.</p>}
                  </section>
                  <section className="dashboard-card"><h3><Link2 size={14} />Document links <small>{links.length + linkCount} references</small></h3>
                    {links.length ? <ul className="dashboard-compact-list">{links.slice(0, 8).map((link, index) => <li key={`${link.file.id}-${index}`}><button type="button" onClick={() => onOpenDocument(link.file.id)}>{link.target}</button><span>{link.file.name}</span></li>)}</ul> : <p className="dashboard-empty">No internal document links in this project.</p>}
                  </section>
                  <section className="dashboard-card"><h3><TriangleAlert size={14} />Document health</h3>
                    {issues.length ? <><p className="dashboard-health-status has-issues"><TriangleAlert size={14} /><span><strong>{issues.length} items need review</strong><small>Across {selectedDocs.length} selected documents</small></span></p><ul className="dashboard-health-list">{issues.slice(0, 12).map((issue, index) => <li key={`${issue.file.id}-${issue.type}-${index}`}><span className="dashboard-health-mark"><TriangleAlert size={13} /></span><button type="button" onClick={() => onOpenDocument(issue.file.id)}><strong>{issue.file.name}</strong><span>{issue.message}</span></button></li>)}</ul></> : selectedDocs.length ? <p className="dashboard-health-status is-clear"><Check size={15} /><span><strong>Everything looks good</strong><small>Checked {selectedDocs.length} selected document{selectedDocs.length === 1 ? '' : 's'}</small></span></p> : <p className="dashboard-empty">Select documents or folders to check for missing titles, heading jumps, long sections and older dates.</p>}
                  </section>
                </div>
              </div>
            </> : <div className="dashboard-welcome"><FileText size={28} /><strong>Create a project dashboard</strong><span>Choose a name to collect documents, tasks, deadlines and health checks in one place.</span></div>}
          </main>
        </div>
      </section>
    </div>
  )
}
