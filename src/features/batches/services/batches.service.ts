import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

export type LivestockType = 'poultry' | 'fish'

export interface BatchSummary {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  production_unit_id: string | null
  production_unit_name: string | null
  production_type: LivestockType
  code: string
  species: string
  breed: string | null
  purpose: string
  source: string | null
  start_date: string
  initial_quantity: number
  initial_avg_weight_g: number | null
  count_basis: 'counted' | 'estimated'
  expects_daily_records: boolean
  status: 'active' | 'closed'
  closed_on: string | null
  close_reason: string | null
  notes: string | null
  current_population: number
  total_placed: number
  total_mortality: number
  total_culled: number
  total_sold: number
  total_harvested: number
  total_transferred_out: number
  total_other_losses: number
  mortality_pct: number | null
  feed_consumed_kg: number
  feed_at_batch_kg: number
  latest_avg_weight_g: number | null
  latest_sample_date: string | null
  estimated_biomass_kg: number | null
}

export interface BatchEvent {
  id: string
  event_date: string
  kind: string
  effective_kind: string
  quantity: number
  weight_kg: number | null
  is_estimate: boolean
  reason: string | null
  reverses_event_id: string | null
  counterpart_batch_id: string | null
  created_at: string
  recorded_by: string | null
}

export interface FishSample {
  id: string
  sample_date: string
  sample_size: number
  total_weight_g: number
  avg_weight_g: number
  notes: string | null
}

export const PURPOSES: Record<LivestockType, { value: string; label: string }[]> = {
  poultry: [
    { value: 'layers', label: 'Layers (eggs)' },
    { value: 'broilers', label: 'Broilers (meat)' },
    { value: 'breeders', label: 'Breeders' },
    { value: 'cockerels', label: 'Cockerels' },
    { value: 'other', label: 'Other' },
  ],
  fish: [
    { value: 'table_fish', label: 'Table fish (grow-out)' },
    { value: 'fingerlings', label: 'Fingerlings / juveniles' },
    { value: 'broodstock', label: 'Broodstock' },
    { value: 'other', label: 'Other' },
  ],
}

export const EVENT_LABEL: Record<string, string> = {
  acquisition: 'Stocked',
  opening: 'Opening count',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  mortality: 'Mortality',
  cull: 'Cull',
  sale: 'Sale',
  harvest: 'Harvest',
  theft_loss: 'Lost / stolen',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function mapSummary(r: Record<string, unknown>): BatchSummary {
  return {
    ...(r as unknown as BatchSummary),
    mortality_pct: num(r.mortality_pct),
    feed_consumed_kg: Number(r.feed_consumed_kg ?? 0),
    feed_at_batch_kg: Number(r.feed_at_batch_kg ?? 0),
    latest_avg_weight_g: num(r.latest_avg_weight_g),
    estimated_biomass_kg: num(r.estimated_biomass_kg),
    initial_avg_weight_g: num(r.initial_avg_weight_g),
  }
}

export interface CreateBatchValues {
  site_id: string
  production_type: LivestockType
  code: string
  species: string
  breed?: string
  purpose: string
  source?: string
  start_date: string
  initial_quantity: number
  start_kind: 'acquisition' | 'opening'
  production_unit_id?: string
  initial_avg_weight_g?: number | null
  count_basis: 'counted' | 'estimated'
  expects_daily_records: boolean
  notes?: string
  purchase_amount?: number | null
  payment_method?: string
}

export const batchesService = {
  async list(orgId: string, filters: { type: LivestockType; siteId?: string; status?: 'active' | 'closed' | 'all' }): Promise<BatchSummary[]> {
    let q = supabase
      .from('batch_summaries')
      .select('*')
      .eq('organization_id', orgId)
      .eq('production_type', filters.type)
      .order('status')
      .order('start_date', { ascending: false })
    if (filters.siteId) q = q.eq('site_id', filters.siteId)
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => mapSummary(r as Record<string, unknown>))
  },

  /** Active batches for pickers (any livestock type). */
  async listActive(orgId: string, siteId?: string, type?: LivestockType): Promise<BatchSummary[]> {
    let q = supabase.from('batch_summaries').select('*').eq('organization_id', orgId).eq('status', 'active').order('code')
    if (siteId) q = q.eq('site_id', siteId)
    if (type) q = q.eq('production_type', type)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => mapSummary(r as Record<string, unknown>))
  },

  async get(id: string): Promise<BatchSummary | null> {
    const { data, error } = await supabase.from('batch_summaries').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? mapSummary(data as Record<string, unknown>) : null
  },

  async events(batchId: string): Promise<BatchEvent[]> {
    const { data, error } = await supabase
      .from('batch_events_net')
      .select('id, event_date, kind, effective_kind, quantity, weight_kg, is_estimate, reason, reverses_event_id, counterpart_batch_id, created_at, recorded_by')
      .eq('batch_id', batchId)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((e) => ({ ...(e as unknown as BatchEvent), weight_kg: num(e.weight_kg) }))
  },

  async samples(batchId: string): Promise<FishSample[]> {
    const { data, error } = await supabase
      .from('fish_samples')
      .select('id, sample_date, sample_size, total_weight_g, avg_weight_g, notes')
      .eq('batch_id', batchId)
      .is('voided_at', null)
      .order('sample_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((s) => ({ ...s, total_weight_g: Number(s.total_weight_g), avg_weight_g: Number(s.avg_weight_g) }))
  },

  async create(key: string, orgId: string, v: CreateBatchValues): Promise<string> {
    const { data, error } = await supabase.rpc('create_batch', {
      p_key: key,
      p_org: orgId,
      p_site: v.site_id,
      p_production_type: v.production_type,
      p_code: v.code,
      p_species: v.species,
      p_purpose: v.purpose,
      p_start_date: v.start_date,
      p_initial_quantity: v.initial_quantity,
      p_start_kind: v.start_kind,
      p_production_unit: v.production_unit_id || undefined,
      p_breed: blankToNull(v.breed) ?? undefined,
      p_source: blankToNull(v.source) ?? undefined,
      p_initial_avg_weight_g: v.initial_avg_weight_g ?? undefined,
      p_count_basis: v.count_basis,
      p_expects_daily_records: v.expects_daily_records,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_purchase_amount: v.purchase_amount ?? undefined,
      p_payment_method: v.purchase_amount ? v.payment_method : undefined,
    })
    if (error) throw error
    return (data as { batch_id: string }).batch_id
  },

  async recordPopulationChange(
    key: string,
    v: { batch_id: string; kind: 'mortality' | 'cull' | 'theft_loss' | 'adjustment'; quantity: number; date: string; reason?: string; notes?: string; responsible?: string },
  ) {
    const { data, error } = await supabase.rpc('record_population_change', {
      p_key: key,
      p_batch: v.batch_id,
      p_kind: v.kind,
      p_quantity: v.quantity,
      p_event_date: v.date,
      p_reason: blankToNull(v.reason) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_responsible: v.responsible || undefined,
    })
    if (error) throw error
    return data as { population: number; replayed: boolean }
  },

  async transfer(key: string, v: { from: string; to: string; quantity: number; date: string; reason?: string }) {
    const { error } = await supabase.rpc('transfer_between_batches', {
      p_key: key,
      p_from_batch: v.from,
      p_to_batch: v.to,
      p_quantity: v.quantity,
      p_event_date: v.date,
      p_reason: blankToNull(v.reason) ?? undefined,
    })
    if (error) throw error
  },

  async close(batchId: string, v: { date: string; reason: string; writeOff: boolean }) {
    const { data, error } = await supabase.rpc('close_batch', {
      p_batch: batchId,
      p_closed_on: v.date,
      p_reason: v.reason,
      p_write_off_remaining: v.writeOff,
    })
    if (error) throw error
    return data as { written_off: number }
  },

  async reverseEvent(key: string, eventId: string, reason: string) {
    const { error } = await supabase.rpc('reverse_batch_event', { p_key: key, p_event: eventId, p_reason: reason })
    if (error) throw error
  },

  async recordSample(key: string, v: { batch_id: string; date: string; sample_size: number; total_weight_g: number; notes?: string }) {
    const { error } = await supabase.rpc('record_fish_sample', {
      p_key: key,
      p_batch: v.batch_id,
      p_sample_date: v.date,
      p_sample_size: v.sample_size,
      p_total_weight_g: v.total_weight_g,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
  },
}
