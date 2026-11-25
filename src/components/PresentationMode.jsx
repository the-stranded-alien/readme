import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Palette, X } from 'lucide-react'
import { slideTitle, splitSlides } from '../presentation'

/**
 * Full-screen slide view of the document (one slide per H1/H2). The slide
 * body is rendered with the app's own Markdown renderer (`renderMarkdown`).
 */
export default function PresentationMode({ markdown, renderMarkdown, onClose, startAt = 0, themes = [], theme, onTheme }) {
  const slides = useMemo(() => splitSlides(markdown), [markdown])
  const [index, setIndex] = useState(() => Math.min(startAt, slides.length - 1))
  const [fullscreen, setFullscreen] = useState(false)
  const rootRef = useRef(null)
  const touchRef = useRef(null)
  const safeIndex = Math.min(index, slides.length - 1)

  const cycleTheme = useCallback(() => {
    if (!themes.length || !onTheme) return
    const index = themes.findIndex(item => item.id === theme)
    onTheme(themes[(index + 1) % themes.length].id)
  }, [themes, theme, onTheme])
  const currentTheme = themes.find(item => item.id === theme)
  const go = useCallback(step => setIndex(current => Math.max(0, Math.min(slides.length - 1, current + step))), [slides.length])
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await rootRef.current?.requestFullscreen?.()
    } catch { /* fullscreen may be blocked */ }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    root?.focus()
    const onFullscreen = () => setFullscreen(document.fullscreenElement === root)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      if (root && document.fullscreenElement === root) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  const onKeyDown = event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const key = event.key
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(key)) { event.preventDefault(); go(1) }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(key)) { event.preventDefault(); go(-1) }
    else if (key === 'Home') { event.preventDefault(); setIndex(0) }
    else if (key === 'End') { event.preventDefault(); setIndex(slides.length - 1) }
    else if (key === 'f') { event.preventDefault(); toggleFullscreen() }
    else if (key === 't') { event.preventDefault(); cycleTheme() }
    else if (key === 'Escape' && !document.fullscreenElement) { event.preventDefault(); onClose() }
  }

  return (
    <div
      ref={rootRef}
      className="presentation anim-fade-in"
      role="dialog"
      aria-modal="true"
      aria-roledescription="slide show"
      aria-label={`Presentation, slide ${safeIndex + 1} of ${slides.length}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onTouchStart={event => { touchRef.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={event => {
        const start = touchRef.current
        const end = event.changedTouches[0]?.clientX
        if (start != null && end != null && Math.abs(end - start) > 50) go(end < start ? 1 : -1)
        touchRef.current = null
      }}
    >
      <div className="presentation-progress" aria-hidden="true"><span style={{ width: `${((safeIndex + 1) / slides.length) * 100}%` }} /></div>
      <div className="presentation-stage">
        <article key={safeIndex} className="presentation-slide rm-prose anim-fade-in" aria-roledescription="slide" aria-label={slideTitle(slides[safeIndex])}>
          {renderMarkdown(slides[safeIndex])}
        </article>
      </div>
      <div className="presentation-controls">
        <button type="button" onClick={() => go(-1)} disabled={safeIndex === 0} aria-label="Previous slide"><ChevronLeft size={18} /></button>
        <span className="presentation-counter" aria-live="polite">{safeIndex + 1} / {slides.length}</span>
        <button type="button" onClick={() => go(1)} disabled={safeIndex === slides.length - 1} aria-label="Next slide"><ChevronRight size={18} /></button>
        <span className="presentation-divider" />
        {onTheme && themes.length > 1 && (
          <button type="button" className="presentation-theme" onClick={cycleTheme} aria-label={`Theme: ${currentTheme?.label ?? theme}. Switch theme`} title="Switch theme (T)">
            <Palette size={15} /><span>{currentTheme?.label}</span>
          </button>
        )}
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} title="Fullscreen (F)">
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button type="button" onClick={onClose} aria-label="Exit presentation" title="Exit (Esc)"><X size={16} /></button>
      </div>
    </div>
  )
}
