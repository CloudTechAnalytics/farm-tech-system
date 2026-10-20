import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

export interface ActivityEntry {
  id: string
  site_id: string
  occurred_on: string
  occurred_at: string | null
  production_type: 'poultry' | 'fish' | 'crop' | 'general'
  batch_id: string | null
  crop_cycle_id: string | null
  production_unit_id: string | null
  category_id: string
  quantity: number | null
  unit_id: string | null
  summary: string
  notes: string | null
  responsible_id: string | null
  source: 'manual' | 'system'
  voided_at: string | null
  void_reason: string | null
  recorded_by: string | null
  created_at: string
  category: { name: string; code: string } | null
  site: { name: string } | null
  batch: { code: string } | null
  crop_cycle: { code: string } | null
  unit: { symbol: string } | null
  responsible: { full_name: string | null; email: string } | null
}

export interface ActivityFilters {
  siteId?: string
  from?: string
  to?: string
  productionType?: string
  categoryId?: string
  batchId?: string
  cropCycleId?: string
  search?: string
  includeVoided?: boolean
  limit?: number
}

export interface ActivityValues {
  site_id: string
  date: string
  production_type: 'poultry' | 'fish' | 'crop' | 'general'
  category_id: string
  summary: string
  batch_id?: string
  crop_cycle_id?: string
  production_unit_id?: string
  quantity?: number | null
  unit_id?: string
  notes?: string
  responsible_id?: string
  time?: string
}

export const activityService = {
  async list(orgId: string, f: ActivityFilters): Promise<ActivityEntry[]> {
    let q = supabase
      .from('activity_logs')
      .select(
        '*, category:categories(name, code), site:farm_sites(name), batch:batches(code), crop_cycle:crop_cycles(code), unit:units(symbol), responsible:profiles!activity_logs_responsible_id_fkey(full_name, email)',
      )
      .eq('organization_id', orgId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(f.limit ?? 200)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.from) q = q.gte('occurred_on', f.from)
    if (f.to) q = q.lte('occurred_on', f.to)
    if (f.productionType) q = q.eq('production_type', f.productionType)
    if (f.categoryId) q = q.eq('category_id', f.categoryId)
    if (f.batchId) q = q.eq('batch_id', f.batchId)
    if (f.cropCycleId) q = q.eq('crop_cycle_id', f.cropCycleId)
    if (!f.includeVoided) q = q.is('voided_at', null)
    if (f.search?.trim()) {
      const s = f.search.trim().replace(/[%,()]/g, '')
      q = q.or(`summary.ilike.%${s}%,notes.ilike.%${s}%`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((a) => ({ ...(a as unknown as ActivityEntry), quantity: a.quantity === null ? null : Number(a.quantity) }))
  },

  async log(key: string, orgId: string, v: ActivityValues) {
    const occurredAt = v.time ? new Date(`${v.date}T${v.time}`).toISOString() : undefined
    const { error } = await supabase.rpc('log_activity', {
      p_key: key,
      p_org: orgId,
      p_site: v.site_id,
      p_occurred_on: v.date,
      p_production_type: v.production_type,
      p_category: v.category_id,
      p_summary: v.summary,
      p_batch: v.batch_id || undefined,
      p_crop_cycle: v.crop_cycle_id || undefined,
      p_production_unit: v.production_unit_id || undefined,
      p_quantity: v.quantity ?? undefined,
      p_unit: v.quantity !== null && v.quantity !== undefined ? v.unit_id || undefined : undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_responsible: v.responsible_id || undefined,
      p_occurred_at: occurredAt,
    })
    if (error) throw error
  },

  async void(id: string, reason: string) {
    const { error } = await supabase.rpc('void_activity', { p_activity: id, p_reason: reason })
    if (error) throw error
  },

  async planned(orgId: string, f: { siteId?: string; status?: string }) {
    let q = supabase
      .from('planned_activities')
      .select('*, category:categories(name), site:farm_sites(name), batch:batches(code), crop_cycle:crop_cycles(code)')
      .eq('organization_id', orgId)
      .order('due_on')
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.status) q = q.eq('status', f.status)
    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async createPlanned(orgId: string, v: { site_id: string; production_type: string; category_id: string; title: string; due_on: string; batch_id?: string; crop_cycle_id?: string; notes?: string }) {
    const { error } = await supabase.from('planned_activities').insert({
      organization_id: orgId,
      site_id: v.site_id,
      production_type: v.production_type,
      category_id: v.category_id,
      title: v.title.trim(),
      due_on: v.due_on,
      batch_id: v.batch_id || null,
      crop_cycle_id: v.crop_cycle_id || null,
      notes: blankToNull(v.notes),
    })
    if (error) throw error
  },

  async setPlannedStatus(id: string, status: 'planned' | 'done' | 'cancelled') {
    const { error } = await supabase
      .from('planned_activities')
      .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) throw error
  },
}
