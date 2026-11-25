import { useEffect, useRef } from 'react'
import { Keyboard, X } from 'lucide-react'
import { shortcut } from '../platform'

const GROUPS = [
  {
    title: 'General',
    items: [
      [shortcut('K'), 'Command palette'],
      [shortcut('F', { shift: true }), 'Search in all files'],
      ['?', 'Keyboard shortcuts'],
      [`${shortcut('T', { shift: true, alt: true, mod: false })}  or  ${shortcut('T', { shift: true })}`, 'Reopen closed tab'],
      ['Esc', 'Close dialogs and popovers'],
    ],
  },
  {
    title: 'Reading',
    items: [
      [shortcut('F'), 'Find in document'],
      [shortcut('←', { alt: true, mod: false }), 'Previous section (section focus)'],
      [shortcut('→', { alt: true, mod: false }), 'Next section (section focus)'],
    ],
  },
  {
    title: 'Editor',
    items: [
      ['Enter', 'Continue list / quote, end it on an empty item'],
      ['( [ { ` "', 'Auto-close pair, wrap the selection'],
      [shortcut('V'), 'Paste images to embed them'],
      [shortcut('Z'), 'Undo'],
    ],
  },
  {
    title: 'Tabs',
    items: [
      ['Middle-click', 'Close tab'],
      ['F2', 'Rename focused tab'],
      ['Delete', 'Close focused tab'],
      [shortcut('F10', { shift: true, mod: false }), 'Tab menu (pin, label, close others…)'],
    ],
  },
  {
    title: 'Image viewer',
    items: [
      ['← →', 'Previous / next image'],
      ['+  −', 'Zoom in / out'],
      ['0', 'Reset zoom'],
    ],
  },
]

export default function ShortcutsDialog({ onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="shortcuts-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="pdf-dialog-header">
          <div className="flex items-center gap-2">
            <Keyboard size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close keyboard shortcuts"><X size={15} /></button>
        </div>
        <div className="shortcuts-grid">
          {GROUPS.map(group => (
            <section key={group.title} aria-label={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.items.map(([keys, label]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd><kbd>{keys}</kbd></dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
