import * as React from 'react'
import { DatabaseErrorScreen, LoadingScreen } from '@/components/common/boot-screens'
import { useDbReady } from '@/hooks/use-db-ready'

/**
 * Gates the entire app on IndexedDB initialization (open → migrate → seed → hydrate).
 * Renders nothing interactive until the database is ready.
 */
export function DatabaseGate({ children }: { children: React.ReactNode }) {
  const { status, error, retry } = useDbReady()
  if (status === 'loading') return <LoadingScreen />
  if (status === 'error') return <DatabaseErrorScreen error={error ?? 'Unknown error'} onRetry={() => void retry()} />
  return <>{children}</>
}
