import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSites } from '@/shared/hooks/use-reference-data'
import type { FarmSite } from '@/features/sites/services/sites.service'

interface SiteScopeValue {
  /** '' means every site the user can access. */
  siteId: string
  setSiteId: (id: string) => void
  sites: FarmSite[]
  site: FarmSite | null
  isLoading: boolean
}

const SiteScopeContext = React.createContext<SiteScopeValue | null>(null)

/**
 * The site filter in the top bar. Remembered per organization so a worker
 * who only works one site lands on it every time.
 */
export function SiteScopeProvider({ children }: { children: React.ReactNode }) {
  const { activeOrgId } = useAuth()
  const { data: sites = [], isLoading } = useSites()
  const storageKey = `farmledger.site.${activeOrgId}`
  const [siteId, setSiteIdState] = React.useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? ''
    } catch {
      return ''
    }
  })

  // A single accessible site is selected automatically; a stale choice is dropped.
  React.useEffect(() => {
    if (isLoading) return
    if (sites.length === 1 && siteId !== sites[0].id) setSiteIdState(sites[0].id)
    else if (siteId && !sites.some((s) => s.id === siteId)) setSiteIdState('')
  }, [sites, siteId, isLoading])

  const setSiteId = React.useCallback(
    (id: string) => {
      setSiteIdState(id)
      try {
        localStorage.setItem(storageKey, id)
      } catch {
        /* not remembered */
      }
    },
    [storageKey],
  )

  const value = React.useMemo(
    () => ({ siteId, setSiteId, sites, site: sites.find((s) => s.id === siteId) ?? null, isLoading }),
    [siteId, setSiteId, sites, isLoading],
  )
  return <SiteScopeContext.Provider value={value}>{children}</SiteScopeContext.Provider>
}

export function useSiteScope(): SiteScopeValue {
  const ctx = React.useContext(SiteScopeContext)
  if (!ctx) throw new Error('useSiteScope must be used inside <SiteScopeProvider>')
  return ctx
}
