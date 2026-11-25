// Platform-aware keyboard shortcut labels (⌘ on Apple devices, Ctrl elsewhere).
const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '')

export const MOD = isApple ? '⌘' : 'Ctrl'
export const ALT = isApple ? '⌥' : 'Alt'
export const SHIFT = isApple ? '⇧' : 'Shift'

/** shortcut('K') → "⌘K" / "Ctrl+K"; shortcut('T', { shift: true }) → "⇧⌘T" / "Ctrl+Shift+T" */
export function shortcut(key, { shift = false, alt = false, mod = true } = {}) {
  if (isApple) return `${alt ? ALT : ''}${shift ? SHIFT : ''}${mod ? MOD : ''}${key}`
  return [mod && 'Ctrl', alt && 'Alt', shift && 'Shift', key].filter(Boolean).join('+')
}
