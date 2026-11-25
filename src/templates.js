// ── Markdown templates & YAML frontmatter parser ───────────────

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
