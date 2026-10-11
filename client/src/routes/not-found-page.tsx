import { Button } from '@/components/ui/button'
import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-semibold tracking-tight text-muted-foreground/40">404</p>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you are looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/">
          <Compass className="size-4" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  )
}
