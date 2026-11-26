import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Columns, Plus, Rows, SortAsc, SortDesc, Table, Trash2, X,
} from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import {
  deleteColumn, deleteRow, insertColumn, insertRow, moveColumn, moveRow, pasteCells, setAlign, sortRows,
} from '../tableModel'

function Tool({ label, icon, onClick, disabled }) {
  const Glyph = icon
  return <button type="button" className="table-tool" onClick={onClick} disabled={disabled} aria-label={label} data-tooltip={label}><Glyph size={14} /></button>
}

/**
 * A small spreadsheet for one Markdown table. `table` = { align, rows } (rows[0] is the header).
 * Tab / Shift+Tab move between cells (Tab on the last cell adds a row), Enter goes down (adding a
 * row at the end), ↑ / ↓ change rows. Pasting spreadsheet cells fills the grid from the cell.
 */
export default function TableEditorDialog({ initial, mode = 'edit', onSave, onCancel }) {
  const [table, setTable] = useState(initial)
  const [cell, setCell] = useState({ row: mode === 'insert' ? 0 : 1, column: 0 })
  const [menu, setMenu] = useState(null) // { x, y }
  const gridRef = useRef(null)
  const focusTarget = useRef(cell)
  useDialogKeys(() => (menu ? setMenu(null) : onCancel()), { topmost: true, focus: () => { const input = gridRef.current?.querySelector(`[data-cell="${cell.row}-${cell.column}"]`); input?.focus(); input?.select() } })

  const columns = table.align.length
  const update = useCallback((next, focus) => {
    setTable(next)
    if (focus) { focusTarget.current = focus; setCell(focus) }
  }, [])
  // Move keyboard focus to the current cell after structural changes.
  // Keyboard moves select the cell's text (typing replaces it, like a spreadsheet).
  const focusInput = (row, column) => {
    const input = gridRef.current?.querySelector(`[data-cell="${row}-${column}"]`)
    input?.focus()
    input?.select()
  }
  useEffect(() => {
    const { row, column } = focusTarget.current
    if (document.activeElement?.getAttribute('data-cell') !== `${row}-${column}`) focusInput(row, column)
  }, [table])
  const focusCell = (row, column) => {
    focusTarget.current = { row, column }
    setCell({ row, column })
    focusInput(row, column)
  }

  const setValue = (row, column, value) => setTable(current => ({ ...current, rows: current.rows.map((line, r) => (r === row ? line.map((v, c) => (c === column ? value : v)) : line)) }))

  const actions = {
    rowAbove: () => update(insertRow(table, Math.max(1, cell.row)), { row: Math.max(1, cell.row), column: cell.column }),
    rowBelow: () => update(insertRow(table, cell.row + 1), { row: cell.row + 1, column: cell.column }),
    colLeft: () => update(insertColumn(table, cell.column), { row: cell.row, column: cell.column }),
    colRight: () => update(insertColumn(table, cell.column + 1), { row: cell.row, column: cell.column + 1 }),
    deleteRow: () => update(deleteRow(table, cell.row), { row: Math.min(Math.max(1, cell.row), table.rows.length - 2 || 1), column: cell.column }),
    deleteColumn: () => update(deleteColumn(table, cell.column), { row: cell.row, column: Math.max(0, Math.min(cell.column, columns - 2)) }),
    rowUp: () => update(moveRow(table, cell.row, -1), { row: Math.max(1, cell.row - 1), column: cell.column }),
    rowDown: () => update(moveRow(table, cell.row, 1), { row: Math.min(table.rows.length - 1, cell.row + 1), column: cell.column }),
    colLeftMove: () => update(moveColumn(table, cell.column, -1), { row: cell.row, column: Math.max(0, cell.column - 1) }),
    colRightMove: () => update(moveColumn(table, cell.column, 1), { row: cell.row, column: Math.min(columns - 1, cell.column + 1) }),
    align: value => update(setAlign(table, cell.column, value)),
    sort: direction => update(sortRows(table, cell.column, direction)),
  }

  const onKeyDown = (event, row, column) => {
    const lastRow = table.rows.length - 1
    if (event.key === 'Tab') {
      event.preventDefault()
      const index = row * columns + column + (event.shiftKey ? -1 : 1)
      if (index < 0) return
      if (index >= table.rows.length * columns) { update(insertRow(table, table.rows.length), { row: lastRow + 1, column: 0 }); return }
      focusCell(Math.floor(index / columns), index % columns)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (row === lastRow) update(insertRow(table, table.rows.length), { row: lastRow + 1, column })
      else focusCell(row + 1, column)
    } else if (event.key === 'ArrowDown' && row < lastRow) { event.preventDefault(); focusCell(row + 1, column) }
    else if (event.key === 'ArrowUp' && row > 0) { event.preventDefault(); focusCell(row - 1, column) }
  }

  // Pasting several cells (spreadsheet / CSV / an HTML table) fills the grid from this cell.
  const onPaste = async (event, row, column) => {
    const html = event.clipboardData?.getData('text/html') || ''
    const plain = event.clipboardData?.getData('text/plain') || ''
    let cells = null
    if (html && /<table/i.test(html)) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const rows = [...(doc.querySelector('table')?.rows ?? [])].map(tr => [...tr.cells].map(td => td.textContent.trim()))
      if (rows.length) cells = rows
    }
    if (!cells && /[\t\n]/.test(plain.trim())) {
      const { parseDelimited } = await import('../htmlToMarkdown')
      cells = parseDelimited(plain) ?? (plain.includes('\t') ? [plain.replace(/\n+$/, '').split('\t')] : null)
    }
    if (!cells) return
    event.preventDefault()
    update(pasteCells(table, row, column, cells), { row, column })
  }

  const menuItems = [
    ['Insert row above', actions.rowAbove, cell.row === 0],
    ['Insert row below', actions.rowBelow],
    ['Insert column left', actions.colLeft],
    ['Insert column right', actions.colRight],
    ['Move row up', actions.rowUp, cell.row <= 1],
    ['Move row down', actions.rowDown, cell.row === 0 || cell.row >= table.rows.length - 1],
    ['Sort A → Z by this column', () => actions.sort('asc')],
    ['Sort Z → A by this column', () => actions.sort('desc')],
    ['Delete row', actions.deleteRow, cell.row === 0],
    ['Delete column', actions.deleteColumn, columns <= 1],
  ]

  return (
    <div className="pdf-dialog-backdrop is-topmost anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="pdf-dialog table-editor anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="table-editor-title" onClick={() => setMenu(null)}>
        <div className="pdf-dialog-header">
          <div>
            <h2 id="table-editor-title" className="flex items-center gap-2"><Table size={16} style={{ color: 'var(--accent)' }} />{mode === 'insert' ? 'Insert table' : 'Edit table'}</h2>
            <p>Tab moves between cells, Enter adds a row at the end. Paste cells from a spreadsheet into any cell. Right-click a cell for more.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="Cancel" data-tooltip="Cancel (Esc)"><X size={15} /></button>
        </div>
        <div className="table-toolbar" role="toolbar" aria-label="Table tools">
          <Tool label="Insert row below" icon={Rows} onClick={actions.rowBelow} />
          <Tool label="Insert column right" icon={Columns} onClick={actions.colRight} />
          <span className="table-tool-divider" />
          <Tool label="Move row up" icon={ArrowUp} onClick={actions.rowUp} disabled={cell.row <= 1} />
          <Tool label="Move row down" icon={ArrowDown} onClick={actions.rowDown} disabled={cell.row === 0 || cell.row >= table.rows.length - 1} />
          <Tool label="Move column left" icon={ArrowLeft} onClick={actions.colLeftMove} disabled={cell.column === 0} />
          <Tool label="Move column right" icon={ArrowRight} onClick={actions.colRightMove} disabled={cell.column >= columns - 1} />
          <span className="table-tool-divider" />
          <Tool label="Align column left" icon={AlignLeft} onClick={() => actions.align(table.align[cell.column] === 'left' ? 'none' : 'left')} />
          <Tool label="Center column" icon={AlignCenter} onClick={() => actions.align(table.align[cell.column] === 'center' ? 'none' : 'center')} />
          <Tool label="Align column right" icon={AlignRight} onClick={() => actions.align(table.align[cell.column] === 'right' ? 'none' : 'right')} />
          <span className="table-tool-divider" />
          <Tool label="Sort A → Z by this column" icon={SortAsc} onClick={() => actions.sort('asc')} />
          <Tool label="Sort Z → A by this column" icon={SortDesc} onClick={() => actions.sort('desc')} />
          <span className="table-tool-divider" />
          <Tool label="Delete row" icon={Trash2} onClick={actions.deleteRow} disabled={cell.row === 0} />
          <Tool label="Delete column" icon={X} onClick={actions.deleteColumn} disabled={columns <= 1} />
        </div>
        <div className="table-grid-scroll">
          <table className="table-grid" ref={gridRef}>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className={r === 0 ? 'is-header' : ''}>
                  {row.map((value, c) => (
                    <td key={c} className={cell.row === r && cell.column === c ? 'is-current' : cell.column === c || cell.row === r ? 'is-line' : ''}>
                      <input
                        data-cell={`${r}-${c}`}
                        value={value}
                        aria-label={r === 0 ? `Header, column ${c + 1}` : `Row ${r}, column ${c + 1}`}
                        style={{ textAlign: table.align[c] === 'none' ? 'left' : table.align[c] }}
                        onFocus={() => { focusTarget.current = { row: r, column: c }; setCell({ row: r, column: c }) }}
                        onChange={event => setValue(r, c, event.target.value)}
                        onKeyDown={event => onKeyDown(event, r, c)}
                        onPaste={event => onPaste(event, r, c)}
                        onContextMenu={event => { event.preventDefault(); focusCell(r, c); setMenu({ x: event.clientX, y: event.clientY }) }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="table-add-row" onClick={() => update(insertRow(table, table.rows.length), { row: table.rows.length, column: 0 })}><Plus size={12} /> Add row</button>
        </div>
        {menu && (
          <div className="table-menu" role="menu" aria-label="Cell options" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
            {menuItems.map(([label, run, disabled]) => (
              <button key={label} type="button" role="menuitem" disabled={disabled} onClick={() => { setMenu(null); run() }}>{label}</button>
            ))}
          </div>
        )}
        <div className="pdf-dialog-footer">
          <span className="table-size">{table.rows.length - 1} row{table.rows.length === 2 ? '' : 's'} × {columns} column{columns === 1 ? '' : 's'}</span>
          <button type="button" className="reader-chip" onClick={onCancel}>Cancel</button>
          <button type="button" className="pdf-dialog-primary" onClick={() => onSave(table)}>{mode === 'insert' ? 'Insert table' : 'Update table'}</button>
        </div>
      </div>
    </div>
  )
}
