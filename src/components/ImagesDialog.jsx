import { useMemo, useRef, useState } from 'react'
import { FileText, Images, Pencil, Replace, RotateCw, Shrink, Trash2, Type, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { ATTACHMENT_DIR, attachmentsUsed, formatBytes } from '../attachments'
import EmptyState from './EmptyState'

/**
 * Every image attachment: where it's used, its size, and actions (describe, rename, replace,
 * rotate, compress, delete). Also turns images embedded in documents into attachments.
 */
export default function ImagesDialog({ attachments, documents, embedded, onConvert, onDescribe, onRename, onReplace, onRotate, onCompress, onDelete, onOpenDocument, onClose }) {
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const closeRef = useRef(null)
  const replaceRef = useRef(null)
  const replacing = useRef(null)
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })

  const usage = useMemo(() => {
    const map = new Map()
    for (const doc of documents) for (const path of attachmentsUsed(doc.content, doc.name)) {
      if (!map.has(path)) map.set(path, [])
      map.get(path).push(doc)
    }
    return map
  }, [documents])
  const list = attachments
    .map(item => ({ ...item, usedIn: usage.get(item.path) ?? [] }))
    .filter(item => filter === 'all' || !item.usedIn.length)
    .sort((a, b) => b.createdAt - a.createdAt)
  const unused = attachments.filter(item => !usage.has(item.path)).length
  const total = attachments.reduce((sum, item) => sum + item.size, 0)
  const run = async (key, task) => { setBusy(key); try { await task() } finally { setBusy('') } }

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="library-panel images-panel anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="images-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="images-title" className="flex items-center gap-2"><Images size={16} style={{ color: 'var(--accent)' }} />Images</h2>
            <p>{attachments.length} {attachments.length === 1 ? 'image' : 'images'} · {formatBytes(total)}. Pasted and dropped images are kept here and documents refer to them by name, so documents stay small.</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close images" data-tooltip="Close (Esc)"><X size={15} /></button>
        </div>
        {embedded.count > 0 && (
          <div className="images-convert" role="note">
            <span><strong>{embedded.count} embedded {embedded.count === 1 ? 'image' : 'images'}</strong> in {embedded.docs} {embedded.docs === 1 ? 'document' : 'documents'} ({formatBytes(embedded.bytes)} of text). Moving them here makes those documents much lighter.</span>
            <button type="button" className="pdf-dialog-primary" disabled={busy === 'convert'} onClick={() => run('convert', onConvert)}>Move to attachments</button>
          </div>
        )}
        <div className="library-views" role="tablist" aria-label="Show">
          {[['all', `All (${attachments.length})`], ['unused', `Not used (${unused})`]].map(([id, label]) => (
            <span key={id} className={`library-view${filter === id ? ' is-active' : ''}`}><button type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>{label}</button></span>
          ))}
        </div>
        <input ref={replaceRef} type="file" accept="image/*" hidden onChange={event => {
          const file = event.target.files?.[0]
          const path = replacing.current
          event.target.value = ''
          if (file && path) run(path, () => onReplace(path, file))
        }} />
        <div className="library-body">
          {list.length === 0 ? (
            <EmptyState compact icon={Images} title={attachments.length ? 'Every image is in use' : 'No images yet'}
              text={attachments.length ? 'Images no document uses show up here.' : 'Paste or drop an image into the editor and it is kept here.'} />
          ) : (
            <ul className="images-grid" aria-label="Images">
              {list.map(item => {
                const name = item.path.slice(ATTACHMENT_DIR.length + 1)
                return (
                  <li key={item.path} className={`images-tile${busy === item.path ? ' is-busy' : ''}`}>
                    <div className="images-thumb"><img src={item.url} alt="" loading="lazy" /></div>
                    <div className="images-info">
                      <strong title={name}>{name}</strong>
                      <span>{formatBytes(item.size)} · {item.usedIn.length ? `used in ${item.usedIn.length} ${item.usedIn.length === 1 ? 'document' : 'documents'}` : 'not used'}</span>
                      {item.usedIn.length > 0 && (
                        <div className="images-used">
                          {item.usedIn.slice(0, 3).map(doc => <button key={doc.id} type="button" className="tasks-chip" onClick={() => { onOpenDocument(doc.id); onClose() }}><FileText size={10} />{doc.name}</button>)}
                          {item.usedIn.length > 3 && <span className="tasks-chip">+{item.usedIn.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div className="images-actions" role="group" aria-label={`Actions for ${name}`}>
                      <button type="button" className="btn-icon" disabled={!item.usedIn.length} onClick={() => run(item.path, () => onDescribe(item.path))} aria-label={`Describe ${name}`} data-tip="Description (alt text)"><Type size={13} /></button>
                      <button type="button" className="btn-icon" onClick={() => run(item.path, () => onRename(item.path))} aria-label={`Rename ${name}`} data-tip="Rename"><Pencil size={13} /></button>
                      <button type="button" className="btn-icon" onClick={() => { replacing.current = item.path; replaceRef.current?.click() }} aria-label={`Replace ${name}`} data-tip="Replace with another image"><Replace size={13} /></button>
                      <button type="button" className="btn-icon" disabled={/svg|gif/.test(item.type)} onClick={() => run(item.path, () => onRotate(item.path))} aria-label={`Rotate ${name}`} data-tip="Rotate 90°"><RotateCw size={13} /></button>
                      <button type="button" className="btn-icon" disabled={/svg|gif/.test(item.type) || item.size < 60 * 1024} onClick={() => run(item.path, () => onCompress(item.path))} aria-label={`Compress ${name}`} data-tip="Make smaller"><Shrink size={13} /></button>
                      <button type="button" className="btn-icon images-delete" onClick={() => run(item.path, () => onDelete(item.path, item.usedIn.length))} aria-label={`Delete ${name}`} data-tip="Delete"><Trash2 size={13} /></button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
