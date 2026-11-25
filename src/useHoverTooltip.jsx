import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Hover/focus labels for elements with data-tip inside scrolling strips (editor
// toolbar, file tabs): CSS tooltips would be clipped there, so the label is drawn in a portal.
export function useHoverTooltip() {
  const [tip, setTip] = useState(null)
  const timerRef = useRef(null)
  const shownRef = useRef(false)
  const show = useCallback((target, immediate) => {
    clearTimeout(timerRef.current)
    const run = () => {
      const rect = target.getBoundingClientRect()
      shownRef.current = true
      setTip({ text: target.dataset.tip, x: rect.left + rect.width / 2, y: rect.bottom + 7 })
    }
    if (immediate || shownRef.current) run()
    else timerRef.current = setTimeout(run, 350)
  }, [])
  const hide = useCallback(() => {
    clearTimeout(timerRef.current)
    setTip(null)
    // Moving straight to a neighbouring button shows its label without the delay.
    timerRef.current = setTimeout(() => { shownRef.current = false }, 250)
  }, [])
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const handlers = {
    onPointerOver: event => { const target = event.target.closest?.('[data-tip]'); if (target && event.currentTarget.contains(target)) show(target) },
    onPointerOut: event => { const target = event.target.closest?.('[data-tip]'); if (target && !target.contains(event.relatedTarget)) hide() },
    onFocus: event => { const target = event.target.closest?.('[data-tip]'); if (target?.matches(':focus-visible')) show(target, true) },
    onBlur: hide,
    onPointerDown: hide,
    onScroll: hide,
  }
  const element = tip && createPortal(
    <div className="fmt-tooltip no-print" role="tooltip" style={{ left: Math.min(Math.max(tip.x, 70), window.innerWidth - 70), top: tip.y }}>{tip.text}</div>,
    document.body,
  )
  return [handlers, element]
}
