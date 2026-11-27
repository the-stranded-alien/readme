// Guided start: the welcome tour (first visit), one-time tips, and "What's new" after updates.
// Everything is remembered in localStorage and shown at most once.

export const ONBOARDING_KEYS = {
  tourDone: 'readme-tour-done',
  lastVersion: 'readme-last-version',
  tipsSeen: 'readme-tips-seen',
}
const read = key => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, value) } catch { /* optional */ } }

/** "2.10" > "2.9": compares major.minor numerically. */
export function compareVersions(a, b) {
  const [aMajor, aMinor = 0] = String(a).split('.').map(Number)
  const [bMajor, bMinor = 0] = String(b).split('.').map(Number)
  return aMajor - bMajor || aMinor - bMinor
}
/** Releases newer than `lastSeen` (newest first), at most `limit`. */
export function releasesSince(releases, lastSeen, limit = 3) {
  return releases.filter(release => !lastSeen || compareVersions(release.version, lastSeen) > 0).slice(0, limit)
}

/**
 * What to show when the app starts, decided once:
 *  - 'welcome': a first visit (nothing of ReadMe stored yet) → offer the tour;
 *  - 'whats-new': a returning visit after an update → the new releases;
 *  - null: nothing.
 * `storedKeys` are the localStorage keys present before the app wrote anything.
 */
export function startupNotice({ storedKeys, appVersion, releases }) {
  const returning = storedKeys.some(key => key.startsWith('readme-'))
  if (!returning) return { kind: 'welcome' }
  const lastSeen = read(ONBOARDING_KEYS.lastVersion)
  if (lastSeen && compareVersions(appVersion, lastSeen) <= 0) return null
  // Used ReadMe before "What's new" existed: show just the current release.
  const shown = lastSeen ? releasesSince(releases, lastSeen) : releases.slice(0, 1)
  return shown.length ? { kind: 'whats-new', releases: shown } : null
}
export const markVersionSeen = version => write(ONBOARDING_KEYS.lastVersion, version)
export const tourDone = () => read(ONBOARDING_KEYS.tourDone) === '1'
export const markTourDone = () => write(ONBOARDING_KEYS.tourDone, '1')

// ── Tips: each shown once, at most one per session ──
let tipShownThisSession = false
export function takeTip(id) {
  if (tipShownThisSession) return false
  let seen = []
  try { seen = JSON.parse(read(ONBOARDING_KEYS.tipsSeen) || '[]') } catch { seen = [] }
  if (seen.includes(id)) return false
  tipShownThisSession = true
  write(ONBOARDING_KEYS.tipsSeen, JSON.stringify([...seen, id]))
  return true
}
export const resetTipSession = () => { tipShownThisSession = false }

export const TIPS = {
  wiki: 'Tip: [[ ]] links to another document — keep typing a name and pick it from the list.',
  tasks: 'Tip: every “- [ ]” task from all your documents is gathered in Tasks (✓ in the tab bar).',
  library: 'Tip: the Library (in the tab bar) shows all your documents as cards, with search and filters.',
  editPreview: 'Tip: turn on Edit (the pencil above the page) to change text right here in the preview.',
}

/** Tour steps; `target` is a data-tour anchor. Steps whose target isn't on screen are skipped. */
export const TOUR_STEPS = [
  { target: 'new', title: 'Create or open documents', text: 'Start a new document here, or use the arrow for templates. Upload (next to it) opens files from your computer — or drop them anywhere on the window.' },
  { target: 'views', title: 'Write, read or present', text: 'Switch between the editor, side-by-side Split, Focus, the Preview, and Present for slides.' },
  { target: 'palette', title: 'Find anything', text: 'Search every command, file and heading here — or press ⌘/Ctrl+K from anywhere.' },
  { target: 'library', title: 'All your documents', text: 'The Library shows every document as cards or a table, with tags, status and search.' },
  { target: 'ai', title: 'AI that stays on your device', text: 'Summarize, translate, proofread and review your writing with the browser’s built-in model. Nothing leaves your computer.' },
  { target: 'download', title: 'Saved here, shared anywhere', text: 'Everything is saved in this browser automatically. Download as PDF, Word or HTML, publish a website, or back up your workspace.' },
  { target: 'help', title: 'Help is one click away', text: 'Every feature is explained here, and you can take this tour again any time.' },
]
