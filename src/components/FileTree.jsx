import { useMemo, useState } from 'react'
import { ChevronRight, FilePlus, FileText, Folder, FolderOpen, FolderPlus, Pencil, RotateCcw, Trash2, X } from '../icons'
import { isModifiedFromDisk, labelColor } from '../fileUtils'

const FILE_DRAG_TYPE = 'application/x-readme-file'

/** Builds a folder tree from "folder/sub/file.md" style names. */
function buildFileTree(files, closedFiles = []) {
  const root = { name: '', path: '', folders: new Map(), files: [] }
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

const sortFolders = folders => [...folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
// Open files first, then the ones closed from the tab bar (each group by name).
const sortFiles = entries => [...entries].sort((a, b) => (Boolean(a.closed) - Boolean(b.closed)) || a.base.localeCompare(b.base, undefined, { numeric: true }))
const countFiles = node => node.files.length + [...node.folders.values()].reduce((sum, child) => sum + countFiles(child), 0)

export default function FileTree({
  files, closedFiles = [], activeFileId, collapsed, onToggleFolder, onSelect, onReopen, onForget, onDelete, onMoveFile, onNewFile, onNewFolder, onRenameFolder, onCloseFolder, onClose,
}) {
  const closedList = useMemo(() => closedFiles.map(entry => entry.file), [closedFiles])
  const tree = useMemo(() => buildFileTree(files, closedList), [files, closedList])
  const [dropTarget, setDropTarget] = useState(null)
  const hasDrag = event => Array.from(event.dataTransfer?.types || []).includes(FILE_DRAG_TYPE)

  const dropProps = folderPath => ({
    onDragOver: event => {
      if (!hasDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      if (dropTarget !== folderPath) setDropTarget(folderPath)
    },
    onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(current => (current === folderPath ? null : current)) },
    onDrop: event => {
      if (!hasDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      setDropTarget(null)
      const id = event.dataTransfer.getData(FILE_DRAG_TYPE)
      if (id) onMoveFile(id, folderPath)
    },
  })

  const renderFolder = (node, depth) => {
    const open = !collapsed.includes(node.path)
    return (
      <li key={`folder:${node.path}`} role="treeitem" aria-expanded={open} aria-label={`Folder ${node.name}`}>
        <div
          className={`file-tree-row is-folder${dropTarget === node.path ? ' is-drop-target' : ''}`}
          style={{ '--depth': depth }}
          {...dropProps(node.path)}
        >
          <button type="button" className="file-tree-main" onClick={() => onToggleFolder(node.path)} aria-label={`${open ? 'Collapse' : 'Expand'} folder ${node.name}`}>
            <ChevronRight size={12} className={`file-tree-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
            {open ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
            <span className="file-tree-name">{node.name}</span>
            <span className="file-tree-count">{countFiles(node)}</span>
          </button>
          <span className="file-tree-actions">
            <button type="button" onClick={() => onNewFile(node.path)} title={`New file in ${node.name}`} aria-label={`New file in ${node.name}`}><FilePlus size={12} /></button>
            <button type="button" onClick={() => onRenameFolder(node.path)} title="Rename folder" aria-label={`Rename folder ${node.name}`}><Pencil size={12} /></button>
            <button type="button" onClick={() => onCloseFolder(node.path)} title="Close all files in this folder" aria-label={`Close folder ${node.name}`}><X size={12} /></button>
          </span>
        </div>
        {open && (
          <ul role="group">
            {sortFolders(node.folders).map(child => renderFolder(child, depth + 1))}
            {sortFiles(node.files).map(entry => renderFile(entry, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  const renderFile = ({ file, base, closed }, depth) => {
    if (closed) return (
      <li key={`closed:${file.id}`} role="treeitem" aria-selected={false} aria-label={`${file.name} (closed)`}>
        <div className="file-tree-row is-closed" style={{ '--depth': depth }}>
          <button type="button" className="file-tree-main" onClick={() => onReopen(file.id)} title={`Reopen ${file.name}`}>
            <span className="file-tree-chevron-spacer" aria-hidden="true" />
            <FileText size={13} aria-hidden="true" />
            <span className="file-tree-name">{base}</span>
            <span className="file-tree-closed-tag">closed</span>
          </button>
          <span className="file-tree-actions">
            <button type="button" onClick={() => onReopen(file.id)} title="Reopen" aria-label={`Reopen ${file.name}`}><RotateCcw size={12} /></button>
            {onDelete && <button type="button" onClick={() => onDelete(file.id)} title="Delete permanently" aria-label={`Delete ${file.name} permanently`}><Trash2 size={12} /></button>}
            <button type="button" onClick={() => onForget([file.id])} title="Remove from list" aria-label={`Remove ${file.name} from the list`}><X size={12} /></button>
          </span>
        </div>
      </li>
    )
    const active = file.id === activeFileId
    const color = labelColor(file.color)
    return (
      <li key={file.id} role="treeitem" aria-selected={active} aria-label={file.name}>
        <div className={`file-tree-row${active ? ' is-active' : ''}`} style={{ '--depth': depth }}>
          <button
            type="button"
            className="file-tree-main"
            draggable
            onDragStart={event => {
              event.dataTransfer.setData(FILE_DRAG_TYPE, file.id)
              event.dataTransfer.setData('text/plain', file.name)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => onSelect(file.id)}
            title={file.name}
          >
            <span className="file-tree-chevron-spacer" aria-hidden="true" />
            <FileText size={13} aria-hidden="true" style={color ? { color } : undefined} />
            <span className="file-tree-name">{base}</span>
            {isModifiedFromDisk(file) && <span className="file-modified-dot" aria-label="Unsaved changes" />}
          </button>
          {onDelete && (
            <span className="file-tree-actions">
              <button type="button" onClick={() => onDelete(file.id)} title="Delete permanently" aria-label={`Delete ${file.name} permanently`}><Trash2 size={12} /></button>
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
          <button type="button" onClick={() => onNewFile('')} title="New file" aria-label="New file at top level"><FilePlus size={13} /></button>
          <button type="button" onClick={onNewFolder} title="New folder" aria-label="New folder"><FolderPlus size={13} /></button>
          <button type="button" onClick={onClose} title="Hide files" aria-label="Hide file tree"><X size={13} /></button>
        </span>
      </div>
      <ul className={`file-tree-list${dropTarget === '' ? ' is-drop-target' : ''}`} role="tree" aria-label="Files" {...dropProps('')}>
        {sortFolders(tree.folders).map(child => renderFolder(child, 0))}
        {sortFiles(tree.files).map(entry => renderFile(entry, 0))}
        {files.length === 0 && closedList.length === 0 && <li className="file-tree-empty">No files yet</li>}
      </ul>
      {closedList.length > 0 && (
        <button type="button" className="file-tree-clear-closed" onClick={() => onForget(closedList.map(file => file.id))}>
          Clear {closedList.length} closed file{closedList.length === 1 ? '' : 's'} from the list
        </button>
      )}
      <p className="file-tree-hint">Closed files stay here; click one to reopen it. Drag files onto a folder to move them. Folders come from paths like <code>notes/plan.md</code>.</p>
    </aside>
  )
}
