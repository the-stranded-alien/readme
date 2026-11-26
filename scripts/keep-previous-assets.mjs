// Deploy safety ("version skew"): GitHub Pages replaces the whole site on every deploy, so a tab
// that was opened before a deploy can't load code it hasn't loaded yet (exports, diagrams… are
// loaded on first use) — the old file names are gone. Before uploading a new build, copy the
// files of the build that's live now into dist/assets, so tabs running it keep working.
// Only one build back is kept (the new asset-manifest.json lists just the new build's files).
// Usage: node scripts/keep-previous-assets.mjs [siteUrl]   (run after `npm run build`)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const cname = existsSync(join(dist, 'CNAME')) ? readFileSync(join(dist, 'CNAME'), 'utf8').trim() : ''
const site = (process.argv[2] || (cname ? `https://${cname}` : '')).replace(/\/$/, '')
if (!site) { console.log('No site URL: nothing to keep.'); process.exit(0) }

const get = async (url, type) => {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return type === 'json' ? response.json() : Buffer.from(await response.arrayBuffer())
}

// Builds before asset-manifest.json existed: find their files by following references from
// index.html through the JavaScript (Vite lists lazily loaded files inside the bundles).
async function crawl() {
  const seen = new Set()
  const queue = [...new Set(String(await get(`${site}/index.html`)).match(/assets\/[\w.\-]+\.(?:js|css)/g) || [])]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    if (!file.endsWith('.js')) continue
    try {
      const code = String(await get(`${site}/${file}`))
      for (const ref of code.match(/assets\/[\w.\-]+\.(?:js|css|woff2?|wasm)/g) || []) if (!seen.has(ref)) queue.push(ref)
    } catch { /* a missing file: skip */ }
  }
  return { build: 'crawled', assets: [...seen] }
}

let previous
try {
  previous = await get(`${site}/asset-manifest.json`, 'json')
} catch {
  try {
    previous = await crawl()
  } catch (error) {
    console.log(`Could not read the live site (${error.message}): nothing to keep.`)
    process.exit(0)
  }
}
const missing = (previous.assets || []).filter(file => /^assets\/[\w.\-]+$/.test(file) && !existsSync(join(dist, file)))
let kept = 0
const queue = [...missing]
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let file = queue.shift(); file; file = queue.shift()) {
    try {
      const body = await get(`${site}/${file}`)
      mkdirSync(dirname(join(dist, file)), { recursive: true })
      writeFileSync(join(dist, file), body)
      kept += 1
    } catch (error) {
      console.warn(`Skipped ${file}: ${error.message}`)
    }
  }
}))
console.log(`Kept ${kept} of ${missing.length} files from the previous build (${previous.build || 'unknown'}).`)
