import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'
import type { ActivityProductionType } from '@/shared/lib/permissions'

export type ProductSource = 'produce' | 'livestock' | 'other'

export const PRODUCT_SOURCE_LABEL: Record<ProductSource, string> = {
  produce: 'Produce (eggs, fish, harvest)',
  livestock: 'Live animals',
  other: 'Other (not stock-tracked)',
}

export interface Product {
  id: string
  organization_id: string
  name: string
  sku: string | null
  production_type: ActivityProductionType
  source_kind: ProductSource
  match_name: string | null
  unit_id: string
  default_price: number
  is_active: boolean
  description: string | null
  unit: { symbol: string; dimension: string; code: string } | null
}

export interface ProductInput {
  name: string
  sku?: string
  production_type: ActivityProductionType
  source_kind: ProductSource
  match_name?: string
  unit_id: string
  default_price: number
  description?: string
}

const n = (v: unknown) => Number(v ?? 0)

export const productsService = {
  async list(orgId: string, opts: { activeOnly?: boolean } = {}): Promise<Product[]> {
    let q = supabase.from('products').select('*, unit:units(symbol, dimension, code)').eq('organization_id', orgId).order('name')
    if (opts.activeOnly) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((p) => ({ ...(p as unknown as Product), default_price: n(p.default_price) }))
  },

  /** Quantity available per product on one site (or summed over all sites). Null for products that are not stock-tracked. */
  async availability(orgId: string, siteId?: string): Promise<Map<string, number | null>> {
    let q = supabase.from('product_availability').select('product_id, site_id, available_quantity').eq('organization_id', orgId)
    if (siteId) q = q.eq('site_id', siteId)
    const { data, error } = await q
    if (error) throw error
    const map = new Map<string, number | null>()
    for (const r of data ?? []) {
      if (r.available_quantity === null) map.set(r.product_id!, null)
      else map.set(r.product_id!, (map.get(r.product_id!) ?? 0) + n(r.available_quantity))
    }
    return map
  },

  /** Produce names and species already recorded, to match products against. */
  async matchSuggestions(orgId: string): Promise<{ produce: string[]; species: string[] }> {
    const [p, b] = await Promise.all([
      supabase.from('production_records').select('product').eq('organization_id', orgId).limit(1000),
      supabase.from('batches').select('species').eq('organization_id', orgId).limit(1000),
    ])
    if (p.error) throw p.error
    if (b.error) throw b.error
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort()
    return { produce: uniq((p.data ?? []).map((r) => r.product)), species: uniq((b.data ?? []).map((r) => r.species)) }
  },

  async create(orgId: string, v: ProductInput): Promise<string> {
    const { data, error } = await supabase
      .from('products')
      .insert({
        organization_id: orgId,
        name: v.name.trim(),
        sku: blankToNull(v.sku),
        production_type: v.production_type,
        source_kind: v.source_kind,
        match_name: v.source_kind === 'other' ? null : blankToNull(v.match_name),
        unit_id: v.unit_id,
        default_price: v.default_price,
        description: blankToNull(v.description),
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  },

  async update(id: string, v: Omit<ProductInput, 'source_kind'> & { source_kind: ProductSource; is_active?: boolean }) {
    const { error } = await supabase
      .from('products')
      .update({
        name: v.name.trim(),
        sku: blankToNull(v.sku),
        production_type: v.production_type,
        match_name: v.source_kind === 'other' ? null : blankToNull(v.match_name),
        unit_id: v.unit_id,
        default_price: v.default_price,
        description: blankToNull(v.description),
        ...(v.is_active === undefined ? {} : { is_active: v.is_active }),
      })
      .eq('id', id)
    if (error) throw error
  },

  async setActive(id: string, isActive: boolean) {
    const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id)
    if (error) throw error
  },
}
