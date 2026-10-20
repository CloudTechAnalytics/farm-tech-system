import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'
import type { PermissionKey } from '@/shared/lib/permissions'

export interface Organization {
  id: string
  name: string
  slug: string
  country: string
  currency: string
  timezone: string
  address: string | null
  phone: string | null
  email: string | null
  status: string
  created_at: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  rank: number
  is_owner_role: boolean
  template_key: string | null
  permissions: PermissionKey[]
}

export interface Permission {
  key: PermissionKey
  area: string
  label: string
  description: string
  sort_order: number
}

export interface Invitation {
  id: string
  email: string
  role_id: string
  access_scope: 'organization' | 'sites'
  site_ids: string[]
  status: string
  expires_at: string
  created_at: string
  role: { name: string } | null
}

export interface AuditEvent {
  id: number
  site_id: string | null
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  summary: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
  actor: { full_name: string | null; email: string } | null
}

export const adminService = {
  async createOrganization(v: { name: string; country: string; currency: string; timezone: string }): Promise<string> {
    const { data, error } = await supabase.rpc('create_organization', {
      p_name: v.name,
      p_country: v.country,
      p_currency: v.currency,
      p_timezone: v.timezone,
    })
    if (error) throw error
    return data as string
  },

  async organization(orgId: string): Promise<Organization> {
    const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).single()
    if (error) throw error
    return data as Organization
  },

  async updateOrganization(orgId: string, v: { name: string; address?: string; phone?: string; email?: string; timezone: string }) {
    const { error } = await supabase
      .from('organizations')
      .update({ name: v.name.trim(), address: blankToNull(v.address), phone: blankToNull(v.phone), email: blankToNull(v.email), timezone: v.timezone })
      .eq('id', orgId)
    if (error) throw error
  },

  async subscription(orgId: string) {
    const { data, error } = await supabase.from('subscriptions').select('*, plan:plans(name, max_sites, max_members)').eq('organization_id', orgId).maybeSingle()
    if (error) throw error
    return data
  },

  async permissions(): Promise<Permission[]> {
    const { data, error } = await supabase.from('permissions').select('*').order('sort_order')
    if (error) throw error
    return (data ?? []) as Permission[]
  },

  async roles(orgId: string): Promise<Role[]> {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, description, rank, is_owner_role, template_key, role_permissions(permission_key)')
      .eq('organization_id', orgId)
      .order('rank')
    if (error) throw error
    return (data ?? []).map((r) => {
      const { role_permissions, ...rest } = r as unknown as Role & { role_permissions: { permission_key: PermissionKey }[] }
      return { ...rest, permissions: role_permissions.map((p) => p.permission_key) }
    })
  },

  async setRolePermissions(roleId: string, keys: PermissionKey[]) {
    const { error } = await supabase.rpc('set_role_permissions', { p_role: roleId, p_permission_keys: keys })
    if (error) throw error
  },

  async createRole(orgId: string, v: { name: string; description?: string; permissions: PermissionKey[] }) {
    const { error } = await supabase.rpc('create_role', {
      p_org: orgId,
      p_name: v.name,
      p_description: blankToNull(v.description) ?? '',
      p_permission_keys: v.permissions,
    })
    if (error) throw error
  },

  async invitations(orgId: string): Promise<Invitation[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select('id, email, role_id, access_scope, site_ids, status, expires_at, created_at, role:roles(name)')
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as Invitation[]
  },

  /** Returns the one-time invitation link. The token is never stored in readable form. */
  async invite(orgId: string, v: { email: string; role_id: string; access_scope: 'organization' | 'sites'; site_ids: string[] }): Promise<string> {
    const { data, error } = await supabase.rpc('create_invitation', {
      p_org: orgId,
      p_email: v.email,
      p_role: v.role_id,
      p_access_scope: v.access_scope,
      p_site_ids: v.access_scope === 'sites' ? v.site_ids : [],
    })
    if (error) throw error
    const token = (data as { token: string }).token
    return `${window.location.origin}/invite/${token}`
  },

  async revokeInvitation(id: string) {
    const { error } = await supabase.rpc('revoke_invitation', { p_invitation: id })
    if (error) throw error
  },

  async getInvitation(token: string) {
    const { data, error } = await supabase.rpc('get_invitation', { p_token: token })
    if (error) throw error
    return data as { status: string; organization_name?: string; role_name?: string; expires_at?: string }
  },

  async acceptInvitation(token: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
    if (error) throw error
    return data as string
  },

  async updateMemberAccess(membershipId: string, v: { role_id: string; access_scope: 'organization' | 'sites'; site_ids: string[]; job_title?: string }) {
    const { error } = await supabase.rpc('update_member_access', {
      p_membership: membershipId,
      p_role: v.role_id,
      p_access_scope: v.access_scope,
      p_site_ids: v.access_scope === 'sites' ? v.site_ids : [],
      p_job_title: blankToNull(v.job_title) ?? undefined,
    })
    if (error) throw error
  },

  async setMemberStatus(membershipId: string, status: 'active' | 'suspended' | 'removed') {
    const { error } = await supabase.rpc('set_member_status', { p_membership: membershipId, p_status: status })
    if (error) throw error
  },

  async audit(orgId: string, f: { from?: string; to?: string; entityType?: string; page?: number }): Promise<AuditEvent[]> {
    const pageSize = 100
    const page = f.page ?? 0
    let q = supabase
      .from('audit_events')
      .select('*, actor:profiles(full_name, email)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    if (f.from) q = q.gte('created_at', f.from)
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59.999`)
    if (f.entityType) q = q.eq('entity_type', f.entityType)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as AuditEvent[]
  },

  async platformOverview() {
    const { data, error } = await supabase.rpc('platform_overview')
    if (error) throw error
    return data as {
      organizations: number
      organizations_last_30_days: number
      farm_sites: number
      active_users: number
      subscriptions_by_status: Record<string, number>
    }
  },
}
