import { mockClock } from './mock-clock'

const PHP = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

export function peso(amount: number): string {
  return PHP.format(amount)
}

export function pesoShort(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

export function relativeFromNow(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diff = d.getTime() - mockClock.now().getTime()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ${diff >= 0 ? 'from now' : 'ago'}`
  const hours = Math.round(abs / 3600000)
  if (hours < 24) return `${hours}h ${diff >= 0 ? 'from now' : 'ago'}`
  const days = Math.round(abs / 86400000)
  return `${days}d ${diff >= 0 ? 'from now' : 'ago'}`
}
