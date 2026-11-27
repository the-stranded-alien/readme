// Document styles: one design per document (front matter "style: academic"), applied the same
// way to the preview, HTML / website exports (CSS below), PDF, Word and slides (values below).
// "readme" is the app's own look and needs no extra rules.

const A = 'var(--accent, #6d28d9)'
const TEXT = 'var(--text-1, inherit)'
const MUTED = 'var(--text-3, #5b6178)'
const RULE = 'var(--border, rgba(127,127,127,.35))'

export const DOC_STYLES = [
  {
    id: 'readme', label: 'ReadMe', description: 'The app’s own look: clean sans, accent touches.',
    font: "'Inter', system-ui, sans-serif", headingFont: "'Inter', system-ui, sans-serif",
    pdf: { font: 'Roboto', heading: 'Roboto', headingColor: '#14172b', accent: '#6d28d9', table: 'grid', rule: true },
    docx: { body: 'Calibri', heading: 'Calibri', headingColor: '14172B', accent: '6D28D9' },
  },
  {
    id: 'classic', label: 'Classic', description: 'Book serif, centred title, quiet rules.',
    font: "'Lora', Georgia, serif", headingFont: "'Lora', Georgia, serif",
    pdf: { font: 'Times', heading: 'Times', headingColor: '#1b1b1b', accent: '#7a4b1e', table: 'lines', rule: true, centerTitle: true },
    docx: { body: 'Georgia', heading: 'Georgia', headingColor: '1B1B1B', accent: '7A4B1E', centerTitle: true },
  },
  {
    id: 'modern', label: 'Modern', description: 'Bold headings, accent bars, striped tables.',
    font: "'Inter', system-ui, sans-serif", headingFont: "'Inter', system-ui, sans-serif",
    pdf: { font: 'Roboto', heading: 'Roboto', headingColor: '#0f172a', accent: '#4f46e5', table: 'striped', bar: true, accentH3: true },
    docx: { body: 'Segoe UI', heading: 'Segoe UI Semibold', headingColor: '0F172A', accent: '4F46E5' },
  },
  {
    id: 'academic', label: 'Academic', description: 'Serif, justified text, numbered sections.',
    font: "'Source Serif 4', Georgia, serif", headingFont: "'Source Serif 4', Georgia, serif",
    pdf: { font: 'Times', heading: 'Times', headingColor: '#111111', accent: '#1f3a68', table: 'booktabs', numbered: true, justify: true, centerTitle: true },
    docx: { body: 'Cambria', heading: 'Cambria', headingColor: '111111', accent: '1F3A68', numbered: true, justify: true, centerTitle: true },
  },
  {
    id: 'notebook', label: 'Notebook', description: 'Friendly sans, highlighted headings, dashed lines.',
    font: "'IBM Plex Sans', system-ui, sans-serif", headingFont: "'IBM Plex Sans', system-ui, sans-serif",
    pdf: { font: 'Roboto', heading: 'Roboto', headingColor: '#1f2937', accent: '#0f766e', table: 'grid', dashed: true },
    docx: { body: 'Segoe UI', heading: 'Segoe UI', headingColor: '1F2937', accent: '0F766E' },
  },
  {
    id: 'minimal', label: 'Minimal', description: 'Light and airy: small headings, few lines.',
    font: "'Inter', system-ui, sans-serif", headingFont: "'Inter', system-ui, sans-serif",
    pdf: { font: 'Roboto', heading: 'Roboto', headingColor: '#27272a', accent: '#52525b', table: 'lines', minimal: true },
    docx: { body: 'Calibri Light', heading: 'Calibri', headingColor: '27272A', accent: '52525B' },
  },
]
export const DOC_STYLE_IDS = DOC_STYLES.map(style => style.id)
export const docStyleById = id => DOC_STYLES.find(style => style.id === id) ?? DOC_STYLES[0]

/** The style a document asks for (front matter "style:"), else the default. */
export function documentStyleId(content, fallback = 'readme') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(content ?? ''))
  const value = match && /^style\s*:\s*["']?([a-z-]+)["']?\s*$/im.exec(match[1])?.[1]?.toLowerCase()
  return DOC_STYLE_IDS.includes(value) ? value : (DOC_STYLE_IDS.includes(fallback) ? fallback : 'readme')
}

const RULES = {
  classic: S => `
${S} { font-family: 'Lora', Georgia, serif; }
${S} h1, ${S} h2, ${S} h3, ${S} h4 { font-family: 'Lora', Georgia, serif; letter-spacing: 0; }
${S} h1 { text-align: center; font-weight: 600; background: none; -webkit-text-fill-color: currentColor; color: ${TEXT}; border-bottom: 0; padding-bottom: 0; }
${S} h1::after { content: ''; display: block; width: 64px; height: 2px; margin: 16px auto 0; background: currentColor; opacity: .3; }
${S} h2 { display: block; font-weight: 600; border-bottom: 1px solid ${RULE}; padding-bottom: .3em; }
${S} h2::before { display: none; }
${S} blockquote { font-style: italic; background: none; border: 0; border-left: 3px solid ${RULE}; border-radius: 0; box-shadow: none; }
${S} table { border-collapse: collapse; box-shadow: none; border-radius: 0; border-top: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; }
${S} thead tr { background: none; }
${S} th { text-transform: none; letter-spacing: 0; font-size: .9rem; color: ${TEXT}; border-bottom: 1px solid currentColor; background: var(--bg-preview, transparent); }
${S} td { border-bottom: 1px solid ${RULE}; }`,
  modern: S => `
${S} { font-family: 'Inter', system-ui, sans-serif; }
${S} h1, ${S} h2, ${S} h3 { font-family: 'Inter', system-ui, sans-serif; font-weight: 800; letter-spacing: -.03em; }
${S} h1 { font-size: 2.45rem; border-bottom: 0; padding-bottom: 0; }
${S} h2 { font-size: 1.45rem; }
${S} h2::before { width: 5px; height: 1.15em; border-radius: 3px; background: ${A}; }
${S} h3 { color: ${A}; }
${S} table { border-radius: 14px; }
${S} thead tr { background: ${A}; }
${S} th { color: var(--bg-preview, #fff); border-bottom: 0; background: ${A}; }
${S} tbody tr:nth-child(even) td { background: color-mix(in srgb, ${A} 6%, transparent); }
${S} blockquote { border-radius: 12px; border-left-width: 5px; }`,
  academic: S => `
${S} { font-family: 'Source Serif 4', Georgia, serif; counter-reset: ds-h2; }
${S} h1, ${S} h2, ${S} h3, ${S} h4 { font-family: 'Source Serif 4', Georgia, serif; letter-spacing: 0; color: ${TEXT}; }
${S} p, ${S} li { text-align: justify; hyphens: auto; }
${S} h1 { text-align: center; font-weight: 600; background: none; -webkit-text-fill-color: currentColor; border-bottom: 0; padding-bottom: 0; }
${S} h2 { display: block; font-weight: 600; font-variant: small-caps; letter-spacing: .03em; counter-increment: ds-h2; counter-reset: ds-h3; }
${S} h2::before { content: counter(ds-h2) ".\\00a0\\00a0"; display: inline; width: auto; height: auto; background: none; font-variant: normal; }
${S} h3 { font-style: italic; font-weight: 600; counter-increment: ds-h3; }
${S} h3::before { content: counter(ds-h2) "." counter(ds-h3) "\\00a0\\00a0"; font-style: normal; }
${S} blockquote { background: none; border: 0; border-radius: 0; box-shadow: none; margin-inline: 2em; font-size: .95em; }
${S} table { border-collapse: collapse; box-shadow: none; border-radius: 0; border-top: 2px solid currentColor; border-bottom: 2px solid currentColor; }
${S} thead tr { background: none; }
${S} th { text-transform: none; letter-spacing: 0; font-size: .9rem; color: ${TEXT}; border-bottom: 1px solid currentColor; background: var(--bg-preview, transparent); }
${S} td { border-bottom: 0; }`,
  notebook: S => `
${S} { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
${S} h1, ${S} h2, ${S} h3 { font-family: 'IBM Plex Sans', system-ui, sans-serif; font-weight: 700; letter-spacing: -.01em; }
${S} h1 { width: fit-content; max-width: 100%; color: ${TEXT}; -webkit-text-fill-color: currentColor; border-bottom: 0; padding: 0 .15em; background: linear-gradient(transparent 58%, color-mix(in srgb, ${A} 30%, transparent) 58%); }
${S} h2 { display: block; border-bottom: 2px dashed color-mix(in srgb, ${A} 55%, transparent); padding-bottom: .25em; }
${S} h2::before { display: none; }
${S} hr { border: 0; border-top: 2px dashed ${RULE}; background: none; }
${S} blockquote { border: 0; border-left: 4px dotted ${A}; border-radius: 0; box-shadow: none; }
${S} table { border-collapse: collapse; box-shadow: none; border-radius: 0; }
${S} th, ${S} td { border: 1px dashed ${RULE}; }
${S} th { background: color-mix(in srgb, ${A} 10%, var(--bg-preview, #fff)); }`,
  minimal: S => `
${S} { font-family: 'Inter', system-ui, sans-serif; --rm-line-height: 1.95; }
${S} h1, ${S} h2, ${S} h3 { font-family: 'Inter', system-ui, sans-serif; letter-spacing: -.01em; color: ${TEXT}; }
${S} h1 { font-weight: 600; font-size: 1.9rem; background: none; -webkit-text-fill-color: currentColor; border-bottom: 0; padding-bottom: 0; }
${S} h2 { display: block; font-weight: 600; font-size: 1.2rem; margin-top: 2.8rem; }
${S} h2::before { display: none; }
${S} h3 { font-size: .85rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: ${MUTED}; }
${S} blockquote { background: none; border: 0; border-left: 2px solid ${RULE}; border-radius: 0; box-shadow: none; }
${S} table { border-collapse: collapse; box-shadow: none; border-radius: 0; }
${S} thead tr { background: none; }
${S} th { border-bottom: 1px solid ${RULE}; background: var(--bg-preview, transparent); }
${S} tbody tr:hover td { background: none; }`,
}

// Every style: the heading's link / tools don't take space (centred and highlighted titles fit their text).
const SHARED = S => `
${S} h1 { position: relative; }
${S} h1 > .heading-anchor, ${S} h1 > .heading-tools { position: absolute; left: 100%; top: 50%; transform: translateY(-50%); margin-left: 6px; white-space: nowrap; }
${S} tbody tr:nth-child(even) td { background: none; }
${S} th, ${S} td { border-left: 0; border-right: 0; }`

/** CSS for every style; scope(id) returns the selector of a styled document root. */
export function docStyleCss(scope = id => `.rm-prose[data-doc-style="${id}"]`) {
  return Object.entries(RULES).map(([id, rules]) => SHARED(scope(id)) + rules(scope(id))).join('\n')
}
