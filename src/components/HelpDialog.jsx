import { useMemo, useRef, useState } from 'react'
import { CircleHelp, Search, X } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { shortcut } from '../platform'

/** How-to guide for every part of the app, grouped into sections. */
const HELP_SECTIONS = [
  {
    id: 'start', title: 'Getting started',
    items: [
      ['Open files', 'Click Upload, drop .md files anywhere on the window, or open a whole folder. Files you open from your computer can be saved straight back to disk.'],
      ['Create a file', 'Click New for a blank file, or the arrow next to it to start from a template or write a README from a description.'],
      ['Views', `Switch between Editor, Split, Focus, Preview and Present with the switcher at the top. ${shortcut('K')} opens the command palette, where every action can be searched.`],
      ['Saving', `Everything is saved in your browser automatically. ${shortcut('S')} saves all files right away, including files opened from disk.`],
    ],
  },
  {
    id: 'files', title: 'Files & tabs',
    items: [
      ['Tabs', 'Drag tabs to reorder them. Right-click a tab to rename, duplicate, pin, colour, compare, download or close it.'],
      ['File tree', 'The folder icon at the left of the tab bar shows your files as a tree, grouped by folder.'],
      ['Compare', 'Right-click a tab → Compare to see the differences between two files side by side.'],
      ['History', 'The clock icon above the editor lists earlier versions of the file; restore any of them.'],
      ['Outside changes', 'If a file you opened from disk changes in another app, ReadMe offers to reload it, compare, or keep your version.'],
    ],
  },
  {
    id: 'editing', title: 'Editing',
    items: [
      ['Formatting toolbar', 'Headings, bold, italic, links, code, quotes, lists, tables and more. Scroll the toolbar sideways if it doesn’t fit.'],
      ['Slash commands', 'Type / at the start of a line to insert headings, lists, tables, code blocks, callouts and more.'],
      ['Find & replace', `${shortcut('F', { alt: true })} opens find & replace in the editor, with match case, whole word, regular expressions and replace across all files.`],
      ['Templates', 'Use Templates in the editor toolbar or the New menu. Manage templates to save your own.'],
      ['Write a README', 'Describe a project and a README is written into a new file — with on-device AI in supported Chrome, or the built-in generator everywhere else.'],
      ['Images', 'Paste or drop an image into the editor to embed it in the document.'],
    ],
  },
  {
    id: 'reading', title: 'Reading the page',
    items: [
      ['Outline', 'The contents bar lists every heading. Click to jump, drag its edge to make it wider, and star sections to bookmark them.'],
      ['Collapse sections', 'Click the arrow beside a heading to fold it, or use Collapse all in the toolbar.'],
      ['Filter', 'Use the filter in the toolbar to show only headings, a heading level, tables, code, lists, quotes or images.'],
      ['Section focus', 'Shows one section at a time; use Alt+← and Alt+→ to move between sections.'],
      ['Reading comfort', 'The Aa button changes the font size, line height, width, font weight and paper tone.'],
      ['Read aloud & spot', 'Listen to the document, and save your reading spot to resume later.'],
      ['Highlights', 'Select text in the page to highlight it in one of several colours.'],
    ],
  },
  {
    id: 'ai', title: 'AI tools',
    items: [
      ['Summarize', 'Shows a summary card at the top of the page. Each section also has its own summarize button. Longer documents get longer summaries.'],
      ['Translate & proofread', 'Open AI tools to translate the document or check spelling and grammar.'],
      ['Privacy', 'All AI runs on your device with the model built into recent desktop Chrome. Nothing is sent to a server. The first use downloads the model.'],
      ['Turn off', 'Settings → Features → Hide AI features removes all AI buttons.'],
    ],
  },
  {
    id: 'export', title: 'Export & share',
    items: [
      ['Download', 'Download as Markdown, PDF (with options), Word, HTML, or all files as a .zip.'],
      ['Share link', 'Copy share link puts the whole document in the link itself — no server involved.'],
      ['Present', 'Present shows one slide per heading. Use the arrow keys, F for fullscreen and T to switch theme.'],
    ],
  },
  {
    id: 'storage', title: 'Storage & backup',
    items: [
      ['Where files live', 'Files, history and settings are stored in this browser. Settings → Storage shows how much space is used.'],
      ['Keep my data', 'Ask the browser not to clear your data when the disk is low. If it refuses, ReadMe tells you why.'],
      ['Folder sync', 'Settings → Workspace → Sync to a folder keeps a copy of every file in a folder on your computer.'],
      ['Backups', 'Back up the whole workspace as a .zip and restore it later, on any computer.'],
    ],
  },
  {
    id: 'settings', title: 'Settings & themes',
    items: [
      ['Themes', 'The theme button cycles Light, Dark and Sepia. Turn on Additional themes in Settings → Appearance for Neon (pink, blue, green, purple or multicolour rainbow), Ocean, Forest, Sun, Monokai, Nord and Solarized. High contrast works with every theme.'],
      ['Lite mode', 'Settings → Features → Lite mode uses less memory by turning off syntax colours, diagrams, link previews, the reading cats and animations.'],
      ['Shortcuts', 'Press ? (outside the editor) to see every keyboard shortcut.'],
    ],
  },
]

export default function HelpDialog({ onShortcuts, onClose }) {
  const [section, setSection] = useState(HELP_SECTIONS[0].id)
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  useDialogKeys(onClose, { focus: () => searchRef.current?.focus() })

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return null
    return HELP_SECTIONS.flatMap(group => group.items
      .filter(([title, text]) => `${title} ${text}`.toLowerCase().includes(term))
      .map(item => ({ group: group.title, item })))
  }, [query])
  const current = HELP_SECTIONS.find(group => group.id === section)

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="settings-dialog help-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="help-title" className="flex items-center gap-2"><CircleHelp size={16} style={{ color: 'var(--accent)' }} />How to use ReadMe</h2>
            <p>A quick guide to every feature.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close help"><X size={15} /></button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Help sections">
            <label className="help-search">
              <Search size={13} aria-hidden="true" />
              <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search help" aria-label="Search help" />
            </label>
            {HELP_SECTIONS.map(group => (
              <button key={group.id} type="button" aria-current={!results && section === group.id ? 'page' : undefined}
                className={!results && section === group.id ? 'is-active' : ''} onClick={() => { setQuery(''); setSection(group.id) }}>
                {group.title}
              </button>
            ))}
            {onShortcuts && <button type="button" onClick={onShortcuts}>Keyboard shortcuts…</button>}
          </nav>
          <div className="settings-panel" role="region" aria-label={results ? 'Search results' : current.title}>
            <h3>{results ? `Results for “${query.trim()}”` : current.title}</h3>
            {results && results.length === 0 && <p className="settings-muted">Nothing found. Try another word.</p>}
            <dl className="help-list">
              {(results ?? current.items.map(item => ({ item }))).map(({ group, item: [title, text] }) => (
                <div key={`${group || ''}${title}`} className="help-item">
                  <dt>{title}{group && <span>{group}</span>}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
