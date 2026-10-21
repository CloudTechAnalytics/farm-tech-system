import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

export interface SaleSummary {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  sale_date: string
  invoice_number: string
  customer_id: string | null
  customer_name: string | null
  customer_display_name: string | null
  customer_phone: string | null
  due_date: string | null
  sales_order_id: string | null
  order_number: string | null
  is_overdue: boolean
  currency: string
  notes: string | null
  status: 'posted' | 'voided'
  void_reason: string | null
  total_amount: number
  line_count: number
  amount_received: number
  amount_outstanding: number
  created_at: string
}

export interface SaleLine {
  id: string
  line_type: 'produce' | 'livestock' | 'other'
  production_record_id: string | null
  batch_id: string | null
  description: string
  quantity: number
  unit_id: string
  unit_price: number
  line_total: number
  weight_kg: number | null
  unit: { symbol: string } | null
}

export interface SaleLineInput {
  line_type: 'produce' | 'livestock' | 'other'
  production_record_id?: string
  batch_id?: string
  description?: string
  quantity: number
  unit_id: string
  unit_price: number
  weight_kg?: number | null
}

export function paymentStatus(s: Pick<SaleSummary, 'status' | 'total_amount' | 'amount_received'> & { is_overdue?: boolean }): { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (s.status === 'voided') return { label: 'Voided', variant: 'neutral' }
  if (s.amount_received >= s.total_amount) return { label: 'Paid', variant: 'success' }
  if (s.is_overdue) return { label: 'Overdue', variant: 'danger' }
  if (s.amount_received > 0) return { label: 'Part paid', variant: 'warning' }
  return { label: 'Unpaid', variant: 'danger' }
}

const n = (v: unknown) => Number(v ?? 0)

export const salesService = {
  async list(orgId: string, f: { siteId?: string; from?: string; to?: string; outstandingOnly?: boolean; overdueOnly?: boolean; customerId?: string; search?: string }): Promise<SaleSummary[]> {
    let q = supabase.from('sale_summaries').select('*').eq('organization_id', orgId).order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.from) q = q.gte('sale_date', f.from)
    if (f.to) q = q.lte('sale_date', f.to)
    if (f.outstandingOnly) q = q.gt('amount_outstanding', 0)
    if (f.overdueOnly) q = q.eq('is_overdue', true)
    if (f.customerId) q = q.eq('customer_id', f.customerId)
    if (f.search) {
      const s = f.search.replace(/[,()%]/g, ' ').trim()
      if (s) q = q.or(`invoice_number.ilike.%${s}%,customer_display_name.ilike.%${s}%,customer_phone.ilike.%${s}%`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((s) => ({
      ...(s as unknown as SaleSummary),
      total_amount: n(s.total_amount),
      amount_received: n(s.amount_received),
      amount_outstanding: n(s.amount_outstanding),
    }))
  },

  async get(id: string): Promise<SaleSummary | null> {
    const { data, error } = await supabase.from('sale_summaries').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return null
    return { ...(data as unknown as SaleSummary), total_amount: n(data.total_amount), amount_received: n(data.amount_received), amount_outstanding: n(data.amount_outstanding) }
  },

  async lines(saleId: string): Promise<SaleLine[]> {
    const { data, error } = await supabase.from('sale_lines').select('*, unit:units(symbol)').eq('sale_id', saleId).order('created_at')
    if (error) throw error
    return (data ?? []).map((l) => ({
      ...(l as unknown as SaleLine),
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      line_total: n(l.line_total),
      weight_kg: l.weight_kg === null ? null : n(l.weight_kg),
    }))
  },

  async payments(saleId: string) {
    const { data, error } = await supabase
      .from('finance_transactions')
      .select('id, txn_date, amount, payment_method, reference, status, reverses_id, category:categories(name)')
      .eq('sale_id', saleId)
      .order('txn_date')
      .order('created_at')
    if (error) throw error
    return (data ?? []).map((p) => ({ ...p, amount: n(p.amount) }))
  },

  async record(
    key: string,
    orgId: string,
    v: { site_id: string; date: string; lines: SaleLineInput[]; amount_received: number; payment_method?: string; customer_id?: string; customer_name?: string; customer_phone?: string; due_date?: string; reference?: string; notes?: string },
  ) {
    const { data, error } = await supabase.rpc('record_sale', {
      p_key: key,
      p_org: orgId,
      p_site: v.site_id,
      p_sale_date: v.date,
      p_lines: v.lines as unknown as never,
      p_amount_received: v.amount_received,
      p_payment_method: v.amount_received > 0 ? v.payment_method : undefined,
      p_customer_name: blankToNull(v.customer_name) ?? undefined,
      p_customer_phone: blankToNull(v.customer_phone) ?? undefined,
      p_reference: blankToNull(v.reference) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_customer: blankToNull(v.customer_id) ?? undefined,
      p_due_date: blankToNull(v.due_date) ?? undefined,
    })
    if (error) throw error
    return data as { sale_id: string; invoice_number: string; total: number }
  },

  async recordPayment(key: string, v: { sale_id: string; amount: number; date: string; method: string; reference?: string }) {
    const { error } = await supabase.rpc('record_sale_payment', {
      p_key: key,
      p_sale: v.sale_id,
      p_amount: v.amount,
      p_payment_date: v.date,
      p_payment_method: v.method,
      p_reference: blankToNull(v.reference) ?? undefined,
    })
    if (error) throw error
  },

  async void(key: string, saleId: string, reason: string) {
    const { error } = await supabase.rpc('void_sale', { p_key: key, p_sale: saleId, p_reason: reason })
    if (error) throw error
  },
}
