// Show only one kind of content in the rendered page (headings, tables, code…).
// Works on the rendered DOM: blocks that don't match get `data-filter-hidden`.

export const CONTENT_FILTERS = [
  { id: 'headings', label: 'All headings' },
  { id: 'h1', label: 'H1 headings' },
  { id: 'h2', label: 'H2 headings' },
  { id: 'h3', label: 'H3 headings' },
  { id: 'tables', label: 'Tables' },
  { id: 'code', label: 'Code blocks & diagrams' },
  { id: 'lists', label: 'Lists' },
  { id: 'tasks', label: 'Task lists' },
  { id: 'quotes', label: 'Quotes & callouts' },
  { id: 'images', label: 'Images' },
  { id: 'links', label: 'Paragraphs with links' },
]
export const filterLabel = id => CONTENT_FILTERS.find(item => item.id === id)?.label ?? ''

const HEADING = /^H[1-6]$/
const isContentSection = el => el.tagName === 'SECTION' && el.hasAttribute('data-section-key')
const UI_ONLY = '.section-summary, .heading-tools'

const MATCHERS = {
  tables: el => el.matches('table') || Boolean(el.querySelector('table')),
  code: el => el.matches('.code-wrapper, pre') || Boolean(el.querySelector('.code-wrapper, pre')),
  lists: el => el.matches('ul, ol'),
  tasks: el => el.matches('ul, ol') && Boolean(el.querySelector('input[type="checkbox"]')),
  quotes: el => el.matches('blockquote, .callout'),
  images: el => el.matches('img, .md-figure') || Boolean(el.querySelector('img')),
  links: el => !HEADING.test(el.tagName) && Boolean(el.querySelector('a[href]:not(.heading-anchor)')),
}

/** Content blocks: children of the page and of every heading section (sections themselves excluded). */
function blocksOf(root) {
  const blocks = []
  const walk = parent => {
    for (const child of parent.children) {
      if (isContentSection(child)) walk(child)
      else if (!child.matches(UI_ONLY)) blocks.push(child)
    }
  }
  walk(root)
  return blocks
}

export function clearContentFilter(root) {
  root?.querySelectorAll('[data-filter-hidden], [data-filter-match]').forEach(el => {
    el.removeAttribute('data-filter-hidden')
    el.removeAttribute('data-filter-match')
  })
}

/** Applies `filter` to the rendered page under `root`; returns how many blocks match. */
export function applyContentFilter(root, filter) {
  clearContentFilter(root)
  if (!root || !filter) return 0
  const blocks = blocksOf(root)
  let count = 0
  const headingLevel = filter === 'headings' ? 0 : /^h([1-6])$/.exec(filter)?.[1]
  if (headingLevel !== undefined) {
    for (const block of blocks) {
      const match = HEADING.test(block.tagName) && (!Number(headingLevel) || block.tagName === `H${headingLevel}`)
      if (match) { block.setAttribute('data-filter-match', ''); count += 1 } else block.setAttribute('data-filter-hidden', '')
    }
  } else {
    const matches = MATCHERS[filter] ?? (() => false)
    for (const block of blocks) {
      if (!HEADING.test(block.tagName) && matches(block)) { block.setAttribute('data-filter-match', ''); count += 1 }
    }
    // Keep the headings of sections that contain a match, for context.
    for (const block of blocks) {
      if (block.hasAttribute('data-filter-match')) continue
      const section = HEADING.test(block.tagName) && block.parentElement && isContentSection(block.parentElement) ? block.parentElement : null
      if (!section || !section.querySelector('[data-filter-match]')) block.setAttribute('data-filter-hidden', '')
    }
  }
  // Sections with nothing left to show disappear entirely (no empty gaps).
  root.querySelectorAll('section[data-section-key]').forEach(section => {
    if (!section.querySelector('[data-filter-match]')) section.setAttribute('data-filter-hidden', '')
  })
  return count
}
