import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Button from '../ui/Button'
import { useDialogA11y } from '../../lib/useDialogA11y'

const REASONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'missing_features', label: "Missing a feature I need" },
  { value: 'not_using', label: "Not using it enough" },
  { value: 'other', label: 'Other' },
]

export default function CancelSubscriptionDialog({ open, planName, accessEndsLabel, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
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
            role="dialog"
            aria-modal="true"
            aria-label={`Cancel ${planName} plan`}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-paper rounded-2xl shadow-floating border border-line p-6 max-w-sm w-full outline-none"
          >
            <h3 className="font-serif text-xl text-ink mb-2">Cancel {planName}?</h3>
            <p className="text-sm text-muted mb-4">
              {accessEndsLabel
                ? `You'll keep full access until ${accessEndsLabel}. After that, your plan drops to Free — your experiences and data stay exactly as they are, but plan-specific limits apply again.`
                : "Your plan drops to Free — your experiences and data stay exactly as they are, but plan-specific limits apply again."}
            </p>

            <label className="flex flex-col gap-1.5 mb-5">
              <span className="text-xs text-muted">Mind telling us why? (optional)</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-sm rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-accent"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="accent" size="sm" onClick={onCancel}>
                Keep my plan
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="!border-accent-dim !text-accent-dim"
                onClick={() => onConfirm(reason)}
              >
                Cancel subscription
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
