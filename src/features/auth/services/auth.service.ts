import { supabase } from '@/shared/lib/supabase'
import type { PermissionKey } from '@/shared/lib/permissions'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  phone: string | null
}

export interface MembershipWithOrg {
  id: string
  organization_id: string
  role_id: string
  status: string
  access_scope: 'organization' | 'sites'
  job_title: string | null
  organization: {
    id: string
    name: string
    slug: string
    currency: string
    timezone: string
    country: string
    status: string
  }
  role: { id: string; name: string; is_owner_role: boolean; template_key: string | null }
  site_ids: string[]
}

function siteUrl(path: string): string {
  return `${window.location.origin}${path}`
}

export const authService = {
  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  },

  async signUp(email: string, password: string, fullName: string, redirectPath = '/onboarding') {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: siteUrl(redirectPath) },
    })
    if (error) throw error
    // With email confirmation on, no session is returned until the link is clicked.
    return { needsConfirmation: !data.session }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl('/auth/reset-password') })
    if (error) throw error
  },

  async updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  },

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase.from('profiles').select('id, email, full_name, phone').eq('id', userId).maybeSingle()
    if (error) throw error
    return data as Profile | null
  },

  async updateProfile(userId: string, values: { full_name: string | null; phone: string | null }) {
    const { error } = await supabase.from('profiles').update(values).eq('id', userId)
    if (error) throw error
  },

  async getMemberships(userId: string): Promise<MembershipWithOrg[]> {
    const { data, error } = await supabase
      .from('memberships')
      .select(
        'id, organization_id, role_id, status, access_scope, job_title, organization:organizations(id, name, slug, currency, timezone, country, status), role:roles(id, name, is_owner_role, template_key), member_sites(site_id)',
      )
      .eq('user_id', userId)
      .eq('status', 'active')
    if (error) throw error
    return (data ?? [])
      .filter((m) => m.organization)
      .map((m) => {
        const { member_sites, ...rest } = m as unknown as MembershipWithOrg & { member_sites: { site_id: string }[] }
        return { ...rest, site_ids: (member_sites ?? []).map((s) => s.site_id) }
      })
  },

  async getPermissionKeys(roleId: string): Promise<PermissionKey[]> {
    const { data, error } = await supabase.from('role_permissions').select('permission_key').eq('role_id', roleId)
    if (error) throw error
    return (data ?? []).map((r) => r.permission_key as PermissionKey)
  },

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const { data, error } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
    if (error) throw error
    return Boolean(data)
  },
}
