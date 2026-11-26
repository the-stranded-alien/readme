import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { List, Maximize2, Search, Workflow, X, ZoomIn, ZoomOut } from '../icons'
import { useDialogKeys } from '../useDialogKeys'
import { buildLinkGraph, forceLayout, localGraph } from '../linkGraph'

// Folder colours (mid-tones that read on light and dark backgrounds); the top level uses the accent.
const FOLDER_COLORS = ['#0ea5e9', '#16a34a', '#d97706', '#db2777', '#0d9488', '#7c3aed', '#dc2626', '#2563eb']
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/**
 * The workspace as a map of linked documents. `files`: [{ id, name, content, closed }].
 * onOpen(fileId) opens a document; onCreate(name) offers to create a missing one.
 */
export default function GraphView({ files, activeId, onOpen, onCreate, onClose }) {
  const [local, setLocal] = useState(false)
  const [depth, setDepth] = useState(1)
  const [folder, setFolder] = useState('*')
  const [showClosed, setShowClosed] = useState(true)
  const [orphansOnly, setOrphansOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [hover, setHover] = useState(null)
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const searchRef = useRef(null)
  const [size, setSize] = useState({ width: 800, height: 520 })
  const view = useRef({ x: 0, y: 0, scale: 1 })
  const positions = useRef(new Map())
  const drag = useRef(null)
  const [, redraw] = useState(0)
  useDialogKeys(onClose, { focus: () => searchRef.current?.focus() })

  const full = useMemo(() => buildLinkGraph(files), [files])
  const folders = useMemo(() => [...new Set(full.nodes.filter(node => !node.missing).map(node => node.folder))].sort(), [full])
  const colorOf = useCallback(node => (node.folder ? FOLDER_COLORS[folders.indexOf(node.folder) % FOLDER_COLORS.length] : null), [folders])

  const graph = useMemo(() => {
    let g = local && activeId ? localGraph(full, activeId, depth) : full
    const keep = node => (showClosed || !node.closed) && (folder === '*' || node.folder === folder || node.id === activeId) && (!orphansOnly || node.degree === 0)
    const nodes = g.nodes.filter(keep)
    const ids = new Set(nodes.map(node => node.id))
    g = { nodes, edges: g.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) }
    return g
  }, [full, local, depth, activeId, folder, showClosed, orphansOnly])

  // Size the canvas to its box.
  useEffect(() => {
    const box = wrapRef.current
    const update = () => setSize({ width: Math.max(200, box.clientWidth), height: Math.max(200, box.clientHeight) })
    update()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    observer?.observe(box)
    return () => observer?.disconnect()
  }, [])

  // Lay out (keeping nodes that were already placed), then fit everything in view.
  const fit = useCallback(() => {
    const points = graph.nodes.map(node => positions.current.get(node.id)).filter(Boolean)
    if (!points.length) return
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x))
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y))
    const scale = Math.min(2, (size.width - 80) / Math.max(1, maxX - minX), (size.height - 80) / Math.max(1, maxY - minY))
    view.current = { scale, x: size.width / 2 - ((minX + maxX) / 2) * scale, y: size.height / 2 - ((minY + maxY) / 2) * scale }
    redraw(n => n + 1)
  }, [graph, size])
  useEffect(() => {
    positions.current = forceLayout(graph, { width: size.width, height: size.height, previous: positions.current })
    fit()
  }, [graph, size.width, size.height]) // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? new Set(graph.nodes.filter(node => node.name.toLowerCase().includes(q)).map(node => node.id)) : null
  }, [graph, query])
  const neighbours = useMemo(() => {
    if (!hover) return null
    const set = new Set([hover])
    graph.edges.forEach(edge => { if (edge.source === hover) set.add(edge.target); if (edge.target === hover) set.add(edge.source) })
    return set
  }, [graph, hover])

  // ── Drawing ──
  const radius = node => 5 + Math.min(9, Math.sqrt(node.degree) * 2.2)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x: ox, y: oy, scale } = view.current
    const accent = css('--accent') || '#6d28d9'
    const text = css('--text-1') || '#111'
    const muted = css('--text-3') || '#666'
    const line = css('--border-strong') || '#bbb'
    const bg = css('--bg-preview') || '#fff'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    const at = id => { const p = positions.current.get(id); return p ? { x: ox + p.x * scale, y: oy + p.y * scale } : null }
    const dim = id => (neighbours && !neighbours.has(id)) || (matches && !matches.has(id))
    // Links (with a small arrow towards the target).
    for (const edge of graph.edges) {
      const a = at(edge.source), b = at(edge.target)
      if (!a || !b) continue
      const faded = dim(edge.source) || dim(edge.target)
      ctx.globalAlpha = faded ? 0.12 : 0.7
      ctx.strokeStyle = neighbours && !faded ? accent : line
      ctx.lineWidth = Math.min(3, 1 + edge.count * 0.4)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      const target = graph.nodes.find(node => node.id === edge.target)
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const tip = { x: b.x - Math.cos(angle) * (radius(target) + 2), y: b.y - Math.sin(angle) * (radius(target) + 2) }
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(tip.x - Math.cos(angle - 0.45) * 7, tip.y - Math.sin(angle - 0.45) * 7)
      ctx.lineTo(tip.x - Math.cos(angle + 0.45) * 7, tip.y - Math.sin(angle + 0.45) * 7)
      ctx.closePath(); ctx.fill()
    }
    // Documents.
    // Every label only when they fit (few documents, or zoomed in); otherwise on hover / search.
    const showAllLabels = graph.nodes.length <= 40 || scale >= 1.6
    for (const node of graph.nodes) {
      const p = at(node.id)
      if (!p) continue
      const r = radius(node)
      ctx.globalAlpha = dim(node.id) ? 0.25 : node.closed ? 0.6 : 1
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      if (node.missing) { ctx.fillStyle = bg; ctx.fill(); ctx.setLineDash([3, 2]); ctx.strokeStyle = muted; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]) }
      else { ctx.fillStyle = colorOf(node) || accent; ctx.fill() }
      if (node.id === activeId || node.id === hover || matches?.has(node.id)) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = node.id === activeId ? text : accent; ctx.lineWidth = 2; ctx.stroke()
      }
      if (showAllLabels || node.id === hover || node.id === activeId || matches?.has(node.id) || neighbours?.has(node.id)) {
        ctx.font = `${node.id === activeId || node.id === hover ? 600 : 500} 12px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(node.label, p.x, p.y + r + 14)
        ctx.fillStyle = node.missing ? muted : text; ctx.fillText(node.label, p.x, p.y + r + 14)
      }
    }
    ctx.globalAlpha = 1
  })

  // ── Pointer: pan, zoom, drag nodes, click to open ──
  const toWorld = (clientX, clientY) => {
    const box = canvasRef.current.getBoundingClientRect()
    const { x, y, scale } = view.current
    return { x: (clientX - box.left - x) / scale, y: (clientY - box.top - y) / scale }
  }
  const nodeAt = (clientX, clientY) => {
    const point = toWorld(clientX, clientY)
    const { scale } = view.current
    let best = null
    for (const node of graph.nodes) {
      const p = positions.current.get(node.id)
      if (!p) continue
      const d = Math.hypot(p.x - point.x, p.y - point.y) * scale
      if (d <= radius(node) + 4 && (!best || d < best.d)) best = { node, d }
    }
    return best?.node ?? null
  }
  const onPointerDown = event => {
    const node = nodeAt(event.clientX, event.clientY)
    canvasRef.current.setPointerCapture?.(event.pointerId)
    drag.current = { node, startX: event.clientX, startY: event.clientY, moved: false, view: { ...view.current } }
  }
  const onPointerMove = event => {
    const state = drag.current
    if (!state) { const node = nodeAt(event.clientX, event.clientY); setHover(node?.id ?? null); canvasRef.current.style.cursor = node ? 'pointer' : 'grab'; return }
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY
    if (Math.hypot(dx, dy) > 3) state.moved = true
    if (!state.moved) return
    if (state.node) {
      const point = toWorld(event.clientX, event.clientY)
      positions.current.set(state.node.id, point)
    } else {
      view.current = { ...state.view, x: state.view.x + dx, y: state.view.y + dy }
      canvasRef.current.style.cursor = 'grabbing'
    }
    redraw(n => n + 1)
  }
  const onPointerUp = () => {
    const state = drag.current
    drag.current = null
    if (state?.node && !state.moved) {
      if (state.node.missing) onCreate(state.node.name)
      else onOpen(state.node.id)
    }
  }
  const zoomBy = (factor, cx = size.width / 2, cy = size.height / 2) => {
    const { x, y, scale } = view.current
    const next = Math.min(4, Math.max(0.15, scale * factor))
    view.current = { scale: next, x: cx - ((cx - x) / scale) * next, y: cy - ((cy - y) / scale) * next }
    redraw(n => n + 1)
  }
  const onWheel = event => {
    const box = canvasRef.current.getBoundingClientRect()
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - box.left, event.clientY - box.top)
  }
  // Search: centre on the first match.
  useEffect(() => {
    if (!matches?.size) return
    const p = positions.current.get([...matches][0])
    if (!p) return
    view.current = { ...view.current, x: size.width / 2 - p.x * view.current.scale, y: size.height / 2 - p.y * view.current.scale }
    redraw(n => n + 1)
  }, [matches, size])

  const names = useMemo(() => new Map(full.nodes.map(node => [node.id, node])), [full])
  const hovered = hover ? names.get(hover) : null
  const orphanCount = full.nodes.filter(node => !node.missing && node.degree === 0).length

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="graph-panel anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="graph-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="graph-title" className="flex items-center gap-2"><Workflow size={16} style={{ color: 'var(--accent)' }} />Graph of linked documents</h2>
            <p>{full.nodes.filter(node => !node.missing).length} documents · {full.edges.length} links · {orphanCount} without links. Click a dot to open it; drag to move around; scroll to zoom.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close graph" data-tooltip="Close (Esc)"><X size={15} /></button>
        </div>
        <div className="graph-toolbar">
          <label className="tasks-search graph-search">
            <Search size={13} aria-hidden="true" />
            <input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a document" aria-label="Find a document" />
          </label>
          <label className="graph-check"><input type="checkbox" checked={local} onChange={event => setLocal(event.target.checked)} disabled={!activeId} /> Only around this document</label>
          {local && (
            <span className="settings-select-wrap">
              <select className="settings-select graph-small-select" value={depth} onChange={event => setDepth(Number(event.target.value))} aria-label="Link steps">
                <option value={1}>1 step</option>
                <option value={2}>2 steps</option>
              </select>
            </span>
          )}
          {folders.length > 1 && (
            <span className="settings-select-wrap">
              <select className="settings-select" value={folder} onChange={event => setFolder(event.target.value)} aria-label="Folder">
                <option value="*">All folders</option>
                {folders.map(name => <option key={name || '/'} value={name}>{name || 'Top level'}</option>)}
              </select>
            </span>
          )}
          <label className="graph-check"><input type="checkbox" checked={showClosed} onChange={event => setShowClosed(event.target.checked)} /> Closed files</label>
          <label className="graph-check"><input type="checkbox" checked={orphansOnly} onChange={event => setOrphansOnly(event.target.checked)} /> Only without links</label>
          <span className="graph-zoom">
            <button type="button" className="btn-icon" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" data-tooltip="Zoom out"><ZoomOut size={14} /></button>
            <button type="button" className="btn-icon" onClick={() => zoomBy(1.25)} aria-label="Zoom in" data-tooltip="Zoom in"><ZoomIn size={14} /></button>
            <button type="button" className="btn-icon" onClick={fit} aria-label="Fit to view" data-tooltip="Fit to view"><Maximize2 size={14} /></button>
            <button type="button" className="btn-icon" onClick={() => setListOpen(open => !open)} aria-pressed={listOpen} aria-label="List of documents and links" data-tooltip="List view"><List size={14} /></button>
          </span>
        </div>
        <div className="graph-body">
          <div className="graph-canvas-wrap" ref={wrapRef}>
            <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} role="img"
              aria-label={`Graph of ${graph.nodes.length} documents and ${graph.edges.length} links. Use the list view to browse them with the keyboard.`}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { if (!drag.current) setHover(null) }} onWheel={onWheel} />
            {graph.nodes.length === 0 && <p className="graph-empty">No documents match these filters.</p>}
            {hovered && (
              <div className="graph-hover" aria-hidden="true">
                <strong>{hovered.name}</strong>
                <span>{hovered.missing ? 'Doesn’t exist yet — click to create it' : `${hovered.degree} link${hovered.degree === 1 ? '' : 's'}${hovered.closed ? ' · closed' : ''}`}</span>
              </div>
            )}
            {folders.length > 1 && (
              <ul className="graph-legend" aria-label="Folders">
                {folders.map(name => <li key={name || '/'}><span style={{ background: name ? FOLDER_COLORS[folders.indexOf(name) % FOLDER_COLORS.length] : 'var(--accent)' }} />{name || 'Top level'}</li>)}
              </ul>
            )}
          </div>
          {listOpen && (
            <nav className="graph-list" aria-label="Documents and links">
              <ul>
                {graph.nodes.filter(node => !node.missing).sort((a, b) => a.name.localeCompare(b.name)).map(node => {
                  const out = graph.edges.filter(edge => edge.source === node.id).map(edge => names.get(edge.target)).filter(Boolean)
                  return (
                    <li key={node.id}>
                      <button type="button" onClick={() => onOpen(node.id)} aria-current={node.id === activeId ? 'page' : undefined}>
                        {node.name}<span>{node.degree} link{node.degree === 1 ? '' : 's'}</span>
                      </button>
                      {out.length > 0 && (
                        <ul>
                          {out.map(target => (
                            <li key={target.id}>
                              <button type="button" onClick={() => (target.missing ? onCreate(target.name) : onOpen(target.id))}>→ {target.name}{target.missing ? ' (missing)' : ''}</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
