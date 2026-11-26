import { useRef } from 'react'
import { useDialogKeys } from '../useDialogKeys'
import { Keyboard, X } from '../icons'
import { shortcut } from '../platform'

const GROUPS = [
  {
    title: 'General',
    items: [
      [shortcut('K'), 'Command palette'],
      [shortcut('S'), 'Save all files (browser + files opened from disk)'],
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
      [shortcut('V'), 'Paste: images are embedded, formatted text becomes Markdown'],
      [shortcut('V', { shift: true }), 'Paste as plain text'],
      [shortcut('Z'), 'Undo (right after a paste: keep the plain text)'],
      ['[[', 'Link to another document (wiki link)'],
      ['/', 'Insert a block'],
    ],
  },
  {
    title: 'Contents (outline)',
    items: [
      ['Alt+↑  Alt+↓', 'Move the focused heading’s section up / down'],
      ['Alt+←  Alt+→', 'Promote / demote the heading and its sub-headings'],
      ['Drag a heading', 'Move its section somewhere else'],
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
    title: 'Presentation',
    items: [
      ['← →', 'Previous / next slide'],
      ['↓  Space', 'Scroll a long slide, then next slide'],
      ['+  −  0', 'Larger / smaller / reset text size'],
      ['S', 'Presenter view (notes, next slide, timer)'],
      ['F', 'Fullscreen'],
      ['T', 'Switch theme'],
      ['O', 'Show / hide the slide contents'],
      ['L', 'Laser pointer'],
      ['D', 'Pen (draw on the slide)'],
      ['C', 'Clear drawings on this slide'],
      ['B  W', 'Black / white screen'],
      ['Esc', 'Put the pen or laser away, then exit'],
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
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })
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
