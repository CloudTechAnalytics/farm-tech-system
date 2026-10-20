import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

export type CropStatus = 'planned' | 'active' | 'harvested' | 'closed' | 'failed'

export interface CropCycle {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  production_unit_id: string
  production_unit_name: string
  code: string
  crop: string
  variety: string | null
  season: string | null
  planting_date: string | null
  area: number
  area_unit_id: string
  area_unit_symbol: string
  area_ha: number
  expected_harvest_date: string | null
  status: CropStatus
  closed_on: string | null
  close_reason: string | null
  notes: string | null
  harvest_kg: number | null
  harvest_records: number
  yield_kg_per_ha: number | null
}

export interface CropCycleValues {
  site_id: string
  production_unit_id: string
  code: string
  crop: string
  variety?: string
  season?: string
  planting_date?: string
  area: number
  area_unit_id: string
  expected_harvest_date?: string
  notes?: string
}

export const CROP_STATUS: Record<CropStatus, { label: string; variant: 'neutral' | 'success' | 'primary' | 'info' | 'danger' }> = {
  planned: { label: 'Planned', variant: 'neutral' },
  active: { label: 'Growing', variant: 'success' },
  harvested: { label: 'Harvested', variant: 'primary' },
  closed: { label: 'Closed', variant: 'info' },
  failed: { label: 'Failed', variant: 'danger' },
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function map(r: Record<string, unknown>): CropCycle {
  return {
    ...(r as unknown as CropCycle),
    area: Number(r.area),
    area_ha: Number(r.area_ha),
    harvest_kg: num(r.harvest_kg),
    yield_kg_per_ha: num(r.yield_kg_per_ha),
    harvest_records: Number(r.harvest_records ?? 0),
  }
}

export const cropsService = {
  async list(orgId: string, filters: { siteId?: string; status?: 'open' | 'all' | CropStatus }): Promise<CropCycle[]> {
    let q = supabase.from('crop_cycle_summaries').select('*').eq('organization_id', orgId).order('created_at', { ascending: false })
    if (filters.siteId) q = q.eq('site_id', filters.siteId)
    if (filters.status === 'open') q = q.in('status', ['planned', 'active', 'harvested'])
    else if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => map(r as Record<string, unknown>))
  },

  async get(id: string): Promise<CropCycle | null> {
    const { data, error } = await supabase.from('crop_cycle_summaries').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? map(data as Record<string, unknown>) : null
  },

  async create(orgId: string, v: CropCycleValues): Promise<string> {
    const { data, error } = await supabase.rpc('create_crop_cycle', {
      p_org: orgId,
      p_site: v.site_id,
      p_production_unit: v.production_unit_id,
      p_code: v.code,
      p_crop: v.crop,
      p_area: v.area,
      p_area_unit: v.area_unit_id,
      p_planting_date: v.planting_date || undefined,
      p_variety: blankToNull(v.variety) ?? undefined,
      p_season: blankToNull(v.season) ?? undefined,
      p_expected_harvest_date: v.expected_harvest_date || undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
    return data as string
  },

  async setStatus(id: string, status: CropStatus, date?: string, reason?: string) {
    const { error } = await supabase.rpc('set_crop_cycle_status', {
      p_cycle: id,
      p_status: status,
      p_date: date || undefined,
      p_reason: blankToNull(reason) ?? undefined,
    })
    if (error) throw error
  },

  async updateDetails(id: string, patch: { expected_harvest_date?: string | null; notes?: string | null; variety?: string | null; season?: string | null }) {
    const { error } = await supabase.rpc('update_crop_cycle_details', {
      p_cycle: id,
      p_expected_harvest_date: patch.expected_harvest_date ?? undefined,
      p_variety: patch.variety ?? undefined,
      p_season: patch.season ?? undefined,
      p_notes: patch.notes ?? undefined,
    })
    if (error) throw error
  },
}
