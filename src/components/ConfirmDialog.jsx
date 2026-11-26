import { useRef } from 'react'
import { TriangleAlert, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'

/**
 * The app's own confirmation dialog (instead of the browser's `confirm()`).
 * `danger` styles the confirm button red and focuses Cancel, so Enter never deletes by accident.
 */
export default function ConfirmDialog({ title, message, details = [], confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, icon: Icon, onConfirm, onCancel }) {
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  useDialogKeys(onCancel, { focus: () => (danger ? cancelRef : confirmRef).current?.focus(), topmost: true })
  const HeaderIcon = Icon ?? (danger ? TriangleAlert : null)
  return (
    <div className="pdf-dialog-backdrop is-topmost anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className={`pdf-dialog confirm-dialog anim-pop-in${danger ? ' is-danger' : ''}`} role="alertdialog" aria-modal="true"
        aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="confirm-dialog-title" className="flex items-center gap-2">
              {HeaderIcon && <HeaderIcon size={16} className="confirm-dialog-icon" />}{title}
            </h2>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="Close" data-tooltip="Close (Esc)"><X size={15} /></button>
        </div>
        <div className="pdf-dialog-body">
          <p id="confirm-dialog-message" className="confirm-dialog-message">{message}</p>
          {details.length > 0 && (
            <ul className="confirm-dialog-details">
              {details.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
        <div className="pdf-dialog-footer">
          <button ref={cancelRef} type="button" className="reader-chip" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" className={`pdf-dialog-primary${danger ? ' is-danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
