import { supabase } from '@/shared/lib/supabase'

const n = (v: unknown) => Number(v ?? 0)
const clean = (s?: string) => (s ?? '').replace(/[,()%]/g, ' ').trim()

export interface Aging {
  total: number
  count: number
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
}

export interface FinancePosition {
  receivables: Aging
  payables: Aging
  cash_by_method: { method: string; balance: number }[]
  net_recorded_cash: number
}

export interface Receivable {
  sale_id: string
  site_name: string
  invoice_number: string
  sale_date: string
  due_date: string | null
  customer_id: string | null
  customer_display_name: string | null
  customer_phone: string | null
  total_amount: number
  amount_received: number
  amount_outstanding: number
  is_overdue: boolean
  days_overdue: number
}

export interface Payable {
  supplier_bill_id: string
  supplier_id: string
  supplier_name: string
  bill_number: string
  bill_date: string
  due_date: string | null
  po_number: string | null
  description: string
  amount: number
  amount_paid: number
  amount_outstanding: number
  is_overdue: boolean
  days_overdue: number
}

export interface CashbookRow {
  id: string | null
  txn_date: string
  kind: 'income' | 'expense' | 'opening'
  description: string
  counterparty: string | null
  reference: string | null
  payment_method: string | null
  category_name: string | null
  money_in: number | null
  money_out: number | null
  balance: number
  sale_id: string | null
  supplier_bill_id: string | null
  is_reversal: boolean
  is_opening: boolean
}

export interface ProfitComparison {
  cash: { money_in: number; money_in_for_sales: number; money_out: number; money_out_on_bills: number; surplus: number }
  accrual: { sales_invoiced: number; other_income: number; supplier_bills: number; direct_expenses: number; profit: number }
  difference: { sales_not_yet_received: number; bills_not_yet_paid: number }
}

const aging = (a: Record<string, unknown>): Aging => ({
  total: n(a.total),
  count: n(a.count),
  current: n(a.current),
  d1_30: n(a.d1_30),
  d31_60: n(a.d31_60),
  d61_90: n(a.d61_90),
  d90_plus: n(a.d90_plus),
})

export const positionService = {
  async position(orgId: string, siteId?: string): Promise<FinancePosition> {
    const { data, error } = await supabase.rpc('finance_position', { p_org: orgId, p_site: siteId })
    if (error) throw error
    const d = data as Record<string, Record<string, unknown> | unknown[] | number>
    return {
      receivables: aging(d.receivables as Record<string, unknown>),
      payables: aging(d.payables as Record<string, unknown>),
      cash_by_method: ((d.cash_by_method as { method: string; balance: unknown }[]) ?? []).map((c) => ({ method: c.method, balance: n(c.balance) })),
      net_recorded_cash: n(d.net_recorded_cash),
    }
  },

  async receivables(orgId: string, f: { siteId?: string; overdueOnly?: boolean; search?: string } = {}): Promise<Receivable[]> {
    let q = supabase.from('receivables').select('*').eq('organization_id', orgId).order('days_overdue', { ascending: false }).order('sale_date').limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.overdueOnly) q = q.eq('is_overdue', true)
    const s = clean(f.search)
    if (s) q = q.or(`invoice_number.ilike.%${s}%,customer_display_name.ilike.%${s}%,customer_phone.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => ({ ...(r as unknown as Receivable), total_amount: n(r.total_amount), amount_received: n(r.amount_received), amount_outstanding: n(r.amount_outstanding), days_overdue: n(r.days_overdue) }))
  },

  async payables(orgId: string, f: { siteId?: string; overdueOnly?: boolean; search?: string } = {}): Promise<Payable[]> {
    let q = supabase.from('payables').select('*').eq('organization_id', orgId).order('days_overdue', { ascending: false }).order('bill_date').limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.overdueOnly) q = q.eq('is_overdue', true)
    const s = clean(f.search)
    if (s) q = q.or(`bill_number.ilike.%${s}%,supplier_name.ilike.%${s}%,po_number.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => ({ ...(r as unknown as Payable), amount: n(r.amount), amount_paid: n(r.amount_paid), amount_outstanding: n(r.amount_outstanding), days_overdue: n(r.days_overdue) }))
  },

  async cashbook(orgId: string, f: { from: string; to: string; siteId?: string; method?: string }): Promise<CashbookRow[]> {
    const { data, error } = await supabase.rpc('report_cashbook', { p_org: orgId, p_from: f.from, p_to: f.to, p_site: f.siteId, p_method: f.method || undefined })
    if (error) throw error
    return ((data ?? []) as unknown as CashbookRow[]).map((r) => ({
      ...r,
      money_in: r.money_in === null ? null : n(r.money_in),
      money_out: r.money_out === null ? null : n(r.money_out),
      balance: n(r.balance),
    }))
  },

  async profitComparison(orgId: string, f: { from: string; to: string; siteId?: string }): Promise<ProfitComparison> {
    const { data, error } = await supabase.rpc('report_profit_comparison', { p_org: orgId, p_from: f.from, p_to: f.to, p_site: f.siteId })
    if (error) throw error
    const d = data as unknown as ProfitComparison
    const num = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, n(v)])) as T
    return { cash: num(d.cash), accrual: num(d.accrual), difference: num(d.difference) }
  },
}
