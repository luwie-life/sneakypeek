import { motion, AnimatePresence } from 'framer-motion'
import Button from '../ui/Button'
import { useDialogA11y } from '../../lib/useDialogA11y'

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  const panelRef = useDialogA11y(open, onCancel)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm p-6"
          onClick={onCancel}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-paper rounded-2xl shadow-floating border border-line p-6 max-w-sm w-full outline-none"
          >
            <h3 className="font-serif text-xl text-ink mb-2">{title}</h3>
            {description && <p className="text-sm text-muted mb-5">{description}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
              <Button variant={danger ? 'outline' : 'accent'} size="sm" onClick={onConfirm}
                className={danger ? '!border-accent-dim !text-accent-dim' : ''}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
