/**
 * App version shown in Settings → About, and release notes shown in Settings → Versions.
 * Bump the minor number with every deployment (every push to main): 1.3 → 1.4 → …
 * and add a RELEASES entry at the top: only meaningful changes (at most 4 points, fewer is
 * fine; skip small fixes), newest first, keeping every version. `show` (optional) is a command-palette
 * id for the “Show me” button in the What's new card. See Guidelines.md.
 */
export const APP_VERSION = '3.2'

export const RELEASES = [
  {
    version: '3.2',
    date: '2026-11-27',
    notes: [
      'Added 6 more reading fonts and changed Reading font to a dropdown in View options and Aa settings.',
      'Updated the View options icon and header action order.',
      'Matched the New File button in the tab bar to the circular icon style and removed the bottom hint from the Files panel.',
    ],
  },
  {
    version: '3.1',
    date: '2026-11-27',
    notes: [
      'Folder sync now includes closed files, removes deleted files, and syncs on every save (⌘/Ctrl+S).',
      'Workspace sync status icon in the header now shows when no folder is connected (with an option to disable it).',
      'Pet settings moved into Settings → Pet, and Theme moved into View options.',
    ],
  },
  {
    version: '3.0',
    show: 'table-editor',
    date: '2026-11-27',
    notes: [
      'A much better table editor: column and row menus, duplicate, clear and delete rows or columns, swap rows and columns, and delete the whole table.',
      'Bold, italic, code and links inside table cells, a size stepper, undo / redo, and ⌘/Ctrl+Enter to save.',
      'Hover labels in the table editor no longer get cut off.',
    ],
  },
  {
    version: '2.9',
    show: 'tour',
    date: '2026-11-27',
    notes: [
      'A one-minute tour for new users, from the welcome card, the start screen, Help or the command palette.',
      'After each update, a “What’s new” card shows what changed, with “Show me” buttons.',
      'A few one-time tips point out features you haven’t found yet (turn them off in Settings → Features).',
    ],
  },
  {
    version: '2.8',
    show: 'doc-style',
    date: '2026-11-27',
    notes: [
      'Document styles: Classic, Modern, Academic, Notebook and Minimal (Aa → Document style), used the same way in the preview, PDF, Word, HTML, slides and websites.',
      'PDF and Word downloads can add a cover page and a page header.',
      'Settings → Versions now lists every version, and Help covers every feature.',
    ],
  },
  {
    version: '2.7',
    show: 'images',
    date: '2026-11-27',
    notes: [
      'Images as attachments: pasted images no longer bloat documents; they are kept separately and documents hold a short reference.',
      'Images panel: see every image and where it is used; describe, rename, replace, rotate, compress or delete it, and move embedded images out of older documents.',
      'Exports, backups, published websites and folder sync include your images.',
    ],
  },
  {
    version: '2.6',
    show: 'library',
    date: '2026-11-27',
    notes: [
      'Library: every document as cards or a table, with search, filters by folder, tag and status, saved views, and moving, tagging, exporting or deleting several at once.',
      'Properties: edit front matter (title, tags, status, dates and more) as simple fields.',
    ],
  },
  {
    version: '2.5',
    show: 'preview-edit',
    date: '2026-11-27',
    notes: [
      'Edit in preview: click any paragraph, heading or list item in the preview and change it right there, with a formatting bar and “/” for new blocks.',
      'In the installed app, the title bar now follows your theme.',
    ],
  },
  {
    version: '2.4',
    show: 'ai-review',
    date: '2026-11-27',
    notes: [
      'Review writing (AI): the on-device model points out hard-to-follow sentences, passive voice, wordy phrases, repetition and tone, with rewrites you can apply in one undoable step.',
    ],
  },
  {
    version: '2.3',
    show: 'publish-site',
    date: '2026-11-27',
    notes: [
      'Publish as a website: turn your documents (or one folder) into a small website with a sidebar, search, and links between pages, ready for GitHub Pages, Netlify or any web host.',
      'Download the ReadMe app from the Download menu or Settings → App, which also shows whether it is installed and its version.',
      'Diagrams draw at the right size when your system asks for reduced motion.',
    ],
  },
  {
    version: '2.2',
    show: 'graph',
    date: '2026-11-27',
    notes: [
      'Graph view: see how your documents link to each other, open them, and find ones without links.',
    ],
  },
  {
    version: '2.1',
    show: 'tasks',
    date: '2026-11-27',
    notes: [
      'Tasks: every task from all your documents in one panel, with due dates, tags and priorities.',
      'Tick tasks straight in the preview.',
    ],
  },
  {
    version: '2.0',
    date: '2026-11-27',
    notes: [
      'Paste from Word, Google Docs, Confluence or the web as clean Markdown; open Word and HTML files.',
      'Wiki links: type [[ to link documents, with “Linked from” in the Contents bar.',
      'Visual table editor: edit tables in a grid — add, move, align and sort rows and columns.',
      'Reorganise documents from the Contents bar: drag sections, promote, demote or move them to another file.',
    ],
  },
  {
    version: '1.9',
    date: '2026-11-26',
    notes: [
      'Download a presentation as a landscape PDF or a PowerPoint file (with speaker notes).',
      'Pin up to 5 files; the file pinned last comes first.',
    ],
  },
  {
    version: '1.8',
    date: '2026-11-26',
    notes: [
      'Sub-folders, up to three levels deep.',
      'Rename files from the Files panel; renaming never changes the file’s folder or extension.',
    ],
  },
  {
    version: '1.7',
    date: '2026-11-26',
    notes: [
      'Copy or export pages for Confluence (storage format XHTML).',
      'Delete whole folders, with a confirmation and Undo.',
      'New “Markdown Guide” template showing every supported Markdown feature.',
    ],
  },
  {
    version: '1.6',
    date: '2026-11-26',
    notes: [
      'Create and rename folders from ReadMe’s own dialog; new folders start empty.',
    ],
  },
  {
    version: '1.5',
    date: '2026-11-26',
    notes: [
      'Presentation: slide contents panel, laser pointer and pen (fading or permanent ink).',
      'New Settings → Presentation: slide breaks, auto-advance, default text size and theme, pen and laser.',
    ],
  },
  {
    version: '1.3',
    date: '2026-11-26',
    notes: [
      'Present from any heading, or present only your bookmarked sections.',
      'Marble theme, and a default theme setting.',
    ],
  },
]
