import { motion } from 'framer-motion'

/**
 * RevealMark — the Sneaky Peek brand symbol.
 * Two curved forms flanking a central point: peeking, revealing, curiosity.
 *
 * <RevealMark size={32} variant="icon" animated animationState="idle" color="var(--sp-accent)" />
 *
 * variants:
 *  - "icon"      → mark only
 *  - "wordmark"  → mark + "Sneaky Peek" text
 *  - "favicon"   → simplified, high-contrast, for tiny sizes
 *
 * animationState:
 *  - "idle"      → gentle breathing loop
 *  - "opening"   → brackets part to reveal the center (use on load / success)
 *  - "thinking"  → center pulses (use for AI generation states)
 *  - "hover"     → brackets widen slightly (drive via whileHover instead if interactive)
 */
export default function RevealMark({
  size = 32,
  variant = 'icon',
  animated = false,
  animationState = 'idle',
  color = 'var(--sp-accent)',
  strokeColor = 'var(--sp-ink)',
  className = '',
}) {
  const gap =
    animationState === 'opening' || animationState === 'hover' ? 15 : 10

  const centerScale = animationState === 'thinking' ? [1, 1.35, 1] : 1
  const centerOpacity = animationState === 'thinking' ? [1, 0.5, 1] : 1

  const bracketTransition = animated
    ? {
        duration: 0.56,
        ease: [0.16, 1, 0.3, 1],
      }
    : { duration: 0 }

  const idleLoop =
    animated && animationState === 'idle'
      ? {
          y: [0, -1.5, 0],
          transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
        }
      : {}

  const centerLoop =
    animated && animationState === 'thinking'
      ? {
          scale: centerScale,
          opacity: centerOpacity,
          transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
        }
      : {}

  const mark = (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Left bracket */}
      <motion.path
        d="M20 10C14 14 11 19 11 24C11 29 14 34 20 38"
        stroke={strokeColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
        animate={{
          d: `M${20 - (gap - 10)} 10C14 14 11 19 11 24C11 29 14 34 ${
            20 - (gap - 10)
          } 38`,
          ...idleLoop,
        }}
        transition={bracketTransition}
      />
      {/* Right bracket */}
      <motion.path
        d="M28 10C34 14 37 19 37 24C37 29 34 34 28 38"
        stroke={strokeColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
        animate={{
          d: `M${28 + (gap - 10)} 10C34 14 37 19 37 24C37 29 34 34 ${
            28 + (gap - 10)
          } 38`,
          ...idleLoop,
        }}
        transition={bracketTransition}
      />
      {/* Center point */}
      <motion.circle
        cx="24"
        cy="24"
        r="3.4"
        fill={color}
        animate={centerLoop}
      />
    </motion.svg>
  )

  if (variant === 'wordmark') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        {mark}
        <span
          className="font-sans font-semibold tracking-tight"
          style={{ fontSize: size * 0.6, color: strokeColor }}
        >
          Sneaky Peek
        </span>
      </div>
    )
  }

  return mark
}
