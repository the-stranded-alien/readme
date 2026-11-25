/** Colour themes. `extra` themes appear only when "Additional themes" is on in Settings. */
export const THEMES = [
  { id: 'light', label: 'Light', dark: false, swatch: ['#ffffff', '#6d28d9'] },
  { id: 'dark', label: 'Dark', dark: true, swatch: ['#1b1c2e', '#a78bfa'] },
  { id: 'sepia', label: 'Sepia', dark: false, swatch: ['#f5ecdb', '#9a5212'] },
  { id: 'neon', label: 'Neon', dark: true, extra: true, swatch: ['#0b0a16', '#ff2bd6'] },
  { id: 'ocean', label: 'Ocean', dark: true, extra: true, swatch: ['#0f2130', '#38bdf8'] },
  { id: 'forest', label: 'Forest', dark: false, extra: true, swatch: ['#f2f7f1', '#2f7d4f'] },
]
export const THEME_IDS = THEMES.map(theme => theme.id)
export const themeById = id => THEMES.find(theme => theme.id === id) ?? THEMES[0]
export const availableThemes = extraThemes => THEMES.filter(theme => extraThemes || !theme.extra)
export const nextTheme = (current, extraThemes) => {
  const list = availableThemes(extraThemes)
  const index = list.findIndex(theme => theme.id === current)
  return list[(index + 1) % list.length].id
}
