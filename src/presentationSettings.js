// Settings → Presentation. Stored in localStorage (and so included in backups).
import { PRESENTATION_ZOOM, clampZoom } from './presentation'

export const PRESENTATION_SETTINGS_KEY = 'readme-presentation-settings'
// The theme last used inside a presentation (for the "Last used" default).
export const PRESENTATION_THEME_KEY = 'readme-presentation-theme'

export const SPLIT_LEVELS = [
  { value: 6, label: 'All headings' },
  { value: 3, label: 'Headings 1, 2 & 3' },
  { value: 2, label: 'Headings 1 & 2' },
  { value: 1, label: 'Heading 1' },
]
export const SPLIT_MODES = [
  { value: 'headings', label: 'By headings' },
  { value: 'blocks', label: 'By content blocks' },
  { value: 'length', label: 'By word count' },
  { value: 'smart', label: 'Smart split' },
  { value: 'single', label: 'One slide' },
  { value: 'custom', label: 'Custom' },
]
export const SPLIT_CUSTOM_LEVELS = Array.from({ length: 6 }, (_, index) => ({ value: index + 1, label: `Heading ${index + 1} (H${index + 1})` }))
export const SPLIT_CUSTOM_TRIGGERS = [
  { value: 'paragraph', label: 'Paragraphs' },
  { value: 'list', label: 'Lists' },
  { value: 'table', label: 'Tables' },
  { value: 'quote', label: 'Quotes' },
  { value: 'code', label: 'Code blocks' },
  { value: 'rule', label: 'Horizontal rules' },
]
const SPLIT_MODE_VALUES = [...SPLIT_MODES.map(mode => mode.value), 'at']
export const SPLIT_TARGETS = [
  { value: 100, label: 'Short · about 100 words' },
  { value: 180, label: 'Medium · about 180 words' },
  { value: 280, label: 'Long · about 280 words' },
]
export const INK_COLORS = [
  { id: 'red', label: 'Red', value: '#ef4444' },
  { id: 'amber', label: 'Amber', value: '#f59e0b' },
  { id: 'green', label: 'Green', value: '#22c55e' },
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'violet', label: 'Violet', value: '#8b5cf6' },
  { id: 'black', label: 'Black', value: '#111111' },
]
export const PEN_WIDTHS = [
  { value: 2, label: 'Thin' },
  { value: 4, label: 'Medium' },
  { value: 7, label: 'Thick' },
]
export const FADE_SECONDS = [1, 2, 3, 5, 8]
export const AUTO_ADVANCE_SECONDS = [0, 5, 10, 15, 30, 60]
export const ZOOM_CHOICES = Array.from(
  { length: Math.round((PRESENTATION_ZOOM.max - PRESENTATION_ZOOM.min) / PRESENTATION_ZOOM.step) + 1 },
  (_, index) => clampZoom(PRESENTATION_ZOOM.min + index * PRESENTATION_ZOOM.step),
)

export const DEFAULT_PRESENTATION_SETTINGS = {
  splitMode: 'headings',    // preserve the established heading-based presentation by default
  splitModeExplicit: false,
  splitLevel: 2,          // headings up to this level start a slide
  splitLevels: [1, 2],   // custom mode: any combination of heading levels
  splitTriggers: [],     // custom mode: any combination of non-heading block types
  splitTargetWords: 180,  // target for smart and word-count splitting; blocks stay intact
  zoom: 'last',           // default text size: 'last' (last used) or a number
  theme: '',              // '' = last theme used in a presentation
  showContents: false,    // open the contents panel when a presentation starts
  showProgress: true,     // progress bar at the top
  showTimer: false,       // elapsed time in the toolbar
  autoAdvance: 0,         // seconds per slide, 0 = off
  penMode: 'fade',        // 'fade' or 'permanent'
  penColor: 'red',
  penWidth: 4,
  fadeSeconds: 3,
  laserColor: 'red',
}

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback)

export function normalizePresentationSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const d = DEFAULT_PRESENTATION_SETTINGS
  const colorIds = INK_COLORS.map(color => color.id)
  // Smart was the old out-of-box value and got auto-saved for many users. Move that
  // legacy default to headings, while retaining a mode explicitly picked going forward.
  const splitModeExplicit = s.splitModeExplicit === true
  let splitMode = pick(s.splitModeExplicit === true ? s.splitMode : s.splitMode === 'smart' ? d.splitMode : s.splitMode, SPLIT_MODE_VALUES, d.splitMode)
  // Migrate the previous single-point custom setting to the new combination mode.
  if (splitMode === 'at') splitMode = 'custom'
  const splitTriggers = Array.isArray(s.splitTriggers) ? [...new Set(s.splitTriggers.filter(value => SPLIT_CUSTOM_TRIGGERS.some(option => option.value === value)))] : []
  const splitLevels = Array.isArray(s.splitLevels)
    ? [...new Set(s.splitLevels.map(Number).filter(value => SPLIT_CUSTOM_LEVELS.some(option => option.value === value)))].sort((a, b) => a - b)
    : [...d.splitLevels]
  if (!splitTriggers.length && s.splitAt && s.splitAt !== 'heading') {
    if (SPLIT_CUSTOM_TRIGGERS.some(option => option.value === s.splitAt)) splitTriggers.push(s.splitAt)
  }
  if (!Array.isArray(s.splitLevels) && s.splitAt === 'heading') splitLevels.splice(0, splitLevels.length, Number(s.splitLevel) || d.splitLevel)
  if (s.splitRules === true) {
    if (!splitTriggers.includes('rule')) splitTriggers.push('rule')
    if (!s.splitAt) splitMode = 'custom'
  }
  return {
    splitMode,
    splitModeExplicit,
    splitLevel: pick(Number(s.splitLevel), SPLIT_LEVELS.map(level => level.value), d.splitLevel),
    splitLevels,
    splitTriggers,
    splitTargetWords: pick(Number(s.splitTargetWords), SPLIT_TARGETS.map(target => target.value), d.splitTargetWords),
    zoom: s.zoom === 'last' || s.zoom == null ? 'last' : clampZoom(s.zoom),
    theme: typeof s.theme === 'string' ? s.theme : d.theme,
    showContents: s.showContents === true,
    showProgress: s.showProgress !== false,
    showTimer: s.showTimer === true,
    autoAdvance: pick(Number(s.autoAdvance), AUTO_ADVANCE_SECONDS, d.autoAdvance),
    penMode: pick(s.penMode, ['fade', 'permanent'], d.penMode),
    penColor: pick(s.penColor, colorIds, d.penColor),
    penWidth: pick(Number(s.penWidth), PEN_WIDTHS.map(width => width.value), d.penWidth),
    fadeSeconds: pick(Number(s.fadeSeconds), FADE_SECONDS, d.fadeSeconds),
    laserColor: pick(s.laserColor, colorIds, d.laserColor),
  }
}

export function loadPresentationSettings() {
  try { return normalizePresentationSettings(JSON.parse(localStorage.getItem(PRESENTATION_SETTINGS_KEY) || '{}')) } catch { return { ...DEFAULT_PRESENTATION_SETTINGS } }
}
export function savePresentationSettings(settings) {
  try { localStorage.setItem(PRESENTATION_SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage is optional */ }
}
export const inkColor = id => (INK_COLORS.find(color => color.id === id) ?? INK_COLORS[0]).value
export const splitOptions = settings => ({ mode: settings.splitMode, level: settings.splitLevel, splitLevels: settings.splitLevels, splitTriggers: settings.splitTriggers, targetWords: settings.splitTargetWords })
