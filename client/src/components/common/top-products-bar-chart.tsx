import * as React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { peso } from '@/lib/format'
import { productImage } from '@/lib/mock-image'

export interface TopProductPoint {
  productId: string
  name: string
  qty: number
  revenue: number
  emoji: string
  image?: string
  rank: number
}

interface TooltipPayloadItem {
  payload: TopProductPoint
}

/** Minimum horizontal space each product gets before the chart starts scrolling. */
const SLOT_WIDTH = 104

function truncate(value: string, max = 12): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
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
  const src = point.image || productImage(point.name, point.emoji || '🛍️')
  return (
    <div className="flex min-w-44 items-center gap-3 rounded-xl border border-border/60 bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
      <img src={src} alt="" className="size-12 shrink-0 rounded-lg border object-cover" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold tabular-nums"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            {point.rank}
          </span>
          <p className="truncate text-xs font-medium text-popover-foreground">{point.name}</p>
        </div>
        <p className="mt-1 text-lg font-semibold leading-none tabular-nums text-popover-foreground">
          {point.qty}
          <span className="ml-1 text-xs font-normal text-muted-foreground">sold</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{peso(point.revenue)} revenue</p>
      </div>
    </div>
  )
}

export function TopProductsBarChart({
  data,
  accent,
  className,
}: {
  data: TopProductPoint[]
  accent: string
  className?: string
}) {
  const gradientId = React.useId()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = React.useState(false)

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [data.length])

  return (
    <div className={cn('w-full', className)}>
      <div className="flex h-4 items-center justify-end">
        {overflowing && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            scroll
            <ArrowRight className="size-3" aria-hidden />
          </span>
        )}
      </div>
      <div ref={scrollRef} className="w-full overflow-x-auto pb-1">
        <div
          className="h-64 sm:h-72"
          style={{ minWidth: `${data.length * SLOT_WIDTH}px`, width: '100%' }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              barCategoryGap="26%"
              margin={{ top: 24, right: 8, bottom: 4, left: -4 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={1} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                interval={0}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickMargin={12}
                tickFormatter={(value: string) => truncate(value)}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.5, radius: 8 }}
                content={<ChartTooltip accent={accent} />}
              />
              <Bar
                dataKey="qty"
                fill={`url(#${gradientId})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={72}
                background={{ fill: 'var(--muted)', radius: 6, opacity: 0.6 }}
                animationDuration={700}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="qty"
                  position="top"
                  offset={8}
                  fill="var(--muted-foreground)"
                  fontSize={11}
                  fontWeight={600}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
