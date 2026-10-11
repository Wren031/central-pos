import * as React from 'react'
import { CalendarClock, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DAY_MS, HOUR_MS, mockClock } from '@/lib/mock-clock'
import { cn } from '@/lib/utils'

export function DemoClock() {
  const [, force] = React.useReducer((x: number) => x + 1, 0)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    return mockClock.subscribe(force)
  }, [])

  const offset = mockClock.offsetMs()
  const now = mockClock.now()

  return (
    <div className="fixed right-3 bottom-20 z-50 flex flex-col items-end gap-2 md:bottom-4">
      {open && (
        <Card className="w-[min(19rem,calc(100vw-1.5rem))] p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold">Demo time machine</p>
              <p className="text-[11px] text-muted-foreground">Simulate days passing instantly</p>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setOpen(false)}
              aria-label="Close demo clock"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="mb-3 rounded-lg bg-muted/60 px-3 py-2">
            <p className="font-mono text-sm font-semibold tabular-nums">
              {now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {offset !== 0 && (
              <p className="mt-1 text-[10px] text-amber-600">
                +{Math.floor(offset / DAY_MS)}d {Math.floor((offset % DAY_MS) / HOUR_MS)}h ahead of real time
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => mockClock.advance(HOUR_MS)}>
              +1 hour
            </Button>
            <Button size="sm" variant="outline" onClick={() => mockClock.advance(DAY_MS)}>
              +1 day
            </Button>
            <Button size="sm" variant="outline" onClick={() => mockClock.advance(7 * DAY_MS)}>
              +7 days
            </Button>
            <Button size="sm" variant="outline" onClick={() => mockClock.advance(30 * DAY_MS)}>
              +30 days
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full"
            disabled={offset === 0}
            onClick={() => mockClock.reset()}
          >
            <RotateCcw className="size-3.5" />
            Reset to real time
          </Button>
        </Card>
      )}
      <Button
        size="sm"
        variant="secondary"
        className={cn('h-9 rounded-full shadow-md', open && 'ring-2 ring-ring/40')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Toggle demo time controls"
      >
        <CalendarClock className="size-4" />
        Demo clock
      </Button>
    </div>
  )
}
