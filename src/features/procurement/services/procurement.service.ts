import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

const n = (v: unknown) => Number(v ?? 0)
const clean = (s?: string) => (s ?? '').replace(/[,()%]/g, ' ').trim()

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
export const SUPPLIER_CATEGORIES = ['feed', 'livestock', 'seed', 'agrochemical', 'veterinary', 'equipment', 'fuel', 'services', 'other'] as const
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number]
export const SUPPLIER_CATEGORY_LABEL: Record<SupplierCategory, string> = {
  feed: 'Feed',
  livestock: 'Chicks and fingerlings',
  seed: 'Seeds and seedlings',
  agrochemical: 'Fertilizer and agrochemicals',
  veterinary: 'Veterinary',
  equipment: 'Equipment',
  fuel: 'Fuel',
  services: 'Services',
  other: 'Other',
}

export interface SupplierBalance {
  id: string
  organization_id: string
  code: string | null
  name: string
  category: SupplierCategory
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  bank_name: string | null
  bank_account: string | null
  payment_terms_days: number
  status: 'active' | 'inactive'
  notes: string | null
  created_at: string
  bill_count: number
  total_billed: number
  total_paid: number
  balance_outstanding: number
  overdue_amount: number
  open_orders: number
  last_activity_date: string | null
}

export interface SupplierInput {
  code?: string
  name: string
  category: SupplierCategory
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  bank_name?: string
  bank_account?: string
  payment_terms_days?: number
  notes?: string
}

const toSupplier = (s: Record<string, unknown>): SupplierBalance => ({
  ...(s as unknown as SupplierBalance),
  total_billed: n(s.total_billed),
  total_paid: n(s.total_paid),
  balance_outstanding: n(s.balance_outstanding),
  overdue_amount: n(s.overdue_amount),
})

const supplierRow = (v: SupplierInput) => ({
  code: blankToNull(v.code),
  name: v.name.trim(),
  category: v.category,
  contact_person: blankToNull(v.contact_person),
  phone: blankToNull(v.phone),
  email: blankToNull(v.email),
  address: blankToNull(v.address),
  city: blankToNull(v.city),
  bank_name: blankToNull(v.bank_name),
  bank_account: blankToNull(v.bank_account),
  payment_terms_days: v.payment_terms_days ?? 0,
  notes: blankToNull(v.notes),
})

export const suppliersService = {
  async list(orgId: string, f: { search?: string; category?: string; status?: string; owing?: boolean } = {}): Promise<SupplierBalance[]> {
    let q = supabase.from('supplier_balances').select('*').eq('organization_id', orgId).order('name').limit(500)
    if (f.category) q = q.eq('category', f.category)
    if (f.status) q = q.eq('status', f.status)
    if (f.owing) q = q.gt('balance_outstanding', 0)
    const s = clean(f.search)
    if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,code.ilike.%${s}%,city.ilike.%${s}%,contact_person.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => toSupplier(r as Record<string, unknown>))
  },
  async options(orgId: string) {
    const { data, error } = await supabase.from('suppliers').select('id, name, payment_terms_days').eq('organization_id', orgId).eq('status', 'active').order('name').limit(1000)
    if (error) throw error
    return data ?? []
  },
  async get(id: string): Promise<SupplierBalance | null> {
    const { data, error } = await supabase.from('supplier_balances').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? toSupplier(data as Record<string, unknown>) : null
  },
  async create(orgId: string, v: SupplierInput): Promise<string> {
    const { data, error } = await supabase.from('suppliers').insert({ organization_id: orgId, ...supplierRow(v) }).select('id').single()
    if (error) throw error
    return data.id
  },
  async update(id: string, v: SupplierInput) {
    const { error } = await supabase.from('suppliers').update(supplierRow(v)).eq('id', id)
    if (error) throw error
  },
  async setStatus(id: string, status: 'active' | 'inactive') {
    const { error } = await supabase.from('suppliers').update({ status }).eq('id', id)
    if (error) throw error
  },
}

// ---------------------------------------------------------------------------
// Purchase requests
// ---------------------------------------------------------------------------
export type RequestStatus = 'submitted' | 'approved' | 'rejected' | 'ordered' | 'cancelled'
export const REQUEST_STATUS: Record<RequestStatus, { label: string; variant: 'info' | 'success' | 'danger' | 'neutral' | 'primary' }> = {
  submitted: { label: 'Awaiting approval', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  ordered: { label: 'Ordered', variant: 'primary' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export interface PurchaseRequestSummary {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  request_number: string
  needed_by: string | null
  reason: string
  status: RequestStatus
  requested_by: string | null
  requested_by_name: string | null
  decided_by_name: string | null
  decided_at: string | null
  decision_note: string | null
  line_count: number
  estimated_total: number
  purchase_order_id: string | null
  po_number: string | null
  created_at: string
}

export interface RequestLine {
  id: string
  item_id: string | null
  description: string
  quantity: number
  unit_id: string
  estimated_unit_cost: number | null
  unit: { symbol: string } | null
}

export interface LineInput {
  item_id?: string
  description?: string
  quantity: number
  unit_id: string
  unit_price?: number
  estimated_unit_cost?: number
}

// ---------------------------------------------------------------------------
// Purchase orders and receipts
// ---------------------------------------------------------------------------
export type ReceiptStatus = 'draft' | 'awaiting' | 'partially_received' | 'received' | 'closed' | 'cancelled'
export const RECEIPT_STATUS: Record<ReceiptStatus, { label: string; variant: 'outline' | 'info' | 'warning' | 'success' | 'neutral' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  awaiting: { label: 'Awaiting delivery', variant: 'info' },
  partially_received: { label: 'Part received', variant: 'warning' },
  received: { label: 'Received', variant: 'success' },
  closed: { label: 'Closed', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export interface PurchaseOrderSummary {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  store_id: string
  store_name: string
  po_number: string
  supplier_id: string
  supplier_name: string
  purchase_request_id: string | null
  request_number: string | null
  order_date: string
  expected_date: string | null
  status: 'draft' | 'issued' | 'closed' | 'cancelled'
  receipt_status: ReceiptStatus
  notes: string | null
  status_reason: string | null
  order_total: number
  received_value: number
  billed_amount: number
  paid_amount: number
  line_count: number
}

export interface PurchaseOrderLine {
  id: string
  item_id: string | null
  item_name: string | null
  description: string
  quantity: number
  unit_id: string
  unit_symbol: string
  unit_price: number
  line_total: number
  received_quantity: number
  rejected_quantity: number
  remaining_quantity: number
}

export interface GoodsReceipt {
  id: string
  grn_number: string
  received_date: string
  delivery_reference: string | null
  notes: string | null
  status: 'posted' | 'voided'
  void_reason: string | null
  store: { name: string } | null
  lines: { quantity_received: number; quantity_rejected: number; rejection_reason: string | null; line: { description: string; unit: { symbol: string } | null } | null }[]
}

// ---------------------------------------------------------------------------
// Supplier bills
// ---------------------------------------------------------------------------
export interface SupplierBillSummary {
  id: string
  organization_id: string
  site_id: string | null
  supplier_id: string
  supplier_name: string
  purchase_order_id: string | null
  po_number: string | null
  bill_number: string
  bill_date: string
  due_date: string | null
  amount: number
  category_id: string
  category_name: string
  description: string
  status: 'posted' | 'voided'
  void_reason: string | null
  amount_paid: number
  amount_outstanding: number
  is_overdue: boolean
}

export function billStatus(b: Pick<SupplierBillSummary, 'status' | 'amount' | 'amount_paid' | 'is_overdue'>): { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (b.status === 'voided') return { label: 'Voided', variant: 'neutral' }
  if (b.amount_paid >= b.amount) return { label: 'Paid', variant: 'success' }
  if (b.is_overdue) return { label: 'Overdue', variant: 'danger' }
  if (b.amount_paid > 0) return { label: 'Part paid', variant: 'warning' }
  return { label: 'Unpaid', variant: 'warning' }
}

const toPo = (o: Record<string, unknown>): PurchaseOrderSummary => ({
  ...(o as unknown as PurchaseOrderSummary),
  order_total: n(o.order_total),
  received_value: n(o.received_value),
  billed_amount: n(o.billed_amount),
  paid_amount: n(o.paid_amount),
})
const toBill = (b: Record<string, unknown>): SupplierBillSummary => ({
  ...(b as unknown as SupplierBillSummary),
  amount: n(b.amount),
  amount_paid: n(b.amount_paid),
  amount_outstanding: n(b.amount_outstanding),
})

export const procurementService = {
  // Requests
  async requests(orgId: string, f: { siteId?: string; status?: string; search?: string } = {}): Promise<PurchaseRequestSummary[]> {
    let q = supabase.from('purchase_request_summaries').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(300)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.status) q = q.eq('status', f.status)
    const s = clean(f.search)
    if (s) q = q.or(`request_number.ilike.%${s}%,reason.ilike.%${s}%,requested_by_name.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => ({ ...(r as unknown as PurchaseRequestSummary), estimated_total: n(r.estimated_total) }))
  },
  async requestLines(requestId: string): Promise<RequestLine[]> {
    const { data, error } = await supabase.from('purchase_request_lines').select('id, item_id, description, quantity, unit_id, estimated_unit_cost, unit:units(symbol)').eq('purchase_request_id', requestId).order('created_at')
    if (error) throw error
    return (data ?? []).map((l) => ({ ...(l as unknown as RequestLine), quantity: n(l.quantity), estimated_unit_cost: l.estimated_unit_cost === null ? null : n(l.estimated_unit_cost) }))
  },
  async createRequest(key: string, orgId: string, v: { site_id: string; reason: string; needed_by?: string; lines: LineInput[] }) {
    const { data, error } = await supabase.rpc('create_purchase_request', {
      p_key: key, p_org: orgId, p_site: v.site_id, p_reason: v.reason, p_lines: v.lines as unknown as never, p_needed_by: blankToNull(v.needed_by) ?? undefined,
    })
    if (error) throw error
    return data as { purchase_request_id: string; request_number: string; replayed?: boolean }
  },
  async decideRequest(requestId: string, decision: 'approved' | 'rejected' | 'cancelled', note?: string) {
    const { error } = await supabase.rpc('decide_purchase_request', { p_request: requestId, p_decision: decision, p_note: blankToNull(note) ?? undefined })
    if (error) throw error
  },

  // Orders
  async orders(orgId: string, f: { siteId?: string; status?: string; supplierId?: string; search?: string; from?: string; to?: string } = {}): Promise<PurchaseOrderSummary[]> {
    let q = supabase.from('purchase_order_summaries').select('*').eq('organization_id', orgId).order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.status === 'open') q = q.in('receipt_status', ['awaiting', 'partially_received'])
    else if (f.status) q = q.eq('receipt_status', f.status)
    if (f.supplierId) q = q.eq('supplier_id', f.supplierId)
    if (f.from) q = q.gte('order_date', f.from)
    if (f.to) q = q.lte('order_date', f.to)
    const s = clean(f.search)
    if (s) q = q.or(`po_number.ilike.%${s}%,supplier_name.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((o) => toPo(o as Record<string, unknown>))
  },
  async order(id: string): Promise<PurchaseOrderSummary | null> {
    const { data, error } = await supabase.from('purchase_order_summaries').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? toPo(data as Record<string, unknown>) : null
  },
  async orderLines(orderId: string): Promise<PurchaseOrderLine[]> {
    const { data, error } = await supabase.from('purchase_order_line_progress').select('*').eq('purchase_order_id', orderId).order('created_at')
    if (error) throw error
    return (data ?? []).map((l) => ({
      ...(l as unknown as PurchaseOrderLine),
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      line_total: n(l.line_total),
      received_quantity: n(l.received_quantity),
      rejected_quantity: n(l.rejected_quantity),
      remaining_quantity: n(l.remaining_quantity),
    }))
  },
  async receipts(orderId: string): Promise<GoodsReceipt[]> {
    const { data, error } = await supabase
      .from('goods_receipts')
      .select('id, grn_number, received_date, delivery_reference, notes, status, void_reason, store:stores(name), lines:goods_receipt_lines(quantity_received, quantity_rejected, rejection_reason, line:purchase_order_lines(description, unit:units(symbol)))')
      .eq('purchase_order_id', orderId)
      .order('created_at')
    if (error) throw error
    return (data ?? []).map((g) => ({
      ...(g as unknown as GoodsReceipt),
      lines: ((g.lines ?? []) as unknown as GoodsReceipt['lines']).map((l) => ({ ...l, quantity_received: n(l.quantity_received), quantity_rejected: n(l.quantity_rejected) })),
    }))
  },
  async createOrder(
    key: string,
    orgId: string,
    v: { site_id: string; supplier_id: string; store_id: string; order_date: string; expected_date?: string; request_id?: string; notes?: string; issue: boolean; lines: LineInput[] },
  ) {
    const { data, error } = await supabase.rpc('create_purchase_order', {
      p_key: key,
      p_org: orgId,
      p_site: v.site_id,
      p_supplier: v.supplier_id,
      p_store: v.store_id,
      p_order_date: v.order_date,
      p_lines: v.lines as unknown as never,
      p_expected_date: blankToNull(v.expected_date) ?? undefined,
      p_request: blankToNull(v.request_id) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_issue: v.issue,
    })
    if (error) throw error
    return data as { purchase_order_id: string; po_number: string; replayed?: boolean }
  },
  async setOrderStatus(orderId: string, status: 'issued' | 'cancelled' | 'closed', reason?: string) {
    const { error } = await supabase.rpc('set_purchase_order_status', { p_order: orderId, p_status: status, p_reason: blankToNull(reason) ?? undefined })
    if (error) throw error
  },
  async receive(
    key: string,
    v: { order_id: string; date: string; store_id?: string; delivery_reference?: string; notes?: string; lines: { order_line_id: string; quantity_received: number; quantity_rejected?: number; rejection_reason?: string }[] },
  ) {
    const { data, error } = await supabase.rpc('receive_purchase_order', {
      p_key: key,
      p_order: v.order_id,
      p_received_date: v.date,
      p_lines: v.lines as unknown as never,
      p_store: blankToNull(v.store_id) ?? undefined,
      p_delivery_reference: blankToNull(v.delivery_reference) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
    return data as { goods_receipt_id: string; grn_number: string; replayed?: boolean }
  },
  async voidReceipt(key: string, receiptId: string, reason: string) {
    const { error } = await supabase.rpc('void_goods_receipt', { p_key: key, p_receipt: receiptId, p_reason: reason })
    if (error) throw error
  },

  // Bills
  async bills(orgId: string, f: { supplierId?: string; orderId?: string; outstanding?: '' | 'owed' | 'overdue'; search?: string; from?: string; to?: string } = {}): Promise<SupplierBillSummary[]> {
    let q = supabase.from('supplier_bill_summaries').select('*').eq('organization_id', orgId).order('bill_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (f.supplierId) q = q.eq('supplier_id', f.supplierId)
    if (f.orderId) q = q.eq('purchase_order_id', f.orderId)
    if (f.outstanding === 'owed') q = q.gt('amount_outstanding', 0)
    if (f.outstanding === 'overdue') q = q.eq('is_overdue', true)
    if (f.from) q = q.gte('bill_date', f.from)
    if (f.to) q = q.lte('bill_date', f.to)
    const s = clean(f.search)
    if (s) q = q.or(`bill_number.ilike.%${s}%,supplier_name.ilike.%${s}%,description.ilike.%${s}%,po_number.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((b) => toBill(b as Record<string, unknown>))
  },
  async bill(id: string): Promise<SupplierBillSummary | null> {
    const { data, error } = await supabase.from('supplier_bill_summaries').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? toBill(data as Record<string, unknown>) : null
  },
  async billPayments(billId: string) {
    const { data, error } = await supabase
      .from('finance_transactions')
      .select('id, txn_date, amount, payment_method, reference, status, reverses_id')
      .eq('supplier_bill_id', billId)
      .order('txn_date')
      .order('created_at')
    if (error) throw error
    return (data ?? []).map((p) => ({ ...p, amount: n(p.amount) }))
  },
  async recordBill(
    key: string,
    orgId: string,
    v: { supplier_id: string; bill_number: string; bill_date: string; due_date?: string; amount: number; description: string; site_id?: string; order_id?: string; category_id?: string },
  ) {
    const { data, error } = await supabase.rpc('record_supplier_bill', {
      p_key: key,
      p_org: orgId,
      p_supplier: v.supplier_id,
      p_bill_number: v.bill_number,
      p_bill_date: v.bill_date,
      p_amount: v.amount,
      p_description: v.description,
      p_due_date: blankToNull(v.due_date) ?? undefined,
      p_site: blankToNull(v.site_id) ?? undefined,
      p_order: blankToNull(v.order_id) ?? undefined,
      p_category: blankToNull(v.category_id) ?? undefined,
    })
    if (error) throw error
    return data as { supplier_bill_id: string; replayed?: boolean }
  },
  async payBill(key: string, v: { bill_id: string; amount: number; date: string; method: string; reference?: string }) {
    const { data, error } = await supabase.rpc('pay_supplier_bill', {
      p_key: key, p_bill: v.bill_id, p_amount: v.amount, p_payment_date: v.date, p_payment_method: v.method, p_reference: blankToNull(v.reference) ?? undefined,
    })
    if (error) throw error
    return data as { finance_transaction_id: string; outstanding: number; replayed?: boolean }
  },
  async voidBill(billId: string, reason: string) {
    const { error } = await supabase.rpc('void_supplier_bill', { p_bill: billId, p_reason: reason })
    if (error) throw error
  },
}
