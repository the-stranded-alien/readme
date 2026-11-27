import { createPortal } from 'react-dom'
import { Bold, Code, Italic, Link, Strikethrough } from '../icons'

const FORMATS = [
  ['bold', 'Bold', <Bold size={14} />],
  ['italic', 'Italic', <Italic size={14} />],
  ['strike', 'Strikethrough', <Strikethrough size={14} />],
  ['code', 'Inline code', <Code size={14} />],
  ['link', 'Link', <Link size={14} />],
]
const LEVELS = [[0, 'Text'], [1, 'H1'], [2, 'H2'], [3, 'H3']]

/** The formatting bar (over a selection) and the "/" block menu for Edit in preview. */
export default function PreviewEditTools({ editing }) {
  const { active, bubble, slash } = editing
  const keep = event => event.preventDefault() // keep the selection in the block
  return createPortal(
    <>
      {bubble && active?.mode === 'rich' && (
        <div className="pe-toolbar no-print" role="toolbar" aria-label="Formatting" style={{ left: bubble.left, top: bubble.top }} onMouseDown={keep}>
          {FORMATS.map(([id, label, icon]) => (
            <button key={id} type="button" aria-label={label} data-tip={label} onClick={() => editing.format(id)}>{icon}</button>
          ))}
          {(active.kind === 'p' || active.kind === 'h') && (
            <>
              <span className="pe-toolbar-sep" aria-hidden="true" />
              {LEVELS.map(([level, label]) => (
                <button key={level} type="button" className="pe-level" aria-label={level ? `Heading ${level}` : 'Normal text'} onClick={() => editing.setHeading(level)}>{label}</button>
              ))}
            </>
          )}
        </div>
      )}
      {slash && (
        <div className="pe-slash no-print" role="listbox" aria-label="Insert a block" style={{ left: slash.rect.left, top: slash.rect.top }} onMouseDown={keep}>
          {slash.items.map((item, index) => (
            <button key={item.id} type="button" role="option" aria-selected={index === slash.index} className={index === slash.index ? 'is-active' : ''}
              onMouseEnter={() => editing.setSlashIndex(index)} onClick={() => editing.pickSlash(item)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>,
    document.body,
  )
}
