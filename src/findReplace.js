// Search helpers for the editor's find & replace.

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Builds the search RegExp for the current options; returns { regex } or { error }. */
export function buildSearchRegex(query, { matchCase = false, wholeWord = false, regex = false } = {}) {
  if (!query) return { regex: null }
  try {
    let source = regex ? query : escapeRegExp(query)
    if (wholeWord) source = `\\b(?:${source})\\b`
    const compiled = new RegExp(source, `g${matchCase ? '' : 'i'}m`)
    // Patterns that can match empty text (e.g. "a*") would never advance.
    if (new RegExp(source, matchCase ? 'm' : 'im').test('')) return { error: 'Pattern matches empty text' }
    return { regex: compiled }
  } catch (error) {
    return { error: String(error.message || error).replace(/^Invalid regular expression: /, '') }
  }
}

export function findMatches(text, regex, limit = 5000) {
  if (!regex) return []
  const matches = []
  const re = new RegExp(regex.source, regex.flags)
  let match
  while ((match = re.exec(text)) && matches.length < limit) {
    if (match[0] === '') { re.lastIndex += 1; continue }
    matches.push({ from: match.index, to: match.index + match[0].length, text: match[0], groups: match })
  }
  return matches
}

/** Replacement text for one match: regex mode expands $1 / $<name> / $$, plain mode is literal. */
export function replacementFor(match, replacement, useRegex) {
  if (!useRegex) return replacement
  return replacement.replace(/\$(\d+|<[^>]+>|\$|&)/g, (_whole, key) => {
    if (key === '$') return '$'
    if (key === '&') return match.text
    if (key.startsWith('<')) return match.groups.groups?.[key.slice(1, -1)] ?? ''
    return match.groups[Number(key)] ?? ''
  })
}

export function replaceAllIn(text, regex, replacement, useRegex) {
  const matches = findMatches(text, regex, Infinity)
  if (!matches.length) return { text, count: 0 }
  let out = ''
  let last = 0
  for (const match of matches) {
    out += text.slice(last, match.from) + replacementFor(match, replacement, useRegex)
    last = match.to
  }
  return { text: out + text.slice(last), count: matches.length }
}
