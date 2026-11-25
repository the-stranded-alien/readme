import { useEffect, useRef } from 'react'

/**
 * Focuses the dialog once on open and closes it on Escape. Callbacks are read
 * from a ref, so a parent re-render (new inline onClose) doesn't re-run the
 * effect and steal focus from whatever the user is typing in.
 */
export function useDialogKeys(onClose, { focus, canClose } = {}) {
  const latest = useRef({ onClose, canClose })
  useEffect(() => { latest.current = { onClose, canClose } })
  useEffect(() => {
    focus?.()
    const onKey = event => {
      if (event.key !== 'Escape' || (latest.current.canClose && !latest.current.canClose())) return
      event.preventDefault()
      latest.current.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Run once per mount: focus on open, Escape to close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
