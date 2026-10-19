import { Brand } from '@/components/common/brand'
import { Button } from '@/components/ui/button'

export function LoadingScreen({ message = 'Preparing your workspace…' }: { message?: string }) {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-muted/30">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6 text-center">
        <Brand />
        <div className="flex items-center gap-3" aria-live="polite">
          <span
            className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}

export function DatabaseErrorScreen({
  error,
  onRetry,
}: {
  error: string
  onRetry: () => void
}) {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-muted/30">
      <div className="flex w-full max-w-md flex-col items-center gap-5 px-6 text-center">
        <Brand />
        <div className="w-full rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-sm font-semibold text-destructive">Local database unavailable</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            UniPOS stores data locally in your browser (IndexedDB). This device blocked
            that storage — try a normal window, disable private mode, or free up space.
          </p>
          <p className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-[11px] break-all text-muted-foreground">
            {error}
          </p>
        </div>
        <Button onClick={onRetry} className="w-full">
          Try again
        </Button>
      </div>
    </div>
  )
}
