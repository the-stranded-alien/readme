import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { shortcut } from '../platform'
import { useHoverTooltip } from '../useHoverTooltip'
import { FILE_LABEL_COLORS, TAB_DRAG_TYPE, fuzzyScore, isDiskBacked, isModifiedFromDisk, labelColor, cleanFileStem, splitFileName } from '../fileUtils'
import {
  Check, Command, CopyPlus, Download, FilePlus, FileText, GitCompare, HardDrive, FolderTree, Library, ListChecks, ListTree,
  BookOpenText, Pencil, Pin, PinOff, RotateCcw, Search, Trash2, X, XCircle,
} from '../icons'

function splitPath(name) {
  const slash = name.lastIndexOf('/')
  return slash === -1 ? { base: name, dir: '' } : { base: name.slice(slash + 1), dir: name.slice(0, slash) }
}

function useDismiss(open, refs, onDismiss) {
  useEffect(() => {
    if (!open) return undefined
    const onDown = event => {
      if (refs.some(ref => ref.current?.contains(event.target))) return
      onDismiss()
    }
    const onKey = event => { if (event.key === 'Escape') onDismiss() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onDismiss)
    window.addEventListener('blur', onDismiss)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('blur', onDismiss)
    }
  }, [open, refs, onDismiss])
}

function TabContextMenu({ menu, file, files, canReopen, actions, onClose }) {
  const ref = useRef(null)
  const refs = useMemo(() => [ref], [])
  useDismiss(true, refs, onClose)
  // Keep the menu inside the viewport (measured before paint).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`
    el.querySelector('button')?.focus()
  }, [menu.x, menu.y])

  const index = files.findIndex(item => item.id === file.id)
  const run = action => () => { onClose(); action() }
  const onKeyDown = event => {
    const items = Array.from(ref.current.querySelectorAll('[role="menuitem"]:not(:disabled), [role="menuitemradio"]'))
    const current = items.indexOf(document.activeElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length
      items[next]?.focus()
    } else if (event.key === 'Tab') {
      event.preventDefault()
    }
  }

  return createPortal(
    <div
      ref={ref}
      className="tab-context-menu anim-drop-in"
      role="menu"
      aria-label={`${file.name} options`}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={onKeyDown}
      onContextMenu={event => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={run(() => actions.onRename(file.id))}><Pencil size={13} />Rename</button>
      <button type="button" role="menuitem" onClick={run(() => actions.onDuplicate(file.id))}><CopyPlus size={13} />Duplicate</button>
      <button type="button" role="menuitem" onClick={run(() => actions.onTogglePin(file.id))}>
        {file.pinned ? <PinOff size={13} /> : <Pin size={13} />}{file.pinned ? 'Unpin tab' : 'Pin tab'}
      </button>
      <div className="tab-context-colors" role="group" aria-label="Colour label">
        <span>Label</span>
        <div>
          {FILE_LABEL_COLORS.map(color => (
            <button
              key={color.id}
              type="button"
              role="menuitemradio"
              aria-checked={file.color === color.id}
              aria-label={`${color.name} label`}
              data-tip={color.name}
              className="tab-color-swatch"
              style={{ '--swatch': color.value }}
              onClick={run(() => actions.onSetColor(file.id, file.color === color.id ? null : color.id))}
            >
              {file.color === color.id && <Check size={10} strokeWidth={3} />}
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!file.color}
            aria-label="No label"
            data-tip="No label"
            className="tab-color-swatch is-none"
            onClick={run(() => actions.onSetColor(file.id, null))}
          />
        </div>
      </div>
      <div className="tab-context-separator" role="separator" />
      <button type="button" role="menuitem" onClick={run(() => actions.onRevealOutline(file.id))}><ListTree size={13} />Reveal in outline</button>
      <button type="button" role="menuitem" onClick={run(() => actions.onCompare(file.id))} disabled={files.length < 2}><GitCompare size={13} />Compare with active file</button>
      <button type="button" role="menuitem" onClick={run(() => actions.onDownload(file.id))}><Download size={13} />Download</button>
      <div className="tab-context-separator" role="separator" />
      <button type="button" role="menuitem" onClick={run(() => actions.onClose(file.id))}><X size={13} />Close<kbd>Middle-click</kbd></button>
      <button type="button" role="menuitem" onClick={run(() => actions.onCloseOthers(file.id))} disabled={files.length < 2}><XCircle size={13} />Close others</button>
      <button type="button" role="menuitem" onClick={run(() => actions.onCloseToRight(file.id))} disabled={index === files.length - 1}><XCircle size={13} />Close to the right</button>
      <button type="button" role="menuitem" onClick={run(actions.onReopenClosed)} disabled={!canReopen}><RotateCcw size={13} />Reopen closed tab<kbd>{shortcut('T', { shift: true, alt: true, mod: false })}</kbd></button>
      {actions.onDelete && (
        <>
          <div className="tab-context-separator" role="separator" />
          <button type="button" role="menuitem" className="is-danger" onClick={run(() => actions.onDelete(file.id))}><Trash2 size={13} />Delete permanently…</button>
        </>
      )}
    </div>,
    document.body,
  )
}

function FileSwitcher({ files, activeFileId, recentIds, onSelect, onClose, anchorRef }) {
  const ref = useRef(null)
  const inputRef = useRef(null)
  const refs = useMemo(() => [ref, anchorRef], [anchorRef])
  useDismiss(true, refs, onClose)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const results = useMemo(() => {
    if (!query.trim()) {
      const byId = new Map(files.map(file => [file.id, file]))
      const recent = recentIds.map(id => byId.get(id)).filter(Boolean)
      const rest = files.filter(file => !recentIds.includes(file.id))
      return [...recent, ...rest]
    }
    return files
      .map(file => ({ file, score: fuzzyScore(query, file.name) }))
      .filter(entry => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.file)
  }, [files, query, recentIds])
  const selectedIndex = Math.min(highlight, Math.max(0, results.length - 1))

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    ref.current?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const choose = file => { onSelect(file.id); onClose() }
  const onKeyDown = event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((selectedIndex + 1) % Math.max(1, results.length)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((selectedIndex - 1 + results.length) % Math.max(1, results.length)) }
    else if (event.key === 'Enter' && results[selectedIndex]) { event.preventDefault(); choose(results[selectedIndex]) }
  }

  return (
    <div ref={ref} className="file-switcher anim-drop-in" role="dialog" aria-label="Switch file">
      <label className="file-switcher-search">
        <Search size={13} aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={event => { setQuery(event.target.value); setHighlight(0) }}
          onKeyDown={onKeyDown}
          placeholder="Find a file…"
          aria-label="Find a file"
          role="combobox"
          aria-expanded="true"
          aria-controls="file-switcher-list"
          aria-activedescendant={results[selectedIndex] ? `file-switcher-${results[selectedIndex].id}` : undefined}
        />
      </label>
      <div className="file-switcher-heading">{query.trim() ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'Recent files'}</div>
      <ul className="file-switcher-list" id="file-switcher-list" role="listbox" aria-label="Files">
        {results.map((file, index) => {
          const { base, dir } = splitPath(file.name)
          const color = labelColor(file.color)
          return (
            <li
              key={file.id}
              id={`file-switcher-${file.id}`}
              data-index={index}
              role="option"
              aria-selected={index === selectedIndex}
              className={`file-switcher-item${index === selectedIndex ? ' is-highlighted' : ''}${file.id === activeFileId ? ' is-active' : ''}`}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(file)}
            >
              <FileText size={13} style={{ color: color || (file.id === activeFileId ? 'var(--accent)' : 'var(--text-4)') }} aria-hidden="true" />
              <span className="file-switcher-name">{base}</span>
              {dir && <span className="file-switcher-dir">{dir}</span>}
              <span className="file-switcher-meta">
                {file.pinned && <Pin size={11} aria-label="Pinned" />}
                {isModifiedFromDisk(file) && <span className="file-modified-dot" aria-label="Unsaved changes" />}
              </span>
            </li>
          )
        })}
        {results.length === 0 && <li className="file-switcher-empty">No files match “{query}”</li>}
      </ul>
    </div>
  )
}

export default function FileTabBar({
  files, activeFileId, recentIds, canReopen,
  onSelect, onClose, onCreate, onRename, onDuplicate, onCompare, onReorder, onTogglePin, onSetColor,
  onCloseOthers, onCloseToRight, onRevealOutline, onDownload, onReopenClosed, onDelete, fileTreeOpen, onToggleFileTree, onOpenTasks, onOpenDailyNotes, onOpenLibrary, tasksDueCount = 0,
  searchValue, onSearchChange, onSearchFocus, onOpenCommandPalette,
}) {
  // Labels for the small duplicate / close icons, in the app's tooltip style (the strip scrolls, so CSS tooltips would be clipped).
  const [tipHandlers, tabTooltip] = useHoverTooltip()
  const tabRefs = useRef({})
  const scrollRef = useRef(null)
  const countRef = useRef(null)
  const [editingId, setEditingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [menu, setMenu] = useState(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [compareDrop, setCompareDrop] = useState(false)
  const [fades, setFades] = useState({ left: false, right: false })

  useEffect(() => {
    if (!activeFileId) return
    tabRefs.current[activeFileId]?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeFileId, files.length])

  const updateFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setFades(current => (current.left === left && current.right === right ? current : { left, right }))
  }, [])
  useEffect(() => {
    updateFades()
    const el = scrollRef.current
    const observer = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(updateFades) : null
    if (el) observer?.observe(el)
    window.addEventListener('resize', updateFades)
    return () => { observer?.disconnect(); window.removeEventListener('resize', updateFades) }
  }, [updateFades, files.length])

  const startRename = id => {
    const file = files.find(item => item.id === id)
    if (!file) return
    setEditingId(id)
    // Only the name is editable: the folder and the extension stay as they are.
    setDraftName(splitFileName(file.name).stem)
  }
  const commitRename = id => {
    const file = files.find(item => item.id === id)
    const stem = cleanFileStem(draftName)
    if (file && stem) {
      const { dir, ext } = splitFileName(file.name)
      if (`${dir}${stem}${ext}` !== file.name) onRename(id, `${dir}${stem}${ext}`)
    }
    setEditingId(null)
  }

  const openMenu = (file, x, y) => setMenu({ id: file.id, x, y })
  const closeMenu = useCallback(() => setMenu(null), [])
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), [])
  const menuFile = menu && files.find(file => file.id === menu.id)

  const endDrag = () => { setDragId(null); setDropTarget(null); setCompareDrop(false) }
  const dragIdFrom = event => event.dataTransfer.getData(TAB_DRAG_TYPE) || dragId
  const hasTabDrag = event => Array.from(event.dataTransfer?.types || []).includes(TAB_DRAG_TYPE)

  return (
    <nav className="file-tabs-bar no-print" aria-label="Files and commands">
      {onToggleFileTree && (
        <button type="button" onClick={onToggleFileTree} className={`file-tree-toggle${fileTreeOpen ? ' is-active' : ''}`}
          aria-label={fileTreeOpen ? 'Hide file tree' : 'Show file tree'} aria-pressed={Boolean(fileTreeOpen)} data-tooltip="Files and folders">
          <FolderTree size={14} />
        </button>
      )}
      {onOpenLibrary && (
        <button type="button" onClick={onOpenLibrary} className="file-tree-toggle" data-tour="library" aria-label="Library: all documents" data-tooltip="Library: all documents">
          <Library size={14} />
        </button>
      )}
      <button type="button" onClick={onCreate} className="file-tree-toggle tooltip-start" data-tooltip="New File" aria-label="New File">
        <FilePlus size={14} />
      </button>
      <div
        ref={scrollRef}
        className={`file-tabs-scroll${fades.left ? ' fade-left' : ''}${fades.right ? ' fade-right' : ''}`}
        role="tablist"
        aria-label="Open files"
        {...tipHandlers}
        onScroll={event => { updateFades(event); tipHandlers.onScroll() }}
        onWheel={event => {
          // Let a vertical mouse wheel scroll the tab strip horizontally.
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY
        }}
      >
        {tabTooltip}
        {files.map((file, index) => {
          const isActive = file.id === activeFileId
          const isEditing = editingId === file.id
          const color = labelColor(file.color)
          const modified = isModifiedFromDisk(file)
          const diskBacked = isDiskBacked(file)
          const dropClass = dropTarget?.id === file.id ? (dropTarget.after ? ' drop-after' : ' drop-before') : ''
          const previous = files[index - 1]
          const groupBreak = previous?.pinned && !file.pinned
          return (
            <div
              key={file.id}
              ref={el => { if (el) tabRefs.current[file.id] = el; else delete tabRefs.current[file.id] }}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              draggable={!isEditing}
              onDragStart={event => {
                event.dataTransfer.setData(TAB_DRAG_TYPE, file.id)
                event.dataTransfer.setData('text/plain', file.name)
                event.dataTransfer.effectAllowed = 'move'
                setDragId(file.id)
              }}
              onDragEnd={endDrag}
              onDragOver={event => {
                if (!hasTabDrag(event)) return
                const sourceId = dragId
                const source = files.find(item => item.id === sourceId)
                if (source && Boolean(source.pinned) !== Boolean(file.pinned)) return
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'move'
                const rect = event.currentTarget.getBoundingClientRect()
                const after = event.clientX > rect.left + rect.width / 2
                if (dropTarget?.id !== file.id || dropTarget.after !== after) setDropTarget({ id: file.id, after })
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget) && dropTarget?.id === file.id) setDropTarget(null)
              }}
              onDrop={event => {
                event.preventDefault()
                event.stopPropagation()
                const sourceId = dragIdFrom(event)
                if (sourceId && sourceId !== file.id) onReorder(sourceId, file.id, Boolean(dropTarget?.after))
                endDrag()
              }}
              onClick={() => onSelect(file.id)}
              onAuxClick={event => {
                if (event.button === 1) { event.preventDefault(); onClose(file.id) }
              }}
              onMouseDown={event => { if (event.button === 1) event.preventDefault() }}
              onContextMenu={event => {
                event.preventDefault()
                openMenu(file, event.clientX, event.clientY)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(file.id) }
                else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  openMenu(file, rect.left + 8, rect.bottom + 4)
                } else if (event.key === 'F2') { event.preventDefault(); startRename(file.id) }
                else if (event.key === 'Delete') { event.preventDefault(); onClose(file.id) }
              }}
              data-tip={`${file.name}${modified ? ' — unsaved changes' : diskBacked ? ' — saved to disk' : ''}\nDouble-click to rename · right-click for options`}
              aria-label={`${file.name}${file.pinned ? ', pinned' : ''}${modified ? ', unsaved changes' : ''}`}
              aria-keyshortcuts="Delete F2 Shift+F10"
              className={`file-tab${isActive ? ' active' : ''}${file.pinned ? ' is-pinned' : ''}${color ? ' has-label' : ''}${dragId === file.id ? ' is-dragging' : ''}${groupBreak ? ' group-start' : ''}${dropClass}`}
              style={color ? { '--tab-label': color } : undefined}
            >
              {file.pinned
                ? <Pin size={12} className="file-tab-icon" style={{ color: color || (isActive ? 'var(--accent)' : 'var(--text-4)') }} aria-hidden="true" />
                : <FileText size={12} className="file-tab-icon" style={{ color: color || (isActive ? 'var(--accent)' : 'var(--text-4)') }} aria-hidden="true" />}
              {file.pinned && !isEditing ? null : isEditing ? (
                <span className="file-tab-rename-wrap">
                <input
                  className="file-tab-rename"
                  aria-label={`Rename ${splitFileName(file.name).stem}${splitFileName(file.name).ext ? ` (the ${splitFileName(file.name).ext} extension stays)` : ''}`}
                  value={draftName}
                  autoFocus
                  onFocus={event => event.target.select()}
                  onClick={event => event.stopPropagation()}
                  onChange={event => setDraftName(event.target.value)}
                  onBlur={() => commitRename(file.id)}
                  onKeyDown={event => {
                    event.stopPropagation()
                    if (event.key === 'Enter') commitRename(file.id)
                    else if (event.key === 'Escape') setEditingId(null)
                  }}
                />
                {splitFileName(file.name).ext && <span className="file-tab-rename-ext" aria-hidden="true">{splitFileName(file.name).ext}</span>}
                </span>
              ) : (
                <span className="truncate" onDoubleClick={event => { event.stopPropagation(); startRename(file.id) }}>
                  {splitPath(file.name).base}
                </span>
              )}
              {diskBacked && !file.pinned && (
                <HardDrive
                  size={10}
                  className={`file-tab-disk${modified ? ' is-modified' : ''}`}
                  aria-hidden="true"
                />
              )}
              {!file.pinned && (
                // Mouse shortcut; keyboard users duplicate via the tab menu (Shift+F10).
                <span
                  onClick={event => { event.stopPropagation(); onDuplicate(file.id) }}
                  className="file-tab-duplicate"
                  data-tip={`Duplicate ${file.name}`}
                  aria-hidden="true"
                >
                  <CopyPlus size={11} />
                </span>
              )}
              {file.pinned ? (
                modified && <span className="file-modified-dot is-pinned-dot" aria-hidden="true" />
              ) : (
                <span
                  onClick={event => { event.stopPropagation(); onClose(file.id) }}
                  className={`file-tab-close${modified ? ' is-modified' : ''}`}
                  data-tip={modified ? `Close ${file.name} (unsaved changes)` : `Close ${file.name}`}
                  // Keyboard users close with Delete and reach other actions via Shift+F10.
                  aria-hidden="true"
                >
                  <span className="file-modified-dot" aria-hidden="true" />
                  <X size={10} />
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="file-tab-count-wrap">
        <button
          ref={countRef}
          type="button"
          className="file-tab-count hidden sm:inline-flex"
          onClick={() => setSwitcherOpen(open => !open)}
          aria-label={`${files.length} open ${files.length === 1 ? 'file' : 'files'}. Switch file`}
          aria-haspopup="dialog"
          aria-expanded={switcherOpen}
          data-tooltip={switcherOpen ? undefined : 'Switch file'}
        >
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </button>
        {switcherOpen && (
          <FileSwitcher
            files={files}
            activeFileId={activeFileId}
            recentIds={recentIds}
            onSelect={onSelect}
            onClose={closeSwitcher}
            anchorRef={countRef}
          />
        )}
      </div>
      <div className="file-tabs-search-region">
        <div className="file-tabs-compare-control">
          <button
            type="button"
            onClick={() => onCompare()}
            onDragOver={event => {
              if (!hasTabDrag(event) || files.length < 2) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setCompareDrop(true)
            }}
            onDragLeave={() => setCompareDrop(false)}
            onDrop={event => {
              event.preventDefault()
              const sourceId = dragIdFrom(event)
              endDrag()
              if (sourceId) onCompare(sourceId)
            }}
            className={`file-tabs-command-button${compareDrop ? ' is-drop-target' : ''}${dragId && files.length > 1 ? ' is-drop-ready' : ''}`}
            data-tooltip={dragId ? 'Drop to compare with the active file' : 'Compare open files (drop a tab here)'}
            aria-label="Compare open files"
            disabled={files.length < 2}
          >
            <GitCompare size={14} />
          </button>
        </div>
        {onOpenTasks && (
          <button type="button" onClick={onOpenTasks} className="file-tabs-command-button file-tabs-tasks"
            data-tip={tasksDueCount ? `Tasks, ${tasksDueCount} due today or overdue. Open Tasks to review task lists and document deadlines.` : 'Tasks in all documents. Open Tasks to review lists, set due dates, and add document deadline reminders.'}
            aria-label={tasksDueCount ? `Tasks, ${tasksDueCount} due today or overdue` : 'Tasks in all documents'}>
            <ListChecks size={14} />
            {tasksDueCount > 0 && <span className="header-badge" aria-hidden="true">{tasksDueCount > 99 ? '99+' : tasksDueCount}</span>}
          </button>
        )}
        {onOpenDailyNotes && (
          <button type="button" onClick={onOpenDailyNotes} className="file-tabs-command-button file-tabs-daily-notes"
            data-tip="Daily notes. Capture thoughts and tasks, then add them to a document later."
            aria-label="Open daily notes">
            <BookOpenText size={14} />
          </button>
        )}
        {onOpenTasks && <span className="file-tabs-task-divider" aria-hidden="true" />}

        <label className="file-tabs-command-search" data-tour="palette">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
            onFocus={onSearchFocus}
            placeholder="Search commands…"
            aria-label="Search files, headings, and commands"
          />
          <kbd>{shortcut('K')}</kbd>
        </label>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="file-tabs-command-button tooltip-end"
          data-tooltip={`Open command palette (${shortcut('K')})`}
          aria-label="Open command palette"
        >
          <Command size={14} />
        </button>
      </div>

      {menuFile && (
        <TabContextMenu
          menu={menu}
          file={menuFile}
          files={files}
          canReopen={canReopen}
          onClose={closeMenu}
          actions={{
            onRename: startRename, onDuplicate, onTogglePin, onSetColor, onRevealOutline,
            onCompare, onDownload, onClose, onCloseOthers, onCloseToRight, onReopenClosed, onDelete,
          }}
        />
      )}
    </nav>
  )
}
