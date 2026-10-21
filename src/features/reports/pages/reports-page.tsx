import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Download, Info, Printer } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { reportsService, type Period } from '@/features/reports/services/reports.service'
import { positionService } from '@/features/finance/services/position.service'
import { RequirePermission } from '@/features/auth/components/route-guards'
import { Card, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Select } from '@/shared/components/ui/input'
import { Table, TableWrap, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState, PageHeader, QueryState } from '@/shared/components/common'
import { BarChart } from '@/shared/components/bar-chart'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { downloadCsv, toCsv, type CsvColumn } from '@/shared/lib/csv'
import { formatDate, formatMoney, formatNumber, formatPercent, titleCase } from '@/shared/lib/format'
import { PRODUCT } from '@/shared/config/env'

interface Col<T> {
  header: string
  cell: (row: T) => React.ReactNode
  csv: CsvColumn<T>['value']
  align?: 'left' | 'right'
}

function ReportTable<T>({
  title,
  query,
  columns,
  filename,
  note,
  rowKey,
  footer,
}: {
  title: string
  query: UseQueryResult<T[]>
  columns: Col<T>[]
  filename: string
  note?: React.ReactNode
  rowKey: (row: T, i: number) => string
  footer?: (rows: T[]) => React.ReactNode
}) {
  const { has } = useAuth()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <div className="no-print flex gap-2">
          {has('reports.export') ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!query.data?.length}
              onClick={() => downloadCsv(filename, toCsv(query.data ?? [], columns.map((c) => ({ header: c.header, value: c.csv }))))}
            >
              <Download /> CSV
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </CardHeader>
      <QueryState query={query} empty={<EmptyState title="No data for this period and filter" />}>
        {(rows) => (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <Th key={c.header} align={c.align}>
                      {c.header}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Tr key={rowKey(r, i)}>
                    {columns.map((c) => (
                      <Td key={c.header} align={c.align}>
                        {c.cell(r)}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
              {footer ? <tfoot>{footer(rows)}</tfoot> : null}
            </Table>
          </TableWrap>
        )}
      </QueryState>
      {note ? (
        <p className="flex gap-2 px-5 py-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {note}
        </p>
      ) : null}
    </Card>
  )
}

const n = (v: number | null | undefined, d = 0) => formatNumber(v, d)

export function ReportsPage() {
  const { has, activeOrgId, organization } = useAuth()
  const { siteId, site } = useSiteScope()
  const [params, setParams] = useSearchParams()
  const [period, setPeriod] = usePeriod('this_month')
  const [ptype, setPtype] = React.useState('')
  const ops = has('reports.view')
  const fin = has('reports.financial') && has('finance.view')
  const tab = params.get('tab') ?? (ops ? 'mortality' : 'finance')
  const p: Period = { from: period.from, to: period.to, siteId: siteId || undefined, productionType: ptype || undefined }

  return (
    <div>
      <PageHeader title="Reports" description="Every figure is calculated from recorded transactions for the period and filters below." />
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="w-36">
          <Select aria-label="Production type" className="h-9" value={ptype} onChange={(e) => setPtype(e.target.value)}>
            <option value="">All production</option>
            <option value="poultry">Poultry</option>
            <option value="fish">Fish</option>
            <option value="crop">Crops</option>
          </Select>
        </div>
      </div>
      <div className="mb-4 hidden text-sm print:block">
        <p className="font-semibold">
          {organization?.name} · {site?.name ?? 'All sites'}
        </p>
        <p>
          {formatDate(period.from)} to {formatDate(period.to)} · Printed {formatDate(new Date(), 'd MMM yyyy HH:mm')} from {PRODUCT.name}
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          {ops ? (
            <>
              <TabsTrigger value="mortality">Mortality</TabsTrigger>
              <TabsTrigger value="feed">Feed</TabsTrigger>
              <TabsTrigger value="production">Production</TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
            </>
          ) : null}
          {fin ? (
            <>
              <TabsTrigger value="finance">Income and expenses</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="profit">Cash vs profit</TabsTrigger>
            </>
          ) : null}
          {ops ? (
            <>
              <TabsTrigger value="sites">Sites</TabsTrigger>
              <TabsTrigger value="cycles">Batches and cycles</TabsTrigger>
            </>
          ) : null}
        </TabsList>
        {activeOrgId ? (
          <>
            <TabsContent value="mortality">
              <RequirePermission permission="reports.view">
                <MortalityReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="feed">
              <RequirePermission permission="reports.view">
                <FeedReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="production">
              <RequirePermission permission="reports.view">
                <ProductionReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="stock">
              <RequirePermission permission="reports.view">
                <StockReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="finance">
              <RequirePermission permission={['reports.financial', 'finance.view']} mode="all">
                <FinanceReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="sales">
              <RequirePermission permission={['reports.financial', 'finance.view']} mode="all">
                <SalesReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="profit">
              <RequirePermission permission={['reports.financial', 'finance.view']} mode="all">
                <ProfitReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="sites">
              <RequirePermission permission="reports.view">
                <SitesReport p={p} />
              </RequirePermission>
            </TabsContent>
            <TabsContent value="cycles">
              <RequirePermission permission="reports.view">
                <CyclesReport p={p} />
              </RequirePermission>
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  )
}

function useReport<T>(name: string, p: Period, fn: (org: string, p: Period) => Promise<T[]>, enabled = true) {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['reports', activeOrgId, name, p], enabled: !!activeOrgId && enabled, queryFn: () => fn(activeOrgId!, p) })
}

function MortalityReport({ p }: { p: Period }) {
  const q = useReport('mortality', p, reportsService.mortality)
  return (
    <ReportTable
      title="Mortality by batch"
      query={q}
      filename={`mortality-${p.from}-${p.to}`}
      rowKey={(r) => r.batch_id}
      note="Rate = deaths ÷ (population at the start of the period + animals added during it). Fish counts are estimates."
      columns={[
        { header: 'Batch', cell: (r) => <span className="font-medium">{r.batch_code}</span>, csv: (r) => r.batch_code },
        { header: 'Type', cell: (r) => <Badge variant={r.production_type === 'fish' ? 'fish' : 'poultry'}>{r.species}</Badge>, csv: (r) => r.species },
        { header: 'Site', cell: (r) => r.site_name, csv: (r) => r.site_name },
        { header: 'Opening', align: 'right', cell: (r) => n(r.opening_population), csv: (r) => r.opening_population },
        { header: 'Added', align: 'right', cell: (r) => n(r.added), csv: (r) => r.added },
        { header: 'Deaths', align: 'right', cell: (r) => <span className="font-medium">{n(r.mortality)}</span>, csv: (r) => r.mortality },
        { header: 'Culled', align: 'right', cell: (r) => n(r.culled), csv: (r) => r.culled },
        { header: 'Sold / harvested / other', align: 'right', cell: (r) => n(r.other_out), csv: (r) => r.other_out },
        { header: 'Closing', align: 'right', cell: (r) => <>{n(r.closing_population)}{r.count_basis === 'estimated' ? ' est.' : ''}</>, csv: (r) => r.closing_population },
        { header: 'Mortality rate', align: 'right', cell: (r) => formatPercent(r.mortality_pct, 2), csv: (r) => r.mortality_pct },
      ]}
    />
  )
}

function FeedReport({ p }: { p: Period }) {
  const q = useReport('feed', p, reportsService.feed)
  return (
    <ReportTable
      title="Feed by batch"
      query={q}
      filename={`feed-${p.from}-${p.to}`}
      rowKey={(r) => `${r.batch_id}:${r.item_name}`}
      note="Issued feed leaves the store once. Eaten, wasted and returned are what happened to it at the batch. Per-head figure uses the population at the end of the period."
      columns={[
        { header: 'Batch', cell: (r) => <span className="font-medium">{r.batch_code}</span>, csv: (r) => r.batch_code },
        { header: 'Feed', cell: (r) => r.item_name, csv: (r) => r.item_name },
        { header: 'Issued', align: 'right', cell: (r) => `${n(r.issued, 1)} ${r.unit_symbol}`, csv: (r) => r.issued },
        { header: 'Eaten', align: 'right', cell: (r) => <span className="font-medium">{`${n(r.consumed, 1)} ${r.unit_symbol}`}</span>, csv: (r) => r.consumed },
        { header: 'Wasted', align: 'right', cell: (r) => `${n(r.wasted, 1)} ${r.unit_symbol}`, csv: (r) => r.wasted },
        { header: 'Returned', align: 'right', cell: (r) => `${n(r.returned, 1)} ${r.unit_symbol}`, csv: (r) => r.returned },
        { header: 'Still at batch', align: 'right', cell: (r) => `${n(r.held_at_batch, 1)} ${r.unit_symbol}`, csv: (r) => r.held_at_batch },
        { header: 'Eaten per head', align: 'right', cell: (r) => (r.consumed_per_head_g !== null ? `${n(r.consumed_per_head_g, 0)} g` : '—'), csv: (r) => r.consumed_per_head_g },
      ]}
    />
  )
}

function ProductionReport({ p }: { p: Period }) {
  const q = useReport('production', p, reportsService.production)
  return (
    <ReportTable
      title="Production and harvest"
      query={q}
      filename={`production-${p.from}-${p.to}`}
      rowKey={(r) => `${r.source_id}:${r.product}:${r.base_unit}`}
      note="Quantities are converted to pieces, kg or litres. Rows marked est. include estimated fish counts."
      columns={[
        { header: 'From', cell: (r) => <span className="font-medium">{r.source_code}</span>, csv: (r) => r.source_code },
        { header: 'Produce', cell: (r) => <>{r.product}{r.has_estimates ? <Badge variant="estimate" className="ml-1.5">est.</Badge> : null}</>, csv: (r) => r.product },
        { header: 'Kind', cell: (r) => titleCase(r.record_kind), csv: (r) => r.record_kind },
        { header: 'Site', cell: (r) => r.site_name, csv: (r) => r.site_name },
        { header: 'Records', align: 'right', cell: (r) => n(r.records), csv: (r) => r.records },
        { header: 'Total', align: 'right', cell: (r) => `${n(r.quantity, 1)} ${r.base_unit}`, csv: (r) => r.quantity },
        { header: 'Rejected', align: 'right', cell: (r) => `${n(r.rejected, 1)} ${r.base_unit}`, csv: (r) => r.rejected },
        { header: 'Good', align: 'right', cell: (r) => <span className="font-medium">{`${n(r.good_quantity, 1)} ${r.base_unit}`}</span>, csv: (r) => r.good_quantity },
        { header: 'Sold', align: 'right', cell: (r) => `${n(r.sold, 1)} ${r.base_unit}`, csv: (r) => r.sold },
        { header: 'Used / lost', align: 'right', cell: (r) => `${n(r.other_disposed, 1)} ${r.base_unit}`, csv: (r) => r.other_disposed },
        { header: 'Available', align: 'right', cell: (r) => `${n(r.available, 1)} ${r.base_unit}`, csv: (r) => r.available },
      ]}
    />
  )
}

function StockReport({ p }: { p: Period }) {
  const q = useReport('stock', p, reportsService.stock)
  return (
    <ReportTable
      title="Stock movement"
      query={q}
      filename={`stock-${p.from}-${p.to}`}
      rowKey={(r) => `${r.item_id}:${r.store_name}:${r.site_name}`}
      note="Opening + received + transfers in + returns − issued − used − transfers out − wasted ± count adjustments = closing."
      columns={[
        { header: 'Item', cell: (r) => <span className="font-medium">{r.item_name}</span>, csv: (r) => r.item_name },
        { header: 'Store', cell: (r) => `${r.store_name} · ${r.site_name}`, csv: (r) => `${r.store_name} (${r.site_name})` },
        { header: 'Opening', align: 'right', cell: (r) => n(r.opening, 2), csv: (r) => r.opening },
        { header: 'Received', align: 'right', cell: (r) => n(r.received, 2), csv: (r) => r.received },
        { header: 'Issued to batches', align: 'right', cell: (r) => n(r.issued, 2), csv: (r) => r.issued },
        { header: 'Used', align: 'right', cell: (r) => n(r.used, 2), csv: (r) => r.used },
        { header: 'Transfers in / out', align: 'right', cell: (r) => `${n(r.transferred_in, 2)} / ${n(r.transferred_out, 2)}`, csv: (r) => `${r.transferred_in}/${r.transferred_out}` },
        { header: 'Returned', align: 'right', cell: (r) => n(r.returned, 2), csv: (r) => r.returned },
        { header: 'Wasted', align: 'right', cell: (r) => n(r.wasted, 2), csv: (r) => r.wasted },
        { header: 'Adjusted', align: 'right', cell: (r) => n(r.adjusted, 2), csv: (r) => r.adjusted },
        { header: 'Closing', align: 'right', cell: (r) => <span className="font-medium">{`${n(r.closing, 2)} ${r.unit_symbol}`}</span>, csv: (r) => r.closing },
      ]}
    />
  )
}

function FinanceReport({ p }: { p: Period }) {
  const currency = useCurrency()
  const monthly = useReport('finance-monthly', p, reportsService.financeMonthly)
  const byCat = useReport('finance-category', p, reportsService.financeByCategory)
  const m = (v: number | null) => formatMoney(v, currency)
  return (
    <div className="space-y-4">
      {monthly.data && monthly.data.length ? (
        <Card className="p-5">
          <BarChart
            ariaLabel="Income and expenses by month"
            format={(v) => formatMoney(v, currency, { compact: true })}
            series={[
              { key: 'income', label: 'Income', color: 'hsl(var(--money-in))' },
              { key: 'expense', label: 'Expenses', color: 'hsl(var(--money-out))' },
            ]}
            data={monthly.data.map((r) => ({ label: formatDate(r.month, 'MMM yy'), title: formatDate(r.month, 'MMMM yyyy'), values: { income: r.income, expense: r.expense } }))}
          />
        </Card>
      ) : null}
      <ReportTable
        title="Cash movement by month"
        query={monthly}
        filename={`cash-by-month-${p.from}-${p.to}`}
        rowKey={(r) => r.month}
        note="Operating surplus is recorded income minus recorded expenses. It is not accounting profit: it excludes depreciation, unpaid bills, money owed by customers and the value of stock."
        columns={[
          { header: 'Month', cell: (r) => formatDate(r.month, 'MMMM yyyy'), csv: (r) => r.month },
          { header: 'Income', align: 'right', cell: (r) => m(r.income), csv: (r) => r.income },
          { header: 'Expenses', align: 'right', cell: (r) => m(r.expense), csv: (r) => r.expense },
          { header: 'Operating surplus', align: 'right', cell: (r) => <span className={r.net < 0 ? 'font-medium text-destructive' : 'font-medium'}>{m(r.net)}</span>, csv: (r) => r.net },
          { header: 'Entries', align: 'right', cell: (r) => n(r.transactions), csv: (r) => r.transactions },
        ]}
        footer={(rows) => (
          <tr className="font-semibold">
            <Td>Total</Td>
            <Td align="right">{m(rows.reduce((s, r) => s + r.income, 0))}</Td>
            <Td align="right">{m(rows.reduce((s, r) => s + r.expense, 0))}</Td>
            <Td align="right">{m(rows.reduce((s, r) => s + r.net, 0))}</Td>
            <Td />
          </tr>
        )}
      />
      <ReportTable
        title="By category"
        query={byCat}
        filename={`by-category-${p.from}-${p.to}`}
        rowKey={(r) => r.category_id}
        columns={[
          { header: 'Type', cell: (r) => <Badge variant={r.kind === 'income' ? 'success' : 'neutral'}>{r.kind === 'income' ? 'Income' : 'Expense'}</Badge>, csv: (r) => r.kind },
          { header: 'Category', cell: (r) => r.category_name, csv: (r) => r.category_name },
          { header: 'Amount', align: 'right', cell: (r) => <span className="font-medium">{m(r.amount)}</span>, csv: (r) => r.amount },
          { header: 'Entries', align: 'right', cell: (r) => n(r.transactions), csv: (r) => r.transactions },
        ]}
      />
    </div>
  )
}

function SalesReport({ p }: { p: Period }) {
  const currency = useCurrency()
  const q = useReport('sales', p, reportsService.sales)
  return (
    <ReportTable
      title="Sales by product"
      query={q}
      filename={`sales-${p.from}-${p.to}`}
      rowKey={(r, i) => `${r.product}:${r.unit_symbol}:${i}`}
      note="Sales value is what customers agreed to pay, including amounts not yet received. Voided sales are excluded."
      columns={[
        { header: 'Product', cell: (r) => <span className="font-medium">{r.product}</span>, csv: (r) => r.product },
        { header: 'Quantity', align: 'right', cell: (r) => `${n(r.quantity, 2)} ${r.unit_symbol}`, csv: (r) => r.quantity },
        { header: 'Sales value', align: 'right', cell: (r) => formatMoney(r.sales_value, currency), csv: (r) => r.sales_value },
        { header: 'Average price', align: 'right', cell: (r) => (r.quantity ? `${formatMoney(r.sales_value / r.quantity, currency)} / ${r.unit_symbol}` : '—'), csv: (r) => (r.quantity ? r.sales_value / r.quantity : null) },
        { header: 'Sales', align: 'right', cell: (r) => n(r.sales), csv: (r) => r.sales },
      ]}
    />
  )
}

function ProfitReport({ p }: { p: Period }) {
  const { activeOrgId } = useAuth()
  const currency = useCurrency()
  const q = useQuery({ queryKey: ['reports', activeOrgId, 'profit', p], enabled: !!activeOrgId, queryFn: () => positionService.profitComparison(activeOrgId!, p) })
  const m = (v: number) => formatMoney(v, currency)
  return (
    <QueryState query={q}>
      {(r) => (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cash operating surplus</CardTitle>
                <p className="text-sm text-muted-foreground">Money actually received minus money actually paid in the period.</p>
              </CardHeader>
              <dl className="space-y-2 px-5 pb-5 text-sm">
                <Line label="Money in" value={m(r.cash.money_in)} hint={`${m(r.cash.money_in_for_sales)} of it for invoices`} />
                <Line label="Money out" value={m(-r.cash.money_out)} hint={`${m(r.cash.money_out_on_bills)} of it on supplier bills`} />
                <Line label="Cash surplus" value={m(r.cash.surplus)} strong />
              </dl>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Operating profit (accrual)</CardTitle>
                <p className="text-sm text-muted-foreground">Sales invoiced and costs billed or paid directly in the period, whether or not money has changed hands.</p>
              </CardHeader>
              <dl className="space-y-2 px-5 pb-5 text-sm">
                <Line label="Sales invoiced" value={m(r.accrual.sales_invoiced)} />
                <Line label="Other income" value={m(r.accrual.other_income)} />
                <Line label="Supplier bills" value={m(-r.accrual.supplier_bills)} />
                <Line label="Other expenses paid" value={m(-r.accrual.direct_expenses)} />
                <Line label="Operating profit" value={m(r.accrual.profit)} strong />
              </dl>
            </Card>
          </div>
          <Card className="p-5 text-sm">
            <p className="font-medium">Why they differ</p>
            <p className="mt-1 text-muted-foreground">
              {m(r.difference.sales_not_yet_received)} invoiced in the period has not been received yet, and {m(r.difference.bills_not_yet_paid)} billed by suppliers has not been paid.
              Profit here excludes the value of stock still on hand and equipment depreciation, so it is an operating estimate, not audited accounts.
            </p>
          </Card>
        </div>
      )}
    </QueryState>
  )
}

function Line({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex items-baseline justify-between gap-4 border-t pt-2 text-base font-semibold' : 'flex items-baseline justify-between gap-4'}>
      <dt>
        {label}
        {hint ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}

function SitesReport({ p }: { p: Period }) {
  const currency = useCurrency()
  const q = useReport('sites', p, reportsService.sites)
  const money = (v: number | null) => (v === null ? 'Not permitted' : formatMoney(v, currency))
  return (
    <ReportTable
      title="Site comparison"
      query={q}
      filename={`sites-${p.from}-${p.to}`}
      rowKey={(r) => r.site_id}
      note="Organization-wide income and expenses (not linked to a site) are not included in any site's figures."
      columns={[
        { header: 'Site', cell: (r) => <span className="font-medium">{r.site_name}</span>, csv: (r) => r.site_name },
        { header: 'Active batches', align: 'right', cell: (r) => n(r.active_batches), csv: (r) => r.active_batches },
        { header: 'Crop cycles', align: 'right', cell: (r) => n(r.active_crop_cycles), csv: (r) => r.active_crop_cycles },
        { header: 'Deaths', align: 'right', cell: (r) => n(r.mortality), csv: (r) => r.mortality },
        { header: 'Eggs', align: 'right', cell: (r) => n(r.eggs_collected), csv: (r) => r.eggs_collected },
        { header: 'Fish harvested', align: 'right', cell: (r) => `${n(r.fish_harvest_kg)} kg`, csv: (r) => r.fish_harvest_kg },
        { header: 'Crops harvested', align: 'right', cell: (r) => `${n(r.crop_harvest_kg)} kg`, csv: (r) => r.crop_harvest_kg },
        { header: 'Feed eaten', align: 'right', cell: (r) => `${n(r.feed_consumed_kg)} kg`, csv: (r) => r.feed_consumed_kg },
        { header: 'Income', align: 'right', cell: (r) => money(r.income), csv: (r) => r.income },
        { header: 'Expenses', align: 'right', cell: (r) => money(r.expense), csv: (r) => r.expense },
        { header: 'Surplus', align: 'right', cell: (r) => <span className="font-medium">{money(r.operating_surplus)}</span>, csv: (r) => r.operating_surplus },
      ]}
    />
  )
}

function CyclesReport({ p }: { p: Period }) {
  const currency = useCurrency()
  const [includeClosed, setIncludeClosed] = React.useState(true)
  const { activeOrgId } = useAuth()
  const q = useQuery({
    queryKey: ['reports', activeOrgId, 'cycles', p.siteId, p.productionType, includeClosed],
    enabled: !!activeOrgId,
    queryFn: () => reportsService.cycles(activeOrgId!, { siteId: p.siteId, productionType: p.productionType, includeClosed }),
  })
  const money = (v: number | null) => (v === null ? '—' : formatMoney(v, currency))
  return (
    <div className="space-y-3">
      <Checkbox label="Include closed batches and cycles" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />
      <ReportTable
        title="Batch and crop cycle performance (whole life)"
        query={q}
        filename="batch-cycle-performance"
        rowKey={(r) => r.id}
        note="Money columns include only income and expenses linked to the batch or cycle. Shared costs recorded without a link are not divided up."
        columns={[
          { header: 'Code', cell: (r) => <span className="font-medium">{r.code}</span>, csv: (r) => r.code },
          { header: 'What', cell: (r) => <><Badge variant={r.production_type === 'fish' ? 'fish' : r.production_type === 'crop' ? 'crop' : 'poultry'}>{titleCase(r.production_type)}</Badge> <span className="ml-1">{r.label}</span></>, csv: (r) => r.label },
          { header: 'Site', cell: (r) => r.site_name, csv: (r) => r.site_name },
          { header: 'Period', cell: (r) => `${formatDate(r.started_on)} – ${r.ended_on ? formatDate(r.ended_on) : 'now'}`, csv: (r) => `${r.started_on ?? ''} to ${r.ended_on ?? ''}` },
          { header: 'Placed', align: 'right', cell: (r) => (r.placed !== null ? n(r.placed) : '—'), csv: (r) => r.placed },
          { header: 'Mortality', align: 'right', cell: (r) => formatPercent(r.mortality_pct, 2), csv: (r) => r.mortality_pct },
          { header: 'Feed eaten', align: 'right', cell: (r) => (r.feed_consumed_kg !== null ? `${n(r.feed_consumed_kg)} kg` : '—'), csv: (r) => r.feed_consumed_kg },
          { header: 'Output', align: 'right', cell: (r) => (r.output_quantity !== null ? `${n(r.output_quantity)} ${r.output_unit}` : '—'), csv: (r) => r.output_quantity },
          { header: 'Yield', align: 'right', cell: (r) => (r.yield_kg_per_ha ? `${n(r.yield_kg_per_ha)} kg/ha` : '—'), csv: (r) => r.yield_kg_per_ha },
          { header: 'Income', align: 'right', cell: (r) => money(r.linked_income), csv: (r) => r.linked_income },
          { header: 'Expenses', align: 'right', cell: (r) => money(r.linked_expense), csv: (r) => r.linked_expense },
          { header: 'Surplus', align: 'right', cell: (r) => <span className="font-medium">{money(r.linked_surplus)}</span>, csv: (r) => r.linked_surplus },
        ]}
      />
    </div>
  )
}
