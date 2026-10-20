import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { Field } from '@/shared/components/common'
import { Input, Select } from '@/shared/components/ui/input'
import { BatchSelect, CategorySelect, CropCycleSelect, PaymentMethodSelect, SiteSelect } from '@/shared/components/pickers'
import { useRecord } from '@/shared/hooks/use-record'
import { useSiteScope } from '@/shared/context/site-scope'
import { useAuth } from '@/features/auth/context/auth-provider'
import { financeService } from '@/features/finance/services/finance.service'
import { dateField, money, optionalText, requiredId, requiredText } from '@/shared/lib/validation'
import { formatMoney, todayISO } from '@/shared/lib/format'

const schema = z.object({
  kind: z.enum(['income', 'expense']),
  site_id: z.string().optional(),
  category_id: requiredId('a category'),
  amount: money(),
  date: dateField(),
  description: requiredText('A description', 300),
  payment_method: z.string().optional(),
  counterparty: optionalText(120),
  reference: optionalText(80),
  production_type: z.string().optional(),
  batch_id: z.string().optional(),
  crop_cycle_id: z.string().optional(),
})

export function FinanceDialog({
  open,
  onOpenChange,
  kind = 'expense',
  batchId,
  cycleId,
  productionType,
  siteId: fixedSite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind?: 'income' | 'expense'
  batchId?: string
  cycleId?: string
  productionType?: 'poultry' | 'fish' | 'crop'
  siteId?: string
}) {
  const { activeOrgId, hasOrgWideAccess, organization } = useAuth()
  const { siteId } = useSiteScope()
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        kind,
        site_id: fixedSite ?? siteId ?? '',
        category_id: '',
        date: todayISO(),
        description: '',
        payment_method: 'cash',
        counterparty: '',
        reference: '',
        production_type: productionType ?? '',
        batch_id: batchId ?? '',
        crop_cycle_id: cycleId ?? '',
        amount: undefined,
      })
  }, [open, kind, siteId, fixedSite, productionType, batchId, cycleId, form])

  const k = form.watch('kind')
  const pt = form.watch('production_type')
  const site = form.watch('site_id')
  const amount = Number(form.watch('amount'))

  const mutation = useRecord(
    (key, v: z.output<typeof schema>) =>
      financeService.record(key, activeOrgId!, {
        ...v,
        site_id: v.site_id || undefined,
        production_type: v.production_type || undefined,
        batch_id: v.batch_id || undefined,
        crop_cycle_id: v.crop_cycle_id || undefined,
      }),
    { success: (_r, v) => `${v.kind === 'income' ? 'Income' : 'Expense'} of ${formatMoney(v.amount, organization?.currency)} recorded`, onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={k === 'income' ? 'Record income' : 'Record expense'}
      description={k === 'income' ? 'For produce sales, use Sales so the quantities sold are tracked.' : 'Money paid out for the farm.'}
      submitLabel={k === 'income' ? 'Save income' : 'Save expense'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => {
        if (!v.site_id && !hasOrgWideAccess) {
          form.setError('site_id', { message: 'Choose a farm site' })
          return
        }
        mutation.mutate(v as z.output<typeof schema>)
      })}
    >
      {!batchId && !cycleId ? (
        <Field label="Type" htmlFor="fn-kind">
          <Select id="fn-kind" {...form.register('kind')} onChange={(e) => { form.setValue('kind', e.target.value as 'income' | 'expense'); form.setValue('category_id', '') }}>
            <option value="expense">Expense (money out)</option>
            <option value="income">Income (money in)</option>
          </Select>
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Amount" htmlFor="fn-amount" error={errors.amount?.message} required hint={amount > 0 ? formatMoney(amount, organization?.currency) : organization?.currency}>
          <Input id="fn-amount" type="number" step="0.01" min={0} autoFocus {...form.register('amount')} />
        </Field>
        <Field label="Date" htmlFor="fn-date" error={errors.date?.message} required>
          <Input id="fn-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
      </FieldRow>
      <Field label="Category" htmlFor="fn-cat" error={errors.category_id?.message} required>
        <Controller control={form.control} name="category_id" render={({ field }) => <CategorySelect id="fn-cat" kind={k} value={field.value} onChange={field.onChange} />} />
      </Field>
      <Field label="Description" htmlFor="fn-desc" error={errors.description?.message} required>
        <Input id="fn-desc" maxLength={300} placeholder={k === 'expense' ? 'e.g. Vet visit and Newcastle vaccine' : 'e.g. Manure sold to neighbour'} {...form.register('description')} />
      </Field>
      <FieldRow>
        <Field label="Farm site" htmlFor="fn-site" error={errors.site_id?.message} hint={hasOrgWideAccess ? 'Leave blank for organization-wide costs' : undefined}>
          <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="fn-site" placeholder={hasOrgWideAccess ? 'Whole organization' : 'Choose a site'} value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
        <Field label={k === 'income' ? 'Received by' : 'Paid by'} htmlFor="fn-method">
          <Controller control={form.control} name="payment_method" render={({ field }) => <PaymentMethodSelect id="fn-method" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={k === 'income' ? 'From' : 'Paid to'} htmlFor="fn-party">
          <Input id="fn-party" maxLength={120} {...form.register('counterparty')} />
        </Field>
        <Field label="Receipt / reference no." htmlFor="fn-ref">
          <Input id="fn-ref" maxLength={80} {...form.register('reference')} />
        </Field>
      </FieldRow>
      {!batchId && !cycleId ? (
        <>
          <Field label="Link to production (optional)" htmlFor="fn-pt" hint="Lets reports show cost and income per batch or crop cycle">
            <Select id="fn-pt" {...form.register('production_type')}>
              <option value="">Not linked</option>
              <option value="poultry">Poultry</option>
              <option value="fish">Fish</option>
              <option value="crop">Crops</option>
              <option value="general">General farm</option>
            </Select>
          </Field>
          {pt === 'poultry' || pt === 'fish' ? (
            <Field label="Batch" htmlFor="fn-batch">
              <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="fn-batch" type={pt} siteId={site || undefined} placeholder="Whole enterprise" value={field.value ?? ''} onChange={field.onChange} />} />
            </Field>
          ) : null}
          {pt === 'crop' ? (
            <Field label="Crop cycle" htmlFor="fn-cycle">
              <Controller control={form.control} name="crop_cycle_id" render={({ field }) => <CropCycleSelect id="fn-cycle" siteId={site || undefined} placeholder="All crops" value={field.value ?? ''} onChange={field.onChange} />} />
            </Field>
          ) : null}
        </>
      ) : null}
    </FormDialog>
  )
}
