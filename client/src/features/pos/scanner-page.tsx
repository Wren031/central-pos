import * as React from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, Keyboard, ScanBarcode, ScanLine, ShieldAlert, Usb } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { scannerService } from '@/database/repos/scanner'
import { getPosType } from '@/lib/pos-types'
import { useScannerSettings } from '@/hooks/use-scanner-settings'
import { cn } from '@/lib/utils'
import type { ScannerMode } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { CameraScannerDialog } from './camera-scanner-dialog'

function ModeOption({
  selected,
  icon: Icon,
  title,
  description,
  onSelect,
}: {
  selected: boolean
  icon: React.ElementType
  title: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all',
        selected
          ? 'border-primary ring-2 ring-primary/30'
          : 'hover:border-foreground/20 hover:shadow-sm'
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {selected && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <Check className="size-3" aria-hidden />
              Active
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}

export function ScannerPage() {
  const { store } = useAuth()
  const { mode } = useScannerSettings(store?.id)
  const [testOpen, setTestOpen] = React.useState(false)
  const [lastCode, setLastCode] = React.useState<string | null>(null)

  const posDef = store ? getPosType(store.posType) : null

  function choose(next: ScannerMode) {
    if (!store || next === mode) return
    void scannerService.setMode(store.id, next)
    toast.success(next === 'usb' ? 'Using USB barcode scanner.' : 'Using camera scanner.')
  }

  if (!store) {
    return (
      <div className="w-full p-4 sm:p-6">
        <EmptyState
          icon={ScanBarcode}
          title="No POS workspace yet"
          description="Choose a POS type before configuring a scanner."
          action={
            <Button asChild>
              <Link to="/onboarding">Choose POS type</Link>
            </Button>
          }
        />
      </div>
    )
  }

  // Scanning is gated by the admin POS-type flag — the client cannot enable it.
  if (!posDef?.barcodeEnabled) {
    return (
      <div className="w-full space-y-6 p-4 sm:p-6">
        <PageHeader title="Barcode scanner" description="Scan products at checkout" />
        <Card className="shadow-none">
          <CardHeader className="flex-row items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <ShieldAlert className="size-5" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">Barcode scanning isn’t enabled</CardTitle>
              <CardDescription>
                Your POS type ({posDef?.name ?? store.posType}) doesn’t include the barcode scanner.
                An administrator controls this per POS type in the dashboard — ask them to enable it,
                then it will appear here automatically.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Barcode scanner"
        description={`How cashiers scan products for ${posDef.name}`}
      />

      <div className="space-y-3">
        <p className="text-sm font-medium">Scanning method</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeOption
            selected={mode === 'camera'}
            icon={Camera}
            title="Camera scanner"
            description="Use this device’s camera to read barcodes. Works on phones, tablets, and laptops."
            onSelect={() => choose('camera')}
          />
          <ModeOption
            selected={mode === 'usb'}
            icon={Usb}
            title="USB barcode scanner"
            description="A handheld scanner that acts like a keyboard. Plug it in and scan — no setup needed."
            onSelect={() => choose('usb')}
          />
        </div>
      </div>

      {mode === 'usb' ? (
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Keyboard className="size-5" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">Using a USB scanner</CardTitle>
              <CardDescription>
                Keyboards-emulation scanners type the barcode and press Enter automatically.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Plug the scanner into a USB port (or pair it over Bluetooth).</li>
              <li>Open the Sell screen and make sure the search field is not focused.</li>
              <li>
                Scan a product barcode — it is added to the cart automatically. Scan the same
                product again to increase its quantity.
              </li>
            </ol>
            <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Tip: most scanners can be configured to add a trailing Enter keypress. That default
              works with this POS.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ScanLine className="size-5" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">Using the camera scanner</CardTitle>
              <CardDescription>
                Grant camera permission once, then scan from the Sell screen.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              On the Sell screen, tap <strong>Scan</strong> to open the camera. Hold the barcode in
              the frame and it is added to the cart automatically.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTestOpen(true)}
              >
                <Camera className="size-4" />
                Test camera
              </Button>
              {lastCode && (
                <span className="text-sm text-muted-foreground">
                  Last scanned: <span className="font-mono text-foreground">{lastCode}</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <CameraScannerDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        onDetect={(code) => {
          setLastCode(code)
          toast.success(`Scanned ${code}`)
          // Keep the test camera open to scan more than one code.
          return false
        }}
      />
    </div>
  )
}
