import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/database.generated'

export interface Alert {
  alert_key: string
  kind: 'low_stock' | 'high_mortality' | 'high_rejection' | 'missing_records' | 'overdue_activity' | 'upcoming_activity' | 'upcoming_harvest'
  severity: 'critical' | 'warning' | 'info'
  site_id: string
  site_name: string
  entity_type: string
  entity_id: string
  title: string
  detail: string
  alert_date: string
}

export const ALERT_KIND_LABEL: Record<Alert['kind'], string> = {
  low_stock: 'Low stock',
  high_mortality: 'Mortality',
  high_rejection: 'Production loss',
  missing_records: 'Missing records',
  overdue_activity: 'Overdue task',
  upcoming_activity: 'Upcoming task',
  upcoming_harvest: 'Harvest',
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

/** Where an alert links to in the app. */
export function alertLink(a: Alert, batchTypes: Map<string, 'poultry' | 'fish'>): string | null {
  switch (a.entity_type) {
    case 'inventory_item':
      return `/inventory?item=${a.entity_id}`
    case 'batch': {
      const t = batchTypes.get(a.entity_id)
      return t ? `/${t}/${a.entity_id}` : null
    }
    case 'crop_cycle':
      return `/crops/${a.entity_id}`
    case 'production_record':
      return `/production`
    case 'planned_activity':
      return `/log?tab=planned`
    default:
      return null
  }
}

export const alertsService = {
  async list(orgId: string, siteId?: string): Promise<Alert[]> {
    const { data, error } = await supabase.rpc('org_alerts', { p_org: orgId, p_site: siteId })
    if (error) throw error
    return ((data ?? []) as Alert[]).sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.alert_date.localeCompare(a.alert_date),
    )
  },

  async settings(orgId: string) {
    const { data, error } = await supabase.from('alert_settings').select('*').eq('organization_id', orgId).single()
    if (error) throw error
    return data
  },

  async updateSettings(orgId: string, patch: Database['public']['Tables']['alert_settings']['Update']) {
    const { error } = await supabase.from('alert_settings').update(patch).eq('organization_id', orgId)
    if (error) throw error
  },
}
