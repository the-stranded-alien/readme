import { useRef, useState } from 'react'
import { useDialogKeys } from '../useDialogKeys'
import { FileDown, Loader2, X } from 'lucide-react'

const PAGE_SIZES = [['A4', 'A4'], ['LETTER', 'US Letter']]
const MARGINS = [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']]
const PAPERS = [['white', 'White'], ['sepia', 'Sepia']]
const STORAGE_KEY = 'readme-pdf-options'
const DEFAULT_DIALOG_OPTIONS = { pageSize: 'A4', margins: 'normal', toc: false, includeMeta: true, paper: 'white', diagrams: true }

function loadOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return { ...DEFAULT_DIALOG_OPTIONS, ...(saved && typeof saved === 'object' ? saved : {}) }
  } catch {
    return DEFAULT_DIALOG_OPTIONS
  }
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="pdf-option" role="radiogroup" aria-label={label}>
      <span className="pdf-option-label">{label}</span>
      <div className="pdf-segmented">
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id}
            className={value === id ? 'is-active' : ''} onClick={() => onChange(id)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="pdf-toggle">
      <span>
        <span className="pdf-option-label">{label}</span>
        {hint && <span className="pdf-toggle-hint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span className="pdf-switch" aria-hidden="true" />
    </label>
  )
}

export default function PdfExportDialog({ fileName, hasFrontmatter, hasHeadings, hasDiagrams, busy, onExport, onClose }) {
  const [options, setOptions] = useState(loadOptions)
  const dialogRef = useRef(null)
  const set = (key, value) => setOptions(current => ({ ...current, [key]: value }))

  useDialogKeys(onClose, { focus: () => dialogRef.current?.querySelector('button.is-active, button')?.focus(), canClose: () => !busy })

  const submit = event => {
    event.preventDefault()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(options)) } catch { /* storage is optional */ }
    onExport(options)
  }

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div ref={dialogRef} className="pdf-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="pdf-dialog-title">
      <form onSubmit={submit}>
        <div className="pdf-dialog-header">
          <div>
            <h2 id="pdf-dialog-title">Export PDF</h2>
            <p>{fileName}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close PDF options" disabled={busy}><X size={15} /></button>
        </div>
        <div className="pdf-dialog-body">
          <Segmented label="Page size" options={PAGE_SIZES} value={options.pageSize} onChange={value => set('pageSize', value)} />
          <Segmented label="Margins" options={MARGINS} value={options.margins} onChange={value => set('margins', value)} />
          <Segmented label="Page style" options={PAPERS} value={options.paper} onChange={value => set('paper', value)} />
          <Toggle label="Table of contents" hint={hasHeadings ? 'Clickable list of headings on the first page' : 'No headings in this document'}
            checked={options.toc && hasHeadings} onChange={value => set('toc', value)} />
          <Toggle label="Frontmatter details" hint={hasFrontmatter ? 'Show YAML frontmatter at the top' : 'No frontmatter in this document'}
            checked={options.includeMeta && hasFrontmatter} onChange={value => set('includeMeta', value)} />
          <Toggle label="Render diagrams & math" hint={hasDiagrams ? 'Mermaid and display math as vector graphics' : 'Mermaid and display math as vector graphics'}
            checked={options.diagrams} onChange={value => set('diagrams', value)} />
        </div>
        <div className="pdf-dialog-footer">
          <button type="button" className="reader-chip" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="pdf-dialog-primary" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {busy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </form>
      </div>
    </div>
  )
}
