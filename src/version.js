/**
 * App version shown in Settings → About, and release notes shown in Settings → Versions.
 * Bump the minor number with every deployment (every push to main): 1.3 → 1.4 → …
 * and add a RELEASES entry at the top: only meaningful changes (at most 4 points, fewer is
 * fine; skip small fixes), newest first, keeping the last 5. See Guidelines.md.
 */
export const APP_VERSION = '1.8'

export const RELEASES = [
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
