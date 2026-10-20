import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, MoreHorizontal, Plus, Sprout, Wheat } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { cropsService, CROP_STATUS, type CropCycle } from '@/features/crops/services/crops.service'
import { productionService } from '@/features/production/services/production.service'
import { financeService } from '@/features/finance/services/finance.service'
import { reportsService } from '@/features/reports/services/reports.service'
import { useQuickActions } from '@/features/operations/components/quick-actions'
import { ActivityList } from '@/features/activity/components/activity-list'
import { ProductionTable } from '@/features/production/components/production-table'
import { TransactionsTable } from '@/features/finance/components/transactions-table'
import { FinanceDialog } from '@/features/finance/components/finance-dialog'
import { ActivityDialog } from '@/features/operations/components/field-dialogs'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input, Select, Textarea } from '@/shared/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Table, TableWrap, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th, Tr } from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, Field, LoadingRows, PageHeader, QueryState, StatCard } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { SiteSelect, UnitSelect } from '@/shared/components/pickers'
import { useProductionUnits, useUnits } from '@/shared/hooks/use-reference-data'
import { useSave } from '@/shared/hooks/use-record'
import { optionalDate, optionalText, positiveNumber, requiredId, requiredText } from '@/shared/lib/validation'
import { formatDate, formatMoney, formatNumber, todayISO } from '@/shared/lib/format'
import { operatingSurplus } from '@/shared/lib/calc'
import { AttachmentsButton } from '@/features/attachments/components/attachments'

const createSchema = z
  .object({
    site_id: requiredId('a farm site'),
    production_unit_id: requiredId('a field or plot'),
    code: requiredText('A cycle code', 40),
    crop: requiredText('The crop', 60),
    variety: optionalText(80),
    season: optionalText(40),
    planting_date: optionalDate,
    area: positiveNumber('Area'),
    area_unit_id: requiredId('an area unit'),
    expected_harvest_date: optionalDate,
    notes: optionalText(),
  })
  .refine((v) => !v.planting_date || !v.expected_harvest_date || v.expected_harvest_date >= v.planting_date, {
    path: ['expected_harvest_date'],
    message: 'Must be after planting',
  })
  .refine((v) => !v.planting_date || v.planting_date <= todayISO(), { path: ['planting_date'], message: 'Planting date cannot be in the future. Leave blank to plan ahead.' })

const CROPS = ['Maize', 'Cassava', 'Rice', 'Yam', 'Soybean', 'Sorghum', 'Tomato', 'Pepper', 'Groundnut', 'Cowpea', 'Plantain', 'Okra', 'Cucumber', 'Watermelon']

function CreateCycleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId } = useAuth()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const { data: allUnits = [] } = useUnits()
  const haId = allUnits.find((u) => u.code === 'ha' && !u.organization_id)?.id ?? ''
  const form = useForm<z.input<typeof createSchema>>({ resolver: zodResolver(createSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({ site_id: siteId ?? '', production_unit_id: '', code: `CR-${new Date().getFullYear()}-`, crop: '', variety: '', season: '', planting_date: todayISO(), area_unit_id: haId, expected_harvest_date: '', notes: '', area: undefined })
  }, [open, siteId, haId, form])
  const site = form.watch('site_id')
  const { data: units = [] } = useProductionUnits(site || '__none__', 'crop')
  const unitId = form.watch('production_unit_id')
  React.useEffect(() => {
    const u = units.find((x) => x.id === unitId)
    if (u?.area && !form.getValues('area')) {
      form.setValue('area', u.area)
      if (u.area_unit_id) form.setValue('area_unit_id', u.area_unit_id)
    }
  }, [unitId, units, form])
  const mutation = useSave(
    (v: z.output<typeof createSchema>) => cropsService.create(activeOrgId!, { ...v, planting_date: v.planting_date || undefined, expected_harvest_date: v.expected_harvest_date || undefined }),
    { success: 'Crop cycle created', onSuccess: (id) => { onOpenChange(false); navigate(`/crops/${id}`) } },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Start a crop cycle"
      description="One crop on one field or plot for one season. Leave the planting date empty to plan ahead."
      submitLabel="Create cycle"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof createSchema>))}
    >
      <FieldRow>
        <Field label="Farm site" htmlFor="cc-site" error={errors.site_id?.message} required>
          <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="cc-site" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('production_unit_id', '') }} />} />
        </Field>
        <Field label="Field / plot" htmlFor="cc-unit" error={errors.production_unit_id?.message} required hint={site && !units.length ? 'Add fields on the farm site page first' : undefined}>
          <Select id="cc-unit" {...form.register('production_unit_id')}>
            <option value="">Choose a field or plot</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Crop" htmlFor="cc-crop" error={errors.crop?.message} required>
          <Input id="cc-crop" list="cc-crops" maxLength={60} {...form.register('crop')} />
          <datalist id="cc-crops">
            {CROPS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Variety" htmlFor="cc-variety">
          <Input id="cc-variety" maxLength={80} {...form.register('variety')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Cycle code" htmlFor="cc-code" error={errors.code?.message} required>
          <Input id="cc-code" maxLength={40} className="uppercase" {...form.register('code')} />
        </Field>
        <Field label="Season" htmlFor="cc-season" hint="e.g. Wet season 2026">
          <Input id="cc-season" maxLength={40} {...form.register('season')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Area planted" htmlFor="cc-area" error={errors.area?.message} required>
          <Input id="cc-area" type="number" step="any" min={0} {...form.register('area')} />
        </Field>
        <Field label="Area unit" htmlFor="cc-areau" error={errors.area_unit_id?.message} required>
          <Controller control={form.control} name="area_unit_id" render={({ field }) => <UnitSelect id="cc-areau" dimension="area" value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Planting date" htmlFor="cc-plant" error={errors.planting_date?.message}>
          <Input id="cc-plant" type="date" max={todayISO()} {...form.register('planting_date')} />
        </Field>
        <Field label="Expected harvest" htmlFor="cc-harvest" error={errors.expected_harvest_date?.message} hint="Used for upcoming-harvest alerts">
          <Input id="cc-harvest" type="date" {...form.register('expected_harvest_date')} />
        </Field>
      </FieldRow>
      <Field label="Notes" htmlFor="cc-notes">
        <Textarea id="cc-notes" rows={2} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

export function CropsPage() {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const [status, setStatus] = React.useState<'open' | 'all' | 'closed'>('open')
  const [creating, setCreating] = React.useState(false)
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['crops', activeOrgId, siteId, status],
    enabled: !!activeOrgId,
    queryFn: () => cropsService.list(activeOrgId!, { siteId: siteId || undefined, status: status === 'closed' ? 'closed' : status }),
  })
  return (
    <div>
      <PageHeader
        title="Crop cycles"
        description="Planting, inputs, field work and harvests for each field or plot. Yield is compared on a per-hectare basis."
        actions={
          has('batches.manage') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Start crop cycle
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="crop-status" className="text-sm text-muted-foreground">
          Show
        </label>
        <div className="w-40">
          <Select id="crop-status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="open">Planned and growing</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </Select>
        </div>
      </div>
      <Card>
        <QueryState
          query={query}
          empty={
            <EmptyState
              icon={Sprout}
              title="No crop cycles here"
              description={has('batches.manage') ? 'Start a cycle for a field or plot to record inputs and harvests.' : undefined}
              action={has('batches.manage') ? <Button onClick={() => setCreating(true)}>Start crop cycle</Button> : undefined}
            />
          }
        >
          {(rows) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Cycle</Th>
                    <Th>Field · site</Th>
                    <Th align="right">Area</Th>
                    <Th>Planted</Th>
                    <Th>Expected harvest</Th>
                    <Th align="right">Harvested</Th>
                    <Th align="right">Yield</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <Tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/crops/${c.id}`)}>
                      <Td>
                        <Link to={`/crops/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.code}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {c.crop}
                          {c.variety ? ` · ${c.variety}` : ''}
                        </div>
                      </Td>
                      <Td>
                        {c.production_unit_name}
                        <div className="text-xs text-muted-foreground">{c.site_name}</div>
                      </Td>
                      <Td align="right">
                        {formatNumber(c.area)} {c.area_unit_symbol}
                      </Td>
                      <Td>{formatDate(c.planting_date)}</Td>
                      <Td>{formatDate(c.expected_harvest_date)}</Td>
                      <Td align="right">{c.harvest_kg ? `${formatNumber(c.harvest_kg, 0)} kg` : '—'}</Td>
                      <Td align="right">{c.yield_kg_per_ha ? `${formatNumber(c.yield_kg_per_ha, 0)} kg/ha` : '—'}</Td>
                      <Td>
                        <Badge variant={CROP_STATUS[c.status].variant}>{CROP_STATUS[c.status].label}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <CreateCycleDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

export function CropDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['crop', id], queryFn: () => cropsService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={6} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Crop cycle not found" description="It may belong to a site you don't have access to." />
  return <CropDetail cycle={query.data} />
}

function CropDetail({ cycle }: { cycle: CropCycle }) {
  const { has, activeOrgId } = useAuth()
  const currency = useCurrency()
  const { open } = useQuickActions()
  const [dialog, setDialog] = React.useState<'expense' | 'activity' | 'start' | 'fail' | 'close' | 'edit' | null>(null)
  const isOpen = cycle.status === 'active' || cycle.status === 'harvested'
  const production = useQuery({ queryKey: ['production', activeOrgId, 'cycle', cycle.id], queryFn: () => productionService.list(activeOrgId!, { cropCycleId: cycle.id, includeVoided: true }) })
  const money = useQuery({ queryKey: ['finance', activeOrgId, 'cycle', cycle.id], enabled: has('finance.view'), queryFn: () => financeService.list(activeOrgId!, { cropCycleId: cycle.id }) })
  const inputs = useQuery({
    queryKey: ['reports', activeOrgId, 'inputs', cycle.id],
    enabled: has('inventory.view'),
    queryFn: async () => (await reportsService.inputsUsed(activeOrgId!, { from: '2000-01-01', to: todayISO(), siteId: cycle.site_id })).filter((r) => r.target_id === cycle.id),
  })
  const income = money.data?.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0) ?? 0
  const expense = money.data?.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0) ?? 0
  const status = useSave((v: { status: 'active' | 'harvested' | 'closed' | 'failed'; date?: string; reason?: string }) => cropsService.setStatus(cycle.id, v.status, v.date, v.reason), { success: 'Crop cycle updated' })

  return (
    <div>
      <Link to="/crops" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Crop cycles
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {cycle.code} · {cycle.crop}
            <Badge variant={CROP_STATUS[cycle.status].variant}>{CROP_STATUS[cycle.status].label}</Badge>
          </span>
        }
        description={`${cycle.variety ? `${cycle.variety} · ` : ''}${cycle.production_unit_name} · ${cycle.site_name} · ${formatNumber(cycle.area)} ${cycle.area_unit_symbol}`}
        actions={
          <>
            {isOpen && has('operations.record') ? (
              <>
                <Button variant="outline" onClick={() => open('input_use', { cycleId: cycle.id })}>
                  <Sprout /> Input applied
                </Button>
                <Button onClick={() => open('crop_harvest', { cycleId: cycle.id })}>
                  <Wheat /> Harvest
                </Button>
              </>
            ) : null}
            {cycle.status === 'planned' && has('batches.manage') ? <Button onClick={() => setDialog('start')}>Mark as planted</Button> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {has('operations.record') && cycle.status !== 'closed' && cycle.status !== 'failed' ? <DropdownMenuItem onSelect={() => setDialog('activity')}>Add field activity</DropdownMenuItem> : null}
                {has('finance.record') ? <DropdownMenuItem onSelect={() => setDialog('expense')}>Record expense for this cycle</DropdownMenuItem> : null}
                {has('batches.manage') && cycle.status !== 'closed' && cycle.status !== 'failed' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setDialog('edit')}>Edit details</DropdownMenuItem>
                    {cycle.status === 'active' ? <DropdownMenuItem onSelect={() => status.mutate({ status: 'harvested' })}>Mark harvest complete</DropdownMenuItem> : null}
                    <DropdownMenuItem onSelect={() => setDialog('close')}>Close cycle</DropdownMenuItem>
                    <DropdownMenuItem destructive onSelect={() => setDialog('fail')}>
                      Record crop failure
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem onSelect={() => window.print()}>Print</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard tone="crop" label="Area" value={`${formatNumber(cycle.area_ha, 2)} ha`} hint={`${formatNumber(cycle.area)} ${cycle.area_unit_symbol}`} />
        <StatCard tone="crop" label="Harvested (good)" value={cycle.harvest_kg ? `${formatNumber(cycle.harvest_kg, 0)} kg` : '—'} hint={`${cycle.harvest_records} harvest record${cycle.harvest_records === 1 ? '' : 's'}`} />
        <StatCard tone="crop" label="Yield" value={cycle.yield_kg_per_ha ? `${formatNumber(cycle.yield_kg_per_ha, 0)} kg/ha` : '—'} hint="Mass harvests only" />
        <StatCard tone="plain" label="Days since planting" value={cycle.planting_date ? formatNumber(Math.max(0, Math.round((Date.now() - new Date(cycle.planting_date).getTime()) / 86_400_000))) : 'Not planted'} hint={cycle.expected_harvest_date ? `Harvest expected ${formatDate(cycle.expected_harvest_date)}` : undefined} />
      </div>
      <Tabs defaultValue="harvests" className="mt-5">
        <TabsList>
          <TabsTrigger value="harvests">Harvests</TabsTrigger>
          <TabsTrigger value="log">Field log</TabsTrigger>
          {has('inventory.view') ? <TabsTrigger value="inputs">Inputs used</TabsTrigger> : null}
          {has('finance.view') ? <TabsTrigger value="money">Money</TabsTrigger> : null}
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="harvests">
          <Card>
            <QueryState query={production}>{(rows) => <ProductionTable rows={rows} showSource={false} />}</QueryState>
          </Card>
        </TabsContent>
        <TabsContent value="log">
          <Card>
            <ActivityList filters={{ cropCycleId: cycle.id, includeVoided: true }} showSite={false} emptyText="No field activities logged yet" />
          </Card>
        </TabsContent>
        {has('inventory.view') ? (
          <TabsContent value="inputs">
            <Card>
              <QueryState query={inputs} empty={<EmptyState icon={Sprout} title="No inputs drawn from stores for this cycle" />}>
                {(rows) => (
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Item</Th>
                          <Th align="right">Total used</Th>
                          <Th align="right">Per hectare</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <Tr key={r.item_name}>
                            <Td>{r.item_name}</Td>
                            <Td align="right">
                              {formatNumber(r.quantity, 2)} {r.unit_symbol}
                            </Td>
                            <Td align="right">
                              {formatNumber(r.quantity / cycle.area_ha, 1)} {r.unit_symbol}/ha
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </QueryState>
              <p className="px-5 py-3 text-xs text-muted-foreground">Quantities taken from stores for this cycle. Money spent on inputs is under Money when linked.</p>
            </Card>
          </TabsContent>
        ) : null}
        {has('finance.view') ? (
          <TabsContent value="money" className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard tone="money" label="Income linked" value={formatMoney(income, currency)} />
              <StatCard tone="plain" label="Expenses linked" value={formatMoney(expense, currency)} />
              <StatCard tone="plain" label="Surplus (cash recorded)" value={formatMoney(operatingSurplus(income, expense), currency)} hint={cycle.area_ha ? `${formatMoney(operatingSurplus(income, expense) / cycle.area_ha, currency)} per ha` : undefined} />
            </div>
            <Card>
              <QueryState query={money}>{(rows) => <TransactionsTable rows={rows} emptyText="No income or expenses linked to this cycle" />}</QueryState>
            </Card>
          </TabsContent>
        ) : null}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Cycle details</CardTitle>
              <AttachmentsButton entityType="crop_cycle" entityId={cycle.id} siteId={cycle.site_id} />
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: 'Planted', value: formatDate(cycle.planting_date) },
                  { label: 'Expected harvest', value: formatDate(cycle.expected_harvest_date) },
                  { label: 'Season', value: cycle.season },
                  { label: 'Variety', value: cycle.variety },
                  { label: 'Closed', value: cycle.closed_on ? `${formatDate(cycle.closed_on)}${cycle.close_reason ? `: ${cycle.close_reason}` : ''}` : null },
                  { label: 'Notes', value: cycle.notes },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <FinanceDialog open={dialog === 'expense'} onOpenChange={(o) => !o && setDialog(null)} kind="expense" cycleId={cycle.id} siteId={cycle.site_id} productionType="crop" />
      <ActivityDialog open={dialog === 'activity'} onOpenChange={(o) => !o && setDialog(null)} cycleId={cycle.id} siteId={cycle.site_id} productionType="crop" />
      <EditCycleDialog open={dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)} cycle={cycle} />
      <PlantDialog open={dialog === 'start'} onOpenChange={(o) => !o && setDialog(null)} onConfirm={(date) => status.mutateAsync({ status: 'active', date })} />
      <ReasonDialog
        open={dialog === 'fail'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Record crop failure"
        description="The cycle is closed as failed. Its records stay in reports."
        confirmLabel="Record failure"
        onConfirm={(reason) => status.mutateAsync({ status: 'failed', date: todayISO(), reason })}
      />
      <ReasonDialog
        open={dialog === 'close'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Close this crop cycle"
        description="No more harvests or inputs can be recorded against it."
        confirmLabel="Close cycle"
        destructive={false}
        reasonRequired={false}
        onConfirm={(reason) => status.mutateAsync({ status: 'closed', date: todayISO(), reason })}
      />
    </div>
  )
}

function PlantDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (date: string) => Promise<unknown> }) {
  const [date, setDate] = React.useState(todayISO())
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<unknown>(null)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mark as planted"
      submitLabel="Save"
      pending={pending}
      error={error}
      size="sm"
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        setError(null)
        try {
          await onConfirm(date)
          onOpenChange(false)
        } catch (err) {
          setError(err)
        } finally {
          setPending(false)
        }
      }}
    >
      <Field label="Planting date" htmlFor="pl-date" required>
        <Input id="pl-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </FormDialog>
  )
}

const editSchema = z.object({ variety: optionalText(80), season: optionalText(40), expected_harvest_date: optionalDate, notes: optionalText() })

function EditCycleDialog({ open, onOpenChange, cycle }: { open: boolean; onOpenChange: (o: boolean) => void; cycle: CropCycle }) {
  const form = useForm<z.input<typeof editSchema>>({ resolver: zodResolver(editSchema) })
  React.useEffect(() => {
    if (open) form.reset({ variety: cycle.variety ?? '', season: cycle.season ?? '', expected_harvest_date: cycle.expected_harvest_date ?? '', notes: cycle.notes ?? '' })
  }, [open, cycle, form])
  const mutation = useSave(
    (v: z.output<typeof editSchema>) => cropsService.updateDetails(cycle.id, { variety: v.variety || null, season: v.season || null, expected_harvest_date: v.expected_harvest_date || null, notes: v.notes ?? '' }),
    { success: 'Details saved', onSuccess: () => onOpenChange(false) },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${cycle.code}`}
      description="Area and planting date are part of the record and are not edited here."
      submitLabel="Save"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof editSchema>))}
    >
      <FieldRow>
        <Field label="Variety" htmlFor="ec-variety">
          <Input id="ec-variety" maxLength={80} {...form.register('variety')} />
        </Field>
        <Field label="Season" htmlFor="ec-season">
          <Input id="ec-season" maxLength={40} {...form.register('season')} />
        </Field>
      </FieldRow>
      <Field label="Expected harvest" htmlFor="ec-harvest">
        <Input id="ec-harvest" type="date" {...form.register('expected_harvest_date')} />
      </Field>
      <Field label="Notes" htmlFor="ec-notes">
        <Textarea id="ec-notes" rows={3} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}
