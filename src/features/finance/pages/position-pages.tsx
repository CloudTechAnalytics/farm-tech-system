import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Download, HandCoins, Wallet } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { positionService, type Aging } from '@/features/finance/services/position.service'
import { PAYMENT_LABEL, PAYMENT_METHODS } from '@/features/finance/services/finance.service'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Select } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

function usePosition() {
  const { activeOrgId } = useAuth()
  const { siteId } = useSiteScope()
  return useQuery({ queryKey: ['finance-position', activeOrgId, siteId], enabled: !!activeOrgId, queryFn: () => positionService.position(activeOrgId!, siteId || undefined) })
}

function AgingCards({ aging, overdueLabel }: { aging?: Aging; overdueLabel: string }) {
  const currency = useCurrency()
  const overdue = aging ? aging.total - aging.current : 0
  const buckets: [string, number | undefined][] = [
    ['Not yet due', aging?.current],
    ['1–30 days late', aging?.d1_30],
    ['31–60 days late', aging?.d31_60],
    ['61–90 days late', aging?.d61_90],
    ['Over 90 days', aging?.d90_plus],
  ]
  return (
    <>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard tone="money" label="Total outstanding" value={formatMoney(aging?.total ?? 0, currency)} hint={`${aging?.count ?? 0} open`} />
        <StatCard tone="plain" label={overdueLabel} value={formatMoney(overdue, currency)} hint="Past the due date" />
      </div>
      <Card className="mb-3 grid grid-cols-2 divide-y sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {buckets.map(([label, value]) => (
          <div key={label} className="p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-semibold tabular">{formatMoney(value ?? 0, currency)}</p>
          </div>
        ))}
      </Card>
    </>
  )
}

export function ReceivablesPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const [search, setSearch] = React.useState('')
  const [overdue, setOverdue] = React.useState(false)
  const debounced = useDebounced(search)
  const position = usePosition()
  const query = useQuery({
    queryKey: ['receivables', activeOrgId, siteId, overdue, debounced],
    enabled: !!activeOrgId,
    queryFn: () => positionService.receivables(activeOrgId!, { siteId: siteId || undefined, overdueOnly: overdue, search: debounced || undefined }),
  })
  const rows = query.data ?? []
  return (
    <div>
      <PageHeader
        title="Receivables"
        description="Money customers owe on invoices, oldest first. It becomes income only when it is received."
        actions={
          has('reports.export') ? (
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  'receivables',
                  toCsv(rows, [
                    { header: 'Invoice', value: (r) => r.invoice_number },
                    { header: 'Customer', value: (r) => r.customer_display_name },
                    { header: 'Phone', value: (r) => r.customer_phone },
                    { header: 'Invoice date', value: (r) => r.sale_date },
                    { header: 'Due', value: (r) => r.due_date },
                    { header: 'Days overdue', value: (r) => r.days_overdue },
                    { header: 'Total', value: (r) => r.total_amount },
                    { header: 'Received', value: (r) => r.amount_received },
                    { header: 'Owed', value: (r) => r.amount_outstanding },
                  ]),
                )
              }
            >
              <Download /> Export CSV
            </Button>
          ) : null
        }
      />
      <AgingCards aging={position.data?.receivables} overdueLabel="Overdue from customers" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoice or customer" />
        <Checkbox label="Overdue only" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
      </div>
      <Card>
        <QueryState query={query} empty={<EmptyState icon={HandCoins} title="Nobody owes the farm money" description="Unpaid and part-paid invoices show here." />}>
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Customer</Th>
                    <Th>Due</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Owed</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <Tr key={r.sale_id} className="cursor-pointer" onClick={() => navigate(`/sales/${r.sale_id}`)}>
                      <Td>
                        <Link to={`/sales/${r.sale_id}`} className="whitespace-nowrap font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.invoice_number}
                        </Link>
                        <div className="text-xs text-muted-foreground">{formatDate(r.sale_date)} · {r.site_name}</div>
                      </Td>
                      <Td>
                        {r.customer_id ? (
                          <Link to={`/customers/${r.customer_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            {r.customer_display_name}
                          </Link>
                        ) : (
                          r.customer_display_name ?? 'Walk-in customer'
                        )}
                        {r.customer_phone ? <div className="text-xs text-muted-foreground">{r.customer_phone}</div> : null}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {r.due_date ? formatDate(r.due_date) : '—'}
                        {r.is_overdue ? <div className="text-xs font-medium text-destructive">{r.days_overdue} days late</div> : null}
                      </Td>
                      <Td align="right">{formatMoney(r.total_amount, currency)}</Td>
                      <Td align="right" className="font-medium">{formatMoney(r.amount_outstanding, currency)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

export function PayablesPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const navigate = useNavigate()
  const [search, setSearch] = React.useState('')
  const [overdue, setOverdue] = React.useState(false)
  const debounced = useDebounced(search)
  const position = usePosition()
  const query = useQuery({
    queryKey: ['payables', activeOrgId, siteId, overdue, debounced],
    enabled: !!activeOrgId,
    queryFn: () => positionService.payables(activeOrgId!, { siteId: siteId || undefined, overdueOnly: overdue, search: debounced || undefined }),
  })
  const rows = query.data ?? []
  return (
    <div>
      <PageHeader
        title="Payables"
        description="Supplier bills the farm still owes, oldest first. Each becomes an expense when it is paid."
        actions={
          has('reports.export') ? (
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  'payables',
                  toCsv(rows, [
                    { header: 'Bill', value: (r) => r.bill_number },
                    { header: 'Supplier', value: (r) => r.supplier_name },
                    { header: 'PO', value: (r) => r.po_number },
                    { header: 'Bill date', value: (r) => r.bill_date },
                    { header: 'Due', value: (r) => r.due_date },
                    { header: 'Days overdue', value: (r) => r.days_overdue },
                    { header: 'Amount', value: (r) => r.amount },
                    { header: 'Paid', value: (r) => r.amount_paid },
                    { header: 'Owed', value: (r) => r.amount_outstanding },
                  ]),
                )
              }
            >
              <Download /> Export CSV
            </Button>
          ) : null
        }
      />
      <AgingCards aging={position.data?.payables} overdueLabel="Overdue to suppliers" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search bill, supplier, PO" />
        <Checkbox label="Overdue only" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
      </div>
      <Card>
        <QueryState query={query} empty={<EmptyState icon={Wallet} title="Nothing owed to suppliers" description="Unpaid supplier bills show here." />}>
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
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <Tr key={r.supplier_bill_id} className="cursor-pointer" onClick={() => navigate(`/bills/${r.supplier_bill_id}`)}>
                      <Td>
                        <Link to={`/bills/${r.supplier_bill_id}`} className="whitespace-nowrap font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.bill_number}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(r.bill_date)}
                          {r.po_number ? ` · ${r.po_number}` : ''}
                        </div>
                      </Td>
                      <Td>
                        <Link to={`/suppliers/${r.supplier_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.supplier_name}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {r.due_date ? formatDate(r.due_date) : '—'}
                        {r.is_overdue ? <div className="text-xs font-medium text-destructive">{r.days_overdue} days late</div> : null}
                      </Td>
                      <Td align="right">{formatMoney(r.amount, currency)}</Td>
                      <Td align="right" className="font-medium">{formatMoney(r.amount_outstanding, currency)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

export function CashbookPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const [period, setPeriod] = usePeriod('this_month')
  const [method, setMethod] = React.useState('')
  const position = usePosition()
  const query = useQuery({
    queryKey: ['cashbook', activeOrgId, siteId, period, method],
    enabled: !!activeOrgId,
    queryFn: () => positionService.cashbook(activeOrgId!, { from: period.from, to: period.to, siteId: siteId || undefined, method }),
  })
  const rows = query.data ?? []
  const moved = rows.filter((r) => !r.is_opening)
  const totalIn = moved.reduce((s, r) => s + (r.money_in ?? 0), 0)
  const totalOut = moved.reduce((s, r) => s + (r.money_out ?? 0), 0)
  const opening = rows.find((r) => r.is_opening)?.balance ?? 0
  const closing = rows.at(-1)?.balance ?? opening
  return (
    <div>
      <PageHeader
        title="Cashbook"
        description="Every recorded receipt and payment in date order, with the running balance. Reversals appear as their own lines."
        actions={
          has('reports.export') ? (
            <Button
              variant="outline"
              disabled={!moved.length}
              onClick={() =>
                downloadCsv(
                  `cashbook-${period.from}-to-${period.to}`,
                  toCsv(rows, [
                    { header: 'Date', value: (r) => r.txn_date },
                    { header: 'Description', value: (r) => r.description },
                    { header: 'Category', value: (r) => r.category_name },
                    { header: 'Counterparty', value: (r) => r.counterparty },
                    { header: 'Method', value: (r) => (r.payment_method ? PAYMENT_LABEL[r.payment_method] : '') },
                    { header: 'Reference', value: (r) => r.reference },
                    { header: 'In', value: (r) => r.money_in },
                    { header: 'Out', value: (r) => r.money_out },
                    { header: 'Balance', value: (r) => r.balance },
                  ]),
                )
              }
            >
              <Download /> Export CSV
            </Button>
          ) : null
        }
      />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="plain" label="Opening balance" value={formatMoney(opening, currency)} />
        <StatCard tone="money" label="Money in" value={formatMoney(totalIn, currency)} />
        <StatCard tone="plain" label="Money out" value={formatMoney(totalOut, currency)} />
        <StatCard tone="money" label="Closing balance" value={formatMoney(closing, currency)} hint="Recorded, not a bank reconciliation" />
      </div>
      {position.data?.cash_by_method.length ? (
        <p className="mb-3 text-sm text-muted-foreground">
          All-time recorded balance by method:{' '}
          {position.data.cash_by_method.map((c, i) => (
            <span key={c.method}>
              {i ? ' · ' : ''}
              {PAYMENT_LABEL[c.method] ?? c.method} <span className="font-medium text-foreground tabular">{formatMoney(c.balance, currency)}</span>
            </span>
          ))}
        </p>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="w-40">
          <Select aria-label="Payment method" className="h-9" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Card>
        <QueryState query={query} isEmpty={(d) => d.filter((r) => !r.is_opening).length === 0} empty={<EmptyState icon={BookOpen} title="No money recorded in this period" />}>
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Details</Th>
                    <Th align="right">In</Th>
                    <Th align="right">Out</Th>
                    <Th align="right">Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <Tr key={r.id ?? `opening-${i}`} className={cn(r.is_opening && 'bg-muted/40 font-medium', r.is_reversal && 'text-muted-foreground')}>
                      <Td className="whitespace-nowrap">{formatDate(r.txn_date)}</Td>
                      <Td>
                        {r.description}
                        {!r.is_opening ? (
                          <div className="text-xs text-muted-foreground">
                            {[r.category_name, r.counterparty, r.payment_method ? PAYMENT_LABEL[r.payment_method] : null, r.reference ? `Ref ${r.reference}` : null].filter(Boolean).join(' · ')}
                            {r.sale_id ? (
                              <>
                                {' · '}
                                <Link to={`/sales/${r.sale_id}`} className="underline">
                                  invoice
                                </Link>
                              </>
                            ) : null}
                            {r.supplier_bill_id ? (
                              <>
                                {' · '}
                                <Link to={`/bills/${r.supplier_bill_id}`} className="underline">
                                  bill
                                </Link>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                        {r.is_reversal ? <Badge className="ml-0 mt-1">Reversal</Badge> : null}
                      </Td>
                      <Td align="right">{r.money_in !== null ? formatMoney(r.money_in, currency) : ''}</Td>
                      <Td align="right">{r.money_out !== null ? formatMoney(r.money_out, currency) : ''}</Td>
                      <Td align="right" className="font-medium">{formatMoney(r.balance, currency)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
    </div>
  )
}
