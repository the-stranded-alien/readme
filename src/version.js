/**
 * App version shown in Settings → About, and release notes shown in Settings → Versions.
 * Bump the minor number with every deployment (every push to main): 1.3 → 1.4 → …
 * and add a RELEASES entry at the top: only meaningful changes (at most 4 points, fewer is
 * fine; skip small fixes), newest first, keeping the last 5. See Guidelines.md.
 */
export const APP_VERSION = '2.0'

export const RELEASES = [
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
]
