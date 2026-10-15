import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ShieldX } from 'lucide-react'
import { Brand } from '@/components/common/brand'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/state/auth-context'
import { ACCOUNT_SUSPENDED_MESSAGE } from '@/lib/account-status'

/**
 * Full-screen block shown for a SUSPENDED account.
 *
 * By the time this renders the local session has already been invalidated (the
 * auth context signs the account out the moment a suspension is detected), so
 * the only action is to acknowledge the block and return to sign-in. Because the
 * block is also seeded from a persistent marker, it survives a page refresh and
 * a direct navigation to any protected URL — a suspended user cannot reach the
 * POS workspace by reloading, reopening the app, or typing a route, and cannot
 * regain access by disconnecting (re-login while offline is blocked too).
 */
export function SuspendedScreen() {
  const { acknowledgeSuspension } = useAuth()
  const navigate = useNavigate()

  const onAcknowledge = React.useCallback(() => {
    acknowledgeSuspension()
    navigate('/login', { replace: true })
  }, [acknowledgeSuspension, navigate])

  return (
    <div className="flex h-svh w-full items-center justify-center bg-muted/30">
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-6 text-center">
        <Brand />
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="size-7 text-destructive" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Account suspended</h1>
          <p className="text-sm leading-relaxed text-muted-foreground" role="alert">
            {ACCOUNT_SUSPENDED_MESSAGE}
          </p>
        </div>
        <Button variant="outline" className="w-full" onClick={onAcknowledge}>
          <LogOut className="size-4" aria-hidden />
          Back to sign in
        </Button>
      </div>
    </div>
  )
}
