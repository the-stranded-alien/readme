/** Colour themes. `extra` themes appear only when "Additional themes" is on in Settings. */
export const THEMES = [
  { id: 'light', label: 'Light', dark: false, swatch: ['#ffffff', '#6d28d9'] },
  { id: 'dark', label: 'Dark', dark: true, swatch: ['#1b1c2e', '#a78bfa'] },
  { id: 'sepia', label: 'Sepia', dark: false, swatch: ['#f5ecdb', '#9a5212'] },
  // Neon family: all share the `theme-neon` base and add their own colours.
  { id: 'neon', label: 'Neon Pink', dark: true, extra: true, classes: ['theme-neon'], swatch: ['#0b0a16', '#ff2bd6'] },
  { id: 'neon-blue', label: 'Neon Blue', dark: true, extra: true, classes: ['theme-neon', 'theme-neon-blue'], swatch: ['#060b18', '#22d3ee'] },
  { id: 'neon-green', label: 'Neon Green', dark: true, extra: true, classes: ['theme-neon', 'theme-neon-green'], swatch: ['#050f08', '#39ff14'] },
  { id: 'neon-purple', label: 'Neon Purple', dark: true, extra: true, classes: ['theme-neon', 'theme-neon-purple'], swatch: ['#0c0617', '#b026ff'] },
  { id: 'neon-rainbow', label: 'Neon Rainbow', dark: true, extra: true, classes: ['theme-neon', 'theme-neon-rainbow'], swatch: ['#08070f', 'linear-gradient(90deg, #ff2bd6, #ffe600, #39ff14, #00e5ff, #b026ff)'] },
  { id: 'ocean', label: 'Ocean', dark: true, extra: true, swatch: ['#0f2130', '#38bdf8'] },
  { id: 'forest', label: 'Forest', dark: false, extra: true, swatch: ['#f2f7f1', '#2f7d4f'] },
  { id: 'sun', label: 'Sun', dark: false, extra: true, swatch: ['#fffaf0', 'linear-gradient(90deg, #f59e0b, #ea580c)'] },
  { id: 'monokai', label: 'Monokai', dark: true, extra: true, swatch: ['#272822', 'linear-gradient(90deg, #f92672, #a6e22e, #66d9ef)'] },
  { id: 'nord', label: 'Nord', dark: true, extra: true, swatch: ['#2e3440', '#88c0d0'] },
  { id: 'solarized', label: 'Solarized', dark: false, extra: true, swatch: ['#fdf6e3', '#268bd2'] },
]
export const THEME_IDS = THEMES.map(theme => theme.id)
/** Classes a theme puts on <html> (besides `dark`), and every such class any theme uses. */
export const themeClasses = theme => theme.classes ?? (theme.extra ? [`theme-${theme.id}`] : [])
export const ALL_THEME_CLASSES = [...new Set(THEMES.flatMap(themeClasses))]
export const themeById = id => THEMES.find(theme => theme.id === id) ?? THEMES[0]
export const availableThemes = extraThemes => THEMES.filter(theme => extraThemes || !theme.extra)
export const nextTheme = (current, extraThemes) => {
  const list = availableThemes(extraThemes)
  const index = list.findIndex(theme => theme.id === current)
  return list[(index + 1) % list.length].id
}
