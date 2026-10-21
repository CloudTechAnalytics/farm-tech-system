import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { ActivityList, useActivity } from '@/features/activity/components/activity-list'
import { ActivityDialog } from '@/features/operations/components/field-dialogs'
import { TasksPanel } from '@/features/tasks/pages/tasks-pages'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Select } from '@/shared/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/misc'
import { PageHeader, SearchInput } from '@/shared/components/common'
import { CategorySelect } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { downloadCsv, toCsv } from '@/shared/lib/csv'

export function DailyLogPage() {
  const { has } = useAuth()
  const { siteId } = useSiteScope()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'history'
  const [period, setPeriod] = usePeriod('7d')
  const [type, setType] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const filters = { siteId: siteId || undefined, from: period.from, to: period.to, productionType: type || undefined, categoryId: category || undefined, search: debounced || undefined, limit: 300 }
  const exportQuery = useActivity(filters)

  const exportCsv = () => {
    const rows = exportQuery.data ?? []
    downloadCsv(
      `daily-log-${period.from}-to-${period.to}`,
      toCsv(rows, [
        { header: 'Date', value: (r) => r.occurred_on },
        { header: 'Site', value: (r) => r.site?.name },
        { header: 'Area', value: (r) => r.production_type },
        { header: 'Activity', value: (r) => r.category?.name },
        { header: 'Batch / cycle', value: (r) => r.batch?.code ?? r.crop_cycle?.code },
        { header: 'Summary', value: (r) => r.summary },
        { header: 'Quantity', value: (r) => r.quantity },
        { header: 'Unit', value: (r) => r.unit?.symbol },
        { header: 'Done by', value: (r) => r.responsible?.full_name ?? r.responsible?.email },
        { header: 'Notes', value: (r) => r.notes },
      ]),
    )
  }

  return (
    <div>
      <PageHeader
        title="Daily log"
        description="Everything recorded on the farm, day by day. Entries from mortality, feed, eggs, harvests, stock and sales are added automatically."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!exportQuery.data?.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('operations.record') ? (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add entry
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'history' ? {} : { tab: v })}>
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="planned">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <div className="no-print mb-3 flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <div className="w-36">
              <Select aria-label="Area of the farm" className="h-9" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All areas</option>
                <option value="poultry">Poultry</option>
                <option value="fish">Fish</option>
                <option value="crop">Crops</option>
                <option value="general">General</option>
              </Select>
            </div>
            <div className="w-48">
              <CategorySelect aria-label="Activity" kind="activity" className="h-9" placeholder="All activities" value={category} onChange={setCategory} />
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Search entries" className="sm:w-56" />
          </div>
          <Card>
            <ActivityList filters={filters} />
          </Card>
        </TabsContent>
        <TabsContent value="planned">
          <TasksPanel />
        </TabsContent>
      </Tabs>
      <ActivityDialog open={adding} onOpenChange={setAdding} />
    </div>
  )
}

