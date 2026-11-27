import { useMemo, useRef, useState } from 'react'
import { CalendarDays, FileText, ListChecks, Search, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { TASK_FILTERS, compareTasks, daysUntil, dueLabel, dueState } from '../tasks'
import EmptyState from './EmptyState'

const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' }

/**
 * Every task in the workspace in one place. `tasks`: [{ ...task, fileId, fileName, closed }].
 * Ticking calls onToggle(task); clicking a task's text calls onOpen(task).
 */
export default function TasksPanel({ tasks, documents = [], onToggle, onOpen, onOpenDocument, onSetDocumentDue, onToggleDocumentReminder, onClose }) {
  const [mode, setMode] = useState('tasks')
  const [filter, setFilter] = useState(() => (tasks.some(task => !task.checked) ? 'open' : 'all'))
  const [groupBy, setGroupBy] = useState('document')
  const [tag, setTag] = useState('')
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  useDialogKeys(onClose, { focus: () => searchRef.current?.focus() })
  const today = useMemo(() => new Date(), [])
  const bodyRef = useRef(null)
  // Ticking can remove the task from the current view: keep keyboard focus in the panel,
  // on the next task's checkbox (or the search box).
  const toggle = (task, box) => {
    const boxes = [...(bodyRef.current?.querySelectorAll('input[type="checkbox"]') ?? [])]
    const index = boxes.indexOf(box)
    onToggle(task)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (box.isConnected) { box.focus({ preventScroll: true }); return }
      const next = [...(bodyRef.current?.querySelectorAll('input[type="checkbox"]') ?? [])]
      ;(next[Math.min(index, next.length - 1)] ?? searchRef.current)?.focus({ preventScroll: true })
    }))
  }

  const tags = useMemo(() => [...new Set(tasks.flatMap(task => task.tags))].sort(), [tasks])
  const counts = useMemo(() => Object.fromEntries(TASK_FILTERS.map(item => [item.id, tasks.filter(task => item.test(task, today)).length])), [tasks, today])
  const visible = useMemo(() => {
    const test = TASK_FILTERS.find(item => item.id === filter)?.test ?? (() => true)
    const q = query.trim().toLowerCase()
    return tasks
      .filter(task => test(task, today) && (!tag || task.tags.includes(tag)) && (!q || task.text.toLowerCase().includes(q) || task.fileName.toLowerCase().includes(q)))
  }, [tasks, filter, tag, query, today])

  const groups = useMemo(() => {
    if (groupBy === 'due') {
      const bucket = task => {
        if (!task.due) return 'No due date'
        const days = daysUntil(task.due, today)
        return days < 0 ? 'Overdue' : days === 0 ? 'Today' : days <= 7 ? 'This week' : 'Later'
      }
      const order = ['Overdue', 'Today', 'This week', 'Later', 'No due date']
      const sorted = [...visible].sort((a, b) => compareTasks(a, b, today))
      return order.map(name => ({ name, items: sorted.filter(task => bucket(task) === name) })).filter(group => group.items.length)
    }
    const byFile = new Map()
    for (const task of visible) {
      if (!byFile.has(task.fileId)) byFile.set(task.fileId, { name: task.fileName, closed: task.closed, items: [] })
      byFile.get(task.fileId).items.push(task)
    }
    return [...byFile.values()]
  }, [visible, groupBy, today])

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="tasks-panel anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="tasks-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="tasks-title" className="flex items-center gap-2"><ListChecks size={16} style={{ color: 'var(--accent)' }} />Tasks</h2>
            <p>Plan task due dates and document deadlines across your workspace.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close tasks" data-tooltip="Close (Esc)"><X size={15} /></button>
        </div>
        <div className="agenda-mode pdf-segmented" role="radiogroup" aria-label="Agenda view">
          <button type="button" role="radio" aria-checked={mode === 'tasks'} className={mode === 'tasks' ? 'is-active' : ''} onClick={() => setMode('tasks')}>Tasks</button>
          <button type="button" role="radio" aria-checked={mode === 'documents'} className={mode === 'documents' ? 'is-active' : ''} onClick={() => setMode('documents')}>Document deadlines</button>
        </div>
        {mode === 'documents' ? (
          <div className="tasks-body agenda-documents">
            <label className="tasks-search agenda-document-search"><Search size={13} aria-hidden="true" /><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a document" aria-label="Find a document deadline" /></label>
            {documents.filter(doc => !query.trim() || `${doc.title} ${doc.name}`.toLowerCase().includes(query.trim().toLowerCase())).length ? (
              <ul className="agenda-document-list">{documents.filter(doc => !query.trim() || `${doc.title} ${doc.name}`.toLowerCase().includes(query.trim().toLowerCase())).map(doc => (
                <li key={doc.id}>
                  <button type="button" className="agenda-document-open" onClick={() => onOpenDocument(doc.id)}><FileText size={13} /><span>{doc.title}</span><small>{doc.name}</small></button>
                  <label><span className="sr-only">Due date for {doc.title}</span><input type="date" value={doc.due || ''} onChange={event => onSetDocumentDue(doc.id, event.target.value)} /></label>
                  {doc.due && <span className={`tasks-chip is-${dueState(doc.due, today)}`}>{dueLabel(doc.due, today)}</span>}
                  <label className="agenda-reminder"><input type="checkbox" checked={doc.reminder} onChange={event => onToggleDocumentReminder(doc.id, event.target.checked)} /><span>Remind me</span></label>
                  {doc.closed && <span className="tasks-closed">closed</span>}
                </li>
              ))}</ul>
            ) : <EmptyState compact icon={CalendarDays} title="No matching documents" text="Try another search." />}
          </div>
        ) : <>
        <div className="tasks-controls">
          <div className="pdf-segmented tasks-filters" role="radiogroup" aria-label="Show">
            {TASK_FILTERS.map(item => (
              <button key={item.id} type="button" role="radio" aria-checked={filter === item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)}>
                {item.label}<span className="tasks-count">{counts[item.id]}</span>
              </button>
            ))}
          </div>
          <div className="tasks-row">
            <label className="tasks-search">
              <Search size={13} aria-hidden="true" />
              <input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a task or document" aria-label="Find a task or document" />
            </label>
            {tags.length > 0 && (
              <span className="settings-select-wrap">
                <select className="settings-select" value={tag} onChange={event => setTag(event.target.value)} aria-label="Tag">
                  <option value="">All tags</option>
                  {tags.map(name => <option key={name} value={name}>#{name}</option>)}
                </select>
              </span>
            )}
            <div className="pdf-segmented" role="radiogroup" aria-label="Group by">
              {[['document', 'By document'], ['due', 'By due date']].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={groupBy === id} className={groupBy === id ? 'is-active' : ''} onClick={() => setGroupBy(id)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="tasks-body" ref={bodyRef}>
          {groups.length === 0 ? (
            <EmptyState compact icon={ListChecks} title={tasks.length ? 'Nothing here' : 'No tasks yet'}
              text={tasks.length ? 'No tasks match this view.' : 'Write a task list item like "- [ ] Send the report due:2026-12-01" in any document.'} />
          ) : groups.map(group => (
            <section key={group.name} className="tasks-group" aria-label={group.name}>
              <h3>
                {groupBy === 'document' ? <FileText size={12} aria-hidden="true" /> : <CalendarDays size={12} aria-hidden="true" />}
                <span>{group.name}</span>
                {group.closed && <span className="tasks-closed">closed</span>}
                <span className="tasks-count">{group.items.length}</span>
              </h3>
              <ul>
                {group.items.map(task => (
                  <li key={`${task.fileId}-${task.offset}`} className={`tasks-item${task.checked ? ' is-done' : ''}`} style={{ '--depth': groupBy === 'document' ? task.depth : 0 }}>
                    <input type="checkbox" checked={task.checked} onChange={event => toggle(task, event.currentTarget)} aria-label={`${task.checked ? 'Mark as not done' : 'Mark as done'}: ${task.text}`} />
                    <button type="button" className="tasks-text" onClick={() => onOpen(task)} data-tip={`Open ${task.fileName} at this task`}>
                      <span>{task.text}</span>
                      {groupBy === 'due' && <span className="tasks-file">{task.fileName}</span>}
                    </button>
                    <span className="tasks-meta">
                      {task.due && <span className={`tasks-chip is-${dueState(task.due, today)}`}>{dueLabel(task.due, today)}</span>}
                      {task.priority && <span className={`tasks-chip is-priority-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>}
                      {task.tags.map(name => (
                        <button key={name} type="button" className="tasks-chip is-tag" onClick={() => setTag(name)} aria-label={`Show only #${name}`}>#{name}</button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        </>}
      </div>
    </div>
  )
}
