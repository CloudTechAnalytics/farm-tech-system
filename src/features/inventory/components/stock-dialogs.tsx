import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { Field, Notice } from '@/shared/components/common'
import { Input, Select, Checkbox } from '@/shared/components/ui/input'
import { CategorySelect, ItemSelect, PaymentMethodSelect, StoreSelect, UnitSelect, useItems } from '@/shared/components/pickers'
import { useRecord } from '@/shared/hooks/use-record'
import { useSiteScope } from '@/shared/context/site-scope'
import { useStores, useUnits } from '@/shared/hooks/use-reference-data'
import { useAuth } from '@/features/auth/context/auth-provider'
import { inventoryService } from '@/features/inventory/services/inventory.service'
import { dateField, nonNegativeNumber, optionalText, positiveNumber, requiredId } from '@/shared/lib/validation'
import { convertQuantity } from '@/shared/lib/calc'
import { formatMoney, formatNumber, todayISO } from '@/shared/lib/format'

export interface StockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId?: string
  storeId?: string
}

/** Item, its base unit and the chosen entry unit, plus a live conversion hint. */
function useItemUnits(itemId: string, unitId: string, qty: number) {
  const { data: items = [] } = useItems()
  const { data: units = [] } = useUnits()
  const item = items.find((i) => i.id === itemId)
  const baseUnit = units.find((u) => u.id === item?.base_unit_id)
  const unit = units.find((u) => u.id === unitId)
  const baseQty = unit && baseUnit && qty > 0 && unit.dimension === baseUnit.dimension ? convertQuantity(qty, unit, baseUnit) : null
  const hint = baseQty !== null && unit?.id !== baseUnit?.id ? `= ${formatNumber(baseQty, 3)} ${baseUnit?.symbol}` : undefined
  return { item, baseUnit, unit, baseQty, hint }
}

function useBalance(itemId: string, storeId: string) {
  const { activeOrgId } = useAuth()
  const { data = [] } = useQuery({
    queryKey: ['inventory', activeOrgId, 'balances'],
    enabled: !!activeOrgId && !!itemId && !!storeId,
    queryFn: () => inventoryService.balances(activeOrgId!),
  })
  return data.find((b) => b.item_id === itemId && b.store_id === storeId)?.quantity ?? 0
}

function useDefaultStore(form: { getValues: (k: 'store_id') => string | undefined; setValue: (k: 'store_id', v: string) => void }, open: boolean) {
  const { siteId } = useSiteScope()
  const { data: stores = [] } = useStores(siteId || undefined)
  React.useEffect(() => {
    if (open && !form.getValues('store_id') && stores.length) {
      form.setValue('store_id', (stores.find((s) => s.is_default) ?? stores[0]).id)
    }
  }, [open, stores, form])
  return siteId
}

// ---------------------------------------------------------------------------
// Receive stock: opening balance, purchase, other receipt
// ---------------------------------------------------------------------------
const receiveSchema = z
  .object({
    type: z.enum(['purchase', 'opening', 'receipt']),
    store_id: requiredId('a store'),
    item_id: requiredId('an item'),
    quantity: positiveNumber('Quantity'),
    unit_id: requiredId('a unit'),
    date: dateField(),
    total_cost: nonNegativeNumber('Cost'),
    supplier: optionalText(120),
    reference: optionalText(80),
    reason: optionalText(500),
    record_expense: z.boolean(),
    payment_method: z.string().optional(),
    expense_category_id: z.string().optional(),
  })
  .refine((v) => !v.record_expense || (v.total_cost ?? 0) > 0, { path: ['total_cost'], message: 'Enter the cost to record it as an expense' })
  .refine((v) => !v.record_expense || !!v.payment_method, { path: ['payment_method'], message: 'Choose how it was paid' })
  .refine((v) => v.type !== 'receipt' || (v.reason && v.reason.trim().length > 2), { path: ['reason'], message: 'Say where this stock came from' })

export function ReceiveStockDialog({ open, onOpenChange, itemId, storeId, defaultType = 'purchase' }: StockDialogProps & { defaultType?: 'purchase' | 'opening' | 'receipt' }) {
  const { has, organization } = useAuth()
  const canExpense = has('finance.record')
  const form = useForm<z.input<typeof receiveSchema>>({ resolver: zodResolver(receiveSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        type: defaultType,
        store_id: storeId ?? '',
        item_id: itemId ?? '',
        unit_id: '',
        date: todayISO(),
        supplier: '',
        reference: '',
        reason: '',
        record_expense: canExpense && defaultType === 'purchase',
        payment_method: 'cash',
        expense_category_id: '',
        quantity: undefined,
        total_cost: undefined,
      })
  }, [open, itemId, storeId, defaultType, canExpense, form])
  const siteId = useDefaultStore(form, open)
  const type = form.watch('type')
  const recordExpense = form.watch('record_expense')
  const { item, baseUnit, baseQty, hint } = useItemUnits(form.watch('item_id'), form.watch('unit_id'), Number(form.watch('quantity')))
  React.useEffect(() => {
    if (item && !form.getValues('unit_id')) form.setValue('unit_id', item.base_unit_id)
  }, [item, form])
  React.useEffect(() => {
    if (type !== 'purchase') form.setValue('record_expense', false)
  }, [type, form])
  const cost = Number(form.watch('total_cost'))

  const mutation = useRecord(
    (key, v: z.output<typeof receiveSchema>) =>
      inventoryService.receive(key, { ...v, total_cost: v.total_cost ?? null, expense_category_id: v.expense_category_id || undefined }),
    { success: (r) => `Stock received. Balance now ${formatNumber(r.balance, 3)} ${baseUnit?.symbol ?? ''}.`, onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Receive stock"
      description="Add stock to a store. Balances are always calculated from these movements."
      submitLabel="Save"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof receiveSchema>))}
    >
      <FieldRow>
        <Field label="Type" htmlFor="rs-type">
          <Select id="rs-type" {...form.register('type')}>
            <option value="purchase">Purchase</option>
            <option value="opening">Opening balance (first count)</option>
            <option value="receipt">Other receipt (gift, harvest kept as seed…)</option>
          </Select>
        </Field>
        <Field label="Store" htmlFor="rs-store" error={errors.store_id?.message} required>
          <Controller control={form.control} name="store_id" render={({ field }) => <StoreSelect id="rs-store" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <Field label="Item" htmlFor="rs-item" error={errors.item_id?.message} required>
        <Controller control={form.control} name="item_id" render={({ field }) => <ItemSelect id="rs-item" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('unit_id', '') }} />} />
      </Field>
      <FieldRow>
        <Field label="Quantity" htmlFor="rs-qty" error={errors.quantity?.message} required hint={hint}>
          <Input id="rs-qty" type="number" step="any" min={0} {...form.register('quantity')} />
        </Field>
        <Field label="Unit" htmlFor="rs-unit" error={errors.unit_id?.message} required>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="rs-unit" dimension={baseUnit?.dimension} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Date" htmlFor="rs-date" error={errors.date?.message} required>
          <Input id="rs-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field
          label="Total cost"
          htmlFor="rs-cost"
          error={errors.total_cost?.message}
          hint={cost > 0 && baseQty ? `${formatMoney(cost / baseQty, organization?.currency)} per ${baseUnit?.symbol}` : 'Optional for opening balances'}
        >
          <Input id="rs-cost" type="number" step="0.01" min={0} {...form.register('total_cost')} />
        </Field>
      </FieldRow>
      {type === 'purchase' ? (
        <FieldRow>
          <Field label="Supplier" htmlFor="rs-sup">
            <Input id="rs-sup" maxLength={120} {...form.register('supplier')} />
          </Field>
          <Field label="Invoice / receipt no." htmlFor="rs-ref">
            <Input id="rs-ref" maxLength={80} {...form.register('reference')} />
          </Field>
        </FieldRow>
      ) : (
        <Field label={type === 'receipt' ? 'Where did it come from?' : 'Notes'} htmlFor="rs-reason" error={errors.reason?.message} required={type === 'receipt'}>
          <Input id="rs-reason" maxLength={500} {...form.register('reason')} />
        </Field>
      )}
      {type === 'purchase' && canExpense ? (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <Controller
            control={form.control}
            name="record_expense"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label="Also record the payment as an expense" description="Saves the stock and the expense together, so neither can be missed." />
            )}
          />
          {recordExpense ? (
            <FieldRow>
              <Field label="Paid by" htmlFor="rs-method" error={errors.payment_method?.message}>
                <Controller control={form.control} name="payment_method" render={({ field }) => <PaymentMethodSelect id="rs-method" value={field.value ?? ''} onChange={field.onChange} />} />
              </Field>
              <Field label="Expense category" htmlFor="rs-cat" hint={`Defaults to ${item?.is_feed ? 'Feed' : 'Other farm inputs'}`}>
                <Controller control={form.control} name="expense_category_id" render={({ field }) => <CategorySelect id="rs-cat" kind="expense" placeholder="Default" value={field.value ?? ''} onChange={field.onChange} />} />
              </Field>
            </FieldRow>
          ) : null}
        </div>
      ) : null}
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Use or waste stock in the store
// ---------------------------------------------------------------------------
const useSchema = z.object({
  mode: z.enum(['use', 'waste']),
  store_id: requiredId('a store'),
  item_id: requiredId('an item'),
  quantity: positiveNumber('Quantity'),
  unit_id: requiredId('a unit'),
  date: dateField(),
  reason: z.string().trim().min(3, 'Describe what it was used for or why it was lost').max(500),
})

export function UseStockDialog({ open, onOpenChange, itemId, storeId, defaultMode = 'use' }: StockDialogProps & { defaultMode?: 'use' | 'waste' }) {
  const form = useForm<z.input<typeof useSchema>>({ resolver: zodResolver(useSchema) })
  React.useEffect(() => {
    if (open) form.reset({ mode: defaultMode, store_id: storeId ?? '', item_id: itemId ?? '', unit_id: '', date: todayISO(), reason: '', quantity: undefined })
  }, [open, itemId, storeId, defaultMode, form])
  const siteId = useDefaultStore(form, open)
  const mode = form.watch('mode')
  const { item, baseUnit, baseQty, hint } = useItemUnits(form.watch('item_id'), form.watch('unit_id'), Number(form.watch('quantity')))
  React.useEffect(() => {
    if (item && !form.getValues('unit_id')) form.setValue('unit_id', item.base_unit_id)
  }, [item, form])
  const balance = useBalance(form.watch('item_id'), form.watch('store_id'))

  const mutation = useRecord(
    async (key, v: z.output<typeof useSchema>) => {
      if (v.mode === 'waste') await inventoryService.waste(key, v)
      else await inventoryService.use(key, v)
    },
    { success: (_r, v) => (v.mode === 'waste' ? 'Wastage recorded' : 'Stock usage recorded'), onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'waste' ? 'Record wastage or loss' : 'Record stock used'}
      description="Packaging, fuel, consumables and general use. Feed goes through the feed form, crop inputs through the crop cycle."
      submitLabel="Save"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof useSchema>))}
    >
      <FieldRow>
        <Field label="What happened" htmlFor="us-mode">
          <Select id="us-mode" {...form.register('mode')}>
            <option value="use">Used on the farm</option>
            <option value="waste">Wasted, damaged or lost</option>
          </Select>
        </Field>
        <Field label="Store" htmlFor="us-store" error={errors.store_id?.message} required>
          <Controller control={form.control} name="store_id" render={({ field }) => <StoreSelect id="us-store" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <Field label="Item" htmlFor="us-item" error={errors.item_id?.message} required>
        <Controller
          control={form.control}
          name="item_id"
          render={({ field }) => <ItemSelect id="us-item" excludeFeed={mode === 'use'} value={field.value} onChange={(v) => { field.onChange(v); form.setValue('unit_id', '') }} />}
        />
      </Field>
      <FieldRow>
        <Field label="Quantity" htmlFor="us-qty" error={errors.quantity?.message} required hint={hint}>
          <Input id="us-qty" type="number" step="any" min={0} {...form.register('quantity')} />
        </Field>
        <Field label="Unit" htmlFor="us-unit" error={errors.unit_id?.message} required>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="us-unit" dimension={baseUnit?.dimension} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      {item ? (
        <Notice tone={baseQty !== null && baseQty > balance ? 'warning' : 'info'}>
          {formatNumber(balance, 3)} {baseUnit?.symbol} in this store.
          {baseQty !== null && baseQty > balance ? ' That is less than you entered.' : ''}
        </Notice>
      ) : null}
      <FieldRow>
        <Field label="Date" htmlFor="us-date" error={errors.date?.message} required>
          <Input id="us-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field label={mode === 'waste' ? 'Reason' : 'Used for'} htmlFor="us-reason" error={errors.reason?.message} required>
          <Input id="us-reason" maxLength={500} {...form.register('reason')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Transfer between stores (and sites)
// ---------------------------------------------------------------------------
const transferSchema = z
  .object({
    from_store: requiredId('the store it leaves'),
    to_store: requiredId('the store it goes to'),
    item_id: requiredId('an item'),
    quantity: positiveNumber('Quantity'),
    unit_id: requiredId('a unit'),
    date: dateField(),
    reason: optionalText(500),
  })
  .refine((v) => v.from_store !== v.to_store, { path: ['to_store'], message: 'Choose a different store' })

export function TransferStockDialog({ open, onOpenChange, itemId, storeId }: StockDialogProps) {
  const form = useForm<z.input<typeof transferSchema>>({ resolver: zodResolver(transferSchema) })
  React.useEffect(() => {
    if (open) form.reset({ from_store: storeId ?? '', to_store: '', item_id: itemId ?? '', unit_id: '', date: todayISO(), reason: '', quantity: undefined })
  }, [open, itemId, storeId, form])
  const from = form.watch('from_store')
  const { item, baseUnit, hint } = useItemUnits(form.watch('item_id'), form.watch('unit_id'), Number(form.watch('quantity')))
  React.useEffect(() => {
    if (item && !form.getValues('unit_id')) form.setValue('unit_id', item.base_unit_id)
  }, [item, form])
  const balance = useBalance(form.watch('item_id'), from)
  const mutation = useRecord((key, v: z.output<typeof transferSchema>) => inventoryService.transfer(key, v), {
    success: 'Transfer recorded',
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Transfer stock"
      description="Moves stock between stores, including stores on different sites. Both sides are recorded together."
      submitLabel="Transfer"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof transferSchema>))}
    >
      <Field label="Item" htmlFor="ts-item" error={errors.item_id?.message} required>
        <Controller control={form.control} name="item_id" render={({ field }) => <ItemSelect id="ts-item" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('unit_id', '') }} />} />
      </Field>
      <FieldRow>
        <Field label="From" htmlFor="ts-from" error={errors.from_store?.message} required>
          <Controller control={form.control} name="from_store" render={({ field }) => <StoreSelect id="ts-from" value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="To" htmlFor="ts-to" error={errors.to_store?.message} required>
          <Controller control={form.control} name="to_store" render={({ field }) => <StoreSelect id="ts-to" exclude={from} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Quantity" htmlFor="ts-qty" error={errors.quantity?.message} required hint={hint}>
          <Input id="ts-qty" type="number" step="any" min={0} {...form.register('quantity')} />
        </Field>
        <Field label="Unit" htmlFor="ts-unit" error={errors.unit_id?.message} required>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="ts-unit" dimension={baseUnit?.dimension} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      {item && from ? <Notice>{formatNumber(balance, 3)} {baseUnit?.symbol} available in the source store.</Notice> : null}
      <FieldRow>
        <Field label="Date" htmlFor="ts-date" error={errors.date?.message} required>
          <Input id="ts-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field label="Notes" htmlFor="ts-reason">
          <Input id="ts-reason" maxLength={500} {...form.register('reason')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Physical stock count
// ---------------------------------------------------------------------------
const countSchema = z.object({
  store_id: requiredId('a store'),
  item_id: requiredId('an item'),
  counted: z.preprocess((v) => (v === '' || v === undefined ? undefined : Number(v)), z.number({ required_error: 'Enter the quantity counted' }).min(0, 'Cannot be negative')),
  unit_id: requiredId('a unit'),
  date: dateField('Count date'),
  reason: optionalText(500),
})

export function StockCountDialog({ open, onOpenChange, itemId, storeId }: StockDialogProps) {
  const form = useForm<z.input<typeof countSchema>>({ resolver: zodResolver(countSchema) })
  React.useEffect(() => {
    if (open) form.reset({ store_id: storeId ?? '', item_id: itemId ?? '', unit_id: '', date: todayISO(), reason: '', counted: undefined })
  }, [open, itemId, storeId, form])
  const siteId = useDefaultStore(form, open)
  const { item, baseUnit, baseQty, hint } = useItemUnits(form.watch('item_id'), form.watch('unit_id'), Number(form.watch('counted')))
  React.useEffect(() => {
    if (item && !form.getValues('unit_id')) form.setValue('unit_id', item.base_unit_id)
  }, [item, form])
  const balance = useBalance(form.watch('item_id'), form.watch('store_id'))
  const counted = form.watch('counted')
  const variance = counted !== undefined && counted !== '' && baseQty !== null ? Math.round((baseQty - balance) * 10_000) / 10_000 : null
  const mutation = useRecord((key, v: z.output<typeof countSchema>) => inventoryService.count(key, v), {
    success: (r) => (r.variance === 0 ? 'Count matches the records' : `Count saved. Balance adjusted by ${formatNumber(r.variance, 3)}.`),
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Count stock"
      description="Enter what is physically on the shelf. Any difference is posted as an adjustment with your reason."
      submitLabel="Save count"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => {
        if (variance !== null && variance !== 0 && !(v.reason && v.reason.trim().length > 2)) {
          form.setError('reason', { message: 'Give a reason for the difference' })
          return
        }
        mutation.mutate(v as z.output<typeof countSchema>)
      })}
    >
      <FieldRow>
        <Field label="Store" htmlFor="sc-store" error={errors.store_id?.message} required>
          <Controller control={form.control} name="store_id" render={({ field }) => <StoreSelect id="sc-store" siteId={siteId || undefined} value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Item" htmlFor="sc-item" error={errors.item_id?.message} required>
          <Controller control={form.control} name="item_id" render={({ field }) => <ItemSelect id="sc-item" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('unit_id', '') }} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Quantity counted" htmlFor="sc-qty" error={errors.counted?.message} required hint={hint}>
          <Input id="sc-qty" type="number" step="any" min={0} {...form.register('counted')} />
        </Field>
        <Field label="Unit" htmlFor="sc-unit" error={errors.unit_id?.message} required>
          <Controller control={form.control} name="unit_id" render={({ field }) => <UnitSelect id="sc-unit" dimension={baseUnit?.dimension} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      {item ? (
        <Notice tone={variance ? 'warning' : 'info'}>
          Records show {formatNumber(balance, 3)} {baseUnit?.symbol}.
          {variance ? ` Difference: ${variance > 0 ? '+' : ''}${formatNumber(variance, 3)} ${baseUnit?.symbol}.` : ''}
        </Notice>
      ) : null}
      <FieldRow>
        <Field label="Count date" htmlFor="sc-date" error={errors.date?.message} required>
          <Input id="sc-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field label="Reason for any difference" htmlFor="sc-reason" error={errors.reason?.message}>
          <Input id="sc-reason" maxLength={500} {...form.register('reason')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}
