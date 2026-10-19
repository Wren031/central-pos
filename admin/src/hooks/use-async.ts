import * as React from 'react'
import { errorMessage } from '@/lib/errors'

interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/**
 * Runs an async loader whenever `deps` change (or on manual reload).
 * Always reports loading/error/empty states so pages can render skeletons
 * and error panels consistently.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList
): AsyncState<T> {
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [version, setVersion] = React.useState(0)

  const loaderRef = React.useRef(loader)
  loaderRef.current = loader

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loaderRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = React.useCallback(() => setVersion((v) => v + 1), [])

  return { data, error, loading, reload }
}

/** Debounce a string value (search inputs). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
