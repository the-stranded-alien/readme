import { useMemo, useRef, useState } from 'react'
import { useDialogKeys } from '../useDialogKeys'
import { Copy, FilePlus, LayoutTemplate, Lock, Plus, Save, Trash2, X } from 'lucide-react'

const emptyDraft = { name: '', description: '', fileName: '', content: '' }

/**
 * Manage templates: built-in ones are read-only (duplicate to customise);
 * your own templates can be created, edited, deleted or used for a new file.
 */
export default function TemplatesDialog({ builtIn, custom, onSave, onDelete, onUse, currentFile, onClose }) {
  const [selectedId, setSelectedId] = useState(custom[0]?.id ?? builtIn[0]?.id ?? null)
  const [draft, setDraft] = useState(null)
  const closeRef = useRef(null)
  const all = useMemo(() => [...builtIn.map(t => ({ ...t, builtIn: true })), ...custom], [builtIn, custom])
  const selected = all.find(template => template.id === selectedId) ?? null
  const editing = draft ?? (selected && !selected.builtIn ? selected : null)

  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })

  const startNew = (base = emptyDraft) => {
    setSelectedId(null)
    setDraft({ id: null, name: base.name, description: base.description || '', fileName: base.fileName || '', content: base.content || '' })
  }
  const update = (key, value) => setDraft(current => ({ ...(current ?? editing), [key]: value }))
  const save = () => {
    const value = draft ?? editing
    if (!value?.name.trim()) return
    const saved = onSave({
      ...value,
      name: value.name.trim(),
      fileName: (value.fileName || value.name).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/(\.md)?$/i, '.md'),
    })
    setDraft(null)
    setSelectedId(saved.id)
  }
  const dirty = Boolean(draft)

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="templates-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="templates-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="templates-title" className="flex items-center gap-2"><LayoutTemplate size={16} style={{ color: 'var(--accent)' }} />Templates</h2>
            <p>Your templates appear in the New menu, the editor's Templates button and the start screen.</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close templates"><X size={15} /></button>
        </div>
        <div className="templates-body">
          <div className="templates-list" aria-label="Templates">
            <div className="templates-actions">
              <button type="button" className="reader-chip" onClick={() => startNew()}><Plus size={12} /> New</button>
              {currentFile && (
                <button type="button" className="reader-chip" onClick={() => startNew({ name: currentFile.name.replace(/\.[^.]+$/, ''), fileName: currentFile.name, content: currentFile.content, description: '' })}>
                  <Save size={12} /> From current file
                </button>
              )}
            </div>
            <div className="templates-group">Your templates</div>
            {custom.length === 0 && <p className="templates-empty">None yet — create one or duplicate a built-in template.</p>}
            {custom.map(template => (
              <button key={template.id} type="button" aria-pressed={selectedId === template.id && !dirty}
                className={`templates-item${selectedId === template.id && !dirty ? ' is-selected' : ''}`}
                onClick={() => { setDraft(null); setSelectedId(template.id) }}>
                <strong>{template.name}</strong>
                {template.description && <span>{template.description}</span>}
              </button>
            ))}
            <div className="templates-group">Built-in</div>
            {builtIn.map(template => (
              <button key={template.id} type="button" aria-pressed={selectedId === template.id && !dirty}
                className={`templates-item${selectedId === template.id && !dirty ? ' is-selected' : ''}`}
                onClick={() => { setDraft(null); setSelectedId(template.id) }}>
                <strong><Lock size={10} aria-hidden="true" /> {template.name}</strong>
                {template.description && <span>{template.description}</span>}
              </button>
            ))}
          </div>

          <div className="templates-editor">
            {editing ? (
              <>
                <label className="templates-field">
                  <span>Name</span>
                  <input value={editing.name} onChange={event => update('name', event.target.value)} placeholder="Weekly report" autoFocus={dirty} />
                </label>
                <div className="templates-row">
                  <label className="templates-field">
                    <span>Description</span>
                    <input value={editing.description} onChange={event => update('description', event.target.value)} placeholder="Shown in the menus" />
                  </label>
                  <label className="templates-field">
                    <span>File name</span>
                    <input value={editing.fileName} onChange={event => update('fileName', event.target.value)} placeholder="weekly-report.md" />
                  </label>
                </div>
                <label className="templates-field is-grow">
                  <span>Content (Markdown)</span>
                  <textarea value={editing.content} onChange={event => update('content', event.target.value)} spellCheck={false} />
                </label>
              </>
            ) : selected ? (
              <>
                <div className="templates-readonly">
                  <div>
                    <strong>{selected.name}</strong>
                    <span>Built-in templates can't be edited — duplicate it to make your own version.</span>
                  </div>
                  <button type="button" className="reader-chip" onClick={() => startNew({ ...selected, name: `${selected.name} (copy)` })}><Copy size={12} /> Duplicate</button>
                </div>
                <pre className="templates-preview" tabIndex={0} aria-label={`Content of ${selected.name}`}>{selected.content}</pre>
              </>
            ) : <p className="templates-empty">Select a template.</p>}
          </div>
        </div>
        <div className="pdf-dialog-footer">
          {editing && editing.id && !dirty && (
            <button type="button" className="reader-chip templates-delete" onClick={() => { onDelete(editing.id); setSelectedId(null) }}><Trash2 size={12} /> Delete</button>
          )}
          <span style={{ flex: 1 }} />
          {dirty && <button type="button" className="reader-chip" onClick={() => setDraft(null)}>Cancel</button>}
          {editing && (dirty || !editing.builtIn) && (
            <button type="button" className="reader-chip" onClick={save} disabled={!(draft ?? editing).name.trim()}><Save size={12} /> Save template</button>
          )}
          {selected && !dirty && (
            <button type="button" className="pdf-dialog-primary" onClick={() => { onUse(selected); onClose() }}><FilePlus size={13} />New file from template</button>
          )}
        </div>
      </div>
    </div>
  )
}
