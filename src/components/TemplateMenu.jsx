import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FilePlus, LayoutTemplate, Settings2 } from 'lucide-react'

/**
 * Template picker rendered in a portal (so toolbars with overflow can't clip
 * it), positioned under `anchorRef` and kept inside the viewport.
 */
export default function TemplateMenu({ anchorRef, templates, onPick, onBlank, onManage, onClose, align = 'right', label = 'Templates' }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const menu = ref.current
    const anchor = anchorRef.current?.getBoundingClientRect()
    if (!menu || !anchor) return
    const box = menu.getBoundingClientRect()
    const left = align === 'left' ? anchor.left : anchor.right - box.width
    const below = anchor.bottom + 6 + box.height <= window.innerHeight - 8
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`
    menu.style.top = `${below ? anchor.bottom + 6 : Math.max(8, anchor.top - box.height - 6)}px`
    menu.querySelector('[role="menuitem"]')?.focus()
  }, [anchorRef, align])

  useEffect(() => {
    const onDown = event => {
      if (ref.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return
      onClose()
    }
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); anchorRef.current?.focus() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = Array.from(ref.current?.querySelectorAll('[role="menuitem"]') || [])
        if (!items.length) return
        event.preventDefault()
        const index = items.indexOf(document.activeElement)
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [anchorRef, onClose])

  return createPortal(
    <div ref={ref} className="template-menu anim-drop-in" role="menu" aria-label={label} style={{ left: -9999, top: 0 }}>
      {onBlank && (
        <>
          <button type="button" role="menuitem" className="template-menu-item" onClick={() => { onClose(); onBlank() }}>
            <span className="template-menu-icon is-blank"><FilePlus size={14} /></span>
            <span className="template-menu-text"><strong>Blank file</strong><span>Start from an empty document</span></span>
          </button>
          <div className="template-menu-heading">From a template</div>
        </>
      )}
      {templates.map(template => (
        <button key={template.id} type="button" role="menuitem" className="template-menu-item" onClick={() => { onClose(); onPick(template) }}>
          <span className="template-menu-icon"><LayoutTemplate size={14} /></span>
          <span className="template-menu-text">
            <strong>{template.name}</strong>
            {template.description && <span>{template.description}</span>}
          </span>
        </button>
      ))}
      {onManage && (
        <>
          <div className="template-menu-separator" role="separator" />
          <button type="button" role="menuitem" className="template-menu-item is-compact" onClick={() => { onClose(); onManage() }}>
            <span className="template-menu-icon is-plain"><Settings2 size={13} /></span>
            <span className="template-menu-text"><strong>Manage templates…</strong></span>
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
