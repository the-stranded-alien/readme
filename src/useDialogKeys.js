import { useEffect, useRef } from 'react'

/**
 * Focuses the dialog once on open and closes it on Escape. `topmost` dialogs (opened over
 * another dialog) catch Escape first so only they close. Callbacks are read
 * from a ref, so a parent re-render (new inline onClose) doesn't re-run the
 * effect and steal focus from whatever the user is typing in.
 */
export function useDialogKeys(onClose, { focus, canClose, topmost = false } = {}) {
  const latest = useRef({ onClose, canClose })
  useEffect(() => { latest.current = { onClose, canClose } })
  useEffect(() => {
    focus?.()
    const onKey = event => {
      if (event.key !== 'Escape' || (latest.current.canClose && !latest.current.canClose())) return
      event.preventDefault()
      // A dialog opened on top of another (confirm, prompt) handles Escape first and alone.
      if (topmost) event.stopImmediatePropagation()
      latest.current.onClose()
    }
    window.addEventListener('keydown', onKey, topmost)
    return () => window.removeEventListener('keydown', onKey, topmost)
    // Run once per mount: focus on open, Escape to close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
