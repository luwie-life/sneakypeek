import { motion } from 'framer-motion'

export function Card({ children, className = '', hover = true, ...props }) {
  return (
    <motion.div
      whileHover={hover ? { y: -2 } : {}}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border border-line bg-paper p-6 shadow-soft ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function GlassPanel({ children, className = '', ...props }) {
  return (
    <div
      className={`glass rounded-2xl p-4 shadow-floating ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
