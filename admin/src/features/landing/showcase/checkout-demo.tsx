import * as React from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { cn } from 'cn'
import { peso } from '@/lib/format'
import { CHECKOUT_DURATIONS, CHECKOUT_STEPS } from './steps'
import { useCheckoutSequence } from './use-checkout-sequence'
import { PosScreen2D } from './pos-screen-2d'
import { ReceiptCard } from './receipt-card'
import { SceneBoundary } from './scene-boundary'
import { DEMO_ITEMS, DEMO_STORE, DEMO_TOTALS } from '../site'

/**
 * three.js lives in its own chunk. Nothing here downloads it until the demo is
 * on screen and idle, so the hero paints long before the 3D bundle arrives.
 */
const CheckoutScene = React.lazy(() => import('./checkout-scene'))

function detectWebgl(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** Frames the 2D fallback so it reads as the same "device" as the 3D scene. */
function ScreenFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
      <div className="aspect-[16/10] w-full max-w-[34rem]">{children}</div>
    </div>
  )
}

export function CheckoutDemo() {
  const reduceMotion = useReducedMotion()
  const frameRef = React.useRef<HTMLDivElement>(null)
  const tiltRef = React.useRef<HTMLDivElement>(null)
  const inView = useInView(frameRef, { margin: '0px 0px -12% 0px' })

  const webgl = React.useMemo(() => detectWebgl(), [])
  const [enabled3d, setEnabled3d] = React.useState(false)
  const [sceneReady, setSceneReady] = React.useState(false)

  const sequence = useCheckoutSequence({
    count: CHECKOUT_STEPS.length,
    durations: CHECKOUT_DURATIONS,
    autoPlay: !reduceMotion,
    loop: true,
    active: inView && !reduceMotion,
  })

  const step = sequence.index
  const current = CHECKOUT_STEPS[step]
  const canRender3d = webgl && !reduceMotion
  const show3d = enabled3d && canRender3d

  // Defer mounting the WebGL scene until the demo is visible, then wait a beat
  // so it never competes with the initial paint.
  React.useEffect(() => {
    if (enabled3d || !canRender3d || !inView) return
    const timer = window.setTimeout(() => setEnabled3d(true), 350)
    return () => window.clearTimeout(timer)
  }, [enabled3d, canRender3d, inView])

  // Once the scene has drawn a frame, the 2D preview fades out and unmounts.
  const handleSceneReady = React.useCallback(() => setSceneReady(true), [])

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduceMotion || event.pointerType !== 'mouse') return
      const element = tiltRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5
      element.style.setProperty('--tilt-y', `${x * 7}deg`)
      element.style.setProperty('--tilt-x', `${y * -5}deg`)
    },
    [reduceMotion]
  )

  const handlePointerLeave = React.useCallback(() => {
    const element = tiltRef.current
    if (!element) return
    element.style.setProperty('--tilt-y', '0deg')
    element.style.setProperty('--tilt-x', '0deg')
  }, [])

  return (
    <div ref={frameRef} className="relative w-full">
      <div className="[perspective:1600px]">
        <div
          ref={tiltRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className="relative aspect-[16/10] w-full transition-transform duration-500 ease-out [transform:rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))] will-change-transform"
        >
          {/* 3D scene, cross-faded in over the 2D preview */}
          {canRender3d && (
            <div
              className={cn(
                'absolute inset-0 transition-opacity duration-500',
                sceneReady ? 'opacity-100' : 'opacity-0'
              )}
              aria-hidden
            >
              <SceneBoundary fallback={null}>
                {show3d && (
                  <React.Suspense fallback={null}>
                    <CheckoutScene step={step} active={inView} onReady={handleSceneReady} />
                  </React.Suspense>
                )}
              </SceneBoundary>
            </div>
          )}

          {/* 2D preview: first paint, reduced motion, no-WebGL, or scene failure */}
          <AnimatePresence>
            {(!show3d || !sceneReady) && (
              <motion.div
                key="preview"
                className="absolute inset-0"
                initial={false}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.4 } }}
              >
                <ScreenFrame>
                  <PosScreen2D step={step} />
                </ScreenFrame>
              </motion.div>
            )}
          </AnimatePresence>

          {/*
            The 3D paper is too small to read at hero sizes, so the receipt's
            actual content is surfaced as a legible card. It overlays the scene
            on wider screens; smaller screens get the screen-reader summary and
            the printed paper in the scene.
          */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden w-[16rem] sm:block">
            <ReceiptCard show={step === 4} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        className="mt-5"
        // Freeze the demonstration when a keyboard user reaches the controls,
        // so it never moves under them while they navigate.
        onFocusCapture={sequence.pause}
      >
        {/*
          Reduced-motion visitors step through by hand: no autoplay and no
          timer, just the step chips.
        */}
        {!reduceMotion && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <motion.div
              style={{ scaleX: sequence.progress }}
              className="h-full origin-left rounded-full bg-primary"
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Checkout steps">
            {CHECKOUT_STEPS.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => sequence.goTo(index)}
                  aria-current={index === step ? 'step' : undefined}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm transition-colors',
                    index === step
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-border bg-background/70 text-foreground/75 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="mr-1 tabular-nums opacity-60">{index + 1}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-3 min-h-10 text-sm text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">
            Step {step + 1} of {CHECKOUT_STEPS.length}: {current.label}.
          </span>{' '}
          {current.caption}
        </p>

        {/* The receipt in plain text, for assistive tech at every breakpoint. */}
        <div className="sr-only">
          <h3>Sample receipt</h3>
          <p>
            {DEMO_STORE.name}, {DEMO_STORE.address}. Receipt {DEMO_STORE.receiptNo}. Cashier{' '}
            {DEMO_STORE.cashier}.
          </p>
          <ul>
            {DEMO_ITEMS.map((item) => (
              <li key={item.name}>
                {item.name}, quantity {item.qty}, {peso(item.unitPrice)} each, {peso(item.qty * item.unitPrice)}{' '}
                total.
              </li>
            ))}
          </ul>
          <p>Subtotal {peso(DEMO_TOTALS.subtotal)}. Cash {peso(DEMO_TOTALS.cash)}.</p>
          <p>These are sample products shown for demonstration only; no real sale is created.</p>
        </div>
      </div>
    </div>
  )
}
