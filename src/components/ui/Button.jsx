import { motion } from 'framer-motion'

const variants = {
  primary: 'bg-ink text-paper hover:opacity-90',
  accent: 'bg-accent text-white hover:bg-accent-dim',
  ghost: 'bg-transparent text-ink hover:bg-surface',
  outline: 'bg-transparent text-ink border border-line hover:border-ink',
}

const sizes = {
  sm: 'text-sm px-3.5 py-1.5 gap-1.5',
  md: 'text-sm px-5 py-2.5 gap-2',
  lg: 'text-base px-6 py-3.5 gap-2.5',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  disabled = false,
  ...props
}) {
  return (
    <motion.button
      whileTap={disabled ? {} : { scale: 0.97 }}
      whileHover={disabled ? {} : { scale: 1.01 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-sans font-medium rounded-pill
        transition-colors disabled:opacity-40 disabled:pointer-events-none
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={2} />}
      {children}
    </motion.button>
  )
}
