import { supabase } from '@/shared/lib/supabase'

export interface Period {
  from: string
  to: string
  siteId?: string
  productionType?: string
}

/** Numeric columns arrive from PostgREST as numbers or numeric strings; normalize once. */
function numeric<T>(rows: unknown[] | null): T[] {
  return (rows ?? []).map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      out[k] = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && !k.endsWith('_id') && k !== 'id' ? Number(v) : v
    }
    return out as T
  })
}

export interface DashboardSummary {
  period: { from: string; to: string }
  sites: number
  active: { poultry_batches: number; fish_batches: number; crop_cycles: number }
  population: { birds: number; fish_estimated: number; fish_biomass_kg_estimated: number | null }
  mortality: { poultry: number; fish: number; poultry_at_risk: number; fish_at_risk: number }
  feed_consumed_kg: number
  production: { kind: string; product: string; unit: string; quantity: number; has_estimates: boolean }[]
  low_stock_items: number
  finance: { income: number; expense: number; operating_surplus: number } | null
  sales: { value: number; outstanding: number; count: number } | null
  daily: { day: string; mortality: number; eggs: number }[]
}

export const reportsService = {
  async dashboard(orgId: string, p: Period): Promise<DashboardSummary> {
    const { data, error } = await supabase.rpc('dashboard_summary', {
      p_org: orgId,
      p_from: p.from,
      p_to: p.to,
      p_site: p.siteId || undefined,
      p_production_type: p.productionType || undefined,
    })
    if (error) throw error
    return data as unknown as DashboardSummary
  },

  async mortality(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_mortality', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined, p_production_type: p.productionType || undefined })
    if (error) throw error
    return numeric<{
      batch_id: string; batch_code: string; production_type: string; species: string; site_name: string; count_basis: string
      opening_population: number; added: number; mortality: number; culled: number; other_out: number; closing_population: number; mortality_pct: number | null
    }>(data)
  },

  async feed(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_feed', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined, p_production_type: p.productionType || undefined })
    if (error) throw error
    return numeric<{
      batch_id: string; batch_code: string; production_type: string; site_name: string; item_name: string; unit_symbol: string
      issued: number; consumed: number; wasted: number; returned: number; held_at_batch: number; population: number; consumed_per_head_g: number | null
    }>(data)
  },

  async stock(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_stock_movements', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined })
    if (error) throw error
    return numeric<{
      item_id: string; item_name: string; category_name: string; store_name: string; site_name: string; unit_symbol: string
      opening: number; received: number; issued: number; used: number; transferred_in: number; transferred_out: number
      returned: number; wasted: number; adjusted: number; closing: number; reorder_level: number | null
    }>(data)
  },

  async production(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_production', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined, p_production_type: p.productionType || undefined })
    if (error) throw error
    return numeric<{
      production_type: string; record_kind: string; source_id: string; source_code: string; site_name: string; product: string; base_unit: string
      records: number; quantity: number; rejected: number; good_quantity: number; sold: number; other_disposed: number; available: number; has_estimates: boolean
    }>(data)
  },

  async financeMonthly(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_finance_monthly', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined, p_production_type: p.productionType || undefined })
    if (error) throw error
    return numeric<{ month: string; income: number; expense: number; net: number; transactions: number }>(data)
  },

  async financeByCategory(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_finance_by_category', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined, p_production_type: p.productionType || undefined })
    if (error) throw error
    return numeric<{ kind: 'income' | 'expense'; category_id: string; category_name: string; amount: number; transactions: number }>(data)
  },

  async sales(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_sales', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined })
    if (error) throw error
    return numeric<{ line_type: string; product: string; unit_symbol: string; quantity: number; sales_value: number; sales: number }>(data)
  },

  async sites(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_site_performance', { p_org: orgId, p_from: p.from, p_to: p.to })
    if (error) throw error
    return numeric<{
      site_id: string; site_name: string; active_batches: number; active_crop_cycles: number; mortality: number
      eggs_collected: number; fish_harvest_kg: number; crop_harvest_kg: number; feed_consumed_kg: number
      income: number | null; expense: number | null; operating_surplus: number | null
    }>(data)
  },

  async cycles(orgId: string, p: { siteId?: string; productionType?: string; includeClosed: boolean }) {
    const { data, error } = await supabase.rpc('report_cycle_performance', { p_org: orgId, p_site: p.siteId || undefined, p_production_type: p.productionType || undefined, p_include_closed: p.includeClosed })
    if (error) throw error
    return numeric<{
      kind: 'batch' | 'crop_cycle'; id: string; code: string; production_type: string; label: string; site_name: string; status: string
      started_on: string | null; ended_on: string | null; placed: number | null; mortality_pct: number | null; feed_consumed_kg: number | null
      output_quantity: number | null; output_unit: string; yield_kg_per_ha: number | null
      linked_income: number | null; linked_expense: number | null; linked_surplus: number | null
    }>(data)
  },

  async inputsUsed(orgId: string, p: Period) {
    const { data, error } = await supabase.rpc('report_inputs_used', { p_org: orgId, p_from: p.from, p_to: p.to, p_site: p.siteId || undefined })
    if (error) throw error
    return numeric<{ target_kind: string; target_id: string; target_code: string; item_name: string; unit_symbol: string; quantity: number }>(data)
  },
}
