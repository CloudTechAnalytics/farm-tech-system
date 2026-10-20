import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { referenceService, type CategoryKind } from '@/features/settings/services/reference.service'
import { sitesService } from '@/features/sites/services/sites.service'

/** Reference data used across forms. Cached for 5 minutes; changes invalidate by key. */
export const refKeys = {
  units: (org: string | null) => ['ref', org, 'units'] as const,
  categories: (org: string | null) => ['ref', org, 'categories'] as const,
  members: (org: string | null) => ['ref', org, 'members'] as const,
  sites: (org: string | null) => ['ref', org, 'sites'] as const,
  stores: (org: string | null) => ['ref', org, 'stores'] as const,
  units_production: (org: string | null) => ['ref', org, 'production-units'] as const,
}

const STALE = 5 * 60_000

export function useUnits() {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: refKeys.units(activeOrgId), enabled: !!activeOrgId, staleTime: STALE, queryFn: () => referenceService.units(activeOrgId!) })
}

export function useCategories(kind?: CategoryKind, opts: { activeOnly?: boolean } = { activeOnly: true }) {
  const { activeOrgId } = useAuth()
  return useQuery({
    queryKey: refKeys.categories(activeOrgId),
    enabled: !!activeOrgId,
    staleTime: STALE,
    queryFn: () => referenceService.categories(activeOrgId!),
    select: (rows) => rows.filter((c) => (!kind || c.kind === kind) && (!opts.activeOnly || c.is_active)),
  })
}

export function useMembers() {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: refKeys.members(activeOrgId), enabled: !!activeOrgId, staleTime: STALE, queryFn: () => referenceService.members(activeOrgId!) })
}

/** Active sites the user can access (RLS already limits the rows). */
export function useSites(includeArchived = false) {
  const { activeOrgId } = useAuth()
  return useQuery({
    queryKey: [...refKeys.sites(activeOrgId), includeArchived],
    enabled: !!activeOrgId,
    staleTime: STALE,
    queryFn: () => sitesService.list(activeOrgId!, includeArchived),
  })
}

export function useStores(siteId?: string) {
  const { activeOrgId } = useAuth()
  return useQuery({
    queryKey: refKeys.stores(activeOrgId),
    enabled: !!activeOrgId,
    staleTime: STALE,
    queryFn: () => sitesService.listStores(activeOrgId!),
    select: (rows) => rows.filter((s) => s.status === 'active' && (!siteId || s.site_id === siteId)),
  })
}

export function useProductionUnits(siteId?: string, productionType?: string) {
  const { activeOrgId } = useAuth()
  return useQuery({
    queryKey: refKeys.units_production(activeOrgId),
    enabled: !!activeOrgId,
    staleTime: STALE,
    queryFn: () => sitesService.listUnits(activeOrgId!),
    select: (rows) =>
      rows.filter((u) => u.status === 'active' && (!siteId || u.site_id === siteId) && (!productionType || u.production_type === productionType)),
  })
}
