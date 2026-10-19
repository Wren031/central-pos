import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Printer } from 'lucide-react'
import { peso } from '@/lib/format'
import { DEMO_ITEMS, DEMO_STORE, DEMO_TOTALS } from '../site'

/**
 * A crisp, readable copy of the receipt that appears once the demo reaches the
 * print step. The 3D printer feeds out physical paper, but at hero sizes that
 * paper is too small to read — this card carries the actual content (and the
 * accessible text) so the final step is legible on every screen.
 */
export function ReceiptCard({ show }: { show: boolean }) {
  const reduceMotion = useReducedMotion()
  const change = DEMO_TOTALS.cash - DEMO_TOTALS.subtotal

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 26, rotate: -2 }}
          animate={{ opacity: 1, y: 0, rotate: -1.2 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, rotate: -2 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none w-full"
        >
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
            <div className="flex items-center gap-1.5 border-b border-dashed border-slate-200 bg-slate-50 px-3 py-1.5">
              <Printer className="size-3 text-emerald-600" aria-hidden />
              <span className="text-[10px] font-semibold text-emerald-600">Printed</span>
              <span className="ml-auto text-[9px] text-slate-400">
                #{DEMO_STORE.receiptNo}
              </span>
            </div>

            <div className="px-3 py-2.5 font-mono text-[10px] leading-relaxed text-slate-700">
              <p className="text-center text-[11px] font-bold tracking-tight text-slate-900">
                {DEMO_STORE.name.toUpperCase()}
              </p>
              <p className="text-center text-[9px] text-slate-500">{DEMO_STORE.address}</p>

              <div className="my-2 border-t border-dashed border-slate-200" />

              <div className="flex justify-between text-[9px] text-slate-500">
                <span>Cashier {DEMO_STORE.cashier}</span>
                <span>{DEMO_STORE.terminal}</span>
              </div>

              <div className="my-2 border-t border-dashed border-slate-200" />

              <ul className="space-y-1">
                {DEMO_ITEMS.map((item) => (
                  <li key={item.name}>
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-semibold text-slate-900">{item.name}</span>
                      <span className="tabular-nums">
                        {peso(item.qty * item.unitPrice)}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {item.qty} × {peso(item.unitPrice)}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="my-2 border-t border-dashed border-slate-200" />

              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="tabular-nums">{peso(DEMO_TOTALS.subtotal)}</span>
              </div>
              <div className="mt-0.5 flex justify-between text-[11px] font-bold text-slate-900">
                <span>TOTAL</span>
                <span className="tabular-nums">{peso(DEMO_TOTALS.subtotal)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-500">
                <span>Cash</span>
                <span className="tabular-nums">{peso(DEMO_TOTALS.cash)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Change</span>
                <span className="tabular-nums">{peso(change)}</span>
              </div>

              <div className="my-2 border-t border-dashed border-slate-200" />

              <p className="text-center text-[9px] text-slate-500">
                Thank you, come again! · Powered by UniPOS
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
