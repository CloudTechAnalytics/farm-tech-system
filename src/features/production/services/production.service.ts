import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

export interface ProductionRecord {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  production_type: 'poultry' | 'fish' | 'crop'
  record_kind: 'egg_collection' | 'fish_harvest' | 'crop_harvest' | 'poultry_processing' | 'other_output'
  batch_id: string | null
  crop_cycle_id: string | null
  source_code: string | null
  product: string
  record_date: string
  quantity: number
  unit_id: string
  unit_symbol: string
  unit_dimension: string
  unit_to_base: number
  rejected_quantity: number
  grade: string | null
  weight_kg: number | null
  head_count: number | null
  is_estimate: boolean
  destination: string | null
  notes: string | null
  status: 'posted' | 'voided'
  void_reason: string | null
  disposed_quantity: number
  sold_quantity: number
  available_quantity: number
  created_at: string
}

export interface Disposal {
  id: string
  disposal_date: string
  kind: string
  quantity: number
  notes: string | null
  status: string
  sale_line_id: string | null
}

export const RECORD_KIND_LABEL: Record<ProductionRecord['record_kind'], string> = {
  egg_collection: 'Egg collection',
  fish_harvest: 'Fish harvest',
  crop_harvest: 'Crop harvest',
  poultry_processing: 'Processing',
  other_output: 'Other output',
}

export const DISPOSAL_LABEL: Record<string, string> = {
  sold: 'Sold',
  internal_use: 'Used on farm / household',
  given_away: 'Given away',
  spoiled: 'Spoiled',
  other: 'Other',
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function map(r: Record<string, unknown>): ProductionRecord {
  return {
    ...(r as unknown as ProductionRecord),
    quantity: Number(r.quantity),
    rejected_quantity: Number(r.rejected_quantity),
    disposed_quantity: Number(r.disposed_quantity),
    sold_quantity: Number(r.sold_quantity),
    available_quantity: Number(r.available_quantity),
    unit_to_base: Number(r.unit_to_base),
    weight_kg: n(r.weight_kg),
  }
}

export const productionService = {
  async list(
    orgId: string,
    f: { siteId?: string; type?: string; from?: string; to?: string; batchId?: string; cropCycleId?: string; availableOnly?: boolean; includeVoided?: boolean },
  ): Promise<ProductionRecord[]> {
    let q = supabase
      .from('production_record_balances')
      .select('*')
      .eq('organization_id', orgId)
      .order('record_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.type) q = q.eq('production_type', f.type)
    if (f.from) q = q.gte('record_date', f.from)
    if (f.to) q = q.lte('record_date', f.to)
    if (f.batchId) q = q.eq('batch_id', f.batchId)
    if (f.cropCycleId) q = q.eq('crop_cycle_id', f.cropCycleId)
    if (!f.includeVoided) q = q.eq('status', 'posted')
    if (f.availableOnly) q = q.gt('available_quantity', 0)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => map(r as Record<string, unknown>))
  },

  async disposals(recordId: string): Promise<Disposal[]> {
    const { data, error } = await supabase
      .from('production_disposals')
      .select('id, disposal_date, kind, quantity, notes, status, sale_line_id')
      .eq('production_record_id', recordId)
      .order('disposal_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((d) => ({ ...d, quantity: Number(d.quantity) }))
  },

  async recordEggs(key: string, v: { batch_id: string; date: string; quantity: number; unit_id: string; rejected: number; grade?: string; notes?: string; responsible?: string }) {
    const { error } = await supabase.rpc('record_egg_collection', {
      p_key: key,
      p_batch: v.batch_id,
      p_record_date: v.date,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_rejected_quantity: v.rejected,
      p_grade: blankToNull(v.grade) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_responsible: v.responsible || undefined,
    })
    if (error) throw error
  },

  async recordFishHarvest(
    key: string,
    v: { batch_id: string; date: string; head_count: number; weight_kg: number; count_is_estimate: boolean; rejected_kg: number; grade?: string; destination?: string; notes?: string; final: boolean },
  ) {
    const { data, error } = await supabase.rpc('record_fish_harvest', {
      p_key: key,
      p_batch: v.batch_id,
      p_record_date: v.date,
      p_head_count: v.head_count,
      p_weight_kg: v.weight_kg,
      p_count_is_estimate: v.count_is_estimate,
      p_rejected_kg: v.rejected_kg,
      p_grade: blankToNull(v.grade) ?? undefined,
      p_destination: blankToNull(v.destination) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_final_harvest: v.final,
    })
    if (error) throw error
    return data as { estimate_adjusted_by: number; written_off: number }
  },

  async recordCropHarvest(
    key: string,
    v: { cycle_id: string; date: string; quantity: number; unit_id: string; product?: string; rejected: number; grade?: string; destination?: string; notes?: string; responsible?: string; mark_harvested: boolean },
  ) {
    const { error } = await supabase.rpc('record_crop_harvest', {
      p_key: key,
      p_cycle: v.cycle_id,
      p_record_date: v.date,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_product: blankToNull(v.product) ?? undefined,
      p_rejected_quantity: v.rejected,
      p_grade: blankToNull(v.grade) ?? undefined,
      p_destination: blankToNull(v.destination) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_responsible: v.responsible || undefined,
      p_mark_harvested: v.mark_harvested,
    })
    if (error) throw error
  },

  async recordDisposal(key: string, v: { record_id: string; kind: string; quantity: number; date: string; notes?: string }) {
    const { error } = await supabase.rpc('record_disposal', {
      p_key: key,
      p_record: v.record_id,
      p_kind: v.kind,
      p_quantity: v.quantity,
      p_disposal_date: v.date,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
  },

  async void(recordId: string, reason: string) {
    const { error } = await supabase.rpc('void_production_record', { p_record: recordId, p_reason: reason })
    if (error) throw error
  },
}
