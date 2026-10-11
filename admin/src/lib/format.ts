const PHP = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

const PHP_SHORT = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function peso(amount: number): string {
  return PHP.format(amount)
}

export function pesoCompact(amount: number): string {
  return PHP_SHORT.format(amount)
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function relativeFromNow(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diff = d.getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ${diff >= 0 ? 'from now' : 'ago'}`
  const hours = Math.round(abs / 3600000)
  if (hours < 24) return `${hours}h ${diff >= 0 ? 'from now' : 'ago'}`
  const days = Math.round(abs / 86400000)
  if (days < 30) return `${days}d ${diff >= 0 ? 'from now' : 'ago'}`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ${diff >= 0 ? 'from now' : 'ago'}`
  return formatDate(d)
}

/** Whole days remaining until `iso` (negative when in the past). */
export function daysUntil(iso: string | Date): number {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return Math.floor((d.getTime() - Date.now()) / 86400000)
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
