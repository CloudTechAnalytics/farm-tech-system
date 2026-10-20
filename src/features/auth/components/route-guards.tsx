import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { FullPageLoader } from '@/shared/components/common'
import type { PermissionKey } from '@/shared/lib/permissions'

const LandingPage = lazy(async () => ({ default: (await import('@/features/landing/pages/landing-page')).LandingPage }))

/** Public landing page, also reachable directly at /welcome. */
export function Landing() {
  return (
    <Suspense fallback={<FullPageLoader label="Loading…" />}>
      <LandingPage />
    </Suspense>
  )
}

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageLoader />
  if (status === 'unauthenticated') {
    // Visitors to the root see the landing page in place (the address stays "/"), as in The Counsel.
    if (location.pathname === '/') return <Landing />
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, memberships } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageLoader />
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? (memberships.length ? '/' : '/onboarding')} replace />
  }
  return <>{children}</>
}

/** The farm workspace needs an organization; a new owner is sent to set one up. */
export function RequireOrganization() {
  const { memberships, isPlatformAdmin } = useAuth()
  if (memberships.length === 0) return <Navigate to={isPlatformAdmin ? '/platform' : '/onboarding'} replace />
  return <Outlet />
}

export function RequirePlatformAdmin() {
  const { isPlatformAdmin } = useAuth()
  if (!isPlatformAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

export function AccessRestricted({ message }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Lock className="h-5 w-5" />
      </span>
      <p className="font-display text-xl font-semibold">Access restricted</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {message ?? "Your role doesn't include this area. Ask your farm owner if you need access."}
      </p>
    </div>
  )
}

export function RequirePermission({
  permission,
  mode = 'any',
  children,
}: {
  permission: PermissionKey | PermissionKey[]
  mode?: 'any' | 'all'
  children: ReactNode
}) {
  const { has } = useAuth()
  const perms = Array.isArray(permission) ? permission : [permission]
  const ok = mode === 'all' ? perms.every(has) : perms.some(has)
  return ok ? <>{children}</> : <AccessRestricted />
}

/** Inline gate for buttons and sections. */
export function Can({ permission, children, fallback = null }: { permission: PermissionKey | PermissionKey[]; children: ReactNode; fallback?: ReactNode }) {
  const { hasAny } = useAuth()
  return hasAny(Array.isArray(permission) ? permission : [permission]) ? <>{children}</> : <>{fallback}</>
}
