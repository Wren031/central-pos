import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { printerService } from '@/database/repos/printer'
import { formatDateTime, peso } from '@/lib/format'
import { formatQty } from '@/lib/units'
import { RECEIPT_FONT_PX, type Order } from '@/lib/types'

/**
 * Full, static receipt preview. The whole ticket shows at once — no typing or
 * line-by-line feed animation — so what you see matches the printed copy.
 */
export function ReceiptDialog({
  order,
  open,
  onOpenChange,
  storeName,
  storeAddress,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  storeName: string
  storeAddress: string
}) {
  const hasCash = !!order && order.paymentStatus === 'paid' && order.cashTendered != null
  // The preview mirrors the font size set in Receipt printer settings.
  const fontPx = RECEIPT_FONT_PX[printerService.getState().layout.fontSize]

  if (!order) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-3 sm:max-w-sm" data-receipt>
        <DialogHeader>
          <DialogTitle>Receipt preview</DialogTitle>
          <DialogDescription className="sr-only">
            Preview of receipt {order.receiptNo}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Printer unit — the paper feeds out of this slot. */}
          <div className="relative z-10 rounded-t-xl bg-zinc-900 px-3 pt-2.5 shadow-inner">
            <div className="flex items-center gap-2 pb-2">
              <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-zinc-300 uppercase">
                Printed
              </span>
              <Printer className="ml-auto size-3.5 text-zinc-500" aria-hidden />
            </div>
            <div
              className="h-1.5 rounded-t-sm bg-black/90 shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]"
              aria-hidden
            />
          </div>

          {/* Paper */}
          <div
            data-receipt-paper
            style={{ fontSize: `${fontPx}px` }}
            className="receipt-tear relative -mt-1 rounded-b-lg border bg-white p-4 font-mono text-black shadow-md"
          >
            <div className="text-center">
              <p className="text-[1.27em] font-bold">{storeName}</p>
              <p className="text-[0.91em]">{storeAddress}</p>
              <p className="text-[0.91em]">VAT Reg. TIN 000-000-000-000</p>
              <Separator className="my-2 bg-black/20" />
            </div>

            <div className="flex justify-between">
              <span className="font-semibold">{order.receiptNo}</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>

            <div className="mt-0.5 flex justify-between">
              <span>Customer</span>
              <span>{order.customerName ?? 'Walk-in'}</span>
            </div>

            {order.items.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="pb-1 font-semibold">Item</th>
                    <th className="pb-1 text-center font-semibold">Qty</th>
                    <th className="pb-1 text-right font-semibold">Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.productId}>
                      <td className="py-0.5 pr-1">{it.name}</td>
                      <td className="py-0.5 text-center">{formatQty(it.qty, it.unit)}</td>
                      <td className="py-0.5 text-right">{peso(it.price * it.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div>
              <Separator className="my-2 bg-black/20" />
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{peso(order.subtotal)}</span>
              </div>
            </div>

            {order.discount > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{peso(order.discount)}</span>
              </div>
            )}

            <div className="mt-1 flex justify-between text-[1.27em] font-bold">
              <span>TOTAL</span>
              <span>{peso(order.total)}</span>
            </div>

            {hasCash && (
              <div className="mt-1 flex justify-between">
                <span>Cash</span>
                <span>{peso(order.cashTendered ?? 0)}</span>
              </div>
            )}

            {hasCash && (
              <div className="flex justify-between">
                <span>Change</span>
                <span>{peso(order.change ?? 0)}</span>
              </div>
            )}

            <div className="mt-1 flex justify-between">
              <span>Status</span>
              <span className="uppercase">{order.paymentStatus}</span>
            </div>

            <div>
              <p className="mt-3 text-center text-[0.91em]">Salamat po! Please come again.</p>
              <p className="text-center text-[0.82em]">Powered by Central POS (demo)</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}