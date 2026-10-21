import * as React from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  CreditCard,
  Database,
  Download,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Settings,
  ShoppingBag,
  Store as StoreIcon,
  Users,
  Wallet,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import { useAuth } from '@/state/auth-context'

const NAV_SECTIONS: { label: string; items: { to: string; label: string; icon: React.ElementType; end?: boolean }[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Management',
    items: [
      { to: '/users', label: 'Users', icon: Users },
      { to: '/stores', label: 'Stores', icon: StoreIcon },
      { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
      { to: '/payments', label: 'Payments', icon: Wallet },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/pos-types', label: 'POS Types', icon: ShoppingBag },
      { to: '/downloads', label: 'Downloads', icon: Download },
      { to: '/logs', label: 'Activity Logs', icon: History },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/stores': 'Stores',
  '/subscriptions': 'Subscriptions',
  '/payments': 'Payments',
  '/pos-types': 'POS Types',
  '/downloads': 'Downloads',
  '/logs': 'Activity Logs',
  '/settings': 'Settings',
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Database className="size-[18px]" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">UniPOS</p>
          <p className="truncate text-[11px] text-muted-foreground">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 pt-1">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        isActive &&
                          'bg-muted text-foreground [&_svg]:text-primary',
                      )
                    }
                  >
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20">
              {initials(profile?.full_name, 'A')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.full_name || 'Admin'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{profile?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void handleLogout()}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function UserMenu() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState(false)

  async function handleLogout() {
    setBusy(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials(profile?.full_name, 'A')}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-sm font-medium sm:inline-block">
            {profile?.full_name || 'Admin'}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold">{profile?.full_name || 'Admin'}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">
            {profile?.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={busy}
          onSelect={(e) => {
            e.preventDefault()
            void handleLogout()
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminShell() {
  const [open, setOpen] = React.useState(false)
  const location = useLocation()

  React.useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const pageTitle =
    PAGE_TITLES[location.pathname] ??
    (location.pathname.startsWith('/pos-types/')
      ? 'POS Type Categories'
      : location.pathname.startsWith('/users/')
        ? 'User Details'
        : location.pathname.startsWith('/stores/')
          ? 'Store Details'
          : 'Admin')

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-background lg:flex">
          <SidebarContent />
        </aside>

        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                {pageTitle}
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                UniPOS subscription management
              </p>
            </div>
            <Badge
              variant="outline"
              className="hidden border-indigo-500/30 bg-indigo-500/10 text-indigo-400 sm:inline-flex"
            >
              Admin
            </Badge>
            <UserMenu />
          </header>

          <main className="mx-auto w-full max-w-screen-xl flex-1 space-y-6 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile sidebar */}
      <SheetContent
        side="left"
        className="w-72 border-r border-border bg-background p-0 [&>button]:text-muted-foreground"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
