import { useRef, useState } from 'react'
import { X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'

/**
 * The app's own text-input dialog (instead of the browser's `prompt()`).
 * `validate(value)` returns an error message or null; Enter submits, Escape cancels.
 * `prefix` / `suffix` show fixed text around the input (e.g. a folder path and a file extension).
 */
export default function PromptDialog({
  title, description, label, initialValue = '', placeholder, hint, confirmLabel = 'OK', icon: Icon, validate, onSubmit, onCancel, prefix, suffix,
}) {
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(false)
  const inputRef = useRef(null)
  useDialogKeys(onCancel, { focus: () => { inputRef.current?.focus(); inputRef.current?.select() }, topmost: true })
  const error = validate?.(value) ?? null
  const submit = event => {
    event.preventDefault()
    setTouched(true)
    if (!error) onSubmit(value)
  }
  return (
    <div className="pdf-dialog-backdrop is-topmost anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="pdf-dialog prompt-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="prompt-dialog-title">
      <form onSubmit={submit} noValidate>
        <div className="pdf-dialog-header">
          <div>
            <h2 id="prompt-dialog-title" className="flex items-center gap-2">{Icon && <Icon size={16} style={{ color: 'var(--accent)' }} />}{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="Cancel" data-tooltip="Cancel (Esc)"><X size={15} /></button>
        </div>
        <div className="pdf-dialog-body">
          <label className="prompt-field">
            <span className="pdf-option-label">{label}</span>
            <span className={`prompt-input${prefix || suffix ? ' has-affix' : ''}`}>
              {prefix && <span className="prompt-affix" aria-hidden="true">{prefix}</span>}
              <input ref={inputRef} type="text" value={value} placeholder={placeholder} spellCheck={false} autoComplete="off"
                aria-invalid={Boolean(touched && error)} aria-describedby="prompt-dialog-help"
                onChange={event => { setValue(event.target.value); setTouched(true) }} />
              {suffix && <span className="prompt-affix" aria-hidden="true">{suffix}</span>}
            </span>
          </label>
          <p id="prompt-dialog-help" className={`prompt-help${touched && error ? ' is-error' : ''}`} aria-live="polite">{touched && error ? error : hint}</p>
        </div>
        <div className="pdf-dialog-footer">
          <button type="button" className="reader-chip" onClick={onCancel}>Cancel</button>
          <button type="submit" className="pdf-dialog-primary" disabled={Boolean(error)}>{confirmLabel}</button>
        </div>
      </form>
      </div>
    </div>
  )
}
