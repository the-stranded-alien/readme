/**
 * App version shown in Settings → About, and release notes shown in Settings → Versions.
 * Bump the minor number with every deployment (every push to main): 1.3 → 1.4 → …
 * and add a RELEASES entry at the top: only meaningful changes (at most 4 points, fewer is
 * fine; skip small fixes), newest first, keeping the last 5. See Guidelines.md.
 */
export const APP_VERSION = '2.7'

export const RELEASES = [
  {
    version: '2.7',
    date: '2026-11-27',
    notes: [
      'Images as attachments: pasted images no longer bloat documents; they are kept separately and documents hold a short reference.',
      'Images panel: see every image and where it is used; describe, rename, replace, rotate, compress or delete it, and move embedded images out of older documents.',
      'Exports, backups, published websites and folder sync include your images.',
    ],
  },
  {
    version: '2.6',
    date: '2026-11-27',
    notes: [
      'Library: every document as cards or a table, with search, filters by folder, tag and status, saved views, and moving, tagging, exporting or deleting several at once.',
      'Properties: edit front matter (title, tags, status, dates and more) as simple fields.',
    ],
  },
  {
    version: '2.5',
    date: '2026-11-27',
    notes: [
      'Edit in preview: click any paragraph, heading or list item in the preview and change it right there, with a formatting bar and “/” for new blocks.',
      'In the installed app, the title bar now follows your theme.',
    ],
  },
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
]
