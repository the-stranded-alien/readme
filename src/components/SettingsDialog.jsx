import { useRef, useState } from 'react'
import { ArchiveRestore, DatabaseBackup, FileArchive, Feather, HardDrive, Info, Palette, Settings, Sparkles, X, FolderOpen } from 'lucide-react'
import { useDialogKeys } from '../useDialogKeys'
import { StoragePanel } from './StorageDialog'

export const REPO_URL = 'https://github.com/the-stranded-alien/readme'

const SECTIONS = [
  { id: 'workspace', label: 'Workspace', icon: FolderOpen },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'features', label: 'Features', icon: Sparkles },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'about', label: 'About', icon: Info },
]

/** Theme swatches + the "Additional themes" switch (shown in Appearance). */
export function ThemePicker({ themes, value, onChange, extraThemes, onExtraThemes }) {
  return (
    <>
      <div className="theme-picker" role="radiogroup" aria-label="Theme">
        {themes.map(theme => (
          <button key={theme.id} type="button" role="radio" aria-checked={value === theme.id}
            className={`theme-swatch${value === theme.id ? ' is-active' : ''}`} onClick={() => onChange(theme.id)}>
            <span className="theme-swatch-preview" style={{ background: theme.swatch[0] }}>
              <span style={{ background: theme.swatch[1] }} />
            </span>
            {theme.label}
          </button>
        ))}
      </div>
      <SettingsToggle label="Additional themes" description="Adds Neon, Ocean and Forest to the theme switcher." checked={extraThemes} onChange={onExtraThemes} />
    </>
  )
}

export function SettingsToggle({ label, description, checked, onChange, disabled }) {
  return (
    <label className={`settings-toggle${disabled ? ' is-disabled' : ''}`}>
      <span className="settings-toggle-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="settings-switch" aria-hidden="true" />
    </label>
  )
}

/**
 * App settings: workspace actions, appearance, optional features (AI, lite
 * mode), storage and an About section. `extraSections` lets the app add
 * content to a section (e.g. themes in Appearance) without this file knowing it.
 */
export default function SettingsDialog({
  initialSection = 'workspace', settings, onChange, fileCount,
  onBackup, onRestore, onExportZip, density, onDensity, highContrast, onHighContrast,
  appearanceExtra, workspaceExtra, onClose,
}) {
  const [section, setSection] = useState(SECTIONS.some(item => item.id === initialSection) ? initialSection : 'workspace')
  const closeRef = useRef(null)
  useDialogKeys(onClose, { focus: () => closeRef.current?.focus() })

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="settings-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="settings-title" className="flex items-center gap-2"><Settings size={16} style={{ color: 'var(--accent)' }} />Settings</h2>
            <p>Settings are saved in this browser.</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Close settings"><X size={15} /></button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map(item => (
              <button key={item.id} type="button" aria-current={section === item.id ? 'page' : undefined}
                className={section === item.id ? 'is-active' : ''} onClick={() => setSection(item.id)}>
                <item.icon size={14} />{item.label}
              </button>
            ))}
          </nav>
          <div className="settings-panel" role="region" aria-label={SECTIONS.find(item => item.id === section)?.label}>
            {section === 'workspace' && (
              <>
                <h3>Workspace</h3>
                <p className="settings-muted">{fileCount} file{fileCount === 1 ? '' : 's'} open. Everything is saved in this browser automatically; ⌘/Ctrl+S saves now.</p>
                <div className="settings-actions">
                  <button type="button" className="reader-chip" onClick={onBackup}><DatabaseBackup size={12} /> Back up workspace (.zip)</button>
                  <button type="button" className="reader-chip" onClick={onRestore}><ArchiveRestore size={12} /> Restore from backup…</button>
                  <button type="button" className="reader-chip" onClick={onExportZip} disabled={!fileCount}><FileArchive size={12} /> Export all files (.zip)</button>
                </div>
                {workspaceExtra}
              </>
            )}
            {section === 'appearance' && (
              <>
                <h3>Appearance</h3>
                {appearanceExtra}
                <SettingsToggle label="High contrast" description="Stronger text and borders." checked={highContrast} onChange={onHighContrast} />
                <SettingsToggle label="Compact layout" description="Tighter spacing in toolbars and lists." checked={density === 'compact'} onChange={value => onDensity(value ? 'compact' : 'comfortable')} />
              </>
            )}
            {section === 'features' && (
              <>
                <h3>Features</h3>
                <SettingsToggle
                  label="Hide AI features"
                  description="Removes Summarize, AI tools and the on-device AI writer. Write a README still works with the built-in generator."
                  checked={settings.hideAi}
                  onChange={value => onChange('hideAi', value)}
                />
                <SettingsToggle
                  label="Lite mode"
                  description="Uses less memory: turns off syntax colours, diagram rendering, link previews, the reading cats and animations."
                  checked={settings.lite}
                  onChange={value => onChange('lite', value)}
                />
              </>
            )}
            {section === 'storage' && (
              <>
                <h3>Storage</h3>
                <p className="settings-muted">Your files, history and settings are stored in this browser.</p>
                <StoragePanel />
              </>
            )}
            {section === 'about' && (
              <div className="settings-about">
                <div className="settings-about-logo"><Feather size={22} /></div>
                <h3>ReadMe</h3>
                <p>
                  ReadMe is a fast, private Markdown reader and editor that runs entirely in your browser.
                  Write with a live preview, present documents as slides, export to PDF, Word or HTML,
                  and use on-device AI — your files never leave your computer.
                </p>
                <p>Made with ♥ by <strong>Sahil Gupta</strong>.</p>
                <a className="pdf-dialog-primary settings-about-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">View on GitHub</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
