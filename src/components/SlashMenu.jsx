import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays, Clock, Heading1, Heading2, Heading3, Image, Info, Lightbulb, Link, List, ListChecks, ListOrdered, Minus,
  Quote, Sigma, SquareCode, Superscript, Table, TriangleAlert, Workflow,
} from '../icons'

const ICONS = { CalendarDays, Clock, Heading1, Heading2, Heading3, Image, Info, Lightbulb, Link, List, ListChecks, ListOrdered, Minus, Quote, Sigma, SquareCode, Superscript, Table, TriangleAlert, Workflow }

export default function SlashMenu({ commands, highlight, rect, query, onPick, onHover }) {
  const ref = useRef(null)

  // Place below the caret (or above when there's no room), inside the viewport.
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu || !rect) return
    const box = menu.getBoundingClientRect()
    const below = rect.top + rect.height + 6 + box.height < window.innerHeight - 8
    menu.style.top = `${below ? rect.top + rect.height + 4 : Math.max(8, rect.top - box.height - 4)}px`
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))}px`
  }, [rect, commands.length])

  useEffect(() => {
    ref.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [highlight])

  return createPortal(
    <div ref={ref} className="slash-menu anim-drop-in" role="listbox" aria-label="Insert block" style={{ left: -9999, top: 0 }}
      onMouseDown={event => event.preventDefault()}>
      <div className="slash-menu-heading">{query ? `Insert “${query}”` : 'Insert'}</div>
      {commands.length === 0 && <div className="slash-menu-empty">No matching blocks</div>}
      {commands.map((command, index) => {
        const Icon = ICONS[command.icon] ?? Minus
        return (
          <div key={command.id} data-index={index} role="option" aria-selected={index === highlight}
            className={`slash-menu-item${index === highlight ? ' is-highlighted' : ''}`}
            onMouseEnter={() => onHover(index)} onClick={() => onPick(command)}>
            <span className="slash-menu-icon"><Icon size={14} /></span>
            <span>{command.label}</span>
          </div>
        )
      })}
      <div className="slash-menu-hint">↑↓ to choose · Enter to insert · Esc to dismiss</div>
    </div>,
    document.body,
  )
}
