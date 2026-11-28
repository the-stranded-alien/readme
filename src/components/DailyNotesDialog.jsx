import { useMemo, useRef, useState } from 'react'
import { useDialogKeys } from '../useDialogKeys'
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, FilePlus, Lightbulb, ListChecks, Pencil, Plus, Search, Trash2, X } from '../icons'
import PickerDropdown from './PickerDropdown'

const DAILY_NOTES_ONLY = '__daily_notes_only__'
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const readableDate = value => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export default function DailyNotesDialog({ notes, documents, activeDocumentId, loading = false, onAdd, onUpdate, onDelete, onOrganize, onClose }) {
  const closeRef = useRef(null)
  const today = dateKey(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [draftType, setDraftType] = useState('thought')
  const [destinationId, setDestinationId] = useState(activeDocumentId || documents[0]?.id || '')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })

  const query = search.trim().toLowerCase()
  const matchedNotes = useMemo(() => query ? notes.filter(note => note.text.toLowerCase().includes(query)) : notes, [notes, query])
  const dates = useMemo(() => [...new Set([...(query ? [] : [today]), ...matchedNotes.map(note => note.date)])].sort((a, b) => b.localeCompare(a)), [matchedNotes, query, today])
  const dayNotes = matchedNotes.filter(note => note.date === selectedDate).sort((a, b) => a.createdAt - b.createdAt)
  const effectiveDestinationId = destinationId === DAILY_NOTES_ONLY
    ? DAILY_NOTES_ONLY
    : documents.some(file => file.id === destinationId)
      ? destinationId
      : documents.find(file => file.id === activeDocumentId)?.id || documents[0]?.id || DAILY_NOTES_ONLY
  const selectedDocument = documents.find(file => file.id === effectiveDestinationId)

  const add = () => {
    const text = draft.trim()
    if (!text || loading) return
    onAdd({ date: selectedDate, text, type: draftType })
    setDraft('')
  }
  const goToToday = () => setSelectedDate(today)
  const shiftDate = amount => {
    const date = new Date(`${selectedDate}T12:00:00`)
    date.setDate(date.getDate() + amount)
    setSelectedDate(dateKey(date))
  }

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print daily-notes-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="daily-notes-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="daily-notes-title">
        <header className="daily-notes-header">
          <div className="daily-notes-heading-icon"><CalendarDays size={18} /></div>
          <div className="daily-notes-heading-copy">
            <h2 id="daily-notes-title">Daily notes</h2>
            <p>Quick thoughts and tasks, saved on this device.</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close daily notes"><X size={15} /></button>
        </header>

        <div className="daily-notes-layout">
          <aside className="daily-notes-sidebar">
            <label className="daily-notes-search"><Search size={14} /><input value={search} onChange={event => { setSearch(event.target.value); setSelectedDate(event.target.value.trim() ? '' : today) }} placeholder="Search notes" aria-label="Search daily notes" /></label>
            <div className="daily-notes-date-heading">
              <span>Days</span><button type="button" onClick={goToToday}>Today</button>
            </div>
            <nav className="daily-notes-date-list" aria-label="Note dates">
              {dates.map(date => {
                const count = matchedNotes.filter(note => note.date === date).length
                return <button type="button" key={date} className={selectedDate === date ? 'is-active' : ''} aria-current={selectedDate === date ? 'date' : undefined} onClick={() => setSelectedDate(date)}>
                  <CalendarDays size={14} /><span>{date === today ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><small>{count || ''}</small>
                </button>
              })}
              {!dates.length && <p className="daily-notes-empty-date">No matching notes.</p>}
            </nav>
          </aside>

          <main className="daily-notes-main">
            <div className="daily-notes-day-nav">
              <div><h3>{selectedDate ? readableDate(selectedDate) : 'Search results'}</h3><span>{dayNotes.length} {dayNotes.length === 1 ? 'entry' : 'entries'}</span></div>
              <div className="daily-notes-date-actions">
                <button type="button" className="btn-icon" onClick={() => shiftDate(-1)} aria-label="Previous day"><ChevronLeft size={15} /></button>
                <input type="date" value={selectedDate || today} onChange={event => setSelectedDate(event.target.value)} aria-label="Select notes date" />
                <button type="button" className="btn-icon" onClick={() => shiftDate(1)} aria-label="Next day"><ChevronRight size={15} /></button>
              </div>
            </div>

            <div className="daily-notes-capture">
              <div className="daily-notes-capture-row">
                <PickerDropdown label="Entry type" value={draftType} onChange={setDraftType} disabled={loading} className="daily-notes-type-picker" width={154}
                  options={[{ value: 'thought', label: 'Thought', icon: <Lightbulb size={14} /> }, { value: 'task', label: 'Task', icon: <ListChecks size={14} /> }]} />
                <span className="daily-notes-capture-hint">⌘/Ctrl + Enter to add</span>
              </div>
              <textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); add() } }} placeholder={loading ? 'Loading your saved notes…' : draftType === 'task' ? 'What needs doing?' : 'Capture a thought…'} aria-label={draftType === 'task' ? 'Quick task' : 'Quick thought'} rows={3} disabled={loading} />
              <div className="daily-notes-capture-footer">
                <label>Organize into <PickerDropdown label="Destination document" value={effectiveDestinationId} onChange={setDestinationId} disabled={loading} className="daily-notes-destination-picker"
                  options={[{ value: DAILY_NOTES_ONLY, label: 'Keep in Daily Notes', icon: <CalendarDays size={14} /> }, ...documents.map(file => ({ value: file.id, label: file.name }))]} /></label>
                <button type="button" className="pdf-dialog-primary" onClick={add} disabled={loading || !draft.trim()}><Plus size={14} />Add {draftType === 'task' ? 'task' : 'thought'}</button>
              </div>
            </div>

            <div className="daily-notes-entries" aria-label="Daily note entries">
              {dayNotes.map(note => <article key={note.id} className={`daily-note-entry is-${note.type}${note.done ? ' is-done' : ''}`}>
                {note.type === 'task' && <button type="button" className="daily-note-check" aria-label={note.done ? 'Mark task incomplete' : 'Complete task'} aria-pressed={Boolean(note.done)} onClick={() => onUpdate(note.id, { done: !note.done })}>{note.done && <Check size={12} />}</button>}
                <div className="daily-note-entry-content">
                  <div className="daily-note-entry-meta"><span>{note.type === 'task' ? 'Task' : 'Thought'}</span>{note.organizedTo && <small>Added to {documents.find(file => file.id === note.organizedTo)?.name || 'a document'}</small>}</div>
                  {editingId === note.id ? <textarea className="daily-note-edit" value={editText} onChange={event => setEditText(event.target.value)} onBlur={() => { onUpdate(note.id, { text: editText.trim() || note.text }); setEditingId(null) }} autoFocus aria-label="Edit note" /> : <p>{note.text}</p>}
                  <div className="daily-note-entry-actions">
                    {selectedDocument && <button type="button" onClick={() => onOrganize(note, effectiveDestinationId)}><FilePlus size={13} />{note.organizedTo === effectiveDestinationId ? 'Add again' : 'Add to document'}<ArrowRight size={12} /></button>}
                    <button type="button" aria-label="Edit entry" onClick={() => { setEditText(note.text); setEditingId(note.id) }}><Pencil size={12} />Edit</button>
                    <button type="button" className="is-danger" aria-label="Delete entry" onClick={() => onDelete(note.id)}><Trash2 size={12} />Delete</button>
                  </div>
                </div>
              </article>)}
              {!dayNotes.length && <div className="daily-notes-empty"><CalendarDays size={20} /><strong>{query ? 'No matches on this day' : 'Nothing captured yet'}</strong><span>{query ? 'Choose another day or change your search.' : 'Add a thought or task above. It will be saved automatically on this device.'}</span></div>}
            </div>
          </main>
        </div>
      </section>
    </div>
  )
}
