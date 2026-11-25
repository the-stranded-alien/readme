// Helpers for the standalone HTML export: embed the reading font as data URLs
// so the file renders the same offline, plus shared print-ready CSS.

const readAsDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

/**
 * Returns @font-face rules (latin + latin-ext subsets) for the first family in
 * `familyStack`, with the font files inlined. Resolves to '' when the font is
 * not a loaded Google Font or the network is unavailable.
 */
export async function embeddedFontCss(familyStack) {
  const family = (familyStack || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  const link = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]')
  if (!family || !link) return ''
  try {
    const css = await withTimeout(fetch(link.href).then(response => (response.ok ? response.text() : '')), 6000)
    const blocks = Array.from(css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g))
      .filter(([, subset, rule]) => /^latin(-ext)?$/.test(subset) && new RegExp(`font-family:\\s*['"]${family}['"]`).test(rule))
      .map(([, , rule]) => rule)
    // Variable fonts are served once per requested weight with the same file:
    // merge those rules into one with a weight range so each file is embedded once.
    const byFile = new Map()
    for (const rule of blocks) {
      const url = /url\(([^)]+)\)/.exec(rule)?.[1]?.replace(/^['"]|['"]$/g, '')
      if (!url) continue
      const style = /font-style:\s*(\w+)/.exec(rule)?.[1] || 'normal'
      const weight = Number(/font-weight:\s*(\d+)/.exec(rule)?.[1] || 400)
      const key = `${url}|${style}`
      const entry = byFile.get(key) ?? { url, rule, min: weight, max: weight }
      entry.min = Math.min(entry.min, weight)
      entry.max = Math.max(entry.max, weight)
      byFile.set(key, entry)
    }
    const inlined = await withTimeout(Promise.all(Array.from(byFile.values()).map(async ({ url, rule, min, max }) => {
      const blob = await fetch(url).then(response => response.blob())
      return rule
        .replace(/font-weight:\s*\d+/, `font-weight: ${min === max ? min : `${min} ${max}`}`)
        .replace(/url\([^)]+\)/, `url(${await readAsDataUrl(blob)})`)
    })), 15000)
    return inlined.join('\n')
  } catch {
    return ''
  }
}

export const EXPORT_EXTRA_CSS = `
  .md-figure { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 1.4rem 0; }
  .md-figcaption { font-size: .85em; font-style: italic; opacity: .75; text-align: center; }
  .callout { margin: 1.4rem 0; padding: .8rem 1rem; border-left: 4px solid var(--callout, #0969da); border-radius: 4px 10px 10px 4px; background: color-mix(in srgb, var(--callout, #0969da) 8%, transparent); }
  .callout-title { display: flex; align-items: center; gap: .45rem; font-weight: 650; color: var(--callout, #0969da); margin-bottom: .3rem; }
  .callout-body > :first-child { margin-top: 0; } .callout-body > :last-child { margin-bottom: 0; }
  .callout-note { --callout: #0969da; } .callout-tip { --callout: #1a7f37; } .callout-important { --callout: #8250df; }
  .callout-warning { --callout: #b7791f; } .callout-caution { --callout: #cf222e; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @page { margin: 18mm; }
  @media print {
    body { background: #fff !important; padding: 0 !important; }
    .page { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; background: #fff !important; }
    a { color: inherit; }
    h1, h2, h3, h4 { break-after: avoid; }
    pre, table, img, blockquote, .callout, .md-figure { break-inside: avoid; }
  }
`
