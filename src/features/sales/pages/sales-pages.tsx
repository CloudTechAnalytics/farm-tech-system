import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Download, Plus, Printer, ShoppingBasket, Trash2 } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { salesService, paymentStatus, type SaleLineInput, type SaleSummary } from '@/features/sales/services/sales.service'
import { productionService } from '@/features/production/services/production.service'
import { PAYMENT_LABEL } from '@/features/finance/services/finance.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, Field, FormError, LoadingRows, Notice, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { CustomerSelect, PaymentMethodSelect, SiteSelect, UnitSelect, useActiveBatches, useCustomerOptions } from '@/shared/components/pickers'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { useRecord } from '@/shared/hooks/use-record'
import { useUnits } from '@/shared/hooks/use-reference-data'
import { dateField, money } from '@/shared/lib/validation'
import { formatDate, formatMoney, formatNumber, todayISO } from '@/shared/lib/format'
import { convertQuantity, lineTotal, roundMoney } from '@/shared/lib/calc'
import { friendlyError } from '@/shared/lib/errors'
import { useSubmissionKey } from '@/shared/hooks/use-submission-key'
import { invalidateRecords } from '@/shared/hooks/use-record'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/shared/components/ui/misc'
import { cn } from '@/shared/lib/utils'
import { AttachmentsButton } from '@/features/attachments/components/attachments'

export function SalesPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const [period, setPeriod] = usePeriod('30d')
  const [outstanding, setOutstanding] = React.useState<'' | 'owed' | 'overdue'>('')
  const [search, setSearch] = React.useState('')
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['sales', activeOrgId, siteId, period, outstanding, debounced],
    enabled: !!activeOrgId,
    queryFn: () =>
      salesService.list(activeOrgId!, {
        siteId: siteId || undefined,
        // Money still owed is shown whatever the invoice date.
        from: outstanding ? undefined : period.from,
        to: outstanding ? undefined : period.to,
        outstandingOnly: outstanding === 'owed',
        overdueOnly: outstanding === 'overdue',
        search: debounced || undefined,
      }),
  })
  const rows = query.data ?? []
  const posted = rows.filter((s) => s.status === 'posted')
  const total = posted.reduce((s, x) => s + x.total_amount, 0)
  const received = posted.reduce((s, x) => s + x.amount_received, 0)
  const overdue = posted.filter((x) => x.is_overdue).reduce((s, x) => s + x.amount_outstanding, 0)
  const exportCsv = () =>
    downloadCsv(
      'invoices',
      toCsv(rows, [
        { header: 'Invoice', value: (s) => s.invoice_number },
        { header: 'Date', value: (s) => s.sale_date },
        { header: 'Due', value: (s) => s.due_date },
        { header: 'Customer', value: (s) => s.customer_display_name },
        { header: 'Phone', value: (s) => s.customer_phone },
        { header: 'Order', value: (s) => s.order_number },
        { header: 'Site', value: (s) => s.site_name },
        { header: 'Total', value: (s) => s.total_amount },
        { header: 'Received', value: (s) => s.amount_received },
        { header: 'Owed', value: (s) => s.amount_outstanding },
        { header: 'Status', value: (s) => paymentStatus(s).label },
      ]),
    )
  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Every sale is an invoice. Selling reduces what is available, so nothing can be sold twice; only money received counts as income."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('sales.record') ? (
              <Button asChild>
                <Link to="/sales/new">
                  <Plus /> Record sale
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoice, customer, phone" />
        <div className="w-44">
          <Select aria-label="Payment" className="h-9" value={outstanding} onChange={(e) => setOutstanding(e.target.value as typeof outstanding)}>
            <option value="">All invoices</option>
            <option value="owed">Money still owed</option>
            <option value="overdue">Overdue</option>
          </Select>
        </div>
        {!outstanding ? <PeriodFilter value={period} onChange={setPeriod} /> : null}
      </div>
      {rows.length ? (
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard tone="money" label="Invoiced" value={formatMoney(total, currency)} hint={`${posted.length} invoice${posted.length === 1 ? '' : 's'}`} />
          <StatCard tone="money" label="Received" value={formatMoney(received, currency)} />
          <StatCard tone="plain" label="Still owed by customers" value={formatMoney(roundMoney(total - received), currency)} hint="Not cash until it is paid" />
          <StatCard tone="plain" label="Overdue" value={formatMoney(overdue, currency)} hint="Past the due date" />
        </div>
      ) : null}
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={ShoppingBasket} title={debounced || outstanding ? 'No invoices match' : 'No sales in this period'} action={has('sales.record') ? <Button asChild><Link to="/sales/new">Record a sale</Link></Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Customer</Th>
                    <Th>Site</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Received</Th>
                    <Th align="right">Owed</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => {
                    const st = paymentStatus(s)
                    return (
                      <Tr key={s.id} className={cn('cursor-pointer', s.status === 'voided' && 'text-muted-foreground')} onClick={() => navigate(`/sales/${s.id}`)}>
                        <Td className="whitespace-nowrap">
                          <Link to={`/sales/${s.id}`} className="whitespace-nowrap font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {s.invoice_number}
                          </Link>
                          <div className="text-xs text-muted-foreground">{formatDate(s.sale_date)}</div>
                        </Td>
                        <Td>
                          {s.customer_display_name ?? 'Walk-in customer'}
                          <div className="text-xs text-muted-foreground">
                            {s.line_count} item{s.line_count === 1 ? '' : 's'}
                            {s.due_date && s.amount_outstanding > 0 ? ` · due ${formatDate(s.due_date, 'd MMM')}` : ''}
                          </div>
                        </Td>
                        <Td>{s.site_name}</Td>
                        <Td align="right" className={cn('font-medium', s.status === 'voided' && 'line-through')}>
                          {formatMoney(s.total_amount, currency)}
                        </Td>
                        <Td align="right">{formatMoney(s.amount_received, currency)}</Td>
                        <Td align="right">{s.amount_outstanding > 0 ? formatMoney(s.amount_outstanding, currency) : '—'}</Td>
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// New sale
// ---------------------------------------------------------------------------
interface DraftLine {
  uid: string
  line_type: 'produce' | 'livestock' | 'other'
  source: string
  description: string
  quantity: string
  unit_id: string
  unit_price: string
  weight_kg: string
}

const newLine = (): DraftLine => ({ uid: crypto.randomUUID(), line_type: 'produce', source: '', description: '', quantity: '', unit_id: '', unit_price: '', weight_kg: '' })

export function NewSalePage() {
  const { activeOrgId } = useAuth()
  const currency = useCurrency()
  const { siteId: scopeSite } = useSiteScope()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { key, renew } = useSubmissionKey()
  const { data: units = [] } = useUnits()
  const eachId = units.find((u) => u.code === 'each' && !u.organization_id)?.id ?? ''

  const [site, setSite] = React.useState(scopeSite ?? '')
  // The top-bar site loads after first render; adopt it until the user picks one here.
  React.useEffect(() => {
    if (!site && scopeSite) setSite(scopeSite)
  }, [scopeSite, site])
  const [date, setDate] = React.useState(todayISO())
  const [params] = useSearchParams()
  const [customerId, setCustomerId] = React.useState(params.get('customer') ?? '')
  const { data: customers = [] } = useCustomerOptions()
  const selectedCustomer = customers.find((c) => c.id === customerId)
  const [customer, setCustomer] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [lines, setLines] = React.useState<DraftLine[]>([newLine()])
  const [received, setReceived] = React.useState('')
  const [paidInFull, setPaidInFull] = React.useState(!params.get('customer'))
  const [method, setMethod] = React.useState('cash')
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const produce = useQuery({
    queryKey: ['production', activeOrgId, 'available', site],
    enabled: !!activeOrgId && !!site,
    queryFn: () => productionService.list(activeOrgId!, { siteId: site, availableOnly: true }),
  })
  const { data: batches = [] } = useActiveBatches(site || '__none__')

  const update = (uid: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  const total = roundMoney(lines.reduce((s, l) => s + (Number(l.quantity) > 0 && Number(l.unit_price) >= 0 ? lineTotal(Number(l.quantity), Number(l.unit_price) || 0) : 0), 0))
  const receivedAmount = paidInFull ? total : Number(received) || 0

  const lineError = (l: DraftLine): string | null => {
    const q = Number(l.quantity)
    if (!l.quantity) return null
    if (!(q > 0)) return 'Enter a quantity'
    if (l.line_type === 'produce') {
      const rec = produce.data?.find((r) => r.id === l.source)
      const unit = units.find((u) => u.id === l.unit_id)
      const recUnit = units.find((u) => u.id === rec?.unit_id)
      if (rec && unit && recUnit && unit.dimension === recUnit.dimension) {
        const inRecordUnit = convertQuantity(q, unit, recUnit)
        if (inRecordUnit > rec.available_quantity) return `Only ${formatNumber(rec.available_quantity, 2)} ${rec.unit_symbol} available`
      }
    }
    if (l.line_type === 'livestock') {
      const b = batches.find((x) => x.id === l.source)
      if (!Number.isInteger(q)) return 'Whole animals only'
      if (b && q > b.current_population) return `Only ${formatNumber(b.current_population)} in ${b.code}`
    }
    return null
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!site) return setError('Choose the farm site the sale is from.')
    const filled = lines.filter((l) => l.quantity || l.source || l.description)
    if (!filled.length) return setError('Add at least one item.')
    for (const l of filled) {
      if (l.line_type !== 'other' && !l.source) return setError('Choose what each line is selling.')
      if (l.line_type === 'other' && l.description.trim().length < 2) return setError('Describe each item sold.')
      if (!(Number(l.quantity) > 0)) return setError('Enter a quantity for each item.')
      if (!(Number(l.unit_price) >= 0) || l.unit_price === '') return setError('Enter a price for each item.')
      if (!l.unit_id) return setError('Choose a unit for each item.')
      const le = lineError(l)
      if (le) return setError(le)
    }
    if (receivedAmount > total) return setError('Amount received cannot be more than the total.')
    if (receivedAmount > 0 && !method) return setError('Choose how the money was received.')
    if (dueDate && dueDate < date) return setError('The due date cannot be before the sale date.')
    const payload: SaleLineInput[] = filled.map((l) => ({
      line_type: l.line_type,
      production_record_id: l.line_type === 'produce' ? l.source : undefined,
      batch_id: l.line_type === 'livestock' ? l.source : undefined,
      description: l.description.trim() || undefined,
      quantity: Number(l.quantity),
      unit_id: l.unit_id,
      unit_price: Number(l.unit_price),
      weight_kg: l.weight_kg ? Number(l.weight_kg) : null,
    }))
    setPending(true)
    try {
      const r = await salesService.record(key, activeOrgId!, { site_id: site, date, lines: payload, amount_received: receivedAmount, payment_method: method, customer_id: customerId, customer_name: customerId ? undefined : customer, customer_phone: customerId ? undefined : phone, due_date: receivedAmount < total ? dueDate : undefined, reference, notes })
      renew()
      await invalidateRecords(qc)
      toast.success(`Invoice ${r.invoice_number} for ${formatMoney(r.total, currency)} recorded`)
      navigate(`/sales/${r.sale_id}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/sales" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Sales
      </Link>
      <PageHeader title="Record a sale" description="Choose produce that is still available, or live animals from a batch. Quantities are deducted when you save." />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Farm site" htmlFor="ns-site" required>
              <SiteSelect id="ns-site" value={site} onChange={(v) => { setSite(v); setLines([newLine()]) }} />
            </Field>
            <Field label="Sale date" htmlFor="ns-date" required>
              <Input id="ns-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Customer" htmlFor="ns-customer" hint={selectedCustomer?.credit_limit != null ? `Credit limit ${formatMoney(selectedCustomer.credit_limit, currency)}` : undefined}>
              <CustomerSelect id="ns-customer" placeholder="Walk-in customer" value={customerId} onChange={setCustomerId} />
            </Field>
            {customerId ? (
              <Field label="Due date" htmlFor="ns-due" hint={`Default: ${selectedCustomer?.payment_terms_days ?? 0} days after the sale`}>
                <Input id="ns-due" type="date" min={date} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            ) : (
              <>
                <Field label="Walk-in name" htmlFor="ns-cust">
                  <Input id="ns-cust" maxLength={120} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Phone" htmlFor="ns-phone">
                  <Input id="ns-phone" type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items sold</CardTitle>
          </CardHeader>
          <div className="space-y-3 px-5 pb-5">
            {!site ? <Notice>Choose a site to see the produce and batches you can sell from.</Notice> : null}
            {lines.map((l, idx) => {
              const rec = produce.data?.find((r) => r.id === l.source)
              const recUnit = units.find((u) => u.id === rec?.unit_id)
              const le = lineError(l)
              return (
                <div key={l.uid} className="rounded-lg border bg-muted/20 p-3">
                  <div className="grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)]">
                    <Field label="Selling" htmlFor={`l-type-${idx}`}>
                      <Select
                        id={`l-type-${idx}`}
                        value={l.line_type}
                        onChange={(e) => update(l.uid, { line_type: e.target.value as DraftLine['line_type'], source: '', unit_id: e.target.value === 'livestock' ? eachId : '' })}
                      >
                        <option value="produce">Produce</option>
                        <option value="livestock">Live animals</option>
                        <option value="other">Other item</option>
                      </Select>
                    </Field>
                    {l.line_type === 'produce' ? (
                      <Field label="From record" htmlFor={`l-src-${idx}`}>
                        <Select
                          id={`l-src-${idx}`}
                          value={l.source}
                          onChange={(e) => {
                            const r = produce.data?.find((x) => x.id === e.target.value)
                            update(l.uid, { source: e.target.value, unit_id: r?.unit_id ?? '' })
                          }}
                        >
                          <option value="">{produce.isLoading ? 'Loading…' : produce.data?.length ? 'Choose produce' : 'No produce available on this site'}</option>
                          {produce.data?.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.product}
                              {r.grade ? ` (${r.grade})` : ''} · {r.source_code} · {formatDate(r.record_date, 'd MMM')} · {formatNumber(r.available_quantity, 2)} {r.unit_symbol} left
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : l.line_type === 'livestock' ? (
                      <Field label="From batch" htmlFor={`l-src-${idx}`}>
                        <Select id={`l-src-${idx}`} value={l.source} onChange={(e) => update(l.uid, { source: e.target.value, unit_id: eachId })}>
                          <option value="">{batches.length ? 'Choose a batch' : 'No active batches on this site'}</option>
                          {batches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code} · {b.species} · {formatNumber(b.current_population)} {b.count_basis === 'estimated' ? '(est.)' : ''}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : (
                      <Field label="Description" htmlFor={`l-desc-${idx}`}>
                        <Input id={`l-desc-${idx}`} maxLength={160} value={l.description} onChange={(e) => update(l.uid, { description: e.target.value })} placeholder="e.g. Poultry manure, 20 bags" />
                      </Field>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
                    <Field label="Quantity" htmlFor={`l-qty-${idx}`} error={le ?? undefined}>
                      <Input id={`l-qty-${idx}`} type="number" step="any" min={0} value={l.quantity} onChange={(e) => update(l.uid, { quantity: e.target.value })} />
                    </Field>
                    <Field label="Unit" htmlFor={`l-unit-${idx}`}>
                      {l.line_type === 'livestock' ? (
                        <Input id={`l-unit-${idx}`} value="Per head" disabled />
                      ) : (
                        <UnitSelect id={`l-unit-${idx}`} placeholder="Unit" dimension={recUnit?.dimension} value={l.unit_id} onChange={(v) => update(l.uid, { unit_id: v })} />
                      )}
                    </Field>
                    <Field label={`Price per unit (${currency})`} htmlFor={`l-price-${idx}`}>
                      <Input id={`l-price-${idx}`} type="number" step="0.01" min={0} value={l.unit_price} onChange={(e) => update(l.uid, { unit_price: e.target.value })} />
                    </Field>
                    {l.line_type === 'livestock' ? (
                      <Field label="Total weight (kg)" htmlFor={`l-kg-${idx}`}>
                        <Input id={`l-kg-${idx}`} type="number" step="any" min={0} value={l.weight_kg} onChange={(e) => update(l.uid, { weight_kg: e.target.value })} />
                      </Field>
                    ) : (
                      <div className="text-sm">
                        <span className="block text-muted-foreground">Line total</span>
                        <span className="font-medium tabular">{formatMoney(lineTotal(Number(l.quantity) || 0, Number(l.unit_price) || 0), currency)}</span>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              )
            })}
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])} disabled={lines.length >= 50}>
              <Plus /> Add another item
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3 md:max-w-md">
              <Checkbox label="Paid in full now" checked={paidInFull} onChange={(e) => setPaidInFull(e.target.checked)} description="Untick if the customer owes some or all of it. Only money received is counted as income." />
              {!paidInFull ? (
                <Field label="Amount received now" htmlFor="ns-received">
                  <Input id="ns-received" type="number" step="0.01" min={0} max={total} value={received} onChange={(e) => setReceived(e.target.value)} />
                </Field>
              ) : null}
              {receivedAmount > 0 ? (
                <FieldRow>
                  <Field label="Received by" htmlFor="ns-method">
                    <PaymentMethodSelect id="ns-method" value={method} onChange={setMethod} />
                  </Field>
                  <Field label="Reference" htmlFor="ns-ref">
                    <Input id="ns-ref" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                </FieldRow>
              ) : null}
              <Field label="Notes" htmlFor="ns-notes">
                <Textarea id="ns-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
            <dl className="min-w-[14rem] space-y-1 rounded-lg border bg-muted/50 p-4 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="text-lg font-semibold tabular">{formatMoney(total, currency)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Received now</dt>
                <dd className="tabular">{formatMoney(receivedAmount, currency)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Owed</dt>
                <dd className="tabular">{formatMoney(roundMoney(Math.max(0, total - receivedAmount)), currency)}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-4 space-y-3">
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate('/sales')} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Save sale
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sale detail
// ---------------------------------------------------------------------------
export function SaleDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['sale', id], queryFn: () => salesService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Sale not found" />
  return <SaleDetail sale={query.data} />
}

const paySchema = z.object({ amount: money(), date: dateField(), method: z.string().min(1, 'Choose how it was paid'), reference: z.string().max(80).optional() })

function SaleDetail({ sale }: { sale: SaleSummary }) {
  const { has } = useAuth()
  const currency = useCurrency()
  const [paying, setPaying] = React.useState(false)
  const [voiding, setVoiding] = React.useState(false)
  const lines = useQuery({ queryKey: ['sale-lines', sale.id], queryFn: () => salesService.lines(sale.id) })
  const payments = useQuery({ queryKey: ['sale-payments', sale.id], enabled: has('finance.view') || has('sales.record'), queryFn: () => salesService.payments(sale.id) })
  const st = paymentStatus(sale)
  const form = useForm<z.input<typeof paySchema>>({ resolver: zodResolver(paySchema) })
  React.useEffect(() => {
    if (paying) form.reset({ amount: sale.amount_outstanding, date: todayISO(), method: 'cash', reference: '' })
  }, [paying, sale, form])
  const pay = useRecord((key, v: z.output<typeof paySchema>) => salesService.recordPayment(key, { sale_id: sale.id, ...v }), { success: 'Payment recorded', onSuccess: () => setPaying(false) })
  const voidSale = useRecord((key, reason: string) => salesService.void(key, sale.id, reason), { success: 'Sale voided' })

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/sales" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Sales
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Invoice {sale.invoice_number}
            <Badge variant={st.variant}>{st.label}</Badge>
          </span>
        }
        description={
          <>
            {sale.customer_id ? (
              <Link to={`/customers/${sale.customer_id}`} className="hover:underline">
                {sale.customer_display_name}
              </Link>
            ) : (
              sale.customer_display_name ?? 'Walk-in customer'
            )}
            {` · ${formatDate(sale.sale_date)} · ${sale.site_name}`}
            {sale.due_date ? ` · due ${formatDate(sale.due_date)}` : ''}
            {sale.sales_order_id ? (
              <>
                {' · order '}
                <Link to={`/orders/${sale.sales_order_id}`} className="hover:underline">
                  {sale.order_number}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <AttachmentsButton entityType="sale" entityId={sale.id} siteId={sale.site_id} />
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            {sale.status === 'posted' && sale.amount_outstanding > 0 && has('sales.record') ? <Button onClick={() => setPaying(true)}>Record payment</Button> : null}
            {sale.status === 'posted' && has('finance.reverse') ? (
              <Button variant="outline" onClick={() => setVoiding(true)}>
                Void sale
              </Button>
            ) : null}
          </>
        }
      />
      {sale.is_overdue ? <Notice tone="warning" className="mb-4">This invoice is overdue: it was due on {formatDate(sale.due_date)}.</Notice> : null}
      {sale.status === 'voided' ? <Notice tone="warning" className="mb-4">Voided: {sale.void_reason}. Quantities were returned and income was reversed.</Notice> : null}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="money" label="Total" value={formatMoney(sale.total_amount, currency)} />
        <StatCard tone="money" label="Received" value={formatMoney(sale.amount_received, currency)} />
        <StatCard tone="plain" label="Owed" value={formatMoney(sale.amount_outstanding, currency)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <QueryState query={lines}>
          {(rows) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Price</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <Tr key={l.id}>
                      <Td>
                        {l.description}
                        {l.weight_kg ? <div className="text-xs text-muted-foreground">{formatNumber(l.weight_kg, 1)} kg</div> : null}
                      </Td>
                      <Td align="right">
                        {formatNumber(l.quantity, 3)} {l.unit?.symbol}
                      </Td>
                      <Td align="right">{formatMoney(l.unit_price, currency)}</Td>
                      <Td align="right" className="font-medium">
                        {formatMoney(l.line_total, currency)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.data?.length ? (
            <ul className="divide-y text-sm">
              {payments.data.map((p) => (
                <li key={p.id} className={cn('flex justify-between gap-3 py-2', p.reverses_id && 'text-muted-foreground')}>
                  <span>
                    {formatDate(p.txn_date)} · {p.payment_method ? PAYMENT_LABEL[p.payment_method] : ''}
                    {p.reference ? ` · Ref ${p.reference}` : ''}
                    {p.reverses_id ? ' · reversal' : ''}
                  </span>
                  <span className="font-medium tabular">{formatMoney(p.amount, currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No money received yet.</p>
          )}
          <DefinitionList className="mt-4" items={[{ label: 'Customer phone', value: sale.customer_phone }, { label: 'Notes', value: sale.notes }]} />
        </CardContent>
      </Card>
      <FormDialog
        open={paying}
        onOpenChange={setPaying}
        title="Record payment"
        description={`${formatMoney(sale.amount_outstanding, currency)} is still owed.`}
        submitLabel="Save payment"
        size="sm"
        pending={pay.isPending}
        error={pay.error}
        onSubmit={form.handleSubmit((v) => mutatePay(v as z.output<typeof paySchema>))}
      >
        <FieldRow>
          <Field label="Amount" htmlFor="sp-amount" error={form.formState.errors.amount?.message} required>
            <Input id="sp-amount" type="number" step="0.01" min={0} {...form.register('amount')} />
          </Field>
          <Field label="Date" htmlFor="sp-date" error={form.formState.errors.date?.message} required>
            <Input id="sp-date" type="date" max={todayISO()} {...form.register('date')} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Received by" htmlFor="sp-method" error={form.formState.errors.method?.message}>
            <Controller control={form.control} name="method" render={({ field }) => <PaymentMethodSelect id="sp-method" value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Reference" htmlFor="sp-ref">
            <Input id="sp-ref" maxLength={80} {...form.register('reference')} />
          </Field>
        </FieldRow>
      </FormDialog>
      <ReasonDialog
        open={voiding}
        onOpenChange={setVoiding}
        title="Void this sale?"
        description="Produce becomes available again, live animals return to their batch, and any income recorded is reversed. The sale stays in the history."
        confirmLabel="Void sale"
        onConfirm={(reason) => voidSale.mutateAsync(reason)}
      />
    </div>
  )

  function mutatePay(v: z.output<typeof paySchema>) {
    if (v.amount > sale.amount_outstanding) {
      form.setError('amount', { message: `Only ${formatMoney(sale.amount_outstanding, currency)} is owed` })
      return
    }
    pay.mutate(v)
  }
}
