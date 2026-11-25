import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from '../icons'

const MIN_ZOOM = 1
const MAX_ZOOM = 5
const clampZoom = value => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

// Full-screen image viewer: arrow keys / buttons move between the document's
// images; wheel, +/- or double-click zoom; drag to pan while zoomed.
export default function ImageLightbox({ images, index, onIndexChange, onClose }) {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [viewIndex, setViewIndex] = useState(index)
  const dragRef = useRef(null)
  const closeRef = useRef(null)
  const image = images[index]
  const count = images.length

  // Reset zoom whenever another image is shown.
  if (viewIndex !== index) {
    setViewIndex(index)
    setView({ zoom: 1, x: 0, y: 0 })
  }

  const go = useCallback(step => {
    if (count < 2) return
    onIndexChange((index + step + count) % count)
  }, [count, index, onIndexChange])
  const zoomBy = useCallback(factor => {
    setView(current => {
      const zoom = clampZoom(current.zoom * factor)
      return zoom === 1 ? { zoom, x: 0, y: 0 } : { ...current, zoom }
    })
  }, [])
  const reset = useCallback(() => setView({ zoom: 1, x: 0, y: 0 }), [])

  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1) }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.25) }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomBy(0.8) }
      else if (event.key === '0') { event.preventDefault(); reset() }
      else if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go, zoomBy, reset, onClose])

  if (!image) return null
  const zoomed = view.zoom > 1

  return (
    <div
      className="lightbox-backdrop anim-fade-in no-print"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt ? `Image: ${image.alt}` : 'Image preview'}
      onWheel={event => zoomBy(event.deltaY < 0 ? 1.12 : 0.89)}
    >
      <div className="lightbox-toolbar" onClick={event => event.stopPropagation()}>
        {count > 1 && <span className="lightbox-counter">{index + 1} / {count}</span>}
        <button type="button" className="lightbox-btn" onClick={() => zoomBy(0.8)} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out"><ZoomOut size={16} /></button>
        <span className="lightbox-zoom">{Math.round(view.zoom * 100)}%</span>
        <button type="button" className="lightbox-btn" onClick={() => zoomBy(1.25)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in"><ZoomIn size={16} /></button>
        <button type="button" className="lightbox-btn" onClick={reset} disabled={!zoomed} aria-label="Reset zoom"><RotateCcw size={15} /></button>
        <button type="button" ref={closeRef} className="lightbox-btn" onClick={onClose} aria-label="Close image preview"><X size={17} /></button>
      </div>

      {count > 1 && (
        <>
          <button type="button" className="lightbox-nav is-prev" onClick={event => { event.stopPropagation(); go(-1) }} aria-label="Previous image"><ChevronLeft size={22} /></button>
          <button type="button" className="lightbox-nav is-next" onClick={event => { event.stopPropagation(); go(1) }} aria-label="Next image"><ChevronRight size={22} /></button>
        </>
      )}

      <figure className="lightbox-figure" onClick={event => event.stopPropagation()}>
        <img
          key={image.src}
          src={image.src}
          alt={image.alt}
          draggable={false}
          className={`lightbox-image anim-pop-in${zoomed ? ' is-zoomed' : ''}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          onDoubleClick={() => (zoomed ? reset() : setView(current => ({ ...current, zoom: 2 })))}
          onPointerDown={event => {
            if (!zoomed) return
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = { x: event.clientX - view.x, y: event.clientY - view.y }
          }}
          onPointerMove={event => {
            if (!dragRef.current) return
            setView(current => ({ ...current, x: event.clientX - dragRef.current.x, y: event.clientY - dragRef.current.y }))
          }}
          onPointerUp={() => { dragRef.current = null }}
          onPointerCancel={() => { dragRef.current = null }}
        />
        {image.alt && <figcaption className="lightbox-caption">{image.alt}</figcaption>}
      </figure>
    </div>
  )
}
