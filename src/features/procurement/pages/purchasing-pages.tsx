import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardCheck, Download, FileInput, Plus, Trash2 } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import {
  RECEIPT_STATUS,
  REQUEST_STATUS,
  billStatus,
  procurementService,
  type LineInput,
  type PurchaseOrderLine,
  type PurchaseOrderSummary,
  type PurchaseRequestSummary,
} from '@/features/procurement/services/procurement.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr, toast } from '@/shared/components/ui/misc'
import { EmptyState, ErrorState, Field, FormError, LoadingRows, Notice, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { ItemSelect, SiteSelect, StoreSelect, SupplierSelect, UnitSelect, useItems } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { invalidateRecords, useRecord, useSave } from '@/shared/hooks/use-record'
import { useSubmissionKey } from '@/shared/hooks/use-submission-key'
import { useStores, useUnits } from '@/shared/hooks/use-reference-data'
import { formatDate, formatMoney, formatNumber, todayISO } from '@/shared/lib/format'
import { lineTotal, roundMoney } from '@/shared/lib/calc'
import { friendlyError } from '@/shared/lib/errors'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

// ---------------------------------------------------------------------------
// Line editor shared by purchase requests and purchase orders
// ---------------------------------------------------------------------------
interface DraftLine {
  uid: string
  item_id: string
  description: string
  quantity: string
  unit_id: string
  price: string
}

const blankLine = (): DraftLine => ({ uid: crypto.randomUUID(), item_id: '', description: '', quantity: '', unit_id: '', price: '' })

function LinesEditor({ lines, setLines, priceLabel, priceRequired }: { lines: DraftLine[]; setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>; priceLabel: string; priceRequired?: boolean }) {
  const currency = useCurrency()
  const { data: items = [] } = useItems()
  const { data: units = [] } = useUnits()
  const update = (uid: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  return (
    <div className="space-y-3">
      {lines.map((l, idx) => {
        const item = items.find((i) => i.id === l.item_id)
        const dim = units.find((u) => u.id === item?.base_unit_id)?.dimension
        return (
          <div key={l.uid} className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto] md:items-end">
            <div className="col-span-2 space-y-2 md:col-span-1">
              <Field label="Stock item" htmlFor={`pl-item-${idx}`}>
                <ItemSelect
                  id={`pl-item-${idx}`}
                  placeholder="Not a stock item"
                  value={l.item_id}
                  onChange={(v) => update(l.uid, { item_id: v, unit_id: items.find((i) => i.id === v)?.base_unit_id ?? '' })}
                />
              </Field>
              {!l.item_id ? (
                <Input aria-label="Description" maxLength={160} placeholder="Describe the item or service" value={l.description} onChange={(e) => update(l.uid, { description: e.target.value })} />
              ) : null}
            </div>
            <Field label="Quantity" htmlFor={`pl-q-${idx}`}>
              <Input id={`pl-q-${idx}`} type="number" step="any" min={0} value={l.quantity} onChange={(e) => update(l.uid, { quantity: e.target.value })} />
            </Field>
            <Field label="Unit" htmlFor={`pl-u-${idx}`}>
              <UnitSelect id={`pl-u-${idx}`} placeholder="Unit" dimension={dim} value={l.unit_id} onChange={(v) => update(l.uid, { unit_id: v })} />
            </Field>
            <Field label={`${priceLabel} (${currency})`} htmlFor={`pl-p-${idx}`} hint={priceRequired ? undefined : 'Optional'}>
              <Input id={`pl-p-${idx}`} type="number" step="0.01" min={0} value={l.price} onChange={(e) => update(l.uid, { price: e.target.value })} />
            </Field>
            <Button variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))}>
              <Trash2 />
            </Button>
          </div>
        )
      })}
      <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])} disabled={lines.length >= 50}>
        <Plus /> Add another line
      </Button>
    </div>
  )
}

function validateLines(lines: DraftLine[], priceRequired: boolean): string | LineInput[] {
  const filled = lines.filter((l) => l.item_id || l.description.trim() || l.quantity)
  if (!filled.length) return 'Add at least one line.'
  for (const l of filled) {
    if (!l.item_id && l.description.trim().length < 2) return 'Choose a stock item or describe each line.'
    if (!(Number(l.quantity) > 0)) return 'Enter a quantity for each line.'
    if (!l.unit_id) return 'Choose a unit for each line.'
    if (priceRequired && (l.price === '' || !(Number(l.price) >= 0))) return 'Enter a price for each line.'
  }
  return filled.map((l) => ({
    item_id: l.item_id || undefined,
    description: l.description.trim() || undefined,
    quantity: Number(l.quantity),
    unit_id: l.unit_id,
    unit_price: l.price === '' ? undefined : Number(l.price),
    estimated_unit_cost: l.price === '' ? undefined : Number(l.price),
  }))
}

const draftTotal = (lines: DraftLine[]) => roundMoney(lines.reduce((s, l) => s + (Number(l.quantity) > 0 ? lineTotal(Number(l.quantity), Number(l.price) || 0) : 0), 0))

// ---------------------------------------------------------------------------
// Purchase requests
// ---------------------------------------------------------------------------
export function PurchaseRequestsPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const [status, setStatus] = React.useState('submitted')
  const [search, setSearch] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [open, setOpen] = React.useState<PurchaseRequestSummary | null>(null)
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['purchase-requests', activeOrgId, siteId, status, debounced],
    enabled: !!activeOrgId,
    queryFn: () => procurementService.requests(activeOrgId!, { siteId: siteId || undefined, status: status || undefined, search: debounced || undefined }),
  })
  return (
    <div>
      <PageHeader
        title="Purchase requests"
        description="Ask for inputs before buying. An approver turns approved requests into purchase orders."
        actions={
          has('procurement.request') ? (
            <Button onClick={() => setAdding(true)}>
              <Plus /> New request
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search number, reason, requester" />
        <div className="w-44">
          <Select aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="submitted">Awaiting approval</option>
            <option value="approved">Approved, not ordered</option>
            <option value="ordered">Ordered</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
          </Select>
        </div>
      </div>
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={ClipboardCheck} title="No requests here" description="Requests waiting for a decision show here first." action={has('procurement.request') ? <Button onClick={() => setAdding(true)}>New request</Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Request</Th>
                    <Th>Reason</Th>
                    <Th>Needed by</Th>
                    <Th align="right">Estimate</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <Tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                      <Td>
                        <span className="whitespace-nowrap font-medium">{r.request_number}</span>
                        <div className="text-xs text-muted-foreground">
                          {r.requested_by_name ?? '—'} · {formatDate(r.created_at, 'd MMM')} · {r.site_name}
                        </div>
                      </Td>
                      <Td className="max-w-xs truncate">{r.reason}</Td>
                      <Td className={cn('whitespace-nowrap', r.status === 'submitted' && r.needed_by && r.needed_by < todayISO() && 'font-medium text-destructive')}>
                        {r.needed_by ? formatDate(r.needed_by) : '—'}
                      </Td>
                      <Td align="right">{r.estimated_total > 0 ? formatMoney(r.estimated_total, currency) : '—'}</Td>
                      <Td>
                        <Badge variant={REQUEST_STATUS[r.status].variant}>{REQUEST_STATUS[r.status].label}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <NewRequestDialog open={adding} onOpenChange={setAdding} />
      {open ? <RequestDialog request={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

function NewRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const [site, setSite] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [neededBy, setNeededBy] = React.useState('')
  const [lines, setLines] = React.useState<DraftLine[]>([blankLine()])
  const [localError, setLocalError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    setSite(siteId ?? '')
    setReason('')
    setNeededBy('')
    setLines([blankLine()])
    setLocalError(null)
  }, [open, siteId])
  const create = useRecord((key, v: Parameters<typeof procurementService.createRequest>[2]) => procurementService.createRequest(key, activeOrgId!, v), {
    success: (r) => `Request ${r.request_number} sent for approval`,
    onSuccess: () => onOpenChange(false),
  })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!site) return setLocalError('Choose the site that needs the items.')
    if (reason.trim().length < 2) return setLocalError('Say why the purchase is needed.')
    const v = validateLines(lines, false)
    if (typeof v === 'string') return setLocalError(v)
    create.mutate({ site_id: site, reason, needed_by: neededBy, lines: v })
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New purchase request"
      size="lg"
      submitLabel="Send for approval"
      pending={create.isPending}
      error={localError ? new Error(localError) : create.error}
      onSubmit={submit}
      footerExtra={draftTotal(lines) > 0 ? `Estimate ${formatMoney(draftTotal(lines), currency)}` : undefined}
    >
      <FieldRow>
        <Field label="For site" htmlFor="pr-site" required>
          <SiteSelect id="pr-site" value={site} onChange={setSite} />
        </Field>
        <Field label="Needed by" htmlFor="pr-needed">
          <Input id="pr-needed" type="date" min={todayISO()} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
        </Field>
      </FieldRow>
      <Field label="Why it is needed" htmlFor="pr-reason" required>
        <Textarea id="pr-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Layer mash for House A, stock runs out in 5 days" />
      </Field>
      <LinesEditor lines={lines} setLines={setLines} priceLabel="Estimated price" />
    </FormDialog>
  )
}

function RequestDialog({ request, onClose }: { request: PurchaseRequestSummary; onClose: () => void }) {
  const { has, userId } = useAuth()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [rejecting, setRejecting] = React.useState(false)
  const lines = useQuery({ queryKey: ['purchase-request-lines', request.id], queryFn: () => procurementService.requestLines(request.id) })
  const decide = useSave((v: { decision: 'approved' | 'rejected' | 'cancelled'; note?: string }) => procurementService.decideRequest(request.id, v.decision, v.note), {
    success: 'Request updated',
    onSuccess: () => onClose(),
  })
  const canApprove = has('procurement.approve')
  const own = request.requested_by === userId
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${request.request_number} · ${REQUEST_STATUS[request.status].label}`}
      description={`${request.site_name} · requested by ${request.requested_by_name ?? 'unknown'} on ${formatDate(request.created_at)}${request.needed_by ? ` · needed by ${formatDate(request.needed_by)}` : ''}`}
      size="lg"
      submitLabel={canApprove && request.status === 'submitted' ? 'Approve' : request.status === 'approved' && canApprove ? 'Create purchase order' : 'Close'}
      pending={decide.isPending}
      error={decide.error}
      onSubmit={(e) => {
        e.preventDefault()
        if (canApprove && request.status === 'submitted') decide.mutate({ decision: 'approved' })
        else if (request.status === 'approved' && canApprove) navigate(`/purchase-orders/new?request=${request.id}`)
        else onClose()
      }}
      footerExtra={
        <span className="flex flex-wrap gap-2">
          {canApprove && request.status === 'submitted' ? (
            <Button variant="outline" size="sm" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          ) : null}
          {(own || canApprove) && (request.status === 'submitted' || request.status === 'approved') ? (
            <Button variant="ghost" size="sm" onClick={() => decide.mutate({ decision: 'cancelled' })}>
              Withdraw
            </Button>
          ) : null}
        </span>
      }
    >
      <p className="text-sm">{request.reason}</p>
      {request.decision_note ? <Notice tone={request.status === 'rejected' ? 'warning' : undefined}>{request.decided_by_name}: {request.decision_note}</Notice> : null}
      {request.po_number ? (
        <Notice>
          Ordered on{' '}
          <Link to={`/purchase-orders/${request.purchase_order_id}`} className="font-medium underline">
            {request.po_number}
          </Link>
          .
        </Notice>
      ) : null}
      <QueryState query={lines}>
        {(rows) => (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Estimate</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <Tr key={l.id}>
                    <Td>{l.description}</Td>
                    <Td align="right">{formatNumber(l.quantity, 3)} {l.unit?.symbol}</Td>
                    <Td align="right">{l.estimated_unit_cost !== null ? formatMoney(lineTotal(l.quantity, l.estimated_unit_cost), currency) : '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </QueryState>
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this request?"
        description="The requester sees your reason."
        confirmLabel="Reject"
        onConfirm={(note) => decide.mutateAsync({ decision: 'rejected', note })}
      />
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------
export function PurchaseOrdersPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const [period, setPeriod] = usePeriod('90d')
  const [status, setStatus] = React.useState('open')
  const [search, setSearch] = React.useState('')
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['purchase-orders', activeOrgId, siteId, period, status, debounced],
    enabled: !!activeOrgId,
    queryFn: () =>
      procurementService.orders(activeOrgId!, {
        siteId: siteId || undefined,
        status: status || undefined,
        search: debounced || undefined,
        from: status === 'open' ? undefined : period.from,
        to: status === 'open' ? undefined : period.to,
      }),
  })
  const rows = query.data ?? []
  const open = rows.filter((o) => o.receipt_status === 'awaiting' || o.receipt_status === 'partially_received')
  const late = open.filter((o) => o.expected_date && o.expected_date < todayISO()).length
  const exportCsv = () =>
    downloadCsv(
      'purchase-orders',
      toCsv(rows, [
        { header: 'PO', value: (o) => o.po_number },
        { header: 'Date', value: (o) => o.order_date },
        { header: 'Expected', value: (o) => o.expected_date },
        { header: 'Supplier', value: (o) => o.supplier_name },
        { header: 'Site', value: (o) => o.site_name },
        { header: 'Value', value: (o) => o.order_total },
        { header: 'Received value', value: (o) => o.received_value },
        { header: 'Billed', value: (o) => o.billed_amount },
        { header: 'Paid', value: (o) => o.paid_amount },
        { header: 'Status', value: (o) => RECEIPT_STATUS[o.receipt_status].label },
      ]),
    )
  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Orders placed with suppliers. Goods enter stock when they are received; the expense is recorded when the supplier's bill is paid."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('procurement.approve') ? (
              <Button asChild>
                <Link to="/purchase-orders/new">
                  <Plus /> New purchase order
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="plain" label="Awaiting delivery" value={open.length} />
        <StatCard tone="money" label="Value still to arrive" value={formatMoney(roundMoney(open.reduce((s, o) => s + o.order_total - o.received_value, 0)), currency)} />
        <StatCard tone="plain" label="Past expected date" value={late} hint={late ? 'Follow up with the supplier' : 'None late'} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search PO or supplier" />
        <div className="w-44">
          <Select aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Awaiting or part received</option>
            <option value="draft">Draft</option>
            <option value="received">Received</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
          </Select>
        </div>
        {status !== 'open' ? <PeriodFilter value={period} onChange={setPeriod} /> : null}
      </div>
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={FileInput} title="No purchase orders here" action={has('procurement.approve') ? <Button asChild><Link to="/purchase-orders/new">New purchase order</Link></Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Supplier</Th>
                    <Th>Expected</Th>
                    <Th align="right">Value</Th>
                    <Th align="right">Received</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((o) => {
                    const lateRow = o.expected_date && o.expected_date < todayISO() && (o.receipt_status === 'awaiting' || o.receipt_status === 'partially_received')
                    return (
                      <Tr key={o.id} className={cn('cursor-pointer', o.status === 'cancelled' && 'text-muted-foreground')} onClick={() => navigate(`/purchase-orders/${o.id}`)}>
                        <Td>
                          <Link to={`/purchase-orders/${o.id}`} className="whitespace-nowrap font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {o.po_number}
                          </Link>
                          <div className="text-xs text-muted-foreground">{formatDate(o.order_date)} · {o.site_name}</div>
                        </Td>
                        <Td>{o.supplier_name}</Td>
                        <Td className={cn('whitespace-nowrap', lateRow && 'font-medium text-destructive')}>{o.expected_date ? formatDate(o.expected_date) : '—'}</Td>
                        <Td align="right">{formatMoney(o.order_total, currency)}</Td>
                        <Td align="right">{o.received_value > 0 ? formatMoney(o.received_value, currency) : '—'}</Td>
                        <Td>
                          <Badge variant={RECEIPT_STATUS[o.receipt_status].variant}>{RECEIPT_STATUS[o.receipt_status].label}</Badge>
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

export function NewPurchaseOrderPage() {
  const { activeOrgId } = useAuth()
  const currency = useCurrency()
  const { siteId: scopeSite } = useSiteScope()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const requestId = params.get('request') ?? ''
  const { key, renew } = useSubmissionKey()
  const [site, setSite] = React.useState(scopeSite ?? '')
  const [supplier, setSupplier] = React.useState(params.get('supplier') ?? '')
  const [store, setStore] = React.useState('')
  const [date, setDate] = React.useState(todayISO())
  const [expected, setExpected] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [draft, setDraft] = React.useState(false)
  const [lines, setLines] = React.useState<DraftLine[]>([blankLine()])
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const { data: stores = [] } = useStores(site || '__none__')

  // Prefill from an approved request.
  const request = useQuery({
    queryKey: ['purchase-request-prefill', requestId],
    enabled: !!requestId && !!activeOrgId,
    queryFn: async () => {
      const [rows, ls] = await Promise.all([procurementService.requests(activeOrgId!, {}), procurementService.requestLines(requestId)])
      return { request: rows.find((r) => r.id === requestId) ?? null, lines: ls }
    },
  })
  React.useEffect(() => {
    if (!request.data?.request) return
    setSite(request.data.request.site_id)
    setNotes(`For ${request.data.request.request_number}: ${request.data.request.reason}`.slice(0, 1000))
    setLines(
      request.data.lines.map((l) => ({
        uid: crypto.randomUUID(),
        item_id: l.item_id ?? '',
        description: l.item_id ? '' : l.description,
        quantity: String(l.quantity),
        unit_id: l.unit_id,
        price: l.estimated_unit_cost === null ? '' : String(l.estimated_unit_cost),
      })),
    )
  }, [request.data])
  React.useEffect(() => {
    if (!site && scopeSite) setSite(scopeSite)
  }, [scopeSite, site])
  React.useEffect(() => {
    if (!stores.some((s) => s.id === store)) setStore(stores.find((s) => s.is_default)?.id ?? stores[0]?.id ?? '')
  }, [stores, store])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!supplier) return setError('Choose the supplier.')
    if (!site || !store) return setError('Choose the site and the store that will receive the goods.')
    if (expected && expected < date) return setError('The expected date cannot be before the order date.')
    const v = validateLines(lines, true)
    if (typeof v === 'string') return setError(v)
    setPending(true)
    try {
      const r = await procurementService.createOrder(key, activeOrgId!, {
        site_id: site, supplier_id: supplier, store_id: store, order_date: date, expected_date: expected, request_id: requestId, notes, issue: !draft, lines: v,
      })
      renew()
      await invalidateRecords(qc)
      toast.success(r.replayed ? 'Order was already saved' : `Purchase order ${r.po_number} saved`)
      navigate(`/purchase-orders/${r.purchase_order_id}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/purchase-orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Purchase orders
      </Link>
      <PageHeader
        title="New purchase order"
        description={request.data?.request ? `From request ${request.data.request.request_number}` : 'Order inputs from a supplier. Stock is added when the goods are received.'}
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier" htmlFor="po-sup" required hint={<Link to="/suppliers" className="underline">Manage suppliers</Link>}>
              <SupplierSelect id="po-sup" value={supplier} onChange={setSupplier} />
            </Field>
            <Field label="Site" htmlFor="po-site" required>
              <SiteSelect id="po-site" value={site} onChange={setSite} disabled={!!request.data?.request} />
            </Field>
            <Field label="Receive into store" htmlFor="po-store" required>
              <StoreSelect id="po-store" siteId={site || '__none__'} value={store} onChange={setStore} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Order date" htmlFor="po-date" required>
                <Input id="po-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Expected" htmlFor="po-exp">
                <Input id="po-exp" type="date" min={date} value={expected} onChange={(e) => setExpected(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <div className="px-5 pb-5">
            <LinesEditor lines={lines} setLines={setLines} priceLabel="Price" priceRequired />
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3 md:max-w-md md:flex-1">
              <Field label="Notes for the supplier" htmlFor="po-notes">
                <Textarea id="po-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Checkbox label="Save as draft" description="A draft is not sent to the supplier and cannot be received until issued." checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            </div>
            <dl className="min-w-[14rem] rounded-lg border bg-muted/50 p-4 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Order value</dt>
                <dd className="text-lg font-semibold tabular">{formatMoney(draftTotal(lines), currency)}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-4 space-y-3">
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate('/purchase-orders')} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Save purchase order
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}

export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['purchase-order', id], queryFn: () => procurementService.order(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Purchase order not found" />
  return <PurchaseOrderDetail order={query.data} />
}

function PurchaseOrderDetail({ order }: { order: PurchaseOrderSummary }) {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [receiving, setReceiving] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [closing, setClosing] = React.useState(false)
  const [voiding, setVoiding] = React.useState<string | null>(null)
  const lines = useQuery({ queryKey: ['purchase-order-lines', order.id], queryFn: () => procurementService.orderLines(order.id) })
  const receipts = useQuery({ queryKey: ['goods-receipts', order.id], queryFn: () => procurementService.receipts(order.id) })
  const bills = useQuery({ queryKey: ['supplier-bills', activeOrgId, 'order', order.id], queryFn: () => procurementService.bills(activeOrgId!, { orderId: order.id }) })
  const setStatus = useSave((v: { status: 'issued' | 'cancelled' | 'closed'; reason?: string }) => procurementService.setOrderStatus(order.id, v.status, v.reason), { success: 'Order updated' })
  const voidReceipt = useRecord((key, v: { id: string; reason: string }) => procurementService.voidReceipt(key, v.id, v.reason), { success: 'Receipt voided and stock reversed' })
  const st = RECEIPT_STATUS[order.receipt_status]
  const canApprove = has('procurement.approve')
  const receivable = order.status === 'issued' && order.receipt_status !== 'received' && has('inventory.manage')

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/purchase-orders" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Purchase orders
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {order.po_number}
            <Badge variant={st.variant}>{st.label}</Badge>
          </span>
        }
        description={
          <>
            <Link to={`/suppliers/${order.supplier_id}`} className="hover:underline">
              {order.supplier_name}
            </Link>
            {` · ${formatDate(order.order_date)} · ${order.site_name}, ${order.store_name}`}
            {order.expected_date ? ` · expected ${formatDate(order.expected_date)}` : ''}
            {order.request_number ? ` · from ${order.request_number}` : ''}
          </>
        }
        actions={
          <>
            {canApprove && order.status === 'draft' ? (
              <Button variant="outline" onClick={() => setStatus.mutate({ status: 'issued' })} loading={setStatus.isPending}>
                Issue order
              </Button>
            ) : null}
            {canApprove && (order.status === 'draft' || (order.status === 'issued' && order.received_value === 0)) ? (
              <Button variant="outline" onClick={() => setCancelling(true)}>
                Cancel order
              </Button>
            ) : null}
            {canApprove && order.status === 'issued' && order.received_value > 0 && order.receipt_status !== 'received' ? (
              <Button variant="outline" onClick={() => setClosing(true)}>
                Close order
              </Button>
            ) : null}
            {has('finance.record') && order.status !== 'draft' && order.status !== 'cancelled' ? (
              <Button variant="outline" asChild>
                <Link to={`/bills?new=1&supplier=${order.supplier_id}&order=${order.id}`}>Record bill</Link>
              </Button>
            ) : null}
            {receivable ? <Button onClick={() => setReceiving(true)}>Receive goods</Button> : null}
          </>
        }
      />
      {order.status === 'cancelled' || order.status === 'closed' ? (
        <Notice tone="warning" className="mb-4">
          {order.status === 'cancelled' ? 'Cancelled' : 'Closed'}
          {order.status_reason ? `: ${order.status_reason}` : ''}.
        </Notice>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="money" label="Order value" value={formatMoney(order.order_total, currency)} />
        <StatCard tone="plain" label="Received" value={formatMoney(order.received_value, currency)} hint="At the order price" />
        <StatCard tone="plain" label="Billed by supplier" value={formatMoney(order.billed_amount, currency)} />
        <StatCard tone="money" label="Paid" value={formatMoney(order.paid_amount, currency)} hint={order.billed_amount > order.paid_amount ? `${formatMoney(order.billed_amount - order.paid_amount, currency)} owed` : undefined} />
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
                    <Th>Item</Th>
                    <Th align="right">Ordered</Th>
                    <Th align="right">Received</Th>
                    <Th align="right">Remaining</Th>
                    <Th align="right">Price</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <Tr key={l.id}>
                      <Td>
                        {l.description}
                        {!l.item_id ? <div className="text-xs text-muted-foreground">Not stock-tracked</div> : null}
                        {l.rejected_quantity > 0 ? <div className="text-xs text-destructive">{formatNumber(l.rejected_quantity, 3)} rejected</div> : null}
                      </Td>
                      <Td align="right">{formatNumber(l.quantity, 3)} {l.unit_symbol}</Td>
                      <Td align="right">{formatNumber(l.received_quantity, 3)}</Td>
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
          <CardTitle>Goods received</CardTitle>
        </CardHeader>
        <QueryState query={receipts} empty={<CardContent><p className="text-sm text-muted-foreground">Nothing received yet.</p></CardContent>}>
          {(list) => (
            <CardContent className="space-y-3">
              {list.map((g) => (
                <div key={g.id} className={cn('rounded-lg border p-3 text-sm', g.status === 'voided' && 'text-muted-foreground')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {g.grn_number} · {formatDate(g.received_date)} · {g.store?.name}
                      {g.delivery_reference ? ` · delivery note ${g.delivery_reference}` : ''}
                    </span>
                    {g.status === 'voided' ? (
                      <Badge>Voided</Badge>
                    ) : has('inventory.manage') ? (
                      <Button variant="ghost" size="sm" onClick={() => setVoiding(g.id)}>
                        Void
                      </Button>
                    ) : null}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {g.lines.map((l, i) => (
                      <li key={i}>
                        {l.line?.description}: {formatNumber(l.quantity_received, 3)} {l.line?.unit?.symbol} received
                        {l.quantity_rejected > 0 ? `, ${formatNumber(l.quantity_rejected, 3)} rejected (${l.rejection_reason})` : ''}
                      </li>
                    ))}
                  </ul>
                  {g.void_reason ? <p className="mt-1">Voided: {g.void_reason}</p> : null}
                </div>
              ))}
            </CardContent>
          )}
        </QueryState>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Supplier bills</CardTitle>
        </CardHeader>
        <QueryState query={bills} empty={<CardContent><p className="text-sm text-muted-foreground">No bill recorded against this order yet.</p></CardContent>}>
          {(list) => (
            <TableWrap>
              <Table>
                <tbody>
                  {list.map((b) => {
                    const bs = billStatus(b)
                    return (
                      <Tr key={b.id} className="cursor-pointer" onClick={() => navigate(`/bills/${b.id}`)}>
                        <Td className="whitespace-nowrap font-medium">{b.bill_number}</Td>
                        <Td>{formatDate(b.bill_date)}</Td>
                        <Td align="right">{formatMoney(b.amount, currency)}</Td>
                        <Td>
                          <Badge variant={bs.variant}>{bs.label}</Badge>
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
      {lines.data ? <ReceiveDialog open={receiving} onOpenChange={setReceiving} order={order} lines={lines.data} /> : null}
      <ReasonDialog open={cancelling} onOpenChange={setCancelling} title="Cancel this order?" description="Tell the supplier separately. A cancelled order cannot be received." confirmLabel="Cancel order" onConfirm={(reason) => setStatus.mutateAsync({ status: 'cancelled', reason })} />
      <ReasonDialog open={closing} onOpenChange={setClosing} title="Close this order?" description="The remaining quantities will not be received. What was received stays in stock." confirmLabel="Close order" onConfirm={(reason) => setStatus.mutateAsync({ status: 'closed', reason })} />
      <ReasonDialog
        open={voiding !== null}
        onOpenChange={(o) => !o && setVoiding(null)}
        title="Void this goods received note?"
        description="The stock it added is taken out again, so this is refused if any of it has already been used."
        confirmLabel="Void receipt"
        onConfirm={(reason) => voidReceipt.mutateAsync({ id: voiding!, reason })}
      />
    </div>
  )
}

function ReceiveDialog({ open, onOpenChange, order, lines }: { open: boolean; onOpenChange: (o: boolean) => void; order: PurchaseOrderSummary; lines: PurchaseOrderLine[] }) {
  const pendingLines = lines.filter((l) => l.remaining_quantity > 0)
  const [date, setDate] = React.useState(todayISO())
  const [store, setStore] = React.useState(order.store_id)
  const [ref, setRef] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [recv, setRecv] = React.useState<Record<string, string>>({})
  const [rej, setRej] = React.useState<Record<string, string>>({})
  const [why, setWhy] = React.useState<Record<string, string>>({})
  const [localError, setLocalError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    setDate(todayISO())
    setStore(order.store_id)
    setRef('')
    setNotes('')
    setRecv(Object.fromEntries(pendingLines.map((l) => [l.id, String(l.remaining_quantity)])))
    setRej({})
    setWhy({})
    setLocalError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const receive = useRecord((key, v: Parameters<typeof procurementService.receive>[1]) => procurementService.receive(key, v), {
    success: (r) => `${r.grn_number} recorded and stock updated`,
    onSuccess: () => onOpenChange(false),
  })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    const out = []
    for (const l of pendingLines) {
      const r = Number(recv[l.id]) || 0
      const x = Number(rej[l.id]) || 0
      if (r < 0 || x < 0) return setLocalError('Quantities cannot be negative.')
      if (r > l.remaining_quantity + 1e-9) return setLocalError(`Only ${formatNumber(l.remaining_quantity, 3)} ${l.unit_symbol} remains on ${l.description}.`)
      if (x > 0 && !(why[l.id] ?? '').trim()) return setLocalError(`Say why goods on ${l.description} were rejected.`)
      if (r > 0 || x > 0) out.push({ order_line_id: l.id, quantity_received: r, quantity_rejected: x, rejection_reason: why[l.id] })
    }
    if (!out.length) return setLocalError('Enter what was received.')
    receive.mutate({ order_id: order.id, date, store_id: store, delivery_reference: ref, notes, lines: out })
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Receive goods on ${order.po_number}`}
      description="Count what arrived. Accepted stock items are added to the store at the order price; rejected goods are recorded but not stocked."
      size="lg"
      submitLabel="Record receipt"
      pending={receive.isPending}
      error={localError ? new Error(localError) : receive.error}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Received on" htmlFor="gr-date" required>
          <Input id="gr-date" type="date" min={order.order_date} max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Into store" htmlFor="gr-store" required>
          <StoreSelect id="gr-store" siteId={order.site_id} value={store} onChange={setStore} />
        </Field>
        <Field label="Delivery note no." htmlFor="gr-ref">
          <Input id="gr-ref" maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      <div className="space-y-2">
        {pendingLines.map((l) => (
          <div key={l.id} className="rounded-lg border p-3">
            <p className="text-sm font-medium">{l.description}</p>
            <p className="text-sm text-muted-foreground">
              {formatNumber(l.remaining_quantity, 3)} {l.unit_symbol} outstanding{!l.item_id ? ' · not stock-tracked' : ''}
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-[8rem_8rem_minmax(0,1fr)]">
              <Field label={`Accepted (${l.unit_symbol})`} htmlFor={`gr-r-${l.id}`}>
                <Input id={`gr-r-${l.id}`} type="number" step="any" min={0} max={l.remaining_quantity} value={recv[l.id] ?? ''} onChange={(e) => setRecv((s) => ({ ...s, [l.id]: e.target.value }))} />
              </Field>
              <Field label="Rejected" htmlFor={`gr-x-${l.id}`}>
                <Input id={`gr-x-${l.id}`} type="number" step="any" min={0} value={rej[l.id] ?? ''} onChange={(e) => setRej((s) => ({ ...s, [l.id]: e.target.value }))} />
              </Field>
              {Number(rej[l.id]) > 0 ? (
                <Field label="Why rejected" htmlFor={`gr-w-${l.id}`}>
                  <Input id={`gr-w-${l.id}`} maxLength={300} value={why[l.id] ?? ''} onChange={(e) => setWhy((s) => ({ ...s, [l.id]: e.target.value }))} placeholder="e.g. Torn bags, expired" />
                </Field>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <Field label="Notes" htmlFor="gr-notes">
        <Textarea id="gr-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </FormDialog>
  )
}
