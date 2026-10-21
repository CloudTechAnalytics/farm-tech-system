import { supabase } from '@/shared/lib/supabase'
import type { ActivityProductionType } from '@/shared/lib/permissions'

const clean = (s?: string) => (s ?? '').replace(/[,()%]/g, ' ').trim()

export const HEALTH_TYPES = ['treatment', 'vaccination', 'inspection', 'incident', 'water_quality', 'pest_disease'] as const
export type HealthType = (typeof HEALTH_TYPES)[number]
export const HEALTH_TYPE_LABEL: Record<HealthType, string> = {
  treatment: 'Treatment',
  vaccination: 'Vaccination',
  inspection: 'Biosecurity inspection',
  incident: 'Disease or incident',
  water_quality: 'Water quality',
  pest_disease: 'Crop pest or disease',
}

export const ROUTES = ['water', 'feed', 'injection', 'spray', 'eye_drop', 'dip', 'topical', 'other'] as const
export const ROUTE_LABEL: Record<(typeof ROUTES)[number], string> = {
  water: 'In drinking water',
  feed: 'In feed',
  injection: 'Injection',
  spray: 'Spray',
  eye_drop: 'Eye or nose drop',
  dip: 'Dip or bath',
  topical: 'On the skin',
  other: 'Other',
}

export const SEVERITY: Record<'low' | 'medium' | 'high' | 'critical', { label: string; variant: 'neutral' | 'info' | 'warning' | 'danger' }> = {
  low: { label: 'Low', variant: 'neutral' },
  medium: { label: 'Medium', variant: 'info' },
  high: { label: 'High', variant: 'warning' },
  critical: { label: 'Critical', variant: 'danger' },
}

/** Safe ranges used for warm-water fish (catfish, tilapia); mirrors health_record_summaries.out_of_range. */
export const WATER_LIMITS = {
  dissolved_oxygen_mg_l: { min: 3, label: 'Dissolved oxygen', unit: 'mg/L' },
  ammonia_mg_l: { max: 0.5, label: 'Ammonia', unit: 'mg/L' },
  nitrite_mg_l: { max: 0.5, label: 'Nitrite', unit: 'mg/L' },
  ph: { min: 6.5, max: 9, label: 'pH', unit: '' },
  water_temp_c: { min: 20, max: 34, label: 'Temperature', unit: '°C' },
} as const

export interface HealthRecord {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  record_type: HealthType
  production_type: ActivityProductionType
  batch_id: string | null
  batch_code: string | null
  crop_cycle_id: string | null
  crop_cycle_code: string | null
  production_unit_id: string | null
  production_unit_name: string | null
  record_date: string
  title: string
  product_name: string | null
  inventory_item_id: string | null
  quantity: number | null
  unit_symbol: string | null
  dose: string | null
  route: (typeof ROUTES)[number] | null
  withdrawal_days: number | null
  withdrawal_until: string | null
  next_due_on: string | null
  administered_by: string | null
  vet_name: string | null
  severity: keyof typeof SEVERITY | null
  affected_count: number | null
  affected_area_pct: number | null
  action_taken: string | null
  outcome: 'pass' | 'fail' | 'needs_action' | null
  incident_status: 'open' | 'resolved' | null
  resolved_on: string | null
  water_temp_c: number | null
  ph: number | null
  dissolved_oxygen_mg_l: number | null
  ammonia_mg_l: number | null
  nitrite_mg_l: number | null
  notes: string | null
  voided_at: string | null
  void_reason: string | null
  recorded_by_name: string | null
  in_withdrawal: boolean
  out_of_range: boolean
  created_at: string
}

export type HealthInput = Partial<Record<string, string | number | null>> & { record_type: HealthType; site_id: string; record_date: string; title: string }

const NUMERIC = ['quantity', 'withdrawal_days', 'affected_count', 'affected_area_pct', 'water_temp_c', 'ph', 'dissolved_oxygen_mg_l', 'ammonia_mg_l', 'nitrite_mg_l'] as const

export const healthService = {
  async list(orgId: string, f: { siteId?: string; types?: HealthType[]; batchId?: string; cropCycleId?: string; from?: string; to?: string; search?: string; openOnly?: boolean; withdrawalOnly?: boolean; includeVoided?: boolean } = {}): Promise<HealthRecord[]> {
    let q = supabase.from('health_record_summaries').select('*').eq('organization_id', orgId).order('record_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.types?.length) q = q.in('record_type', f.types)
    if (f.batchId) q = q.eq('batch_id', f.batchId)
    if (f.cropCycleId) q = q.eq('crop_cycle_id', f.cropCycleId)
    if (f.from) q = q.gte('record_date', f.from)
    if (f.to) q = q.lte('record_date', f.to)
    if (f.openOnly) q = q.eq('incident_status', 'open')
    if (f.withdrawalOnly) q = q.eq('in_withdrawal', true)
    if (!f.includeVoided) q = q.is('voided_at', null)
    const s = clean(f.search)
    if (s) q = q.or(`title.ilike.%${s}%,product_name.ilike.%${s}%,batch_code.ilike.%${s}%,crop_cycle_code.ilike.%${s}%,vet_name.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => {
      const row = { ...(r as unknown as HealthRecord) }
      for (const k of NUMERIC) {
        const v = (r as Record<string, unknown>)[k]
        ;(row as unknown as Record<string, number | null>)[k] = v === null || v === undefined ? null : Number(v)
      }
      return row
    })
  },
  async record(key: string, orgId: string, v: HealthInput) {
    // Blank fields are left out so the database applies its own defaults.
    const p = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== null && x !== undefined))
    const { data, error } = await supabase.rpc('record_health', { p_key: key, p_org: orgId, p: p as never })
    if (error) throw error
    return data as { health_record_id: string; replayed?: boolean }
  },
  async void(key: string, recordId: string, reason: string) {
    const { error } = await supabase.rpc('void_health_record', { p_key: key, p_record: recordId, p_reason: reason })
    if (error) throw error
  },
  async resolve(recordId: string, resolvedOn: string, note?: string) {
    const { error } = await supabase.rpc('resolve_health_incident', { p_record: recordId, p_resolved_on: resolvedOn, p_note: note || undefined })
    if (error) throw error
  },
}
