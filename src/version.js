/**
 * App version shown in Settings → About, and release notes shown in Settings → Versions.
 * Bump the minor number with every deployment (every push to main): 1.3 → 1.4 → …
 * and add a RELEASES entry at the top: only meaningful changes (at most 4 points, fewer is
 * fine; skip small fixes), newest first, keeping the last 5. See Guidelines.md.
 */
export const APP_VERSION = '2.4'

export const RELEASES = [
  {
    version: '2.4',
    date: '2026-11-27',
    notes: [
      'Review writing (AI): the on-device model points out hard-to-follow sentences, passive voice, wordy phrases, repetition and tone, with rewrites you can apply in one undoable step.',
    ],
  },
  {
    version: '2.3',
    date: '2026-11-27',
    notes: [
      'Publish as a website: turn your documents (or one folder) into a small website with a sidebar, search, and links between pages, ready for GitHub Pages, Netlify or any web host.',
      'Download the ReadMe app from the Download menu or Settings → App, which also shows whether it is installed and its version.',
      'Diagrams draw at the right size when your system asks for reduced motion.',
    ],
  },
  {
    version: '2.2',
    date: '2026-11-27',
    notes: [
      'Graph view: see how your documents link to each other, open them, and find ones without links.',
    ],
  },
  {
    version: '2.1',
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
]
