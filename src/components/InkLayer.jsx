import { useCallback, useEffect, useRef } from 'react'

// Fading ink behaves like a comet trail: every point has its own clock, so the oldest part
// of a line thins and fades first while the newest part stays bright. A point stays solid
// for the first SOLID share of its life, then eases out over the rest.
const SOLID = 0.25
const trailAlpha = (age, life) => {
  const t = (age / life - SOLID) / (1 - SOLID)
  if (t <= 0) return 1
  if (t >= 1) return 0
  return (1 - t) * (1 - t) // ease-out: quick to soften, long gentle tail
}

/**
 * Pen and laser for presentations, drawn on a canvas over the slide.
 * - `tool`: null, 'pen' or 'laser'. The canvas only takes the pointer while the pen is on.
 * - Pen strokes belong to a slide. Fading ink trails away like a comet: each part of the
 *   line fades out over `fadeSeconds` from when it was drawn. Permanent ink stays on its
 *   slide until cleared (`clearToken` changes).
 * - The laser is a single glowing dot that follows the pointer.
 */
export default function InkLayer({ tool, penMode, penColor, penWidth, fadeSeconds, laserColor, slide, clearToken, onScroll, onInkChange, onDrawStart }) {
  const canvasRef = useRef(null)
  const laserRef = useRef(null)
  const strokesRef = useRef([])
  const drawingRef = useRef(null)
  const frameRef = useRef(0)
  const slideRef = useRef(slide)
  const drawRef = useRef(null)
  // Tells the toolbar whether the current slide has ink (so Clear can be disabled).
  const hasInkRef = useRef(false)
  const onInkChangeRef = useRef(onInkChange)
  useEffect(() => { onInkChangeRef.current = onInkChange }, [onInkChange])

  const draw = useCallback(() => {
    frameRef.current = 0
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const now = performance.now()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let animating = false
    strokesRef.current = strokesRef.current.filter(stroke => {
      if (stroke.mode !== 'fade' || stroke === drawingRef.current) return true
      return now - stroke.points[stroke.points.length - 1].t < stroke.life
    })
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      if (stroke.slide !== slideRef.current) continue
      const points = stroke.points
      ctx.strokeStyle = stroke.color
      ctx.fillStyle = stroke.color
      if (stroke.mode === 'fade') {
        animating = true
        if (points.length === 1) {
          ctx.globalAlpha = trailAlpha(now - points[0].t, stroke.life)
          ctx.beginPath()
          ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        // Piece by piece: older pieces are fainter and thinner (the comet's tail). Each piece
        // runs midpoint → midpoint curving through a point, so flat ends meet without overlap.
        const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
        ctx.lineCap = 'butt'
        for (let i = 0; i < points.length; i += 1) {
          const alpha = trailAlpha(now - points[i].t, stroke.life)
          if (alpha <= 0.01) continue
          const from = i === 0 ? points[0] : mid(points[i - 1], points[i])
          const to = i === points.length - 1 ? points[i] : mid(points[i], points[i + 1])
          ctx.globalAlpha = alpha
          ctx.lineWidth = stroke.width * (0.35 + 0.65 * alpha)
          ctx.beginPath()
          ctx.moveTo(from.x, from.y)
          ctx.quadraticCurveTo(points[i].x, points[i].y, to.x, to.y)
          ctx.stroke()
        }
        ctx.lineCap = 'round'
        continue
      }
      ctx.globalAlpha = 1
      ctx.lineWidth = stroke.width
      if (points.length === 1) {
        ctx.beginPath()
        ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      // Smooth the line through the midpoints.
      for (let i = 1; i < points.length - 1; i += 1) {
        const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
        ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y)
      }
      const last = points[points.length - 1]
      ctx.lineTo(last.x, last.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    const hasInk = strokesRef.current.some(stroke => stroke.slide === slideRef.current)
    if (hasInk !== hasInkRef.current) { hasInkRef.current = hasInk; onInkChangeRef.current?.(hasInk) }
    if (animating) frameRef.current = requestAnimationFrame(() => drawRef.current?.())
  }, [])
  useEffect(() => { drawRef.current = draw }, [draw])
  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw)
  }, [draw])

  // Size the canvas to its box (sharp on high-DPI screens).
  useEffect(() => {
    const canvas = canvasRef.current
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      draw()
    }
    resize()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    window.addEventListener('resize', resize)
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); cancelAnimationFrame(frameRef.current); frameRef.current = 0 }
  }, [draw])

  useEffect(() => { slideRef.current = slide; draw() }, [slide, draw])
  // Clear: removes the ink on the current slide.
  useEffect(() => {
    if (!clearToken) return
    strokesRef.current = strokesRef.current.filter(stroke => stroke.slide !== slideRef.current)
    draw()
  }, [clearToken, draw])

  const point = event => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, t: performance.now() }
  }
  const onPointerDown = event => {
    if (tool !== 'pen' || event.button > 0) return
    event.preventDefault()
    canvasRef.current.setPointerCapture?.(event.pointerId)
    const stroke = { points: [point(event)], color: penColor, width: penWidth, mode: penMode, life: fadeSeconds * 1000, slide: slideRef.current }
    drawingRef.current = stroke
    strokesRef.current.push(stroke)
    onDrawStart?.()
    schedule()
  }
  const onPointerMove = event => {
    const stroke = drawingRef.current
    if (!stroke) return
    stroke.points.push(point(event))
    schedule()
  }
  const finish = () => {
    const stroke = drawingRef.current
    if (!stroke) return
    drawingRef.current = null
    schedule()
  }

  // The laser dot follows the pointer anywhere over the presentation.
  useEffect(() => {
    if (tool !== 'laser') return undefined
    const dot = laserRef.current
    const move = event => {
      dot.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`
      dot.style.opacity = '1'
    }
    const hide = () => { dot.style.opacity = '0' }
    window.addEventListener('pointermove', move)
    document.documentElement.addEventListener('pointerleave', hide)
    return () => { window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', hide) }
  }, [tool])

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`presentation-ink${tool === 'pen' ? ' is-drawing' : ''}`}
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onWheel={event => onScroll?.(event.deltaY)}
      />
      {tool === 'laser' && <span ref={laserRef} className="presentation-laser" style={{ '--laser': laserColor }} aria-hidden="true" />}
    </>
  )
}
