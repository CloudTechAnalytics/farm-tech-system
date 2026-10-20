import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Copy, MoreHorizontal, Plus, ShieldCheck, UserPlus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { adminService, type Role } from '@/features/admin/services/admin.service'
import { alertsService } from '@/features/alerts/services/alerts.service'
import { referenceService, memberName, type CategoryKind, type Member } from '@/features/settings/services/reference.service'
import { useCategories, useMembers, useSites, useUnits } from '@/shared/hooks/use-reference-data'
import { RequirePermission } from '@/features/auth/components/route-guards'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select } from '@/shared/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Table, TableWrap, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th, Tr, toast } from '@/shared/components/ui/misc'
import { EmptyState, Field, FormError, Notice, PageHeader, QueryState } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { useSave, invalidateReference } from '@/shared/hooks/use-record'
import { optionalText, requiredText } from '@/shared/lib/validation'
import { formatDate, formatDateTime, titleCase } from '@/shared/lib/format'
import { friendlyError } from '@/shared/lib/errors'
import { TIMEZONES } from '@/shared/lib/regions'
import type { PermissionKey } from '@/shared/lib/permissions'

export function AdminPage() {
  const { has } = useAuth()
  const [params, setParams] = useSearchParams()
  const first = has('org.manage') ? 'organization' : has('members.manage') ? 'users' : has('settings.manage') ? 'lists' : 'audit'
  const tab = params.get('tab') ?? first
  return (
    <div>
      <PageHeader title="Administration" description="Organization details, people and their access, lists used in forms, alert thresholds and the audit history." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          {has('org.manage') ? <TabsTrigger value="organization">Organization</TabsTrigger> : null}
          {has('members.manage') ? <TabsTrigger value="users">Users</TabsTrigger> : null}
          {has('members.manage') ? <TabsTrigger value="roles">Roles</TabsTrigger> : null}
          {has('settings.manage') ? <TabsTrigger value="lists">Lists and units</TabsTrigger> : null}
          {has('org.manage') ? <TabsTrigger value="alerts">Alerts</TabsTrigger> : null}
          {has('audit.view') ? <TabsTrigger value="audit">Audit history</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="organization">
          <RequirePermission permission="org.manage">
            <OrganizationTab />
          </RequirePermission>
        </TabsContent>
        <TabsContent value="users">
          <RequirePermission permission="members.manage">
            <UsersTab />
          </RequirePermission>
        </TabsContent>
        <TabsContent value="roles">
          <RequirePermission permission="members.manage">
            <RolesTab />
          </RequirePermission>
        </TabsContent>
        <TabsContent value="lists">
          <RequirePermission permission="settings.manage">
            <ListsTab />
          </RequirePermission>
        </TabsContent>
        <TabsContent value="alerts">
          <RequirePermission permission="org.manage">
            <AlertSettingsTab />
          </RequirePermission>
        </TabsContent>
        <TabsContent value="audit">
          <RequirePermission permission="audit.view">
            <AuditTab />
          </RequirePermission>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
const orgSchema = z.object({
  name: requiredText('A name', 120),
  address: optionalText(300),
  phone: optionalText(40),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  timezone: z.string().min(3),
})

function OrganizationTab() {
  const { activeOrgId, refresh } = useAuth()
  const org = useQuery({ queryKey: ['org', activeOrgId], enabled: !!activeOrgId, queryFn: () => adminService.organization(activeOrgId!) })
  const sub = useQuery({ queryKey: ['subscription', activeOrgId], enabled: !!activeOrgId, queryFn: () => adminService.subscription(activeOrgId!) })
  const form = useForm<z.input<typeof orgSchema>>({ resolver: zodResolver(orgSchema) })
  React.useEffect(() => {
    if (org.data) form.reset({ name: org.data.name, address: org.data.address ?? '', phone: org.data.phone ?? '', email: org.data.email ?? '', timezone: org.data.timezone })
  }, [org.data, form])
  const save = useSave(
    async (v: z.output<typeof orgSchema>) => {
      await adminService.updateOrganization(activeOrgId!, v)
      await refresh()
    },
    { success: 'Organization saved' },
  )
  const plan = sub.data as { status: string; trial_ends_at: string | null; plan: { name: string; max_sites: number | null; max_members: number | null } | null } | null | undefined
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof orgSchema>))} noValidate>
            <Field label="Name" htmlFor="org-name" error={form.formState.errors.name?.message} required>
              <Input id="org-name" maxLength={120} {...form.register('name')} />
            </Field>
            <FieldRow>
              <Field label="Phone" htmlFor="org-phone">
                <Input id="org-phone" type="tel" {...form.register('phone')} />
              </Field>
              <Field label="Email" htmlFor="org-email" error={form.formState.errors.email?.message}>
                <Input id="org-email" type="email" {...form.register('email')} />
              </Field>
            </FieldRow>
            <Field label="Address" htmlFor="org-address">
              <Input id="org-address" maxLength={300} {...form.register('address')} />
            </Field>
            <FieldRow>
              <Field label="Time zone" htmlFor="org-tz">
                <Select id="org-tz" {...form.register('timezone')}>
                  {[...new Set([...(org.data ? [org.data.timezone] : []), ...TIMEZONES])].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Currency" htmlFor="org-cur" hint="Fixed once money has been recorded">
                <Input id="org-cur" value={org.data?.currency ?? ''} disabled />
              </Field>
            </FieldRow>
            <FormError message={save.error ? friendlyError(save.error) : null} />
            <div className="flex justify-end">
              <Button type="submit" loading={save.isPending}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-lg font-semibold">{plan?.plan?.name ?? '—'}</p>
          <p className="text-muted-foreground">
            {titleCase(plan?.status ?? '')}
            {plan?.trial_ends_at ? ` until ${formatDate(plan.trial_ends_at)}` : ''}
          </p>
          <p>Up to {plan?.plan?.max_sites ?? 'unlimited'} farm sites and {plan?.plan?.max_members ?? 'unlimited'} users.</p>
          <p className="text-xs text-muted-foreground">Online payment is not part of this release. Contact CloudTech Analytics to change plan.</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
const accessSchema = z
  .object({
    email: z.string().optional(),
    role_id: z.string().min(1, 'Choose a role'),
    access_scope: z.enum(['organization', 'sites']),
    site_ids: z.array(z.string()),
    job_title: optionalText(80),
  })
  .refine((v) => v.access_scope === 'organization' || v.site_ids.length > 0, { path: ['site_ids'], message: 'Choose at least one site' })

function useRoles() {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['ref', activeOrgId, 'roles'], enabled: !!activeOrgId, queryFn: () => adminService.roles(activeOrgId!) })
}

function AccessFields({ form, roles, isOwner }: { form: ReturnType<typeof useForm<z.input<typeof accessSchema>>>; roles: Role[]; isOwner: boolean }) {
  const { data: sites = [] } = useSites()
  const scope = form.watch('access_scope')
  const roleId = form.watch('role_id')
  const role = roles.find((r) => r.id === roleId)
  React.useEffect(() => {
    if (role?.is_owner_role) form.setValue('access_scope', 'organization')
  }, [role, form])
  return (
    <>
      <Field label="Role" htmlFor="ac-role" error={form.formState.errors.role_id?.message} required hint={role?.description ?? undefined}>
        <Select id="ac-role" {...form.register('role_id')}>
          <option value="">Choose a role</option>
          {roles
            .filter((r) => isOwner || !r.is_owner_role)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Sites they can see" htmlFor="ac-scope">
        <Select id="ac-scope" disabled={role?.is_owner_role} {...form.register('access_scope')}>
          <option value="organization">All sites, including organization-wide records</option>
          <option value="sites">Only the sites I choose</option>
        </Select>
      </Field>
      {scope === 'sites' ? (
        <fieldset className="space-y-1.5 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Sites</legend>
          <Controller
            control={form.control}
            name="site_ids"
            render={({ field }) => (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {sites.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={s.name}
                    checked={field.value.includes(s.id)}
                    onChange={(e) => field.onChange(e.target.checked ? [...field.value, s.id] : field.value.filter((x) => x !== s.id))}
                  />
                ))}
              </div>
            )}
          />
          {form.formState.errors.site_ids ? <p className="text-[13px] text-destructive">{form.formState.errors.site_ids.message}</p> : null}
        </fieldset>
      ) : null}
    </>
  )
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId, membership } = useAuth()
  const { data: roles = [] } = useRoles()
  const [link, setLink] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof accessSchema>>({ resolver: zodResolver(accessSchema) })
  React.useEffect(() => {
    if (open) {
      setLink(null)
      form.reset({ email: '', role_id: '', access_scope: 'sites', site_ids: [], job_title: '' })
    }
  }, [open, form])
  const invite = useSave(
    (v: z.output<typeof accessSchema>) => adminService.invite(activeOrgId!, { email: v.email!.trim(), role_id: v.role_id, access_scope: v.access_scope, site_ids: v.site_ids }),
    { success: 'Invitation created', onSuccess: (url) => setLink(url) },
  )
  if (link) {
    return (
      <FormDialog open={open} onOpenChange={onOpenChange} title="Send this invitation link" submitLabel="Done" onSubmit={(e) => { e.preventDefault(); onOpenChange(false) }}>
        <Notice>
          Share this link with the person by WhatsApp, SMS or email. It works once, only for the address you entered, and expires in 7 days. It cannot be shown again.
        </Notice>
        <div className="flex gap-2">
          <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
                toast.success('Link copied')
              } catch {
                toast.error('Copy failed. Select the link and copy it manually.')
              }
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
      </FormDialog>
    )
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a user"
      description="They sign up or sign in with this email, then open the link you share."
      submitLabel="Create invitation"
      pending={invite.isPending}
      error={invite.error}
      onSubmit={form.handleSubmit((v) => {
        if (!v.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) {
          form.setError('email', { message: 'Enter a valid email address' })
          return
        }
        invite.mutate(v as z.output<typeof accessSchema>)
      })}
    >
      <Field label="Email" htmlFor="inv-email" error={form.formState.errors.email?.message} required>
        <Input id="inv-email" type="email" autoComplete="off" {...form.register('email')} />
      </Field>
      <AccessFields form={form} roles={roles} isOwner={!!membership?.role.is_owner_role} />
    </FormDialog>
  )
}

function AccessDialog({ member, onOpenChange }: { member: Member | null; onOpenChange: (o: boolean) => void }) {
  const { membership } = useAuth()
  const { data: roles = [] } = useRoles()
  const form = useForm<z.input<typeof accessSchema>>({ resolver: zodResolver(accessSchema) })
  React.useEffect(() => {
    if (member) form.reset({ role_id: member.role_id, access_scope: member.access_scope, site_ids: member.site_ids, job_title: member.job_title ?? '' })
  }, [member, form])
  const save = useSave((v: z.output<typeof accessSchema>) => adminService.updateMemberAccess(member!.id, v), { success: 'Access updated', reference: true, onSuccess: () => onOpenChange(false) })
  return (
    <FormDialog
      open={!!member}
      onOpenChange={onOpenChange}
      title={`Access for ${member ? memberName(member) : ''}`}
      description="Changes apply on their next action; nothing they could see before stays cached on the server."
      submitLabel="Save access"
      pending={save.isPending}
      error={save.error}
      onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof accessSchema>))}
    >
      <AccessFields form={form} roles={roles} isOwner={!!membership?.role.is_owner_role} />
      <Field label="Job title" htmlFor="ac-title">
        <Input id="ac-title" maxLength={80} {...form.register('job_title')} />
      </Field>
    </FormDialog>
  )
}

function UsersTab() {
  const { activeOrgId, userId } = useAuth()
  const members = useMembers()
  const { data: sites = [] } = useSites()
  const invitations = useQuery({ queryKey: ['invitations', activeOrgId], enabled: !!activeOrgId, queryFn: () => adminService.invitations(activeOrgId!) })
  const [inviting, setInviting] = React.useState(false)
  const [editing, setEditing] = React.useState<Member | null>(null)
  const setStatus = useSave(({ id, status }: { id: string; status: 'active' | 'suspended' | 'removed' }) => adminService.setMemberStatus(id, status), { success: 'User updated', reference: true })
  const revoke = useSave((id: string) => adminService.revokeInvitation(id), { success: 'Invitation revoked' })
  const siteNames = (ids: string[]) => ids.map((id) => sites.find((s) => s.id === id)?.name).filter(Boolean).join(', ')
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setInviting(true)}>
          <UserPlus /> Invite user
        </Button>
      </div>
      <Card>
        <QueryState query={members}>
          {(rows) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Role</Th>
                    <Th>Sites</Th>
                    <Th>Status</Th>
                    <Th className="w-10">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <Tr key={m.id}>
                      <Td>
                        <span className="font-medium">{memberName(m)}</span>
                        {m.user_id === userId ? <Badge variant="outline" className="ml-2">You</Badge> : null}
                        <div className="text-xs text-muted-foreground">
                          {m.profile.email}
                          {m.job_title ? ` · ${m.job_title}` : ''}
                        </div>
                      </Td>
                      <Td>
                        {m.role.is_owner_role ? <ShieldCheck className="mr-1 inline h-4 w-4 text-brand" /> : null}
                        {m.role.name}
                      </Td>
                      <Td className="max-w-[16rem]">{m.access_scope === 'organization' ? 'All sites' : siteNames(m.site_ids) || 'None'}</Td>
                      <Td>
                        <Badge variant={m.status === 'active' ? 'success' : 'warning'}>{titleCase(m.status)}</Badge>
                      </Td>
                      <Td>
                        {m.user_id !== userId ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${memberName(m)}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onSelect={() => setEditing(m)}>Change role or sites</DropdownMenuItem>
                              {m.status === 'active' ? (
                                <DropdownMenuItem onSelect={() => setStatus.mutate({ id: m.id, status: 'suspended' })}>Suspend</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => setStatus.mutate({ id: m.id, status: 'active' })}>Reactivate</DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => setStatus.mutate({ id: m.id, status: 'removed' })}>
                                Remove from organization
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      {setStatus.error ? <FormError message={friendlyError(setStatus.error)} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
        </CardHeader>
        <QueryState query={invitations} empty={<EmptyState title="No pending invitations" className="py-6" />}>
          {(rows) => (
            <ul className="divide-y border-t">
              {rows.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{i.email}</span> · {i.role?.name} · {i.access_scope === 'organization' ? 'All sites' : siteNames(i.site_ids)}
                    <span className="block text-xs text-muted-foreground">Expires {formatDate(i.expires_at)}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => revoke.mutate(i.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <AccessDialog member={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function RolesTab() {
  const { activeOrgId } = useAuth()
  const qc = useQueryClient()
  const roles = useRoles()
  const perms = useQuery({ queryKey: ['ref', 'permissions'], queryFn: () => adminService.permissions(), staleTime: Infinity })
  const [draft, setDraft] = React.useState<Record<string, Set<PermissionKey>>>({})
  const [newRole, setNewRole] = React.useState('')
  React.useEffect(() => {
    if (roles.data) setDraft(Object.fromEntries(roles.data.map((r) => [r.id, new Set(r.permissions)])))
  }, [roles.data])
  const save = useSave(
    async (role: Role) => {
      await adminService.setRolePermissions(role.id, [...(draft[role.id] ?? [])])
      await invalidateReference(qc)
    },
    { success: 'Role permissions saved' },
  )
  const create = useSave(
    async () => {
      await adminService.createRole(activeOrgId!, { name: newRole, permissions: ['operations.view'] })
      setNewRole('')
      await invalidateReference(qc)
    },
    { success: 'Role created' },
  )
  const areas = [...new Set((perms.data ?? []).map((p) => p.area))]
  const changed = (r: Role) => {
    const d = draft[r.id]
    return d && (d.size !== r.permissions.length || r.permissions.some((p) => !d.has(p)))
  }
  return (
    <div className="space-y-3">
      <Notice>The database enforces these permissions on every request. Changes take effect immediately for everyone with the role.</Notice>
      <Card>
        <QueryState query={roles}>
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Permission</Th>
                    {list.map((r) => (
                      <Th key={r.id} align="center" className="min-w-[7rem]">
                        {r.name}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {areas.map((area) => (
                    <React.Fragment key={area}>
                      <tr>
                        <td colSpan={list.length + 1} className="bg-muted/40 px-5 py-1.5 text-xs font-semibold text-muted-foreground">
                          {area}
                        </td>
                      </tr>
                      {(perms.data ?? [])
                        .filter((p) => p.area === area)
                        .map((p) => (
                          <Tr key={p.key}>
                            <Td>
                              {p.label}
                              <div className="text-xs text-muted-foreground">{p.description}</div>
                            </Td>
                            {list.map((r) => (
                              <Td key={r.id} align="center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                                  aria-label={`${r.name}: ${p.label}`}
                                  disabled={r.is_owner_role}
                                  checked={r.is_owner_role || (draft[r.id]?.has(p.key) ?? false)}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      const s = new Set(d[r.id])
                                      if (e.target.checked) s.add(p.key)
                                      else s.delete(p.key)
                                      return { ...d, [r.id]: s }
                                    })
                                  }
                                />
                              </Td>
                            ))}
                          </Tr>
                        ))}
                    </React.Fragment>
                  ))}
                  <tr>
                    <Td />
                    {list.map((r) => (
                      <Td key={r.id} align="center">
                        {r.is_owner_role ? (
                          <span className="text-xs text-muted-foreground">Always all</span>
                        ) : (
                          <Button size="sm" variant={changed(r) ? 'default' : 'outline'} disabled={!changed(r)} loading={save.isPending && save.variables?.id === r.id} onClick={() => save.mutate(r)}>
                            Save
                          </Button>
                        )}
                      </Td>
                    ))}
                  </tr>
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newRole.trim().length >= 2) create.mutate()
        }}
      >
        <Input aria-label="New role name" placeholder="New role, e.g. Store keeper" value={newRole} onChange={(e) => setNewRole(e.target.value)} maxLength={60} />
        <Button type="submit" variant="outline" disabled={newRole.trim().length < 2} loading={create.isPending}>
          <Plus /> Add role
        </Button>
      </form>
      {save.error || create.error ? <FormError message={friendlyError(save.error ?? create.error)} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
const KIND_LABEL: Record<CategoryKind, string> = { activity: 'Activities', inventory: 'Inventory categories', income: 'Income categories', expense: 'Expense categories' }

function ListsTab() {
  const { activeOrgId } = useAuth()
  const qc = useQueryClient()
  const [kind, setKind] = React.useState<CategoryKind>('expense')
  const cats = useCategories(kind, { activeOnly: false })
  const units = useUnits()
  const [name, setName] = React.useState('')
  const add = useSave(
    async () => {
      await referenceService.createCategory(activeOrgId!, { kind, name, production_type: 'general' })
      setName('')
      await invalidateReference(qc)
    },
    { success: 'Added' },
  )
  const toggle = useSave(
    async (c: { id: string; is_active: boolean }) => {
      await referenceService.updateCategory(c.id, { is_active: !c.is_active })
      await invalidateReference(qc)
    },
    { success: 'Updated' },
  )
  const rename = useSave(
    async (c: { id: string; name: string }) => {
      await referenceService.updateCategory(c.id, { name: c.name })
      await invalidateReference(qc)
    },
    { success: 'Renamed' },
  )
  const unitSchema = z.object({ name: requiredText('A name', 60), symbol: requiredText('A symbol', 16), dimension: z.enum(['count', 'mass', 'volume', 'area', 'length']), to_base: z.coerce.number().positive('Enter how many base units one of these is') })
  const unitForm = useForm<z.input<typeof unitSchema>>({ resolver: zodResolver(unitSchema), defaultValues: { name: '', symbol: '', dimension: 'mass' } })
  const addUnit = useSave(
    async (v: z.output<typeof unitSchema>) => {
      const code = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18) + '_' + Math.random().toString(36).slice(2, 5)
      await referenceService.createUnit(activeOrgId!, { ...v, code })
      unitForm.reset({ name: '', symbol: '', dimension: v.dimension })
      await invalidateReference(qc)
    },
    { success: 'Unit added' },
  )
  const base = { count: 'pieces', mass: 'kg', volume: 'litres', area: 'm²', length: 'm' } as const
  const dim = unitForm.watch('dimension')
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <div className="w-48">
            <Select aria-label="List" className="h-9" value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <QueryState query={cats}>
          {(rows) => (
            <ul className="divide-y border-t">
              {rows.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-5 py-2 text-sm">
                  <Input
                    aria-label={`Name of ${c.name}`}
                    defaultValue={c.name}
                    className="h-8 flex-1"
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && rename.mutate({ id: c.id, name: e.target.value.trim() })}
                  />
                  {c.is_system ? <Badge variant="outline">Built-in</Badge> : null}
                  <Button variant="link" size="sm" onClick={() => toggle.mutate(c)}>
                    {c.is_active ? 'Hide' : 'Show'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
        <form
          className="flex gap-2 border-t px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length >= 2) add.mutate()
          }}
        >
          <Input aria-label="New category" placeholder={`New ${KIND_LABEL[kind].toLowerCase().replace(/ies$/, 'y').replace(/s$/, '')}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-9" />
          <Button type="submit" variant="outline" size="sm" disabled={name.trim().length < 2} loading={add.isPending}>
            Add
          </Button>
        </form>
        {rename.error || toggle.error || add.error ? <div className="px-5 pb-3"><FormError message={friendlyError(rename.error ?? toggle.error ?? add.error)} /></div> : null}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Units of measure</CardTitle>
        </CardHeader>
        <QueryState query={units}>
          {(rows) => (
            <TableWrap className="max-h-80 overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Unit</Th>
                    <Th>Measures</Th>
                    <Th align="right">Equals</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <Tr key={u.id}>
                      <Td>
                        {u.name} <span className="text-muted-foreground">({u.symbol})</span>
                        {u.organization_id ? <Badge variant="outline" className="ml-1.5">Custom</Badge> : null}
                      </Td>
                      <Td>{titleCase(u.dimension)}</Td>
                      <Td align="right">
                        {u.to_base} {base[u.dimension]}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
        <form className="space-y-3 border-t px-5 py-4" onSubmit={unitForm.handleSubmit((v) => addUnit.mutate(v as z.output<typeof unitSchema>))} noValidate>
          <p className="text-sm font-medium">Add a unit</p>
          <FieldRow>
            <Field label="Name" htmlFor="un-name" error={unitForm.formState.errors.name?.message}>
              <Input id="un-name" placeholder="e.g. Basket of tomatoes" {...unitForm.register('name')} />
            </Field>
            <Field label="Symbol" htmlFor="un-symbol" error={unitForm.formState.errors.symbol?.message}>
              <Input id="un-symbol" maxLength={16} {...unitForm.register('symbol')} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Measures" htmlFor="un-dim">
              <Select id="un-dim" {...unitForm.register('dimension')}>
                <option value="mass">Weight</option>
                <option value="count">Count</option>
                <option value="volume">Volume</option>
                <option value="area">Area</option>
                <option value="length">Length</option>
              </Select>
            </Field>
            <Field label={`One unit equals (${base[dim]})`} htmlFor="un-base" error={unitForm.formState.errors.to_base?.message} hint="Conversions use this exact figure">
              <Input id="un-base" type="number" step="any" min={0} {...unitForm.register('to_base')} />
            </Field>
          </FieldRow>
          <FormError message={addUnit.error ? friendlyError(addUnit.error) : null} />
          <Button type="submit" variant="outline" loading={addUnit.isPending}>
            Add unit
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
const alertSchema = z.object({
  low_stock_enabled: z.boolean(),
  mortality_alerts_enabled: z.boolean(),
  poultry_daily_mortality_pct: z.coerce.number().positive().max(100),
  fish_daily_mortality_pct: z.coerce.number().positive().max(100),
  production_rejection_pct: z.coerce.number().positive().max(100),
  missing_records_enabled: z.boolean(),
  missing_records_after_days: z.coerce.number().int().min(1).max(14),
  upcoming_activity_days: z.coerce.number().int().min(1).max(60),
})

function AlertSettingsTab() {
  const { activeOrgId } = useAuth()
  const settings = useQuery({ queryKey: ['alert-settings', activeOrgId], enabled: !!activeOrgId, queryFn: () => alertsService.settings(activeOrgId!) })
  const form = useForm<z.input<typeof alertSchema>>({ resolver: zodResolver(alertSchema) })
  React.useEffect(() => {
    if (settings.data) form.reset(settings.data as z.input<typeof alertSchema>)
  }, [settings.data, form])
  const save = useSave((v: z.output<typeof alertSchema>) => alertsService.updateSettings(activeOrgId!, v), { success: 'Alert settings saved' })
  const e = form.formState.errors
  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-5">
        <form className="space-y-5" onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof alertSchema>))} noValidate>
          <Controller control={form.control} name="low_stock_enabled" render={({ field }) => <Checkbox checked={!!field.value} onChange={(x) => field.onChange(x.target.checked)} label="Low stock" description="When a site's stock of an item falls to its reorder level. Items without a reorder level never alert." />} />
          <div className="space-y-3">
            <Controller control={form.control} name="mortality_alerts_enabled" render={({ field }) => <Checkbox checked={!!field.value} onChange={(x) => field.onChange(x.target.checked)} label="High daily mortality" description="Deaths in one day as a share of the batch at the start of that day." />} />
            <FieldRow>
              <Field label="Poultry threshold (% per day)" htmlFor="al-p" error={e.poultry_daily_mortality_pct?.message}>
                <Input id="al-p" type="number" step="0.01" {...form.register('poultry_daily_mortality_pct')} />
              </Field>
              <Field label="Fish threshold (% per day)" htmlFor="al-f" error={e.fish_daily_mortality_pct?.message}>
                <Input id="al-f" type="number" step="0.01" {...form.register('fish_daily_mortality_pct')} />
              </Field>
            </FieldRow>
          </div>
          <Field label="Production rejected above (%)" htmlFor="al-r" error={e.production_rejection_pct?.message} hint="Cracked eggs or rejected harvest as a share of a record">
            <Input id="al-r" type="number" step="0.1" {...form.register('production_rejection_pct')} />
          </Field>
          <div className="space-y-3">
            <Controller control={form.control} name="missing_records_enabled" render={({ field }) => <Checkbox checked={!!field.value} onChange={(x) => field.onChange(x.target.checked)} label="Missing daily records" description="For batches set to expect a record every day." />} />
            <Field label="Alert after this many days with nothing logged" htmlFor="al-m" error={e.missing_records_after_days?.message}>
              <Input id="al-m" type="number" step="1" className="max-w-[8rem]" {...form.register('missing_records_after_days')} />
            </Field>
          </div>
          <Field label="Show planned tasks and harvests due within (days)" htmlFor="al-u" error={e.upcoming_activity_days?.message}>
            <Input id="al-u" type="number" step="1" className="max-w-[8rem]" {...form.register('upcoming_activity_days')} />
          </Field>
          <FormError message={save.error ? friendlyError(save.error) : null} />
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>
              Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
function AuditTab() {
  const { activeOrgId } = useAuth()
  const [page, setPage] = React.useState(0)
  const [entity, setEntity] = React.useState('')
  const query = useQuery({ queryKey: ['audit', activeOrgId, page, entity], enabled: !!activeOrgId, queryFn: () => adminService.audit(activeOrgId!, { page, entityType: entity || undefined }) })
  const [open, setOpen] = React.useState<number | null>(null)
  return (
    <div className="space-y-3">
      <div className="w-56">
        <Select aria-label="Record type" className="h-9" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0) }}>
          <option value="">All records</option>
          {['organizations', 'farm_sites', 'memberships', 'roles', 'invitations', 'batches', 'batch_events', 'crop_cycles', 'inventory_items', 'inventory_movements', 'feed_events', 'finance_transactions', 'sales', 'production_records', 'categories', 'alert_settings', 'activity_logs', 'attachments'].map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        <QueryState query={query} empty={<EmptyState title="No audit events" />}>
          {(rows) => (
            <ul className="divide-y">
              {rows.map((a) => (
                <li key={a.id} className="px-5 py-2.5 text-sm">
                  <button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                    <span>
                      <span className="font-medium">{titleCase(a.action.replace('.', ' '))}</span>
                      {a.summary ? <span className="text-muted-foreground"> · {a.summary}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.actor ? a.actor.full_name || a.actor.email : 'System'} · {formatDateTime(a.created_at)}
                    </span>
                  </button>
                  {open === a.id && (a.before_data || a.after_data) ? (
                    <div className="mt-2 grid gap-2 overflow-x-auto text-xs sm:grid-cols-2">
                      {a.before_data ? <pre className="rounded bg-muted p-2">{JSON.stringify(a.before_data, null, 2)}</pre> : null}
                      {a.after_data ? <pre className="rounded bg-muted p-2">{JSON.stringify(a.after_data, null, 2)}</pre> : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
      <div className="flex justify-between">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Newer
        </Button>
        <Button variant="outline" size="sm" disabled={(query.data?.length ?? 0) < 100} onClick={() => setPage((p) => p + 1)}>
          Older
        </Button>
      </div>
    </div>
  )
}
