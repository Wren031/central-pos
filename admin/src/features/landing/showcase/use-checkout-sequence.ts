import * as React from 'react'
import { useMotionValue, type MotionValue } from 'motion/react'

interface Options {
  /** Total number of steps. */
  count: number
  /**
   * Per-step hold durations in ms, index-aligned with the steps. Must be a
   * stable reference (a module constant) so the timer is never restarted.
   */
  durations: readonly number[]
  /** Begin advancing as soon as the demo is active. */
  autoPlay?: boolean
  /** Wrap back to step 0 after the final step. */
  loop?: boolean
  /** When false the timer stops — used while the demo is scrolled offscreen. */
  active?: boolean
}

export interface CheckoutSequence {
  index: number
  /** Whether the step timer is currently running. */
  playing: boolean
  /** 0→1 progress through the current step, driven outside of React state. */
  progress: MotionValue<number>
  play: () => void
  pause: () => void
  toggle: () => void
  replay: () => void
  goTo: (index: number) => void
  next: () => void
  prev: () => void
}

/**
 * Drives the checkout demonstration through its steps.
 *
 * Progress is published as a `MotionValue` rather than React state so the
 * animation frame loop never re-renders the 3D scene — only an actual step
 * change does, which happens roughly every three seconds.
 */
export function useCheckoutSequence({
  count,
  durations,
  autoPlay = true,
  loop = true,
  active = true,
}: Options): CheckoutSequence {
  const [index, setIndex] = React.useState(0)
  const [playing, setPlaying] = React.useState(autoPlay)
  const progress = useMotionValue(0)

  /** Latest values, mirroring state so the frame loop never reads stale data. */
  const latest = React.useRef({ index, count, durations })
  React.useEffect(() => {
    latest.current = { index, count, durations }
  })

  /** Timestamp (performance clock) the current step started at. */
  const stepStartRef = React.useRef(0)

  const resetStepClock = React.useCallback(() => {
    stepStartRef.current = performance.now()
    progress.set(0)
  }, [progress])

  React.useEffect(() => {
    if (!playing || !active) return

    // (Re)starting the loop: keep the current progress but rebase the clock, so
    // time spent scrolled offscreen can never fast-forward the current step.
    stepStartRef.current =
      performance.now() -
      progress.get() * (latest.current.durations[latest.current.index] ?? 3000)

    let frame = 0

    const tick = (now: number) => {
      const current = latest.current.index
      const total = latest.current.count
      const duration = latest.current.durations[current] ?? 3000
      const ratio = Math.min(1, (now - stepStartRef.current) / duration)
      progress.set(ratio)

      if (ratio >= 1) {
        // Restart the clock immediately so a slow render can never double-advance.
        stepStartRef.current = now
        progress.set(0)
        if (current < total - 1) {
          setIndex(current + 1)
        } else if (loop) {
          setIndex(0)
        } else {
          setPlaying(false)
          return
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, active, loop, progress])

  /** Resume from wherever the timer currently sits. */
  const play = React.useCallback(() => {
    const elapsed =
      progress.get() * (latest.current.durations[latest.current.index] ?? 3000)
    stepStartRef.current = performance.now() - elapsed
    setPlaying(true)
  }, [progress])

  const pause = React.useCallback(() => setPlaying(false), [])

  const toggle = React.useCallback(() => {
    setPlaying((wasPlaying) => {
      if (!wasPlaying) {
        const elapsed =
          progress.get() * (latest.current.durations[latest.current.index] ?? 3000)
        stepStartRef.current = performance.now() - elapsed
      }
      return !wasPlaying
    })
  }, [progress])

  const goTo = React.useCallback(
    (target: number) => {
      const total = latest.current.count
      if (total <= 0) return
      resetStepClock()
      setIndex(((target % total) + total) % total)
    },
    [resetStepClock]
  )

  const replay = React.useCallback(() => {
    resetStepClock()
    setIndex(0)
    setPlaying(true)
  }, [resetStepClock])

  return {
    index,
    playing,
    progress,
    play,
    pause,
    toggle,
    replay,
    // Jumping to a step pauses autoplay so exploring never fights the timer.
    goTo: React.useCallback(
      (target: number) => {
        goTo(target)
        setPlaying(false)
      },
      [goTo]
    ),
    next: React.useCallback(() => {
      goTo(latest.current.index + 1)
      setPlaying(false)
    }, [goTo]),
    prev: React.useCallback(() => {
      goTo(latest.current.index - 1)
      setPlaying(false)
    }, [goTo]),
  }
}
