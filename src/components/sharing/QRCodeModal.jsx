import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Download, X } from 'lucide-react'
import Button from '../ui/Button'
import { generateQRDataUrl, downloadDataUrl } from '../../lib/qrcode'
import { useDialogA11y } from '../../lib/useDialogA11y'

const USE_CASES = ['Books', 'Flyers', 'Posters', 'Packaging', 'Business cards', 'Events']

export default function QRCodeModal({ open, url, filename = 'sneaky-peek-qr', onClose }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const panelRef = useDialogA11y(open, onClose)

  useEffect(() => {
    if (!open || !url) return
    setError('')
    generateQRDataUrl(url)
      .then(setDataUrl)
      .catch((err) => setError(err.message))
  }, [open, url])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked — the URL is still visible to copy manually.
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm p-6"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Share experience"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-paper rounded-2xl shadow-floating border border-line p-6 max-w-sm w-full relative outline-none"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 text-muted hover:text-ink"
            >
              <X size={16} />
            </button>

            <h3 className="font-serif text-xl text-ink mb-1">Share your experience</h3>
            <p className="text-xs text-muted mb-5">Scan to preview this experience</p>

            <div className="flex justify-center mb-5">
              {error ? (
                <p className="text-sm text-accent-dim py-8">{error}</p>
              ) : dataUrl ? (
                <img
                  src={dataUrl}
                  alt={`QR code linking to ${url}`}
                  className="w-48 h-48 rounded-xl border border-line"
                />
              ) : (
                <div className="w-48 h-48 rounded-xl border border-line bg-surface animate-pulse" />
              )}
            </div>

            <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg bg-surface">
              <span className="text-xs text-muted truncate flex-1">{url}</span>
              <button onClick={handleCopy} aria-label="Copy link" className="text-muted hover:text-ink shrink-0">
                {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
              </button>
            </div>

            <Button
              variant="accent"
              className="w-full mb-4"
              disabled={!dataUrl}
              icon={Download}
              onClick={() => downloadDataUrl(dataUrl, `${filename}.png`)}
            >
              Download QR
            </Button>

            <p className="text-xs text-muted text-center">
              {USE_CASES.join(' · ')}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
