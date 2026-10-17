import * as React from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  CreditCard,
  Grid2X2,
  Home,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  ScanBarcode,
  ScrollText,
  Settings,
  Store as StoreIcon,
  User,
  X,
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Brand } from '@/components/common/brand'
import { ExpiredBanner } from '@/components/common/expired-banner'
import { SyncStatusPill } from '@/components/common/sync-status'
import { getPosType } from '@/lib/pos-types'
import { formatDate, relativeFromNow } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth-context'
import { printerService } from '@/database/repos/printer'
import { useSubscription } from '@/state/subscription-context'
import { StatusBadge } from '@/components/common/status-badge'

interface NavItem {
  id: string
  to: string
  label: string
  icon: React.ElementType
  /** Anchor to the exact path instead of also matching sub-paths. */
  end?: boolean
}

const MAIN_NAV: NavItem[] = [
  { id: 'dashboard', to: '/', label: 'Dashboard', icon: Home, end: true },
  { id: 'pos-workspace', to: '/pos', label: 'POS Workspace', icon: Grid2X2 },
  { id: 'subscription', to: '/subscription', label: 'Subscription', icon: CreditCard },
  { id: 'profile', to: '/profile', label: 'Profile', icon: User },
]

const POS_NAV: NavItem[] = [
  { id: 'pos-overview', to: '/pos', label: 'Overview', icon: Home, end: true },
  { id: 'pos-catalog', to: '/pos/catalog', label: 'Catalog', icon: Package },
  { id: 'pos-inventory', to: '/pos/inventory', label: 'Inventory', icon: ScrollText },
  { id: 'pos-orders', to: '/pos/orders', label: 'Orders', icon: ReceiptText },
  { id: 'pos-reports', to: '/pos/reports', label: 'Reports', icon: ChartNoAxesColumnIncreasing },
  { id: 'pos-settings', to: '/pos/settings', label: 'Settings', icon: Settings },
]

/**
 * Scanner settings link — shown ONLY when the store's POS type has barcode
 * scanning enabled by an admin (the client cannot turn it on itself).
 */
const SCANNER_NAV: NavItem = {
  id: 'pos-scanner',
  to: '/pos/scanner',
  label: 'Scanner',
  icon: ScanBarcode,
}

/** POS-type sub-nav, with the Scanner entry appended when barcode is enabled. */
function posNavItems(barcodeEnabled: boolean): NavItem[] {
  return barcodeEnabled ? [...POS_NAV, SCANNER_NAV] : POS_NAV
}

/** Does `pathname` fall on this target — exactly, or under it as a sub-path? */
function underNavPath(pathname: string, to: string, end?: boolean) {
  if (to === '/') return pathname === '/'
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

/**
 * Resolve exactly ONE active nav item for the current pathname across every
 * group. Two entries target `/pos` ("POS Workspace" and "Overview"), and the
 * former has no exact anchor, so per-link matching previously lit up several
 * rows at once. Preference: an exact match, otherwise the longest matching
 * prefix. On an exact tie (two links to the same path) the first declared
 * entry wins, so a fresh `/pos` load lights the "POS Workspace" section link.
 */
function resolveActiveNavId(pathname: string, items: NavItem[]): string | null {
  const candidates = items.filter((item) => underNavPath(pathname, item.to, item.end))
  if (candidates.length === 0) return null
  const exact = candidates.filter((item) => item.to === pathname)
  const pool = exact.length > 0 ? exact : candidates
  return pool.reduce((best, item) => (item.to.length > best.to.length ? item : best)).id
}

/**
 * Nav item classes. The active state is built as a full variant (rather than
 * appending an override onto a shared base with its own `hover:bg-*`) so the
 * selected pill is reliably black instead of losing a specificity race with
 * the hover background.
 */
function navItemClass(variant: 'sidebar' | 'sheet', isActive: boolean) {
  const layout =
    variant === 'sidebar'
      ? 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
      : 'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
  const state =
    variant === 'sidebar'
      ? isActive
        ? 'bg-black text-white hover:bg-black'
        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      : isActive
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted'
  return cn(layout, state)
}

function NavItems({
  onNavigate,
  variant = 'sidebar',
  activeId,
  onActivate,
}: {
  onNavigate?: () => void
  variant?: 'sidebar' | 'sheet'
  /** The one globally-active item id (owned by the parent shell). */
  activeId: string | null
  /** Report a click so duplicate-path links (POS Workspace / Overview) can be told apart. */
  onActivate: (id: string) => void
}) {
  const { store } = useAuth()
  const posNav = posNavItems(store ? getPosType(store.posType).barcodeEnabled : false)

  const renderItem = (item: NavItem) => {
    const isActive = item.id === activeId
    return (
      <Link
        key={item.id}
        to={item.to}
        onClick={() => {
          onActivate(item.id)
          onNavigate?.()
        }}
        aria-current={isActive ? 'page' : undefined}
        className={navItemClass(variant, isActive)}
      >
        <item.icon className="size-4" aria-hidden />
        {item.label}
      </Link>
    )
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Platform
      </p>
      {MAIN_NAV.map(renderItem)}
      {store?.onboarded && (
        <>
          <p className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {getPosType(store.posType).name}
          </p>
          {posNav.map(renderItem)}
        </>
      )}
    </nav>
  )
}

function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useSubscription()
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o && unreadCount > 0) void markAllRead()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notifications (${unreadCount} unread)`}>
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <DropdownMenuLabel className="px-4 py-3">
          <div className="flex items-center justify-between">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {unreadCount} new
              </Badge>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.slice(0, 12).map((n) => (
              <div key={n.id} className="flex gap-3 border-b px-4 py-3 last:border-0">
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    n.read ? 'bg-muted' : 'bg-blue-500'
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{relativeFromNow(n.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator className="m-0" />
            <DropdownMenuItem
              className="justify-center text-xs"
              onSelect={() => {
                setOpen(false)
                navigate('/subscription')
              }}
            >
              View subscription details <ChevronRight className="size-3" />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ withLabel = false }: { withLabel?: boolean }) {
  const { user, store, logout } = useAuth()
  const { state } = useSubscription()
  const navigate = useNavigate()
  if (!user) return null
  const initials = user.fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent',
            withLabel && 'border'
          )}
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">{store?.name ?? user.businessName}</span>
            <StatusBadge status={state.status} />
          </div>
          <p className="mt-1 text-xs font-normal text-muted-foreground">
            {state.expiresAt
              ? `Active until ${formatDate(state.expiresAt)}`
              : 'No active subscription'}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <User className="size-4" /> Edit profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/subscription')}>
          <CreditCard className="size-4" /> Manage billing
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/pos/settings')}>
          <Settings className="size-4" /> POS settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            void logout().then(() => navigate('/login'))
          }}
        >
          <LogOut className="size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileBottomNav() {
  const items = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/pos', label: 'POS', icon: Grid2X2, end: false },
    { to: '/subscription', label: 'Plans', icon: CreditCard, end: false },
    { to: '/profile', label: 'Profile', icon: User, end: false },
  ]
  return (
    <nav
      className="app-bottomnav fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-6 w-14 items-center justify-center rounded-full transition-colors',
                    isActive && 'bg-muted'
                  )}
                >
                  <item.icon className="size-4.5" aria-hidden />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function AppShell() {
  const { user, store, accountStatus } = useAuth()
  const { state } = useSubscription()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const location = useLocation()
  const posDef = store ? getPosType(store.posType) : null
  const accent = posDef?.theme.accent

  // Every nav target the sidebar can show, in display order.
  const barcodeEnabled = posDef?.barcodeEnabled ?? false
  const navItems = React.useMemo(
    () => (store?.onboarded ? [...MAIN_NAV, ...posNavItems(barcodeEnabled)] : MAIN_NAV),
    [store?.onboarded, barcodeEnabled]
  )

  // The item the user last pressed. Kept separate from the route so the two
  // `/pos` links ("POS Workspace" / "Overview") can be told apart.
  const [pickedNavId, setPickedNavId] = React.useState<string | null>(null)

  // Derived during render — no effect needed. Honor the clicked item while its
  // own link still covers the current URL; otherwise fall back to the route.
  const activeNavId = React.useMemo(() => {
    const picked = pickedNavId ? navItems.find((item) => item.id === pickedNavId) : null
    if (picked && underNavPath(location.pathname, picked.to, picked.end)) return picked.id
    return resolveActiveNavId(location.pathname, navItems)
  }, [pickedNavId, navItems, location.pathname])

  React.useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Load saved printer settings as soon as a store exists, so the receipt
  // printer is ready after a reload without visiting Settings first.
  React.useEffect(() => {
    if (store?.id) void printerService.init(store.id)
  }, [store?.id])

  if (!user) return null

  return (
    <div className="flex h-svh w-full overflow-hidden bg-muted/30">
      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center justify-between border-b px-4 py-4">
          <Brand />
        </div>
        <ScrollArea className="flex-1 px-3 pb-4">
          <NavItems activeId={activeNavId} onActivate={setPickedNavId} />
        </ScrollArea>
        <div className="border-t p-3">
          <UserMenu />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="app-shell-col flex h-svh min-w-0 flex-1 flex-col lg:pl-64">
          <header className="app-header sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white lg:hidden"
                style={{ backgroundColor: accent ?? 'var(--primary)' }}
              >
                <StoreIcon className="size-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">
                  {store?.onboarded ? store.name : 'UniPOS'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {store?.onboarded ? posDef?.name : 'Complete onboarding'}
                </p>
              </div>
            </div>
            <StatusBadge status={state.status} className="hidden sm:inline-flex" />
            {accountStatus === 'unverified' && (
              <span
                className="hidden items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 sm:inline-flex"
                title="Your account status could not be verified yet. Showing cached access until it can be confirmed."
              >
                <AlertTriangle className="size-3" aria-hidden />
                Unverified
              </span>
            )}
            <SyncStatusPill />
            <NotificationBell />
            <div className="hidden lg:block">
              <UserMenu />
            </div>
          </header>
          <ExpiredBanner />
          <main className="app-shell-main min-h-0 flex-1 overflow-y-auto pb-20 md:pb-6">
            <Outlet />
          </main>
        </div>
        <SheetContent side="left" className="w-72 p-0 lg:hidden">
          <SheetHeader className="flex-row items-center justify-between border-b px-4 py-4">
            <SheetTitle asChild>
              <div>
                <Brand />
              </div>
            </SheetTitle>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close navigation">
                <X className="size-4" />
              </Button>
            </SheetTrigger>
          </SheetHeader>
          <div className="px-3 pb-6">
            <NavItems
              onNavigate={() => setMobileOpen(false)}
              variant="sheet"
              activeId={activeNavId}
              onActivate={setPickedNavId}
            />
          </div>
          <div className="absolute inset-x-3 bottom-4">
            <UserMenu withLabel />
          </div>
        </SheetContent>
      </Sheet>
      <MobileBottomNav />
    </div>
  )
}
