import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, looksRich, parseDelimited, rowsToMarkdownTable, webPageToMarkdown } from '../htmlToMarkdown.js'

describe('paste and import as Markdown', () => {
  it('only converts HTML that carries formatting', () => {
    expect(looksRich('<meta charset="utf-8"><div><span style="color:#333">plain code line</span><br><span>another</span></div>')).toBe(false)
    expect(looksRich('<p>one</p><p>two</p>')).toBe(false)
    expect(looksRich('<p>A <strong>bold</strong> word</p>')).toBe(true)
    expect(looksRich('<ul><li>item</li></ul>')).toBe(true)
    expect(looksRich('<b style="font-weight:normal" id="docs-internal-guid-1"><span style="font-weight:700">Bold</span></b>')).toBe(true)
  })

  it('converts Google Docs HTML (outer bold wrapper, styled spans, header-less tables)', () => {
    const html = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><h2><span>Plan</span></h2>'
      + '<p><span style="font-weight:700">Bold</span><span> and </span><span style="font-style:italic">italic</span><span> and </span><span style="text-decoration:line-through">gone</span></p>'
      + '<ul><li><p><span>First</span></p></li><li><p><span>Second</span></p></li></ul>'
      + '<table><tbody><tr><td><p><span>Name</span></p></td><td><p><span>Qty</span></p></td></tr><tr><td><p><span>Apple | red</span></p></td><td><p><span>3</span></p></td></tr></tbody></table></b>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('## Plan')
    expect(md).toContain('**Bold** and *italic* and ~~gone~~')
    expect(md).not.toMatch(/^\*\*.*Plan/m)
    expect(md).toMatch(/^- First$/m)
    expect(md).toContain('| Name | Qty |\n| --- | --- |\n| Apple \\| red | 3 |')
  })

  it('converts Word list paragraphs into nested lists', () => {
    const html = '<p class=MsoListParagraphCxSpFirst style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;</span></span>Fruit</p>'
      + '<p class=MsoListParagraphCxSpMiddle style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">o<span>&nbsp;</span></span>Apple</p>'
      + '<p class=MsoListParagraphCxSpLast style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;</span></span>Veg</p>'
      + '<p class=MsoNormal>After the list<o:p></o:p></p><!--[if !supportLists]--><!--[endif]-->'
    const md = htmlToMarkdown(html)
    expect(md).toMatch(/^- Fruit\n {2,4}- Apple\n- Veg/m)
    expect(md).toContain('After the list')
    expect(md).not.toContain('·')
  })

  it('turns Confluence and GitHub panels into callouts, keeps code languages and task lists', () => {
    const md = htmlToMarkdown(
      '<div data-panel-type="warning"><p>Careful here</p></div>'
      + '<div class="markdown-alert markdown-alert-tip"><p class="markdown-alert-title">Tip</p><p>Use shortcuts</p></div>'
      + '<pre><code class="language-js">const a = 1</code></pre>'
      + '<ul><li><input type="checkbox" checked disabled> Done</li><li><input type="checkbox" disabled> Todo</li></ul>'
      + '<p>See <a href="https://example.com">the site</a> <img src="https://example.com/a.png" alt="Logo"></p>',
    )
    expect(md).toContain('> [!WARNING]\n> Careful here')
    expect(md).toContain('> [!TIP]\n> Use shortcuts')
    expect(md).toContain('```js\nconst a = 1\n```')
    expect(md).toMatch(/- \[x\] Done\n- \[ \] Todo/)
    expect(md).toContain('See [the site](https://example.com) ![Logo](https://example.com/a.png)')
  })

  it('round-trips ReadMe preview HTML (callouts, code without line numbers or buttons)', () => {
    const md = htmlToMarkdown('<div class="callout callout-important" role="note"><div class="callout-title">Heads up</div><div class="callout-body"><p>Read this</p></div></div>'
      + '<div class="code-wrapper" data-language="python"><div class="code-actions"><button>Copy</button></div><pre><code><span class="linenumber">1</span>print("hi")</code></pre></div>')
    expect(md).toContain('> [!IMPORTANT] Heads up\n> Read this')
    expect(md).toContain('```python\nprint("hi")\n```')
    expect(md).not.toContain('Copy')
  })

  it('keeps a web page’s main content and resolves relative links', () => {
    const md = webPageToMarkdown('<html><body><nav><a href="/">Home</a></nav><main><h1>Title</h1><p>Read <a href="docs/guide">the guide</a>.</p></main><footer>© 2026</footer></body></html>', 'https://example.com/blog/post')
    expect(md).toBe('# Title\n\nRead [the guide](https://example.com/blog/docs/guide).')
  })

  it('turns spreadsheet cells (tabs) and CSV into Markdown tables', () => {
    expect(rowsToMarkdownTable(parseDelimited('Name\tQty\nApple\t3\nPear\t5\n'))).toBe('| Name | Qty |\n| --- | --- |\n| Apple | 3 |\n| Pear | 5 |')
    expect(parseDelimited('a,"b, with comma",c\n1,2,3')).toEqual([['a', 'b, with comma', 'c'], ['1', '2', '3']])
    expect(parseDelimited('just one line\twith a tab')).toBeNull()
    expect(parseDelimited('a\tb\nc')).toBeNull()
  })
})

describe('table editor model', async () => {
  const model = await import('../tableModel.js')
  const doc = ['# T', '', '| Name | Qty |', '| :--- | ---: |', '| Pear \\| green | 5 |', '| Apple | 3 |', '', '```', '| not | a table |', '| --- | --- |', '```', '', 'a | b', '--- | ---', '1 | 2'].join('\n')

  it('finds tables outside code fences and reads cells, alignment and escaped pipes', () => {
    const tables = model.findTables(doc)
    expect(tables).toHaveLength(2)
    const first = model.parseTable(doc.slice(tables[0].from, tables[0].to))
    expect(first.align).toEqual(['left', 'right'])
    expect(first.rows).toEqual([['Name', 'Qty'], ['Pear | green', '5'], ['Apple', '3']])
    expect(model.parseTable(doc.slice(tables[1].from, tables[1].to)).rows).toEqual([['a', 'b'], ['1', '2']])
    expect(model.tableAt(doc, doc.indexOf('Apple'))).toEqual(tables[0])
    expect(model.tableAt(doc, doc.indexOf('not'))).toBeNull()
  })

  it('edits the grid and writes a formatted table back', () => {
    let table = model.parseTable('| Name | Qty |\n| :--- | ---: |\n| Pear | 10 |\n| apple | 9 |')
    table = model.sortRows(table, 1, 'asc')
    expect(table.rows.slice(1).map(row => row[0])).toEqual(['apple', 'Pear'])
    table = model.sortRows(table, 0, 'desc')
    expect(table.rows.slice(1).map(row => row[0])).toEqual(['Pear', 'apple'])
    table = model.insertColumn(table, 2)
    table = model.pasteCells(table, 1, 2, [['red | ripe'], ['green']])
    table = model.moveRow(table, 2, -1)
    table = model.setAlign(table, 2, 'center')
    expect(model.tableToMarkdown(table)).toBe([
      '| Name  | Qty |  Column 3   |',
      '| :---- | --: | :---------: |',
      '| apple |   9 |    green    |',
      '| Pear  |  10 | red \\| ripe |',
    ].join('\n'))
    expect(model.deleteColumn(model.emptyTable(1, 1), 0).align).toHaveLength(1)
    expect(model.pasteCells(model.emptyTable(2, 1), 1, 1, [['a', 'b', 'c'], ['d', 'e', 'f']]).rows).toHaveLength(3)
  })
})

describe('wiki links', async () => {
  const wiki = await import('../wikiLinks.js')
  const files = [
    { id: '1', name: 'Home.md', content: 'See [[Plan]], [[notes/Plan#Goals|our goals]] and [[Missing]].\n\n`[[Not a link]]`\n\n```\n[[Also not]]\n```\n[[#Intro]]' },
    { id: '2', name: 'notes/Plan.md', content: '# Plan\n\n## Goals\n\nBack to [[home]].' },
    { id: '3', name: 'archive/Plan.md', content: '# Old plan\n\nLinks to [Home](../Home.md).' },
  ]

  it('parses links outside code and resolves names (same folder first, ignoring case and extension)', () => {
    expect(wiki.parseWikiLinks(files[0].content).map(link => [link.target, link.heading, link.label])).toEqual([
      ['Plan', undefined, undefined], ['notes/Plan', 'Goals', 'our goals'], ['Missing', undefined, undefined], ['', 'Intro', undefined],
    ])
    expect(wiki.resolveWikiTarget('home', 'notes/Plan.md', files)?.name).toBe('Home.md')
    expect(wiki.resolveWikiTarget('Plan', 'archive/x.md', files)?.name).toBe('archive/Plan.md')
    expect(wiki.resolveWikiTarget('Plan.md', 'Home.md', files)?.name).toBe('notes/Plan.md')
    expect(wiki.resolveWikiTarget('Nope', 'Home.md', files)).toBeNull()
  })

  it('turns wiki links into relative links for exports', () => {
    expect(wiki.wikiLinksToMarkdown(files[0].content, 'Home.md', files).split('\n')[0])
      .toBe('See [Plan](notes/Plan.md), [our goals](notes/Plan.md#goals) and Missing.')
    expect(wiki.wikiLinksToMarkdown('[[#Intro]]', 'Home.md', files)).toBe('[Intro](#intro)')
  })

  it('finds backlinks from wiki links and Markdown links', () => {
    const back = wiki.findBacklinks(files[0], files)
    expect(back.map(item => item.file.name)).toEqual(['notes/Plan.md', 'archive/Plan.md'])
    expect(back[0].snippet).toBe('Back to home.')
  })

  it('rewrites links when a file is renamed', () => {
    const changes = wiki.renameWikiLinks(files, 'notes/Plan.md', 'notes/Roadmap.md')
    expect(changes).toHaveLength(1)
    expect(changes[0].content.split('\n')[0]).toBe('See [[Roadmap]], [[Roadmap#Goals|our goals]] and [[Missing]].')
  })

  it('detects a link being typed', () => {
    expect(wiki.detectWikiLink('text [[No', 9)).toEqual({ from: 5, query: 'No', file: 'No', heading: null })
    expect(wiki.detectWikiLink('[[Plan#Go', 9)).toMatchObject({ file: 'Plan', heading: 'Go' })
    expect(wiki.detectWikiLink('[[Plan]] after', 14)).toBeNull()
  })
})

describe('outline editing', async () => {
  const outline = await import('../outlineEdit.js')
  const doc = ['---', 'title: x', '---', '# Book', '', 'Intro', '', '## One', '', 'First', '', '### One.a', '', 'Sub', '', '```', '## not a heading', '```', '', '## Two', '', 'Second[^1]', '', '## Three', '', 'Third', '', '[^1]: A note'].join('\n')
  // Contents order: 0 Book, 1 One, 2 One.a, 3 (fenced "not a heading"), 4 Two, 5 Three

  it('finds a section with its sub-sections, ignoring headings in code and trailing definitions', () => {
    const lines = doc.split('\n')
    const one = outline.sectionRange(doc, 1)
    expect(lines.slice(one.start, one.end).join('\n')).toContain('### One.a')
    expect(lines.slice(one.start, one.end).join('\n')).toContain('## not a heading')
    const three = outline.sectionRange(doc, 5)
    expect(lines.slice(three.start, three.end).join('\n')).not.toContain('[^1]: A note')
    expect(outline.sectionRange(doc, 3)).toBeNull()
  })

  it('moves sections before / after others and up / down among siblings', () => {
    const moved = outline.moveSection(doc, 5, 1, 'before')
    expect(moved.indexOf('## Three')).toBeLessThan(moved.indexOf('## One'))
    expect(moved.endsWith('[^1]: A note')).toBe(true)
    expect(outline.moveSection(doc, 1, 2, 'after')).toBeNull() // into its own sub-section
    const down = outline.moveSectionStep(doc, 1, 1)
    expect(down.indexOf('## Two')).toBeLessThan(down.indexOf('## One'))
    expect(down.indexOf('## One')).toBeLessThan(down.indexOf('### One.a'))
    expect(down.indexOf('### One.a')).toBeLessThan(down.indexOf('## Three'))
    expect(outline.moveSectionStep(doc, 1, -1)).toBeNull() // already first under "Book"
    expect(down).not.toMatch(/\n{3,}/)
  })

  it('promotes and demotes a section with its sub-headings', () => {
    const promoted = outline.shiftSection(doc, 1, -1)
    expect(promoted).toContain('\n# One\n')
    expect(promoted).toContain('\n## One.a\n')
    expect(promoted).toContain('## not a heading') // code untouched
    expect(outline.shiftSection(doc, 0, -1)).toBeNull() // H1 can't go higher
    expect(outline.shiftSection(doc, 4, 1)).toContain('\n### Two\n')
  })

  it('takes a section out and adds it to another document', () => {
    const { text, rest } = outline.extractSection(doc, 4)
    expect(text).toBe('## Two\n\nSecond[^1]')
    expect(rest).not.toContain('## Two')
    expect(outline.insertSection('# Other\n\nIntro text\n\n## Existing\n', text, 'start')).toBe('# Other\n\nIntro text\n\n## Two\n\nSecond[^1]\n\n## Existing\n')
    expect(outline.insertSection('# Other\n', text, 'end')).toBe('# Other\n\n## Two\n\nSecond[^1]\n')
  })
})

describe('tasks across documents', async () => {
  const tasks = await import('../tasks.js')
  const doc = ['# Plan', '', '- [ ] Write intro due:2026-12-01 #docs !high', '  - [x] Outline #docs', '1. [ ] Numbered 📅 2026-11-20', '> - [ ] In a quote', '', '```', '- [ ] not a task', '```', '- [] not a task either', '* [X] Done item'].join('\n')

  it('finds tasks with due dates, tags and priorities, outside code', () => {
    const found = tasks.parseTasks(doc)
    expect(found.map(task => [task.text, task.checked, task.due, task.tags, task.priority, task.depth])).toEqual([
      ['Write intro', false, '2026-12-01', ['docs'], 'high', 0],
      ['Outline', true, null, ['docs'], null, 1],
      ['Numbered', false, '2026-11-20', [], null, 0],
      ['In a quote', false, null, [], null, 0],
      ['Done item', true, null, [], null, 0],
    ])
    for (const task of found) expect(doc[task.offset - 1] + doc[task.offset + 1]).toBe('[]')
  })

  it('ticks and unticks a task by its position', () => {
    const [first, second] = tasks.parseTasks(doc)
    const ticked = tasks.toggleTaskAt(doc, first.offset)
    expect(ticked.split('\n')[2]).toBe('- [x] Write intro due:2026-12-01 #docs !high')
    expect(tasks.toggleTaskAt(ticked, second.offset).split('\n')[3]).toBe('  - [ ] Outline #docs')
    expect(tasks.toggleTaskAt(doc, 0)).toBe(doc)
  })

  it('describes due dates', () => {
    const today = new Date(2026, 10, 27)
    expect(tasks.dueLabel('2026-11-27', today)).toBe('Today')
    expect(tasks.dueLabel('2026-11-28', today)).toBe('Tomorrow')
    expect(tasks.dueLabel('2026-11-24', today)).toBe('Overdue · 3 days')
    expect(tasks.dueState('2026-11-24', today)).toBe('overdue')
    expect(tasks.dueState('2026-12-02', today)).toBe('soon')
    const sorted = tasks.parseTasks(doc).sort((a, b) => tasks.compareTasks(a, b, today)).map(task => task.text)
    expect(sorted.slice(0, 2)).toEqual(['Numbered', 'Write intro'])
  })
})

describe('link graph', async () => {
  const graph = await import('../linkGraph.js')
  const files = [
    { id: 'a', name: 'Home.md', content: 'See [[Plan]], [[Plan]] again, [[Ghost]] and [notes](notes/Idea.md).\n\n`[[Not]]`' },
    { id: 'b', name: 'Plan.md', content: 'Back to [[Home]].' },
    { id: 'c', name: 'notes/Idea.md', content: 'No links.', closed: true },
    { id: 'd', name: 'Orphan.md', content: 'Alone.' },
  ]

  it('builds nodes and edges from wiki and Markdown links, with missing targets', () => {
    const g = graph.buildLinkGraph(files)
    expect(g.nodes.map(node => node.id).sort()).toEqual(['a', 'b', 'c', 'd', 'missing:ghost'])
    expect(g.edges.map(edge => `${edge.source}>${edge.target}:${edge.count}`).sort()).toEqual(['a>b:2', 'a>c:1', 'a>missing:ghost:1', 'b>a:1'])
    expect(g.nodes.find(node => node.id === 'c')).toMatchObject({ folder: 'notes', closed: true, degree: 1 })
    expect(g.nodes.find(node => node.id === 'd').degree).toBe(0)
  })

  it('keeps the neighbourhood for the local graph and lays nodes out deterministically', () => {
    const g = graph.buildLinkGraph(files)
    expect(graph.localGraph(g, 'b', 1).nodes.map(node => node.id).sort()).toEqual(['a', 'b'])
    expect(graph.localGraph(g, 'b', 2).nodes.map(node => node.id).sort()).toEqual(['a', 'b', 'c', 'missing:ghost'])
    const one = graph.forceLayout(g, { width: 400, height: 300 })
    const two = graph.forceLayout(g, { width: 400, height: 300 })
    expect([...one.values()]).toEqual([...two.values()])
    for (const p of one.values()) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true) }
    // Linked documents end up closer together than the orphan.
    const dist = (x, y) => Math.hypot(one.get(x).x - one.get(y).x, one.get(x).y - one.get(y).y)
    expect(dist('a', 'b')).toBeLessThan(dist('b', 'd'))
  })
})
