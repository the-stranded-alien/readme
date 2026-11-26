import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, FileText, Hash, ArrowRight, LayoutTemplate, Sparkles, X } from '../icons'
import EmptyState from './EmptyState'

export default function CommandPalette({
  open,
  onClose,
  initialQuery = '',
  onQueryChange,
  files,
  closedFiles = [],
  onReopenFile,
  activeFileId,
  headings,
  templates,
  actions,
  onSelectFile,
  onNavigateHeading,
  onCreateFromTemplate,
}) {
  const [query, setQuery] = useState(initialQuery)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = []

    for (const file of files) {
      list.push({
        id: `file-${file.id}`,
        group: 'Open Files',
        label: file.name,
        hint: file.id === activeFileId ? 'Active' : 'Switch tab',
        icon: FileText,
        run: () => onSelectFile(file.id),
      })
    }

    // Closed files (still in the Files panel) only show up when searching.
    if (q && onReopenFile) {
      for (const file of closedFiles) {
        list.push({ id: `closed-${file.id}`, group: 'Closed Files', label: file.name, hint: 'Reopen', icon: FileText, run: () => onReopenFile(file.id) })
      }
    }

    for (let i = 0; i < headings.length; i += 1) {
      const h = headings[i]
      list.push({
        id: `heading-${h.id}-${i}`,
        group: 'Headings',
        label: h.text,
        hint: `H${h.level}`,
        icon: Hash,
        run: () => onNavigateHeading(h.id),
      })
    }

    for (const action of actions) {
      list.push({
        id: `action-${action.id}`,
        group: 'Actions',
        label: action.label,
        hint: action.hint || '',
        icon: action.icon || Sparkles,
        run: action.run,
      })
    }

    for (const tpl of templates) {
      list.push({
        id: `tpl-${tpl.id}`,
        group: 'Templates',
        label: `New from template: ${tpl.name}`,
        hint: tpl.fileName,
        icon: LayoutTemplate,
        run: () => onCreateFromTemplate(tpl),
      })
    }

    if (!q) return list
    return list.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q) ||
      item.hint.toLowerCase().includes(q)
    )
  }, [query, files, closedFiles, onReopenFile, activeFileId, headings, actions, templates, onSelectFile, onNavigateHeading, onCreateFromTemplate])

  if (!open) return null

  const execute = (item) => {
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 no-print"
      style={{ background: 'rgba(12, 13, 24, 0.52)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden anim-drop-in"
        style={{
          background: 'var(--bg-preview)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); onQueryChange?.(e.target.value); setActiveIdx(0) }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIdx(i => (items.length ? (i + 1) % items.length : 0))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIdx(i => (items.length ? (i - 1 + items.length) % items.length : 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                execute(items[activeIdx])
              }
            }}
            placeholder="Jump to file, heading, template, or command…"
            role="combobox"
            aria-label="Search files, headings and commands"
            aria-autocomplete="list"
            aria-expanded={items.length > 0}
            aria-controls="command-palette-results"
            aria-activedescendant={items[activeIdx] ? `cmd-option-${activeIdx}` : undefined}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-1)' }}
          />
          <button onClick={onClose} className="btn-icon !p-1" aria-label="Close command palette">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2" id="command-palette-results" role="listbox" aria-label="Results">
          {items.length === 0 ? (
            <EmptyState icon={Search} title="No matches" text="No files, headings or commands match. Try fewer words." />
          ) : (
            items.map((item, idx) => {
              const ItemIcon = item.icon
              const isSelected = idx === activeIdx
              return (
                <div
                  key={item.id}
                  id={`cmd-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  ref={isSelected ? el => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => execute(item)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? 'var(--accent-soft)' : 'transparent',
                    color: isSelected ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <ItemIcon size={13} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-4)', flexShrink: 0 }} />
                    <span className="text-xs font-medium truncate">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0 text-[10px]" style={{ color: isSelected ? 'var(--text-2)' : 'var(--text-4)' }}>
                    <span>{item.hint || item.group}</span>
                    {isSelected && <ArrowRight size={11} style={{ color: 'var(--accent)' }} />}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
