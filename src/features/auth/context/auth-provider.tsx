import * as React from 'react'
import { supabase } from '@/shared/lib/supabase'
import { authService, type MembershipWithOrg, type Profile } from '@/features/auth/services/auth.service'
import type { PermissionKey } from '@/shared/lib/permissions'
import { errorMessage, withTimeout } from '@/shared/lib/errors'
import { toast } from '@/shared/components/ui/misc'
import { queryClient } from '@/shared/lib/query-client'

const ACTIVE_ORG_KEY = 'farmledger.active_org'
const BOOTSTRAP_TIMEOUT_MS = 15_000
// A just-issued JWT is occasionally not yet accepted by PostgREST, or RLS sees
// auth.uid() as null for one request and returns zero rows. Retrying a few
// times with backoff absorbs it (lesson carried over from The Counsel).
const RETRY_DELAYS_MS = [600, 1200, 2000]

type Status = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: Status
  userId: string | null
  email: string | null
  profile: Profile | null
  memberships: MembershipWithOrg[]
  activeOrgId: string | null
  permissions: Set<PermissionKey>
  isPlatformAdmin: boolean
}

export interface AuthContextValue extends AuthState {
  membership: MembershipWithOrg | null
  organization: MembershipWithOrg['organization'] | null
  /** True when the member may see every site (organization-wide access). */
  hasOrgWideAccess: boolean
  has: (perm: PermissionKey) => boolean
  hasAny: (perms: PermissionKey[]) => boolean
  setActiveOrg: (orgId: string) => Promise<void>
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const initial: AuthState = {
  status: 'loading',
  userId: null,
  email: null,
  profile: null,
  memberships: [],
  activeOrgId: null,
  permissions: new Set(),
  isPlatformAdmin: false,
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function readStoredOrg(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ORG_KEY)
  } catch {
    return null
  }
}

function storeOrg(orgId: string) {
  try {
    localStorage.setItem(ACTIVE_ORG_KEY, orgId)
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(initial)
  const stateRef = React.useRef(state)
  stateRef.current = state

  const load = React.useCallback(async (userId: string | null, email: string | null, attempt = 0): Promise<void> => {
    if (!userId) {
      setState({ ...initial, status: 'unauthenticated' })
      return
    }
    setState((prev) => (prev.status === 'authenticated' && prev.userId === userId ? prev : { ...prev, status: 'loading' }))
    try {
      const [profile, memberships, isPlatformAdmin] = await withTimeout(
        Promise.all([authService.getProfile(userId), authService.getMemberships(userId), authService.isPlatformAdmin(userId)]),
        BOOTSTRAP_TIMEOUT_MS,
        'Connecting to the server timed out. Check your connection and reload.',
      )
      if (!profile && attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        return load(userId, email, attempt + 1)
      }

      const ids = memberships.map((m) => m.organization_id)
      const stored = stateRef.current.activeOrgId ?? readStoredOrg()
      const activeOrgId = stored && ids.includes(stored) ? stored : (ids[0] ?? null)
      const membership = memberships.find((m) => m.organization_id === activeOrgId) ?? null
      const keys = membership ? await authService.getPermissionKeys(membership.role_id) : []

      if (membership && keys.length === 0 && attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        return load(userId, email, attempt + 1)
      }
      if (activeOrgId) storeOrg(activeOrgId)

      setState({
        status: 'authenticated',
        userId,
        email,
        profile,
        memberships,
        activeOrgId,
        permissions: new Set(keys),
        isPlatformAdmin,
      })
    } catch (error) {
      const msg = errorMessage(error)
      if (attempt < RETRY_DELAYS_MS.length && msg.toLowerCase().includes('jwt')) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        return load(userId, email, attempt + 1)
      }
      console.error('Failed to load session', error)
      toast.error('Could not load your account', { description: msg })
      setState({ ...initial, status: 'unauthenticated' })
    }
  }, [])

  React.useEffect(() => {
    let mounted = true
    withTimeout(supabase.auth.getSession(), BOOTSTRAP_TIMEOUT_MS, 'Connecting to the server timed out.')
      .then(({ data }) => {
        if (mounted) void load(data.session?.user.id ?? null, data.session?.user.email ?? null)
      })
      .catch((error) => {
        console.error('Failed to get session', error)
        if (mounted) setState({ ...initial, status: 'unauthenticated' })
      })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY') return // the reset page handles this session
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        setState({ ...initial, status: 'unauthenticated' })
        return
      }
      if (event === 'TOKEN_REFRESHED') return
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      setTimeout(() => void load(session?.user.id ?? null, session?.user.email ?? null), 0)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [load])

  const membership = state.memberships.find((m) => m.organization_id === state.activeOrgId) ?? null

  const value = React.useMemo<AuthContextValue>(
    () => ({
      ...state,
      membership,
      organization: membership?.organization ?? null,
      hasOrgWideAccess: membership?.access_scope === 'organization',
      has: (perm) => state.permissions.has(perm),
      hasAny: (perms) => perms.some((p) => state.permissions.has(p)),
      setActiveOrg: async (orgId) => {
        storeOrg(orgId)
        queryClient.clear()
        setState((prev) => ({ ...prev, activeOrgId: orgId }))
        await load(state.userId, state.email)
      },
      refresh: () => load(state.userId, state.email),
      signOut: async () => {
        await authService.signOut()
      },
    }),
    [state, membership, load],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The active organization id. Only call inside routes guarded by RequireOrganization. */
export function useOrgId(): string {
  const { activeOrgId } = useAuth()
  if (!activeOrgId) throw new Error('No active organization')
  return activeOrgId
}

export function useCurrency(): string {
  return useAuth().organization?.currency ?? 'NGN'
}
