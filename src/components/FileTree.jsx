import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Eye, FilePlus, FileText, Folder, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Pin, PinOff, RotateCcw, Trash2, X } from '../icons'
import { FILE_DRAG_TYPE, MAX_FOLDER_DEPTH, folderDepth, isModifiedFromDisk, labelColor } from '../fileUtils'

const FOLDER_DRAG_TYPE = 'application/x-readme-folder'
const SHOW_CLOSED_KEY = 'readme-show-closed-files'


/** Builds a folder tree from "folder/sub/file.md" style names. */
function buildFileTree(files, closedFiles = [], emptyFolders = []) {
  const root = { name: '', path: '', folders: new Map(), files: [] }
  // Folders made with "New folder" show even before they hold a file.
  for (const folder of emptyFolders) {
    let node = root
    for (const part of folder.split('/').filter(Boolean)) {
      const path = node.path ? `${node.path}/${part}` : part
      if (!node.folders.has(part)) node.folders.set(part, { name: part, path, folders: new Map(), files: [] })
      node = node.folders.get(part)
    }
  }
  const entries = [...files.map(file => ({ file })), ...closedFiles.map(file => ({ file, closed: true }))]
  for (const { file, closed } of entries) {
    const parts = file.name.split('/').filter(Boolean)
    const base = parts.pop() || file.name
    let node = root
    for (const part of parts) {
      const path = node.path ? `${node.path}/${part}` : part
      if (!node.folders.has(part)) node.folders.set(part, { name: part, path, folders: new Map(), files: [] })
      node = node.folders.get(part)
    }
    node.files.push({ file, base, closed })
  }
  return root
}

const countFiles = node => node.files.length + [...node.folders.values()].reduce((sum, child) => sum + countFiles(child), 0)

export default function FileTree({
  files, closedFiles = [], emptyFolders = [], activeFileId, collapsed, onToggleFolder, onSelect, onReopen, onForget, onDelete, onDeleteClosed, onMoveFile, onNewFile, onNewFolder, onRenameFolder, onCloseFolder, onDeleteFolder, onNewSubfolder, onRenameFile, onTogglePin, canPin = true, fileOrder = [], folderOrder = [], onReorderFile, onReorderFolder, onClose,
}) {
  const [showClosed, setShowClosed] = useState(() => {
    try { return localStorage.getItem(SHOW_CLOSED_KEY) !== 'false' } catch { return true }
  })
  const [closedMenuOpen, setClosedMenuOpen] = useState(false)
  const [closedMenuPosition, setClosedMenuPosition] = useState(null)
  const closedMenuTriggerRef = useRef(null)
  const closedMenuRef = useRef(null)
  const positionClosedMenu = useCallback(() => {
    const rect = closedMenuTriggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(242, window.innerWidth - 16)
    const height = 92
    const above = rect.bottom + height > window.innerHeight && rect.top > height
    setClosedMenuPosition({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      width,
      ...(above ? { bottom: window.innerHeight - rect.top + 5 } : { top: rect.bottom + 5 }),
      maxHeight: Math.max(120, above ? rect.top - 16 : window.innerHeight - rect.bottom - 16),
    })
  }, [])
  useEffect(() => {
    if (!closedMenuOpen) return undefined
    const closeOutside = event => {
      if (!closedMenuTriggerRef.current?.contains(event.target) && !closedMenuRef.current?.contains(event.target)) setClosedMenuOpen(false)
    }
    const closeEscape = event => {
      if (event.key === 'Escape') { setClosedMenuOpen(false); closedMenuTriggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    window.addEventListener('resize', positionClosedMenu)
    window.addEventListener('scroll', positionClosedMenu, true)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
      window.removeEventListener('resize', positionClosedMenu)
      window.removeEventListener('scroll', positionClosedMenu, true)
    }
  }, [closedMenuOpen, positionClosedMenu])
  const toggleShowClosed = () => setShowClosed(prev => {
    const next = !prev
    try { localStorage.setItem(SHOW_CLOSED_KEY, String(next)) } catch { /* optional */ }
    return next
  })
  const closedList = useMemo(() => closedFiles.map(entry => entry.file), [closedFiles])
  const visibleClosed = useMemo(() => (showClosed ? closedList : []), [showClosed, closedList])
  const tree = useMemo(() => buildFileTree(files, visibleClosed, emptyFolders), [files, visibleClosed, emptyFolders])
  const [dropTarget, setDropTarget] = useState(null)
  const [reorderTarget, setReorderTarget] = useState(null) // { kind: 'file'|'folder', key, after }
  const [dragSource, setDragSource] = useState(null)
  const folderOrderMap = useMemo(() => new Map(folderOrder.map((path, index) => [path, index])), [folderOrder])
  const fileOrderMap = useMemo(() => new Map(fileOrder.map((id, index) => [id, index])), [fileOrder])
  const orderedFolders = folders => [...folders.values()].sort((a, b) => {
    const ia = folderOrderMap.has(a.path) ? folderOrderMap.get(a.path) : Number.MAX_SAFE_INTEGER
    const ib = folderOrderMap.has(b.path) ? folderOrderMap.get(b.path) : Number.MAX_SAFE_INTEGER
    return (ia - ib) || a.name.localeCompare(b.name, undefined, { numeric: true })
  })
  const orderedFiles = entries => [...entries].sort((a, b) => {
    const closedDiff = Boolean(a.closed) - Boolean(b.closed)
    if (closedDiff) return closedDiff
    const ia = fileOrderMap.has(a.file.id) ? fileOrderMap.get(a.file.id) : Number.MAX_SAFE_INTEGER
    const ib = fileOrderMap.has(b.file.id) ? fileOrderMap.get(b.file.id) : Number.MAX_SAFE_INTEGER
    return (ia - ib) || a.base.localeCompare(b.base, undefined, { numeric: true })
  })
  // What's shown in a folder, in order (the base for a drag-and-drop reorder).
  const nodeAt = path => path.split('/').filter(Boolean).reduce((node, part) => node?.folders.get(part), tree)
  const siblingFolders = parentPath => orderedFolders((nodeAt(parentPath) ?? tree).folders).map(node => node.path)
  const hasFileDrag = event => Array.from(event.dataTransfer?.types || []).includes(FILE_DRAG_TYPE)
  const hasFolderDrag = event => Array.from(event.dataTransfer?.types || []).includes(FOLDER_DRAG_TYPE)

  const dropProps = folderPath => ({
    onDragOver: event => {
      if (hasFolderDrag(event) && folderPath && onReorderFolder) {
        event.preventDefault()
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const after = event.clientY > rect.top + rect.height / 2
        event.dataTransfer.dropEffect = 'move'
        setReorderTarget(current => current?.kind === 'folder' && current.key === folderPath && current.after === after ? current : { kind: 'folder', key: folderPath, after })
        return
      }
      if (!hasFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      if (dropTarget !== folderPath) setDropTarget(folderPath)
    },
    onDragLeave: event => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setDropTarget(current => (current === folderPath ? null : current))
        setReorderTarget(current => (current?.kind === 'folder' && current.key === folderPath ? null : current))
      }
    },
    onDrop: event => {
      if (hasFolderDrag(event) && folderPath && onReorderFolder) {
        event.preventDefault()
        event.stopPropagation()
        const sourcePath = event.dataTransfer.getData(FOLDER_DRAG_TYPE)
        const rect = event.currentTarget.getBoundingClientRect()
        const after = event.clientY > rect.top + rect.height / 2
        setReorderTarget(null)
        setDragSource(null)
        // Folders reorder among their siblings (same parent folder), in the order shown.
        const parent = path => path.split('/').slice(0, -1).join('/')
        if (sourcePath && sourcePath !== folderPath && parent(sourcePath) === parent(folderPath)) {
          onReorderFolder(sourcePath, folderPath, after, siblingFolders(parent(folderPath)))
        }
        return
      }
      if (!hasFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      setDropTarget(null)
      setDragSource(null)
      const id = event.dataTransfer.getData(FILE_DRAG_TYPE)
      if (id) onMoveFile(id, folderPath)
    },
  })

  const fileDropProps = (fileId, siblingIds, folderPath) => ({
    onDragOver: event => {
      if (!hasFileDrag(event) || !onReorderFile) return
      event.preventDefault()
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      const after = event.clientY > rect.top + rect.height / 2
      event.dataTransfer.dropEffect = 'move'
      setReorderTarget(current => current?.kind === 'file' && current.key === fileId && current.after === after ? current : { kind: 'file', key: fileId, after })
    },
    onDragLeave: event => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setReorderTarget(current => (current?.kind === 'file' && current.key === fileId ? null : current))
      }
    },
    onDrop: event => {
      if (!hasFileDrag(event) || !onReorderFile) return
      event.preventDefault()
      event.stopPropagation()
      const sourceId = event.dataTransfer.getData(FILE_DRAG_TYPE)
      const rect = event.currentTarget.getBoundingClientRect()
      const after = event.clientY > rect.top + rect.height / 2
      setReorderTarget(null)
      setDragSource(null)
      if (!sourceId || sourceId === fileId) return
      // Dropped on a file in another folder: it moves into that folder, next to the file.
      const source = [...files, ...closedList].find(item => item.id === sourceId)
      const sourceFolder = source ? source.name.split('/').slice(0, -1).join('/') : folderPath
      if (source && sourceFolder !== folderPath && onMoveFile) onMoveFile(sourceId, folderPath)
      onReorderFile(sourceId, fileId, after, siblingIds)
    },
  })

  const renderFolder = (node, depth) => {
    const open = !collapsed.includes(node.path)
    const reorderClass = reorderTarget?.kind === 'folder' && reorderTarget.key === node.path
      ? (reorderTarget.after ? ' is-drop-after' : ' is-drop-before')
      : ''
    return (
      <li key={`folder:${node.path}`} role="treeitem" aria-expanded={open} aria-label={`Folder ${node.name}`}>
        <div
          className={`file-tree-row is-folder${dropTarget === node.path ? ' is-drop-target' : ''}${reorderClass}${dragSource?.kind === 'folder' && dragSource.key === node.path ? ' is-dragging' : ''}`}
          style={{ '--depth': depth }}
          draggable
          onDragStart={event => {
            event.stopPropagation()
            event.dataTransfer.setData(FOLDER_DRAG_TYPE, node.path)
            event.dataTransfer.effectAllowed = 'move'
            setDragSource({ kind: 'folder', key: node.path })
            const row = event.currentTarget.closest('.file-tree-row')
            if (row) event.dataTransfer.setDragImage?.(row, Math.round(row.clientWidth / 2), Math.round(row.clientHeight / 2))
          }}
          onDragEnd={() => { setDropTarget(null); setReorderTarget(null); setDragSource(null) }}
          {...dropProps(node.path)}
        >
          <button type="button" className="file-tree-main" onClick={() => onToggleFolder(node.path)} aria-label={`${open ? 'Collapse' : 'Expand'} folder ${node.name}`}>
            <ChevronRight size={12} className={`file-tree-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
            {open ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
            <span className="file-tree-name">{node.name}</span>
            <span className="file-tree-count">{countFiles(node)}</span>
          </button>
          <span className="file-tree-actions">
            <button type="button" onClick={() => onNewFile(node.path)} data-tip={`New file in ${node.name}`} aria-label={`New file in ${node.name}`}><FilePlus size={12} /></button>
            {onNewSubfolder && folderDepth(node.path) < MAX_FOLDER_DEPTH && (
              <button type="button" onClick={() => onNewSubfolder(node.path)} data-tip={`New folder inside ${node.name}`} aria-label={`New folder inside ${node.name}`}><FolderPlus size={12} /></button>
            )}
            <button type="button" onClick={() => onRenameFolder(node.path)} data-tip="Rename folder" aria-label={`Rename folder ${node.name}`}><Pencil size={12} /></button>
            <button type="button" onClick={() => onCloseFolder(node.path)} data-tip={countFiles(node) ? 'Close all files in this folder' : 'Remove this empty folder'} aria-label={countFiles(node) ? `Close folder ${node.name}` : `Remove empty folder ${node.name}`}><X size={12} /></button>
            {onDeleteFolder && <button type="button" className="is-danger" onClick={() => onDeleteFolder(node.path)} data-tip={countFiles(node) ? 'Delete this folder and its files' : 'Delete this folder'} aria-label={`Delete folder ${node.name}`}><Trash2 size={12} /></button>}
          </span>
        </div>
        {open && (
          <ul role="group">
            {orderedFolders(node.folders).map(child => renderFolder(child, depth + 1))}
            {(() => { const entries = orderedFiles(node.files); const ids = entries.map(entry => entry.file.id); return entries.map(entry => renderFile(entry, depth + 1, ids, node.path)) })()}
            {node.folders.size === 0 && node.files.length === 0 && (
              <li className="file-tree-empty-folder" style={{ '--depth': depth }}>Empty. Use + or drag a file here.</li>
            )}
          </ul>
        )}
      </li>
    )
  }

  const renderFile = ({ file, base, closed }, depth, siblingIds = [], folderPath = '') => {
    const reorderClass = reorderTarget?.kind === 'file' && reorderTarget.key === file.id
      ? (reorderTarget.after ? ' is-drop-after' : ' is-drop-before')
      : ''
    if (closed) return (
      <li key={`closed:${file.id}`} role="treeitem" aria-selected={false} aria-label={`${file.name} (closed)`}>
        <div className={`file-tree-row is-closed${reorderClass}${dragSource?.kind === 'file' && dragSource.key === file.id ? ' is-dragging' : ''}`} style={{ '--depth': depth }} {...fileDropProps(file.id, siblingIds, folderPath)}>
          <button type="button" className="file-tree-main" onClick={() => onReopen(file.id)} data-tip={`Reopen ${file.name}`}
            draggable onDragStart={event => {
              event.dataTransfer.setData(FILE_DRAG_TYPE, file.id); event.dataTransfer.setData('text/plain', file.name); event.dataTransfer.effectAllowed = 'copyMove'
              setDragSource({ kind: 'file', key: file.id })
              const row = event.currentTarget.closest('.file-tree-row')
              if (row) event.dataTransfer.setDragImage?.(row, Math.round(row.clientWidth / 2), Math.round(row.clientHeight / 2))
            }}
            onDragEnd={() => { setReorderTarget(null); setDragSource(null) }}>
            <span className="file-tree-chevron-spacer" aria-hidden="true" />
            <FileText size={13} aria-hidden="true" />
            <span className="file-tree-name">{base}</span>
            <span className="file-tree-closed-tag">closed</span>
          </button>
          <span className="file-tree-actions">
            <button type="button" onClick={() => onReopen(file.id)} data-tip="Reopen" aria-label={`Reopen ${file.name}`}><RotateCcw size={12} /></button>
            {onDelete && <button type="button" onClick={() => onDelete(file.id)} data-tip="Delete permanently" aria-label={`Delete ${file.name} permanently`}><Trash2 size={12} /></button>}
            <button type="button" onClick={() => onForget([file.id])} data-tip="Remove from list" aria-label={`Remove ${file.name} from the list`}><X size={12} /></button>
          </span>
        </div>
      </li>
    )
    const active = file.id === activeFileId
    const color = labelColor(file.color)
    return (
      <li key={file.id} role="treeitem" aria-selected={active} aria-label={file.name}>
        <div className={`file-tree-row${active ? ' is-active' : ''}${reorderClass}${dragSource?.kind === 'file' && dragSource.key === file.id ? ' is-dragging' : ''}`} style={{ '--depth': depth }} {...fileDropProps(file.id, siblingIds, folderPath)}>
          <button
            type="button"
            className="file-tree-main"
            draggable
            onDragStart={event => {
              event.dataTransfer.setData(FILE_DRAG_TYPE, file.id)
              event.dataTransfer.setData('text/plain', file.name)
              event.dataTransfer.effectAllowed = 'copyMove'
              setDragSource({ kind: 'file', key: file.id })
              const row = event.currentTarget.closest('.file-tree-row')
              if (row) event.dataTransfer.setDragImage?.(row, Math.round(row.clientWidth / 2), Math.round(row.clientHeight / 2))
            }}
            onDragEnd={() => { setReorderTarget(null); setDragSource(null) }}
            onClick={() => onSelect(file.id)}
            data-tip={file.name}
          >
            <span className="file-tree-chevron-spacer" aria-hidden="true" />
            <FileText size={13} aria-hidden="true" style={color ? { color } : undefined} />
            <span className="file-tree-name">{base}</span>
            {file.pinned && <Pin size={11} className="file-tree-pin" aria-label="Pinned" />}
            {isModifiedFromDisk(file) && <span className="file-modified-dot" aria-label="Unsaved changes" />}
          </button>
          {(onDelete || onRenameFile || onTogglePin) && (
            <span className="file-tree-actions">
              {onTogglePin && (
                <button type="button" onClick={() => onTogglePin(file.id)} aria-pressed={Boolean(file.pinned)}
                  data-tip={file.pinned ? 'Unpin' : canPin ? 'Pin to the front of the tab bar' : 'Up to 5 files can be pinned'}
                  aria-label={file.pinned ? `Unpin ${file.name}` : `Pin ${file.name}`}>
                  {file.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                </button>
              )}
              {onRenameFile && <button type="button" onClick={() => onRenameFile(file.id)} data-tip="Rename file" aria-label={`Rename ${file.name}`}><Pencil size={12} /></button>}
              {onDelete && <button type="button" onClick={() => onDelete(file.id)} data-tip="Delete permanently" aria-label={`Delete ${file.name} permanently`}><Trash2 size={12} /></button>}
            </span>
          )}
        </div>
      </li>
    )
  }

  return (
    <aside className="file-tree no-print" aria-label="Files">
      <div className="file-tree-header">
        <span>Files</span>
        <span className="file-tree-header-actions">
          <button type="button" onClick={() => onNewFile('')} data-tip="New file" aria-label="New file at top level"><FilePlus size={13} /></button>
          <button type="button" onClick={onNewFolder} data-tip="New folder" aria-label="New folder"><FolderPlus size={13} /></button>
          {closedList.length > 0 && (
            <div className="file-tree-more-wrap">
              <button type="button" ref={closedMenuTriggerRef} onClick={() => {
                if (closedMenuOpen) setClosedMenuOpen(false)
                else { positionClosedMenu(); setClosedMenuOpen(true) }
              }} aria-expanded={closedMenuOpen}
                aria-label="Closed file options" data-tip="Closed file options"><MoreHorizontal size={15} /></button>
              {closedMenuOpen && closedMenuPosition && createPortal(
                <div ref={closedMenuRef} className="file-tree-more-menu anim-pop-in" role="menu" aria-label="Closed file options"
                  style={{ position: 'fixed', left: closedMenuPosition.left, top: closedMenuPosition.top, bottom: closedMenuPosition.bottom, width: closedMenuPosition.width, maxHeight: closedMenuPosition.maxHeight }}>
                  <button type="button" role="menuitem" onClick={() => { toggleShowClosed(); setClosedMenuOpen(false) }}>
                    <Eye size={16} /><span>{showClosed ? 'Hide closed files' : 'Show closed files'}</span>
                  </button>
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { setClosedMenuOpen(false); (onDeleteClosed || onForget)(closedList.map(file => file.id)) }}>
                    <Trash2 size={16} /><span>Delete all closed files ({closedList.length})</span>
                  </button>
                </div>, document.body,
              )}
            </div>
          )}
          <button type="button" onClick={onClose} data-tip="Hide files" aria-label="Hide file tree"><X size={13} /></button>
        </span>
      </div>
      <ul className={`file-tree-list${dropTarget === '' ? ' is-drop-target' : ''}`} role="tree" aria-label="Files" {...dropProps('')}>
        {orderedFolders(tree.folders).map(child => renderFolder(child, 0))}
        {(() => { const entries = orderedFiles(tree.files); const ids = entries.map(entry => entry.file.id); return entries.map(entry => renderFile(entry, 0, ids, '')) })()}
        {files.length === 0 && visibleClosed.length === 0 && emptyFolders.length === 0 && <li className="file-tree-empty">No files yet</li>}
      </ul>
    </aside>
  )
}
