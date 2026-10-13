import { motion } from 'framer-motion'

export default function FunnelChart({ steps }) {
  const max = Math.max(...steps.map((s) => s.count), 1)

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, i) => {
        const widthPct = Math.max((step.count / max) * 100, step.count > 0 ? 4 : 0)
        return (
          <div key={step.key} className="flex items-center gap-4">
            <span className="w-24 shrink-0 text-xs text-muted text-right">{step.label}</span>
            <div className="flex-1 h-9 bg-surface rounded-lg overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="h-full bg-accent rounded-lg flex items-center justify-end px-3"
              >
                {widthPct > 15 && (
                  <span className="text-xs font-medium text-white">{step.count}</span>
                )}
              </motion.div>
            </div>
            {widthPct <= 15 && (
              <span className="w-8 text-xs text-ink font-medium">{step.count}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
