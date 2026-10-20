import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { Field, Notice } from '@/shared/components/common'
import { Input, Select, Textarea, Checkbox } from '@/shared/components/ui/input'
import { BatchSelect, PaymentMethodSelect, SiteSelect } from '@/shared/components/pickers'
import { useRecord, useSave } from '@/shared/hooks/use-record'
import { useSiteScope } from '@/shared/context/site-scope'
import { useProductionUnits } from '@/shared/hooks/use-reference-data'
import { useAuth } from '@/features/auth/context/auth-provider'
import { batchesService, PURPOSES, type BatchSummary, type LivestockType } from '@/features/batches/services/batches.service'
import { dateField, optionalPositive, optionalText, positiveNumber, requiredId, requiredText } from '@/shared/lib/validation'
import { formatNumber, todayISO } from '@/shared/lib/format'
import { supabase } from '@/shared/lib/supabase'

const SPECIES: Record<LivestockType, string[]> = {
  poultry: ['Chicken', 'Turkey', 'Duck', 'Guinea fowl', 'Quail'],
  fish: ['Catfish (Clarias)', 'Tilapia', 'Heterotis', 'Carp'],
}

const createSchema = z.object({
  site_id: requiredId('a farm site'),
  production_unit_id: z.string().optional(),
  code: requiredText('A batch code', 40),
  species: requiredText('The species', 60),
  breed: optionalText(80),
  purpose: requiredId('a purpose'),
  source: optionalText(120),
  start_kind: z.enum(['acquisition', 'opening']),
  start_date: dateField('Start date'),
  initial_quantity: positiveNumber('Starting number', { integer: true, max: 10_000_000 }),
  initial_avg_weight_g: optionalPositive('Average weight'),
  count_basis: z.enum(['counted', 'estimated']),
  expects_daily_records: z.boolean(),
  purchase_amount: optionalPositive('Purchase cost'),
  payment_method: z.string().optional(),
  notes: optionalText(),
})

export function CreateBatchDialog({ open, onOpenChange, type }: { open: boolean; onOpenChange: (o: boolean) => void; type: LivestockType }) {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const form = useForm<z.input<typeof createSchema>>({ resolver: zodResolver(createSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        site_id: siteId ?? '',
        production_unit_id: '',
        code: `${type === 'fish' ? 'FB' : 'PB'}-${new Date().toISOString().slice(2, 7).replace('-', '')}-`,
        species: type === 'fish' ? 'Catfish (Clarias)' : 'Chicken',
        breed: '',
        purpose: type === 'fish' ? 'table_fish' : 'layers',
        source: '',
        start_kind: 'acquisition',
        start_date: todayISO(),
        count_basis: type === 'fish' ? 'estimated' : 'counted',
        expects_daily_records: true,
        payment_method: 'cash',
        notes: '',
        initial_quantity: undefined,
        initial_avg_weight_g: undefined,
        purchase_amount: undefined,
      })
  }, [open, type, siteId, form])
  const site = form.watch('site_id')
  const { data: units = [] } = useProductionUnits(site || '__none__', type)
  const startKind = form.watch('start_kind')
  const purchase = Number(form.watch('purchase_amount'))

  const mutation = useRecord(
    (key, v: z.output<typeof createSchema>) =>
      batchesService.create(key, activeOrgId!, {
        ...v,
        production_type: type,
        production_unit_id: v.production_unit_id || undefined,
        initial_avg_weight_g: v.initial_avg_weight_g ?? null,
        purchase_amount: v.start_kind === 'acquisition' ? (v.purchase_amount ?? null) : null,
      }),
    {
      success: type === 'fish' ? 'Fish batch started' : 'Flock started',
      onSuccess: (id) => {
        onOpenChange(false)
        navigate(`/${type}/${id}`)
      },
    },
  )
  const { errors } = form.formState
  const noun = type === 'fish' ? 'fish' : 'birds'
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={type === 'fish' ? 'Start a fish batch' : 'Start a flock'}
      description={type === 'fish' ? 'Fish numbers are tracked as estimates unless every fish was counted.' : 'The starting count is the first entry in the population ledger.'}
      submitLabel={type === 'fish' ? 'Start batch' : 'Start flock'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof createSchema>))}
    >
      <FieldRow>
        <Field label="Farm site" htmlFor="cb-site" error={errors.site_id?.message} required>
          <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="cb-site" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('production_unit_id', '') }} />} />
        </Field>
        <Field label={type === 'fish' ? 'Pond / tank' : 'House / pen'} htmlFor="cb-unit" hint={units.length ? undefined : 'Add units on the farm site page'}>
          <Controller
            control={form.control}
            name="production_unit_id"
            render={({ field }) => (
              <Select id="cb-unit" value={field.value} onChange={field.onChange}>
                <option value="">Not assigned</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Batch code" htmlFor="cb-code" error={errors.code?.message} required hint="Short and unique, e.g. PB-2610-A">
          <Input id="cb-code" maxLength={40} className="uppercase" {...form.register('code')} />
        </Field>
        <Field label="Purpose" htmlFor="cb-purpose" required>
          <Select id="cb-purpose" {...form.register('purpose')}>
            {PURPOSES[type].map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Species" htmlFor="cb-species" error={errors.species?.message} required>
          <Input id="cb-species" list="cb-species-list" maxLength={60} {...form.register('species')} />
          <datalist id="cb-species-list">
            {SPECIES[type].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label={type === 'fish' ? 'Strain' : 'Breed / strain'} htmlFor="cb-breed" hint={type === 'poultry' ? 'e.g. Isa Brown, Arbor Acres' : undefined}>
          <Input id="cb-breed" maxLength={80} {...form.register('breed')} />
        </Field>
      </FieldRow>
      <Field label="How are you starting this record?" htmlFor="cb-kind">
        <Select id="cb-kind" {...form.register('start_kind')}>
          <option value="acquisition">New {noun} arriving (purchase or hatch)</option>
          <option value="opening">{type === 'fish' ? 'Fish already in the pond' : 'Birds already on the farm'} (opening count)</option>
        </Select>
      </Field>
      <FieldRow>
        <Field label={startKind === 'opening' ? `Number of ${noun} now` : `Number of ${noun}`} htmlFor="cb-qty" error={errors.initial_quantity?.message} required>
          <Input id="cb-qty" type="number" inputMode="numeric" min={1} step={1} {...form.register('initial_quantity')} />
        </Field>
        <Field label={startKind === 'opening' ? 'Count date' : 'Arrival date'} htmlFor="cb-date" error={errors.start_date?.message} required>
          <Input id="cb-date" type="date" max={todayISO()} {...form.register('start_date')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Count basis" htmlFor="cb-basis" hint={type === 'fish' ? 'Fish are usually estimated' : undefined}>
          <Select id="cb-basis" {...form.register('count_basis')}>
            <option value="counted">Counted</option>
            <option value="estimated">Estimated</option>
          </Select>
        </Field>
        <Field label="Average weight at start (g)" htmlFor="cb-weight" error={errors.initial_avg_weight_g?.message}>
          <Input id="cb-weight" type="number" step="any" min={0} {...form.register('initial_avg_weight_g')} />
        </Field>
      </FieldRow>
      {startKind === 'acquisition' ? (
        <FieldRow>
          <Field label="Supplier / hatchery" htmlFor="cb-source">
            <Input id="cb-source" maxLength={120} {...form.register('source')} />
          </Field>
          {has('finance.record') ? (
            <Field label="Purchase cost" htmlFor="cb-cost" error={errors.purchase_amount?.message} hint="Optional. Recorded as an expense on this batch.">
              <Input id="cb-cost" type="number" step="0.01" min={0} {...form.register('purchase_amount')} />
            </Field>
          ) : null}
        </FieldRow>
      ) : null}
      {purchase > 0 && startKind === 'acquisition' ? (
        <Field label="Paid by" htmlFor="cb-method">
          <Controller control={form.control} name="payment_method" render={({ field }) => <PaymentMethodSelect id="cb-method" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <Controller
        control={form.control}
        name="expects_daily_records"
        render={({ field }) => (
          <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label="Expect a record every day" description="An alert is raised when nothing is logged for this batch." />
        )}
      />
      <Field label="Notes" htmlFor="cb-notes">
        <Textarea id="cb-notes" rows={2} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
const transferSchema = z.object({
  to: requiredId('the receiving batch'),
  quantity: positiveNumber('Number', { integer: true }),
  date: dateField(),
  reason: optionalText(500),
})

export function TransferBatchDialog({ open, onOpenChange, batch }: { open: boolean; onOpenChange: (o: boolean) => void; batch: BatchSummary }) {
  const form = useForm<z.input<typeof transferSchema>>({ resolver: zodResolver(transferSchema) })
  React.useEffect(() => {
    if (open) form.reset({ to: '', date: todayISO(), reason: '', quantity: undefined })
  }, [open, form])
  const mutation = useRecord((key, v: z.output<typeof transferSchema>) => batchesService.transfer(key, { from: batch.id, ...v }), {
    success: 'Transfer recorded',
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Transfer from ${batch.code}`}
      description={`${formatNumber(batch.current_population)} recorded. Both batches are updated together.`}
      submitLabel="Transfer"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof transferSchema>))}
    >
      <Field label="To batch" htmlFor="tb-to" error={errors.to?.message} required>
        <Controller
          control={form.control}
          name="to"
          render={({ field }) => <BatchSelect id="tb-to" type={batch.production_type} value={field.value} onChange={field.onChange} />}
        />
      </Field>
      <FieldRow>
        <Field label="Number" htmlFor="tb-qty" error={errors.quantity?.message} required>
          <Input id="tb-qty" type="number" inputMode="numeric" min={1} step={1} {...form.register('quantity')} />
        </Field>
        <Field label="Date" htmlFor="tb-date" error={errors.date?.message} required>
          <Input id="tb-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
      </FieldRow>
      <Field label="Reason" htmlFor="tb-reason" hint="e.g. Grading, splitting a house">
        <Input id="tb-reason" maxLength={500} {...form.register('reason')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
const closeSchema = z.object({ date: dateField('Closing date'), reason: requiredText('A reason', 500), write_off: z.boolean() })

export function CloseBatchDialog({ open, onOpenChange, batch }: { open: boolean; onOpenChange: (o: boolean) => void; batch: BatchSummary }) {
  const form = useForm<z.input<typeof closeSchema>>({ resolver: zodResolver(closeSchema) })
  React.useEffect(() => {
    if (open) form.reset({ date: todayISO(), reason: '', write_off: false })
  }, [open, form])
  const writeOff = form.watch('write_off')
  const mutation = useSave((v: z.output<typeof closeSchema>) => batchesService.close(batch.id, { date: v.date, reason: v.reason, writeOff: v.write_off }), {
    success: 'Batch closed',
    onSuccess: () => onOpenChange(false),
  })
  const remaining = batch.current_population
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Close ${batch.code}`}
      description="A closed batch stays in reports and history but accepts no new records."
      submitLabel="Close batch"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => {
        if (remaining > 0 && !v.write_off) {
          form.setError('write_off', { message: 'Confirm the write-off, or record sales, transfers or losses first' })
          return
        }
        mutation.mutate(v as z.output<typeof closeSchema>)
      })}
    >
      {batch.feed_at_batch_kg > 0 ? (
        <Notice tone="warning">{formatNumber(batch.feed_at_batch_kg, 2)} kg of issued feed is still at this batch. Record it as consumed, wasted or returned first.</Notice>
      ) : null}
      {remaining > 0 ? (
        <div className="space-y-2">
          <Notice tone="warning">
            {formatNumber(remaining)} {batch.production_type === 'fish' ? 'fish are' : 'birds are'} still recorded
            {batch.count_basis === 'estimated' ? ' (estimate)' : ''}. Record what happened to them, or write them off below.
          </Notice>
          <Controller
            control={form.control}
            name="write_off"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label={`Write off the remaining ${formatNumber(remaining)}`} description="Recorded as an adjustment with your reason." />
            )}
          />
          {errors.write_off ? <p className="text-[13px] text-destructive">{errors.write_off.message}</p> : null}
        </div>
      ) : null}
      <FieldRow>
        <Field label="Closing date" htmlFor="cl-date" error={errors.date?.message} required>
          <Input id="cl-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field label="Reason" htmlFor="cl-reason" error={errors.reason?.message} required>
          <Input id="cl-reason" maxLength={500} placeholder={writeOff ? 'e.g. End of lay, birds sold off-record' : 'e.g. All birds sold'} {...form.register('reason')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
const editSchema = z.object({ breed: optionalText(80), source: optionalText(120), production_unit_id: z.string().optional(), expects_daily_records: z.boolean(), notes: optionalText() })

export function EditBatchDialog({ open, onOpenChange, batch }: { open: boolean; onOpenChange: (o: boolean) => void; batch: BatchSummary }) {
  const form = useForm<z.input<typeof editSchema>>({ resolver: zodResolver(editSchema) })
  const { data: units = [] } = useProductionUnits(batch.site_id, batch.production_type)
  React.useEffect(() => {
    if (open)
      form.reset({ breed: batch.breed ?? '', source: batch.source ?? '', production_unit_id: batch.production_unit_id ?? '', expects_daily_records: batch.expects_daily_records, notes: batch.notes ?? '' })
  }, [open, batch, form])
  const mutation = useSave(
    async (v: z.output<typeof editSchema>) => {
      const { error } = await supabase.rpc('update_batch_details', {
        p_batch: batch.id,
        p_breed: v.breed || undefined,
        p_source: v.source || undefined,
        p_production_unit: v.production_unit_id || undefined,
        p_expects_daily_records: v.expects_daily_records,
        p_notes: v.notes ?? '',
      })
      if (error) throw error
    },
    { success: 'Batch details saved', onSuccess: () => onOpenChange(false) },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${batch.code}`}
      description="Counts and dates are corrected with adjustments, so they are not editable here."
      submitLabel="Save"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof editSchema>))}
    >
      <FieldRow>
        <Field label="Breed / strain" htmlFor="eb-breed">
          <Input id="eb-breed" maxLength={80} {...form.register('breed')} />
        </Field>
        <Field label="Supplier / source" htmlFor="eb-source">
          <Input id="eb-source" maxLength={120} {...form.register('source')} />
        </Field>
      </FieldRow>
      <Field label={batch.production_type === 'fish' ? 'Pond / tank' : 'House / pen'} htmlFor="eb-unit">
        <Select id="eb-unit" {...form.register('production_unit_id')}>
          <option value="">Not assigned</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Controller
        control={form.control}
        name="expects_daily_records"
        render={({ field }) => <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label="Expect a record every day" />}
      />
      <Field label="Notes" htmlFor="eb-notes">
        <Textarea id="eb-notes" rows={3} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}
