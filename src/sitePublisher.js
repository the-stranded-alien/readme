// Publish documents as a static website (a ZIP to host anywhere: GitHub Pages, Netlify, …).
// Everything is generated in the browser: one HTML page per document, a sidebar of pages,
// "On this page" contents, previous / next links, client-side search and light / dark themes.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import { refractor } from 'refractor'
import katex from 'katex'
import { parseFrontmatter } from './templates'
import { wikiLinksToMarkdown } from './wikiLinks'
import { resolveFileLink, relativeFileLink } from './fileUtils'
import { headingSlug } from './headingSections'
import { CALLOUT_TYPES, rehypeCallouts } from './rehypeCallouts'
import { resolveImagePath } from './attachments'
import { docStyleCss, documentStyleId } from './docStyles'

const ROOT_TOKEN = '__READme_ROOT__/'

const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const stripExt = name => String(name).replace(/\.(md|markdown|mdx|txt)$/i, '')
const textOf = node => (node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join(''))

/** Where a document's page goes in the site (relative to the site root). */
export function pagePath(name, folder = '') {
  const inside = folder && name.startsWith(`${folder}/`) ? name.slice(folder.length + 1) : name
  return `${stripExt(inside)}.html`
}
const depthOf = path => path.split('/').length - 1
const rootPrefix = path => '../'.repeat(depthOf(path))

// rehype: heading ids, code colours, diagrams, callouts, links between pages.
function rehypeSite({ fromName, pageNames, diagrams, images }) {
  return tree => {
    const seen = new Map()
    const walk = node => {
      if (node.type !== 'element') { node.children?.forEach(walk); return }
      // Headings: stable ids (same as the ReadMe preview) for anchors and contents.
      if (/^h[1-6]$/.test(node.tagName)) {
        const base = headingSlug(textOf(node)) || 'section'
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        node.properties = { ...node.properties, id: count ? `${base}-${count}` : base }
      }
      // Code blocks: Mermaid → placeholder for an SVG; other languages → coloured tokens.
      if (node.tagName === 'pre' && node.children?.[0]?.tagName === 'code') {
        const code = node.children[0]
        const lang = (code.properties?.className ?? []).find(name => String(name).startsWith('language-'))?.slice(9)
        const source = textOf(code)
        if (lang === 'mermaid') {
          diagrams.push(source)
          Object.assign(node, { tagName: 'div', properties: { className: ['diagram'], dataDiagram: String(diagrams.length - 1) }, children: [] })
          return
        }
        if (lang && refractor.registered(lang)) {
          try { code.children = refractor.highlight(source, lang).children } catch { /* plain text */ }
        }
        node.properties = { ...node.properties, dataLang: lang || undefined }
      }
      // Callouts: > [!NOTE] … (marked by rehypeCallouts) → a styled box.
      if (node.tagName === 'blockquote' && node.properties?.dataCallout) {
        const type = node.properties.dataCallout
        const title = String(node.properties.dataCalloutTitle || CALLOUT_TYPES[type] || type)
        node.tagName = 'div'
        node.properties = { className: ['callout', `callout-${type}`] }
        node.children = [
          { type: 'element', tagName: 'p', properties: { className: ['callout-title'] }, children: [{ type: 'text', value: title }] },
          ...node.children,
        ]
      }
      // Attachment images are copied into the site's assets folder.
      if (node.tagName === 'img' && typeof node.properties?.src === 'string' && images) {
        const path = resolveImagePath(node.properties.src, fromName)
        if (path && images.has(path)) { node.properties.src = `${ROOT_TOKEN}assets/${path}`; images.get(path).used = true }
      }
      // Links: other documents → their page (.html); documents not in the site → plain text.
      if (node.tagName === 'a' && typeof node.properties?.href === 'string') {
        const href = node.properties.href
        if (/^https?:/i.test(href)) node.properties = { ...node.properties, target: '_blank', rel: 'noopener noreferrer' }
        else {
          const target = resolveFileLink(fromName, href)
          if (target) {
            if (pageNames.has(target.name)) node.properties.href = `${relativeFileLink(fromName, target.name).replace(/\.(md|markdown|mdx|txt)$/i, '.html')}${target.anchor ? `#${target.anchor}` : ''}`
            else Object.assign(node, { tagName: 'span', properties: { className: ['missing-link'], title: 'Not part of this site' } })
          }
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

/** One document → { title, html, headings, text, diagrams }. */
export async function renderDocument(content, { fromName, files, pageNames, renderDiagrams, images }) {
  const { body } = parseFrontmatter(content)
  const markdown = wikiLinksToMarkdown(body, fromName, files)
  const diagrams = []
  const file = await unified()
    .use(remarkParse).use(remarkGfm).use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex, { throwOnError: false })
    .use(rehypeCallouts)
    .use(rehypeSite, { fromName, pageNames, diagrams, images })
    .use(rehypeStringify)
    .process(markdown)
  let html = String(file)
  if (diagrams.length) {
    const svgs = renderDiagrams ? await renderDiagrams(diagrams) : []
    html = html.replace(/<div class="diagram" data-diagram="(\d+)"><\/div>/g, (_m, index) => {
      const item = svgs[Number(index)]
      const svg = typeof item === 'string' ? item : item?.markup
      return svg ? `<figure class="diagram">${svg}</figure>` : `<pre><code>${escapeHtml(diagrams[Number(index)])}</code></pre>`
    })
  }
  const headings = [...html.matchAll(/<h([1-3]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)].map(([, level, id, inner]) => ({ level: Number(level), id, text: inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() }))
  const title = headings.find(heading => heading.level === 1)?.text || stripExt(fromName.split('/').pop())
  const text = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').trim()
  return { title, html, headings, text, math: /class="katex/.test(html) }
}

/** Mermaid sources → SVG strings, drawn like the ReadMe preview (light theme, on a white card). */
export async function renderSiteDiagrams(sources) {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default', fontFamily: "'Inter', system-ui, sans-serif" })
  const out = []
  for (const [index, source] of sources.entries()) {
    try { out.push((await mermaid.render(`site-diagram-${Date.now()}-${index}`, source)).svg) } catch { out.push(null) }
  }
  return out
}

// ── Page shell ─────────────────────────────────────────────────
function navTree(pages, currentPath) {
  const root = { folders: new Map(), pages: [] }
  for (const page of pages) {
    const parts = page.path.split('/')
    parts.pop()
    let node = root
    for (const part of parts) {
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), pages: [] })
      node = node.folders.get(part)
    }
    node.pages.push(page)
  }
  const prefix = rootPrefix(currentPath)
  const render = (node, path = '') => `<ul>${
    node.pages.map(page => `<li><a href="${prefix}${encodeURI(page.path)}"${page.path === currentPath ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a></li>`).join('')}${
    [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => `<li class="nav-folder"><details${currentPath.startsWith(`${path}${name}/`) ? ' open' : ''}><summary>${escapeHtml(name)}</summary>${render(child, `${path}${name}/`)}</details></li>`).join('')}</ul>`
  return render(root)
}

function pageHtml({ site, page, pages, index, search }) {
  const prefix = rootPrefix(page.path)
  const prev = pages[index - 1], next = pages[index + 1]
  const toc = page.headings.filter(heading => heading.level >= 2)
  return `<!doctype html>
<html lang="en" data-theme="${site.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} · ${escapeHtml(site.title)}</title>
<meta name="generator" content="ReadMe">
<link rel="stylesheet" href="${prefix}assets/site.css">
${page.math ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css">` : ''}
${page.style && page.style !== 'readme' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Inter:wght@400;600;800&family=Lora:ital,wght@0,400;0,600;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap">' : ''}
<script>try{var t=localStorage.getItem('site-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <button class="menu" type="button" aria-label="Pages" aria-expanded="false" onclick="document.body.classList.toggle('nav-open');this.setAttribute('aria-expanded',document.body.classList.contains('nav-open'))">☰</button>
  <a class="brand" href="${prefix}index.html">${escapeHtml(site.title)}</a>
  ${search ? `<div class="search"><input type="search" id="search" placeholder="Search" aria-label="Search this site" autocomplete="off"><ol id="results" hidden></ol></div>` : ''}
  <button class="theme" type="button" aria-label="Switch light / dark" onclick="var d=document.documentElement,n=(d.dataset.theme==='dark'||(d.dataset.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches))?'light':'dark';d.dataset.theme=n;try{localStorage.setItem('site-theme',n)}catch(e){}">◐</button>
</header>
<div class="layout">
  <nav class="sidebar" aria-label="Pages">${navTree(pages, page.path)}</nav>
  <main id="content">
    <article class="doc"${page.style && page.style !== 'readme' ? ` data-doc-style="${page.style}"` : ''}>${page.html.split(ROOT_TOKEN).join(prefix)}</article>
    <nav class="pager" aria-label="Previous and next page">
      ${prev ? `<a class="prev" href="${prefix}${encodeURI(prev.path)}"><span>Previous</span>${escapeHtml(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="next" href="${prefix}${encodeURI(next.path)}"><span>Next</span>${escapeHtml(next.title)}</a>` : '<span></span>'}
    </nav>
    <footer class="footer">Made with <a href="https://readme.guptasahil.in" target="_blank" rel="noopener noreferrer">ReadMe</a></footer>
  </main>
  ${toc.length > 1 ? `<aside class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map(heading => `<li class="level-${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join('')}</ul></aside>` : ''}
</div>
${search ? `<script>window.SITE_ROOT=${JSON.stringify(prefix)}</script><script src="${prefix}assets/search-index.js"></script><script src="${prefix}assets/search.js"></script>` : ''}
</body>
</html>
`
}

const SEARCH_JS = `(function(){
var input=document.getElementById('search'),list=document.getElementById('results');if(!input||!window.SITE_INDEX)return;
function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function run(){var q=input.value.trim().toLowerCase();if(q.length<2){list.hidden=true;list.innerHTML='';return}
var words=q.split(/\\s+/),hits=[];window.SITE_INDEX.forEach(function(p){var t=p.title.toLowerCase(),b=p.text.toLowerCase(),s=0;
for(var i=0;i<words.length;i++){var w=words[i];if(t.indexOf(w)>=0)s+=10;var n=b.split(w).length-1;if(!n&&t.indexOf(w)<0){s=0;break}s+=Math.min(n,5)}
if(s>0){var at=b.indexOf(words[0]),snip=at>=0?p.text.slice(Math.max(0,at-40),at+90):p.text.slice(0,120);hits.push({p:p,s:s,snip:snip})}});
hits.sort(function(a,b){return b.s-a.s});list.innerHTML=hits.slice(0,8).map(function(h){return '<li><a href="'+window.SITE_ROOT+encodeURI(h.p.path)+'"><strong>'+esc(h.p.title)+'</strong><span>'+esc(h.snip)+'…</span></a></li>'}).join('')||'<li class="none">No results</li>';list.hidden=false}
input.addEventListener('input',run);input.addEventListener('keydown',function(e){if(e.key==='Escape'){input.value='';run()}});
document.addEventListener('keydown',function(e){if(e.key==='/'&&document.activeElement!==input&&!/input|textarea/i.test(document.activeElement.tagName)){e.preventDefault();input.focus()}});
})();`

function siteCss(accent) {
  return `:root{--accent:${accent};--link:var(--accent);--note:#0969da;--tip:#1a7f37;--important:#8250df;--warning:#9a6700;--caution:#cf222e;--t-comment:#57606a;--t-keyword:#cf222e;--t-string:#0a3069;--t-number:#0550ae;--t-function:#8250df;--bg:#ffffff;--bg-soft:#f6f7fb;--text:#1c1f2e;--muted:#5b6178;--border:#e3e5ef;--code:#f4f5fa;color-scheme:light}
:root[data-theme="dark"]{--link:color-mix(in srgb,var(--accent) 40%,#fff);--note:#58a6ff;--tip:#3fb950;--important:#c297ff;--warning:#d29922;--caution:#ff7b72;--t-comment:#8b949e;--t-keyword:#ff7b72;--t-string:#a5d6ff;--t-number:#79c0ff;--t-function:#d2a8ff;--bg:#14151f;--bg-soft:#1b1c2a;--text:#eceef8;--muted:#a5abc6;--border:#2c2e42;--code:#1d1f2e;color-scheme:dark}
@media (prefers-color-scheme: dark){:root[data-theme="auto"]{--link:color-mix(in srgb,var(--accent) 40%,#fff);--note:#58a6ff;--tip:#3fb950;--important:#c297ff;--warning:#d29922;--caution:#ff7b72;--t-comment:#8b949e;--t-keyword:#ff7b72;--t-string:#a5d6ff;--t-number:#79c0ff;--t-function:#d2a8ff;--bg:#14151f;--bg-soft:#1b1c2a;--text:#eceef8;--muted:#a5abc6;--border:#2c2e42;--code:#1d1f2e;color-scheme:dark}}
*{box-sizing:border-box}html{scroll-padding-top:72px}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--link)}.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;z-index:9;background:var(--bg);padding:6px 10px}
.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;height:56px;padding:0 20px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.brand{font-weight:700;color:var(--text);text-decoration:none;white-space:nowrap}.menu{display:none}
.topbar button{border:1px solid var(--border);background:var(--bg-soft);color:var(--text);border-radius:8px;height:34px;min-width:34px;cursor:pointer;font-size:15px}.theme{margin-left:auto}
.search{position:relative;flex:0 1 320px;margin-left:auto}.search+.theme{margin-left:0}
.search input{width:100%;height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);font:inherit;font-size:14px}
.search input:focus{outline:2px solid var(--accent);outline-offset:1px}
#results{position:absolute;top:40px;left:0;right:0;margin:0;padding:6px;list-style:none;background:var(--bg);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.15);max-height:60vh;overflow:auto}
#results a{display:grid;gap:2px;padding:8px 10px;border-radius:8px;text-decoration:none;color:var(--text)}#results a:hover,#results a:focus{background:var(--bg-soft)}#results span{font-size:13px;color:var(--muted)}#results .none{padding:8px 10px;color:var(--muted)}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr) 220px;gap:32px;max-width:1400px;margin:0 auto;padding:0 20px}
.sidebar,.toc{position:sticky;top:56px;align-self:start;max-height:calc(100vh - 56px);overflow:auto;padding:24px 0;font-size:14px}
.sidebar ul,.toc ul{list-style:none;margin:0;padding:0}.sidebar ul ul{padding-left:12px}.sidebar li{margin:1px 0}
.sidebar a{display:block;padding:4px 10px;border-radius:6px;color:var(--muted);text-decoration:none}.sidebar a:hover{color:var(--text);background:var(--bg-soft)}
.sidebar a[aria-current="page"]{color:var(--link);background:color-mix(in srgb,var(--accent) 12%,transparent);font-weight:600}
.sidebar summary{padding:4px 10px;cursor:pointer;color:var(--text);font-weight:600}
.toc p{margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.toc a{display:block;padding:3px 0;color:var(--muted);text-decoration:none}.toc a:hover{color:var(--link)}.toc .level-3 a{padding-left:12px}
main{min-width:0;padding:32px 0 48px}.doc{max-width:780px}
.doc h1{font-size:2.2em;line-height:1.2;margin:0 0 .6em}.doc h2{font-size:1.5em;margin:1.8em 0 .6em;padding-bottom:.3em;border-bottom:1px solid var(--border)}.doc h3{font-size:1.2em;margin:1.5em 0 .5em}
.doc img{max-width:100%;border-radius:10px}.doc hr{border:0;border-top:1px solid var(--border);margin:2em 0}
.doc blockquote{margin:1.2em 0;padding:.4em 1em;border-left:4px solid var(--accent);background:var(--bg-soft);border-radius:0 10px 10px 0;color:var(--muted)}
.doc code{font:.88em/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:.1em .35em;border-radius:5px}
.doc pre{background:var(--code);border:1px solid var(--border);border-radius:12px;padding:14px 16px;overflow:auto}.doc pre code{background:none;padding:0;font-size:.85em}
.doc table{width:100%;border-collapse:collapse;margin:1.2em 0;font-size:.92em;display:block;overflow:auto}.doc th,.doc td{border:1px solid var(--border);padding:8px 12px;text-align:left}.doc th{background:var(--bg-soft)}
.doc .contains-task-list{list-style:none;padding-left:.4em}.doc input[type=checkbox]{margin-right:.5em}
.callout{margin:1.2em 0;padding:.6em 1em;border-left:4px solid var(--c,#0969da);border-radius:0 10px 10px 0;background:color-mix(in srgb,var(--c,#0969da) 8%,transparent)}
.callout-title{margin:.2em 0 .3em;font-weight:700;color:var(--c,#0969da)}.callout-note{--c:var(--note)}.callout-tip{--c:var(--tip)}.callout-important{--c:var(--important)}.callout-warning{--c:var(--warning)}.callout-caution{--c:var(--caution)}
.diagram{margin:1.4em 0;padding:16px;text-align:center;overflow:auto;background:#fff;border:1px solid var(--border);border-radius:12px}.diagram svg{max-width:100%;height:auto}.missing-link{color:var(--muted);border-bottom:1px dashed var(--border)}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:780px;margin-top:48px}.pager a{display:grid;gap:2px;padding:12px 16px;border:1px solid var(--border);border-radius:12px;text-decoration:none;color:var(--text)}.pager a:hover{border-color:var(--accent)}.pager span{font-size:12px;color:var(--muted)}.pager .next{text-align:right}
.footer{max-width:780px;margin-top:40px;font-size:13px;color:var(--muted)}
.token.comment,.token.prolog{color:var(--t-comment)}.token.keyword,.token.selector,.token.important{color:var(--t-keyword)}.token.string,.token.attr-value,.token.char{color:var(--t-string)}.token.number,.token.boolean,.token.constant{color:var(--t-number)}.token.function,.token.class-name{color:var(--t-function)}.token.operator,.token.punctuation{color:var(--muted)}
@media (max-width:1100px){.layout{grid-template-columns:240px minmax(0,1fr)}.toc{display:none}}
@media (max-width:760px){.layout{grid-template-columns:1fr}.sidebar{display:none;position:fixed;inset:56px 0 0;z-index:4;align-self:stretch;max-height:none;background:var(--bg);padding:16px 20px}body.nav-open .sidebar{display:block}.menu{display:inline-block}.search{flex:1}}
@media print{.topbar,.sidebar,.toc,.pager{display:none}.layout{display:block}}
`
}

/**
 * files: [{ id, name, content }] → a ZIP Blob of the site, plus stats.
 * options: { title, theme: 'auto'|'light'|'dark', folder: '' | 'folder/path', homeId, search, accent, renderDiagrams, onProgress }
 */
export async function publishSite(files, options = {}) {
  const folder = options.folder || ''
  const chosen = files.filter(file => !folder || file.name.startsWith(`${folder}/`))
  if (!chosen.length) throw new Error('No documents to publish.')
  const pageNames = new Set(chosen.map(file => file.name))
  // options.attachments: Map(path → Blob) of image attachments.
  const images = options.attachments ? new Map([...options.attachments].map(([path, blob]) => [path, { blob, used: false }])) : null
  const pages = []
  for (const [index, file] of chosen.entries()) {
    options.onProgress?.(index / chosen.length, file.name)
    const rendered = await renderDocument(file.content, { fromName: file.name, files, pageNames, renderDiagrams: options.renderDiagrams, images })
    pages.push({ ...rendered, id: file.id, name: file.name, path: pagePath(file.name, folder), style: documentStyleId(file.content, options.defaultStyle) })
  }
  // Sidebar / reading order: home first, then by folder and name.
  pages.sort((a, b) => (b.id === options.homeId) - (a.id === options.homeId) || a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path, undefined, { numeric: true }))
  const site = { title: options.title || 'Documentation', theme: options.theme || 'auto' }
  const search = options.search !== false
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  pages.forEach((page, index) => zip.file(page.path, pageHtml({ site, page, pages, index, search })))
  // index.html: the home page (or the first page).
  const home = pages.find(page => page.id === options.homeId) ?? pages[0]
  // (a short redirect, so links inside the home page keep working wherever it lives).
  if (!pages.some(page => page.path === 'index.html')) {
    zip.file('index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(site.title)}</title><meta http-equiv="refresh" content="0; url=${encodeURI(home.path)}"><link rel="canonical" href="${encodeURI(home.path)}"></head><body><p><a href="${encodeURI(home.path)}">${escapeHtml(home.title)}</a></p></body></html>\n`)
  }
  zip.file('assets/site.css', siteCss(options.accent || '#6d28d9') + (pages.some(page => page.style !== 'readme') ? `\n/* Document styles */\n${docStyleCss(id => `.doc[data-doc-style="${id}"]`)}\n` : ''))
  if (search) {
    zip.file('assets/search-index.js', `window.SITE_INDEX=${JSON.stringify(pages.map(page => ({ title: page.title, path: page.path, text: page.text.slice(0, 20000) })))};`)
    zip.file('assets/search.js', SEARCH_JS)
  }
  for (const [path, item] of images ?? []) if (item.used) zip.file(`assets/${path}`, item.blob)
  zip.file('.nojekyll', '')
  options.onProgress?.(1, '')
  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, pages: pages.map(page => page.path), home: pages.some(page => page.path === 'index.html') ? 'index.html' : home.path }
}
