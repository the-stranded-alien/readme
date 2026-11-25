import { useCallback, useEffect, useRef, useState } from 'react'
import { useDialogKeys } from '../useDialogKeys'
import { ArchiveRestore, DatabaseBackup, HardDrive, ShieldCheck, ShieldAlert, X } from 'lucide-react'
import { formatBytes, requestPersistentStorage, storageStatus } from '../pwaIntegration'

/** Storage usage + "keep my data"; shared by the Storage dialog and Settings. */
export function StoragePanel() {
  const [status, setStatus] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [failure, setFailure] = useState('')
  const refresh = useCallback(() => storageStatus().then(setStatus).catch(() => setStatus({ supported: false })), [])
  useEffect(() => { refresh() }, [refresh])

  const persist = async () => {
    setRequesting(true)
    setFailure('')
    const result = await requestPersistentStorage()
    if (!result.granted) setFailure(result.reason)
    await refresh()
    setRequesting(false)
  }
  const percent = status?.quota ? Math.min(100, (status.usage / status.quota) * 100) : 0

  if (!status) return <p className="storage-muted">Checking storage…</p>
  if (!status.supported) return <p className="storage-muted">This browser doesn't report storage usage.</p>
  return (
    <>
      <div className="storage-usage">
        <div className="storage-usage-row">
          <span>Used</span>
          <strong>{formatBytes(status.usage)} <span>of {formatBytes(status.quota)} available</span></strong>
        </div>
        <div className="storage-bar" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
          <span style={{ width: `${Math.max(percent, 0.5)}%` }} />
        </div>
      </div>
      <div className={`storage-persist${status.persisted ? ' is-persisted' : ''}`}>
        {status.persisted ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        <div>
          <strong>{status.persisted ? 'Protected from automatic clean-up' : 'Not protected yet'}</strong>
          <span>{status.persisted
            ? 'The browser will not delete your workspace to free up space.'
            : 'Browsers may clear site data when the disk is low. Ask the browser to keep it.'}</span>
        </div>
        {!status.persisted && status.canPersist && (
          <button type="button" className="pdf-dialog-primary" onClick={persist} disabled={requesting}>
            {requesting ? 'Asking…' : failure ? 'Try again' : 'Keep my data'}
          </button>
        )}
      </div>
      {failure && !status.persisted && (
        <p className="storage-failure" role="alert"><ShieldAlert size={14} aria-hidden="true" /><span><strong>Couldn’t protect your data.</strong> {failure}</span></p>
      )}
    </>
  )
}

export default function StorageDialog({ fileCount, onBackup, onRestore, onClose }) {
  const closeRef = useRef(null)
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="pdf-dialog storage-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="storage-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="storage-title" className="flex items-center gap-2"><HardDrive size={16} style={{ color: 'var(--accent)' }} />Storage &amp; backup</h2>
            <p>Your {fileCount} file{fileCount === 1 ? '' : 's'}, history and settings are stored in this browser.</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close storage"><X size={15} /></button>
        </div>
        <div className="pdf-dialog-body">
          <StoragePanel />
        </div>
        <div className="pdf-dialog-footer">
          <button type="button" className="reader-chip" onClick={onRestore}><ArchiveRestore size={12} /> Restore from backup…</button>
          <button type="button" className="pdf-dialog-primary" onClick={onBackup}><DatabaseBackup size={13} />Back up workspace</button>
        </div>
      </div>
    </div>
  )
}
