import { useMemo, useRef, useState } from 'react'
import { Download, FileText, Folder, FolderOpen, Images, LayoutGrid, Library, List, Pin, Search, SlidersHorizontal, Tag, Trash2, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { LIBRARY_SORTS, filterDocuments, sortDocuments } from '../library'
import EmptyState from './EmptyState'

const VIEWS_KEY = 'readme-library-views'
const PREFS_KEY = 'readme-library-prefs'
const LIB_FILE_DRAG = 'application/x-readme-library-file'
const LIB_FOLDER_DRAG = 'application/x-readme-library-folder'
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
export default function LibraryView({
  documents, emptyFolders = [], activeId, fileOrder = [], folderOrder = [],
  onOpen, onProperties, onMove, onAddTag, onExport, onDelete, onReorderFile, onReorderFolder, onOpenImages, imageCount = 0, askText, onClose,
}) {
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
  const [dragSource, setDragSource] = useState(null)
  const searchRef = useRef(null)
  useDialogKeys(onClose, { focus: () => searchRef.current?.focus() })
  const remember = next => save(PREFS_KEY, { layout, sort, showClosed, ...next })

  const folders = useMemo(() => [...new Set([
    ...emptyFolders.flatMap(f => f.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')).filter(Boolean)),
    ...documents.flatMap(doc => doc.folder.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')).filter(Boolean)),
  ])].sort(), [documents, emptyFolders])
  const hasFolders = folders.length > 0
  const [browseModeOverride, setBrowseModeOverride] = useState(null)
  const browseMode = browseModeOverride ?? (hasFolders ? 'folders' : 'files')
  const setBrowseMode = mode => setBrowseModeOverride(mode)
  const [currentPath, setCurrentPath] = useState('')
  const [dropIndicator, setDropIndicator] = useState(null) // { kind: 'file'|'folder', key, after }
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
    return sortDocuments(filtered, sort, fileOrder)
  }, [documents, viewId, customViews, query, folder, tag, status, showClosed, sort, openedAt, fileOrder])

  const filtersActive = query || folder || tag || status || viewId !== 'all'
  const effectiveMode = hasFolders && browseMode === 'folders' && !filtersActive ? 'folders' : 'files'

  const childFolders = useMemo(() => {
    if (effectiveMode !== 'folders') return []
    const prefix = currentPath ? `${currentPath}/` : ''
    const names = new Set()
    for (const f of folders) {
      if (!f.startsWith(prefix)) continue
      const rest = f.slice(prefix.length)
      if (!rest) continue
      names.add(rest.split('/')[0])
    }
    const orderMap = new Map(folderOrder.map((p, i) => [p, i]))
    return [...names].map(name => {
      const path = prefix + name
      const count = visible.filter(doc => doc.folder === path || doc.folder.startsWith(`${path}/`)).length
      return { name, path, count }
    }).sort((a, b) => {
      const ia = orderMap.has(a.path) ? orderMap.get(a.path) : Number.MAX_SAFE_INTEGER
      const ib = orderMap.has(b.path) ? orderMap.get(b.path) : Number.MAX_SAFE_INTEGER
      return (ia - ib) || a.name.localeCompare(b.name, undefined, { numeric: true })
    })
  }, [effectiveMode, currentPath, folders, folderOrder, visible])

  const shownDocs = useMemo(
    () => (effectiveMode === 'folders' ? visible.filter(doc => doc.folder === currentPath) : visible),
    [effectiveMode, visible, currentPath],
  )

  const chosen = [...selected].filter(id => documents.some(doc => doc.id === id))
  const toggle = id => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const allVisibleSelected = shownDocs.length > 0 && shownDocs.every(doc => selected.has(doc.id))
  const selectAll = () => setSelected(allVisibleSelected ? new Set() : new Set(shownDocs.map(doc => doc.id)))
  const clearFilters = () => { setQuery(''); setFolder(''); setTag(''); setStatus(''); setViewId('all'); setCurrentPath('') }
  const saveView = async () => {
    const name = (await askText?.({ title: 'Save this view', label: 'Name', placeholder: 'e.g. Work drafts', confirmLabel: 'Save view' }))?.trim()
    if (!name) return
    const item = { id: `v-${customViews.length + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, filter: { ...(folder ? { folder } : {}), ...(tag ? { tag } : {}), ...(status ? { status } : {}), ...(query ? { query } : {}), ...view.filter } }
    const next = [...customViews, item]
    setCustomViews(next); save(VIEWS_KEY, next); setViewId(item.id)
    setQuery(''); setFolder(''); setTag(''); setStatus('')
  }
  const removeView = id => { const next = customViews.filter(item => item.id !== id); setCustomViews(next); save(VIEWS_KEY, next); if (viewId === id) setViewId('all') }

  const open = doc => { onOpen(doc.id); onClose() }
  const Chip = ({ children, className = '' }) => <span className={`library-chip ${className}`}>{children}</span>

  const isAfter = event => {
    const rect = event.currentTarget.getBoundingClientRect()
    return layout === 'cards' ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2
  }
  const fileDragProps = docId => ({
    draggable: Boolean(onReorderFile),
    onDragStart: event => {
      event.dataTransfer.setData(LIB_FILE_DRAG, docId)
      event.dataTransfer.effectAllowed = 'move'
      setDragSource({ kind: 'file', key: docId })
      const item = event.currentTarget.closest('.library-card, tr')
      if (item) event.dataTransfer.setDragImage?.(item, Math.round(item.clientWidth / 2), Math.round(item.clientHeight / 2))
    },
    onDragEnd: () => { setDropIndicator(null); setDragSource(null) },
    onDragOver: event => {
      if (!onReorderFile || !Array.from(event.dataTransfer?.types || []).includes(LIB_FILE_DRAG)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const after = isAfter(event)
      setDropIndicator(current => current?.kind === 'file' && current.key === docId && current.after === after ? current : { kind: 'file', key: docId, after })
    },
    onDrop: event => {
      if (!onReorderFile || !Array.from(event.dataTransfer?.types || []).includes(LIB_FILE_DRAG)) return
      event.preventDefault()
      const sourceId = event.dataTransfer.getData(LIB_FILE_DRAG)
      const after = isAfter(event)
      setDropIndicator(null)
      setDragSource(null)
      if (sourceId && sourceId !== docId) {
        // The order shown becomes the manual order (with the move applied).
        onReorderFile(sourceId, docId, after, shownDocs.map(doc => doc.id))
        setSort('custom')
        remember({ sort: 'custom' })
      }
    },
  })

  const startFileDrag = docId => event => {
    event.stopPropagation()
    fileDragProps(docId).onDragStart(event)
  }

  const folderDragProps = folderPath => ({
    draggable: Boolean(onReorderFolder),
    onDragStart: event => {
      event.dataTransfer.setData(LIB_FOLDER_DRAG, folderPath)
      event.dataTransfer.effectAllowed = 'move'
      setDragSource({ kind: 'folder', key: folderPath })
      const item = event.currentTarget.closest('.library-card, tr')
      if (item) event.dataTransfer.setDragImage?.(item, Math.round(item.clientWidth / 2), Math.round(item.clientHeight / 2))
    },
    onDragEnd: () => { setDropIndicator(null); setDragSource(null) },
    onDragOver: event => {
      if (!onReorderFolder || !Array.from(event.dataTransfer?.types || []).includes(LIB_FOLDER_DRAG)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const after = isAfter(event)
      setDropIndicator(current => current?.kind === 'folder' && current.key === folderPath && current.after === after ? current : { kind: 'folder', key: folderPath, after })
    },
    onDrop: event => {
      if (!onReorderFolder || !Array.from(event.dataTransfer?.types || []).includes(LIB_FOLDER_DRAG)) return
      event.preventDefault()
      const sourcePath = event.dataTransfer.getData(LIB_FOLDER_DRAG)
      const after = isAfter(event)
      setDropIndicator(null)
      setDragSource(null)
      if (sourcePath && sourcePath !== folderPath) onReorderFolder(sourcePath, folderPath, after, childFolders.map(item => item.path))
    },
  })

  const startFolderDrag = folderPath => event => {
    event.stopPropagation()
    folderDragProps(folderPath).onDragStart(event)
  }

  const dropClass = (kind, key) => (
    dropIndicator?.kind === kind && dropIndicator.key === key
      ? (dropIndicator.after ? ' is-drop-after' : ' is-drop-before')
      : ''
  )

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="library-panel anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="library-title" className="flex items-center gap-2"><Library size={16} style={{ color: 'var(--accent)' }} />Library</h2>
            <p>{documents.length} {documents.length === 1 ? 'document' : 'documents'}. Click one to open it; tick several to move, tag, export or delete them together.</p>
          </div>
          <div className="library-head-actions">
            {onOpenImages && <button type="button" className="reader-chip" onClick={onOpenImages}><Images size={12} />Images{imageCount ? ` (${imageCount})` : ''}</button>}
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close library" data-tooltip="Close (Esc)"><X size={15} /></button>
          </div>
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
          {hasFolders && (
            <div className="pdf-segmented library-layout" role="radiogroup" aria-label="Browse mode">
              <button type="button" role="radio" aria-checked={browseMode === 'folders'} className={browseMode === 'folders' ? 'is-active' : ''} onClick={() => setBrowseMode('folders')}>Folders</button>
              <button type="button" role="radio" aria-checked={browseMode === 'files'} className={browseMode === 'files' ? 'is-active' : ''} onClick={() => setBrowseMode('files')}>Files</button>
            </div>
          )}
          <div className="pdf-segmented library-layout" role="radiogroup" aria-label="Layout">
            <button type="button" role="radio" aria-checked={layout === 'cards'} className={layout === 'cards' ? 'is-active' : ''} onClick={() => { setLayout('cards'); remember({ layout: 'cards' }) }} aria-label="Cards" data-tip="Cards"><LayoutGrid size={13} /></button>
            <button type="button" role="radio" aria-checked={layout === 'table'} className={layout === 'table' ? 'is-active' : ''} onClick={() => { setLayout('table'); remember({ layout: 'table' }) }} aria-label="Table" data-tip="Table"><List size={13} /></button>
          </div>
        </div>

        <div className={`library-bulk${chosen.length ? ' is-active' : ''}`} role="region" aria-label="Selected documents">
          <label className="graph-check"><input type="checkbox" checked={allVisibleSelected} onChange={selectAll} aria-label="Select all shown" />{chosen.length ? `${chosen.length} selected` : `${shownDocs.length} shown`}</label>
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
          {effectiveMode === 'folders' && currentPath && (
            <nav className="library-breadcrumbs" aria-label="Folder path">
              <button type="button" onClick={() => setCurrentPath('')}>All folders</button>
              {currentPath.split('/').map((part, idx, parts) => {
                const path = parts.slice(0, idx + 1).join('/')
                const isLast = idx === parts.length - 1
                return (
                  <span key={path} className="inline-flex items-center gap-1">
                    <span aria-hidden="true">/</span>
                    {isLast ? <span aria-current="page">{part}</span> : <button type="button" onClick={() => setCurrentPath(path)}>{part}</button>}
                  </span>
                )
              })}
            </nav>
          )}
          {childFolders.length === 0 && shownDocs.length === 0 ? (
            <div className="library-empty">
              <EmptyState compact icon={Library} title={documents.length ? 'No documents match' : 'No documents yet'}
                text={documents.length ? 'Try another search, folder or view.' : 'Create or open a document to see it here.'} />
              {filtersActive && <button type="button" className="reader-chip" onClick={clearFilters}>Show all documents</button>}
            </div>
          ) : layout === 'cards' ? (
            <ul className="library-cards" aria-label="Documents">
              {childFolders.map(item => (
                <li key={`folder:${item.path}`} className={`library-card is-folder-card${dropClass('folder', item.path)}${dragSource?.kind === 'folder' && dragSource.key === item.path ? ' is-dragging' : ''}`} {...folderDragProps(item.path)}>
                  <button type="button" className="library-card-open" draggable={Boolean(onReorderFolder)} onDragStart={startFolderDrag(item.path)} onClick={() => setCurrentPath(item.path)} aria-label={`Open folder ${item.name}`} />
                  <div className="library-card-head">
                    <Folder size={14} aria-hidden="true" />
                    <strong>{item.name}</strong>
                  </div>
                  <div className="library-card-foot">
                    <span>{item.count} {item.count === 1 ? 'document' : 'documents'}</span>
                    <Chip>Folder</Chip>
                  </div>
                </li>
              ))}
              {shownDocs.map(doc => (
                <li key={doc.id} className={`library-card${doc.id === activeId ? ' is-current' : ''}${selected.has(doc.id) ? ' is-selected' : ''}${dropClass('file', doc.id)}${dragSource?.kind === 'file' && dragSource.key === doc.id ? ' is-dragging' : ''}`} {...fileDragProps(doc.id)}>
                  <input type="checkbox" className="library-select" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} aria-label={`Select ${doc.title}`} />
                  <button type="button" className="library-card-open" draggable={Boolean(onReorderFile)} onDragStart={startFileDrag(doc.id)} onClick={() => open(doc)} aria-label={`Open ${doc.title}`} />
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
                {childFolders.map(item => (
                  <tr key={`folder:${item.path}`} className={`${dropClass('folder', item.path)}${dragSource?.kind === 'folder' && dragSource.key === item.path ? ' is-dragging' : ''}`} {...folderDragProps(item.path)}>
                    <td />
                    <td><button type="button" className="library-row-open" draggable={Boolean(onReorderFolder)} onDragStart={startFolderDrag(item.path)} onClick={() => setCurrentPath(item.path)}><strong className="inline-flex items-center gap-1.5"><Folder size={13} aria-hidden="true" />{item.name}</strong><span>Folder</span></button></td>
                    <td>{item.path}</td>
                    <td>—</td>
                    <td />
                    <td className="is-num">{item.count}</td>
                    <td>—</td>
                  </tr>
                ))}
                {shownDocs.map(doc => (
                  <tr key={doc.id} className={`${doc.id === activeId ? 'is-current' : ''}${selected.has(doc.id) ? ' is-selected' : ''}${dropClass('file', doc.id)}${dragSource?.kind === 'file' && dragSource.key === doc.id ? ' is-dragging' : ''}`} {...fileDragProps(doc.id)}>
                    <td><input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} aria-label={`Select ${doc.title}`} /></td>
                    <td><button type="button" className="library-row-open" draggable={Boolean(onReorderFile)} onDragStart={startFileDrag(doc.id)} onClick={() => open(doc)}><strong>{doc.title}</strong><span>{doc.name}{doc.closed ? ' · closed' : ''}</span></button></td>
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
