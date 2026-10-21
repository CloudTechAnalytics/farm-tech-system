import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'
import type { ProductSource } from '@/features/sales/services/products.service'

export type FulfilmentStatus = 'draft' | 'open' | 'partially_fulfilled' | 'fulfilled' | 'cancelled'

export const FULFILMENT_LABEL: Record<FulfilmentStatus, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  open: { label: 'Open', variant: 'info' },
  partially_fulfilled: { label: 'Part delivered', variant: 'warning' },
  fulfilled: { label: 'Delivered', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export interface SalesOrderSummary {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  order_number: string
  customer_id: string
  customer_name: string
  order_date: string
  required_by: string | null
  status: 'draft' | 'confirmed' | 'cancelled'
  fulfilment_status: FulfilmentStatus
  notes: string | null
  cancel_reason: string | null
  order_total: number
  fulfilled_value: number
  line_count: number
  created_at: string
}

export interface OrderLineProgress {
  id: string
  product_id: string
  description: string
  quantity: number
  unit_id: string
  unit_symbol: string
  unit_price: number
  line_total: number
  source_kind: ProductSource
  match_name: string | null
  fulfilled_quantity: number
  remaining_quantity: number
}

export interface OrderLineInput {
  product_id: string
  quantity: number
  unit_id?: string
  unit_price?: number
  description?: string
}

const n = (v: unknown) => Number(v ?? 0)

const toSummary = (o: Record<string, unknown>): SalesOrderSummary => ({
  ...(o as unknown as SalesOrderSummary),
  order_total: n(o.order_total),
  fulfilled_value: n(o.fulfilled_value),
})

export const ordersService = {
  async list(orgId: string, f: { siteId?: string; status?: string; customerId?: string; search?: string; from?: string; to?: string } = {}): Promise<SalesOrderSummary[]> {
    let q = supabase.from('sales_order_summaries').select('*').eq('organization_id', orgId).order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.status === 'active') q = q.in('fulfilment_status', ['open', 'partially_fulfilled'])
    else if (f.status) q = q.eq('fulfilment_status', f.status)
    if (f.customerId) q = q.eq('customer_id', f.customerId)
    if (f.from) q = q.gte('order_date', f.from)
    if (f.to) q = q.lte('order_date', f.to)
    if (f.search) {
      const s = f.search.replace(/[,()%]/g, ' ').trim()
      if (s) q = q.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((o) => toSummary(o as Record<string, unknown>))
  },

  async get(id: string): Promise<SalesOrderSummary | null> {
    const { data, error } = await supabase.from('sales_order_summaries').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? toSummary(data as Record<string, unknown>) : null
  },

  async lines(orderId: string): Promise<OrderLineProgress[]> {
    const { data, error } = await supabase.from('sales_order_line_progress').select('*').eq('sales_order_id', orderId).order('created_at')
    if (error) throw error
    return (data ?? []).map((l) => ({
      ...(l as unknown as OrderLineProgress),
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      line_total: n(l.line_total),
      fulfilled_quantity: n(l.fulfilled_quantity),
      remaining_quantity: n(l.remaining_quantity),
    }))
  },

  async create(key: string, orgId: string, v: { site_id: string; customer_id: string; order_date: string; required_by?: string; notes?: string; lines: OrderLineInput[]; confirm: boolean }) {
    const { data, error } = await supabase.rpc('create_sales_order', {
      p_key: key,
      p_org: orgId,
      p_site: v.site_id,
      p_customer: v.customer_id,
      p_order_date: v.order_date,
      p_lines: v.lines as unknown as never,
      p_required_by: blankToNull(v.required_by) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_confirm: v.confirm,
    })
    if (error) throw error
    return data as { sales_order_id: string; order_number: string; replayed?: boolean }
  },

  async setStatus(orderId: string, status: 'confirmed' | 'cancelled', reason?: string) {
    const { error } = await supabase.rpc('set_sales_order_status', { p_order: orderId, p_status: status, p_reason: reason })
    if (error) throw error
  },

  async fulfil(
    key: string,
    v: { order_id: string; date: string; lines: { order_line_id: string; quantity: number; batch_id?: string }[]; amount_received: number; payment_method?: string; reference?: string; due_date?: string },
  ) {
    const { data, error } = await supabase.rpc('fulfil_sales_order', {
      p_key: key,
      p_order: v.order_id,
      p_fulfil_date: v.date,
      p_lines: v.lines as unknown as never,
      p_amount_received: v.amount_received,
      p_payment_method: v.amount_received > 0 ? v.payment_method : undefined,
      p_reference: blankToNull(v.reference) ?? undefined,
      p_due_date: blankToNull(v.due_date) ?? undefined,
    })
    if (error) throw error
    return data as { sale_id: string; invoice_number: string; total: number; replayed?: boolean }
  },
}
