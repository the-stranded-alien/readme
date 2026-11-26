// ── Markdown templates & YAML frontmatter parser ───────────────

// A small inline image for the Markdown Guide (works offline).
const GUIDE_IMAGE = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs><rect width="320" height="160" rx="18" fill="url(#g)"/><rect x="132" y="38" width="56" height="84" rx="8" fill="#fff"/><rect x="144" y="56" width="32" height="5" rx="2.5" fill="#7c3aed"/><rect x="144" y="70" width="26" height="5" rx="2.5" fill="#c4b5fd"/><rect x="144" y="84" width="30" height="5" rx="2.5" fill="#c4b5fd"/><rect x="144" y="98" width="20" height="5" rx="2.5" fill="#c4b5fd"/></svg>')}`

export const MD_TEMPLATES = [
  {
    id: 'readme',
    name: 'Project README',
    fileName: 'README.md',
    description: 'Overview, features, installation, usage & license',
    content: `---
title: Project Name
version: 1.0.0
license: MIT
tags: [documentation, open-source]
---

# Project Name

> A concise one-line description of what this project does and why it exists.

## Features

- Fast, zero-config setup
- Clean, modular architecture
- Full TypeScript / Markdown support

## Architecture

\`\`\`mermaid
flowchart LR
  Client[Browser Client] --> Parser[Markdown Parser]
  Parser --> Reader[Folio Reader]
  Parser --> Export[PDF / HTML / ZIP]
\`\`\`

## Installation

\`\`\`bash
npm install your-package
\`\`\`

## Usage

\`\`\`javascript
import { render } from 'your-package'

const result = render('# Hello World')
console.log(result)
\`\`\`

## License

MIT © Your Name
`,
  },
  {
    id: 'changelog',
    name: 'Changelog',
    fileName: 'CHANGELOG.md',
    description: 'Keep a Changelog format with version sections',
    content: `---
title: Changelog
format: Keep a Changelog
---

# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Multi-file browser workspace with tab switching
- Mermaid diagrams and KaTeX math rendering

### Changed
- Improved long-form reading typography and paper tones

## [1.0.0] - 2026-01-15

### Added
- Initial public release
- Live split-pane Markdown editor and preview
`,
  },
  {
    id: 'api-docs',
    name: 'API Reference',
    fileName: 'API.md',
    description: 'Endpoints, parameters, responses & math formulas',
    content: `---
title: API Reference
status: Stable
version: v2
---

# API Reference

## Authentication

Pass your bearer token in the \`Authorization\` header:

\`\`\`http
Authorization: Bearer <token>
\`\`\`

## Endpoints

### \`GET /v2/documents\`

Returns a paginated list of documents.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| \`limit\` | \`number\` | \`20\` | Max items per page |
| \`offset\` | \`number\` | \`0\` | Pagination offset |

### Rate Limit Formula

Requests replenish continuously according to:

$$
R(t) = \\min\\left(C,\\; R_0 + r \\cdot t\\right)
$$

where $C$ is bucket capacity and $r$ is the refill rate per second.
`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    fileName: 'meeting-notes.md',
    description: 'Agenda, discussion points & action items',
    content: `---
title: Weekly Engineering Sync
date: ${new Date().toISOString().slice(0, 10)}
tags: [notes, planning]
---

# Weekly Engineering Sync

## Agenda

1. Release readiness check
2. Performance & accessibility review
3. Next sprint priorities

## Key Decisions

- Ship multi-file tab switcher and command palette in this milestone
- Keep all document storage strictly client-side in browser memory

## Action Items

- [x] Finalize reader comfort presets
- [ ] Run cross-browser PDF export smoke test
- [ ] Update onboarding sample document
`,
  },
  {
    id: 'markdown-guide',
    name: 'Markdown Guide',
    fileName: 'Markdown-Guide.md',
    description: 'Every Markdown feature ReadMe supports, with examples to copy',
    content: `---
title: Markdown Guide
description: Everything ReadMe can render, with the Markdown to write it
tags: [markdown, tutorial, reference]
---

# Markdown Guide

This page shows **everything ReadMe can display**. Each section has the Markdown to type (in a grey code block) followed by the result. Copy any example into your own file.

> [!TIP]
> Open this file in **Split** view to see the Markdown and the result side by side. In the editor, type \`/\` at the start of a line for a menu of blocks.

---

## 1. Frontmatter

Optional settings at the very top of a file, between two \`---\` lines. ReadMe shows them as small tags above the page.

\`\`\`markdown
---
title: My document
tags: [notes, ideas]
---
\`\`\`

## 2. Headings

Start a line with one to six \`#\` signs, then a space. Headings build the **Contents** sidebar and start new slides in Present.

\`\`\`markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
\`\`\`

### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## 3. Paragraphs and line breaks

Leave a blank line between paragraphs. A single line break inside a paragraph is kept as a new line.

\`\`\`markdown
First paragraph,
still the first paragraph on a new line.

Second paragraph.
\`\`\`

First paragraph,
still the first paragraph on a new line.

Second paragraph.

## 4. Text styles

\`\`\`markdown
**Bold**, *italic*, ***bold and italic***, ~~strikethrough~~
\`Inline code\`, ==highlight== and =={green}a green highlight==
Unicode works everywhere: H₂O, x², →, ✓
\`\`\`

**Bold**, *italic*, ***bold and italic***, ~~strikethrough~~
\`Inline code\`, ==highlight== and =={green}a green highlight==
Unicode works everywhere: H₂O, x², →, ✓

Highlight colours: =={yellow}yellow==, =={green}green==, =={blue}blue==, =={pink}pink==, =={purple}purple==, =={orange}orange==.

## 5. Links

\`\`\`markdown
[Inline link](https://www.markdownguide.org)
[Link with a hover title](https://www.markdownguide.org "Markdown Guide")
[Reference link][docs]
Automatic link: https://github.com
[Jump to a heading in this file](#8-tables)

[docs]: https://commonmark.org
\`\`\`

[Inline link](https://www.markdownguide.org)
[Link with a hover title](https://www.markdownguide.org "Markdown Guide")
[Reference link][docs]
Automatic link: https://github.com
[Jump to a heading in this file](#8-tables)

[docs]: https://commonmark.org

> [!NOTE]
> To link to another file in ReadMe, drag the file from the Files panel into the editor.

## 6. Images

An image on its own line becomes a figure, captioned with its alt text (the words in square brackets). The optional title in quotes shows on hover. Paste or drop an image into the editor to add one.

\`\`\`markdown
![Alt text, shown as the caption](path/to/image.png "Shown on hover")

Inline: some text ![icon](path/to/icon.png) more text.
\`\`\`

![A figure: this alt text is its caption](${GUIDE_IMAGE} "The title shows on hover")

## 7. Lists

### Bulleted

\`\`\`markdown
- Apples
- Oranges
  - Blood oranges (indent two spaces to nest)
  - Navel oranges
- Pears
\`\`\`

- Apples
- Oranges
  - Blood oranges (indent two spaces to nest)
  - Navel oranges
- Pears

### Numbered

\`\`\`markdown
1. First
2. Second
   1. Nested step
3. Third

7. A list can start at any number
8. Like this one
\`\`\`

1. First
2. Second
   1. Nested step
3. Third

7. A list can start at any number
8. Like this one

### Task list

\`\`\`markdown
- [x] Done
- [ ] Still to do
\`\`\`

- [x] Done
- [ ] Still to do

## 8. Tables

Use \`|\` between columns and a line of \`---\` under the header. Colons set the alignment. The Format tables button in the editor lines the columns up for you.

\`\`\`markdown
| Left aligned | Centered | Right aligned |
| :----------- | :------: | ------------: |
| Apples       |    3     |         $1.20 |
| Oranges      |    12    |        $4.80 |
\`\`\`

| Left aligned | Centered | Right aligned |
| :----------- | :------: | ------------: |
| Apples       |    3     |         $1.20 |
| Oranges      |    12    |        $4.80 |

## 9. Quotes

\`\`\`markdown
> A quote can span
> several lines.
>
> > And quotes can be nested.
\`\`\`

> A quote can span
> several lines.
>
> > And quotes can be nested.

## 10. Callouts

A quote that starts with \`[!TYPE]\` becomes a coloured callout. Add words after the type for your own title.

\`\`\`markdown
> [!NOTE]
> Useful information.

> [!TIP] Pro tip
> A callout with its own title.
\`\`\`

> [!NOTE]
> Useful information that readers should know.

> [!TIP] Pro tip
> A callout with its own title.

> [!IMPORTANT]
> Key information readers need.

> [!WARNING]
> Something that needs attention.

> [!CAUTION]
> Something that could go wrong.

## 11. Code

Wrap code in three backticks and name the language for colours. Every code block has a Copy button.

\`\`\`\`markdown
\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`
}
\`\`\`
\`\`\`\`

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`
}
\`\`\`

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"
\`\`\`

\`\`\`diff
- removed line
+ added line
\`\`\`

## 12. Diagrams (Mermaid)

A code block named \`mermaid\` is drawn as a diagram: flowcharts, sequence diagrams, Gantt charts and more.

\`\`\`\`markdown
\`\`\`mermaid
flowchart LR
  Write --> Preview --> Share
\`\`\`
\`\`\`\`

\`\`\`mermaid
flowchart LR
  Write[Write Markdown] --> Preview[See the preview]
  Preview --> Share[Export or present]
\`\`\`

\`\`\`mermaid
sequenceDiagram
  You->>ReadMe: Type Markdown
  ReadMe-->>You: Live preview
\`\`\`

## 13. Math

Write LaTeX between \`$\` signs for inline maths, or between \`$$\` lines for a block.

\`\`\`markdown
Einstein: $E = mc^2$

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$
\`\`\`

Einstein: $E = mc^2$

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

## 14. Footnotes

\`\`\`markdown
Here is a sentence with a footnote.[^1]

[^1]: The footnote text appears at the bottom of the page.
\`\`\`

Here is a sentence with a footnote.[^1]

[^1]: The footnote text appears at the bottom of the page.

## 15. Horizontal rule

Three or more dashes on their own line (with a blank line above) draw a line across the page.

\`\`\`markdown
---
\`\`\`

---

## 16. Escaping characters

Put a backslash before a character to show it as it is instead of formatting.

\`\`\`markdown
\\*not italic\\*, \\# not a heading, 5 \\* 3
\`\`\`

\\*not italic\\*, \\# not a heading, 5 \\* 3

## 17. Presenting

**Present** turns this file into slides: by default every \`#\` and \`##\` heading starts a new slide (change it in Settings → Presentation). Text under a line containing only \`???\` becomes speaker notes, shown in the presenter view.

\`\`\`markdown
## My slide

What the audience sees.

???
Notes only you see.
\`\`\`
`,
  },
]

/**
 * Parses leading YAML frontmatter (`---\n...\n---`) into structured key/value pairs.
 * Returns `{ meta: Array<{ key, value }>, body: string }`.
 */
export function parseFrontmatter(md) {
  if (!md || !md.startsWith('---')) return { meta: [], body: md || '' }
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return { meta: [], body: md }

  const rawYaml = match[1]
  const body = md.slice(match[0].length)
  const meta = []
  const lines = rawYaml.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) continue
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!kv) continue

    const key = kv[1].trim()
    let val = kv[2].trim()

    // Inline YAML array: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      const items = val
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
      meta.push({ key, value: items })
      continue
    }

    // Multi-line YAML list
    if (!val && i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
      const items = []
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        i += 1
        items.push(lines[i].replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, ''))
      }
      meta.push({ key, value: items })
      continue
    }

    val = val.replace(/^['"]|['"]$/g, '')
    if (val) meta.push({ key, value: val })
  }

  return { meta, body }
}
