/** Shared date-range presets for the Orders and Reports modules. */
export type DateRange = 'today' | 'week' | 'month' | '30' | 'all'

export const DATE_RANGE_DEFAULT: DateRange = 'today'

export const DATE_RANGE_OPTIONS: readonly DateRange[] = ['today', 'week', 'month', '30', 'all']

export const DATE_RANGE_LABEL: Record<DateRange, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  '30': 'Last 30 days',
  all: 'All time',
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Inclusive cutoff timestamp for a range (0 = no cutoff). Weeks start Sunday (en-PH). */
export function rangeCutoff(range: DateRange, now: Date): number {
  switch (range) {
    case 'today':
      return startOfDay(now).getTime()
    case 'week': {
      const s = startOfDay(now)
      s.setDate(s.getDate() - s.getDay())
      return s.getTime()
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    case '30':
      return now.getTime() - 30 * 86400000
    case 'all':
      return 0
  }
}
