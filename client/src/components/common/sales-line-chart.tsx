import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { peso, pesoCompact } from '@/lib/format'

export interface SalesPoint {
  /** Short weekday label used for the x-axis. */
  label: string
  /** Full date shown inside the tooltip. */
  dateLabel: string
  total: number
  count: number
}

interface TooltipPayloadItem {
  payload: SalesPoint
}

function ChartTooltip({
  active,
  payload,
  accent,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  accent?: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="min-w-32 rounded-lg border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-popover-foreground">{point.dateLabel}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold tabular-nums text-popover-foreground">
        <span className="size-2 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
        {peso(point.total)}
      </p>
      <p className="text-xs text-muted-foreground">
        {point.count} {point.count === 1 ? 'order' : 'orders'}
      </p>
    </div>
  )
}

export function SalesLineChart({
  data,
  accent,
  className,
}: {
  data: SalesPoint[]
  accent: string
  className?: string
}) {
  const hasSales = data.some((d) => d.total > 0)

  return (
    <div className={cn('relative h-56 w-full sm:h-64', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            tickMargin={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            tickFormatter={(value: number) => pesoCompact(value)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
            content={<ChartTooltip accent={accent} />}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke={accent}
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--card)', stroke: accent, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: accent, stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={hasSales}
          />
        </LineChart>
      </ResponsiveContainer>
      {!hasSales && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No sales recorded in the last 7 days.</p>
        </div>
      )}
    </div>
  )
}
