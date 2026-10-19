import { Check } from 'lucide-react'
import { cn } from 'cn'
import { peso } from '@/lib/format'
import { DEMO_CATALOG, DEMO_ITEMS, DEMO_STORE } from '../site'

const TILE_COLORS = [
  'bg-amber-400',
  'bg-orange-400',
  'bg-yellow-400',
  'bg-lime-400',
  'bg-emerald-400',
  'bg-sky-400',
] as const

const CART_LINES_BY_STEP: number[][] = [[], [0], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]]

function cartLines(step: number): number[] {
  return CART_LINES_BY_STEP[step] ?? []
}

function totalFor(step: number): number {
  return cartLines(step).reduce((sum, i) => {
    const item = DEMO_ITEMS[i]
    return sum + item.qty * item.unitPrice
  }, 0)
}

/**
 * A purely CSS/shadow-DOM version of the POS checkout screen.
 *
 * It backs the 3D scene: it is what visitors see while the WebGL chunk is
 * still loading, when their device cannot run WebGL, and when they have asked
 * for reduced motion. It always reflects the current step, so stepping through
 * the workflow still works without any 3D at all.
 */
export function PosScreen2D({ step }: { step: number }) {
  const lines = cartLines(step)

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-[#f2f4f9] shadow-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            U
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] leading-tight font-semibold text-foreground">
              {DEMO_STORE.name}
            </p>
            <p className="truncate text-[9px] leading-tight text-muted-foreground">
              {DEMO_STORE.terminal} · {DEMO_STORE.layout}
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Offline ready
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_38%]">
        {/* Product grid */}
        <div className="relative min-h-0 p-2">
          <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5">
            {DEMO_CATALOG.map((product, index) => {
              const selected = index === 0 && step >= 1
              const highlighted = index === 0 && step <= 1
              return (
                <div
                  key={product.name}
                  className={cn(
                    'relative flex flex-col overflow-hidden rounded-lg border bg-card p-1.5 transition-colors',
                    highlighted ? 'border-primary ring-2 ring-primary/25' : 'border-border'
                  )}
                >
                  <span
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-md text-sm font-bold text-white/90',
                      TILE_COLORS[index]
                    )}
                  >
                    {product.name.charAt(0)}
                  </span>
                  <p className="mt-1 truncate text-[9px] leading-tight font-semibold text-foreground">
                    {product.name}
                  </p>
                  <p className="text-[9px] leading-tight font-semibold text-primary">
                    {peso(product.price)}
                  </p>
                  {selected && (
                    <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded bg-emerald-500">
                      <Check className="size-3 text-white" aria-hidden />
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {step === 1 && (
            <div className="absolute inset-x-2 top-2 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600">
              Scanning barcode…
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="flex min-h-0 flex-col border-l border-border bg-card p-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-foreground">Current sale</p>
            <p className="text-[9px] text-muted-foreground">
              {lines.length} item{lines.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-hidden">
            {lines.length === 0 ? (
              <p className="pt-6 text-center text-[10px] text-muted-foreground">
                Tap a product to begin
              </p>
            ) : (
              lines.map((itemIndex) => {
                const item = DEMO_ITEMS[itemIndex]
                return (
                  <div key={item.name} className="rounded-md bg-muted px-1.5 py-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <p className="truncate text-[10px] font-semibold text-foreground">
                        {item.name}
                      </p>
                      <p className="text-[10px] font-semibold text-foreground tabular-nums">
                        {peso(item.qty * item.unitPrice)}
                      </p>
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      {item.qty} × {peso(item.unitPrice)}
                    </p>
                  </div>
                )
              })
            )}
          </div>

          <div className="mt-1.5 border-t border-border pt-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-muted-foreground">Subtotal</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {peso(totalFor(step))}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="text-[11px] font-bold text-foreground">Total</span>
              <span className="text-sm font-bold text-foreground tabular-nums">
                {peso(totalFor(step))}
              </span>
            </div>
            <div
              className={cn(
                'mt-1.5 rounded-md py-1.5 text-center text-[11px] font-bold',
                step >= 4
                  ? 'bg-emerald-500 text-white'
                  : step === 3
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/10 text-primary'
              )}
            >
              {step >= 4 ? 'Payment received' : 'Charge'}
            </div>
          </div>
        </div>
      </div>

      {/* Success overlay */}
      {step >= 3 && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0c1020]/45 p-4">
          <div className="w-full max-w-[15rem] rounded-xl bg-card p-4 text-center shadow-lg">
            <span
              className={cn(
                'mx-auto flex size-11 items-center justify-center rounded-full',
                step >= 4 ? 'bg-emerald-500' : 'bg-primary/10'
              )}
            >
              {step >= 4 ? (
                <Check className="size-6 text-white" aria-hidden />
              ) : (
                <span className="size-3.5 rounded-full bg-primary" />
              )}
            </span>
            <p className="mt-3 text-sm font-bold text-foreground">
              {step >= 4 ? 'Payment successful' : 'Confirm payment'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {step >= 4
                ? `Paid ${peso(totalFor(step))} · receipt printing`
                : `Charge ${peso(totalFor(step))} to the customer`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
