import { supabase } from '@/shared/lib/supabase'

export interface Unit {
  id: string
  organization_id: string | null
  code: string
  name: string
  symbol: string
  dimension: 'count' | 'mass' | 'volume' | 'area' | 'length'
  to_base: number
  is_active: boolean
}

export type CategoryKind = 'activity' | 'inventory' | 'income' | 'expense'

export interface Category {
  id: string
  organization_id: string
  kind: CategoryKind
  code: string
  name: string
  production_type: 'poultry' | 'fish' | 'crop' | 'general' | null
  is_system: boolean
  is_active: boolean
  sort_order: number
}

export interface Member {
  id: string
  user_id: string
  status: string
  access_scope: 'organization' | 'sites'
  job_title: string | null
  role_id: string
  joined_at: string
  profile: { id: string; full_name: string | null; email: string }
  role: { id: string; name: string; is_owner_role: boolean }
  site_ids: string[]
}

/** Activity codes written by the system; they must be recorded from their own workflow. */
export const LEDGER_ACTIVITY_CODES = new Set([
  'stocking', 'mortality', 'cull', 'feed_issue', 'feed_consumption', 'feed_return', 'feed_wastage', 'egg_collection',
  'sampling', 'harvest', 'transfer', 'sale', 'batch_close', 'input_application', 'population_adjustment',
  'stock_received', 'stock_used', 'stock_wastage', 'stock_count',
])

export const referenceService = {
  async units(orgId: string): Promise<Unit[]> {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .or(`organization_id.is.null,organization_id.eq.${orgId}`)
      .order('dimension')
      .order('to_base')
    if (error) throw error
    return (data ?? []).map((u) => ({ ...u, to_base: Number(u.to_base) })) as Unit[]
  },

  async createUnit(orgId: string, v: { code: string; name: string; symbol: string; dimension: Unit['dimension']; to_base: number }) {
    const { error } = await supabase.from('units').insert({ organization_id: orgId, ...v })
    if (error) throw error
  },

  async updateUnit(id: string, patch: { name?: string; symbol?: string; is_active?: boolean }) {
    const { error } = await supabase.from('units').update(patch).eq('id', id)
    if (error) throw error
  },

  async categories(orgId: string): Promise<Category[]> {
    const { data, error } = await supabase.from('categories').select('*').eq('organization_id', orgId).order('kind').order('sort_order').order('name')
    if (error) throw error
    return (data ?? []) as Category[]
  },

  async createCategory(orgId: string, v: { kind: CategoryKind; name: string; production_type: Category['production_type'] }) {
    const code = v.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30)
    const { error } = await supabase.from('categories').insert({
      organization_id: orgId,
      kind: v.kind,
      code: `${code || 'custom'}_${Math.random().toString(36).slice(2, 6)}`,
      name: v.name.trim(),
      production_type: v.production_type,
      sort_order: 90,
    })
    if (error) throw error
  },

  async updateCategory(id: string, patch: { name?: string; is_active?: boolean }) {
    const { error } = await supabase.from('categories').update(patch).eq('id', id)
    if (error) throw error
  },

  async members(orgId: string): Promise<Member[]> {
    const { data, error } = await supabase
      .from('memberships')
      .select(
        'id, user_id, status, access_scope, job_title, role_id, joined_at, profile:profiles!memberships_user_id_fkey(id, full_name, email), role:roles(id, name, is_owner_role), member_sites(site_id)',
      )
      .eq('organization_id', orgId)
      .neq('status', 'removed')
      .order('joined_at')
    if (error) throw error
    return (data ?? []).map((m) => {
      const { member_sites, ...rest } = m as unknown as Member & { member_sites: { site_id: string }[] }
      return { ...rest, site_ids: (member_sites ?? []).map((s) => s.site_id) }
    })
  },
}

export function memberName(m: { profile: { full_name: string | null; email: string } } | null | undefined): string {
  if (!m) return '—'
  return m.profile.full_name || m.profile.email
}
