import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Hash, StickyNote } from '../icons'

const SHOW_DELAY = 350
const HIDE_DELAY = 160

function excerptAfter(heading) {
  // First paragraph that follows the heading inside its section.
  let node = heading.nextElementSibling
  while (node && !/^(P|UL|OL|BLOCKQUOTE)$/.test(node.tagName)) {
    if (node.tagName === 'SECTION') node = node.firstElementChild?.nextElementSibling ?? null
    else node = node.nextElementSibling
  }
  const text = node?.textContent?.replace(/\s+/g, ' ').trim() || ''
  return text.length > 240 ? `${text.slice(0, 237)}…` : text
}

function describeLink(anchor, root) {
  const href = anchor.getAttribute('href') || ''
  if (href.startsWith('#')) {
    let id = href.slice(1)
    try { id = decodeURIComponent(id) } catch { /* keep raw id */ }
    const target = root.querySelector(`[id="${CSS.escape(id)}"]`)
    if (!target) return null
    if (anchor.hasAttribute('data-footnote-ref') || /^user-content-fn-/.test(id)) {
      const clone = target.cloneNode(true)
      clone.querySelectorAll('[data-footnote-backref], .heading-anchor').forEach(el => el.remove())
      const label = anchor.textContent.trim()
      return { kind: 'footnote', title: label ? `Footnote ${label}` : 'Footnote', html: clone.innerHTML }
    }
    if (/^H[1-6]$/.test(target.tagName)) {
      const clone = target.cloneNode(true)
      clone.querySelectorAll('.heading-anchor, .section-toggle').forEach(el => el.remove())
      return { kind: 'heading', title: clone.textContent.trim(), text: excerptAfter(target) }
    }
    return null
  }
  try {
    const url = new URL(anchor.href)
    if (!/^https?:$|^mailto:$/.test(url.protocol)) return null
    return {
      kind: 'external',
      title: url.protocol === 'mailto:' ? 'Email' : url.hostname.replace(/^www\./, ''),
      text: url.protocol === 'mailto:' ? url.pathname : `${url.hostname}${url.pathname === '/' ? '' : url.pathname}${url.search}`,
    }
  } catch {
    return null
  }
}

// Shows a small popover when hovering / focusing links inside the preview:
// footnote text, the target section's opening lines, or the external URL.
export default function LinkPreview({ rootRef, disabled = false }) {
  const [preview, setPreview] = useState(null)
  const popoverRef = useRef(null)
  const timers = useRef({ show: 0, hide: 0 })
  const currentAnchor = useRef(null)

  const clearTimers = () => { clearTimeout(timers.current.show); clearTimeout(timers.current.hide) }
  const hide = useCallback(() => {
    clearTimers()
    currentAnchor.current = null
    setPreview(null)
  }, [])
  const scheduleHide = useCallback(() => {
    clearTimeout(timers.current.show)
    clearTimeout(timers.current.hide)
    timers.current.hide = setTimeout(hide, HIDE_DELAY)
  }, [hide])

  useEffect(() => {
    const root = rootRef.current
    if (!root || disabled) return undefined
    const findAnchor = target => {
      const anchor = target?.closest?.('.rm-prose a[href]')
      if (!anchor || anchor.classList.contains('heading-anchor') || !root.contains(anchor)) return null
      return anchor
    }
    const show = anchor => {
      clearTimers()
      if (currentAnchor.current === anchor) return
      timers.current.show = setTimeout(() => {
        const info = describeLink(anchor, root)
        if (!info) return
        currentAnchor.current = anchor
        setPreview({ ...info, rect: anchor.getBoundingClientRect() })
      }, SHOW_DELAY)
    }
    const onOver = event => { const anchor = findAnchor(event.target); if (anchor) show(anchor) }
    const onOut = event => {
      const anchor = findAnchor(event.target)
      if (anchor && !anchor.contains(event.relatedTarget)) scheduleHide()
    }
    const onFocusIn = event => { const anchor = findAnchor(event.target); if (anchor) show(anchor) }
    const onFocusOut = event => { if (findAnchor(event.target)) scheduleHide() }
    const onKey = event => { if (event.key === 'Escape') hide() }
    root.addEventListener('mouseover', onOver)
    root.addEventListener('mouseout', onOut)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    root.addEventListener('scroll', hide, { passive: true })
    root.addEventListener('click', hide)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimers()
      root.removeEventListener('mouseover', onOver)
      root.removeEventListener('mouseout', onOut)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      root.removeEventListener('scroll', hide)
      root.removeEventListener('click', hide)
      window.removeEventListener('keydown', onKey)
    }
  }, [rootRef, disabled, hide, scheduleHide])

  // Place below the link, or above when there is no room; keep inside the viewport.
  useLayoutEffect(() => {
    const el = popoverRef.current
    if (!el || !preview) return
    const { rect } = preview
    const box = el.getBoundingClientRect()
    const below = rect.bottom + 8 + box.height < window.innerHeight - 8
    el.style.top = `${below ? rect.bottom + 8 : Math.max(8, rect.top - box.height - 8)}px`
    el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))}px`
    el.dataset.placement = below ? 'below' : 'above'
  }, [preview])

  if (!preview) return null
  const Icon = preview.kind === 'external' ? ExternalLink : preview.kind === 'footnote' ? StickyNote : Hash
  return createPortal(
    <div
      ref={popoverRef}
      className={`link-preview anim-fade-in is-${preview.kind}`}
      role="tooltip"
      onMouseEnter={() => clearTimeout(timers.current.hide)}
      onMouseLeave={scheduleHide}
    >
      <div className="link-preview-title">
        <Icon size={13} aria-hidden="true" />
        <span>{preview.title}</span>
      </div>
      {preview.html
        ? <div className="link-preview-body rm-prose" dangerouslySetInnerHTML={{ __html: preview.html }} />
        : preview.text && <div className="link-preview-body">{preview.text}</div>}
      {preview.kind === 'external' && <div className="link-preview-hint">Opens in a new tab</div>}
    </div>,
    document.body,
  )
}
