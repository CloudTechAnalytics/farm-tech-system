import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Bird, Fish, MapPinned, MoreHorizontal, Pencil, Plus, Sprout, Warehouse } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { sitesService, UNIT_KINDS, type FarmSite, type ProductionUnit, type Store } from '@/features/sites/services/sites.service'
import { useMembers, useSites } from '@/shared/hooks/use-reference-data'
import { memberName } from '@/features/settings/services/reference.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, Field, LoadingRows, PageHeader, QueryState } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { UnitSelect } from '@/shared/components/pickers'
import { useSave, invalidateReference } from '@/shared/hooks/use-record'
import { optionalPositive, optionalText, requiredText } from '@/shared/lib/validation'
import { formatNumber } from '@/shared/lib/format'
import { NIGERIAN_STATES } from '@/shared/lib/regions'

const siteSchema = z
  .object({
    name: requiredText('A site name', 120),
    code: z.string().trim().regex(/^[A-Za-z0-9-]{0,12}$/, 'Letters, numbers and dashes, up to 12').optional(),
    address: optionalText(300),
    state_region: optionalText(80),
    country: z.string().length(2),
    contact_name: optionalText(120),
    contact_phone: optionalText(40),
    size_hectares: optionalPositive('Size'),
    has_poultry: z.boolean(),
    has_fish: z.boolean(),
    has_crops: z.boolean(),
    notes: optionalText(2000),
  })
  .refine((v) => v.has_poultry || v.has_fish || v.has_crops, { path: ['has_poultry'], message: 'Choose at least one type of production' })

function SiteDialog({ open, onOpenChange, site }: { open: boolean; onOpenChange: (o: boolean) => void; site?: FarmSite }) {
  const { activeOrgId, organization } = useAuth()
  const qc = useQueryClient()
  const form = useForm<z.input<typeof siteSchema>>({ resolver: zodResolver(siteSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        name: site?.name ?? '',
        code: site?.code ?? '',
        address: site?.address ?? '',
        state_region: site?.state_region ?? '',
        country: site?.country ?? organization?.country ?? 'NG',
        contact_name: site?.contact_name ?? '',
        contact_phone: site?.contact_phone ?? '',
        size_hectares: site?.size_hectares ?? undefined,
        has_poultry: site?.has_poultry ?? false,
        has_fish: site?.has_fish ?? false,
        has_crops: site?.has_crops ?? false,
        notes: site?.notes ?? '',
      })
  }, [open, site, organization, form])
  const mutation = useSave(
    async (v: z.output<typeof siteSchema>) => {
      const values = { ...v, size_hectares: v.size_hectares ?? null }
      if (site) await sitesService.update(site.id, values)
      else await sitesService.create(activeOrgId!, values)
      await invalidateReference(qc)
    },
    { success: site ? 'Site saved' : 'Site added', onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  const country = form.watch('country')
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={site ? `Edit ${site.name}` : 'Add a farm site'}
      description={site ? undefined : 'A site is one physical location with its own houses, ponds, fields and store.'}
      submitLabel={site ? 'Save' : 'Add site'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof siteSchema>))}
    >
      <FieldRow>
        <Field label="Site name" htmlFor="st-name" error={errors.name?.message} required>
          <Input id="st-name" maxLength={120} {...form.register('name')} />
        </Field>
        <Field label="Short code" htmlFor="st-code" error={errors.code?.message} hint="Optional, e.g. IBD-1">
          <Input id="st-code" maxLength={12} {...form.register('code')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Address or nearest town" htmlFor="st-address">
          <Input id="st-address" maxLength={300} {...form.register('address')} />
        </Field>
        <Field label={country === 'NG' ? 'State' : 'State / region'} htmlFor="st-state">
          {country === 'NG' ? (
            <Select id="st-state" {...form.register('state_region')}>
              <option value="">Choose a state</option>
              {NIGERIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <Input id="st-state" maxLength={80} {...form.register('state_region')} />
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Site contact" htmlFor="st-contact">
          <Input id="st-contact" maxLength={120} {...form.register('contact_name')} />
        </Field>
        <Field label="Contact phone" htmlFor="st-phone">
          <Input id="st-phone" type="tel" maxLength={40} {...form.register('contact_phone')} />
        </Field>
      </FieldRow>
      <Field label="Size (hectares)" htmlFor="st-size" error={errors.size_hectares?.message}>
        <Input id="st-size" type="number" step="any" min={0} {...form.register('size_hectares')} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Production on this site</legend>
        <div className="flex flex-wrap gap-4">
          {(['has_poultry', 'has_fish', 'has_crops'] as const).map((k) => (
            <Controller
              key={k}
              control={form.control}
              name={k}
              render={({ field }) => <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label={k === 'has_poultry' ? 'Poultry' : k === 'has_fish' ? 'Fish' : 'Crops'} />}
            />
          ))}
        </div>
        {errors.has_poultry ? <p className="text-[13px] text-destructive">{errors.has_poultry.message}</p> : null}
      </fieldset>
      <Field label="Notes" htmlFor="st-notes">
        <Textarea id="st-notes" rows={2} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

export function SitesPage() {
  const { has } = useAuth()
  const [includeArchived, setIncludeArchived] = React.useState(false)
  const query = useSites(includeArchived)
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <PageHeader
        title="Farm sites"
        description="Each site has its own production units and store. Users can be limited to the sites they work on."
        actions={
          has('sites.manage') ? (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Add site
            </Button>
          ) : null
        }
      />
      {has('sites.manage') ? (
        <div className="mb-3">
          <Checkbox label="Show archived sites" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
        </div>
      ) : null}
      <QueryState query={query} empty={<Card><EmptyState icon={MapPinned} title="No farm sites yet" action={has('sites.manage') ? <Button onClick={() => setOpen(true)}>Add site</Button> : undefined} /></Card>}>
        {(rows) => (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <Link key={s.id} to={`/sites/${s.id}`} className="block rounded-lg border bg-surface p-4 shadow-card transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{[s.address, s.state_region].filter(Boolean).join(', ') || 'No address'}</p>
                  </div>
                  {s.status === 'archived' ? <Badge>Archived</Badge> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.has_poultry ? <Badge variant="poultry"><Bird className="h-3 w-3" /> Poultry</Badge> : null}
                  {s.has_fish ? <Badge variant="fish"><Fish className="h-3 w-3" /> Fish</Badge> : null}
                  {s.has_crops ? <Badge variant="crop"><Sprout className="h-3 w-3" /> Crops</Badge> : null}
                  {s.size_hectares ? <Badge variant="outline">{formatNumber(s.size_hectares)} ha</Badge> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </QueryState>
      <SiteDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

const unitSchema = z.object({
  production_type: z.enum(['poultry', 'fish', 'crop']),
  kind: z.string().min(1),
  name: requiredText('A name', 80),
  capacity: optionalPositive('Capacity'),
  capacity_note: optionalText(80),
  area: optionalPositive('Area'),
  area_unit_id: z.string().optional(),
  notes: optionalText(1000),
})

function UnitDialog({ open, onOpenChange, site, unit }: { open: boolean; onOpenChange: (o: boolean) => void; site: FarmSite; unit?: ProductionUnit }) {
  const { activeOrgId } = useAuth()
  const qc = useQueryClient()
  const defaultType = site.has_poultry ? 'poultry' : site.has_fish ? 'fish' : 'crop'
  const form = useForm<z.input<typeof unitSchema>>({ resolver: zodResolver(unitSchema), defaultValues: { production_type: defaultType, kind: UNIT_KINDS[defaultType][0].value, name: '' } })
  React.useEffect(() => {
    if (open) {
      const t = unit?.production_type ?? defaultType
      form.reset({
        production_type: t,
        kind: unit?.kind ?? UNIT_KINDS[t][0].value,
        name: unit?.name ?? '',
        capacity: unit?.capacity ?? undefined,
        capacity_note: unit?.capacity_note ?? '',
        area: unit?.area ?? undefined,
        area_unit_id: unit?.area_unit_id ?? '',
        notes: unit?.notes ?? '',
      })
    }
  }, [open, unit, defaultType, form])
  const type = form.watch('production_type') ?? defaultType
  const mutation = useSave(
    async (v: z.output<typeof unitSchema>) => {
      const values = { ...v, capacity: v.capacity ?? null, area: v.area ?? null, area_unit_id: v.area ? v.area_unit_id || null : null }
      if (unit) await sitesService.updateUnit(unit.id, values)
      else await sitesService.createUnit(activeOrgId!, site.id, values)
      await invalidateReference(qc)
    },
    { success: unit ? 'Unit saved' : 'Unit added', onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={unit ? `Edit ${unit.name}` : 'Add a production unit'}
      description="A poultry house, pond, tank, field or plot on this site."
      submitLabel={unit ? 'Save' : 'Add unit'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof unitSchema>))}
    >
      <FieldRow>
        <Field label="Production type" htmlFor="pu-type">
          <Select id="pu-type" disabled={!!unit} {...form.register('production_type')} onChange={(e) => { form.setValue('production_type', e.target.value as 'poultry'); form.setValue('kind', UNIT_KINDS[e.target.value as 'poultry'][0].value) }}>
            <option value="poultry">Poultry</option>
            <option value="fish">Fish</option>
            <option value="crop">Crops</option>
          </Select>
        </Field>
        <Field label="Kind" htmlFor="pu-kind">
          <Select id="pu-kind" {...form.register('kind')}>
            {UNIT_KINDS[type].map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <Field label="Name" htmlFor="pu-name" error={errors.name?.message} required>
        <Input id="pu-name" maxLength={80} placeholder={type === 'fish' ? 'Pond 3' : type === 'crop' ? 'North field' : 'House A'} {...form.register('name')} />
      </Field>
      {type === 'crop' ? (
        <FieldRow>
          <Field label="Area" htmlFor="pu-area" error={errors.area?.message}>
            <Input id="pu-area" type="number" step="any" min={0} {...form.register('area')} />
          </Field>
          <Field label="Area unit" htmlFor="pu-areau">
            <Controller control={form.control} name="area_unit_id" render={({ field }) => <UnitSelect id="pu-areau" dimension="area" placeholder="Choose" value={field.value ?? ''} onChange={field.onChange} />} />
          </Field>
        </FieldRow>
      ) : (
        <FieldRow>
          <Field label="Capacity" htmlFor="pu-cap" error={errors.capacity?.message} hint={type === 'fish' ? 'e.g. fish or m³' : 'e.g. birds'}>
            <Input id="pu-cap" type="number" step="any" min={0} {...form.register('capacity')} />
          </Field>
          <Field label="Capacity is in" htmlFor="pu-capn">
            <Input id="pu-capn" maxLength={80} placeholder={type === 'fish' ? 'fish' : 'birds'} {...form.register('capacity_note')} />
          </Field>
        </FieldRow>
      )}
      <Field label="Notes" htmlFor="pu-notes">
        <Input id="pu-notes" maxLength={1000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

export function SiteDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['site', id], queryFn: () => sitesService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Site not found" description="You may not have access to this site." />
  return <SiteDetail site={query.data} />
}

function SiteDetail({ site }: { site: FarmSite }) {
  const { activeOrgId, has } = useAuth()
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState(false)
  const [unitDialog, setUnitDialog] = React.useState<{ open: boolean; unit?: ProductionUnit }>({ open: false })
  const [storeName, setStoreName] = React.useState('')
  const units = useQuery({ queryKey: ['ref', activeOrgId, 'site-units', site.id], queryFn: () => sitesService.listUnits(activeOrgId!, site.id) })
  const stores = useQuery({ queryKey: ['ref', activeOrgId, 'site-stores', site.id], queryFn: () => sitesService.listStores(activeOrgId!, site.id) })
  const { data: members = [] } = useMembers()
  const onSite = members.filter((m) => m.status === 'active' && (m.access_scope === 'organization' || m.site_ids.includes(site.id)))
  const archive = useSave(
    async (status: 'active' | 'archived') => {
      await sitesService.setStatus(site.id, status)
      await invalidateReference(qc)
    },
    { success: 'Site updated' },
  )
  const toggleUnit = useSave(
    async (u: ProductionUnit) => {
      await sitesService.updateUnit(u.id, { status: u.status === 'active' ? 'archived' : 'active' })
      await invalidateReference(qc)
    },
    { success: 'Unit updated' },
  )
  const addStore = useSave(
    async () => {
      await sitesService.createStore(activeOrgId!, site.id, storeName)
      setStoreName('')
      await invalidateReference(qc)
    },
    { success: 'Store added' },
  )
  const toggleStore = useSave(
    async (s: Store) => {
      await sitesService.updateStore(s.id, { status: s.status === 'active' ? 'archived' : 'active' })
      await invalidateReference(qc)
    },
    { success: 'Store updated' },
  )

  return (
    <div>
      <Link to="/sites" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Farm sites
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {site.name} {site.status === 'archived' ? <Badge>Archived</Badge> : null}
          </span>
        }
        description={[site.address, site.state_region].filter(Boolean).join(', ')}
        actions={
          has('sites.manage') ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit site
              </Button>
              <Button variant="outline" onClick={() => archive.mutate(site.status === 'active' ? 'archived' : 'active')} loading={archive.isPending}>
                {site.status === 'active' ? 'Archive site' : 'Restore site'}
              </Button>
            </>
          ) : null
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Houses, ponds and fields</CardTitle>
            {has('settings.manage') ? (
              <Button size="sm" variant="outline" onClick={() => setUnitDialog({ open: true })}>
                <Plus /> Add unit
              </Button>
            ) : null}
          </CardHeader>
          <QueryState query={units} empty={<EmptyState title="No production units yet" description="Add the poultry houses, ponds, tanks, fields or plots on this site." />}>
            {(rows) => (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Type</Th>
                      <Th align="right">Size</Th>
                      <Th>Status</Th>
                      <Th className="w-10">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => (
                      <Tr key={u.id}>
                        <Td className="font-medium">{u.name}</Td>
                        <Td>
                          <Badge variant={u.production_type}>{UNIT_KINDS[u.production_type].find((k) => k.value === u.kind)?.label}</Badge>
                        </Td>
                        <Td align="right">{u.area ? `${formatNumber(u.area)} area` : u.capacity ? `${formatNumber(u.capacity)} ${u.capacity_note ?? ''}` : '—'}</Td>
                        <Td>{u.status === 'active' ? 'Active' : 'Archived'}</Td>
                        <Td>
                          {has('settings.manage') ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Actions for ${u.name}`}>
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onSelect={() => setUnitDialog({ open: true, unit: u })}>Edit</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => toggleUnit.mutate(u)}>{u.status === 'active' ? 'Archive' : 'Restore'}</DropdownMenuItem>
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
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Stores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stores.data?.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4 text-muted-foreground" />
                    {s.name}
                    {s.is_default ? <Badge variant="primary">Main</Badge> : null}
                    {s.status === 'archived' ? <Badge>Archived</Badge> : null}
                  </span>
                  {has('inventory.manage') && !s.is_default ? (
                    <Button variant="link" size="sm" onClick={() => toggleStore.mutate(s)}>
                      {s.status === 'active' ? 'Archive' : 'Restore'}
                    </Button>
                  ) : null}
                </div>
              ))}
              {has('inventory.manage') ? (
                <form
                  className="flex gap-2 pt-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (storeName.trim().length >= 2) addStore.mutate()
                  }}
                >
                  <Input aria-label="New store name" placeholder="e.g. Feed room" value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={80} className="h-9" />
                  <Button type="submit" size="sm" variant="outline" loading={addStore.isPending} disabled={storeName.trim().length < 2}>
                    Add
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>People with access</CardTitle>
              {has('members.manage') ? (
                <Link to="/admin?tab=users" className="text-xs text-brand hover:underline">
                  Manage
                </Link>
              ) : null}
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {onSite.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>{memberName(m)}</span>
                    <span className="text-muted-foreground">{m.role.name}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  { label: 'Code', value: site.code },
                  { label: 'Contact', value: [site.contact_name, site.contact_phone].filter(Boolean).join(' · ') || null },
                  { label: 'Size', value: site.size_hectares ? `${formatNumber(site.size_hectares)} ha` : null },
                  { label: 'Notes', value: site.notes },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <SiteDialog open={editing} onOpenChange={setEditing} site={site} />
      <UnitDialog open={unitDialog.open} onOpenChange={(o) => setUnitDialog({ open: o })} site={site} unit={unitDialog.unit} />
    </div>
  )
}
