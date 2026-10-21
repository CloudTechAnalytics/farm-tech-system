import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, CalendarClock, Download, Pencil, Plus, Wrench } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABEL, CONDITION, assetsService, type Asset, type Condition, type MaintenanceRecord } from '@/features/assets/services/assets.service'
import { procurementService } from '@/features/procurement/services/procurement.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, Field, LoadingRows, Notice, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { PaymentMethodSelect, SiteSelect, SupplierSelect } from '@/shared/components/pickers'
import { useRecord, useSave } from '@/shared/hooks/use-record'
import { useProductionUnits } from '@/shared/hooks/use-reference-data'
import { dateField, nonNegativeNumber, optionalText, requiredId, requiredText } from '@/shared/lib/validation'
import { formatDate, formatMoney, formatNumber, todayISO } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

export function AssetsPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [condition, setCondition] = React.useState('')
  const [dueOnly, setDueOnly] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['assets', activeOrgId, siteId, category, condition, dueOnly, debounced],
    enabled: !!activeOrgId,
    queryFn: () => assetsService.list(activeOrgId!, { siteId: siteId || undefined, category: category || undefined, condition: condition || undefined, dueOnly, search: debounced || undefined }),
  })
  const rows = query.data ?? []
  const filtered = debounced || category || condition || dueOnly
  return (
    <div>
      <PageHeader
        title="Equipment"
        description="Generators, pumps, vehicles and buildings: where they are, their condition, service schedules and what upkeep costs."
        actions={
          <>
            {has('reports.export') ? (
              <Button
                variant="outline"
                disabled={!rows.length}
                onClick={() =>
                  downloadCsv(
                    'equipment',
                    toCsv(rows, [
                      { header: 'Code', value: (a) => a.code },
                      { header: 'Name', value: (a) => a.name },
                      { header: 'Category', value: (a) => ASSET_CATEGORY_LABEL[a.category] },
                      { header: 'Site', value: (a) => a.site_name },
                      { header: 'Location', value: (a) => a.location_name },
                      { header: 'Make / model', value: (a) => [a.make, a.model].filter(Boolean).join(' ') },
                      { header: 'Serial', value: (a) => a.serial_number },
                      { header: 'Condition', value: (a) => CONDITION[a.condition].label },
                      { header: 'Next service', value: (a) => a.next_due_on },
                      { header: 'Last service', value: (a) => a.last_service_on },
                      { header: 'Upkeep last 12 months', value: (a) => a.maintenance_cost_12m },
                      { header: 'Downtime hours last 12 months', value: (a) => a.downtime_hours_12m },
                    ]),
                  )
                }
              >
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('assets.manage') ? (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add equipment
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="plain" label="Items" value={rows.length} />
        <StatCard tone="plain" label="Service overdue" value={rows.filter((a) => a.maintenance_overdue).length} />
        <StatCard tone="plain" label="Out of service" value={rows.filter((a) => a.condition === 'out_of_service').length} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, make, serial" />
        <div className="w-44">
          <Select aria-label="Category" className="h-9" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select aria-label="Condition" className="h-9" value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">Any condition</option>
            {(Object.keys(CONDITION) as Condition[]).map((c) => (
              <option key={c} value={c}>
                {CONDITION[c].label}
              </option>
            ))}
          </Select>
        </div>
        <Checkbox label="Service overdue" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
      </div>
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={Wrench} title={filtered ? 'No equipment matches' : 'No equipment yet'} description={filtered ? undefined : 'Add generators, pumps, tractors and buildings to plan servicing and track repair costs.'} action={has('assets.manage') && !filtered ? <Button onClick={() => setAdding(true)}>Add equipment</Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Equipment</Th>
                    <Th>Location</Th>
                    <Th>Condition</Th>
                    <Th>Next service</Th>
                    <Th align="right">Upkeep (12 months)</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <Tr key={a.id} className="cursor-pointer" onClick={() => navigate(`/equipment/${a.id}`)}>
                      <Td>
                        <Link to={`/equipment/${a.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {a.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{[ASSET_CATEGORY_LABEL[a.category], a.code, [a.make, a.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</div>
                      </Td>
                      <Td>
                        {a.site_name}
                        {a.location_name ? <div className="text-xs text-muted-foreground">{a.location_name}</div> : null}
                      </Td>
                      <Td>
                        <Badge variant={CONDITION[a.condition].variant}>{CONDITION[a.condition].label}</Badge>
                      </Td>
                      <Td className={cn('whitespace-nowrap', a.maintenance_overdue && 'font-medium text-destructive')}>
                        {a.next_due_on ? formatDate(a.next_due_on) : '—'}
                        {a.next_due_title ? <div className="text-xs font-normal text-muted-foreground">{a.next_due_title}</div> : null}
                      </Td>
                      <Td align="right">{a.maintenance_cost_12m ? formatMoney(a.maintenance_cost_12m, currency) : '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <AssetDialog open={adding} onOpenChange={setAdding} onCreated={(id) => navigate(`/equipment/${id}`)} />
    </div>
  )
}

const assetSchema = z.object({
  site_id: requiredId('a farm site'),
  name: requiredText('The name', 120).refine((v) => v.length >= 2, 'Enter at least 2 characters'),
  category: z.enum(ASSET_CATEGORIES),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{0,20}$/, 'Letters, numbers and dashes only').optional(),
  production_unit_id: z.string().optional(),
  make: optionalText(80),
  model: optionalText(80),
  serial_number: optionalText(80),
  purchase_date: z.string().optional(),
  purchase_cost: nonNegativeNumber('Purchase cost'),
  supplier_id: z.string().optional(),
  warranty_until: z.string().optional(),
  condition: z.enum(['good', 'fair', 'poor', 'out_of_service']),
  status: z.enum(['active', 'disposed']),
  notes: optionalText(2000),
})

function AssetDialog({ open, onOpenChange, asset, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; asset?: Asset; onCreated?: (id: string) => void }) {
  const { activeOrgId } = useAuth()
  const { siteId } = useSiteScope()
  const form = useForm<z.input<typeof assetSchema>>({ resolver: zodResolver(assetSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        site_id: asset?.site_id ?? siteId ?? '',
        name: asset?.name ?? '',
        category: asset?.category ?? 'equipment',
        code: asset?.code ?? '',
        production_unit_id: asset?.production_unit_id ?? '',
        make: asset?.make ?? '',
        model: asset?.model ?? '',
        serial_number: asset?.serial_number ?? '',
        purchase_date: asset?.purchase_date ?? '',
        purchase_cost: asset?.purchase_cost ?? undefined,
        supplier_id: asset?.supplier_id ?? '',
        warranty_until: asset?.warranty_until ?? '',
        condition: asset?.condition ?? 'good',
        status: asset?.status ?? 'active',
        notes: asset?.notes ?? '',
      })
  }, [open, asset, siteId, form])
  const site = form.watch('site_id')
  const { data: units = [] } = useProductionUnits(site || '__none__')
  const save = useSave(
    async (v: z.output<typeof assetSchema>) => {
      const values = { ...v, purchase_cost: v.purchase_cost ?? null }
      if (asset) {
        await assetsService.update(asset.id, values)
        return asset.id
      }
      return assetsService.create(activeOrgId!, values)
    },
    {
      success: asset ? 'Equipment saved' : 'Equipment added',
      onSuccess: (id) => {
        onOpenChange(false)
        if (!asset) onCreated?.(id)
      },
    },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={asset ? `Edit ${asset.name}` : 'Add equipment'}
      submitLabel={asset ? 'Save' : 'Add equipment'}
      pending={save.isPending}
      error={save.error}
      onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof assetSchema>))}
    >
      <FieldRow>
        <Field label="Name" htmlFor="as-name" error={errors.name?.message} required>
          <Input id="as-name" maxLength={120} placeholder="e.g. Generator 20kVA" {...form.register('name')} />
        </Field>
        <Field label="Category" htmlFor="as-cat">
          <Select id="as-cat" {...form.register('category')}>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Farm site" htmlFor="as-site" error={errors.site_id?.message} required>
          <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="as-site" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('production_unit_id', '') }} />} />
        </Field>
        <Field label="House, pond or field" htmlFor="as-unit">
          <Select id="as-unit" {...form.register('production_unit_id')}>
            <option value="">Not in one place</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Make" htmlFor="as-make">
          <Input id="as-make" maxLength={80} {...form.register('make')} />
        </Field>
        <Field label="Model" htmlFor="as-model">
          <Input id="as-model" maxLength={80} {...form.register('model')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Serial number" htmlFor="as-serial">
          <Input id="as-serial" maxLength={80} {...form.register('serial_number')} />
        </Field>
        <Field label="Asset code" htmlFor="as-code" error={errors.code?.message}>
          <Input id="as-code" maxLength={20} {...form.register('code')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Bought on" htmlFor="as-pdate">
          <Input id="as-pdate" type="date" max={todayISO()} {...form.register('purchase_date')} />
        </Field>
        <Field label="Purchase cost" htmlFor="as-cost" error={errors.purchase_cost?.message} hint="For the register only; not recorded as an expense">
          <Input id="as-cost" type="number" step="0.01" min={0} {...form.register('purchase_cost')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Bought from" htmlFor="as-sup">
          <Controller control={form.control} name="supplier_id" render={({ field }) => <SupplierSelect id="as-sup" placeholder="Not recorded" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
        <Field label="Warranty until" htmlFor="as-war">
          <Input id="as-war" type="date" {...form.register('warranty_until')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Condition" htmlFor="as-cond">
          <Select id="as-cond" {...form.register('condition')}>
            {(Object.keys(CONDITION) as Condition[]).map((c) => (
              <option key={c} value={c}>
                {CONDITION[c].label}
              </option>
            ))}
          </Select>
        </Field>
        {asset ? (
          <Field label="Status" htmlFor="as-status">
            <Select id="as-status" {...form.register('status')}>
              <option value="active">In use</option>
              <option value="disposed">Disposed or sold</option>
            </Select>
          </Field>
        ) : null}
      </FieldRow>
      <Field label="Notes" htmlFor="as-notes">
        <Textarea id="as-notes" rows={2} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

export function AssetDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['asset', id], queryFn: () => assetsService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Equipment not found" />
  return <AssetDetail asset={query.data} />
}

function AssetDetail({ asset }: { asset: Asset }) {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const [editing, setEditing] = React.useState(false)
  const [logging, setLogging] = React.useState<string | null | false>(false)
  const [planning, setPlanning] = React.useState(false)
  const [voiding, setVoiding] = React.useState<MaintenanceRecord | null>(null)
  const plans = useQuery({ queryKey: ['maintenance-plans', asset.id], queryFn: () => assetsService.plans(asset.id) })
  const records = useQuery({ queryKey: ['maintenance-records', asset.id], queryFn: () => assetsService.records(asset.id) })
  const togglePlan = useSave((v: { id: string; active: boolean }) => assetsService.setPlanActive(v.id, v.active), { success: 'Schedule updated' })
  const voidRecord = useRecord((key, v: { id: string; reason: string }) => assetsService.voidRecord(key, v.id, v.reason), { success: 'Record voided' })
  const manage = has('assets.manage')
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/equipment" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Equipment
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {asset.name}
            <Badge variant={CONDITION[asset.condition].variant}>{CONDITION[asset.condition].label}</Badge>
            {asset.status === 'disposed' ? <Badge>Disposed</Badge> : null}
          </span>
        }
        description={[ASSET_CATEGORY_LABEL[asset.category], asset.site_name, asset.location_name].filter(Boolean).join(' · ')}
        actions={
          manage ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              <Button variant="outline" onClick={() => setPlanning(true)}>
                <CalendarClock /> Add schedule
              </Button>
              {asset.status === 'active' ? (
                <Button onClick={() => setLogging(null)}>
                  <Wrench /> Record work
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {asset.condition === 'out_of_service' && asset.out_of_service_since ? (
        <Notice tone="warning" className="mb-4">Out of service since {formatDate(asset.out_of_service_since)}. Record the repair with its condition after to bring it back.</Notice>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="plain" label="Next service" value={asset.next_due_on ? formatDate(asset.next_due_on, 'd MMM') : '—'} hint={asset.maintenance_overdue ? <span className="text-destructive">Overdue</span> : asset.next_due_title ?? 'No schedule'} />
        <StatCard tone="plain" label="Last serviced" value={asset.last_service_on ? formatDate(asset.last_service_on, 'd MMM') : '—'} />
        <StatCard tone="money" label="Upkeep (12 months)" value={formatMoney(asset.maintenance_cost_12m, currency)} />
        <StatCard tone="plain" label="Downtime (12 months)" value={`${formatNumber(asset.downtime_hours_12m, 1)} h`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Service history</CardTitle>
          </CardHeader>
          <QueryState query={records} empty={<CardContent><p className="text-sm text-muted-foreground">No work recorded yet.</p></CardContent>}>
            {(list) => (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Work</Th>
                      <Th align="right">Cost</Th>
                      {manage ? <Th className="w-16" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <Tr key={r.id} className={cn(r.status === 'voided' && 'text-muted-foreground')}>
                        <Td className="whitespace-nowrap">{formatDate(r.performed_on)}</Td>
                        <Td>
                          <span className="font-medium capitalize">{r.kind}</span>: {r.description}
                          <div className="text-xs text-muted-foreground">
                            {[r.plan?.title, r.performed_by, r.supplier?.name, r.downtime_hours ? `${formatNumber(r.downtime_hours, 1)} h down` : null, r.condition_after ? `left ${CONDITION[r.condition_after].label.toLowerCase()}` : null].filter(Boolean).join(' · ')}
                          </div>
                          {r.status === 'voided' ? <div className="text-xs">Voided: {r.void_reason}</div> : null}
                        </Td>
                        <Td align="right" className={cn(r.status === 'voided' && 'line-through')}>
                          {r.cost !== null ? formatMoney(r.cost, currency) : '—'}
                          <div className="text-xs text-muted-foreground">{r.finance_transaction_id ? 'Paid' : r.supplier_bill_id ? 'On a bill' : r.cost ? 'Not paid here' : ''}</div>
                        </Td>
                        {manage ? (
                          <Td align="right">
                            {r.status === 'posted' ? (
                              <Button variant="ghost" size="sm" onClick={() => setVoiding(r)}>
                                Void
                              </Button>
                            ) : null}
                          </Td>
                        ) : null}
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </QueryState>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {plans.data?.length ? (
                plans.data.map((p) => (
                  <div key={p.id} className={cn('rounded-lg border p-3 text-sm', !p.is_active && 'text-muted-foreground')}>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-muted-foreground">
                      Every {p.interval_days} days · next{' '}
                      <span className={cn(p.is_active && p.next_due_on < todayISO() && 'font-medium text-destructive')}>{formatDate(p.next_due_on)}</span>
                    </p>
                    {manage ? (
                      <div className="mt-2 flex gap-2">
                        {p.is_active && asset.status === 'active' ? (
                          <Button size="sm" variant="outline" onClick={() => setLogging(p.id)}>
                            Done
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => togglePlan.mutate({ id: p.id, active: !p.is_active })}>
                          {p.is_active ? 'Pause' : 'Resume'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No service schedule. Add one to get reminders.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <DefinitionList
                items={[
                  { label: 'Make and model', value: [asset.make, asset.model].filter(Boolean).join(' ') || null },
                  { label: 'Serial number', value: asset.serial_number },
                  { label: 'Asset code', value: asset.code },
                  { label: 'Bought', value: asset.purchase_date ? `${formatDate(asset.purchase_date)}${asset.purchase_cost ? ` for ${formatMoney(asset.purchase_cost, currency)}` : ''}` : null },
                  { label: 'Supplier', value: asset.supplier_name },
                  { label: 'Warranty until', value: asset.warranty_until ? formatDate(asset.warranty_until) : null },
                  { label: 'Notes', value: asset.notes },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <AssetDialog open={editing} onOpenChange={setEditing} asset={asset} />
      <PlanDialog open={planning} onOpenChange={setPlanning} asset={asset} orgId={activeOrgId!} />
      {logging !== false ? <WorkDialog asset={asset} planId={logging} plans={plans.data ?? []} onClose={() => setLogging(false)} /> : null}
      <ReasonDialog
        open={voiding !== null}
        onOpenChange={(o) => !o && setVoiding(null)}
        title="Void this record?"
        description={voiding?.finance_transaction_id ? 'Its expense is reversed in Income & expenses.' : 'It stays in the history as voided.'}
        confirmLabel="Void record"
        onConfirm={(reason) => voidRecord.mutateAsync({ id: voiding!.id, reason })}
      />
    </div>
  )
}

const planSchema = z.object({
  title: requiredText('A title', 160),
  interval_days: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number({ required_error: 'Enter how often', invalid_type_error: 'Enter how often' }).int('Whole days').min(1).max(3650)),
  next_due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the first due date'),
  notes: optionalText(1000),
})

function PlanDialog({ open, onOpenChange, asset, orgId }: { open: boolean; onOpenChange: (o: boolean) => void; asset: Asset; orgId: string }) {
  const form = useForm<z.input<typeof planSchema>>({ resolver: zodResolver(planSchema) })
  React.useEffect(() => {
    if (open) form.reset({ title: '', interval_days: '' as unknown as number, next_due_on: todayISO(), notes: '' })
  }, [open, form])
  const save = useSave((v: z.output<typeof planSchema>) => assetsService.addPlan(orgId, asset.site_id, asset.id, v), { success: 'Schedule added', onSuccess: () => onOpenChange(false) })
  const { errors } = form.formState
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add a service schedule" size="sm" submitLabel="Add schedule" pending={save.isPending} error={save.error} onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof planSchema>))}>
      <Field label="What" htmlFor="mp-title" error={errors.title?.message} required>
        <Input id="mp-title" maxLength={160} placeholder="e.g. Oil and filter change" {...form.register('title')} />
      </Field>
      <FieldRow>
        <Field label="Every (days)" htmlFor="mp-int" error={errors.interval_days?.message} required>
          <Input id="mp-int" type="number" step="1" min={1} {...form.register('interval_days')} />
        </Field>
        <Field label="First due" htmlFor="mp-due" error={errors.next_due_on?.message} required>
          <Input id="mp-due" type="date" {...form.register('next_due_on')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

const workSchema = z
  .object({
    kind: z.enum(['service', 'repair', 'inspection']),
    performed_on: dateField('Date'),
    description: requiredText('What was done', 500),
    plan_id: z.string().optional(),
    cost: nonNegativeNumber('Cost'),
    paid_now: z.boolean(),
    payment_method: z.string().optional(),
    supplier_id: z.string().optional(),
    supplier_bill_id: z.string().optional(),
    downtime_hours: nonNegativeNumber('Downtime'),
    performed_by: optionalText(120),
    condition_after: z.string().optional(),
  })
  .refine((v) => !v.paid_now || (v.cost ?? 0) > 0, { path: ['cost'], message: 'Enter the cost to record it as paid' })
  .refine((v) => !v.paid_now || !!v.payment_method, { path: ['payment_method'], message: 'Choose how it was paid' })

function WorkDialog({ asset, planId, plans, onClose }: { asset: Asset; planId: string | null; plans: { id: string; title: string; is_active: boolean }[]; onClose: () => void }) {
  const { activeOrgId, has } = useAuth()
  const form = useForm<z.input<typeof workSchema>>({
    resolver: zodResolver(workSchema),
    defaultValues: { kind: planId ? 'service' : 'repair', performed_on: todayISO(), description: planId ? plans.find((p) => p.id === planId)?.title ?? '' : '', plan_id: planId ?? '', paid_now: false, payment_method: 'cash', supplier_id: '', supplier_bill_id: '', performed_by: '', condition_after: '' },
  })
  const supplier = form.watch('supplier_id')
  const paidNow = form.watch('paid_now')
  const bills = useQuery({ queryKey: ['supplier-bills', activeOrgId, 'maint', supplier], enabled: !!supplier, queryFn: () => procurementService.bills(activeOrgId!, { supplierId: supplier }) })
  const save = useRecord((key, v: z.output<typeof workSchema>) => assetsService.recordMaintenance(key, { asset_id: asset.id, ...v, cost: v.cost ?? null, downtime_hours: v.downtime_hours ?? null }), {
    success: 'Work recorded',
    onSuccess: () => onClose(),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Record work on ${asset.name}`}
      description="Pay a cost here only if it was paid on the spot. If a supplier sent a bill, link it and pay the bill instead."
      submitLabel="Save"
      pending={save.isPending}
      error={save.error}
      onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof workSchema>))}
    >
      <FieldRow>
        <Field label="Type of work" htmlFor="mw-kind">
          <Select id="mw-kind" {...form.register('kind')}>
            <option value="service">Service</option>
            <option value="repair">Repair</option>
            <option value="inspection">Inspection</option>
          </Select>
        </Field>
        <Field label="Date" htmlFor="mw-date" error={errors.performed_on?.message} required>
          <Input id="mw-date" type="date" max={todayISO()} {...form.register('performed_on')} />
        </Field>
      </FieldRow>
      <Field label="What was done" htmlFor="mw-desc" error={errors.description?.message} required>
        <Textarea id="mw-desc" rows={2} maxLength={500} {...form.register('description')} />
      </Field>
      {plans.length ? (
        <Field label="For schedule" htmlFor="mw-plan" hint="Moves the next due date on">
          <Select id="mw-plan" {...form.register('plan_id')}>
            <option value="">Not scheduled work</option>
            {plans.filter((p) => p.is_active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Done by" htmlFor="mw-by">
          <Input id="mw-by" maxLength={120} placeholder="Name or company" {...form.register('performed_by')} />
        </Field>
        <Field label="Supplier" htmlFor="mw-sup">
          <Controller control={form.control} name="supplier_id" render={({ field }) => <SupplierSelect id="mw-sup" placeholder="None" value={field.value ?? ''} onChange={(v) => { field.onChange(v); form.setValue('supplier_bill_id', '') }} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Cost" htmlFor="mw-cost" error={errors.cost?.message}>
          <Input id="mw-cost" type="number" step="0.01" min={0} {...form.register('cost')} />
        </Field>
        <Field label="Downtime (hours)" htmlFor="mw-down" error={errors.downtime_hours?.message}>
          <Input id="mw-down" type="number" step="0.5" min={0} {...form.register('downtime_hours')} />
        </Field>
      </FieldRow>
      {supplier && bills.data?.length ? (
        <Field label="Supplier bill for this work" htmlFor="mw-bill">
          <Select id="mw-bill" disabled={paidNow} {...form.register('supplier_bill_id')}>
            <option value="">None</option>
            {bills.data.filter((b) => b.status === 'posted').map((b) => (
              <option key={b.id} value={b.id}>
                {b.bill_number} · {formatDate(b.bill_date, 'd MMM')} · {b.amount.toLocaleString()}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {has('finance.record') ? (
        <Controller
          control={form.control}
          name="paid_now"
          render={({ field }) => (
            <Checkbox label="Paid now" description="Records the cost as a repairs expense." checked={field.value} disabled={!!form.watch('supplier_bill_id')} onChange={(e) => field.onChange(e.target.checked)} />
          )}
        />
      ) : null}
      {paidNow ? (
        <Field label="Paid by" htmlFor="mw-method" error={errors.payment_method?.message}>
          <Controller control={form.control} name="payment_method" render={({ field }) => <PaymentMethodSelect id="mw-method" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <Field label="Condition afterwards" htmlFor="mw-cond">
        <Select id="mw-cond" {...form.register('condition_after')}>
          <option value="">Unchanged ({CONDITION[asset.condition].label.toLowerCase()})</option>
          {(Object.keys(CONDITION) as Condition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION[c].label}
            </option>
          ))}
        </Select>
      </Field>
    </FormDialog>
  )
}
