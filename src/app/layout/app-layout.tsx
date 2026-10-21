import * as React from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Building2, Check, ChevronsUpDown, ClipboardList, LayoutDashboard, LogOut, Menu, Package, Plus, UserRound, X } from 'lucide-react'
import { NAV, PLATFORM_NAV, type NavItem } from '@/app/navigation'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { useSites } from '@/shared/hooks/use-reference-data'
import { BrandLockup } from '@/shared/components/brand'
import { Button } from '@/shared/components/ui/button'
import { Select } from '@/shared/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/misc'
import { QuickRecordMenu } from '@/features/operations/components/quick-actions'
import { alertsService } from '@/features/alerts/services/alerts.service'
import { env, PRODUCT } from '@/shared/config/env'
import { cn } from '@/shared/lib/utils'

function useVisibleNav() {
  const { hasAny, isPlatformAdmin } = useAuth()
  const { data: sites } = useSites()
  // Production modules follow what the farm's sites run; everything shows until sites load.
  const runs = (t: NonNullable<NavItem['farmType']>) =>
    !sites || sites.some((s) => (t === 'poultry' ? s.has_poultry : t === 'fish' ? s.has_fish : s.has_crops))
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.permission || hasAny(i.permission)) && (!i.farmType || runs(i.farmType))) })).filter((g) => g.items.length)
  return { groups, platform: isPlatformAdmin ? PLATFORM_NAV : null }
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground',
          isActive && 'bg-surface font-medium text-foreground shadow-pill hover:bg-surface',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {item.label}
    </NavLink>
  )
}

function OrgSwitcher() {
  const { memberships, organization, membership, setActiveOrg } = useAuth()
  if (!organization) return null
  const many = memberships.length > 1
  const trigger = (
    <span className="flex w-full items-center gap-2.5 rounded-lg border bg-surface px-3 py-2 text-left shadow-card">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{organization.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{membership?.role.name}</span>
      </span>
      {many ? <ChevronsUpDown className="h-4 w-4 text-muted-foreground" /> : null}
    </span>
  )
  if (!many) return <div className="px-3">{trigger}</div>
  return (
    <div className="px-3">
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full rounded-lg">{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
          {memberships.map((m) => (
            <DropdownMenuItem key={m.organization_id} onSelect={() => void setActiveOrg(m.organization_id)}>
              <span className="flex-1 truncate">{m.organization.name}</span>
              {m.organization_id === organization.id ? <Check className="text-brand" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SidebarUser() {
  const { profile, email, signOut } = useAuth()
  const name = profile?.full_name || email || 'Account'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-black/[0.04]" aria-label="Account menu">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold shadow-pill">{initialsOf(name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/account">
            <UserRound /> My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { groups, platform } = useVisibleNav()
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="px-5 pb-4 pt-5">
        <BrandLockup />
      </div>
      <OrgSwitcher />
      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{g.label}</p>
            <div className="space-y-1.5">
              {g.items.map((item) => (
                <SidebarLink key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
        {platform ? (
          <div>
            <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">CloudTech</p>
            <SidebarLink item={platform} onNavigate={onNavigate} />
          </div>
        ) : null}
      </nav>
      <div className="space-y-2 border-t px-3 py-3">
        {env.appEnv !== 'production' ? (
          <p className="px-3 text-[11px] text-muted-foreground">
            <span className="rounded bg-warning-soft px-1.5 py-0.5 font-medium text-warning">{env.appEnv}</span>
          </p>
        ) : null}
        <SidebarUser />
      </div>
    </div>
  )
}

function SitePicker() {
  const { sites, siteId, setSiteId } = useSiteScope()
  const { hasOrgWideAccess } = useAuth()
  if (sites.length === 0) return null
  return (
    <div className="w-full max-w-[15rem]">
      <label htmlFor="site-scope" className="sr-only">
        Farm site
      </label>
      <Select id="site-scope" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9">
        {sites.length > 1 ? <option value="">{hasOrgWideAccess ? 'All sites' : 'All my sites'}</option> : null}
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

function AlertsButton() {
  const { activeOrgId } = useAuth()
  const { siteId } = useSiteScope()
  const { data } = useQuery({
    queryKey: ['alerts', activeOrgId, siteId],
    enabled: !!activeOrgId,
    queryFn: () => alertsService.list(activeOrgId!, siteId || undefined),
    staleTime: 60_000,
  })
  const count = data?.filter((a) => a.severity !== 'info').length ?? 0
  return (
    <Button asChild variant="outline" size="icon" className="relative" aria-label={`Alerts${count ? `, ${count} need attention` : ''}`}>
      <Link to="/alerts">
        <Bell />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </Link>
    </Button>
  )
}

function MobileBottomBar({ onMenu }: { onMenu: () => void }) {
  const { has } = useAuth()
  const item = 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground aria-[current=page]:text-brand'
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Quick navigation">
      <NavLink to="/" end className={item}>
        <LayoutDashboard className="h-5 w-5" /> Home
      </NavLink>
      {has('operations.view') ? (
        <NavLink to="/log" className={item}>
          <ClipboardList className="h-5 w-5" /> Log
        </NavLink>
      ) : null}
      <div className="flex flex-1 items-center justify-center">
        <QuickRecordMenu
          trigger={
            <button type="button" className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-brand text-white shadow-raised" aria-label="Record">
              <Plus className="h-6 w-6" />
            </button>
          }
        />
      </div>
      {has('inventory.view') ? (
        <NavLink to="/inventory" className={item}>
          <Package className="h-5 w-5" /> Stock
        </NavLink>
      ) : null}
      <button type="button" onClick={onMenu} className={item}>
        <Menu className="h-5 w-5" /> Menu
      </button>
    </nav>
  )
}

/**
 * Light grey sidebar beside one full-width white panel, as in a standard
 * Figma dashboard. Content fills the panel; nothing is centred with gutters.
 */
export function AppLayout() {
  const [drawer, setDrawer] = React.useState(false)
  const location = useLocation()
  React.useEffect(() => setDrawer(false), [location.pathname])
  React.useEffect(() => {
    document.title = PRODUCT.name
  }, [])

  return (
    <div className="min-h-dvh bg-background lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r shadow-raised animate-fade-in">
            <SidebarContent onNavigate={() => setDrawer(false)} />
            <button type="button" className="absolute right-2 top-4 rounded-md p-2 text-muted-foreground hover:bg-black/5" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="lg:py-2 lg:pr-2">
        <div className="print-full min-h-dvh bg-surface lg:min-h-[calc(100dvh-1rem)] lg:rounded-xl lg:border lg:shadow-card">
          <header className="no-print sticky top-0 z-20 border-b bg-surface/95 lg:rounded-t-xl">
            <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
                <Menu />
              </Button>
              <SitePicker />
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden sm:block">
                  <QuickRecordMenu
                    trigger={
                      <Button size="sm">
                        <Plus /> Record
                      </Button>
                    }
                  />
                </div>
                <AlertsButton />
              </div>
            </div>
          </header>
          <main className="px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
            <Outlet />
          </main>
        </div>
      </div>

      <MobileBottomBar onMenu={() => setDrawer(true)} />
    </div>
  )
}
