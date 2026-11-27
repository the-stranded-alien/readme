import { useRef, useState } from 'react'
import { ArchiveRestore, DatabaseBackup, FileArchive, Feather, FolderOpen, FolderSync, HardDrive, History, Info, AppDownload, CircleCheck, Palette, Presentation, RefreshCw, Settings, Sparkles, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { StoragePanel } from './StorageDialog'
import { THEMES, themeClasses } from '../themes'
import { APP_VERSION, RELEASES } from '../version'
import { DOC_STYLES } from '../docStyles'

export const REPO_URL = 'https://github.com/the-stranded-alien/readme'

const SECTIONS = [
  { id: 'workspace', label: 'Workspace', icon: FolderOpen },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'presentation', label: 'Presentation', icon: Presentation },
  { id: 'features', label: 'Features', icon: Sparkles },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'app', label: 'App', icon: AppDownload },
  { id: 'versions', label: 'Versions', icon: History },
  { id: 'about', label: 'About', icon: Info },
]

/** Theme swatches + the "Additional themes" switch (shown in Appearance). */
export function ThemePicker({ themes, value, onChange, extraThemes, onExtraThemes, defaultTheme = '', onDefaultTheme }) {
  return (
    <>
      <div className="theme-picker" role="radiogroup" aria-label="Theme">
        {themes.map(theme => (
          <button key={theme.id} type="button" role="radio" aria-checked={value === theme.id}
            className={`theme-swatch${value === theme.id ? ' is-active' : ''}`} onClick={() => onChange(theme.id)}>
            {/* A tiny page drawn with the theme's own colours (its classes set the tokens locally). */}
            <span className={`theme-mini ${theme.dark ? 'dark' : 'tp-light'} ${themeClasses(theme).join(' ')}${theme.id === 'sepia' ? ' theme-sepia' : ''}`} aria-hidden="true">
              <span className="tm-h" />
              <span className="tm-l" />
              <span className="tm-l is-short" />
              <span className="tm-code"><i /><i /></span>
            </span>
            {theme.label}
          </button>
        ))}
      </div>
      <SettingsToggle label="Additional themes" description="Adds Neon (pink, blue, green, purple and multicolour rainbow), Ocean, Forest, Sun, Monokai, Nord, Solarized and Marble to the theme switcher." checked={extraThemes} onChange={onExtraThemes} />
      {onDefaultTheme && (
        <label className="settings-toggle settings-field">
          <span className="settings-toggle-text">
            <strong>Default theme</strong>
            <span>The theme ReadMe opens with every time. “Last used” keeps whichever theme you had last.</span>
          </span>
          <span className="settings-select-wrap">
            <select className="settings-select" value={defaultTheme} onChange={event => onDefaultTheme(event.target.value)}>
              <option value="">Last used</option>
              <optgroup label="Main themes">
                {THEMES.filter(theme => !theme.extra).map(theme => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
              </optgroup>
              <optgroup label="Additional themes">
                {THEMES.filter(theme => theme.extra).map(theme => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
              </optgroup>
            </select>
          </span>
        </label>
      )}
    </>
  )
}

/** "Sync to a folder" controls (Settings → Workspace). */
export function FolderSyncCard({ supported, state, onConnect, onReconnect, onSyncNow, onDisconnect }) {
  return (
    <div className="folder-sync" role="group" aria-label="Sync to a folder">
      <div className="folder-sync-head">
        <FolderSync size={16} aria-hidden="true" />
        <div>
          <strong>Sync to a folder</strong>
          <span>Keep a copy of every file in a folder on your computer. Changes are written automatically, and files changed in other apps are picked up when you come back.</span>
        </div>
      </div>
      {!supported ? (
        <p className="settings-muted">Your browser can’t save to folders. Use desktop Chrome or Edge, or back up the workspace instead.</p>
      ) : !state ? (
        <div className="settings-actions"><button type="button" className="pdf-dialog-primary" onClick={onConnect}><FolderOpen size={13} />Choose a folder…</button></div>
      ) : (
        <>
          <p className={`folder-sync-status is-${state.status}`} role="status">
            {state.status === 'connected' && <>Syncing with <strong>{state.name}</strong>{state.lastSync ? ` · last synced ${new Date(state.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</>}
            {state.status === 'needs-permission' && <>The browser needs your permission again to use <strong>{state.name}</strong>.</>}
            {state.status === 'error' && <>Couldn’t sync with <strong>{state.name}</strong>: {state.error}</>}
          </p>
          <div className="settings-actions">
            {state.status === 'needs-permission'
              ? <button type="button" className="pdf-dialog-primary" onClick={onReconnect}>Allow access</button>
              : <button type="button" className="reader-chip" onClick={onSyncNow}><RefreshCw size={12} /> Sync now</button>}
            <button type="button" className="reader-chip" onClick={onConnect}><FolderOpen size={12} /> Change folder…</button>
            <button type="button" className="reader-chip" onClick={onDisconnect}>Stop syncing</button>
          </div>
        </>
      )}
    </div>
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
  onBackup, onRestore, onExportZip, appInstall, density, onDensity, highContrast, onHighContrast,
  appearanceExtra, workspaceExtra, presentationExtra, onClose,
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
          <div className="settings-panel" role="region" tabIndex={0} aria-label={SECTIONS.find(item => item.id === section)?.label}>
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
                <label className="settings-toggle settings-field">
                  <span className="settings-toggle-text">
                    <strong>Default document style</strong>
                    <span>How documents look in the preview, PDF, Word, slides and websites, unless a document picks its own style (Aa → Document style).</span>
                  </span>
                  <span className="settings-select-wrap">
                    <select className="settings-select" value={settings.defaultDocStyle || 'readme'} onChange={event => onChange('defaultDocStyle', event.target.value)} aria-label="Default document style">
                      {DOC_STYLES.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}
                    </select>
                  </span>
                </label>
                <SettingsToggle label="High contrast" description="Stronger text and borders." checked={highContrast} onChange={onHighContrast} />
                <SettingsToggle label="Compact layout" description="Tighter spacing in toolbars and lists." checked={density === 'compact'} onChange={value => onDensity(value ? 'compact' : 'comfortable')} />
              </>
            )}
            {section === 'features' && (
              <>
                <h3>Features</h3>
                <SettingsToggle
                  label="Hide AI features"
                  description="Removes Summarize, AI tools (translate, proofread, writing review) and the on-device AI writer. Write a README still works with the built-in generator."
                  checked={settings.hideAi}
                  onChange={value => onChange('hideAi', value)}
                />
                <SettingsToggle
                  label="Show tips"
                  description="Now and then (never more than once per visit), a short tip points out a feature you haven’t used yet."
                  checked={settings.showTips !== false}
                  onChange={value => onChange('showTips', value)}
                />
                <SettingsToggle
                  label="Embed pasted images in the document"
                  description="Off (recommended): pasted and dropped images are kept as attachments (see Images in the command palette) and documents only hold a short reference, so they stay small and readable. On: images are written into the document itself."
                  checked={Boolean(settings.embedImages)}
                  onChange={value => onChange('embedImages', value)}
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
            {section === 'app' && (
              <>
                <h3>App</h3>
                <p className="settings-muted">Install ReadMe as an app: it opens in its own window, works offline, and can open .md files from your computer.</p>
                <div className={`app-install-card is-${appInstall?.status ?? 'unavailable'}`} role="group" aria-label="ReadMe app">
                  <img className="app-install-logo" src="/icon-192.png" alt="" width="42" height="42" />
                  <div className="app-install-text">
                    <strong>ReadMe app</strong>
                    <span>Version {APP_VERSION}</span>
                  </div>
                  {appInstall?.status === 'installed' ? (
                    <span className="app-install-status" role="status"><CircleCheck size={14} />{appInstall.standalone ? 'Installed · you are using the app' : 'Already installed'}</span>
                  ) : appInstall?.status === 'available' ? (
                    <button type="button" className="pdf-dialog-primary" onClick={appInstall.onInstall}><AppDownload size={14} />Download ReadMe app</button>
                  ) : null}
                </div>
                {appInstall?.status === 'installed' && !appInstall.standalone && (
                  <p className="settings-muted">Open it from your apps (Dock, Start menu or launcher). It updates by itself whenever a new version is released.</p>
                )}
                {appInstall?.status === 'unavailable' && (
                  <p className="settings-muted">This browser doesn’t offer installing from here. In Chrome or Edge, use the install icon in the address bar or the browser menu → “Install ReadMe”. In Safari, choose File → Add to Dock (Mac) or Share → Add to Home Screen (iPhone, iPad).</p>
                )}
              </>
            )}
            {section === 'presentation' && (
              <>
                <h3>Presentation</h3>
                <p className="settings-muted">Defaults for Present. The pen, laser, contents and text size can also be changed from the slide toolbar.</p>
                {presentationExtra}
              </>
            )}
            {section === 'versions' && (
              <>
                <h3>Versions</h3>
                <p className="settings-muted">You are on version {APP_VERSION}. What changed in recent releases:</p>
                <ol className="release-list">
                  {RELEASES.map(release => (
                    <li key={release.version} className="release-item">
                      <div className="release-head">
                        <strong>Version {release.version}</strong>
                        {release.version === APP_VERSION && <span className="release-current">Current</span>}
                        <time dateTime={release.date}>{new Date(`${release.date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
                      </div>
                      <ul>
                        {release.notes.map(note => <li key={note}>{note}</li>)}
                      </ul>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {section === 'about' && (
              <div className="settings-about">
                <div className="settings-about-logo"><Feather size={22} /></div>
                <h3>ReadMe <span className="settings-about-version">Version {APP_VERSION}</span></h3>
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
