import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SHOW_DELAY = 450
const GAP = 7
const MARGIN = 8

/**
 * One floating tooltip for every element with `data-tip`, in the same style as the
 * `data-tooltip` buttons. It is drawn above everything, so scrolling panels (the tab
 * bar, the file list) can't clip it. Shows after a short hover or on keyboard focus;
 * hides on leave, click, scroll or Escape.
 */
export default function GlobalTooltip() {
  const [tip, setTip] = useState(null) // { text, x, y, place }
  const anchorRef = useRef(null)
  const timerRef = useRef(0)
  const boxRef = useRef(null)

  useEffect(() => {
    const hide = () => { clearTimeout(timerRef.current); anchorRef.current = null; setTip(null) }
    const show = el => {
      const text = el.getAttribute('data-tip')
      if (!text) return
      const rect = el.getBoundingClientRect()
      const below = rect.bottom + 60 < window.innerHeight
      setTip({ text, x: rect.left + rect.width / 2, y: below ? rect.bottom + GAP : rect.top - GAP, place: below ? 'below' : 'above' })
    }
    const onOver = event => {
      const el = event.target.closest?.('[data-tip]')
      if (el === anchorRef.current) return
      clearTimeout(timerRef.current)
      anchorRef.current = el
      setTip(null)
      if (el) timerRef.current = setTimeout(() => { if (anchorRef.current === el && el.isConnected) show(el) }, SHOW_DELAY)
    }
    const onFocus = event => {
      const el = event.target.closest?.('[data-tip]')
      if (!el || !el.matches(':focus-visible')) return
      clearTimeout(timerRef.current)
      anchorRef.current = el
      show(el)
    }
    const onBlur = event => { if (event.target === anchorRef.current) hide() }
    const onKey = event => { if (event.key === 'Escape') hide() }
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      clearTimeout(timerRef.current)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Keep it inside the window.
  useEffect(() => {
    const box = boxRef.current
    if (!tip || !box) return
    const width = box.offsetWidth
    const left = Math.min(Math.max(tip.x - width / 2, MARGIN), window.innerWidth - width - MARGIN)
    box.style.left = `${left}px`
    box.style.visibility = 'visible'
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div ref={boxRef} className={`app-tooltip is-${tip.place}`} role="tooltip"
      style={{ top: tip.place === 'below' ? tip.y : undefined, bottom: tip.place === 'above' ? window.innerHeight - tip.y : undefined, visibility: 'hidden' }}>
      {tip.text}
    </div>,
    document.body,
  )
}
