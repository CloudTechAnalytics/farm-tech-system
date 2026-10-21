import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, HeartPulse, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { HEALTH_TYPES, HEALTH_TYPE_LABEL, ROUTES, ROUTE_LABEL, SEVERITY, WATER_LIMITS, healthService, type HealthRecord, type HealthType } from '@/features/health/services/health.service'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr, Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/misc'
import { EmptyState, Field, Notice, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { BatchSelect, CropCycleSelect, ItemSelect, SiteSelect, StoreSelect, UnitSelect, useItems } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { useRecord, useSave } from '@/shared/hooks/use-record'
import { useProductionUnits, useUnits } from '@/shared/hooks/use-reference-data'
import { formatDate, formatNumber, todayISO } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

type View = 'all' | 'medicine' | 'incidents' | 'water' | 'crops'
const VIEW_TYPES: Record<View, HealthType[]> = {
  all: [],
  medicine: ['treatment', 'vaccination'],
  incidents: ['incident', 'inspection'],
  water: ['water_quality'],
  crops: ['pest_disease'],
}

export function HealthPage() {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const [params, setParams] = useSearchParams()
  const view = (params.get('tab') as View) ?? 'all'
  const batchId = params.get('batch') ?? undefined
  const [period, setPeriod] = usePeriod('90d')
  const [search, setSearch] = React.useState('')
  const [openOnly, setOpenOnly] = React.useState(false)
  const [withdrawalOnly, setWithdrawalOnly] = React.useState(false)
  const [adding, setAdding] = React.useState<HealthType | null>(null)
  const [voiding, setVoiding] = React.useState<HealthRecord | null>(null)
  const [resolving, setResolving] = React.useState<HealthRecord | null>(null)
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['health', activeOrgId, siteId, view, period, debounced, openOnly, withdrawalOnly, batchId],
    enabled: !!activeOrgId,
    queryFn: () =>
      healthService.list(activeOrgId!, {
        siteId: siteId || undefined,
        types: VIEW_TYPES[view],
        batchId,
        from: openOnly || withdrawalOnly ? undefined : period.from,
        to: openOnly || withdrawalOnly ? undefined : period.to,
        search: debounced || undefined,
        openOnly,
        withdrawalOnly,
      }),
  })
  const rows = query.data ?? []
  const voidRec = useRecord((key, v: { id: string; reason: string }) => healthService.void(key, v.id, v.reason), { success: 'Record voided' })
  const resolve = useSave((v: { id: string; note: string }) => healthService.resolve(v.id, todayISO(), v.note), { success: 'Incident resolved' })
  const canRecord = has('health.record')
  return (
    <div>
      <PageHeader
        title="Health and biosecurity"
        description="Treatments, vaccinations, inspections, disease incidents, water quality and crop pests. Withdrawal periods stop sales from treated batches until they end."
        actions={
          <>
            {has('reports.export') ? (
              <Button
                variant="outline"
                disabled={!rows.length}
                onClick={() =>
                  downloadCsv(
                    'health-records',
                    toCsv(rows, [
                      { header: 'Date', value: (r) => r.record_date },
                      { header: 'Type', value: (r) => HEALTH_TYPE_LABEL[r.record_type] },
                      { header: 'Title', value: (r) => r.title },
                      { header: 'Site', value: (r) => r.site_name },
                      { header: 'Batch / cycle / unit', value: (r) => r.batch_code ?? r.crop_cycle_code ?? r.production_unit_name },
                      { header: 'Product', value: (r) => r.product_name },
                      { header: 'Quantity', value: (r) => (r.quantity !== null ? `${r.quantity} ${r.unit_symbol ?? ''}` : '') },
                      { header: 'Dose', value: (r) => r.dose },
                      { header: 'Route', value: (r) => (r.route ? ROUTE_LABEL[r.route] : '') },
                      { header: 'Withdrawal until', value: (r) => r.withdrawal_until },
                      { header: 'Next due', value: (r) => r.next_due_on },
                      { header: 'Severity', value: (r) => r.severity },
                      { header: 'Affected', value: (r) => r.affected_count },
                      { header: 'Status', value: (r) => r.incident_status },
                      { header: 'DO mg/L', value: (r) => r.dissolved_oxygen_mg_l },
                      { header: 'pH', value: (r) => r.ph },
                      { header: 'Ammonia mg/L', value: (r) => r.ammonia_mg_l },
                      { header: 'Nitrite mg/L', value: (r) => r.nitrite_mg_l },
                      { header: 'Temp °C', value: (r) => r.water_temp_c },
                      { header: 'Vet', value: (r) => r.vet_name },
                      { header: 'Given by', value: (r) => r.administered_by },
                      { header: 'Action', value: (r) => r.action_taken },
                      { header: 'Notes', value: (r) => r.notes },
                    ]),
                  )
                }
              >
                <Download /> Export CSV
              </Button>
            ) : null}
            {canRecord ? (
              <Button onClick={() => setAdding(view === 'water' ? 'water_quality' : view === 'crops' ? 'pest_disease' : view === 'incidents' ? 'incident' : 'treatment')}>
                <Plus /> Record
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs value={view} onValueChange={(v) => setParams(v === 'all' ? {} : { tab: v })}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="medicine">Treatments and vaccines</TabsTrigger>
          <TabsTrigger value="incidents">Incidents and inspections</TabsTrigger>
          <TabsTrigger value="water">Water quality</TabsTrigger>
          <TabsTrigger value="crops">Crop pests</TabsTrigger>
        </TabsList>
      </Tabs>
      {batchId ? (
        <Notice className="mt-3">
          Showing one batch.{' '}
          <button type="button" className="underline" onClick={() => setParams(view === 'all' ? {} : { tab: view })}>
            Show all
          </button>
        </Notice>
      ) : null}
      <div className="my-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="plain" label="Under withdrawal" value={rows.filter((r) => r.in_withdrawal).length} hint="Not to be sold yet" />
        <StatCard tone="plain" label="Open incidents" value={rows.filter((r) => r.incident_status === 'open').length} />
        <StatCard tone="plain" label="Water tests out of range" value={rows.filter((r) => r.out_of_range).length} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search title, product, batch, vet" />
        {!openOnly && !withdrawalOnly ? <PeriodFilter value={period} onChange={setPeriod} /> : null}
        <Checkbox label="Open incidents" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
        <Checkbox label="Under withdrawal" checked={withdrawalOnly} onChange={(e) => setWithdrawalOnly(e.target.checked)} />
      </div>
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={HeartPulse} title="No health records here" description="Record vaccinations, treatments, inspections and water tests so withdrawal periods, boosters and problems are tracked." action={canRecord ? <Button onClick={() => setAdding('vaccination')}>Record a vaccination</Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Record</Th>
                    <Th>Where</Th>
                    <Th>Status</Th>
                    {canRecord ? <Th className="w-24" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap">{formatDate(r.record_date)}</Td>
                      <Td>
                        <span className="font-medium">{r.title}</span>
                        <div className="text-xs text-muted-foreground">
                          {HEALTH_TYPE_LABEL[r.record_type]}
                          {r.product_name ? ` · ${r.product_name}` : ''}
                          {r.quantity !== null ? ` · ${formatNumber(r.quantity, 2)} ${r.unit_symbol ?? ''}` : ''}
                          {r.dose ? ` · ${r.dose}` : ''}
                          {r.route ? ` · ${ROUTE_LABEL[r.route]}` : ''}
                          {r.vet_name ? ` · Vet: ${r.vet_name}` : ''}
                        </div>
                        {r.record_type === 'water_quality' ? <WaterLine r={r} /> : null}
                        {r.action_taken ? <div className="mt-0.5 text-xs text-muted-foreground">Action: {r.action_taken}</div> : null}
                      </Td>
                      <Td>
                        {r.batch_code ?? r.crop_cycle_code ?? r.production_unit_name ?? '—'}
                        <div className="text-xs text-muted-foreground">{r.site_name}</div>
                      </Td>
                      <Td className="space-y-1">
                        {r.in_withdrawal ? <Badge variant="warning">Withdrawal to {formatDate(r.withdrawal_until, 'd MMM')}</Badge> : null}
                        {r.severity ? <Badge variant={SEVERITY[r.severity].variant}>{SEVERITY[r.severity].label}</Badge> : null}
                        {r.incident_status === 'open' ? <Badge variant="danger">Open</Badge> : r.incident_status === 'resolved' ? <Badge variant="success">Resolved {r.resolved_on ? formatDate(r.resolved_on, 'd MMM') : ''}</Badge> : null}
                        {r.out_of_range ? <Badge variant="danger">Out of range</Badge> : null}
                        {r.outcome ? <Badge variant={r.outcome === 'pass' ? 'success' : 'warning'}>{r.outcome === 'pass' ? 'Passed' : r.outcome === 'fail' ? 'Failed' : 'Needs action'}</Badge> : null}
                        {r.next_due_on ? <div className={cn('text-xs', r.next_due_on < todayISO() ? 'text-destructive' : 'text-muted-foreground')}>Next due {formatDate(r.next_due_on, 'd MMM')}</div> : null}
                      </Td>
                      {canRecord ? (
                        <Td align="right">
                          <div className="flex justify-end gap-1">
                            {r.incident_status === 'open' ? (
                              <Button variant="ghost" size="sm" onClick={() => setResolving(r)}>
                                Resolve
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="sm" onClick={() => setVoiding(r)}>
                              Void
                            </Button>
                          </div>
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
      {adding ? <HealthDialog initialType={adding} defaultBatch={batchId} onClose={() => setAdding(null)} /> : null}
      <ReasonDialog
        open={voiding !== null}
        onOpenChange={(o) => !o && setVoiding(null)}
        title="Void this health record?"
        description={voiding?.inventory_item_id ? 'The stock it used goes back into the store, and any withdrawal period it set is lifted.' : 'Any withdrawal period or reminder it set is lifted.'}
        confirmLabel="Void record"
        onConfirm={(reason) => voidRec.mutateAsync({ id: voiding!.id, reason })}
      />
      <ReasonDialog
        open={resolving !== null}
        onOpenChange={(o) => !o && setResolving(null)}
        title="Resolve this incident?"
        description="Describe what was done. It is marked resolved today."
        confirmLabel="Resolve"
        onConfirm={(note) => resolve.mutateAsync({ id: resolving!.id, note })}
      />
    </div>
  )
}

function WaterLine({ r }: { r: HealthRecord }) {
  const parts = (Object.keys(WATER_LIMITS) as (keyof typeof WATER_LIMITS)[]).flatMap((k) => {
    const v = r[k]
    if (v === null) return []
    const lim = WATER_LIMITS[k] as { min?: number; max?: number; label: string; unit: string }
    const bad = (lim.min !== undefined && v < lim.min) || (lim.max !== undefined && v > lim.max)
    return [
      <span key={k} className={cn(bad && 'font-medium text-destructive')}>
        {lim.label} {formatNumber(v, 2)}
        {lim.unit ? ` ${lim.unit}` : ''}
      </span>,
    ]
  })
  return <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">{parts}</div>
}

function HealthDialog({ initialType, defaultBatch, onClose }: { initialType: HealthType; defaultBatch?: string; onClose: () => void }) {
  const { activeOrgId } = useAuth()
  const { siteId } = useSiteScope()
  const { data: items = [] } = useItems()
  const { data: units = [] } = useUnits()
  const [v, setV] = React.useState<Record<string, string>>({ record_type: initialType, site_id: siteId ?? '', record_date: todayISO(), batch_id: defaultBatch ?? '', production_type: 'poultry' })
  const [localError, setLocalError] = React.useState<string | null>(null)
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }))
  const type = v.record_type as HealthType
  const animal = v.production_type === 'poultry' || v.production_type === 'fish'
  const { data: pUnits = [] } = useProductionUnits(v.site_id || '__none__', v.production_type === 'crop' ? 'crop' : v.production_type === 'fish' ? 'fish' : undefined)
  const item = items.find((i) => i.id === v.inventory_item_id)
  const itemDim = units.find((u) => u.id === item?.base_unit_id)?.dimension
  const usesStock = type === 'treatment' || type === 'vaccination' || type === 'pest_disease'
  React.useEffect(() => {
    if (type === 'water_quality') set('production_type', 'fish')
    if (type === 'pest_disease') set('production_type', 'crop')
  }, [type])
  const save = useRecord((key, input: Record<string, string>) => healthService.record(key, activeOrgId!, input as never), { success: 'Health record saved', onSuccess: () => onClose() })
  const num = (k: string, label: string, opts: { step?: string; hint?: string } = {}) => (
    <Field label={label} htmlFor={`hr-${k}`} hint={opts.hint}>
      <Input id={`hr-${k}`} type="number" step={opts.step ?? 'any'} min={0} value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
    </Field>
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!v.site_id) return setLocalError('Choose the farm site.')
    if ((v.title ?? '').trim().length < 2) return setLocalError('Give the record a title.')
    if (v.record_date > todayISO()) return setLocalError('The date cannot be in the future.')
    if (v.inventory_item_id && (!(Number(v.quantity) > 0) || !v.unit_id || !v.store_id)) return setLocalError('Enter the quantity, unit and store for the stock used.')
    if (Number(v.withdrawal_days) > 0 && !v.batch_id && !v.crop_cycle_id) return setLocalError('Choose the batch or crop cycle the withdrawal period applies to.')
    if (v.next_due_on && v.next_due_on <= v.record_date) return setLocalError('The next due date must be after the record date.')
    if (type === 'water_quality' && !['water_temp_c', 'ph', 'dissolved_oxygen_mg_l', 'ammonia_mg_l', 'nitrite_mg_l'].some((k) => v[k])) return setLocalError('Enter at least one water reading.')
    const payload = { ...v }
    if (!animal) delete payload.batch_id
    if (v.production_type !== 'crop') delete payload.crop_cycle_id
    if (!usesStock) for (const k of ['inventory_item_id', 'quantity', 'unit_id', 'store_id', 'withdrawal_days']) delete payload[k]
    save.mutate(payload)
  }
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Record health event" size="lg" submitLabel="Save record" pending={save.isPending} error={localError ? new Error(localError) : save.error} onSubmit={submit}>
      <FieldRow>
        <Field label="Type" htmlFor="hr-type">
          <Select id="hr-type" value={type} onChange={(e) => set('record_type', e.target.value)}>
            {HEALTH_TYPES.map((t) => (
              <option key={t} value={t}>
                {HEALTH_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor="hr-date" required>
          <Input id="hr-date" type="date" max={todayISO()} value={v.record_date} onChange={(e) => set('record_date', e.target.value)} />
        </Field>
      </FieldRow>
      <Field label="Title" htmlFor="hr-title" required>
        <Input
          id="hr-title"
          maxLength={160}
          value={v.title ?? ''}
          onChange={(e) => set('title', e.target.value)}
          placeholder={type === 'vaccination' ? 'e.g. Newcastle (Lasota), day 21' : type === 'water_quality' ? 'e.g. Morning test, Pond 2' : type === 'pest_disease' ? 'e.g. Fall armyworm on maize' : type === 'inspection' ? 'e.g. Weekly biosecurity walk' : 'e.g. Coccidiosis treatment'}
        />
      </Field>
      <FieldRow>
        <Field label="Farm site" htmlFor="hr-site" required>
          <SiteSelect id="hr-site" value={v.site_id} onChange={(x) => setV((s) => ({ ...s, site_id: x, batch_id: '', crop_cycle_id: '', production_unit_id: '', store_id: '' }))} />
        </Field>
        <Field label="Area" htmlFor="hr-area">
          <Select id="hr-area" value={v.production_type} disabled={type === 'water_quality' || type === 'pest_disease'} onChange={(e) => setV((s) => ({ ...s, production_type: e.target.value, batch_id: '', crop_cycle_id: '' }))}>
            <option value="poultry">Poultry</option>
            <option value="fish">Fish</option>
            <option value="crop">Crops</option>
            <option value="general">Whole farm</option>
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        {animal ? (
          <Field label="Batch" htmlFor="hr-batch">
            <BatchSelect id="hr-batch" siteId={v.site_id || '__none__'} type={v.production_type as 'poultry' | 'fish'} value={v.batch_id ?? ''} onChange={(x) => set('batch_id', x)} />
          </Field>
        ) : v.production_type === 'crop' ? (
          <Field label="Crop cycle" htmlFor="hr-cycle">
            <CropCycleSelect id="hr-cycle" siteId={v.site_id || '__none__'} value={v.crop_cycle_id ?? ''} onChange={(x) => set('crop_cycle_id', x)} />
          </Field>
        ) : (
          <div />
        )}
        <Field label="House, pond or field" htmlFor="hr-unit">
          <Select id="hr-unit" value={v.production_unit_id ?? ''} onChange={(e) => set('production_unit_id', e.target.value)}>
            <option value="">Not specific</option>
            {pUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>

      {usesStock ? (
        <>
          <FieldRow>
            <Field label="Product from stock" htmlFor="hr-item" hint="Choosing stock deducts it from the store">
              <ItemSelect id="hr-item" placeholder="Not from stock" excludeFeed value={v.inventory_item_id ?? ''} onChange={(x) => setV((s) => ({ ...s, inventory_item_id: x, unit_id: items.find((i) => i.id === x)?.base_unit_id ?? '' }))} />
            </Field>
            {!v.inventory_item_id ? (
              <Field label="Product name" htmlFor="hr-product">
                <Input id="hr-product" maxLength={120} value={v.product_name ?? ''} onChange={(e) => set('product_name', e.target.value)} />
              </Field>
            ) : (
              <Field label="From store" htmlFor="hr-store" required>
                <StoreSelect id="hr-store" siteId={v.site_id || '__none__'} value={v.store_id ?? ''} onChange={(x) => set('store_id', x)} />
              </Field>
            )}
          </FieldRow>
          {v.inventory_item_id ? (
            <FieldRow>
              {num('quantity', 'Quantity used')}
              <Field label="Unit" htmlFor="hr-qunit">
                <UnitSelect id="hr-qunit" dimension={itemDim} value={v.unit_id ?? ''} onChange={(x) => set('unit_id', x)} />
              </Field>
            </FieldRow>
          ) : null}
          <FieldRow>
            <Field label="Dose" htmlFor="hr-dose">
              <Input id="hr-dose" maxLength={120} value={v.dose ?? ''} onChange={(e) => set('dose', e.target.value)} placeholder="e.g. 1 g per litre for 5 days" />
            </Field>
            <Field label="Given by" htmlFor="hr-route">
              <Select id="hr-route" value={v.route ?? ''} onChange={(e) => set('route', e.target.value)}>
                <option value="">Not recorded</option>
                {ROUTES.map((r) => (
                  <option key={r} value={r}>
                    {ROUTE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
          <FieldRow>
            {num('withdrawal_days', type === 'pest_disease' ? 'Pre-harvest interval (days)' : 'Withdrawal period (days)', { step: '1', hint: 'Sales from this batch or crop are blocked until it ends' })}
            <Field label={type === 'vaccination' ? 'Booster due' : 'Follow-up due'} htmlFor="hr-next">
              <Input id="hr-next" type="date" min={v.record_date} value={v.next_due_on ?? ''} onChange={(e) => set('next_due_on', e.target.value)} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Administered by" htmlFor="hr-by">
              <Input id="hr-by" maxLength={120} value={v.administered_by ?? ''} onChange={(e) => set('administered_by', e.target.value)} />
            </Field>
            <Field label="Vet" htmlFor="hr-vet">
              <Input id="hr-vet" maxLength={120} value={v.vet_name ?? ''} onChange={(e) => set('vet_name', e.target.value)} />
            </Field>
          </FieldRow>
        </>
      ) : null}

      {type === 'incident' || type === 'pest_disease' || type === 'inspection' ? (
        <FieldRow>
          {type === 'inspection' ? (
            <Field label="Result" htmlFor="hr-outcome">
              <Select id="hr-outcome" value={v.outcome ?? ''} onChange={(e) => set('outcome', e.target.value)}>
                <option value="">Not rated</option>
                <option value="pass">Passed</option>
                <option value="needs_action">Needs action</option>
                <option value="fail">Failed</option>
              </Select>
            </Field>
          ) : (
            <Field label="Severity" htmlFor="hr-sev">
              <Select id="hr-sev" value={v.severity ?? ''} onChange={(e) => set('severity', e.target.value)}>
                <option value="">Not rated</option>
                {(Object.keys(SEVERITY) as (keyof typeof SEVERITY)[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY[s].label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {type === 'pest_disease' ? num('affected_area_pct', 'Area affected (%)') : type === 'incident' ? num('affected_count', 'Animals affected', { step: '1' }) : <div />}
        </FieldRow>
      ) : null}

      {type === 'water_quality' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {num('dissolved_oxygen_mg_l', 'Dissolved oxygen (mg/L)', { hint: 'Keep above 3' })}
          {num('ph', 'pH', { hint: '6.5 to 9' })}
          {num('ammonia_mg_l', 'Ammonia (mg/L)', { hint: 'Keep below 0.5' })}
          {num('nitrite_mg_l', 'Nitrite (mg/L)', { hint: 'Keep below 0.5' })}
          {num('water_temp_c', 'Temperature (°C)', { hint: '20 to 34' })}
        </div>
      ) : null}

      {type !== 'water_quality' && type !== 'treatment' && type !== 'vaccination' ? (
        <Field label="Action taken" htmlFor="hr-action">
          <Textarea id="hr-action" rows={2} maxLength={1000} value={v.action_taken ?? ''} onChange={(e) => set('action_taken', e.target.value)} />
        </Field>
      ) : null}
      <Field label="Notes" htmlFor="hr-notes">
        <Textarea id="hr-notes" rows={2} maxLength={2000} value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormDialog>
  )
}
