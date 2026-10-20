import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

export type PaymentMethod = 'cash' | 'bank_transfer' | 'pos' | 'mobile_money' | 'cheque' | 'other'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'pos', label: 'POS / card' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

export const PAYMENT_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<string, string>

export interface FinanceTransaction {
  id: string
  organization_id: string
  site_id: string | null
  txn_date: string
  kind: 'income' | 'expense'
  category_id: string
  amount: number
  currency: string
  payment_method: PaymentMethod | null
  description: string
  reference: string | null
  counterparty: string | null
  production_type: string | null
  batch_id: string | null
  crop_cycle_id: string | null
  sale_id: string | null
  inventory_movement_id: string | null
  status: 'posted' | 'reversed'
  reverses_id: string | null
  reversal_reason: string | null
  created_at: string
  category: { name: string } | null
  site: { name: string } | null
  batch: { code: string } | null
  crop_cycle: { code: string } | null
}

export interface FinanceValues {
  kind: 'income' | 'expense'
  category_id: string
  amount: number
  date: string
  description: string
  site_id?: string
  payment_method?: string
  reference?: string
  counterparty?: string
  production_type?: string
  batch_id?: string
  crop_cycle_id?: string
}

export const financeService = {
  async list(
    orgId: string,
    f: { siteId?: string; kind?: 'income' | 'expense'; from?: string; to?: string; categoryId?: string; search?: string; batchId?: string; cropCycleId?: string },
  ): Promise<FinanceTransaction[]> {
    let q = supabase
      .from('finance_transactions')
      .select('*, category:categories(name), site:farm_sites(name), batch:batches(code), crop_cycle:crop_cycles(code)')
      .eq('organization_id', orgId)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.kind) q = q.eq('kind', f.kind)
    if (f.from) q = q.gte('txn_date', f.from)
    if (f.to) q = q.lte('txn_date', f.to)
    if (f.categoryId) q = q.eq('category_id', f.categoryId)
    if (f.batchId) q = q.eq('batch_id', f.batchId)
    if (f.cropCycleId) q = q.eq('crop_cycle_id', f.cropCycleId)
    if (f.search?.trim()) q = q.or(`description.ilike.%${f.search.trim().replace(/[%,()]/g, '')}%,counterparty.ilike.%${f.search.trim().replace(/[%,()]/g, '')}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((t) => ({ ...(t as unknown as FinanceTransaction), amount: Number(t.amount) }))
  },

  async record(key: string, orgId: string, v: FinanceValues) {
    const { error } = await supabase.rpc('record_finance_transaction', {
      p_key: key,
      p_org: orgId,
      p_kind: v.kind,
      p_category: v.category_id,
      p_amount: v.amount,
      p_txn_date: v.date,
      p_description: v.description,
      p_site: v.site_id || undefined,
      p_payment_method: v.payment_method || undefined,
      p_reference: blankToNull(v.reference) ?? undefined,
      p_counterparty: blankToNull(v.counterparty) ?? undefined,
      p_production_type: v.production_type || undefined,
      p_batch: v.batch_id || undefined,
      p_crop_cycle: v.crop_cycle_id || undefined,
    })
    if (error) throw error
  },

  async reverse(key: string, id: string, reason: string) {
    const { error } = await supabase.rpc('reverse_finance_transaction', { p_key: key, p_transaction: id, p_reason: reason })
    if (error) throw error
  },
}
