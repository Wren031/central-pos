import * as React from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** Shared easing so every reveal in the page feels like one system. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const

interface RevealProps {
  children: React.ReactNode
  className?: string
  /** Seconds to wait before the reveal starts (use for staggering lists). */
  delay?: number
  /** Distance travelled, in px. */
  y?: number
  duration?: number
}

/**
 * Fades + lifts its children into view once, when scrolled near the viewport.
 * Reduced-motion users get the content instantly, with no transform at all.
 */
export function Reveal({ children, className, delay = 0, y = 18, duration = 0.55 }: RevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

/**
 * A single element inside a staggered list — same reveal, but the caller
 * supplies the index and the component handles the delay curve.
 */
export function RevealItem({
  index,
  children,
  className,
  step = 0.06,
  base = 0,
}: {
  index: number
  children: React.ReactNode
  className?: string
  step?: number
  base?: number
}) {
  return (
    <Reveal className={className} delay={base + index * step}>
      {children}
    </Reveal>
  )
}
