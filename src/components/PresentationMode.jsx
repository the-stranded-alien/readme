import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Eraser, Loader2, Hourglass, LaserPointer, ListTree, Maximize2, Minimize2, Palette, PanelLeftClose, Pause, Pencil, Pin, Play, StickyNote, X, ZoomIn, ZoomOut } from '../icons'
import { PRESENTATION_ZOOM, clampZoom, slideTitle, splitSlideNotes, splitSlides } from '../presentation'
import { DEFAULT_PRESENTATION_SETTINGS, INK_COLORS, inkColor, splitOptions } from '../presentationSettings'
import InkLayer from './InkLayer'

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
export default function PresentationMode({ markdown, slides: slideTexts, label, renderMarkdown, onClose, startAt = 0, themes = [], theme, onTheme, settings = DEFAULT_PRESENTATION_SETTINGS, onSettings, onExport, exporting }) {
  // `slides` (optional) presents just those slides, e.g. the bookmarked sections.
  const { splitLevel, splitRules } = settings
  const slides = useMemo(() => (slideTexts?.length ? slideTexts : splitSlides(markdown, splitOptions({ splitLevel, splitRules }))).map(splitSlideNotes),
    [markdown, slideTexts, splitLevel, splitRules])
  const [index, setIndex] = useState(() => Math.min(startAt, slides.length - 1))
  const [fullscreen, setFullscreen] = useState(false)
  const [zoom, setZoom] = useState(() => (settings.zoom === 'last' ? readZoom() : clampZoom(settings.zoom)))
  const [contentsOpen, setContentsOpen] = useState(settings.showContents)
  // Pen and laser: `tool` is null, 'pen' or 'laser'.
  const [tool, setTool] = useState(null)
  const [penMode, setPenMode] = useState(settings.penMode)
  const [clearToken, setClearToken] = useState(0)
  const [penColor, setPenColor] = useState(settings.penColor)
  const [hasInk, setHasInk] = useState(false)
  // Pen options open when the pen comes on and fold away once you start drawing.
  const [penTrayOpen, setPenTrayOpen] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef(null)
  // The download menu closes on a click outside it.
  useEffect(() => {
    if (!exportOpen) return undefined
    const onDown = event => { if (!exportRef.current?.contains(event.target)) setExportOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [exportOpen])
  // A colour picked in the toolbar becomes the default too.
  const choosePenColor = useCallback(id => {
    setPenColor(id)
    onSettings?.(current => ({ ...current, penColor: id }))
  }, [onSettings])
  // Blank screen (B black / W white), and auto-advance.
  const [blank, setBlank] = useState(null)
  const [playing, setPlaying] = useState(settings.autoAdvance > 0)
  const [startedAt] = useState(() => Date.now())
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
  const goTo = useCallback(target => {
    setDirection(target < safeIndex ? 'prev' : 'next')
    setIndex(Math.max(0, Math.min(slides.length - 1, target)))
  }, [safeIndex, slides.length])
  const toggleTool = useCallback(name => {
    if (name === 'pen') setPenTrayOpen(true)
    setTool(current => (current === name ? null : name))
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
    if (!presenterWin && !inlineNotes && !settings.showTimer) return undefined
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [presenterWin, inlineNotes, settings.showTimer])

  // Auto-advance: the next slide after the chosen number of seconds (stops on the last one).
  useEffect(() => {
    if (!playing || !settings.autoAdvance || safeIndex >= slides.length - 1 || blank) return undefined
    const timer = setTimeout(() => go(1), settings.autoAdvance * 1000)
    return () => clearTimeout(timer)
  }, [playing, settings.autoAdvance, safeIndex, slides.length, go, blank])

  // The contents list keeps the current slide in view.
  useEffect(() => {
    if (!contentsOpen) return
    rootRef.current?.querySelector('.presentation-contents-list .is-current')?.scrollIntoView?.({ block: 'nearest' })
  }, [contentsOpen, safeIndex])
  // Every slide starts at its top.
  useEffect(() => { stageRef.current?.scrollTo({ top: 0 }) }, [safeIndex])

  const handleKey = event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.target?.closest?.('select, input, textarea')) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
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
    else if (key === 'l') { event.preventDefault(); toggleTool('laser') }
    else if (key === 'd') { event.preventDefault(); toggleTool('pen') }
    else if (key === 'c') { event.preventDefault(); setClearToken(token => token + 1) }
    else if (key === 'o') { event.preventDefault(); setContentsOpen(open => !open) }
    else if (key === 'b' || key === 'w') { event.preventDefault(); setBlank(current => (current === (key === 'b' ? 'black' : 'white') ? null : (key === 'b' ? 'black' : 'white'))) }
    else if (key === 'f') { event.preventDefault(); toggleFullscreen() }
    else if (key === 't') { event.preventDefault(); cycleTheme() }
    else if (key === 'Escape' && exportOpen) { event.preventDefault(); setExportOpen(false) }
    else if (key === 'Escape' && blank) { event.preventDefault(); setBlank(null) }
    else if (key === 'Escape' && tool) { event.preventDefault(); setTool(null) }
    else if (key === 'Escape' && !document.fullscreenElement) { event.preventDefault(); onClose() }
  }
  // The presenter window drives the same slide show.
  const handleKeyRef = useRef(handleKey)
  useEffect(() => { handleKeyRef.current = handleKey })
  // If focus falls out of the slide show (e.g. the focused button was removed), keys still work.
  useEffect(() => {
    const onKey = event => {
      if (event.target === document.body || event.target === document.documentElement) handleKeyRef.current(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
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
      className={`presentation anim-fade-in${tool ? ` has-tool-${tool}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-roledescription="slide show"
      aria-label={`${label ? `${label} presentation` : 'Presentation'}, slide ${safeIndex + 1} of ${slides.length}`}
      tabIndex={-1}
      onKeyDown={handleKey}
      onTouchStart={event => { touchRef.current = tool === 'pen' ? null : event.touches[0]?.clientX ?? null }}
      onTouchEnd={event => {
        const start = touchRef.current
        const end = event.changedTouches[0]?.clientX
        if (start != null && end != null && Math.abs(end - start) > 50) go(end < start ? 1 : -1)
        touchRef.current = null
      }}
    >
      {settings.showProgress && <div className="presentation-progress" aria-hidden="true"><span style={{ width: `${((safeIndex + 1) / slides.length) * 100}%` }} /></div>}
      <div className="presentation-body">
        {contentsOpen && (
          <aside className="presentation-contents anim-slide-left" aria-label="Slides">
            <div className="presentation-contents-head">
              <ListTree size={13} aria-hidden="true" />
              <strong>Slides</strong>
              <span>{slides.length}</span>
              <button type="button" className="btn-icon !p-1" onClick={() => { setContentsOpen(false); rootRef.current?.focus() }} aria-label="Hide slide contents" title="Hide contents (O)">
                <PanelLeftClose size={13} />
              </button>
            </div>
            <ol className="presentation-contents-list">
              {slides.map((item, slideIndex) => (
                <li key={slideIndex}>
                  <button type="button" className={slideIndex === safeIndex ? 'is-current' : ''} aria-current={slideIndex === safeIndex ? 'step' : undefined}
                    onClick={() => goTo(slideIndex)} title={`Go to slide ${slideIndex + 1}`}>
                    <span className="presentation-contents-num">{slideIndex + 1}</span>
                    <span className="presentation-contents-title">{slideTitle(item.body)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
        <div className="presentation-main">
          <div className="presentation-stage" ref={stageRef}>
            <article key={safeIndex} className={`presentation-slide rm-prose slide-in-${direction}`} style={{ '--slide-zoom': zoom }} aria-roledescription="slide" aria-label={slideTitle(slide.body)}>
              {renderMarkdown(slide.body)}
            </article>
          </div>
          <InkLayer tool={tool} penMode={penMode} penColor={inkColor(penColor)} onInkChange={setHasInk} onDrawStart={() => setPenTrayOpen(false)} penWidth={settings.penWidth}
            fadeSeconds={settings.fadeSeconds} laserColor={inkColor(settings.laserColor)} slide={safeIndex} clearToken={clearToken}
            onScroll={delta => stageRef.current?.scrollBy({ top: delta })} />
          {inlineNotes && (
            <aside className="presentation-notes" aria-label="Speaker notes">
              <div className="presentation-notes-head"><strong>Notes</strong><span>{formatElapsed(now - timerStart)}</span>{next && <span>Next: {slideTitle(next.body)}</span>}</div>
              <div className="rm-prose">{notesBody}</div>
            </aside>
          )}
        </div>
      </div>
      {blank && (
        <button type="button" className={`presentation-blank is-${blank}`} onClick={() => setBlank(null)}
          aria-label="Screen blanked. Click or press Escape to show the slide again" />
      )}
      <div className="presentation-controls">
        <button type="button" onClick={() => setContentsOpen(open => !open)} aria-pressed={contentsOpen}
          aria-label={contentsOpen ? 'Hide slide contents' : 'Show slide contents'} title={`${contentsOpen ? 'Hide' : 'Show'} contents to jump to a slide (O)`}>
          <ListTree size={15} />
        </button>
        {label && <span className="presentation-label" title={`Presenting ${label.toLowerCase()} only`}>{label}</span>}
        <button type="button" onClick={() => go(-1)} disabled={safeIndex === 0} aria-label="Previous slide" title="Previous slide (←)"><ChevronLeft size={18} /></button>
        <span className="presentation-counter" aria-live="polite">{safeIndex + 1} / {slides.length}</span>
        <button type="button" onClick={() => go(1)} disabled={safeIndex === slides.length - 1} aria-label="Next slide" title="Next slide (→)"><ChevronRight size={18} /></button>
        {settings.autoAdvance > 0 && (
          <button type="button" onClick={() => setPlaying(value => !value)} aria-pressed={playing}
            aria-label={playing ? 'Pause auto-advance' : 'Resume auto-advance'} title={`${playing ? 'Pause' : 'Resume'} auto-advance (every ${settings.autoAdvance}s)`}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
        )}
        {settings.showTimer && <span className="presentation-timer" title="Time since the presentation started" aria-label="Elapsed time">{formatElapsed(now - startedAt)}</span>}
        <span className="presentation-divider" />
        <button type="button" onClick={() => toggleTool('laser')} aria-pressed={tool === 'laser'} aria-label="Laser pointer" title="Laser pointer: a dot that follows your pointer (L)">
          <LaserPointer size={15} />
        </button>
        <button type="button" onClick={() => toggleTool('pen')} aria-pressed={tool === 'pen'} aria-label="Pen" title={`Pen: draw on the slide (D). ${penMode === 'fade' ? 'Ink fades away' : 'Ink stays until cleared'}`}>
          <Pencil size={15} />
        </button>
        {tool === 'pen' && !penTrayOpen && (
          <button type="button" className="presentation-pen-summary" onClick={() => setPenTrayOpen(true)} aria-expanded={false}
            aria-label={`Pen options: ${INK_COLORS.find(color => color.id === penColor)?.label} ${penMode === 'fade' ? 'fading' : 'permanent'} ink`}
            title="Pen options: mode, colour and clear">
            <span className="presentation-pen-dot" style={{ '--ink': inkColor(penColor) }} />
            {penMode === 'fade' ? <Hourglass size={12} /> : <Pin size={12} />}
            <ChevronRight size={12} />
          </button>
        )}
        {tool === 'pen' && penTrayOpen && (
          <div className="presentation-pen-tray" role="group" aria-label="Pen options">
            <div className="presentation-pen-modes" role="radiogroup" aria-label="Pen mode">
              <button type="button" role="radio" aria-checked={penMode === 'fade'} className={penMode === 'fade' ? 'is-on' : ''} onClick={() => setPenMode('fade')}
                title={`Fading ink: trails away like a comet (${settings.fadeSeconds}s)`}>
                <Hourglass size={13} /><span>Fading</span>
              </button>
              <button type="button" role="radio" aria-checked={penMode === 'permanent'} className={penMode === 'permanent' ? 'is-on' : ''} onClick={() => setPenMode('permanent')}
                title="Permanent ink: stays on this slide until you clear it">
                <Pin size={13} /><span>Permanent</span>
              </button>
            </div>
            <div className="presentation-pen-colors" role="radiogroup" aria-label="Pen colour">
              {INK_COLORS.map(color => (
                <button key={color.id} type="button" role="radio" aria-checked={penColor === color.id} aria-label={color.label} title={`${color.label} ink`}
                  className={`presentation-pen-color${penColor === color.id ? ' is-on' : ''}`} style={{ '--ink': color.value }} onClick={() => choosePenColor(color.id)} />
              ))}
            </div>
            <button type="button" className="presentation-pen-clear" onClick={() => setClearToken(token => token + 1)} disabled={!hasInk}
              aria-label="Clear drawings on this slide" title={hasInk ? 'Clear the drawings on this slide (C)' : 'Nothing drawn on this slide yet'}>
              <Eraser size={13} /><span>Clear</span>
            </button>
          </div>
        )}
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
        {onExport && (
          <span className="presentation-export" ref={exportRef}>
            <button type="button" onClick={() => setExportOpen(open => !open)} aria-haspopup="menu" aria-expanded={exportOpen}
              aria-label="Download slides" title="Download these slides as PDF or PowerPoint" disabled={Boolean(exporting)}>
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            </button>
            {exportOpen && (
              <div className="presentation-export-menu" role="menu" aria-label="Download slides">
                {[['pdf', 'PDF (landscape)', '.pdf'], ['pptx', 'PowerPoint', '.pptx']].map(([format, label, ext]) => (
                  <button key={format} type="button" role="menuitem" onClick={() => { setExportOpen(false); onExport(format, slides) }}>
                    <span>{label}</span><span className="presentation-export-ext">{ext}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
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
