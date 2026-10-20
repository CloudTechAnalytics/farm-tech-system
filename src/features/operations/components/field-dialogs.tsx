import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { Field } from '@/shared/components/common'
import { Input, Select, Textarea, Checkbox } from '@/shared/components/ui/input'
import {
  BatchSelect,
  CategorySelect,
  CropCycleSelect,
  ItemSelect,
  MemberSelect,
  SiteSelect,
  StoreSelect,
  UnitSelect,
  useItems,
  useOpenCropCycles,
} from '@/shared/components/pickers'
import { useRecord } from '@/shared/hooks/use-record'
import { useSiteScope } from '@/shared/context/site-scope'
import { useStores, useUnits } from '@/shared/hooks/use-reference-data'
import { useAuth } from '@/features/auth/context/auth-provider'
import { productionService } from '@/features/production/services/production.service'
import { inventoryService } from '@/features/inventory/services/inventory.service'
import { activityService } from '@/features/activity/services/activity.service'
import { LEDGER_ACTIVITY_CODES } from '@/features/settings/services/reference.service'
import { dateField, nonNegativeNumber, optionalPositive, optionalText, positiveNumber, requiredId, requiredText } from '@/shared/lib/validation'
import { formatNumber, todayISO } from '@/shared/lib/format'

export interface CycleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cycleId?: string
}

// ---------------------------------------------------------------------------
// Crop harvest
// ---------------------------------------------------------------------------
const cropHarvestSchema = z
  .object({
    cycle_id: requiredId('a crop cycle'),
    date: dateField(),
    product: optionalText(80),
    quantity: positiveNumber('Quantity harvested'),
    unit_id: requiredId('a unit'),
    rejected: nonNegativeNumber('Rejected'),
    grade: optionalText(40),
    destination: optionalText(120),
    notes: optionalText(1000),
    responsible: z.string().optional(),
    mark_harvested: z.boolean(),
  })
  .refine((v) => (v.rejected ?? 0) <= v.quantity, { path: ['rejected'], message: 'Cannot reject more than was harvested' })

export function CropHarvestDialog({ open, onOpenChange, cycleId }: CycleDialogProps) {
  const { siteId } = useSiteScope()
  const { data: units = [] } = useUnits()
  const kgId = units.find((u) => u.code === 'kg' && !u.organization_id)?.id ?? ''
  const { data: cycles = [] } = useOpenCropCycles(cycleId ? undefined : siteId || undefined)
  const form = useForm<z.input<typeof cropHarvestSchema>>({ resolver: zodResolver(cropHarvestSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({ cycle_id: cycleId ?? '', date: todayISO(), product: '', unit_id: kgId, rejected: 0, grade: '', destination: '', notes: '', responsible: '', mark_harvested: false, quantity: undefined })
  }, [open, cycleId, kgId, form])
  const cycle = cycles.find((c) => c.id === form.watch('cycle_id'))
  const mutation = useRecord(
    (key, v: z.output<typeof cropHarvestSchema>) =>
      productionService.recordCropHarvest(key, { ...v, cycle_id: v.cycle_id, rejected: v.rejected ?? 0, product: v.product || undefined }),
    { success: 'Harvest saved', onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record crop harvest"
      description={cycle ? `${cycle.code} · ${cycle.crop} on ${cycle.production_unit_name} (${formatNumber(cycle.area)} ${cycle.area_unit_symbol})` : undefined}
      submitLabel="Save harvest"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof cropHarvestSchema>))}
    >
      {!cycleId ? (
        <Field label="Crop cycle" htmlFor="ch-cycle" error={errors.cycle_id?.message} required>
          <Controller control={form.control} name="cycle_id" render={({ field }) => <CropCycleSelect id="ch-cycle" activeOnly siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Quantity harvested" htmlFor="ch-qty" error={errors.quantity?.message} required>
          <Input id="ch-qty" type="number" step="any" min={0} autoFocus {...form.register('quantity')} />
        </Field>
        <Field label="Unit" htmlFor="ch-unit" error={errors.unit_id?.message} required hint="Use kg or tonnes to see yield per hectare">
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="ch-unit" dimensions={['mass', 'count', 'volume']} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Rejected / lost at harvest" htmlFor="ch-rej" error={errors.rejected?.message} hint="Same unit">
          <Input id="ch-rej" type="number" step="any" min={0} {...form.register('rejected')} />
        </Field>
        <Field label="Date" htmlFor="ch-date" error={errors.date?.message} required>
          <Input id="ch-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Product" htmlFor="ch-prod" hint={cycle ? `Defaults to ${cycle.crop}` : undefined}>
          <Input id="ch-prod" maxLength={80} placeholder={cycle?.crop} {...form.register('product')} />
        </Field>
        <Field label="Grade" htmlFor="ch-grade">
          <Input id="ch-grade" maxLength={40} {...form.register('grade')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Destination" htmlFor="ch-dest" hint="Store, market, buyer…">
          <Input id="ch-dest" maxLength={120} {...form.register('destination')} />
        </Field>
        <Field label="Harvested by" htmlFor="ch-resp">
          <Controller control={form.control} name="responsible" render={({ field }) => <MemberSelect id="ch-resp" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <Controller
        control={form.control}
        name="mark_harvested"
        render={({ field }) => (
          <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label="Harvest is complete for this cycle" description="Marks the cycle as harvested. More harvests can still be added." />
        )}
      />
      <Field label="Notes" htmlFor="ch-notes">
        <Textarea id="ch-notes" rows={2} maxLength={1000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Inputs applied to a crop cycle (fertilizer, pesticide, seed)
// ---------------------------------------------------------------------------
const inputSchema = z.object({
  cycle_id: requiredId('a crop cycle'),
  activity_code: z.enum(['fertilizer', 'pesticide', 'planting', 'irrigation', 'input_application']),
  store_id: requiredId('a store'),
  item_id: requiredId('an item'),
  quantity: positiveNumber('Quantity'),
  unit_id: requiredId('a unit'),
  date: dateField(),
  reason: optionalText(500),
})

export function InputUseDialog({ open, onOpenChange, cycleId }: CycleDialogProps) {
  const { siteId } = useSiteScope()
  const { data: cycles = [] } = useOpenCropCycles(cycleId ? undefined : siteId || undefined)
  const { data: items = [] } = useItems()
  const { data: units = [] } = useUnits()
  const form = useForm<z.input<typeof inputSchema>>({ resolver: zodResolver(inputSchema) })
  React.useEffect(() => {
    if (open) form.reset({ cycle_id: cycleId ?? '', activity_code: 'fertilizer', store_id: '', item_id: '', unit_id: '', date: todayISO(), reason: '', quantity: undefined })
  }, [open, cycleId, form])
  const cycle = cycles.find((c) => c.id === form.watch('cycle_id'))
  const { data: stores = [] } = useStores(cycle?.site_id)
  const item = items.find((i) => i.id === form.watch('item_id'))
  const baseUnit = units.find((u) => u.id === item?.base_unit_id)
  React.useEffect(() => {
    if (cycle && !form.getValues('store_id')) {
      const def = stores.find((s) => s.is_default) ?? stores[0]
      if (def) form.setValue('store_id', def.id)
    }
  }, [cycle, stores, form])
  React.useEffect(() => {
    if (item) form.setValue('unit_id', item.base_unit_id)
  }, [item, form])

  const mutation = useRecord(
    (key, v: z.output<typeof inputSchema>) =>
      inventoryService.use(key, { store_id: v.store_id, item_id: v.item_id, quantity: v.quantity, unit_id: v.unit_id, date: v.date, crop_cycle_id: v.cycle_id, activity_code: v.activity_code, reason: v.reason }),
    { success: (r) => `Saved. ${formatNumber(r.balance, 3)} ${baseUnit?.symbol ?? ''} left in store.`, onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record input applied"
      description="Takes the input out of the store and records it against the crop cycle."
      submitLabel="Save"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof inputSchema>))}
    >
      {!cycleId ? (
        <Field label="Crop cycle" htmlFor="iu-cycle" error={errors.cycle_id?.message} required>
          <Controller control={form.control} name="cycle_id" render={({ field }) => <CropCycleSelect id="iu-cycle" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Activity" htmlFor="iu-act" required>
          <Select id="iu-act" {...form.register('activity_code')}>
            <option value="fertilizer">Fertilizer application</option>
            <option value="pesticide">Pesticide / herbicide</option>
            <option value="planting">Seed / seedlings planted</option>
            <option value="irrigation">Irrigation (fuel, water)</option>
            <option value="input_application">Other input</option>
          </Select>
        </Field>
        <Field label="From store" htmlFor="iu-store" error={errors.store_id?.message} required>
          <Controller control={form.control} name="store_id" render={({ field }) => <StoreSelect id="iu-store" siteId={cycle?.site_id ?? '__none__'} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <Field label="Item" htmlFor="iu-item" error={errors.item_id?.message} required>
        <Controller control={form.control} name="item_id" render={({ field }) => <ItemSelect id="iu-item" excludeFeed value={field.value} onChange={field.onChange} />} />
      </Field>
      <FieldRow>
        <Field label="Quantity" htmlFor="iu-qty" error={errors.quantity?.message} required>
          <Input id="iu-qty" type="number" step="any" min={0} {...form.register('quantity')} />
        </Field>
        <Field label="Unit" htmlFor="iu-unit" error={errors.unit_id?.message} required>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="iu-unit" dimension={baseUnit?.dimension} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Date" htmlFor="iu-date" error={errors.date?.message} required>
          <Input id="iu-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field label="Notes" htmlFor="iu-notes" hint="Rate, method, weather">
          <Input id="iu-notes" maxLength={500} {...form.register('reason')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Manual daily log entry
// ---------------------------------------------------------------------------
const activitySchema = z.object({
  site_id: requiredId('a farm site'),
  production_type: z.enum(['poultry', 'fish', 'crop', 'general']),
  category_id: requiredId('an activity'),
  summary: requiredText('What was done', 300),
  batch_id: z.string().optional(),
  crop_cycle_id: z.string().optional(),
  quantity: optionalPositive('Quantity'),
  unit_id: z.string().optional(),
  date: dateField(),
  time: z.string().optional(),
  responsible_id: z.string().optional(),
  notes: optionalText(),
})

export function ActivityDialog({
  open,
  onOpenChange,
  batchId,
  cycleId,
  productionType,
  siteId: fixedSite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  batchId?: string
  cycleId?: string
  productionType?: 'poultry' | 'fish' | 'crop' | 'general'
  siteId?: string
}) {
  const { activeOrgId } = useAuth()
  const { siteId: scopeSite } = useSiteScope()
  const form = useForm<z.input<typeof activitySchema>>({ resolver: zodResolver(activitySchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        site_id: fixedSite ?? scopeSite ?? '',
        production_type: productionType ?? 'general',
        category_id: '',
        summary: '',
        batch_id: batchId ?? '',
        crop_cycle_id: cycleId ?? '',
        unit_id: '',
        date: todayISO(),
        time: '',
        responsible_id: '',
        notes: '',
        quantity: undefined,
      })
  }, [open, fixedSite, scopeSite, productionType, batchId, cycleId, form])
  const type = form.watch('production_type')
  const site = form.watch('site_id')
  const qty = form.watch('quantity')

  const mutation = useRecord(
    (key, v: z.output<typeof activitySchema>) =>
      activityService.log(key, activeOrgId!, {
        ...v,
        batch_id: v.batch_id || undefined,
        crop_cycle_id: v.crop_cycle_id || undefined,
        unit_id: v.unit_id || undefined,
        quantity: v.quantity ?? null,
      }),
    { success: 'Added to the daily log', onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add to daily log"
      description="Vaccinations, treatments, cleaning, labour, field observations. Mortality, feed, eggs and harvests have their own forms so balances stay correct."
      submitLabel="Add entry"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => {
        if (v.quantity && !v.unit_id) {
          form.setError('unit_id', { message: 'Choose a unit for the quantity' })
          return
        }
        mutation.mutate(v as z.output<typeof activitySchema>)
      })}
    >
      <FieldRow>
        {!fixedSite ? (
          <Field label="Farm site" htmlFor="ac-site" error={errors.site_id?.message} required>
            <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="ac-site" value={field.value} onChange={field.onChange} />} />
          </Field>
        ) : null}
        {!productionType ? (
          <Field label="Area of the farm" htmlFor="ac-type" required>
            <Select id="ac-type" {...form.register('production_type')}>
              <option value="general">General</option>
              <option value="poultry">Poultry</option>
              <option value="fish">Fish</option>
              <option value="crop">Crops</option>
            </Select>
          </Field>
        ) : null}
      </FieldRow>
      <Field label="Activity" htmlFor="ac-cat" error={errors.category_id?.message} required>
        <Controller
          control={form.control}
          name="category_id"
          render={({ field }) => <CategorySelect id="ac-cat" kind="activity" productionType={type} exclude={LEDGER_ACTIVITY_CODES} value={field.value} onChange={field.onChange} />}
        />
      </Field>
      {(type === 'poultry' || type === 'fish') && !batchId ? (
        <Field label="Batch" htmlFor="ac-batch" hint="Optional">
          <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="ac-batch" type={type} siteId={site || '__none__'} value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      ) : null}
      {type === 'crop' && !cycleId ? (
        <Field label="Crop cycle" htmlFor="ac-cycle" hint="Optional">
          <Controller control={form.control} name="crop_cycle_id" render={({ field }) => <CropCycleSelect id="ac-cycle" siteId={site || '__none__'} value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <Field label="What was done" htmlFor="ac-summary" error={errors.summary?.message} required>
        <Input id="ac-summary" maxLength={300} placeholder="e.g. Gumboro vaccine, 2nd dose, in drinking water" {...form.register('summary')} />
      </Field>
      <FieldRow>
        <Field label="Quantity" htmlFor="ac-qty" error={errors.quantity?.message} hint="Optional: birds treated, hours, litres…">
          <Input id="ac-qty" type="number" step="any" min={0} {...form.register('quantity')} />
        </Field>
        <Field label="Unit" htmlFor="ac-unit" error={errors.unit_id?.message}>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="ac-unit" placeholder={qty ? 'Choose a unit' : '—'} value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Date" htmlFor="ac-date" error={errors.date?.message} required>
          <Input id="ac-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field label="Time" htmlFor="ac-time" hint="Optional">
          <Input id="ac-time" type="time" {...form.register('time')} />
        </Field>
      </FieldRow>
      <Field label="Done by" htmlFor="ac-resp">
        <Controller control={form.control} name="responsible_id" render={({ field }) => <MemberSelect id="ac-resp" value={field.value ?? ''} onChange={field.onChange} />} />
      </Field>
      <Field label="Notes" htmlFor="ac-notes">
        <Textarea id="ac-notes" rows={2} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}
