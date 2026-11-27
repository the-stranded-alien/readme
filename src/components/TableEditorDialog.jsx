import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bold, ChevronDown, Code, CopyPlus, Eraser,
  Italic, Link, Minus, MoreHorizontal, Plus, Redo2, SortAsc, SortDesc, Table, Transpose, Trash2, Undo2, X,
} from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import {
  clearBody, clearColumn, clearRow, deleteColumn, deleteRow, duplicateColumn, duplicateRow, insertColumn, insertRow,
  moveColumn, moveRow, pasteCells, resizeTable, setAlign, sortRows, transpose, wrapCellText,
} from '../tableModel'

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
const letter = index => (index < 26 ? String.fromCharCode(65 + index) : `${String.fromCharCode(64 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`)
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight, none: AlignLeft }

function Tool({ label, icon, onClick, disabled, text, danger }) {
  const Glyph = icon
  return (
    <button type="button" className={`table-tool${text ? ' has-text' : ''}${danger ? ' is-danger' : ''}`} onClick={onClick} disabled={disabled} aria-label={label} data-tip={label}>
      <Glyph size={14} />{text && <span>{text}</span>}
    </button>
  )
}

/**
 * A small spreadsheet for one Markdown table. `table` = { align, rows } (rows[0] is the header).
 * Tab / Shift+Tab move between cells (Tab on the last cell adds a row), Enter goes down (adding a
 * row at the end), arrow keys move between cells at the edge of the text. Column letters and row
 * numbers open menus; right-click a cell for everything. Changes can be undone (⌘/Ctrl+Z).
 */
export default function TableEditorDialog({ initial, mode = 'edit', onSave, onCancel, onDelete }) {
  const [table, setTableState] = useState(initial)
  const [cell, setCell] = useState({ row: mode === 'insert' ? 0 : 1, column: 0 })
  const [menu, setMenu] = useState(null) // { x, y, kind: 'cell' | 'row' | 'column' | 'more' }
  const history = useRef({ past: [], future: [], editing: null })
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const syncHistory = () => { setCanUndo(history.current.past.length > 0); setCanRedo(history.current.future.length > 0) }
  const gridRef = useRef(null)
  const focusTarget = useRef(cell)
  useDialogKeys(() => (menu ? setMenu(null) : onCancel()), { topmost: true, focus: () => { const input = gridRef.current?.querySelector(`[data-cell="${cell.row}-${cell.column}"]`); input?.focus(); input?.select() } })

  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])
  const columns = table.align.length
  const bodyRows = table.rows.length - 1
  /** Every change goes through here, so it can be undone. */
  const commit = useCallback((next, focus, { typing = null } = {}) => {
    setTableState(current => {
      if (next === current) return current
      const h = history.current
      // Typing in one cell is one undo step; anything else is its own step.
      if (!typing || h.editing !== typing) h.past.push(current)
      if (h.past.length > 100) h.past.shift()
      h.future = []
      h.editing = typing
      return next
    })
    setCanUndo(true); setCanRedo(false)
    if (focus) { focusTarget.current = focus; setCell(focus) }
  }, [])
  const undo = () => {
    const h = history.current
    if (!h.past.length) return
    h.future.push(table); h.editing = null
    setTableState(h.past.pop())
    syncHistory()
  }
  const redo = () => {
    const h = history.current
    if (!h.future.length) return
    h.past.push(table); h.editing = null
    setTableState(h.future.pop())
    syncHistory()
  }

  const focusInput = (row, column, select = true) => {
    const input = gridRef.current?.querySelector(`[data-cell="${row}-${column}"]`)
    input?.focus()
    if (select) input?.select()
  }
  useEffect(() => {
    const { row, column } = focusTarget.current
    if (document.activeElement?.getAttribute('data-cell') !== `${row}-${column}`) focusInput(Math.min(row, table.rows.length - 1), Math.min(column, table.align.length - 1))
  }, [table])
  const focusCell = (row, column) => {
    focusTarget.current = { row, column }
    setCell({ row, column })
    focusInput(row, column)
  }

  const setValue = (row, column, value) => commit({ ...table, rows: table.rows.map((line, r) => (r === row ? line.map((v, c) => (c === column ? value : v)) : line)) }, null, { typing: `${row}-${column}` })

  const r = cell.row, c = cell.column
  const actions = {
    rowAbove: () => commit(insertRow(table, Math.max(1, r)), { row: Math.max(1, r), column: c }),
    rowBelow: () => commit(insertRow(table, r + 1), { row: r + 1, column: c }),
    rowDuplicate: () => commit(duplicateRow(table, r), { row: r + 1, column: c }),
    rowUp: () => commit(moveRow(table, r, -1), { row: Math.max(1, r - 1), column: c }),
    rowDown: () => commit(moveRow(table, r, 1), { row: Math.min(table.rows.length - 1, r + 1), column: c }),
    rowClear: () => commit(clearRow(table, r)),
    rowDelete: () => commit(deleteRow(table, r), { row: Math.min(Math.max(1, r), table.rows.length - 2 || 1), column: c }),
    colLeft: () => commit(insertColumn(table, c), { row: r, column: c }),
    colRight: () => commit(insertColumn(table, c + 1), { row: r, column: c + 1 }),
    colDuplicate: () => commit(duplicateColumn(table, c), { row: r, column: c + 1 }),
    colMoveLeft: () => commit(moveColumn(table, c, -1), { row: r, column: Math.max(0, c - 1) }),
    colMoveRight: () => commit(moveColumn(table, c, 1), { row: r, column: Math.min(columns - 1, c + 1) }),
    colClear: () => commit(clearColumn(table, c)),
    colDelete: () => commit(deleteColumn(table, c), { row: r, column: Math.max(0, Math.min(c, columns - 2)) }),
    align: value => commit(setAlign(table, c, table.align[c] === value ? 'none' : value)),
    sort: direction => commit(sortRows(table, c, direction)),
    transpose: () => commit(transpose(table), { row: 0, column: 0 }),
    clearAll: () => commit(clearBody(table), { row: 1, column: 0 }),
    resize: (rows, cols) => commit(resizeTable(table, rows, cols), { row: Math.min(r, rows), column: Math.min(c, cols - 1) }),
  }
  // Bold / italic / code / link around the selected text of the current cell.
  const format = kind => {
    const input = gridRef.current?.querySelector(`[data-cell="${r}-${c}"]`)
    if (!input) return
    const wrapped = wrapCellText(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, kind)
    // A new link selects its address, ready to type over.
    const at = kind === 'link' ? wrapped.text.indexOf('https://', wrapped.end) : -1
    const [start, end] = at >= 0 ? [at, at + 'https://'.length] : [wrapped.start, wrapped.end]
    commit({ ...table, rows: table.rows.map((line, row) => (row === r ? line.map((v, col) => (col === c ? wrapped.text : v)) : line)) })
    requestAnimationFrame(() => { const el = gridRef.current?.querySelector(`[data-cell="${r}-${c}"]`); el?.focus(); el?.setSelectionRange(start, end) })
  }

  const onKeyDown = (event, row, column) => {
    const lastRow = table.rows.length - 1
    const meta = event.metaKey || event.ctrlKey
    if (meta && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
    if (meta && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
    if (meta && event.key === 'Enter') { event.preventDefault(); onSave(table); return }
    if (meta && event.key.toLowerCase() === 'b') { event.preventDefault(); format('bold'); return }
    if (meta && event.key.toLowerCase() === 'i') { event.preventDefault(); format('italic'); return }
    const input = event.currentTarget
    if (event.key === 'Tab') {
      event.preventDefault()
      const index = row * columns + column + (event.shiftKey ? -1 : 1)
      if (index < 0) return
      if (index >= table.rows.length * columns) { commit(insertRow(table, table.rows.length), { row: lastRow + 1, column: 0 }); return }
      focusCell(Math.floor(index / columns), index % columns)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (row === lastRow) commit(insertRow(table, table.rows.length), { row: lastRow + 1, column })
      else focusCell(row + 1, column)
    } else if (event.key === 'ArrowDown' && row < lastRow) { event.preventDefault(); focusCell(row + 1, column) }
    else if (event.key === 'ArrowUp' && row > 0) { event.preventDefault(); focusCell(row - 1, column) }
    else if (event.key === 'ArrowLeft' && column > 0 && input.selectionStart === 0 && input.selectionEnd === 0) { event.preventDefault(); focusCell(row, column - 1) }
    else if (event.key === 'ArrowRight' && column < columns - 1 && input.selectionStart === input.value.length) { event.preventDefault(); focusCell(row, column + 1) }
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
    commit(pasteCells(table, row, column, cells), { row, column })
  }

  const rowMenu = [
    ['Insert row above', actions.rowAbove, r === 0],
    ['Insert row below', actions.rowBelow],
    ['Duplicate row', actions.rowDuplicate, r === 0],
    ['Move row up', actions.rowUp, r <= 1],
    ['Move row down', actions.rowDown, r === 0 || r >= table.rows.length - 1],
    ['Clear row', actions.rowClear],
    ['Delete row', actions.rowDelete, r === 0, true],
  ]
  const columnMenu = [
    ['Insert column left', actions.colLeft],
    ['Insert column right', actions.colRight],
    ['Duplicate column', actions.colDuplicate],
    ['Move column left', actions.colMoveLeft, c === 0],
    ['Move column right', actions.colMoveRight, c >= columns - 1],
    ['Align left', () => actions.align('left')],
    ['Align center', () => actions.align('center')],
    ['Align right', () => actions.align('right')],
    ['Sort A → Z by this column', () => actions.sort('asc')],
    ['Sort Z → A by this column', () => actions.sort('desc')],
    ['Clear column', actions.colClear],
    ['Delete column', actions.colDelete, columns <= 1, true],
  ]
  const moreMenu = [
    ['Swap rows and columns', actions.transpose],
    ['Clear all cells', actions.clearAll],
    ...(onDelete ? [['Delete table', onDelete, false, true]] : []),
  ]
  const menuItems = menu?.kind === 'row' ? rowMenu : menu?.kind === 'column' ? columnMenu : menu?.kind === 'more' ? moreMenu
    : [...rowMenu.slice(0, 3), null, ...columnMenu.slice(0, 3), null, ...columnMenu.slice(8, 10), null, rowMenu[6], columnMenu[11]]
  const openMenu = (event, kind, at) => {
    event.preventDefault(); event.stopPropagation()
    if (at) focusCell(at.row, at.column)
    const box = event.currentTarget.getBoundingClientRect?.()
    const x = event.clientX || box?.left || 0, y = event.clientY || box?.bottom || 0
    setMenu({ kind, x: Math.min(x, window.innerWidth - 240), y: Math.min(y, window.innerHeight - 380) })
  }

  return (
    <div className="pdf-dialog-backdrop is-topmost anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="pdf-dialog table-editor anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="table-editor-title" onClick={() => setMenu(null)}>
        <div className="pdf-dialog-header">
          <div>
            <h2 id="table-editor-title" className="flex items-center gap-2"><Table size={16} style={{ color: 'var(--accent)' }} />{mode === 'insert' ? 'Insert table' : 'Edit table'}</h2>
            <p>Tab moves between cells and Enter adds a row at the end. Click a column letter or row number for its options, or right-click any cell. Paste cells from a spreadsheet into any cell.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="Cancel" data-tip="Cancel (Esc)"><X size={15} /></button>
        </div>
        <div className="table-toolbar" role="toolbar" aria-label="Table tools">
          <div className="table-tool-group" role="group" aria-label="Undo">
            <Tool label={`Undo (${mod}Z)`} icon={Undo2} onClick={undo} disabled={!canUndo} />
            <Tool label={`Redo (${mod}⇧Z)`} icon={Redo2} onClick={redo} disabled={!canRedo} />
          </div>
          <div className="table-tool-group" role="group" aria-label="Row">
            <span className="table-tool-label">Row</span>
            <Tool label="Insert row above" icon={ArrowUp} text="Above" onClick={actions.rowAbove} disabled={r === 0} />
            <Tool label="Insert row below" icon={ArrowDown} text="Below" onClick={actions.rowBelow} />
            <Tool label="Duplicate row" icon={CopyPlus} onClick={actions.rowDuplicate} disabled={r === 0} />
            <Tool label="Delete row" icon={Trash2} text="Delete" danger onClick={actions.rowDelete} disabled={r === 0} />
          </div>
          <div className="table-tool-group" role="group" aria-label="Column">
            <span className="table-tool-label">Column</span>
            <Tool label="Insert column left" icon={ArrowLeft} text="Left" onClick={actions.colLeft} />
            <Tool label="Insert column right" icon={ArrowRight} text="Right" onClick={actions.colRight} />
            <Tool label="Duplicate column" icon={CopyPlus} onClick={actions.colDuplicate} />
            <Tool label="Delete column" icon={Trash2} text="Delete" danger onClick={actions.colDelete} disabled={columns <= 1} />
          </div>
          <div className="table-tool-group" role="group" aria-label="Align and sort">
            <Tool label="Align column left" icon={AlignLeft} onClick={() => actions.align('left')} />
            <Tool label="Center column" icon={AlignCenter} onClick={() => actions.align('center')} />
            <Tool label="Align column right" icon={AlignRight} onClick={() => actions.align('right')} />
            <Tool label="Sort A → Z by this column" icon={SortAsc} onClick={() => actions.sort('asc')} />
            <Tool label="Sort Z → A by this column" icon={SortDesc} onClick={() => actions.sort('desc')} />
          </div>
          <div className="table-tool-group" role="group" aria-label="Cell text">
            <Tool label={`Bold (${mod}B)`} icon={Bold} onClick={() => format('bold')} />
            <Tool label={`Italic (${mod}I)`} icon={Italic} onClick={() => format('italic')} />
            <Tool label="Code" icon={Code} onClick={() => format('code')} />
            <Tool label="Link" icon={Link} onClick={() => format('link')} />
          </div>
          <button type="button" className="table-tool has-text table-more" aria-haspopup="menu" aria-expanded={menu?.kind === 'more'} data-tip="Swap rows and columns, clear, delete table"
            onClick={event => openMenu(event, 'more')}><MoreHorizontal size={14} /><span>More</span></button>
        </div>
        <div className="table-grid-scroll">
          <table className="table-grid" ref={gridRef}>
            <thead>
              <tr>
                <th className="table-corner" aria-hidden="true" />
                {table.align.map((align, col) => {
                  const AlignGlyph = ALIGN_ICON[align] ?? AlignLeft
                  return (
                    <th key={col} className={col === c ? 'is-current' : ''}>
                      <button type="button" className="table-col-handle" aria-haspopup="menu" aria-label={`Column ${letter(col)} options`}
                        onClick={event => openMenu(event, 'column', { row: r, column: col })}>
                        <span>{letter(col)}</span>
                        {align !== 'none' && <AlignGlyph size={11} aria-hidden="true" />}
                        <ChevronDown size={11} aria-hidden="true" />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? 'is-header' : ''}>
                  <th scope="row" className={ri === r ? 'is-current' : ''}>
                    <button type="button" className="table-row-handle" aria-haspopup="menu" aria-label={ri === 0 ? 'Header row options' : `Row ${ri} options`}
                      onClick={event => openMenu(event, 'row', { row: ri, column: c })}>{ri === 0 ? 'H' : ri}</button>
                  </th>
                  {row.map((value, ci) => (
                    <td key={ci} className={r === ri && c === ci ? 'is-current' : c === ci || r === ri ? 'is-line' : ''}>
                      <input
                        data-cell={`${ri}-${ci}`}
                        value={value}
                        aria-label={ri === 0 ? `Header, column ${letter(ci)}` : `Row ${ri}, column ${letter(ci)}`}
                        placeholder={ri === 0 ? 'Header' : ''}
                        style={{ textAlign: table.align[ci] === 'none' ? 'left' : table.align[ci] }}
                        onFocus={() => { focusTarget.current = { row: ri, column: ci }; setCell({ row: ri, column: ci }) }}
                        onChange={event => setValue(ri, ci, event.target.value)}
                        onKeyDown={event => onKeyDown(event, ri, ci)}
                        onPaste={event => onPaste(event, ri, ci)}
                        onContextMenu={event => openMenu(event, 'cell', { row: ri, column: ci })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-add">
            <button type="button" className="table-add-row" onClick={() => commit(insertRow(table, table.rows.length), { row: table.rows.length, column: 0 })}><Plus size={12} /> Add row</button>
            <button type="button" className="table-add-row" onClick={() => commit(insertColumn(table, columns), { row: r, column: columns })}><Plus size={12} /> Add column</button>
          </div>
        </div>
        {menu && createPortal(
          <div className="table-menu" role="menu" aria-label={menu.kind === 'row' ? 'Row options' : menu.kind === 'column' ? 'Column options' : menu.kind === 'more' ? 'More table options' : 'Cell options'}
            style={{ left: menu.x, top: menu.y }} onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
            {menuItems.map((item, index) => (item ? (
              <button key={item[0]} type="button" role="menuitem" className={item[3] ? 'is-danger' : ''} disabled={item[2]} onClick={() => { setMenu(null); item[1]() }}>{item[0]}</button>
            ) : <span key={`sep-${index}`} className="table-menu-sep" role="separator" />))}
          </div>,
          document.body,
        )}
        <div className="pdf-dialog-footer">
          <div className="table-size" role="group" aria-label="Table size">
            <span>Size</span>
            <button type="button" className="table-step" onClick={() => actions.resize(bodyRows - 1, columns)} disabled={bodyRows <= 1} aria-label="One row fewer"><Minus size={11} /></button>
            <span className="table-size-value" aria-live="polite">{bodyRows} row{bodyRows === 1 ? '' : 's'}</span>
            <button type="button" className="table-step" onClick={() => actions.resize(bodyRows + 1, columns)} aria-label="One more row"><Plus size={11} /></button>
            <span aria-hidden="true">×</span>
            <button type="button" className="table-step" onClick={() => actions.resize(bodyRows, columns - 1)} disabled={columns <= 1} aria-label="One column fewer"><Minus size={11} /></button>
            <span className="table-size-value">{columns} column{columns === 1 ? '' : 's'}</span>
            <button type="button" className="table-step" onClick={() => actions.resize(bodyRows, columns + 1)} aria-label="One more column"><Plus size={11} /></button>
          </div>
          <button type="button" className="reader-chip" onClick={onCancel}>Cancel</button>
          <button type="button" className="pdf-dialog-primary" onClick={() => onSave(table)} data-tip={`${mod}Enter`}>{mode === 'insert' ? 'Insert table' : 'Update table'}</button>
        </div>
      </div>
    </div>
  )
}
