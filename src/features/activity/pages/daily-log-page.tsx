import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarClock, Check, Download, Plus, Search, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { activityService } from '@/features/activity/services/activity.service'
import { ActivityList, useActivity } from '@/features/activity/components/activity-list'
import { ActivityDialog } from '@/features/operations/components/field-dialogs'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input, Select } from '@/shared/components/ui/input'
import { Table, TableWrap, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState, Field, PageHeader, QueryState } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { CategorySelect, SiteSelect } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { useSave } from '@/shared/hooks/use-record'
import { requiredId, requiredText, optionalText } from '@/shared/lib/validation'
import { formatDate, todayISO } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { LEDGER_ACTIVITY_CODES } from '@/features/settings/services/reference.service'
import { cn } from '@/shared/lib/utils'

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
          <TabsTrigger value="planned">Planned tasks</TabsTrigger>
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
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search" placeholder="Search entries" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <Card>
            <ActivityList filters={filters} />
          </Card>
        </TabsContent>
        <TabsContent value="planned">
          <PlannedTasks />
        </TabsContent>
      </Tabs>
      <ActivityDialog open={adding} onOpenChange={setAdding} />
    </div>
  )
}

const planSchema = z.object({
  site_id: requiredId('a farm site'),
  production_type: z.enum(['poultry', 'fish', 'crop', 'general']),
  category_id: requiredId('an activity'),
  title: requiredText('A title', 160),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a due date'),
  notes: optionalText(1000),
})

function PlannedTasks() {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const [status, setStatus] = React.useState('planned')
  const [adding, setAdding] = React.useState(false)
  const query = useQuery({
    queryKey: ['planned', activeOrgId, siteId, status],
    enabled: !!activeOrgId,
    queryFn: () => activityService.planned(activeOrgId!, { siteId: siteId || undefined, status: status || undefined }),
  })
  const setTask = useSave(({ id, s }: { id: string; s: 'done' | 'cancelled' | 'planned' }) => activityService.setPlannedStatus(id, s), { success: 'Task updated' })
  const form = useForm<z.input<typeof planSchema>>({ resolver: zodResolver(planSchema) })
  React.useEffect(() => {
    if (adding) form.reset({ site_id: siteId ?? '', production_type: 'general', category_id: '', title: '', due_on: todayISO(), notes: '' })
  }, [adding, siteId, form])
  const create = useSave((v: z.output<typeof planSchema>) => activityService.createPlanned(activeOrgId!, v), { success: 'Task planned', onSuccess: () => setAdding(false) })
  const today = todayISO()
  const { errors } = form.formState

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="w-36">
          <Select aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="planned">To do</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
          </Select>
        </div>
        {has('operations.record') ? (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <CalendarClock /> Plan a task
          </Button>
        ) : null}
      </div>
      <Card>
        <QueryState query={query} empty={<EmptyState icon={CalendarClock} title="No planned tasks" description="Plan vaccinations, fertilizer rounds or pond draining. Due and overdue tasks appear in alerts." />}>
          {(rows) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Due</Th>
                    <Th>Task</Th>
                    <Th>Site</Th>
                    <Th>Status</Th>
                    <Th className="w-24">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const overdue = t.status === 'planned' && t.due_on < today
                    const row = t as typeof t & { category: { name: string } | null; site: { name: string } | null; batch: { code: string } | null; crop_cycle: { code: string } | null }
                    return (
                      <Tr key={t.id}>
                        <Td className={cn('whitespace-nowrap', overdue && 'font-medium text-destructive')}>{formatDate(t.due_on)}</Td>
                        <Td>
                          {t.title}
                          <div className="text-xs text-muted-foreground">
                            {row.category?.name}
                            {row.batch ? ` · ${row.batch.code}` : ''}
                            {row.crop_cycle ? ` · ${row.crop_cycle.code}` : ''}
                          </div>
                        </Td>
                        <Td>{row.site?.name}</Td>
                        <Td>
                          <Badge variant={t.status === 'done' ? 'success' : t.status === 'cancelled' ? 'neutral' : overdue ? 'danger' : 'info'}>
                            {t.status === 'planned' ? (overdue ? 'Overdue' : 'To do') : t.status === 'done' ? 'Done' : 'Cancelled'}
                          </Badge>
                        </Td>
                        <Td>
                          {t.status === 'planned' && has('operations.record') ? (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" aria-label="Mark done" title="Mark done" onClick={() => setTask.mutate({ id: t.id, s: 'done' })}>
                                <Check />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="Cancel task" title="Cancel" onClick={() => setTask.mutate({ id: t.id, s: 'cancelled' })}>
                                <X />
                              </Button>
                            </div>
                          ) : null}
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
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Plan a task"
        description="Marking it done does not record the work itself; add the log entry or record when it's done."
        submitLabel="Plan task"
        pending={create.isPending}
        error={create.error}
        onSubmit={form.handleSubmit((v) => create.mutate(v as z.output<typeof planSchema>))}
      >
        <FieldRow>
          <Field label="Farm site" htmlFor="pt-site" error={errors.site_id?.message} required>
            <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="pt-site" value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Area" htmlFor="pt-type">
            <Select id="pt-type" {...form.register('production_type')}>
              <option value="general">General</option>
              <option value="poultry">Poultry</option>
              <option value="fish">Fish</option>
              <option value="crop">Crops</option>
            </Select>
          </Field>
        </FieldRow>
        <Field label="Activity" htmlFor="pt-cat" error={errors.category_id?.message} required>
          <Controller control={form.control} name="category_id" render={({ field }) => <CategorySelect id="pt-cat" kind="activity" exclude={LEDGER_ACTIVITY_CODES} value={field.value} onChange={field.onChange} />} />
        </Field>
        <FieldRow>
          <Field label="Task" htmlFor="pt-title" error={errors.title?.message} required>
            <Input id="pt-title" maxLength={160} placeholder="e.g. Gumboro booster, House 2" {...form.register('title')} />
          </Field>
          <Field label="Due" htmlFor="pt-due" error={errors.due_on?.message} required>
            <Input id="pt-due" type="date" {...form.register('due_on')} />
          </Field>
        </FieldRow>
        <Field label="Notes" htmlFor="pt-notes">
          <Input id="pt-notes" maxLength={1000} {...form.register('notes')} />
        </Field>
      </FormDialog>
    </>
  )
}
