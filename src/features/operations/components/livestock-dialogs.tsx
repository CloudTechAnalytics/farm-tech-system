import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { Field, Notice } from '@/shared/components/common'
import { Input, Select, Textarea, Checkbox } from '@/shared/components/ui/input'
import { BatchSelect, ItemSelect, MemberSelect, StoreSelect, UnitSelect, useActiveBatches, useItems } from '@/shared/components/pickers'
import { useRecord } from '@/shared/hooks/use-record'
import { useSiteScope } from '@/shared/context/site-scope'
import { useStores, useUnits } from '@/shared/hooks/use-reference-data'
import { batchesService } from '@/features/batches/services/batches.service'
import { inventoryService } from '@/features/inventory/services/inventory.service'
import { productionService } from '@/features/production/services/production.service'
import { dateField, nonNegativeNumber, optionalText, positiveNumber, requiredId } from '@/shared/lib/validation'
import { formatNumber, todayISO } from '@/shared/lib/format'
import { convertQuantity } from '@/shared/lib/calc'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  batchId?: string
  siteId?: string
}

function useBatch(batchId: string | undefined, siteId?: string) {
  const { data = [] } = useActiveBatches(siteId)
  return data.find((b) => b.id === batchId)
}

// ---------------------------------------------------------------------------
// Mortality, culls, losses, adjustments
// ---------------------------------------------------------------------------
const populationSchema = z
  .object({
    batch_id: requiredId('a batch'),
    kind: z.enum(['mortality', 'cull', 'theft_loss', 'adjustment']),
    direction: z.enum(['add', 'remove']),
    quantity: positiveNumber('Number', { integer: true }),
    date: dateField(),
    reason: optionalText(500),
    notes: optionalText(),
    responsible: z.string().optional(),
  })
  .refine((v) => !['theft_loss', 'adjustment'].includes(v.kind) || (v.reason && v.reason.trim().length > 2), {
    path: ['reason'],
    message: 'A reason is required for this change',
  })

const MORTALITY_REASONS = ['Disease suspected', 'Heat stress', 'Predator', 'Injury', 'Weak at arrival', 'Smothering', 'Water quality', 'Unknown']

export function PopulationChangeDialog({ open, onOpenChange, batchId, defaultKind = 'mortality' }: DialogProps & { defaultKind?: 'mortality' | 'cull' | 'theft_loss' | 'adjustment' }) {
  const { siteId } = useSiteScope()
  const form = useForm<z.input<typeof populationSchema>>({
    resolver: zodResolver(populationSchema),
    defaultValues: { batch_id: batchId ?? '', kind: defaultKind, direction: 'remove', date: todayISO(), reason: '', notes: '', responsible: '' },
  })
  React.useEffect(() => {
    if (open) form.reset({ batch_id: batchId ?? '', kind: defaultKind, direction: 'remove', date: todayISO(), reason: '', notes: '', responsible: '', quantity: undefined })
  }, [open, batchId, defaultKind, form])

  const kind = form.watch('kind')
  const batch = useBatch(form.watch('batch_id'), batchId ? undefined : siteId || undefined)
  const noun = batch?.production_type === 'fish' ? 'fish' : 'birds'

  const mutation = useRecord(
    (key, v: z.output<typeof populationSchema>) =>
      batchesService.recordPopulationChange(key, {
        batch_id: v.batch_id,
        kind: v.kind,
        quantity: v.kind === 'adjustment' && v.direction === 'remove' ? -v.quantity : v.quantity,
        date: v.date,
        reason: v.reason,
        notes: v.notes,
        responsible: v.responsible,
      }),
    {
      success: (r) => `Saved. ${formatNumber(r.population)} remaining.`,
      onSuccess: () => onOpenChange(false),
    },
  )

  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === 'adjustment' ? 'Adjust population count' : 'Record mortality or loss'}
      description={batch ? `${batch.code}: ${formatNumber(batch.current_population)} ${noun} recorded${batch.count_basis === 'estimated' ? ' (estimate)' : ''}` : undefined}
      submitLabel="Save"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof populationSchema>))}
    >
      {!batchId ? (
        <Field label="Batch" htmlFor="pc-batch" error={errors.batch_id?.message} required>
          <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="pc-batch" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="What happened" htmlFor="pc-kind" required>
          <Select id="pc-kind" {...form.register('kind')}>
            <option value="mortality">Died</option>
            <option value="cull">Culled</option>
            <option value="theft_loss">Lost or stolen</option>
            <option value="adjustment">Count correction</option>
          </Select>
        </Field>
        <Field label="Date" htmlFor="pc-date" error={errors.date?.message} required>
          <Input id="pc-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
      </FieldRow>
      {kind === 'adjustment' ? (
        <Field label="Correction" htmlFor="pc-dir">
          <Select id="pc-dir" {...form.register('direction')}>
            <option value="remove">Fewer than recorded (remove)</option>
            <option value="add">More than recorded (add)</option>
          </Select>
        </Field>
      ) : null}
      <Field label={`Number of ${noun}`} htmlFor="pc-qty" error={errors.quantity?.message} required>
        <Input id="pc-qty" type="number" inputMode="numeric" min={1} step={1} autoFocus {...form.register('quantity')} />
      </Field>
      <Field
        label="Reason"
        htmlFor="pc-reason"
        error={errors.reason?.message}
        required={kind === 'theft_loss' || kind === 'adjustment'}
        hint={kind === 'mortality' ? 'Optional, but it helps spot patterns.' : undefined}
      >
        <Input id="pc-reason" list="pc-reasons" maxLength={500} {...form.register('reason')} />
        <datalist id="pc-reasons">
          {MORTALITY_REASONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Field>
      <FieldRow>
        <Field label="Recorded for" htmlFor="pc-resp" hint="Who observed or handled it">
          <Controller control={form.control} name="responsible" render={({ field }) => <MemberSelect id="pc-resp" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
        <Field label="Notes" htmlFor="pc-notes">
          <Input id="pc-notes" maxLength={2000} {...form.register('notes')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Feed: issue, consume, waste, return
// ---------------------------------------------------------------------------
type FeedMode = 'fed' | 'issue' | 'consume' | 'waste' | 'return'

const FEED_MODES: { value: FeedMode; label: string; hint: string }[] = [
  { value: 'fed', label: 'Fed from store', hint: 'Takes feed from the store and records it as eaten today. Most common.' },
  { value: 'issue', label: 'Issue to house / pond', hint: 'Moves feed from the store to the batch. Record what is eaten later.' },
  { value: 'consume', label: 'Fed from feed already issued', hint: 'Uses feed already at the batch. The store is not touched again.' },
  { value: 'waste', label: 'Wasted at house / pond', hint: 'Spilled, wet or spoiled feed that was already issued.' },
  { value: 'return', label: 'Return unused feed to store', hint: 'Puts issued feed back into the store.' },
]

const feedSchema = z
  .object({
    batch_id: requiredId('a batch'),
    mode: z.enum(['fed', 'issue', 'consume', 'waste', 'return']),
    store_id: z.string().optional(),
    item_id: requiredId('the feed'),
    quantity: positiveNumber('Quantity'),
    unit_id: requiredId('a unit'),
    date: dateField(),
    notes: optionalText(500),
  })
  .refine((v) => !['fed', 'issue', 'return'].includes(v.mode) || !!v.store_id, { path: ['store_id'], message: 'Choose a store' })
  .refine((v) => v.mode !== 'waste' || (v.notes && v.notes.trim().length > 2), { path: ['notes'], message: 'Say why the feed was wasted' })

export function FeedDialog({ open, onOpenChange, batchId, defaultMode = 'fed' }: DialogProps & { defaultMode?: FeedMode }) {
  const { siteId } = useSiteScope()
  const form = useForm<z.input<typeof feedSchema>>({ resolver: zodResolver(feedSchema) })
  const { data: items = [] } = useItems()
  const { data: units = [] } = useUnits()

  React.useEffect(() => {
    if (open) form.reset({ batch_id: batchId ?? '', mode: defaultMode, store_id: '', item_id: '', unit_id: '', date: todayISO(), notes: '', quantity: undefined })
  }, [open, batchId, defaultMode, form])

  const mode = form.watch('mode') as FeedMode
  const batch = useBatch(form.watch('batch_id'), batchId ? undefined : siteId || undefined)
  const { data: stores = [] } = useStores(batch?.site_id)
  const itemId = form.watch('item_id')
  const item = items.find((i) => i.id === itemId)
  const baseUnit = units.find((u) => u.id === item?.base_unit_id)
  const unitId = form.watch('unit_id')
  const unit = units.find((u) => u.id === unitId)
  const qty = Number(form.watch('quantity'))

  // Default the store to the site's main store and the unit to the item's unit.
  React.useEffect(() => {
    if (batch && !form.getValues('store_id')) {
      const def = stores.find((s) => s.is_default) ?? stores[0]
      if (def) form.setValue('store_id', def.id)
    }
  }, [batch, stores, form])
  React.useEffect(() => {
    if (item && (!unit || unit.dimension !== baseUnit?.dimension)) form.setValue('unit_id', item.base_unit_id)
  }, [item, unit, baseUnit, form])

  const { data: feedEvents = [] } = useFeedEventsFor(form.watch('batch_id'))
  const heldAtBatch = item ? feedEvents.filter((e) => e.item_id === item.id).reduce((s, e) => s + e.quantity, 0) : 0

  const mutation = useRecord(
    async (key, v: z.output<typeof feedSchema>) => {
      if (v.mode === 'fed' || v.mode === 'issue')
        return inventoryService.issueFeed(key, { batch_id: v.batch_id, store_id: v.store_id!, item_id: v.item_id, quantity: v.quantity, unit_id: v.unit_id, date: v.date, consumed_now: v.mode === 'fed', notes: v.notes })
      if (v.mode === 'return')
        return inventoryService.returnFeed(key, { batch_id: v.batch_id, store_id: v.store_id!, item_id: v.item_id, quantity: v.quantity, unit_id: v.unit_id, date: v.date, notes: v.notes })
      return inventoryService.recordFeedUse(key, { batch_id: v.batch_id, item_id: v.item_id, kind: v.mode === 'waste' ? 'wasted' : 'consumed', quantity: v.quantity, unit_id: v.unit_id, date: v.date, notes: v.notes })
    },
    { success: 'Feed record saved', onSuccess: () => onOpenChange(false) },
  )

  const { errors } = form.formState
  const modeInfo = FEED_MODES.find((m) => m.value === mode)
  const usesStore = mode === 'fed' || mode === 'issue' || mode === 'return'
  const baseQty = unit && baseUnit && qty > 0 ? convertQuantity(qty, unit, baseUnit) : null

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record feed"
      description={batch ? `${batch.code} · ${batch.species} · ${formatNumber(batch.current_population)} ${batch.production_type === 'fish' ? 'fish (est.)' : 'birds'}` : 'Stock is deducted from the store once, when feed leaves it.'}
      submitLabel="Save feed record"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof feedSchema>))}
    >
      {!batchId ? (
        <Field label="Batch" htmlFor="fd-batch" error={errors.batch_id?.message} required>
          <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="fd-batch" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <Field label="What are you recording?" htmlFor="fd-mode" hint={modeInfo?.hint}>
        <Select id="fd-mode" {...form.register('mode')}>
          {FEED_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <FieldRow>
        <Field label="Feed" htmlFor="fd-item" error={errors.item_id?.message} required>
          <Controller control={form.control} name="item_id" render={({ field }) => <ItemSelect id="fd-item" feedOnly value={field.value} onChange={field.onChange} />} />
        </Field>
        {usesStore ? (
          <Field label={mode === 'return' ? 'Return to store' : 'From store'} htmlFor="fd-store" error={errors.store_id?.message} required>
            <Controller control={form.control} name="store_id" render={({ field }) => <StoreSelect id="fd-store" siteId={batch?.site_id ?? '__none__'} value={field.value ?? ''} onChange={field.onChange} />} />
          </Field>
        ) : (
          <Field label="Date" htmlFor="fd-date" error={errors.date?.message} required>
            <Input id="fd-date" type="date" max={todayISO()} {...form.register('date')} />
          </Field>
        )}
      </FieldRow>
      <FieldRow>
        <Field label="Quantity" htmlFor="fd-qty" error={errors.quantity?.message} required hint={baseQty !== null && unit?.id !== baseUnit?.id ? `= ${formatNumber(baseQty, 3)} ${baseUnit?.symbol}` : undefined}>
          <Input id="fd-qty" type="number" step="any" min={0} {...form.register('quantity')} />
        </Field>
        <Field label="Unit" htmlFor="fd-unit" error={errors.unit_id?.message} required>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="fd-unit" dimension={baseUnit?.dimension} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      {usesStore ? (
        <Field label="Date" htmlFor="fd-date2" error={errors.date?.message} required>
          <Input id="fd-date2" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
      ) : null}
      {item && (mode === 'consume' || mode === 'waste' || mode === 'return') ? (
        <Notice tone={heldAtBatch > 0 ? 'info' : 'warning'}>
          {heldAtBatch > 0
            ? `${formatNumber(heldAtBatch, 3)} ${baseUnit?.symbol} of ${item.name} is at this batch and not yet recorded as used.`
            : `No ${item.name} is waiting at this batch. Use "Fed from store" instead.`}
        </Notice>
      ) : null}
      <Field label={mode === 'waste' ? 'Why was it wasted?' : 'Notes'} htmlFor="fd-notes" error={errors.notes?.message} required={mode === 'waste'}>
        <Input id="fd-notes" maxLength={500} {...form.register('notes')} />
      </Field>
      {stores.length === 0 && batch && usesStore ? <Notice tone="warning">This site has no active store.</Notice> : null}
    </FormDialog>
  )
}

function useFeedEventsFor(batchId: string | undefined) {
  return useQuery({ queryKey: ['feed-events', batchId], enabled: !!batchId, queryFn: () => inventoryService.feedEvents(batchId!) })
}

// ---------------------------------------------------------------------------
// Egg collection
// ---------------------------------------------------------------------------
const eggSchema = z
  .object({
    batch_id: requiredId('a batch'),
    date: dateField(),
    quantity: positiveNumber('Eggs collected'),
    unit_id: requiredId('a unit'),
    rejected: nonNegativeNumber('Rejected'),
    grade: optionalText(40),
    notes: optionalText(),
    responsible: z.string().optional(),
  })
  .refine((v) => (v.rejected ?? 0) <= v.quantity, { path: ['rejected'], message: 'Cannot reject more than were collected' })

export function EggCollectionDialog({ open, onOpenChange, batchId }: DialogProps) {
  const { siteId } = useSiteScope()
  const { data: units = [] } = useUnits()
  const eachId = units.find((u) => u.code === 'each' && !u.organization_id)?.id ?? ''
  const form = useForm<z.input<typeof eggSchema>>({ resolver: zodResolver(eggSchema) })
  React.useEffect(() => {
    if (open) form.reset({ batch_id: batchId ?? '', date: todayISO(), unit_id: eachId, rejected: 0, grade: '', notes: '', responsible: '', quantity: undefined })
  }, [open, batchId, eachId, form])
  const batch = useBatch(form.watch('batch_id'), batchId ? undefined : siteId || undefined)

  const mutation = useRecord(
    (key, v: z.output<typeof eggSchema>) => productionService.recordEggs(key, { ...v, rejected: v.rejected ?? 0 }),
    { success: 'Egg collection saved', onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record egg collection"
      description={batch ? `${batch.code}: ${formatNumber(batch.current_population)} birds` : undefined}
      submitLabel="Save collection"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof eggSchema>))}
    >
      {!batchId ? (
        <Field label="Flock" htmlFor="eg-batch" error={errors.batch_id?.message} required>
          <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="eg-batch" type="poultry" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Eggs collected" htmlFor="eg-qty" error={errors.quantity?.message} required hint="Total, including cracked">
          <Input id="eg-qty" type="number" step="any" min={0} autoFocus {...form.register('quantity')} />
        </Field>
        <Field label="Counted in" htmlFor="eg-unit" error={errors.unit_id?.message} required>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="eg-unit" dimension="count" value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Cracked / rejected" htmlFor="eg-rej" error={errors.rejected?.message} hint="Same unit as above">
          <Input id="eg-rej" type="number" step="any" min={0} {...form.register('rejected')} />
        </Field>
        <Field label="Date" htmlFor="eg-date" error={errors.date?.message} required>
          <Input id="eg-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Grade / size" htmlFor="eg-grade">
          <Input id="eg-grade" list="egg-grades" maxLength={40} {...form.register('grade')} />
          <datalist id="egg-grades">
            {['Jumbo', 'Large', 'Medium', 'Small', 'Pullet'].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="Collected by" htmlFor="eg-resp">
          <Controller control={form.control} name="responsible" render={({ field }) => <MemberSelect id="eg-resp" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <Field label="Notes" htmlFor="eg-notes">
        <Textarea id="eg-notes" rows={2} maxLength={1000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Fish sampling
// ---------------------------------------------------------------------------
const sampleSchema = z.object({
  batch_id: requiredId('a batch'),
  date: dateField(),
  sample_size: positiveNumber('Fish sampled', { integer: true }),
  total_weight_g: positiveNumber('Total weight'),
  notes: optionalText(1000),
})

export function FishSampleDialog({ open, onOpenChange, batchId }: DialogProps) {
  const { siteId } = useSiteScope()
  const form = useForm<z.input<typeof sampleSchema>>({ resolver: zodResolver(sampleSchema) })
  React.useEffect(() => {
    if (open) form.reset({ batch_id: batchId ?? '', date: todayISO(), notes: '', sample_size: undefined, total_weight_g: undefined })
  }, [open, batchId, form])
  const size = Number(form.watch('sample_size'))
  const weight = Number(form.watch('total_weight_g'))
  const batch = useBatch(form.watch('batch_id'), batchId ? undefined : siteId || undefined)
  const avg = size > 0 && weight > 0 ? weight / size : null
  const mutation = useRecord((key, v: z.output<typeof sampleSchema>) => batchesService.recordSample(key, v), {
    success: 'Sample saved',
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record growth sample"
      description="Weigh a sample of fish together. The average is used to estimate biomass."
      submitLabel="Save sample"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof sampleSchema>))}
    >
      {!batchId ? (
        <Field label="Fish batch" htmlFor="fs-batch" error={errors.batch_id?.message} required>
          <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="fs-batch" type="fish" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Fish in sample" htmlFor="fs-size" error={errors.sample_size?.message} required>
          <Input id="fs-size" type="number" inputMode="numeric" min={1} step={1} {...form.register('sample_size')} />
        </Field>
        <Field label="Total weight (g)" htmlFor="fs-weight" error={errors.total_weight_g?.message} required>
          <Input id="fs-weight" type="number" step="any" min={0} {...form.register('total_weight_g')} />
        </Field>
      </FieldRow>
      <Field label="Date" htmlFor="fs-date" error={errors.date?.message} required>
        <Input id="fs-date" type="date" max={todayISO()} {...form.register('date')} />
      </Field>
      {avg !== null ? (
        <Notice>
          Average {formatNumber(avg, 1)} g per fish
          {batch ? `. Estimated biomass about ${formatNumber((batch.current_population * avg) / 1000, 0)} kg (from an estimated count).` : '.'}
        </Notice>
      ) : null}
      <Field label="Notes" htmlFor="fs-notes">
        <Input id="fs-notes" maxLength={1000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Fish harvest
// ---------------------------------------------------------------------------
const harvestSchema = z
  .object({
    batch_id: requiredId('a batch'),
    date: dateField(),
    head_count: positiveNumber('Number of fish', { integer: true }),
    count_is_estimate: z.boolean(),
    weight_kg: positiveNumber('Weight'),
    rejected_kg: nonNegativeNumber('Rejected weight'),
    grade: optionalText(40),
    destination: optionalText(120),
    notes: optionalText(1000),
    final: z.boolean(),
  })
  .refine((v) => (v.rejected_kg ?? 0) <= v.weight_kg, { path: ['rejected_kg'], message: 'Cannot reject more than the harvest weight' })

export function FishHarvestDialog({ open, onOpenChange, batchId }: DialogProps) {
  const { siteId } = useSiteScope()
  const form = useForm<z.input<typeof harvestSchema>>({ resolver: zodResolver(harvestSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({ batch_id: batchId ?? '', date: todayISO(), count_is_estimate: true, rejected_kg: 0, grade: '', destination: '', notes: '', final: false, head_count: undefined, weight_kg: undefined })
  }, [open, batchId, form])
  const batch = useBatch(form.watch('batch_id'), batchId ? undefined : siteId || undefined)
  const count = Number(form.watch('head_count'))
  const mutation = useRecord((key, v: z.output<typeof harvestSchema>) => productionService.recordFishHarvest(key, { ...v, rejected_kg: v.rejected_kg ?? 0 }), {
    success: (r) =>
      r.estimate_adjusted_by > 0
        ? `Harvest saved. The estimate was ${r.estimate_adjusted_by} fish low and has been corrected.`
        : r.written_off > 0
          ? `Harvest saved. ${r.written_off} fish left in the estimate were written off.`
          : 'Harvest saved',
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record fish harvest"
      description={batch ? `${batch.code}: about ${formatNumber(batch.current_population)} fish (estimated)` : undefined}
      submitLabel="Save harvest"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof harvestSchema>))}
    >
      {!batchId ? (
        <Field label="Fish batch" htmlFor="fh-batch" error={errors.batch_id?.message} required>
          <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="fh-batch" type="fish" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Total weight (kg)" htmlFor="fh-kg" error={errors.weight_kg?.message} required>
          <Input id="fh-kg" type="number" step="any" min={0} autoFocus {...form.register('weight_kg')} />
        </Field>
        <Field label="Number of fish" htmlFor="fh-count" error={errors.head_count?.message} required>
          <Input id="fh-count" type="number" inputMode="numeric" min={1} step={1} {...form.register('head_count')} />
        </Field>
      </FieldRow>
      <Controller
        control={form.control}
        name="count_is_estimate"
        render={({ field }) => (
          <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label="The number of fish is an estimate" description="Untick only if every fish was counted." />
        )}
      />
      {batch && count > batch.current_population ? (
        <Notice tone="warning">
          This is more than the {formatNumber(batch.current_population)} fish estimated. The difference will be recorded as an estimate correction.
        </Notice>
      ) : null}
      <FieldRow>
        <Field label="Rejected (kg)" htmlFor="fh-rej" error={errors.rejected_kg?.message}>
          <Input id="fh-rej" type="number" step="any" min={0} {...form.register('rejected_kg')} />
        </Field>
        <Field label="Date" htmlFor="fh-date" error={errors.date?.message} required>
          <Input id="fh-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Grade / size" htmlFor="fh-grade">
          <Input id="fh-grade" maxLength={40} {...form.register('grade')} />
        </Field>
        <Field label="Destination" htmlFor="fh-dest" hint="Market, processor, cold room…">
          <Input id="fh-dest" maxLength={120} {...form.register('destination')} />
        </Field>
      </FieldRow>
      <Controller
        control={form.control}
        name="final"
        render={({ field }) => (
          <Checkbox
            checked={field.value}
            onChange={(e) => field.onChange(e.target.checked)}
            label="This is the final harvest"
            description="Any fish still in the estimate after this harvest are written off, so the pond reads empty."
          />
        )}
      />
      <Field label="Notes" htmlFor="fh-notes">
        <Input id="fh-notes" maxLength={1000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}
