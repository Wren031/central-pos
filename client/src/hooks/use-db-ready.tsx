import * as React from 'react'
import { initDatabase, retryInitDatabase } from '@/database/db'

interface DbReadyValue {
  status: 'loading' | 'ready' | 'error'
  migrated: boolean
  error: string | null
  retry: () => Promise<void>
}

const DbReadyContext = React.createContext<DbReadyValue>({
  status: 'loading',
  migrated: false,
  error: null,
  retry: async () => {},
})

export function useDbReady(): DbReadyValue {
  return React.useContext(DbReadyContext)
}

export function DbReadyProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [migrated, setMigrated] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = React.useCallback(async (retryMode: boolean) => {
    setStatus('loading')
    setError(null)
    const result = retryMode ? await retryInitDatabase() : await initDatabase()
    if (result.ok) {
      setMigrated(result.migrated)
      setStatus('ready')
    } else {
      setError(result.error)
      setStatus('error')
    }
  }, [])

  React.useEffect(() => {
    void run(false)
  }, [run])

  const retry = React.useCallback(() => run(true), [run])

  const value = React.useMemo(
    () => ({ status, migrated, error, retry }),
    [status, migrated, error, retry]
  )

  return <DbReadyContext.Provider value={value}>{children}</DbReadyContext.Provider>
}
