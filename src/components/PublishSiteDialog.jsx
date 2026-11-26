import { useMemo, useRef, useState } from 'react'
import { useDialogKeys } from '../useDialogKeys'
import { Globe, Loader2, X } from '../icons'

const STORAGE_KEY = 'readme-site-options'
const THEMES = [['auto', 'Match the reader'], ['light', 'Light'], ['dark', 'Dark']]

function loadOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

const folderOf = name => name.split('/').slice(0, -1).join('/')
const allFolders = files => [...new Set(files.flatMap(file => {
  const parts = folderOf(file.name).split('/').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}))].sort()

/**
 * Publish documents as a static website (downloaded as a ZIP).
 * `files`: open documents; `closedFiles`: closed ones (optional to include).
 * onPublish({ title, folder, homeId, theme, search, includeClosed }) does the work.
 */
export default function PublishSiteDialog({ files, closedFiles = [], activeId, busy, progress, onPublish, onClose }) {
  const [saved] = useState(loadOptions)
  const [title, setTitle] = useState(saved.title || 'Documentation')
  const [folder, setFolder] = useState('')
  const [includeClosed, setIncludeClosed] = useState(Boolean(saved.includeClosed))
  const [theme, setTheme] = useState(saved.theme || 'auto')
  const [search, setSearch] = useState(saved.search !== false)
  const [homeChoice, setHomeChoice] = useState('')
  const titleRef = useRef(null)
  useDialogKeys(onClose, { focus: () => titleRef.current?.select(), canClose: () => !busy })

  const pool = useMemo(() => (includeClosed ? [...files, ...closedFiles] : files), [files, closedFiles, includeClosed])
  const folders = useMemo(() => allFolders(pool), [pool])
  const chosen = useMemo(() => pool.filter(file => !folder || file.name.startsWith(`${folder}/`)), [pool, folder])
  const fallbackHome = chosen.find(file => /^(index|readme|home)\.(md|markdown)$/i.test(file.name.slice(folder ? folder.length + 1 : 0)))
    ?? chosen.find(file => file.id === activeId) ?? chosen[0]
  const homeId = chosen.some(file => file.id === homeChoice) ? homeChoice : fallbackHome?.id ?? ''

  const submit = event => {
    event.preventDefault()
    if (!chosen.length || busy) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, theme, search, includeClosed })) } catch { /* optional */ }
    onPublish({ title: title.trim() || 'Documentation', folder, homeId, theme, search, includeClosed })
  }

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="pdf-dialog publish-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="publish-title">
        <form onSubmit={submit}>
          <div className="pdf-dialog-header">
            <div>
              <h2 id="publish-title" className="flex items-center gap-2"><Globe size={16} style={{ color: 'var(--accent)' }} />Publish as a website</h2>
              <p>Turns your documents into a small website: a page per document, a sidebar, search, and links between pages. Everything is made on this device.</p>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close publish options" disabled={busy}><X size={15} /></button>
          </div>
          <div className="pdf-dialog-body">
            <label className="publish-field">
              <span className="pdf-option-label">Site name</span>
              <input ref={titleRef} className="publish-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} />
            </label>
            <div className="publish-grid">
              <label className="publish-field">
                <span className="pdf-option-label">Pages from</span>
                <span className="settings-select-wrap">
                  <select className="settings-select" value={folder} onChange={event => setFolder(event.target.value)}>
                    <option value="">All documents</option>
                    {folders.map(name => <option key={name} value={name}>Folder: {name}</option>)}
                  </select>
                </span>
              </label>
              <label className="publish-field">
                <span className="pdf-option-label">Home page</span>
                <span className="settings-select-wrap">
                  <select className="settings-select" value={homeId} onChange={event => setHomeChoice(event.target.value)} disabled={!chosen.length}>
                    {chosen.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
                  </select>
                </span>
              </label>
            </div>
            <div className="pdf-option" role="radiogroup" aria-label="Colours">
              <span className="pdf-option-label">Colours</span>
              <div className="pdf-segmented">
                {THEMES.map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={theme === id} className={theme === id ? 'is-active' : ''} onClick={() => setTheme(id)}>{label}</button>
                ))}
              </div>
            </div>
            <label className="pdf-toggle">
              <span><span className="pdf-option-label">Search box</span><span className="pdf-toggle-hint">Readers can search every page</span></span>
              <input type="checkbox" checked={search} onChange={event => setSearch(event.target.checked)} />
              <span className="pdf-switch" aria-hidden="true" />
            </label>
            {closedFiles.length > 0 && (
              <label className="pdf-toggle">
                <span><span className="pdf-option-label">Include closed files</span><span className="pdf-toggle-hint">{closedFiles.length} closed {closedFiles.length === 1 ? 'document' : 'documents'}</span></span>
                <input type="checkbox" checked={includeClosed} onChange={event => setIncludeClosed(event.target.checked)} />
                <span className="pdf-switch" aria-hidden="true" />
              </label>
            )}
            <p className="publish-note">
              {chosen.length} {chosen.length === 1 ? 'page' : 'pages'}. Unzip and upload the folder to any static host: GitHub Pages, Netlify Drop, Cloudflare Pages, or your own server. Opening <code>index.html</code> from the folder also works.
            </p>
          </div>
          <div className="pdf-dialog-footer">
            <button type="button" className="reader-chip" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="pdf-dialog-primary" disabled={busy || !chosen.length}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
              {busy ? `Making pages… ${Math.round((progress ?? 0) * 100)}%` : 'Download website (.zip)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
