import { useMemo, useRef, useState } from 'react'
import { Download, FileText, FolderOpen, LayoutGrid, Library, List, Pin, Search, SlidersHorizontal, Tag, Trash2, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { LIBRARY_SORTS, filterDocuments, sortDocuments } from '../library'
import EmptyState from './EmptyState'

const VIEWS_KEY = 'readme-library-views'
const PREFS_KEY = 'readme-library-prefs'
const DAY = 24 * 60 * 60 * 1000
const BUILT_IN_VIEWS = [
  { id: 'all', name: 'All documents', filter: {} },
  { id: 'pinned', name: 'Pinned', filter: { pinned: true } },
  { id: 'recent', name: 'Edited this week', filter: { recent: 7 } },
  { id: 'drafts', name: 'Drafts', filter: { status: 'draft' } },
]
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* optional */ } }

function editedLabel(time) {
  if (!time) return '—'
  const diff = Date.now() - time
  if (diff < 60 * 1000) return 'Just now'
  if (diff < 60 * 60 * 1000) return `${Math.round(diff / 60000)} min ago`
  if (diff < DAY) return `${Math.round(diff / 3600000)} h ago`
  if (diff < 7 * DAY) return `${Math.round(diff / DAY)} d ago`
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(new Date(time).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

/**
 * Every document (open and closed) as cards or a table, with search, filters, saved views and
 * bulk actions. `documents`: documentInfo() items. Actions get arrays of ids.
 */
export default function LibraryView({ documents, activeId, onOpen, onProperties, onMove, onAddTag, onExport, onDelete, askText, onClose }) {
  const prefs = useMemo(() => load(PREFS_KEY, {}), [])
  const [layout, setLayout] = useState(prefs.layout === 'table' ? 'table' : 'cards')
  const [sort, setSort] = useState(prefs.sort || 'updated')
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState('')
  const [tag, setTag] = useState('')
  const [status, setStatus] = useState('')
  const [showClosed, setShowClosed] = useState(prefs.showClosed !== false)
  const [viewId, setViewId] = useState('all')
  const [customViews, setCustomViews] = useState(() => load(VIEWS_KEY, []))
  const [selected, setSelected] = useState(() => new Set())
  const [openedAt] = useState(() => Date.now())
  const searchRef = useRef(null)
  useDialogKeys(onClose, { focus: () => searchRef.current?.focus() })
  const remember = next => save(PREFS_KEY, { layout, sort, showClosed, ...next })

  const folders = useMemo(() => [...new Set(documents.flatMap(doc => doc.folder.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')).filter(Boolean)))].sort(), [documents])
  const tags = useMemo(() => [...new Set(documents.flatMap(doc => doc.tags))].sort(), [documents])
  const statuses = useMemo(() => [...new Set(documents.map(doc => doc.status).filter(Boolean))].sort(), [documents])
  const views = [...BUILT_IN_VIEWS, ...customViews]
  const view = views.find(item => item.id === viewId) ?? BUILT_IN_VIEWS[0]

  const visible = useMemo(() => {
    const current = [...BUILT_IN_VIEWS, ...customViews].find(item => item.id === viewId) ?? BUILT_IN_VIEWS[0]
    const base = { ...current.filter }
    const recent = base.recent
    delete base.recent
    const filtered = filterDocuments(documents, {
      ...base, query, closed: showClosed,
      ...(folder ? { folder } : {}), ...(tag ? { tag } : {}), ...(status ? { status } : {}),
    }).filter(doc => !recent || (doc.updatedAt && openedAt - doc.updatedAt < recent * DAY))
    return sortDocuments(filtered, sort)
  }, [documents, viewId, customViews, query, folder, tag, status, showClosed, sort, openedAt])

  const chosen = [...selected].filter(id => documents.some(doc => doc.id === id))
  const toggle = id => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const allVisibleSelected = visible.length > 0 && visible.every(doc => selected.has(doc.id))
  const selectAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map(doc => doc.id)))
  const clearFilters = () => { setQuery(''); setFolder(''); setTag(''); setStatus(''); setViewId('all') }
  const saveView = async () => {
    const name = (await askText?.({ title: 'Save this view', label: 'Name', placeholder: 'e.g. Work drafts', confirmLabel: 'Save view' }))?.trim()
    if (!name) return
    const item = { id: `v-${customViews.length + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, filter: { ...(folder ? { folder } : {}), ...(tag ? { tag } : {}), ...(status ? { status } : {}), ...(query ? { query } : {}), ...view.filter } }
    const next = [...customViews, item]
    setCustomViews(next); save(VIEWS_KEY, next); setViewId(item.id)
    setQuery(''); setFolder(''); setTag(''); setStatus('')
  }
  const removeView = id => { const next = customViews.filter(item => item.id !== id); setCustomViews(next); save(VIEWS_KEY, next); if (viewId === id) setViewId('all') }
  const filtersActive = query || folder || tag || status || viewId !== 'all'

  const open = doc => { onOpen(doc.id); onClose() }
  const Chip = ({ children, className = '' }) => <span className={`library-chip ${className}`}>{children}</span>

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="library-panel anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="library-title" className="flex items-center gap-2"><Library size={16} style={{ color: 'var(--accent)' }} />Library</h2>
            <p>{documents.length} {documents.length === 1 ? 'document' : 'documents'}. Click one to open it; tick several to move, tag, export or delete them together.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close library" data-tooltip="Close (Esc)"><X size={15} /></button>
        </div>

        <div className="library-views" role="tablist" aria-label="Saved views">
          {views.map(item => (
            <span key={item.id} className={`library-view${viewId === item.id ? ' is-active' : ''}`}>
              <button type="button" role="tab" aria-selected={viewId === item.id} onClick={() => setViewId(item.id)}>{item.name}</button>
              {item.id.startsWith('v-') && <button type="button" className="library-view-remove" aria-label={`Remove view ${item.name}`} data-tip="Remove view" onClick={() => removeView(item.id)}><X size={11} /></button>}
            </span>
          ))}
          {(query || folder || tag || status) && <button type="button" className="library-view-save" onClick={saveView}>+ Save this view</button>}
        </div>

        <div className="library-controls">
          <label className="tasks-search library-search">
            <Search size={13} aria-hidden="true" />
            <input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search titles, text and tags" aria-label="Search documents" />
          </label>
          <span className="settings-select-wrap"><select className="settings-select" value={folder} onChange={event => setFolder(event.target.value)} aria-label="Folder">
            <option value="">All folders</option>{folders.map(name => <option key={name} value={name}>{name}</option>)}
          </select></span>
          {tags.length > 0 && <span className="settings-select-wrap"><select className="settings-select" value={tag} onChange={event => setTag(event.target.value)} aria-label="Tag">
            <option value="">All tags</option>{tags.map(name => <option key={name} value={name}>#{name}</option>)}
          </select></span>}
          {statuses.length > 0 && <span className="settings-select-wrap"><select className="settings-select" value={status} onChange={event => setStatus(event.target.value)} aria-label="Status">
            <option value="">Any status</option>{statuses.map(name => <option key={name} value={name}>{name}</option>)}
          </select></span>}
          <span className="settings-select-wrap"><select className="settings-select" value={sort} onChange={event => { setSort(event.target.value); remember({ sort: event.target.value }) }} aria-label="Sort by">
            {LIBRARY_SORTS.map(([id, label]) => <option key={id} value={id}>Sort: {label}</option>)}
          </select></span>
          <label className="graph-check"><input type="checkbox" checked={showClosed} onChange={event => { setShowClosed(event.target.checked); remember({ showClosed: event.target.checked }) }} />Closed files</label>
          <div className="pdf-segmented library-layout" role="radiogroup" aria-label="Layout">
            <button type="button" role="radio" aria-checked={layout === 'cards'} className={layout === 'cards' ? 'is-active' : ''} onClick={() => { setLayout('cards'); remember({ layout: 'cards' }) }} aria-label="Cards" data-tip="Cards"><LayoutGrid size={13} /></button>
            <button type="button" role="radio" aria-checked={layout === 'table'} className={layout === 'table' ? 'is-active' : ''} onClick={() => { setLayout('table'); remember({ layout: 'table' }) }} aria-label="Table" data-tip="Table"><List size={13} /></button>
          </div>
        </div>

        <div className={`library-bulk${chosen.length ? ' is-active' : ''}`} role="region" aria-label="Selected documents">
          <label className="graph-check"><input type="checkbox" checked={allVisibleSelected} onChange={selectAll} aria-label="Select all shown" />{chosen.length ? `${chosen.length} selected` : `${visible.length} shown`}</label>
          {chosen.length > 0 && (
            <>
              <button type="button" className="reader-chip" onClick={() => onMove(chosen)}><FolderOpen size={12} />Move to folder…</button>
              <button type="button" className="reader-chip" onClick={() => onAddTag(chosen)}><Tag size={12} />Add tag…</button>
              <button type="button" className="reader-chip" onClick={() => onExport(chosen)}><Download size={12} />Export .zip</button>
              <button type="button" className="reader-chip is-danger" onClick={async () => { if (await onDelete(chosen)) setSelected(new Set()) }}><Trash2 size={12} />Delete</button>
              <button type="button" className="reader-chip" onClick={() => setSelected(new Set())}>Clear</button>
            </>
          )}
        </div>

        <div className={`library-body is-${layout}`}>
          {visible.length === 0 ? (
            <div className="library-empty">
              <EmptyState compact icon={Library} title={documents.length ? 'No documents match' : 'No documents yet'}
                text={documents.length ? 'Try another search, folder or view.' : 'Create or open a document to see it here.'} />
              {filtersActive && <button type="button" className="reader-chip" onClick={clearFilters}>Show all documents</button>}
            </div>
          ) : layout === 'cards' ? (
            <ul className="library-cards" aria-label="Documents">
              {visible.map(doc => (
                <li key={doc.id} className={`library-card${doc.id === activeId ? ' is-current' : ''}${selected.has(doc.id) ? ' is-selected' : ''}`}>
                  <input type="checkbox" className="library-select" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} aria-label={`Select ${doc.title}`} />
                  <button type="button" className="library-card-open" onClick={() => open(doc)} aria-label={`Open ${doc.title}`} />
                  <div className="library-card-head">
                    <FileText size={13} aria-hidden="true" />
                    <strong>{doc.title}</strong>
                    {doc.pinned && <Pin size={12} className="library-pin" aria-label="Pinned" />}
                  </div>
                  <div className="library-card-meta">
                    {doc.folder && <Chip>{doc.folder}</Chip>}
                    {doc.status && <Chip className={`is-status is-${doc.status.replace(/[^a-z]/g, '')}`}>{doc.status}</Chip>}
                    {doc.closed && <Chip className="is-closed">closed</Chip>}
                  </div>
                  <p className="library-excerpt">{doc.excerpt || <em>Empty</em>}</p>
                  {doc.tags.length > 0 && <div className="library-tags">{doc.tags.slice(0, 6).map(name => <button key={name} type="button" className="tasks-chip is-tag" onClick={() => setTag(name)} aria-label={`Show only #${name}`}>#{name}</button>)}</div>}
                  <div className="library-card-foot">
                    <span>{doc.words.toLocaleString()} words · {editedLabel(doc.updatedAt)}</span>
                    {!doc.closed && onProperties && <button type="button" className="btn-icon" onClick={() => onProperties(doc.id)} aria-label={`Properties of ${doc.title}`} data-tip="Properties"><SlidersHorizontal size={13} /></button>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <table className="library-table">
              <thead><tr><th scope="col"><span className="sr-only">Select</span></th><th scope="col">Title</th><th scope="col">Folder</th><th scope="col">Status</th><th scope="col">Tags</th><th scope="col" className="is-num">Words</th><th scope="col">Edited</th></tr></thead>
              <tbody>
                {visible.map(doc => (
                  <tr key={doc.id} className={`${doc.id === activeId ? 'is-current' : ''}${selected.has(doc.id) ? ' is-selected' : ''}`}>
                    <td><input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} aria-label={`Select ${doc.title}`} /></td>
                    <td><button type="button" className="library-row-open" onClick={() => open(doc)}><strong>{doc.title}</strong><span>{doc.name}{doc.closed ? ' · closed' : ''}</span></button></td>
                    <td>{doc.folder || '—'}</td>
                    <td>{doc.status ? <Chip className={`is-status is-${doc.status.replace(/[^a-z]/g, '')}`}>{doc.status}</Chip> : '—'}</td>
                    <td className="library-table-tags">{doc.tags.slice(0, 4).map(name => <button key={name} type="button" className="tasks-chip is-tag" onClick={() => setTag(name)} aria-label={`Show only #${name}`}>#{name}</button>)}</td>
                    <td className="is-num">{doc.words.toLocaleString()}</td>
                    <td>{editedLabel(doc.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
