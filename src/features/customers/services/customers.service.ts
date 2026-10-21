import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'

export const CUSTOMER_CATEGORIES = ['individual', 'retailer', 'wholesaler', 'processor', 'hotel_restaurant', 'institution', 'other'] as const
export type CustomerCategory = (typeof CUSTOMER_CATEGORIES)[number]

export const CUSTOMER_CATEGORY_LABEL: Record<CustomerCategory, string> = {
  individual: 'Individual',
  retailer: 'Retailer',
  wholesaler: 'Wholesaler',
  processor: 'Processor',
  hotel_restaurant: 'Hotel or restaurant',
  institution: 'School or institution',
  other: 'Other',
}

export interface Customer {
  id: string
  organization_id: string
  code: string | null
  name: string
  category: CustomerCategory
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  credit_limit: number | null
  payment_terms_days: number
  status: 'active' | 'inactive'
  notes: string | null
  created_at: string
}

export interface CustomerBalance extends Customer {
  invoice_count: number
  total_invoiced: number
  total_received: number
  balance_outstanding: number
  overdue_amount: number
  last_sale_date: string | null
}

export interface CustomerInput {
  code?: string
  name: string
  category: CustomerCategory
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  credit_limit?: number | null
  payment_terms_days?: number
  notes?: string
}

export interface CustomerPrice {
  id: string
  product_id: string
  unit_price: number
  product: { name: string; unit: { symbol: string } | null } | null
}

const n = (v: unknown) => Number(v ?? 0)

function toBalance(c: Record<string, unknown>): CustomerBalance {
  return {
    ...(c as unknown as CustomerBalance),
    credit_limit: c.credit_limit === null ? null : n(c.credit_limit),
    total_invoiced: n(c.total_invoiced),
    total_received: n(c.total_received),
    balance_outstanding: n(c.balance_outstanding),
    overdue_amount: n(c.overdue_amount),
  }
}

function clean(v: CustomerInput) {
  return {
    code: blankToNull(v.code),
    name: v.name.trim(),
    category: v.category,
    contact_person: blankToNull(v.contact_person),
    phone: blankToNull(v.phone),
    email: blankToNull(v.email),
    address: blankToNull(v.address),
    city: blankToNull(v.city),
    credit_limit: v.credit_limit ?? null,
    payment_terms_days: v.payment_terms_days ?? 0,
    notes: blankToNull(v.notes),
  }
}

export const customersService = {
  async list(orgId: string, f: { search?: string; category?: string; status?: string; owing?: boolean } = {}): Promise<CustomerBalance[]> {
    let q = supabase.from('customer_balances').select('*').eq('organization_id', orgId).order('name').limit(500)
    if (f.category) q = q.eq('category', f.category)
    if (f.status) q = q.eq('status', f.status)
    if (f.owing) q = q.gt('balance_outstanding', 0)
    if (f.search) {
      const s = f.search.replace(/[,()%]/g, ' ').trim()
      if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,code.ilike.%${s}%,city.ilike.%${s}%,contact_person.ilike.%${s}%`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((c) => toBalance(c as Record<string, unknown>))
  },

  /** Active customers for pickers. */
  async options(orgId: string): Promise<Pick<Customer, 'id' | 'name' | 'phone' | 'credit_limit' | 'payment_terms_days'>[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, credit_limit, payment_terms_days')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name')
      .limit(1000)
    if (error) throw error
    return (data ?? []).map((c) => ({ ...c, credit_limit: c.credit_limit === null ? null : n(c.credit_limit) }))
  },

  async get(id: string): Promise<CustomerBalance | null> {
    const { data, error } = await supabase.from('customer_balances').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? toBalance(data as Record<string, unknown>) : null
  },

  async create(orgId: string, v: CustomerInput): Promise<string> {
    const { data, error } = await supabase.from('customers').insert({ organization_id: orgId, ...clean(v) }).select('id').single()
    if (error) throw error
    return data.id
  },

  async update(id: string, v: CustomerInput & { status?: Customer['status'] }) {
    const { error } = await supabase.from('customers').update({ ...clean(v), ...(v.status ? { status: v.status } : {}) }).eq('id', id)
    if (error) throw error
  },

  async setStatus(id: string, status: Customer['status']) {
    const { error } = await supabase.from('customers').update({ status }).eq('id', id)
    if (error) throw error
  },

  async prices(customerId: string): Promise<CustomerPrice[]> {
    const { data, error } = await supabase
      .from('customer_prices')
      .select('id, product_id, unit_price, product:products(name, unit:units(symbol))')
      .eq('customer_id', customerId)
    if (error) throw error
    return (data ?? []).map((p) => ({ ...(p as unknown as CustomerPrice), unit_price: n(p.unit_price) }))
  },

  async setPrice(orgId: string, customerId: string, productId: string, unitPrice: number) {
    // Only the price is updatable, so change an existing row rather than upsert.
    const { data, error: updateError } = await supabase
      .from('customer_prices')
      .update({ unit_price: unitPrice })
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .select('id')
    if (updateError) throw updateError
    if (data?.length) return
    const { error } = await supabase.from('customer_prices').insert({ organization_id: orgId, customer_id: customerId, product_id: productId, unit_price: unitPrice })
    if (error) throw error
  },

  async removePrice(id: string) {
    const { error } = await supabase.from('customer_prices').delete().eq('id', id)
    if (error) throw error
  },
}
