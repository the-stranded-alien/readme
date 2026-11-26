// The workspace as a graph: documents are nodes, [[wiki links]] and relative Markdown links are
// edges. Links to documents that don't exist yet become "missing" nodes.
import { parseWikiLinks, resolveWikiTarget } from './wikiLinks'
import { resolveFileLink } from './fileUtils'

const stripExt = name => String(name).replace(/\.(md|markdown|mdx|txt)$/i, '')
const folderOf = name => String(name).split('/').slice(0, -1).join('/')

// Markdown links outside code: [text](target)
function markdownLinks(content) {
  const masked = String(content || '')
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, block => block.replace(/[^\n]/g, ' '))
    .replace(/(`+)[^`\n]*?\1/g, span => ' '.repeat(span.length))
  return [...masked.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(match => match[1])
}

/**
 * files: [{ id, name, content, closed? }] → { nodes, edges }.
 * nodes: { id, name, label, folder, closed, missing, degree }; edges: { source, target, count }.
 */
export function buildLinkGraph(files) {
  const nodes = new Map(files.map(file => [file.id, {
    id: file.id, name: file.name, label: stripExt(file.name.split('/').pop()), folder: folderOf(file.name),
    closed: Boolean(file.closed), missing: false, degree: 0,
  }]))
  const byName = new Map(files.map(file => [file.name, file]))
  const edges = new Map()
  const addEdge = (source, target) => {
    if (source === target) return
    const key = `${source}→${target}`
    const edge = edges.get(key) ?? { source, target, count: 0 }
    edge.count += 1
    edges.set(key, edge)
  }
  for (const file of files) {
    for (const link of parseWikiLinks(file.content)) {
      if (!link.target) continue
      const found = resolveWikiTarget(link.target, file.name, files)
      if (found) { addEdge(file.id, found.id); continue }
      const missingName = stripExt(link.target.replace(/^\/+/, ''))
      const id = `missing:${missingName.toLowerCase()}`
      if (!nodes.has(id)) nodes.set(id, { id, name: missingName, label: missingName.split('/').pop(), folder: folderOf(missingName), closed: false, missing: true, degree: 0 })
      addEdge(file.id, id)
    }
    for (const href of markdownLinks(file.content)) {
      const target = resolveFileLink(file.name, href)
      const found = target && byName.get(target.name)
      if (found) addEdge(file.id, found.id)
    }
  }
  for (const edge of edges.values()) {
    nodes.get(edge.source).degree += 1
    nodes.get(edge.target).degree += 1
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

/** Only `centerId` and documents within `depth` link steps of it (either direction). */
export function localGraph(graph, centerId, depth = 1) {
  const keep = new Set([centerId])
  let frontier = new Set([centerId])
  for (let step = 0; step < depth; step += 1) {
    const next = new Set()
    for (const edge of graph.edges) {
      if (frontier.has(edge.source) && !keep.has(edge.target)) next.add(edge.target)
      if (frontier.has(edge.target) && !keep.has(edge.source)) next.add(edge.source)
    }
    next.forEach(id => keep.add(id))
    frontier = next
  }
  return {
    nodes: graph.nodes.filter(node => keep.has(node.id)),
    edges: graph.edges.filter(edge => keep.has(edge.source) && keep.has(edge.target)),
  }
}

// Deterministic pseudo-random numbers (same layout for the same workspace).
function seeded(seed) {
  let value = seed >>> 0 || 1
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296 }
}

/**
 * A force-directed layout: nodes repel, links pull, everything drifts to the middle.
 * `previous` (id → { x, y }) keeps known nodes where they were. Returns id → { x, y }.
 */
export function forceLayout(graph, { width = 800, height = 600, iterations = 300, previous = new Map() } = {}) {
  const random = seeded(graph.nodes.length * 7919 + graph.edges.length)
  const pos = new Map(graph.nodes.map((node, index) => {
    const known = previous.get(node.id)
    const angle = (index / Math.max(1, graph.nodes.length)) * Math.PI * 2
    const r = Math.min(width, height) * (0.25 + random() * 0.15)
    return [node.id, known ? { ...known } : { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r }]
  }))
  const ids = [...pos.keys()]
  const area = width * height
  // Ideal link length: from the space per node, but not huge for small graphs.
  const k = Math.min(110, Math.sqrt(area / Math.max(1, ids.length)) * 0.75)
  let temperature = Math.min(width, height) / 8
  const steps = ids.length > 400 ? Math.min(iterations, 120) : iterations
  for (let step = 0; step < steps; step += 1) {
    const move = new Map(ids.map(id => [id, { x: 0, y: 0 }]))
    for (let i = 0; i < ids.length; i += 1) {
      const a = pos.get(ids[i])
      for (let j = i + 1; j < ids.length; j += 1) {
        const b = pos.get(ids[j])
        let dx = a.x - b.x, dy = a.y - b.y
        let dist = Math.hypot(dx, dy)
        if (dist < 0.01) { dx = random() - 0.5; dy = random() - 0.5; dist = 0.5 }
        // Far-apart documents stop pushing each other (keeps unlinked ones close by).
        if (dist > k * 2.5) continue
        const force = (k * k) / dist
        const fx = (dx / dist) * force, fy = (dy / dist) * force
        move.get(ids[i]).x += fx; move.get(ids[i]).y += fy
        move.get(ids[j]).x -= fx; move.get(ids[j]).y -= fy
      }
    }
    for (const edge of graph.edges) {
      const a = pos.get(edge.source), b = pos.get(edge.target)
      if (!a || !b) continue
      const dx = a.x - b.x, dy = a.y - b.y
      const dist = Math.max(0.01, Math.hypot(dx, dy))
      const force = (dist * dist) / k
      const fx = (dx / dist) * force, fy = (dy / dist) * force
      move.get(edge.source).x -= fx; move.get(edge.source).y -= fy
      move.get(edge.target).x += fx; move.get(edge.target).y += fy
    }
    for (const id of ids) {
      const p = pos.get(id), m = move.get(id)
      // Gravity towards the middle (so unlinked documents don't drift off).
      const gx = width / 2 - p.x, gy = height / 2 - p.y
      const gd = Math.max(1, Math.hypot(gx, gy))
      m.x += (gx / gd) * k * 0.2 + gx * 0.1
      m.y += (gy / gd) * k * 0.2 + gy * 0.1
      const length = Math.max(0.01, Math.hypot(m.x, m.y))
      p.x += (m.x / length) * Math.min(length, temperature)
      p.y += (m.y / length) * Math.min(length, temperature)
    }
    temperature *= 0.97
  }
  return pos
}
