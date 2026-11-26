import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Palette, StickyNote, X, ZoomIn, ZoomOut } from '../icons'
import { PRESENTATION_ZOOM, clampZoom, slideTitle, splitSlideNotes, splitSlides } from '../presentation'

const readZoom = () => { try { return clampZoom(localStorage.getItem(PRESENTATION_ZOOM.key) ?? 1) } catch { return 1 } }
const formatElapsed = ms => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`
}

/** Opens the presenter window (from a click, so popup blockers allow it) with the app's styles. */
function openPresenterWindow() {
  const popup = window.open('', 'readme-presenter', 'popup,width=960,height=640')
  if (!popup) return null
  const doc = popup.document
  doc.title = 'Presenter view — ReadMe'
  doc.head.replaceChildren(...[...document.querySelectorAll('link[rel="stylesheet"], style')].map(node => node.cloneNode(true)))
  doc.documentElement.className = document.documentElement.className
  doc.body.replaceChildren()
  doc.body.className = 'presenter-body'
  return popup
}

/**
 * Full-screen slide view of the document (one slide per H1/H2). The slide
 * body is rendered with the app's own Markdown renderer (`renderMarkdown`).
 * Text after a `???` line is speaker notes, shown in the presenter view.
 */
export default function PresentationMode({ markdown, slides: slideTexts, label, renderMarkdown, onClose, startAt = 0, themes = [], theme, onTheme }) {
  // `slides` (optional) presents just those slides, e.g. the bookmarked sections.
  const slides = useMemo(() => (slideTexts?.length ? slideTexts : splitSlides(markdown)).map(splitSlideNotes), [markdown, slideTexts])
  const [index, setIndex] = useState(() => Math.min(startAt, slides.length - 1))
  const [fullscreen, setFullscreen] = useState(false)
  const [zoom, setZoom] = useState(readZoom)
  const [presenterWin, setPresenterWin] = useState(null)
  const [inlineNotes, setInlineNotes] = useState(false)
  const [timerStart, setTimerStart] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const rootRef = useRef(null)
  const touchRef = useRef(null)
  const stageRef = useRef(null)
  const safeIndex = Math.min(index, slides.length - 1)
  const slide = slides[safeIndex]
  const hasNotes = slides.some(item => item.notes)

  const changeZoom = useCallback(next => {
    const value = clampZoom(next)
    setZoom(value)
    try { localStorage.setItem(PRESENTATION_ZOOM.key, String(value)) } catch { /* private mode */ }
  }, [])
  const zoomBy = useCallback(step => setZoom(current => {
    const value = clampZoom(current + step)
    try { localStorage.setItem(PRESENTATION_ZOOM.key, String(value)) } catch { /* private mode */ }
    return value
  }), [])

  const cycleTheme = useCallback(() => {
    if (!themes.length || !onTheme) return
    const index = themes.findIndex(item => item.id === theme)
    onTheme(themes[(index + 1) % themes.length].id)
  }, [themes, theme, onTheme])
  const currentTheme = themes.find(item => item.id === theme)
  // Slides move in the direction you're going.
  const [direction, setDirection] = useState('next')
  const go = useCallback(step => {
    setDirection(step < 0 ? 'prev' : 'next')
    setIndex(current => Math.max(0, Math.min(slides.length - 1, current + step)))
  }, [slides.length])
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await rootRef.current?.requestFullscreen?.()
    } catch { /* fullscreen may be blocked */ }
  }, [])
  const togglePresenter = useCallback(() => {
    if (inlineNotes) { setInlineNotes(false); return }
    if (presenterWin) { presenterWin.close(); setPresenterWin(null); return }
    const popup = openPresenterWindow()
    setTimerStart(Date.now())
    setNow(Date.now())
    // Popup blocked → show the notes under the slide instead.
    if (popup) setPresenterWin(popup)
    else setInlineNotes(true)
  }, [inlineNotes, presenterWin])
  // Keep the presenter window's theme in step; close it with the presentation.
  useEffect(() => {
    if (!presenterWin) return undefined
    const syncClasses = () => { presenterWin.document.documentElement.className = document.documentElement.className }
    const observer = new MutationObserver(syncClasses)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const onGone = () => setPresenterWin(null)
    presenterWin.addEventListener('pagehide', onGone)
    return () => { observer.disconnect(); presenterWin.removeEventListener('pagehide', onGone) }
  }, [presenterWin])
  const presenterRef = useRef(null)
  useEffect(() => { presenterRef.current = presenterWin }, [presenterWin])
  useEffect(() => () => presenterRef.current?.close(), [])

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

  // Timer for the presenter view.
  useEffect(() => {
    if (!presenterWin && !inlineNotes) return undefined
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [presenterWin, inlineNotes])

  // Every slide starts at its top.
  useEffect(() => { stageRef.current?.scrollTo({ top: 0 }) }, [safeIndex])

  const handleKey = event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const key = event.key
    // Long slides scroll first: ↓ / PageDown / Space scroll until the end, then move on (↑ likewise).
    const stage = stageRef.current
    const canScrollDown = stage && stage.scrollTop + stage.clientHeight < stage.scrollHeight - 2
    const canScrollUp = stage && stage.scrollTop > 2
    if (['ArrowDown', 'PageDown', ' '].includes(key) && canScrollDown) {
      event.preventDefault()
      stage.scrollBy({ top: key === 'ArrowDown' ? 80 : stage.clientHeight * 0.85, behavior: 'smooth' })
    } else if (['ArrowUp', 'PageUp', 'Backspace'].includes(key) && canScrollUp) {
      event.preventDefault()
      stage.scrollBy({ top: key === 'ArrowUp' ? -80 : -stage.clientHeight * 0.85, behavior: 'smooth' })
    } else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(key)) { event.preventDefault(); go(1) }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(key)) { event.preventDefault(); go(-1) }
    else if (key === 'Home') { event.preventDefault(); setDirection('prev'); setIndex(0) }
    else if (key === 'End') { event.preventDefault(); setDirection('next'); setIndex(slides.length - 1) }
    else if (key === '+' || key === '=') { event.preventDefault(); zoomBy(PRESENTATION_ZOOM.step) }
    else if (key === '-' || key === '_') { event.preventDefault(); zoomBy(-PRESENTATION_ZOOM.step) }
    else if (key === '0') { event.preventDefault(); changeZoom(1) }
    else if (key === 's') { event.preventDefault(); togglePresenter() }
    else if (key === 'f') { event.preventDefault(); toggleFullscreen() }
    else if (key === 't') { event.preventDefault(); cycleTheme() }
    else if (key === 'Escape' && !document.fullscreenElement) { event.preventDefault(); onClose() }
  }
  // The presenter window drives the same slide show.
  const handleKeyRef = useRef(handleKey)
  useEffect(() => { handleKeyRef.current = handleKey })
  useEffect(() => {
    if (!presenterWin) return undefined
    const onKey = event => { if (event.key !== 'Escape' && event.key !== 'f') handleKeyRef.current(event) }
    presenterWin.addEventListener('keydown', onKey)
    return () => presenterWin.removeEventListener('keydown', onKey)
  }, [presenterWin])

  const notesBody = slide.notes
    ? renderMarkdown(slide.notes)
    : <p className="presenter-empty">No notes for this slide. Add them under a line with just <code>???</code>.</p>
  const next = slides[safeIndex + 1]

  return (
    <div
      ref={rootRef}
      className="presentation anim-fade-in"
      role="dialog"
      aria-modal="true"
      aria-roledescription="slide show"
      aria-label={`${label ? `${label} presentation` : 'Presentation'}, slide ${safeIndex + 1} of ${slides.length}`}
      tabIndex={-1}
      onKeyDown={handleKey}
      onTouchStart={event => { touchRef.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={event => {
        const start = touchRef.current
        const end = event.changedTouches[0]?.clientX
        if (start != null && end != null && Math.abs(end - start) > 50) go(end < start ? 1 : -1)
        touchRef.current = null
      }}
    >
      <div className="presentation-progress" aria-hidden="true"><span style={{ width: `${((safeIndex + 1) / slides.length) * 100}%` }} /></div>
      <div className="presentation-stage" ref={stageRef}>
        <article key={safeIndex} className={`presentation-slide rm-prose slide-in-${direction}`} style={{ '--slide-zoom': zoom }} aria-roledescription="slide" aria-label={slideTitle(slide.body)}>
          {renderMarkdown(slide.body)}
        </article>
      </div>
      {inlineNotes && (
        <aside className="presentation-notes" aria-label="Speaker notes">
          <div className="presentation-notes-head"><strong>Notes</strong><span>{formatElapsed(now - timerStart)}</span>{next && <span>Next: {slideTitle(next.body)}</span>}</div>
          <div className="rm-prose">{notesBody}</div>
        </aside>
      )}
      <div className="presentation-controls">
        {label && <span className="presentation-label" title={`Presenting ${label.toLowerCase()} only`}>{label}</span>}
        <button type="button" onClick={() => go(-1)} disabled={safeIndex === 0} aria-label="Previous slide" title="Previous slide (←)"><ChevronLeft size={18} /></button>
        <span className="presentation-counter" aria-live="polite">{safeIndex + 1} / {slides.length}</span>
        <button type="button" onClick={() => go(1)} disabled={safeIndex === slides.length - 1} aria-label="Next slide" title="Next slide (→)"><ChevronRight size={18} /></button>
        <span className="presentation-divider" />
        <button type="button" onClick={() => zoomBy(-PRESENTATION_ZOOM.step)} disabled={zoom <= PRESENTATION_ZOOM.min} aria-label="Smaller text" title="Smaller text (−)"><ZoomOut size={15} /></button>
        <button type="button" className="presentation-zoom" onClick={() => changeZoom(1)} aria-label={`Text size ${Math.round(zoom * 100)}%. Reset to 100%`} title="Reset text size (0)">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => zoomBy(PRESENTATION_ZOOM.step)} disabled={zoom >= PRESENTATION_ZOOM.max} aria-label="Larger text" title="Larger text (+)"><ZoomIn size={15} /></button>
        <span className="presentation-divider" />
        <button type="button" onClick={togglePresenter} aria-pressed={Boolean(presenterWin) || inlineNotes}
          aria-label={hasNotes ? 'Presenter view with speaker notes' : 'Presenter view'} title="Presenter view: notes, next slide and timer (S)">
          <StickyNote size={15} />
        </button>
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
      {presenterWin && createPortal(
        <div className="presenter" role="region" aria-label="Presenter view">
          <header className="presenter-head">
            <span className="presenter-counter">Slide {safeIndex + 1} / {slides.length}</span>
            <span className="presenter-timer" aria-label="Elapsed time">{formatElapsed(now - timerStart)}</span>
            <button type="button" onClick={() => { setTimerStart(Date.now()); setNow(Date.now()) }}>Reset timer</button>
            <span className="presenter-clock">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </header>
          <h1 className="presenter-title">{slideTitle(slide.body)}</h1>
          <section className="presenter-notes rm-prose" aria-label="Speaker notes">{notesBody}</section>
          <footer className="presenter-foot">
            <button type="button" onClick={() => go(-1)} disabled={safeIndex === 0}>← Previous</button>
            <span className="presenter-next">{next ? <>Next: <strong>{slideTitle(next.body)}</strong></> : 'Last slide'}</span>
            <button type="button" onClick={() => go(1)} disabled={!next}>Next →</button>
          </footer>
        </div>,
        presenterWin.document.body,
      )}
    </div>
  )
}
