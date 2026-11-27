import { useMemo, useRef, useState } from 'react'
import { Plus, SlidersHorizontal, Trash2, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { readFrontMatter, writeFrontMatter } from '../library'

const TYPES = [['text', 'Text'], ['list', 'List'], ['date', 'Date'], ['checkbox', 'Checkbox'], ['number', 'Number']]
const SUGGESTED = [['title', 'text'], ['tags', 'list'], ['status', 'text'], ['date', 'date'], ['author', 'text'], ['description', 'text']]
const STATUSES = ['draft', 'in review', 'final', 'archived']

/** Converts a value when the property's type changes. */
function convert(value, from, to) {
  if (from === to) return value
  const text = Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? String(value) : String(value ?? '')
  if (to === 'list') return text.split(',').map(item => item.trim()).filter(Boolean)
  if (to === 'checkbox') return /^(true|yes|1)$/i.test(text.trim())
  if (to === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) ? text.trim() : ''
  if (to === 'number') return /^-?\d+(\.\d+)?$/.test(text.trim()) ? text.trim() : ''
  return text
}

function ListEditor({ value, onChange, label }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const items = draft.split(',').map(item => item.replace(/^#/, '').trim()).filter(Boolean)
    if (items.length) onChange([...new Set([...value, ...items])])
    setDraft('')
  }
  return (
    <div className="props-list">
      {value.map(item => (
        <span key={item} className="props-token">{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(value.filter(entry => entry !== item))}><X size={10} /></button></span>
      ))}
      <input className="props-token-input" value={draft} onChange={event => setDraft(event.target.value)} aria-label={`Add to ${label}`} placeholder={value.length ? 'Add…' : 'Type and press Enter'}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add() } else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)) }}
        onBlur={add} />
    </div>
  )
}

/**
 * Edit a document's front matter as typed properties. onSave(content) gets the new document
 * (unchanged YAML keeps its exact text); onEditYaml() goes to the raw front matter.
 */
export default function PropertiesDialog({ fileName, content, onSave, onEditYaml, onClose }) {
  const initial = useMemo(() => readFrontMatter(content).entries.filter(entry => entry.key)
    .map((entry, index) => ({ uid: index, key: entry.key, type: entry.type, value: entry.value, style: entry.style, simple: entry.simple })), [content])
  const [props, setProps] = useState(initial)
  const [newKey, setNewKey] = useState('')
  const [newType, setNewType] = useState('text')
  const [error, setError] = useState('')
  const firstRef = useRef(null)
  const nextUid = useRef(1000)
  useDialogKeys(onClose, { focus: () => firstRef.current?.focus() })
  const update = (uid, patch) => setProps(list => list.map(prop => (prop.uid === uid ? { ...prop, ...patch } : prop)))
  const keys = new Set(props.map(prop => prop.key.toLowerCase()))
  const add = (key = newKey, type = newType) => {
    const clean = key.trim().replace(/\s+/g, '_')
    if (!clean) return
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(clean)) { setError('Names can use letters, numbers, - and _.'); return }
    if (keys.has(clean.toLowerCase())) { setError(`“${clean}” is already a property.`); return }
    setError('')
    nextUid.current += 1
    const uid = nextUid.current
    setProps(list => [...list, { uid, key: clean, type, value: type === 'list' ? [] : type === 'checkbox' ? false : '', simple: true }])
    setNewKey('')
  }
  const save = event => {
    event.preventDefault()
    const out = props.map(({ key, type, value, style }) => ({ key, type, value, style }))
    const next = writeFrontMatter(content, out)
    if (next !== content) onSave(next)
    onClose()
  }

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print is-topmost" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="pdf-dialog props-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="props-title">
        <form onSubmit={save}>
          <div className="pdf-dialog-header">
            <div>
              <h2 id="props-title" className="flex items-center gap-2"><SlidersHorizontal size={16} style={{ color: 'var(--accent)' }} />Properties</h2>
              <p>{fileName} · saved as front matter at the top of the document.</p>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close properties"><X size={15} /></button>
          </div>
          <div className="pdf-dialog-body props-body">
            {props.length === 0 && <p className="settings-muted">No properties yet. Add a title, tags or a status below — they show in the Library and can be used to filter it.</p>}
            {props.map((prop, index) => (
              <div key={prop.uid} className="props-row">
                <span className="props-key" title={prop.key}>{prop.key}</span>
                {prop.simple ? (
                  <span className="settings-select-wrap props-type"><select className="settings-select" value={prop.type} aria-label={`Type of ${prop.key}`}
                    onChange={event => update(prop.uid, { type: event.target.value, value: convert(prop.value, prop.type, event.target.value) })}>
                    {TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select></span>
                ) : <span className="props-type props-type-yaml">YAML</span>}
                <div className="props-value">
                  {!prop.simple ? (
                    <div className="props-yaml"><code>{String(prop.value).split('\n').slice(0, 3).join(' ⏎ ')}</code>
                      {onEditYaml && <button type="button" className="reader-chip" onClick={() => { onClose(); onEditYaml() }}>Edit as YAML</button>}</div>
                  ) : prop.type === 'list' ? <ListEditor value={prop.value} label={prop.key} onChange={value => update(prop.uid, { value })} />
                    : prop.type === 'checkbox' ? <label className="props-check"><input type="checkbox" checked={Boolean(prop.value)} onChange={event => update(prop.uid, { value: event.target.checked })} aria-label={prop.key} />{prop.value ? 'Yes' : 'No'}</label>
                      : prop.type === 'date' ? <input type="date" className="publish-input" value={prop.value} onChange={event => update(prop.uid, { value: event.target.value })} aria-label={prop.key} />
                        : prop.type === 'number' ? <input type="number" className="publish-input" value={prop.value} onChange={event => update(prop.uid, { value: event.target.value })} aria-label={prop.key} />
                          : (
                            <>
                              <input ref={index === 0 ? firstRef : undefined} className="publish-input" value={prop.value} onChange={event => update(prop.uid, { value: event.target.value })} aria-label={prop.key}
                                list={prop.key.toLowerCase() === 'status' ? 'props-statuses' : undefined} />
                            </>
                          )}
                </div>
                <button type="button" className="btn-icon props-remove" onClick={() => setProps(list => list.filter(item => item.uid !== prop.uid))} aria-label={`Remove ${prop.key}`} data-tip="Remove"><Trash2 size={13} /></button>
              </div>
            ))}
            <datalist id="props-statuses">{STATUSES.map(name => <option key={name} value={name} />)}</datalist>
            <div className="props-add">
              <input className="publish-input" value={newKey} onChange={event => { setNewKey(event.target.value); setError('') }} placeholder="New property name" aria-label="New property name"
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
              <span className="settings-select-wrap"><select className="settings-select" value={newType} onChange={event => setNewType(event.target.value)} aria-label="New property type">
                {TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select></span>
              <button type="button" className="reader-chip" onClick={() => add()} disabled={!newKey.trim()}><Plus size={12} />Add</button>
            </div>
            {error && <p className="ai-error" role="alert">{error}</p>}
            <div className="props-suggest" aria-label="Common properties">
              {SUGGESTED.filter(([key]) => !keys.has(key)).map(([key, type]) => (
                <button key={key} type="button" className="tasks-chip" onClick={() => add(key, type)}>+ {key}</button>
              ))}
            </div>
          </div>
          <div className="pdf-dialog-footer">
            <button type="button" className="reader-chip" onClick={onClose}>Cancel</button>
            <button type="submit" className="pdf-dialog-primary">Save properties</button>
          </div>
        </form>
      </div>
    </div>
  )
}
