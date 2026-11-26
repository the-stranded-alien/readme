import { useRef, useState } from 'react'
import { X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'

/**
 * The app's own "pick from a list" dialog. `fields`: [{ id, label, options: [{ value, label }], value }].
 * Resolves (through onSubmit) to { [id]: value }.
 */
export default function ChoiceDialog({ title, message, fields, confirmLabel = 'OK', icon: Icon, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.id, field.value ?? field.options[0]?.value ?? ''])))
  const firstRef = useRef(null)
  useDialogKeys(onCancel, { focus: () => firstRef.current?.focus(), topmost: true })
  return (
    <div className="pdf-dialog-backdrop is-topmost anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="pdf-dialog prompt-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="choice-dialog-title">
        <form onSubmit={event => { event.preventDefault(); onSubmit(values) }}>
          <div className="pdf-dialog-header">
            <div>
              <h2 id="choice-dialog-title" className="flex items-center gap-2">{Icon && <Icon size={16} style={{ color: 'var(--accent)' }} />}{title}</h2>
              {message && <p>{message}</p>}
            </div>
            <button type="button" className="btn-icon" onClick={onCancel} aria-label="Cancel" data-tooltip="Cancel (Esc)"><X size={15} /></button>
          </div>
          <div className="pdf-dialog-body">
            {fields.map((field, index) => (
              <label key={field.id} className="prompt-field">
                <span className="pdf-option-label">{field.label}</span>
                <span className="settings-select-wrap choice-select">
                  <select ref={index === 0 ? firstRef : undefined} className="settings-select" value={values[field.id]}
                    onChange={event => setValues(current => ({ ...current, [field.id]: event.target.value }))}>
                    {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </span>
              </label>
            ))}
          </div>
          <div className="pdf-dialog-footer">
            <button type="button" className="reader-chip" onClick={onCancel}>Cancel</button>
            <button type="submit" className="pdf-dialog-primary">{confirmLabel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
