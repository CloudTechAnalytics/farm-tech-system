import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Info, Minus, Plus, Search } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { financeService } from '@/features/finance/services/finance.service'
import { FinanceDialog } from '@/features/finance/components/finance-dialog'
import { TransactionsTable } from '@/features/finance/components/transactions-table'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input, Select } from '@/shared/components/ui/input'
import { PageHeader, QueryState, StatCard } from '@/shared/components/common'
import { CategorySelect } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { formatMoney } from '@/shared/lib/format'
import { operatingSurplus } from '@/shared/lib/calc'
import { downloadCsv, toCsv } from '@/shared/lib/csv'

export function FinancePage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const [period, setPeriod] = usePeriod('this_month')
  const [kind, setKind] = React.useState<'' | 'income' | 'expense'>('')
  const [category, setCategory] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [q, setQ] = React.useState('')
  const [dialog, setDialog] = React.useState<'income' | 'expense' | null>(null)
  React.useEffect(() => {
    const t = setTimeout(() => setQ(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const query = useQuery({
    queryKey: ['finance', activeOrgId, siteId, period, kind, category, q],
    enabled: !!activeOrgId,
    queryFn: () => financeService.list(activeOrgId!, { siteId: siteId || undefined, from: period.from, to: period.to, kind: kind || undefined, categoryId: category || undefined, search: q || undefined }),
  })
  const rows = query.data ?? []
  const income = rows.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = rows.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)

  const exportCsv = () =>
    downloadCsv(
      `income-expenses-${period.from}-to-${period.to}`,
      toCsv(rows, [
        { header: 'Date', value: (t) => t.txn_date },
        { header: 'Type', value: (t) => t.kind },
        { header: 'Category', value: (t) => t.category?.name },
        { header: 'Description', value: (t) => t.description },
        { header: 'Amount', value: (t) => t.amount },
        { header: 'Currency', value: (t) => t.currency },
        { header: 'Payment method', value: (t) => t.payment_method },
        { header: 'Site', value: (t) => t.site?.name ?? 'Organization-wide' },
        { header: 'Batch / cycle', value: (t) => t.batch?.code ?? t.crop_cycle?.code },
        { header: 'Counterparty', value: (t) => t.counterparty },
        { header: 'Reference', value: (t) => t.reference },
        { header: 'Status', value: (t) => (t.reverses_id ? 'reversal' : t.status) },
      ]),
    )

  return (
    <div>
      <PageHeader
        title="Income and expenses"
        description="Money recorded in and out. Corrections are reversals, so the history is never rewritten."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('finance.record') ? (
              <>
                <Button variant="outline" onClick={() => setDialog('income')}>
                  <Plus /> Income
                </Button>
                <Button onClick={() => setDialog('expense')}>
                  <Minus /> Expense
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="w-36">
          <Select aria-label="Type" className="h-9" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setCategory('') }}>
            <option value="">Income and expenses</option>
            <option value="income">Income only</option>
            <option value="expense">Expenses only</option>
          </Select>
        </div>
        {kind ? (
          <div className="w-48">
            <CategorySelect aria-label="Category" kind={kind} className="h-9" placeholder="All categories" value={category} onChange={setCategory} />
          </div>
        ) : null}
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search" placeholder="Search description or payee" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="money" label="Income" value={formatMoney(income, currency)} />
        <StatCard tone="plain" label="Expenses" value={formatMoney(expense, currency)} />
        <StatCard tone="plain" label="Operating surplus (cash recorded)" value={formatMoney(operatingSurplus(income, expense), currency)} hint="For the filters above" />
      </div>
      <p className="mb-3 flex gap-2 text-[13px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        This is a record of money in and out, not accounting profit. Unpaid bills, money customers owe, stock on hand and depreciation are not included.
      </p>
      <Card>
        <QueryState query={query} isEmpty={() => false}>
          {(list) => <TransactionsTable rows={list} emptyText="No transactions for these filters" />}
        </QueryState>
      </Card>
      <FinanceDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} kind={dialog ?? 'expense'} />
    </div>
  )
}
