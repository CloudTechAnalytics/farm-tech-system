import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'
import type { Database } from '@/shared/types/database.generated'

export interface FarmSite {
  id: string
  organization_id: string
  name: string
  code: string | null
  address: string | null
  state_region: string | null
  country: string
  contact_name: string | null
  contact_phone: string | null
  size_hectares: number | null
  has_poultry: boolean
  has_fish: boolean
  has_crops: boolean
  notes: string | null
  status: 'active' | 'archived'
  created_at: string
}

export interface SiteFormValues {
  name: string
  code?: string
  address?: string
  state_region?: string
  country: string
  contact_name?: string
  contact_phone?: string
  size_hectares?: number | null
  has_poultry: boolean
  has_fish: boolean
  has_crops: boolean
  notes?: string
}

export interface ProductionUnit {
  id: string
  organization_id: string
  site_id: string
  production_type: 'poultry' | 'fish' | 'crop'
  kind: string
  name: string
  capacity: number | null
  capacity_note: string | null
  area: number | null
  area_unit_id: string | null
  status: 'active' | 'archived'
  notes: string | null
}

export interface ProductionUnitValues {
  production_type: 'poultry' | 'fish' | 'crop'
  kind: string
  name: string
  capacity?: number | null
  capacity_note?: string
  area?: number | null
  area_unit_id?: string | null
  notes?: string
}

export interface Store {
  id: string
  site_id: string
  name: string
  is_default: boolean
  status: 'active' | 'archived'
}

export const UNIT_KINDS: Record<'poultry' | 'fish' | 'crop', { value: string; label: string }[]> = {
  poultry: [
    { value: 'poultry_house', label: 'Poultry house' },
    { value: 'pen', label: 'Pen' },
    { value: 'cage', label: 'Cage block' },
    { value: 'other', label: 'Other' },
  ],
  fish: [
    { value: 'pond', label: 'Pond' },
    { value: 'tank', label: 'Tank' },
    { value: 'raceway', label: 'Raceway' },
    { value: 'cage', label: 'Cage' },
    { value: 'other', label: 'Other' },
  ],
  crop: [
    { value: 'field', label: 'Field' },
    { value: 'plot', label: 'Plot' },
    { value: 'greenhouse', label: 'Greenhouse' },
    { value: 'other', label: 'Other' },
  ],
}

export const sitesService = {
  async list(orgId: string, includeArchived = false): Promise<FarmSite[]> {
    let q = supabase.from('farm_sites').select('*').eq('organization_id', orgId).order('name')
    if (!includeArchived) q = q.eq('status', 'active')
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as FarmSite[]
  },

  async get(id: string): Promise<FarmSite | null> {
    const { data, error } = await supabase.from('farm_sites').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as FarmSite | null
  },

  async create(orgId: string, v: SiteFormValues): Promise<string> {
    const { data, error } = await supabase.rpc('create_site', {
      p_org: orgId,
      p_name: v.name.trim(),
      p_code: blankToNull(v.code) ?? undefined,
      p_address: blankToNull(v.address) ?? undefined,
      p_state_region: blankToNull(v.state_region) ?? undefined,
      p_country: v.country,
      p_contact_name: blankToNull(v.contact_name) ?? undefined,
      p_contact_phone: blankToNull(v.contact_phone) ?? undefined,
      p_size_hectares: v.size_hectares ?? undefined,
      p_has_poultry: v.has_poultry,
      p_has_fish: v.has_fish,
      p_has_crops: v.has_crops,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
    return data as string
  },

  async update(id: string, v: SiteFormValues): Promise<void> {
    const { error } = await supabase
      .from('farm_sites')
      .update({
        name: v.name.trim(),
        code: blankToNull(v.code),
        address: blankToNull(v.address),
        state_region: blankToNull(v.state_region),
        country: v.country,
        contact_name: blankToNull(v.contact_name),
        contact_phone: blankToNull(v.contact_phone),
        size_hectares: v.size_hectares ?? null,
        has_poultry: v.has_poultry,
        has_fish: v.has_fish,
        has_crops: v.has_crops,
        notes: blankToNull(v.notes),
      })
      .eq('id', id)
    if (error) throw error
  },

  async setStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    const { error } = await supabase.rpc('set_site_status', { p_site: id, p_status: status })
    if (error) throw error
  },

  async listUnits(orgId: string, siteId?: string, productionType?: string): Promise<ProductionUnit[]> {
    let q = supabase.from('production_units').select('*').eq('organization_id', orgId).order('name')
    if (siteId) q = q.eq('site_id', siteId)
    if (productionType) q = q.eq('production_type', productionType)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as ProductionUnit[]
  },

  async createUnit(orgId: string, siteId: string, v: ProductionUnitValues): Promise<void> {
    const { error } = await supabase.from('production_units').insert({
      organization_id: orgId,
      site_id: siteId,
      production_type: v.production_type,
      kind: v.kind,
      name: v.name.trim(),
      capacity: v.capacity ?? null,
      capacity_note: blankToNull(v.capacity_note),
      area: v.area ?? null,
      area_unit_id: v.area_unit_id || null,
      notes: blankToNull(v.notes),
    })
    if (error) throw error
  },

  async updateUnit(id: string, v: Partial<ProductionUnitValues> & { status?: 'active' | 'archived' }): Promise<void> {
    const patch: Database['public']['Tables']['production_units']['Update'] = {}
    if (v.name !== undefined) patch.name = v.name.trim()
    if (v.kind !== undefined) patch.kind = v.kind
    if (v.capacity !== undefined) patch.capacity = v.capacity
    if (v.capacity_note !== undefined) patch.capacity_note = blankToNull(v.capacity_note)
    if (v.area !== undefined) patch.area = v.area
    if (v.area_unit_id !== undefined) patch.area_unit_id = v.area_unit_id || null
    if (v.notes !== undefined) patch.notes = blankToNull(v.notes)
    if (v.status !== undefined) patch.status = v.status
    const { error } = await supabase.from('production_units').update(patch).eq('id', id)
    if (error) throw error
  },

  async listStores(orgId: string, siteId?: string): Promise<Store[]> {
    let q = supabase.from('stores').select('id, site_id, name, is_default, status').eq('organization_id', orgId).order('name')
    if (siteId) q = q.eq('site_id', siteId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Store[]
  },

  async createStore(orgId: string, siteId: string, name: string): Promise<void> {
    const { error } = await supabase.from('stores').insert({ organization_id: orgId, site_id: siteId, name: name.trim() })
    if (error) throw error
  },

  async updateStore(id: string, patch: { name?: string; status?: 'active' | 'archived' }): Promise<void> {
    const { error } = await supabase.from('stores').update(patch).eq('id', id)
    if (error) throw error
  },
}
