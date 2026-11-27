import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from '../icons'

/**
 * The app's dropdown (instead of a native <select>): every option can show an icon (`icon`, a
 * React node). options: [{ value, label, icon?, hint? }]. Keyboard: ↑ / ↓, Home / End, Enter or
 * Space to pick, Esc to close, and typing a letter jumps to it. The list opens in a portal (so a
 * menu or dialog never clips it) and is marked `.picker-menu`, so outside-click handlers of a
 * surrounding menu can ignore it.
 */
export default function PickerDropdown({ value, options, onChange, label, disabled = false, className = '', width }) {
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState(null)
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selected = options[selectedIndex]

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuWidth = Math.max(rect.width, width ?? 0)
    const room = window.innerHeight - rect.bottom - 12
    const height = Math.min(300, options.length * 34 + 10)
    const above = room < Math.min(height, 200) && rect.top > room
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
      width: menuWidth,
      ...(above ? { bottom: window.innerHeight - rect.top + 5 } : { top: rect.bottom + 5 }),
      maxHeight: Math.max(120, above ? rect.top - 16 : room),
    })
  }
  const openList = () => { if (disabled) return; place(); setActive(selectedIndex); setOpen(true) }
  const close = (refocus = true) => { setOpen(false); if (refocus) triggerRef.current?.focus() }
  const pick = index => { const option = options[index]; if (option) onChange(option.value); close() }

  useLayoutEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])
  useEffect(() => { if (open) listRef.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return undefined
    const onDown = event => { if (!listRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close(false) }
    const onMove = () => place()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true) }
  })

  const onListKey = event => {
    const last = options.length - 1
    const move = to => { event.preventDefault(); event.stopPropagation(); setActive(Math.max(0, Math.min(last, to))) }
    if (event.key === 'ArrowDown') move(active + 1)
    else if (event.key === 'ArrowUp') move(active - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(last)
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); pick(active) }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    else if (event.key === 'Tab') close(false)
    else if (/^\S$/.test(event.key)) {
      // Type a letter to jump to the next option starting with it.
      const letter = event.key.toLowerCase()
      const order = [...options.keys()].map(i => (active + 1 + i) % options.length)
      const hit = order.find(i => options[i].label.toLowerCase().startsWith(letter))
      if (hit !== undefined) move(hit)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`picker-trigger ${className}`}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !open) { event.preventDefault(); event.stopPropagation(); openList() } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        disabled={disabled}
      >
        {selected?.icon && <span className="picker-icon" aria-hidden="true">{selected.icon}</span>}
        <span className="picker-value">{selected?.label}</span>
        <ChevronDown size={13} aria-hidden="true" className="picker-chevron" />
      </button>
      {open && position && createPortal(
        <div ref={listRef} className="picker-menu anim-pop-in no-print" role="listbox" aria-label={label} tabIndex={-1}
          aria-activedescendant={`picker-option-${active}`} onKeyDown={onListKey}
          style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight }}>
          {options.map((option, index) => (
            <div key={option.value} id={`picker-option-${index}`} data-index={index} role="option" aria-selected={option.value === value}
              className={`picker-option${index === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => pick(index)}>
              {option.icon && <span className="picker-icon" aria-hidden="true">{option.icon}</span>}
              <span className="picker-label">{option.label}{option.hint && <span className="picker-hint">{option.hint}</span>}</span>
              {option.value === value && <Check size={13} aria-hidden="true" className="picker-check" />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
