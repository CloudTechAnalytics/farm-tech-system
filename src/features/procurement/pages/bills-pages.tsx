import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Download, Plus, Receipt } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { billStatus, procurementService, type SupplierBillSummary } from '@/features/procurement/services/procurement.service'
import { PAYMENT_LABEL } from '@/features/finance/services/finance.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input, Select } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, Field, LoadingRows, Notice, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { CategorySelect, PaymentMethodSelect, SiteSelect, SupplierSelect } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { useRecord, useSave } from '@/shared/hooks/use-record'
import { dateField, money, optionalDate, requiredId, requiredText } from '@/shared/lib/validation'
import { formatDate, formatMoney, todayISO } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

export function SupplierBillsPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [period, setPeriod] = usePeriod('90d')
  const [outstanding, setOutstanding] = React.useState<'' | 'owed' | 'overdue'>('owed')
  const [search, setSearch] = React.useState('')
  const debounced = useDebounced(search)
  const adding = params.get('new') === '1'
  const query = useQuery({
    queryKey: ['supplier-bills', activeOrgId, period, outstanding, debounced],
    enabled: !!activeOrgId,
    queryFn: () =>
      procurementService.bills(activeOrgId!, {
        outstanding,
        search: debounced || undefined,
        from: outstanding ? undefined : period.from,
        to: outstanding ? undefined : period.to,
      }),
  })
  const rows = query.data ?? []
  const posted = rows.filter((b) => b.status === 'posted')
  const owed = posted.reduce((s, b) => s + b.amount_outstanding, 0)
  const overdue = posted.filter((b) => b.is_overdue).reduce((s, b) => s + b.amount_outstanding, 0)
  const exportCsv = () =>
    downloadCsv(
      'supplier-bills',
      toCsv(rows, [
        { header: 'Bill', value: (b) => b.bill_number },
        { header: 'Supplier', value: (b) => b.supplier_name },
        { header: 'Date', value: (b) => b.bill_date },
        { header: 'Due', value: (b) => b.due_date },
        { header: 'PO', value: (b) => b.po_number },
        { header: 'Category', value: (b) => b.category_name },
        { header: 'Description', value: (b) => b.description },
        { header: 'Amount', value: (b) => b.amount },
        { header: 'Paid', value: (b) => b.amount_paid },
        { header: 'Owed', value: (b) => b.amount_outstanding },
        { header: 'Status', value: (b) => billStatus(b).label },
      ]),
    )
  return (
    <div>
      <PageHeader
        title="Supplier bills"
        description="Invoices from suppliers and what is still owed. Paying a bill records the expense, once."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('finance.record') ? (
              <Button onClick={() => setParams({ new: '1' })}>
                <Plus /> Record bill
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard tone="money" label={outstanding ? 'We owe on these bills' : 'Owed on bills shown'} value={formatMoney(owed, currency)} />
        <StatCard tone="plain" label="Overdue" value={formatMoney(overdue, currency)} hint="Past the due date" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search bill, supplier, PO" />
        <div className="w-40">
          <Select aria-label="Payment" className="h-9" value={outstanding} onChange={(e) => setOutstanding(e.target.value as typeof outstanding)}>
            <option value="owed">Still owed</option>
            <option value="overdue">Overdue</option>
            <option value="">All bills</option>
          </Select>
        </div>
        {!outstanding ? <PeriodFilter value={period} onChange={setPeriod} /> : null}
      </div>
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={Receipt} title={outstanding ? 'Nothing owed to suppliers' : 'No bills in this period'} action={has('finance.record') ? <Button onClick={() => setParams({ new: '1' })}>Record a bill</Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Bill</Th>
                    <Th>Supplier</Th>
                    <Th>Due</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Owed</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((b) => {
                    const st = billStatus(b)
                    return (
                      <Tr key={b.id} className={cn('cursor-pointer', b.status === 'voided' && 'text-muted-foreground')} onClick={() => navigate(`/bills/${b.id}`)}>
                        <Td>
                          <Link to={`/bills/${b.id}`} className="whitespace-nowrap font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {b.bill_number}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(b.bill_date)}
                            {b.po_number ? ` · ${b.po_number}` : ''}
                          </div>
                        </Td>
                        <Td>{b.supplier_name}</Td>
                        <Td className={cn('whitespace-nowrap', b.is_overdue && 'font-medium text-destructive')}>{b.due_date ? formatDate(b.due_date) : '—'}</Td>
                        <Td align="right" className={cn(b.status === 'voided' && 'line-through')}>{formatMoney(b.amount, currency)}</Td>
                        <Td align="right" className="font-medium">{b.amount_outstanding > 0 ? formatMoney(b.amount_outstanding, currency) : '—'}</Td>
                        <Td>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <BillDialog
        open={adding}
        supplierId={params.get('supplier') ?? ''}
        orderId={params.get('order') ?? ''}
        onOpenChange={(o) => !o && setParams({})}
        onCreated={(id) => navigate(`/bills/${id}`, { replace: true })}
      />
    </div>
  )
}

const billSchema = z.object({
  supplier_id: requiredId('the supplier'),
  bill_number: requiredText("The supplier's invoice number", 60),
  bill_date: dateField('Bill date'),
  due_date: optionalDate,
  amount: money(),
  description: requiredText('A description', 300).refine((v) => v.length >= 2, 'Enter at least 2 characters'),
  site_id: z.string().optional(),
  order_id: z.string().optional(),
  category_id: z.string().optional(),
})

function BillDialog({ open, onOpenChange, supplierId, orderId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; supplierId: string; orderId: string; onCreated: (id: string) => void }) {
  const { activeOrgId } = useAuth()
  const form = useForm<z.input<typeof billSchema>>({ resolver: zodResolver(billSchema) })
  const supplier = form.watch('supplier_id')
  const orders = useQuery({
    queryKey: ['purchase-orders', activeOrgId, 'for-bill', supplier],
    enabled: open && !!supplier,
    queryFn: () => procurementService.orders(activeOrgId!, { supplierId: supplier }),
  })
  React.useEffect(() => {
    if (open) form.reset({ supplier_id: supplierId, bill_number: '', bill_date: todayISO(), due_date: '', amount: '' as unknown as number, description: '', site_id: '', order_id: orderId, category_id: '' })
  }, [open, supplierId, orderId, form])
  const save = useRecord(
    (key, v: z.output<typeof billSchema>) =>
      procurementService.recordBill(key, activeOrgId!, { ...v, due_date: v.due_date || undefined, site_id: v.order_id ? undefined : v.site_id, order_id: v.order_id || undefined, category_id: v.category_id || undefined }),
    { success: 'Bill recorded', onSuccess: (r) => onCreated(r.supplier_bill_id) },
  )
  const { errors } = form.formState
  const orderChosen = form.watch('order_id')
  const billable = (orders.data ?? []).filter((o) => o.status === 'issued' || o.status === 'closed')
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a supplier bill"
      description="Enter the supplier's invoice as it arrived. Nothing is counted as an expense until it is paid."
      submitLabel="Save bill"
      pending={save.isPending}
      error={save.error}
      onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof billSchema>))}
    >
      <FieldRow>
        <Field label="Supplier" htmlFor="bl-sup" error={errors.supplier_id?.message} required>
          <Controller control={form.control} name="supplier_id" render={({ field }) => <SupplierSelect id="bl-sup" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('order_id', '') }} />} />
        </Field>
        <Field label="Their invoice number" htmlFor="bl-no" error={errors.bill_number?.message} required>
          <Input id="bl-no" maxLength={60} {...form.register('bill_number')} />
        </Field>
      </FieldRow>
      <Field label="For purchase order" htmlFor="bl-po" hint="Bills on an order cannot add up to more than its value">
        <Select id="bl-po" {...form.register('order_id')}>
          <option value="">No purchase order</option>
          {billable.map((o) => (
            <option key={o.id} value={o.id}>
              {o.po_number} · {formatDate(o.order_date, 'd MMM')} · {o.order_total.toLocaleString()}
            </option>
          ))}
        </Select>
      </Field>
      <FieldRow>
        <Field label="Bill date" htmlFor="bl-date" error={errors.bill_date?.message} required>
          <Input id="bl-date" type="date" max={todayISO()} {...form.register('bill_date')} />
        </Field>
        <Field label="Due date" htmlFor="bl-due" hint="Default: the supplier's payment terms">
          <Input id="bl-due" type="date" {...form.register('due_date')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Amount" htmlFor="bl-amount" error={errors.amount?.message} required>
          <Input id="bl-amount" type="number" step="0.01" min={0} {...form.register('amount')} />
        </Field>
        <Field label="Expense category" htmlFor="bl-cat" hint="Default: feed or farm inputs">
          <Controller control={form.control} name="category_id" render={({ field }) => <CategorySelect id="bl-cat" kind="expense" placeholder="Automatic" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <Field label="Description" htmlFor="bl-desc" error={errors.description?.message} required>
        <Input id="bl-desc" maxLength={300} placeholder="e.g. 40 bags layer mash" {...form.register('description')} />
      </Field>
      {!orderChosen ? (
        <Field label="Site" htmlFor="bl-site" hint="Leave blank for an organization-wide bill">
          <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="bl-site" placeholder="Whole organization" value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      ) : null}
    </FormDialog>
  )
}

export function SupplierBillDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['supplier-bill', id], queryFn: () => procurementService.bill(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Bill not found" />
  return <BillDetail bill={query.data} />
}

const paySchema = z.object({ amount: money(), date: dateField(), method: z.string().min(1, 'Choose how it was paid'), reference: z.string().max(80).optional() })

function BillDetail({ bill }: { bill: SupplierBillSummary }) {
  const { has } = useAuth()
  const currency = useCurrency()
  const [paying, setPaying] = React.useState(false)
  const [voiding, setVoiding] = React.useState(false)
  const payments = useQuery({ queryKey: ['bill-payments', bill.id], queryFn: () => procurementService.billPayments(bill.id) })
  const form = useForm<z.input<typeof paySchema>>({ resolver: zodResolver(paySchema) })
  React.useEffect(() => {
    if (paying) form.reset({ amount: bill.amount_outstanding, date: todayISO(), method: 'bank_transfer', reference: '' })
  }, [paying, bill, form])
  const pay = useRecord((key, v: z.output<typeof paySchema>) => procurementService.payBill(key, { bill_id: bill.id, ...v }), { success: 'Payment recorded', onSuccess: () => setPaying(false) })
  const voidBill = useSave((reason: string) => procurementService.voidBill(bill.id, reason), { success: 'Bill voided' })
  const st = billStatus(bill)
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/bills" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Supplier bills
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Bill {bill.bill_number}
            <Badge variant={st.variant}>{st.label}</Badge>
          </span>
        }
        description={
          <>
            <Link to={`/suppliers/${bill.supplier_id}`} className="hover:underline">
              {bill.supplier_name}
            </Link>
            {` · ${formatDate(bill.bill_date)}`}
            {bill.due_date ? ` · due ${formatDate(bill.due_date)}` : ''}
          </>
        }
        actions={
          <>
            {bill.status === 'posted' && has('finance.reverse') && bill.amount_paid === 0 ? (
              <Button variant="outline" onClick={() => setVoiding(true)}>
                Void bill
              </Button>
            ) : null}
            {bill.status === 'posted' && bill.amount_outstanding > 0 && has('finance.record') ? <Button onClick={() => setPaying(true)}>Pay bill</Button> : null}
          </>
        }
      />
      {bill.status === 'voided' ? <Notice tone="warning" className="mb-4">Voided: {bill.void_reason}</Notice> : null}
      {bill.is_overdue ? <Notice tone="warning" className="mb-4">This bill is overdue.</Notice> : null}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="money" label="Amount" value={formatMoney(bill.amount, currency)} />
        <StatCard tone="money" label="Paid" value={formatMoney(bill.amount_paid, currency)} />
        <StatCard tone="plain" label="Owed" value={formatMoney(bill.amount_outstanding, currency)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.data?.length ? (
            <ul className="divide-y text-sm">
              {payments.data.map((p) => (
                <li key={p.id} className={cn('flex justify-between gap-3 py-2', (p.reverses_id || p.status === 'reversed') && 'text-muted-foreground')}>
                  <span>
                    {formatDate(p.txn_date)} · {p.payment_method ? PAYMENT_LABEL[p.payment_method as keyof typeof PAYMENT_LABEL] : ''}
                    {p.reference ? ` · Ref ${p.reference}` : ''}
                    {p.reverses_id ? ' · reversal' : p.status === 'reversed' ? ' · reversed' : ''}
                  </span>
                  <span className="font-medium tabular">{formatMoney(p.amount, currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing paid yet. A payment is reversed from Income & expenses if made in error.</p>
          )}
          <DefinitionList
            className="mt-4"
            items={[
              { label: 'Description', value: bill.description },
              { label: 'Expense category', value: bill.category_name },
              { label: 'Purchase order', value: bill.purchase_order_id ? <Link className="underline" to={`/purchase-orders/${bill.purchase_order_id}`}>{bill.po_number}</Link> : null },
            ]}
          />
        </CardContent>
      </Card>
      <FormDialog
        open={paying}
        onOpenChange={setPaying}
        title="Pay this bill"
        description={`${formatMoney(bill.amount_outstanding, currency)} is still owed. The payment is recorded as an expense.`}
        submitLabel="Save payment"
        size="sm"
        pending={pay.isPending}
        error={pay.error}
        onSubmit={form.handleSubmit((v) => {
          const values = v as z.output<typeof paySchema>
          if (values.amount > bill.amount_outstanding) return form.setError('amount', { message: `Only ${formatMoney(bill.amount_outstanding, currency)} is owed` })
          pay.mutate(values)
        })}
      >
        <FieldRow>
          <Field label="Amount" htmlFor="bp-amount" error={form.formState.errors.amount?.message} required>
            <Input id="bp-amount" type="number" step="0.01" min={0} {...form.register('amount')} />
          </Field>
          <Field label="Date" htmlFor="bp-date" error={form.formState.errors.date?.message} required>
            <Input id="bp-date" type="date" min={bill.bill_date} max={todayISO()} {...form.register('date')} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Paid by" htmlFor="bp-method" error={form.formState.errors.method?.message}>
            <Controller control={form.control} name="method" render={({ field }) => <PaymentMethodSelect id="bp-method" value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Reference" htmlFor="bp-ref">
            <Input id="bp-ref" maxLength={80} {...form.register('reference')} />
          </Field>
        </FieldRow>
      </FormDialog>
      <ReasonDialog open={voiding} onOpenChange={setVoiding} title="Void this bill?" description="Use this for a bill entered in error. The bill number can then be entered again." confirmLabel="Void bill" onConfirm={(reason) => voidBill.mutateAsync(reason)} />
    </div>
  )
}
