import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from '../icons'

const PAD = 6
const visible = el => {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

/**
 * A short spotlight tour over elements marked data-tour="…". Keyboard: → / Enter next,
 * ← back, Esc closes. onDone(completed) is called when it ends.
 */
export default function GuidedTour({ steps, onDone }) {
  // Only steps whose element is on screen right now (e.g. AI tools hidden → skipped).
  const available = useMemo(() => steps.filter(step => visible(document.querySelector(`[data-tour="${step.target}"]`))), [steps])
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const cardRef = useRef(null)
  const step = available[index]

  const measure = useCallback(() => {
    const el = step && document.querySelector(`[data-tour="${step.target}"]`)
    if (!el) { setRect(null); return }
    const box = el.getBoundingClientRect()
    setRect({ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 })
  }, [step])
  useLayoutEffect(() => {
    document.querySelector(`[data-tour="${step?.target}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [measure, step])
  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [measure])
  useEffect(() => { cardRef.current?.querySelector('.tour-next')?.focus() }, [index])
  useEffect(() => { if (!available.length) onDone(false) }, [available.length, onDone])

  const next = () => (index >= available.length - 1 ? onDone(true) : setIndex(index + 1))
  const back = () => setIndex(Math.max(0, index - 1))
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onDone(false) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); next() }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); back() }
    else if (event.key === 'Tab') {
      // Keep focus inside the tour card.
      const items = [...cardRef.current.querySelectorAll('button:not(:disabled)')]
      const at = items.indexOf(document.activeElement)
      event.preventDefault()
      items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus()
    }
  }
  if (!step) return null

  // The card goes below the highlighted element when there is room, otherwise above it.
  const width = Math.min(340, window.innerWidth - 24)
  const below = !rect || rect.top + rect.height + 200 < window.innerHeight
  const left = rect ? Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12) : (window.innerWidth - width) / 2
  const top = rect ? (below ? rect.top + rect.height + 12 : undefined) : window.innerHeight / 3
  const bottom = rect && !below ? window.innerHeight - rect.top + 12 : undefined

  return createPortal(
    <div className="tour-layer no-print" onKeyDown={onKeyDown}>
      <div className="tour-blocker" onMouseDown={event => event.preventDefault()} />
      {rect && <div className="tour-spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} aria-hidden="true" />}
      <div ref={cardRef} className="tour-card anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text"
        style={{ width, left, top, bottom }}>
        <div className="tour-head">
          <span className="tour-count">{index + 1} of {available.length}</span>
          <button type="button" className="btn-icon" onClick={() => onDone(false)} aria-label="Close the tour"><X size={14} /></button>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-text">{step.text}</p>
        <div className="tour-dots" aria-hidden="true">{available.map((item, i) => <i key={item.target} className={i === index ? 'is-active' : ''} />)}</div>
        <div className="tour-actions">
          {index > 0 ? <button type="button" className="reader-chip" onClick={back}><ChevronLeft size={12} />Back</button> : <button type="button" className="reader-chip" onClick={() => onDone(false)}>Skip</button>}
          <button type="button" className="pdf-dialog-primary tour-next" onClick={next}>
            {index >= available.length - 1 ? 'Done' : <>Next<ChevronRight size={13} /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
