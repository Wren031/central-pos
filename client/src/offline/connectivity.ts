/** Connectivity detection — online/offline with event updates. */

type Listener = (online: boolean) => void
const listeners = new Set<Listener>()

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

let online = readOnline()

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    online = true
    listeners.forEach((fn) => fn(true))
  })
  window.addEventListener('offline', () => {
    online = false
    listeners.forEach((fn) => fn(false))
  })
}

export function isOnline(): boolean {
  return online
}

export function subscribeOnline(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
