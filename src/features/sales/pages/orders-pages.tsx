import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, Download, Plus, Trash2 } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { ordersService, FULFILMENT_LABEL, type OrderLineProgress, type SalesOrderSummary } from '@/features/sales/services/orders.service'
import { salesService, paymentStatus } from '@/features/sales/services/sales.service'
import { customersService } from '@/features/customers/services/customers.service'
import { productsService } from '@/features/sales/services/products.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr, toast } from '@/shared/components/ui/misc'
import { EmptyState, ErrorState, Field, FormError, LoadingRows, Notice, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { CustomerSelect, PaymentMethodSelect, ProductSelect, SiteSelect, UnitSelect, useActiveBatches, useProducts } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { invalidateRecords, useRecord, useSave } from '@/shared/hooks/use-record'
import { useSubmissionKey } from '@/shared/hooks/use-submission-key'
import { useUnits } from '@/shared/hooks/use-reference-data'
import { formatDate, formatMoney, formatNumber, todayISO } from '@/shared/lib/format'
import { lineTotal, roundMoney } from '@/shared/lib/calc'
import { friendlyError } from '@/shared/lib/errors'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

export function OrdersPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const [period, setPeriod] = usePeriod('90d')
  const [status, setStatus] = React.useState('active')
  const [search, setSearch] = React.useState('')
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['sales-orders', activeOrgId, siteId, period, status, debounced],
    enabled: !!activeOrgId,
    queryFn: () =>
      ordersService.list(activeOrgId!, {
        siteId: siteId || undefined,
        status: status || undefined,
        search: debounced || undefined,
        // Open orders are shown whatever their date.
        from: status === 'active' ? undefined : period.from,
        to: status === 'active' ? undefined : period.to,
      }),
  })
  const rows = query.data ?? []
  const open = rows.filter((o) => o.fulfilment_status === 'open' || o.fulfilment_status === 'partially_fulfilled')
  const toDeliver = open.reduce((s, o) => s + (o.order_total - o.fulfilled_value), 0)
  const late = open.filter((o) => o.required_by && o.required_by < todayISO()).length

  const exportCsv = () =>
    downloadCsv(
      'sales-orders',
      toCsv(rows, [
        { header: 'Order', value: (o) => o.order_number },
        { header: 'Date', value: (o) => o.order_date },
        { header: 'Required by', value: (o) => o.required_by },
        { header: 'Customer', value: (o) => o.customer_name },
        { header: 'Site', value: (o) => o.site_name },
        { header: 'Value', value: (o) => o.order_total },
        { header: 'Delivered value', value: (o) => o.fulfilled_value },
        { header: 'Status', value: (o) => FULFILMENT_LABEL[o.fulfilment_status].label },
      ]),
    )

  return (
    <div>
      <PageHeader
        title="Sales orders"
        description="Orders taken now and delivered later. Nothing leaves stock until an order is delivered, which raises the invoice."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('sales.record') ? (
              <Button asChild>
                <Link to="/orders/new">
                  <Plus /> New order
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="plain" label="Open orders" value={open.length} />
        <StatCard tone="money" label="Still to deliver" value={formatMoney(roundMoney(toDeliver), currency)} hint="Value of undelivered lines" />
        <StatCard tone="plain" label="Past required date" value={late} hint={late ? 'Deliver or follow up' : 'None late'} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search order or customer" />
        <div className="w-44">
          <Select aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Open and part delivered</option>
            <option value="draft">Draft</option>
            <option value="fulfilled">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
          </Select>
        </div>
        {status !== 'active' ? <PeriodFilter value={period} onChange={setPeriod} /> : null}
      </div>
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={ClipboardList} title="No orders here" description="Take an order when a customer books produce for later." action={has('sales.record') ? <Button asChild><Link to="/orders/new">New order</Link></Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Required by</Th>
                    <Th align="right">Value</Th>
                    <Th align="right">Delivered</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((o) => {
                    const lateRow = o.required_by && o.required_by < todayISO() && (o.fulfilment_status === 'open' || o.fulfilment_status === 'partially_fulfilled')
                    return (
                      <Tr key={o.id} className={cn('cursor-pointer', o.status === 'cancelled' && 'text-muted-foreground')} onClick={() => navigate(`/orders/${o.id}`)}>
                        <Td>
                          <Link to={`/orders/${o.id}`} className="whitespace-nowrap font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {o.order_number}
                          </Link>
                          <div className="text-xs text-muted-foreground">{formatDate(o.order_date)} · {o.site_name}</div>
                        </Td>
                        <Td>{o.customer_name}</Td>
                        <Td className={cn('whitespace-nowrap', lateRow && 'font-medium text-destructive')}>{o.required_by ? formatDate(o.required_by) : '—'}</Td>
                        <Td align="right">{formatMoney(o.order_total, currency)}</Td>
                        <Td align="right">{o.fulfilled_value > 0 ? formatMoney(o.fulfilled_value, currency) : '—'}</Td>
                        <Td>
                          <Badge variant={FULFILMENT_LABEL[o.fulfilment_status].variant}>{FULFILMENT_LABEL[o.fulfilment_status].label}</Badge>
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
// New order
// ---------------------------------------------------------------------------
interface DraftOrderLine {
  uid: string
  product_id: string
  quantity: string
  unit_id: string
  unit_price: string
}

const blankLine = (): DraftOrderLine => ({ uid: crypto.randomUUID(), product_id: '', quantity: '', unit_id: '', unit_price: '' })

export function NewOrderPage() {
  const { activeOrgId } = useAuth()
  const currency = useCurrency()
  const { siteId: scopeSite } = useSiteScope()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const { key, renew } = useSubmissionKey()
  const { data: products = [] } = useProducts()
  const { data: units = [] } = useUnits()

  const [site, setSite] = React.useState(scopeSite ?? '')
  React.useEffect(() => {
    if (!site && scopeSite) setSite(scopeSite)
  }, [scopeSite, site])
  const [customer, setCustomer] = React.useState(params.get('customer') ?? '')
  const [date, setDate] = React.useState(todayISO())
  const [requiredBy, setRequiredBy] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [draft, setDraft] = React.useState(false)
  const [lines, setLines] = React.useState<DraftOrderLine[]>([blankLine()])
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const prices = useQuery({ queryKey: ['customer-prices', customer], enabled: !!customer, queryFn: () => customersService.prices(customer) })
  const availability = useQuery({ queryKey: ['product-availability', activeOrgId, site], enabled: !!activeOrgId && !!site, queryFn: () => productsService.availability(activeOrgId!, site) })

  const priceFor = (productId: string) => prices.data?.find((p) => p.product_id === productId)?.unit_price ?? products.find((p) => p.id === productId)?.default_price
  const update = (uid: string, patch: Partial<DraftOrderLine>) => setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))

  // When the customer changes, refresh untouched prices to the customer's agreed price.
  React.useEffect(() => {
    if (!prices.data) return
    setLines((ls) => ls.map((l) => (l.product_id ? { ...l, unit_price: String(priceFor(l.product_id) ?? '') } : l)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices.data])

  const total = roundMoney(lines.reduce((s, l) => s + (Number(l.quantity) > 0 ? lineTotal(Number(l.quantity), Number(l.unit_price) || 0) : 0), 0))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!customer) return setError('Choose the customer.')
    if (!site) return setError('Choose the site that will deliver the order.')
    if (requiredBy && requiredBy < date) return setError('The required date cannot be before the order date.')
    const filled = lines.filter((l) => l.product_id || l.quantity)
    if (!filled.length) return setError('Add at least one product.')
    for (const l of filled) {
      const p = products.find((x) => x.id === l.product_id)
      if (!p) return setError('Choose a product for each line.')
      if (!(Number(l.quantity) > 0)) return setError(`Enter a quantity for ${p.name}.`)
      if (p.source_kind === 'livestock' && !Number.isInteger(Number(l.quantity))) return setError(`${p.name}: whole animals only.`)
      if (l.unit_price === '' || !(Number(l.unit_price) >= 0)) return setError(`Enter a price for ${p.name}.`)
    }
    setPending(true)
    try {
      const r = await ordersService.create(key, activeOrgId!, {
        site_id: site,
        customer_id: customer,
        order_date: date,
        required_by: requiredBy,
        notes,
        confirm: !draft,
        lines: filled.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity), unit_id: l.unit_id || undefined, unit_price: Number(l.unit_price) })),
      })
      renew()
      await invalidateRecords(qc)
      toast.success(r.replayed ? 'Order was already saved' : `Order ${r.order_number} saved`)
      navigate(`/orders/${r.sales_order_id}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Sales orders
      </Link>
      <PageHeader title="New sales order" description="Book products for a customer. Stock is only deducted when you deliver." />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" htmlFor="no-cust" required hint={<Link to="/customers" className="underline">Manage customers</Link>}>
              <CustomerSelect id="no-cust" value={customer} onChange={setCustomer} />
            </Field>
            <Field label="Delivering site" htmlFor="no-site" required>
              <SiteSelect id="no-site" value={site} onChange={setSite} />
            </Field>
            <Field label="Order date" htmlFor="no-date" required>
              <Input id="no-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Required by" htmlFor="no-req">
              <Input id="no-req" type="date" min={date} value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
          </CardHeader>
          <div className="space-y-3 px-5 pb-5">
            {!products.length ? <Notice>Add products first, under Sales and customers › Products.</Notice> : null}
            {lines.map((l, idx) => {
              const p = products.find((x) => x.id === l.product_id)
              const avail = p ? availability.data?.get(p.id) : undefined
              const unitRow = units.find((u) => u.id === (l.unit_id || p?.unit_id))
              return (
                <div key={l.uid} className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto] md:items-end">
                  <Field
                    label="Product"
                    htmlFor={`ol-p-${idx}`}
                    className="col-span-2 md:col-span-1"
                    hint={p && p.source_kind !== 'other' && site ? `${formatNumber(avail ?? 0, 2)} ${p.unit?.symbol ?? ''} available now` : undefined}
                  >
                    <ProductSelect
                      id={`ol-p-${idx}`}
                      value={l.product_id}
                      onChange={(v) => {
                        const np = products.find((x) => x.id === v)
                        update(l.uid, { product_id: v, unit_id: np?.unit_id ?? '', unit_price: String(priceFor(v) ?? '') })
                      }}
                    />
                  </Field>
                  <Field label="Quantity" htmlFor={`ol-q-${idx}`}>
                    <Input id={`ol-q-${idx}`} type="number" step={p?.source_kind === 'livestock' ? 1 : 'any'} min={0} value={l.quantity} onChange={(e) => update(l.uid, { quantity: e.target.value })} />
                  </Field>
                  <Field label="Unit" htmlFor={`ol-u-${idx}`}>
                    {p?.source_kind === 'livestock' ? (
                      <Input id={`ol-u-${idx}`} value="Per head" disabled />
                    ) : (
                      <UnitSelect id={`ol-u-${idx}`} placeholder="Unit" dimension={unitRow?.dimension} value={l.unit_id} onChange={(v) => {
                        const from = units.find((u) => u.id === p?.unit_id)
                        const to = units.find((u) => u.id === v)
                        const base = priceFor(l.product_id)
                        // Scale the standard price to the chosen unit (e.g. per crate → per piece).
                        update(l.uid, { unit_id: v, unit_price: from && to && base !== undefined ? String(roundMoney((base * to.to_base) / from.to_base)) : l.unit_price })
                      }} />
                    )}
                  </Field>
                  <Field label={`Price (${currency})`} htmlFor={`ol-pr-${idx}`}>
                    <Input id={`ol-pr-${idx}`} type="number" step="0.01" min={0} value={l.unit_price} onChange={(e) => update(l.uid, { unit_price: e.target.value })} />
                  </Field>
                  <Button variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))}>
                    <Trash2 />
                  </Button>
                </div>
              )
            })}
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])} disabled={lines.length >= 50}>
              <Plus /> Add another product
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3 md:max-w-md md:flex-1">
              <Field label="Notes" htmlFor="no-notes">
                <Textarea id="no-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions" />
              </Field>
              <Checkbox label="Save as draft" description="A draft is not ready to deliver until you confirm it." checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            </div>
            <dl className="min-w-[14rem] rounded-lg border bg-muted/50 p-4 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Order value</dt>
                <dd className="text-lg font-semibold tabular">{formatMoney(total, currency)}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-4 space-y-3">
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate('/orders')} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Save order
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Order detail and delivery
// ---------------------------------------------------------------------------
export function OrderDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['sales-order', id], queryFn: () => ordersService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Order not found" />
  return <OrderDetail order={query.data} />
}

function OrderDetail({ order }: { order: SalesOrderSummary }) {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [delivering, setDelivering] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const lines = useQuery({ queryKey: ['sales-order-lines', order.id], queryFn: () => ordersService.lines(order.id) })
  const invoices = useQuery({ queryKey: ['sales', activeOrgId, 'order', order.id], queryFn: async () => (await salesService.list(activeOrgId!, { customerId: order.customer_id })).filter((s) => s.sales_order_id === order.id) })
  const confirm = useSave(() => ordersService.setStatus(order.id, 'confirmed'), { success: 'Order confirmed' })
  const cancel = useSave((reason: string) => ordersService.setStatus(order.id, 'cancelled', reason), { success: 'Order cancelled' })
  const st = FULFILMENT_LABEL[order.fulfilment_status]
  const canDeliver = has('sales.record') && order.status === 'confirmed' && order.fulfilment_status !== 'fulfilled'

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/orders" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Sales orders
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {order.order_number}
            <Badge variant={st.variant}>{st.label}</Badge>
          </span>
        }
        description={
          <>
            <Link to={`/customers/${order.customer_id}`} className="hover:underline">
              {order.customer_name}
            </Link>
            {` · ${formatDate(order.order_date)} · ${order.site_name}`}
            {order.required_by ? ` · needed by ${formatDate(order.required_by)}` : ''}
          </>
        }
        actions={
          <>
            {has('sales.record') && order.status === 'draft' ? (
              <Button variant="outline" onClick={() => confirm.mutate(undefined)} loading={confirm.isPending}>
                Confirm order
              </Button>
            ) : null}
            {has('sales.record') && order.status !== 'cancelled' && order.fulfilment_status !== 'fulfilled' ? (
              <Button variant="outline" onClick={() => setCancelling(true)}>
                Cancel order
              </Button>
            ) : null}
            {canDeliver ? <Button onClick={() => setDelivering(true)}>Deliver and invoice</Button> : null}
          </>
        }
      />
      {order.status === 'cancelled' ? <Notice tone="warning" className="mb-4">Cancelled: {order.cancel_reason}. Invoices already raised are not affected.</Notice> : null}
      {order.status === 'draft' ? <Notice className="mb-4">This order is a draft. Confirm it when the customer agrees, then deliver.</Notice> : null}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="money" label="Order value" value={formatMoney(order.order_total, currency)} />
        <StatCard tone="money" label="Delivered and invoiced" value={formatMoney(order.fulfilled_value, currency)} />
        <StatCard tone="plain" label="Still to deliver" value={formatMoney(roundMoney(Math.max(0, order.order_total - order.fulfilled_value)), currency)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <QueryState query={lines}>
          {(rows) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th align="right">Ordered</Th>
                    <Th align="right">Delivered</Th>
                    <Th align="right">Remaining</Th>
                    <Th align="right">Price</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <Tr key={l.id}>
                      <Td>{l.description}</Td>
                      <Td align="right">{formatNumber(l.quantity, 3)} {l.unit_symbol}</Td>
                      <Td align="right">{formatNumber(l.fulfilled_quantity, 3)}</Td>
                      <Td align="right" className={cn(l.remaining_quantity > 0 && 'font-medium')}>{formatNumber(l.remaining_quantity, 3)}</Td>
                      <Td align="right">{formatMoney(l.unit_price, currency)}</Td>
                      <Td align="right" className="font-medium">{formatMoney(l.line_total, currency)}</Td>
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
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <QueryState query={invoices} empty={<CardContent><p className="text-sm text-muted-foreground">Nothing delivered yet. Each delivery raises an invoice.</p></CardContent>}>
          {(list) => (
            <TableWrap>
              <Table>
                <tbody>
                  {list.map((s) => {
                    const ps = paymentStatus(s)
                    return (
                      <Tr key={s.id} className={cn('cursor-pointer', s.status === 'voided' && 'text-muted-foreground')} onClick={() => navigate(`/sales/${s.id}`)}>
                        <Td className="whitespace-nowrap font-medium">{s.invoice_number}</Td>
                        <Td>{formatDate(s.sale_date)}</Td>
                        <Td align="right" className={cn(s.status === 'voided' && 'line-through')}>{formatMoney(s.total_amount, currency)}</Td>
                        <Td>
                          <Badge variant={ps.variant}>{ps.label}</Badge>
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
      {lines.data ? <DeliverDialog open={delivering} onOpenChange={setDelivering} order={order} lines={lines.data} /> : null}
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this order?"
        description="Remaining lines will not be delivered. Invoices already raised stay as they are; void them separately if needed."
        confirmLabel="Cancel order"
        onConfirm={(reason) => cancel.mutateAsync(reason)}
      />
    </div>
  )
}

function DeliverDialog({ open, onOpenChange, order, lines }: { open: boolean; onOpenChange: (o: boolean) => void; order: SalesOrderSummary; lines: OrderLineProgress[] }) {
  const currency = useCurrency()
  const navigate = useNavigate()
  const pendingLines = lines.filter((l) => l.remaining_quantity > 0)
  const { data: batches = [] } = useActiveBatches(order.site_id)
  const [date, setDate] = React.useState(todayISO())
  const [qty, setQty] = React.useState<Record<string, string>>({})
  const [batch, setBatch] = React.useState<Record<string, string>>({})
  const [paid, setPaid] = React.useState('')
  const [method, setMethod] = React.useState('cash')
  const [reference, setReference] = React.useState('')
  const [localError, setLocalError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    setDate(todayISO())
    setQty(Object.fromEntries(pendingLines.map((l) => [l.id, String(l.remaining_quantity)])))
    setBatch({})
    setPaid('')
    setReference('')
    setLocalError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const total = roundMoney(pendingLines.reduce((s, l) => s + lineTotal(Number(qty[l.id]) || 0, l.unit_price), 0))
  const deliver = useRecord(
    (key, v: Parameters<typeof ordersService.fulfil>[1]) => ordersService.fulfil(key, v),
    {
      success: (r) => `Invoice ${r.invoice_number} raised for ${formatMoney(r.total, currency)}`,
      onSuccess: (r) => {
        onOpenChange(false)
        navigate(`/sales/${r.sale_id}`)
      },
    },
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    const chosen = pendingLines.filter((l) => Number(qty[l.id]) > 0)
    if (!chosen.length) return setLocalError('Enter a quantity for at least one line.')
    for (const l of chosen) {
      const q = Number(qty[l.id])
      if (q > l.remaining_quantity + 1e-9) return setLocalError(`Only ${formatNumber(l.remaining_quantity, 3)} remains on ${l.description}.`)
      if (l.source_kind === 'livestock') {
        if (!Number.isInteger(q)) return setLocalError(`${l.description}: whole animals only.`)
        if (!batch[l.id]) return setLocalError(`Choose the batch for ${l.description}.`)
      }
    }
    const amount = Number(paid) || 0
    if (amount < 0 || amount > total) return setLocalError(`Amount paid must be between 0 and ${formatMoney(total, currency)}.`)
    deliver.mutate({
      order_id: order.id,
      date,
      lines: chosen.map((l) => ({ order_line_id: l.id, quantity: Number(qty[l.id]), batch_id: l.source_kind === 'livestock' ? batch[l.id] : undefined })),
      amount_received: amount,
      payment_method: method,
      reference,
    })
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Deliver ${order.order_number}`}
      description="Deducts the delivered quantities and raises one invoice. Produce is taken from the oldest available records on this site."
      submitLabel="Deliver and invoice"
      size="lg"
      pending={deliver.isPending}
      error={localError ? new Error(localError) : deliver.error}
      onSubmit={submit}
      footerExtra={<span className="font-medium text-foreground">Invoice {formatMoney(total, currency)}</span>}
    >
      <Field label="Delivery date" htmlFor="dl-date" required>
        <Input id="dl-date" type="date" min={order.order_date} max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-48" />
      </Field>
      <div className="space-y-2">
        {pendingLines.map((l) => {
          const options = batches.filter((b) => l.match_name && b.species.toLowerCase() === l.match_name.toLowerCase())
          return (
            <div key={l.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end">
              <div className="text-sm">
                <p className="font-medium">{l.description}</p>
                <p className="text-muted-foreground">
                  {formatNumber(l.remaining_quantity, 3)} {l.unit_symbol} to deliver · {formatMoney(l.unit_price, currency)} each
                </p>
                {l.source_kind === 'livestock' ? (
                  <div className="mt-2">
                    <Select aria-label={`Batch for ${l.description}`} value={batch[l.id] ?? ''} onChange={(e) => setBatch((b) => ({ ...b, [l.id]: e.target.value }))}>
                      <option value="">{options.length ? 'Choose the batch' : `No active ${l.match_name} batches on this site`}</option>
                      {options.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} · {formatNumber(b.current_population)} {b.count_basis === 'estimated' ? '(est.)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </div>
              <Field label={`Deliver (${l.unit_symbol})`} htmlFor={`dl-q-${l.id}`}>
                <Input id={`dl-q-${l.id}`} type="number" step="any" min={0} max={l.remaining_quantity} value={qty[l.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))} />
              </Field>
            </div>
          )
        })}
      </div>
      <FieldRow>
        <Field label="Paid now" htmlFor="dl-paid" hint="Leave blank if the customer pays later">
          <Input id="dl-paid" type="number" step="0.01" min={0} max={total} value={paid} onChange={(e) => setPaid(e.target.value)} />
        </Field>
        {Number(paid) > 0 ? (
          <Field label="Received by" htmlFor="dl-method">
            <PaymentMethodSelect id="dl-method" value={method} onChange={setMethod} />
          </Field>
        ) : null}
      </FieldRow>
      {Number(paid) > 0 ? (
        <Field label="Payment reference" htmlFor="dl-ref">
          <Input id="dl-ref" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      ) : null}
    </FormDialog>
  )
}
