import { useEffect, useRef } from 'react'

/**
 * Minimal dialog accessibility: Escape closes it, and focus moves onto the
 * dialog panel itself when it opens (so screen readers announce it and
 * keyboard users aren't left focused on a now-hidden trigger button).
 * Not a full focus trap — deliberately small, matching these dialogs'
 * scope (a couple of buttons, no complex internal navigation).
 */
export function useDialogA11y(open, onClose) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    panelRef.current?.focus()

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return panelRef
}
