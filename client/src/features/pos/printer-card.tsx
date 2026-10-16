import * as React from 'react'
import {
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  BluetoothSearching,
  Loader2,
  Printer,
  RefreshCw,
  Unplug,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { printerService } from '@/database/repos/printer'
import type { PrinterState } from '@/database/repos/printer'
import { useAuth } from '@/state/auth-context'

function SignalBar({ rssi }: { rssi?: number }) {
  const pct = rssi ?? 0
  return (
    <div
      className="flex h-1.5 w-14 overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={rssi === undefined ? 'Signal unknown' : `Signal strength ${rssi}%`}
    >
      <span
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
      />
    </div>
  )
}

/**
 * Real printer settings — every state reflects actual hardware results.
 * Unsupported platforms are surfaced honestly, never faked.
 */
export function PrinterCard() {
  const { store } = useAuth()
  const [state, setState] = React.useState<PrinterState>(() => printerService.getState())

  React.useEffect(() => {
    if (!store) return
    void printerService.init(store.id)
    return printerService.subscribe(setState)
  }, [store])

  if (!store) return null

  const connected = state.connected
  const saved = state.savedDevice

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Printer className="size-4" aria-hidden />
          Receipt printer
        </CardTitle>
        <CardDescription>
          ESC/POS thermal receipt printer over Bluetooth. Works offline — no internet required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!state.supported ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{state.platform.notice}</span>
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {state.platform.notice}
          </p>
        )}

        {connected ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <BluetoothConnected className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-emerald-900">{connected.name}</p>
              <p className="text-xs text-emerald-700">
                {connected.protocol === 'spp' ? 'Classic Bluetooth (SPP)' : 'Bluetooth LE'} · Connected
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-700">
              Ready
            </Badge>
          </div>
        ) : saved ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Bluetooth className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{saved.name}</p>
              <p className="text-xs text-muted-foreground">
                Saved but not connected — reconnect to resume printing.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={state.connecting}
              onClick={() => void printerService.reconnectSaved()}
            >
              {state.connecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Reconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Bluetooth className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">No printer connected</p>
              <p className="text-xs text-muted-foreground">Scan and pair a thermal printer.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {state.supported && (
            <Button
              variant="outline"
              size="sm"
              disabled={state.scanning || state.connecting || !!connected}
              onClick={() => void printerService.scan()}
            >
              {state.scanning ? (
                <>
                  <BluetoothSearching className="size-3.5 animate-pulse" /> Scanning…
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" /> Scan
                </>
              )}
            </Button>
          )}
          {connected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void printerService.disconnect()}
            >
              <Unplug className="size-3.5" /> Disconnect
            </Button>
          )}
          {connected && (
            <Button
              size="sm"
              disabled={state.printing}
              onClick={() => {
                void printerService.testPrint(store.name)
              }}
            >
              {state.printing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Printing…
                </>
              ) : (
                <>
                  <Printer className="size-3.5" /> Test print
                </>
              )}
            </Button>
          )}
        </div>

        <Separator />

        {state.devices.length > 0 && (
          <ul className="space-y-2">
            {state.devices.map((d) => {
              const isConnecting = state.connecting
              const isThis = connected?.id === d.id
              return (
                <li
                  key={d.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-2.5',
                    isThis && 'border-emerald-300 bg-emerald-50/50'
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Bluetooth className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.protocol === 'spp' ? 'Classic Bluetooth' : 'BLE'}
                      {d.rssi !== undefined ? ` · Signal ${d.rssi}%` : ''}
                    </p>
                  </div>
                  <SignalBar rssi={d.rssi} />
                  {!isThis && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={state.connecting || !state.supported}
                      onClick={() => void printerService.connect(d)}
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" /> Pairing…
                        </>
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {state.scanning && (
          <p className="text-xs text-muted-foreground">Searching for printers nearby…</p>
        )}

        {state.error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {state.error}
          </p>
        )}

        <Separator />

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Paper width</p>
            <p className="text-xs text-muted-foreground">Matches your roll — 58mm or 80mm.</p>
          </div>
          <Select
            value={String(state.paperWidth)}
            onValueChange={(v) => void printerService.setPaperWidth(Number(v) as 58 | 80)}
          >
            <SelectTrigger className="w-32" aria-label="Paper width">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="58">58 mm</SelectItem>
              <SelectItem value="80">80 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Receipt layout — what the printed ticket looks like. */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Receipt layout</p>
            <p className="text-xs text-muted-foreground">
              Change how the printed receipt looks. Applies to sales and test prints.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm">Header style</p>
              <p className="text-xs text-muted-foreground">Large store name or a smaller one.</p>
            </div>
            <Select
              value={state.layout.headerStyle}
              onValueChange={(v) => void printerService.setLayout({ headerStyle: v as 'full' | 'compact' })}
            >
              <SelectTrigger className="w-32" aria-label="Receipt header style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm">Store address</p>
              <p className="text-xs text-muted-foreground">Print the address under the store name.</p>
            </div>
            <Switch
              checked={state.layout.showAddress}
              onCheckedChange={(v) => void printerService.setLayout({ showAddress: v })}
              aria-label="Show store address on receipt"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm">VAT / TIN line</p>
              <p className="text-xs text-muted-foreground">Print the registration TIN line.</p>
            </div>
            <Switch
              checked={state.layout.showTin}
              onCheckedChange={(v) => void printerService.setLayout({ showTin: v })}
              aria-label="Show TIN on receipt"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm">Customer name</p>
              <p className="text-xs text-muted-foreground">Print who the sale was for.</p>
            </div>
            <Switch
              checked={state.layout.showCustomer}
              onCheckedChange={(v) => void printerService.setLayout({ showCustomer: v })}
              aria-label="Show customer on receipt"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm">Unit price detail</p>
              <p className="text-xs text-muted-foreground">Show “qty × price” per item.</p>
            </div>
            <Switch
              checked={state.layout.showUnitPrice}
              onCheckedChange={(v) => void printerService.setLayout({ showUnitPrice: v })}
              aria-label="Show unit price on receipt"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm">Subtotal breakdown</p>
              <p className="text-xs text-muted-foreground">Show subtotal & discount above the total.</p>
            </div>
            <Switch
              checked={state.layout.showBreakdown}
              onCheckedChange={(v) => void printerService.setLayout({ showBreakdown: v })}
              aria-label="Show subtotal breakdown on receipt"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="receipt-footer" className="text-sm">
              Footer message
            </label>
            <Input
              id="receipt-footer"
              value={state.layout.footerText}
              maxLength={60}
              placeholder="Salamat po! Please come again."
              onChange={(e) => void printerService.setLayout({ footerText: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Printed at the bottom of every receipt.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
