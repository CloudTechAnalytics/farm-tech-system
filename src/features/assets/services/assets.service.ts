import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const clean = (s?: string) => (s ?? '').replace(/[,()%]/g, ' ').trim()

export const ASSET_CATEGORIES = ['vehicle', 'tractor', 'generator', 'pump', 'building', 'equipment', 'tool', 'other'] as const
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]
export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  vehicle: 'Vehicle',
  tractor: 'Tractor or implement',
  generator: 'Generator',
  pump: 'Pump or borehole',
  building: 'Building or pen',
  equipment: 'Equipment',
  tool: 'Tool',
  other: 'Other',
}

export type Condition = 'good' | 'fair' | 'poor' | 'out_of_service'
export const CONDITION: Record<Condition, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
  good: { label: 'Good', variant: 'success' },
  fair: { label: 'Fair', variant: 'info' },
  poor: { label: 'Poor', variant: 'warning' },
  out_of_service: { label: 'Out of service', variant: 'danger' },
}

export interface Asset {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  code: string | null
  name: string
  category: AssetCategory
  production_unit_id: string | null
  location_name: string | null
  make: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  purchase_cost: number | null
  supplier_id: string | null
  supplier_name: string | null
  warranty_until: string | null
  condition: Condition
  out_of_service_since: string | null
  status: 'active' | 'disposed'
  notes: string | null
  next_due_on: string | null
  next_due_title: string | null
  maintenance_overdue: boolean
  maintenance_cost_12m: number
  downtime_hours_12m: number
  last_service_on: string | null
}

export interface AssetInput {
  site_id: string
  name: string
  category: AssetCategory
  code?: string
  production_unit_id?: string
  make?: string
  model?: string
  serial_number?: string
  purchase_date?: string
  purchase_cost?: number | null
  supplier_id?: string
  warranty_until?: string
  condition: Condition
  notes?: string
}

export interface MaintenancePlan {
  id: string
  title: string
  interval_days: number
  next_due_on: string
  last_done_on: string | null
  is_active: boolean
  notes: string | null
}

export interface MaintenanceRecord {
  id: string
  kind: 'service' | 'repair' | 'inspection'
  performed_on: string
  description: string
  cost: number | null
  downtime_hours: number | null
  performed_by: string | null
  finance_transaction_id: string | null
  supplier_bill_id: string | null
  condition_after: Condition | null
  status: 'posted' | 'voided'
  void_reason: string | null
  plan: { title: string } | null
  supplier: { name: string } | null
}

const toAsset = (a: Record<string, unknown>): Asset => ({
  ...(a as unknown as Asset),
  purchase_cost: n(a.purchase_cost),
  maintenance_cost_12m: Number(a.maintenance_cost_12m ?? 0),
  downtime_hours_12m: Number(a.downtime_hours_12m ?? 0),
})

const assetRow = (v: AssetInput) => ({
  site_id: v.site_id,
  name: v.name.trim(),
  category: v.category,
  code: blankToNull(v.code),
  production_unit_id: blankToNull(v.production_unit_id),
  make: blankToNull(v.make),
  model: blankToNull(v.model),
  serial_number: blankToNull(v.serial_number),
  purchase_date: blankToNull(v.purchase_date),
  purchase_cost: v.purchase_cost ?? null,
  supplier_id: blankToNull(v.supplier_id),
  warranty_until: blankToNull(v.warranty_until),
  condition: v.condition,
  notes: blankToNull(v.notes),
})

export const assetsService = {
  async list(orgId: string, f: { siteId?: string; category?: string; condition?: string; search?: string; dueOnly?: boolean; includeDisposed?: boolean } = {}): Promise<Asset[]> {
    let q = supabase.from('asset_summaries').select('*').eq('organization_id', orgId).order('name').limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.category) q = q.eq('category', f.category)
    if (f.condition) q = q.eq('condition', f.condition)
    if (!f.includeDisposed) q = q.eq('status', 'active')
    if (f.dueOnly) q = q.eq('maintenance_overdue', true)
    const s = clean(f.search)
    if (s) q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,make.ilike.%${s}%,model.ilike.%${s}%,serial_number.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((a) => toAsset(a as Record<string, unknown>))
  },
  async get(id: string): Promise<Asset | null> {
    const { data, error } = await supabase.from('asset_summaries').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? toAsset(data as Record<string, unknown>) : null
  },
  async create(orgId: string, v: AssetInput): Promise<string> {
    const { data, error } = await supabase.from('assets').insert({ organization_id: orgId, ...assetRow(v) }).select('id').single()
    if (error) throw error
    return data.id
  },
  async update(id: string, v: AssetInput & { status?: 'active' | 'disposed' }) {
    const { error } = await supabase.from('assets').update({ ...assetRow(v), ...(v.status ? { status: v.status } : {}) }).eq('id', id)
    if (error) throw error
  },
  async plans(assetId: string): Promise<MaintenancePlan[]> {
    const { data, error } = await supabase.from('maintenance_plans').select('id, title, interval_days, next_due_on, last_done_on, is_active, notes').eq('asset_id', assetId).order('next_due_on')
    if (error) throw error
    return (data ?? []) as MaintenancePlan[]
  },
  async addPlan(orgId: string, siteId: string, assetId: string, v: { title: string; interval_days: number; next_due_on: string; notes?: string }) {
    const { error } = await supabase.from('maintenance_plans').insert({ organization_id: orgId, site_id: siteId, asset_id: assetId, title: v.title.trim(), interval_days: v.interval_days, next_due_on: v.next_due_on, notes: blankToNull(v.notes) })
    if (error) throw error
  },
  async setPlanActive(planId: string, isActive: boolean) {
    const { error } = await supabase.from('maintenance_plans').update({ is_active: isActive }).eq('id', planId)
    if (error) throw error
  },
  async records(assetId: string): Promise<MaintenanceRecord[]> {
    const { data, error } = await supabase
      .from('maintenance_records')
      .select('id, kind, performed_on, description, cost, downtime_hours, performed_by, finance_transaction_id, supplier_bill_id, condition_after, status, void_reason, plan:maintenance_plans(title), supplier:suppliers(name)')
      .eq('asset_id', assetId)
      .order('performed_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => ({ ...(r as unknown as MaintenanceRecord), cost: n(r.cost), downtime_hours: n(r.downtime_hours) }))
  },
  async recordMaintenance(
    key: string,
    v: { asset_id: string; kind: MaintenanceRecord['kind']; performed_on: string; description: string; plan_id?: string; cost?: number | null; paid_now: boolean; payment_method?: string; supplier_id?: string; supplier_bill_id?: string; downtime_hours?: number | null; performed_by?: string; condition_after?: string },
  ) {
    const { data, error } = await supabase.rpc('record_maintenance', {
      p_key: key,
      p_asset: v.asset_id,
      p_kind: v.kind,
      p_performed_on: v.performed_on,
      p_description: v.description,
      p_plan: blankToNull(v.plan_id) ?? undefined,
      p_cost: v.cost ?? undefined,
      p_paid_now: v.paid_now,
      p_payment_method: v.paid_now ? v.payment_method : undefined,
      p_supplier: blankToNull(v.supplier_id) ?? undefined,
      p_supplier_bill: blankToNull(v.supplier_bill_id) ?? undefined,
      p_downtime_hours: v.downtime_hours ?? undefined,
      p_performed_by: blankToNull(v.performed_by) ?? undefined,
      p_condition_after: blankToNull(v.condition_after) ?? undefined,
    })
    if (error) throw error
    return data as { maintenance_record_id: string; replayed?: boolean }
  },
  async voidRecord(key: string, recordId: string, reason: string) {
    const { error } = await supabase.rpc('void_maintenance_record', { p_key: key, p_record: recordId, p_reason: reason })
    if (error) throw error
  },
}
