const OFFSET_KEY = 'cpos:v1:clock-offset-ms'

let offsetMs = readOffset()
const listeners = new Set<() => void>()

function readOffset(): number {
  const raw = localStorage.getItem(OFFSET_KEY)
  const parsed = raw === null ? 0 : Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export const mockClock = {
  now(): Date {
    return new Date(Date.now() + offsetMs)
  },
  nowIso(): string {
    return mockClock.now().toISOString()
  },
  offsetMs(): number {
    return offsetMs
  },
  advance(ms: number): void {
    offsetMs += ms
    localStorage.setItem(OFFSET_KEY, String(offsetMs))
    listeners.forEach((fn) => fn())
    window.dispatchEvent(new CustomEvent('cpos:clock-changed'))
  },
  setOffset(ms: number): void {
    offsetMs = ms
    localStorage.setItem(OFFSET_KEY, String(offsetMs))
    listeners.forEach((fn) => fn())
    window.dispatchEvent(new CustomEvent('cpos:clock-changed'))
  },
  reset(): void {
    mockClock.setOffset(0)
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

export const DAY_MS = 24 * 60 * 60 * 1000
export const HOUR_MS = 60 * 60 * 1000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}
