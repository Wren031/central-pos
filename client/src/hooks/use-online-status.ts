import * as React from 'react'
import { isOnline, subscribeOnline } from '@/offline/connectivity'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(isOnline)
  React.useEffect(() => subscribeOnline(setOnline), [])
  return online
}
