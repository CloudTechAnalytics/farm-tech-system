import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarClock, Check, Download, Pencil, Play, Plus, RotateCcw, UserRound, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import {
  EMPLOYMENT_LABEL,
  EMPLOYMENT_TYPES,
  PRIORITY,
  TASK_STATUS,
  tasksService,
  workforceService,
  type Employee,
  type Task,
  type TaskFilters,
  type TaskPriority,
} from '@/features/tasks/services/tasks.service'
import { LEDGER_ACTIVITY_CODES, memberName } from '@/features/settings/services/reference.service'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr, Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/misc'
import { EmptyState, Field, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { BatchSelect, CategorySelect, CropCycleSelect, SiteSelect } from '@/shared/components/pickers'
import { useSave } from '@/shared/hooks/use-record'
import { useMembers, useSites } from '@/shared/hooks/use-reference-data'
import { optionalText, requiredId, requiredText } from '@/shared/lib/validation'
import { formatDate, todayISO } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

function useEmployeeNames() {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['employees', activeOrgId, 'names'], enabled: !!activeOrgId, queryFn: () => workforceService.names(activeOrgId!) })
}

type View = 'mine' | 'open' | 'review' | 'done'

export function TasksPage() {
  const { has, userId } = useAuth()
  const { data: names = [] } = useEmployeeNames()
  const isEmployee = names.some((e) => e.user_id === userId)
  const [view, setView] = React.useState<View>(isEmployee ? 'mine' : 'open')
  React.useEffect(() => {
    if (isEmployee) setView((v) => (v === 'open' ? 'mine' : v))
  }, [isEmployee])
  return (
    <div>
      <PageHeader title="Tasks" description="Work planned on the farm: who is doing it, by when, and supervisor review where it matters. Overdue tasks appear in alerts." />
      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          {isEmployee ? <TabsTrigger value="mine">My tasks</TabsTrigger> : null}
          <TabsTrigger value="open">All open</TabsTrigger>
          {has('tasks.manage') ? <TabsTrigger value="review">Awaiting review</TabsTrigger> : null}
          <TabsTrigger value="done">Finished</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-3">
        <TasksPanel key={view} view={view} />
      </div>
    </div>
  )
}

/** Task list with filters and actions. Also shown in the daily log. */
export function TasksPanel({ view = 'open' }: { view?: View }) {
  const { activeOrgId, has, userId } = useAuth()
  const { siteId } = useSiteScope()
  const { data: names = [] } = useEmployeeNames()
  const [search, setSearch] = React.useState('')
  const [assignee, setAssignee] = React.useState('')
  const [priority, setPriority] = React.useState('')
  const [overdue, setOverdue] = React.useState(false)
  const [editing, setEditing] = React.useState<Task | 'new' | null>(null)
  const [finishing, setFinishing] = React.useState<Task | null>(null)
  const [sendingBack, setSendingBack] = React.useState<Task | null>(null)
  const [cancelling, setCancelling] = React.useState<Task | null>(null)
  const debounced = useDebounced(search)
  const filters: TaskFilters = {
    siteId: siteId || undefined,
    status: view === 'review' ? 'awaiting_review' : view === 'done' ? '' : 'open',
    mineUserId: view === 'mine' ? userId ?? undefined : undefined,
    assignee: assignee || undefined,
    priority: priority || undefined,
    overdueOnly: overdue,
    search: debounced || undefined,
  }
  const query = useQuery({
    queryKey: ['tasks', activeOrgId, view, filters],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const rows = await tasksService.list(activeOrgId!, filters)
      return view === 'done' ? rows.filter((t) => t.status === 'done' || t.status === 'cancelled').reverse() : rows
    },
  })
  const rows = query.data ?? []
  const act = useSave((v: { task: Task; status: 'in_progress' | 'done' | 'cancelled'; note?: string }) => tasksService.setStatus(v.task.id, v.status, { note: v.note }), {
    success: 'Task updated',
  })
  const mine = (t: Task) => t.assignee_user_id === userId
  const canWork = (t: Task) => has('operations.record') && (!t.assigned_employee_id || mine(t) || has('tasks.manage'))
  const canEdit = (t: Task) => (has('tasks.manage') || t.created_by === userId) && t.status !== 'done' && t.status !== 'cancelled'

  const exportCsv = () =>
    downloadCsv(
      'tasks',
      toCsv(rows, [
        { header: 'Due', value: (t) => t.due_on },
        { header: 'Task', value: (t) => t.title },
        { header: 'Activity', value: (t) => t.category_name },
        { header: 'Site', value: (t) => t.site_name },
        { header: 'Batch / cycle', value: (t) => t.batch_code ?? t.crop_cycle_code },
        { header: 'Assigned to', value: (t) => t.assignee_name },
        { header: 'Priority', value: (t) => PRIORITY[t.priority].label },
        { header: 'Status', value: (t) => TASK_STATUS[t.status].label },
        { header: 'Overdue', value: (t) => t.is_overdue },
        { header: 'Completed', value: (t) => t.completed_at },
        { header: 'Reviewed by', value: (t) => t.reviewed_by_name },
      ]),
    )

  return (
    <>
      {view !== 'done' ? (
        <div className="mb-3 grid grid-cols-3 gap-3">
          <StatCard tone="plain" label="Open" value={rows.length} />
          <StatCard tone="plain" label="Overdue" value={rows.filter((t) => t.is_overdue).length} />
          <StatCard tone="plain" label="Urgent or high" value={rows.filter((t) => t.priority === 'urgent' || t.priority === 'high').length} />
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tasks, people, batches" />
        {view !== 'mine' ? (
          <div className="w-44">
            <Select aria-label="Assigned to" className="h-9" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {names.map((e) => (
                <option key={e.id} value={e.id ?? ''}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="w-32">
          <Select aria-label="Priority" className="h-9" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Any priority</option>
            {(Object.keys(PRIORITY) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p].label}
              </option>
            ))}
          </Select>
        </div>
        {view !== 'done' ? <Checkbox label="Overdue only" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> : null}
        <div className="ml-auto flex gap-2">
          {has('reports.export') ? (
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download /> Export
            </Button>
          ) : null}
          {has('operations.record') ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus /> New task
            </Button>
          ) : null}
        </div>
      </div>
      <Card>
        <QueryState
          query={query}
          empty={
            <EmptyState
              icon={CalendarClock}
              title={view === 'mine' ? 'Nothing assigned to you' : view === 'review' ? 'Nothing waiting for review' : view === 'done' ? 'No finished tasks' : 'No open tasks'}
              description={view === 'open' ? 'Plan vaccinations, fertilizer rounds, pond draining or repairs, and assign them to a worker.' : undefined}
            />
          }
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Due</Th>
                    <Th>Task</Th>
                    <Th>Assigned to</Th>
                    <Th>Status</Th>
                    <Th className="w-32">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => (
                    <Tr key={t.id} className={cn(t.status === 'cancelled' && 'text-muted-foreground')}>
                      <Td className={cn('whitespace-nowrap', t.is_overdue && 'font-medium text-destructive')}>
                        {formatDate(t.due_on)}
                        {t.repeat_every_days ? <div className="text-xs font-normal text-muted-foreground">Every {t.repeat_every_days} days</div> : null}
                      </Td>
                      <Td>
                        <span className="font-medium">{t.title}</span>
                        {t.priority !== 'normal' ? <Badge variant={PRIORITY[t.priority].variant} className="ml-2">{PRIORITY[t.priority].label}</Badge> : null}
                        <div className="text-xs text-muted-foreground">
                          {t.category_name} · {t.site_name}
                          {t.batch_code ? ` · ${t.batch_code}` : ''}
                          {t.crop_cycle_code ? ` · ${t.crop_cycle_code}` : ''}
                        </div>
                        {t.review_note && t.status === 'in_progress' ? <div className="mt-1 text-xs text-warning">Sent back: {t.review_note}</div> : null}
                        {t.activity_summary ? <div className="mt-1 text-xs text-muted-foreground">Recorded: {t.activity_summary}</div> : null}
                      </Td>
                      <Td>{t.assignee_name ?? <span className="text-muted-foreground">Unassigned</span>}</Td>
                      <Td>
                        <Badge variant={t.is_overdue ? 'danger' : TASK_STATUS[t.status].variant}>{t.is_overdue ? 'Overdue' : TASK_STATUS[t.status].label}</Badge>
                        {t.requires_review && t.status !== 'done' ? <div className="mt-1 text-xs text-muted-foreground">Needs review</div> : null}
                        {t.status === 'done' && t.reviewed_by_name ? <div className="mt-1 text-xs text-muted-foreground">Approved by {t.reviewed_by_name}</div> : null}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {t.status === 'planned' && canWork(t) ? (
                            <Button variant="ghost" size="icon" aria-label="Start" title="Start" onClick={() => act.mutate({ task: t, status: 'in_progress' })}>
                              <Play />
                            </Button>
                          ) : null}
                          {(t.status === 'planned' || t.status === 'in_progress') && canWork(t) ? (
                            <Button variant="ghost" size="icon" aria-label={t.requires_review ? 'Submit for review' : 'Mark done'} title={t.requires_review ? 'Submit for review' : 'Mark done'} onClick={() => setFinishing(t)}>
                              <Check />
                            </Button>
                          ) : null}
                          {t.status === 'awaiting_review' && has('tasks.manage') ? (
                            <>
                              <Button variant="ghost" size="icon" aria-label="Approve" title="Approve" onClick={() => act.mutate({ task: t, status: 'done' })}>
                                <Check />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="Send back" title="Send back" onClick={() => setSendingBack(t)}>
                                <RotateCcw />
                              </Button>
                            </>
                          ) : null}
                          {canEdit(t) ? (
                            <>
                              <Button variant="ghost" size="icon" aria-label="Edit" title="Edit" onClick={() => setEditing(t)}>
                                <Pencil />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="Cancel task" title="Cancel" onClick={() => setCancelling(t)}>
                                <X />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <TaskDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} task={editing === 'new' ? undefined : editing ?? undefined} />
      {finishing ? <FinishDialog task={finishing} onClose={() => setFinishing(null)} /> : null}
      <ReasonDialog
        open={sendingBack !== null}
        onOpenChange={(o) => !o && setSendingBack(null)}
        title="Send this work back?"
        description="The task returns to In progress with your note."
        confirmLabel="Send back"
        onConfirm={(note) => act.mutateAsync({ task: sendingBack!, status: 'in_progress', note })}
      />
      <ReasonDialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this task?"
        description="It stays in the history as cancelled."
        confirmLabel="Cancel task"
        onConfirm={(note) => act.mutateAsync({ task: cancelling!, status: 'cancelled', note })}
      />
    </>
  )
}

function FinishDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const [note, setNote] = React.useState('')
  const [log, setLog] = React.useState('')
  const entries = useQuery({ queryKey: ['task-log-entries', task.site_id], queryFn: () => tasksService.recentLogEntries(task.site_id) })
  const finish = useSave(() => tasksService.setStatus(task.id, 'done', { note, activityLogId: log }), {
    success: task.requires_review ? 'Sent for review' : 'Task done',
    onSuccess: () => onClose(),
  })
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={task.requires_review ? 'Submit for review' : 'Mark task done'}
      description={task.title}
      size="sm"
      submitLabel={task.requires_review ? 'Submit' : 'Mark done'}
      pending={finish.isPending}
      error={finish.error}
      onSubmit={(e) => {
        e.preventDefault()
        finish.mutate(undefined)
      }}
    >
      <Field label="Daily-log entry for this work" htmlFor="tf-log" hint="Link the record of what was done, such as the vaccination or feed entry">
        <Select id="tf-log" value={log} onChange={(e) => setLog(e.target.value)}>
          <option value="">{entries.isLoading ? 'Loading…' : 'None'}</option>
          {entries.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {formatDate(a.occurred_on, 'd MMM')} · {a.summary}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note" htmlFor="tf-note">
        <Textarea id="tf-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {task.repeat_every_days ? <p className="text-sm text-muted-foreground">The next one will be scheduled {task.repeat_every_days} days on once this is done.</p> : null}
    </FormDialog>
  )
}

const taskSchema = z.object({
  site_id: requiredId('a farm site'),
  production_type: z.enum(['poultry', 'fish', 'crop', 'general']),
  category_id: requiredId('an activity'),
  title: requiredText('A title', 160),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a due date'),
  batch_id: z.string().optional(),
  crop_cycle_id: z.string().optional(),
  assigned_employee_id: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  requires_review: z.boolean(),
  repeat_every_days: z.preprocess((v) => (v === '' || v === undefined || v === null ? null : Number(v)), z.number().int('Whole days').min(1).max(365).nullable()),
  notes: optionalText(1000),
})

export function TaskDialog({ open, onOpenChange, task }: { open: boolean; onOpenChange: (o: boolean) => void; task?: Task }) {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const { data: names = [] } = useEmployeeNames()
  const form = useForm<z.input<typeof taskSchema>>({ resolver: zodResolver(taskSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        site_id: task?.site_id ?? siteId ?? '',
        production_type: task?.production_type ?? 'general',
        category_id: task?.category_id ?? '',
        title: task?.title ?? '',
        due_on: task?.due_on ?? todayISO(),
        batch_id: task?.batch_id ?? '',
        crop_cycle_id: task?.crop_cycle_id ?? '',
        assigned_employee_id: task?.assigned_employee_id ?? '',
        priority: task?.priority ?? 'normal',
        requires_review: task?.requires_review ?? false,
        repeat_every_days: task?.repeat_every_days ?? ('' as unknown as null),
        notes: task?.notes ?? '',
      })
  }, [open, task, siteId, form])
  const save = useSave((v: z.output<typeof taskSchema>) => tasksService.save(activeOrgId!, task?.id ?? null, { ...v, assigned_employee_id: v.assigned_employee_id || undefined }), {
    success: task ? 'Task saved' : 'Task planned',
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  const site = form.watch('site_id')
  const type = form.watch('production_type')
  const manage = has('tasks.manage')
  const available = names.filter((e) => e.status === 'active' && (!e.site_ids?.length || e.site_ids.includes(site)))
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? 'Edit task' : 'New task'}
      description="Completing a task does not record the work itself; add the daily-log entry or record, then link it when you finish."
      submitLabel={task ? 'Save' : 'Plan task'}
      pending={save.isPending}
      error={save.error}
      onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof taskSchema>))}
    >
      <Field label="Task" htmlFor="tk-title" error={errors.title?.message} required>
        <Input id="tk-title" maxLength={160} placeholder="e.g. Gumboro booster, House 2" {...form.register('title')} />
      </Field>
      <FieldRow>
        <Field label="Farm site" htmlFor="tk-site" error={errors.site_id?.message} required>
          <Controller control={form.control} name="site_id" render={({ field }) => <SiteSelect id="tk-site" value={field.value} onChange={(v) => { field.onChange(v); form.setValue('batch_id', ''); form.setValue('crop_cycle_id', '') }} />} />
        </Field>
        <Field label="Due" htmlFor="tk-due" error={errors.due_on?.message} required>
          <Input id="tk-due" type="date" {...form.register('due_on')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Area" htmlFor="tk-type">
          <Select id="tk-type" {...form.register('production_type')}>
            <option value="general">General</option>
            <option value="poultry">Poultry</option>
            <option value="fish">Fish</option>
            <option value="crop">Crops</option>
          </Select>
        </Field>
        <Field label="Activity" htmlFor="tk-cat" error={errors.category_id?.message} required>
          <Controller control={form.control} name="category_id" render={({ field }) => <CategorySelect id="tk-cat" kind="activity" exclude={LEDGER_ACTIVITY_CODES} value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      {type === 'poultry' || type === 'fish' ? (
        <Field label="Batch" htmlFor="tk-batch">
          <Controller control={form.control} name="batch_id" render={({ field }) => <BatchSelect id="tk-batch" siteId={site || '__none__'} type={type} value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      ) : type === 'crop' ? (
        <Field label="Crop cycle" htmlFor="tk-cycle">
          <Controller control={form.control} name="crop_cycle_id" render={({ field }) => <CropCycleSelect id="tk-cycle" siteId={site || '__none__'} value={field.value ?? ''} onChange={field.onChange} />} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Assign to" htmlFor="tk-who" hint={manage ? (names.length ? undefined : 'Add workers under People to assign tasks') : 'A supervisor assigns tasks'}>
          {manage ? (
            <Select id="tk-who" {...form.register('assigned_employee_id')}>
              <option value="">Unassigned</option>
              {available.map((e) => (
                <option key={e.id} value={e.id ?? ''}>
                  {e.full_name}
                  {e.job_title ? ` · ${e.job_title}` : ''}
                </option>
              ))}
            </Select>
          ) : (
            <Input id="tk-who" value={task?.assignee_name ?? 'Unassigned'} disabled />
          )}
        </Field>
        <Field label="Priority" htmlFor="tk-pri">
          {manage ? (
            <Select id="tk-pri" {...form.register('priority')}>
              {(Object.keys(PRIORITY) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </Select>
          ) : (
            <Input id="tk-pri" value={PRIORITY[task?.priority ?? 'normal'].label} disabled />
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Repeat every (days)" htmlFor="tk-rep" error={errors.repeat_every_days?.message} hint="Optional, e.g. 7 for weekly">
          <Input id="tk-rep" type="number" step="1" min={1} max={365} {...form.register('repeat_every_days')} />
        </Field>
        <div className="pt-6">
          <Controller
            control={form.control}
            name="requires_review"
            render={({ field }) => <Checkbox label="Supervisor review" description="A supervisor approves the work before it counts as done." checked={field.value} disabled={!manage} onChange={(e) => field.onChange(e.target.checked)} />}
          />
        </div>
      </FieldRow>
      <Field label="Notes" htmlFor="tk-notes">
        <Textarea id="tk-notes" rows={2} maxLength={1000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------
export function WorkersPage() {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('active')
  const [editing, setEditing] = React.useState<Employee | 'new' | null>(null)
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['employees', activeOrgId, debounced, status, siteId],
    enabled: !!activeOrgId,
    queryFn: () => workforceService.list(activeOrgId!, { search: debounced || undefined, status: status || undefined, siteId: siteId || undefined }),
  })
  const rows = query.data ?? []
  const exportCsv = () =>
    downloadCsv(
      'workers',
      toCsv(rows, [
        { header: 'Code', value: (e) => e.code },
        { header: 'Name', value: (e) => e.full_name },
        { header: 'Role', value: (e) => e.job_title },
        { header: 'Employment', value: (e) => EMPLOYMENT_LABEL[e.employment_type] },
        { header: 'Phone', value: (e) => e.phone },
        { header: 'Sites', value: (e) => (e.site_names.length ? e.site_names.join('; ') : 'All sites') },
        { header: 'Account', value: (e) => e.account_name },
        { header: 'Start date', value: (e) => e.start_date },
        { header: 'Status', value: (e) => e.status },
        { header: 'Open tasks', value: (e) => e.open_tasks },
        { header: 'Overdue tasks', value: (e) => e.overdue_tasks },
      ]),
    )
  return (
    <div>
      <PageHeader
        title="Workers"
        description="Everyone who works on the farm, whether or not they sign in. Link a worker to their account so tasks show under My tasks."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('workforce.manage') ? (
              <Button onClick={() => setEditing('new')}>
                <Plus /> Add worker
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, role, phone" />
        <div className="w-32">
          <Select aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="">All</option>
          </Select>
        </div>
      </div>
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={UserRound} title={debounced ? 'No workers match' : 'No workers yet'} description={debounced ? undefined : 'Add farm hands, supervisors and casual workers to assign tasks to them.'} action={has('workforce.manage') && !debounced ? <Button onClick={() => setEditing('new')}>Add a worker</Button> : undefined} />}
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Worker</Th>
                    <Th>Sites</Th>
                    <Th>Phone</Th>
                    <Th align="right">Open tasks</Th>
                    {has('workforce.manage') ? <Th className="w-12" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <Tr key={e.id} className={cn(e.status === 'inactive' && 'text-muted-foreground')}>
                      <Td>
                        <span className="font-medium">{e.full_name}</span>
                        {e.status === 'inactive' ? <Badge className="ml-2">Inactive</Badge> : null}
                        <div className="text-xs text-muted-foreground">
                          {[e.job_title, EMPLOYMENT_LABEL[e.employment_type], e.account_name ? `Signs in as ${e.account_name}` : null].filter(Boolean).join(' · ')}
                        </div>
                      </Td>
                      <Td>{e.site_names.length ? e.site_names.join(', ') : 'All sites'}</Td>
                      <Td className="whitespace-nowrap">{e.phone ?? '—'}</Td>
                      <Td align="right">
                        {e.open_tasks || '—'}
                        {e.overdue_tasks ? <div className="text-xs text-destructive">{e.overdue_tasks} overdue</div> : null}
                      </Td>
                      {has('workforce.manage') ? (
                        <Td align="right">
                          <Button variant="ghost" size="icon" aria-label={`Edit ${e.full_name}`} onClick={() => setEditing(e)}>
                            <Pencil />
                          </Button>
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <WorkerDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} employee={editing === 'new' ? undefined : editing ?? undefined} />
    </div>
  )
}

const workerSchema = z.object({
  full_name: requiredText('The name', 120).refine((v) => v.length >= 2, 'Enter at least 2 characters'),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{0,20}$/, 'Letters, numbers and dashes only').optional(),
  job_title: optionalText(80),
  employment_type: z.enum(EMPLOYMENT_TYPES),
  phone: optionalText(40),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  user_id: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  emergency_contact: optionalText(160),
  notes: optionalText(2000),
  site_ids: z.array(z.string()),
})

function WorkerDialog({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee?: Employee }) {
  const { activeOrgId } = useAuth()
  const { data: sites = [] } = useSites()
  const { data: members = [] } = useMembers()
  const form = useForm<z.input<typeof workerSchema>>({ resolver: zodResolver(workerSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        full_name: employee?.full_name ?? '',
        code: employee?.code ?? '',
        job_title: employee?.job_title ?? '',
        employment_type: employee?.employment_type ?? 'permanent',
        phone: employee?.phone ?? '',
        email: employee?.email ?? '',
        user_id: employee?.user_id ?? '',
        start_date: employee?.start_date ?? '',
        end_date: employee?.end_date ?? '',
        status: employee?.status ?? 'active',
        emergency_contact: employee?.emergency_contact ?? '',
        notes: employee?.notes ?? '',
        site_ids: employee?.site_ids ?? [],
      })
  }, [open, employee, form])
  const save = useSave((v: z.output<typeof workerSchema>) => workforceService.save(activeOrgId!, employee?.id ?? null, v), {
    success: employee ? 'Worker saved' : 'Worker added',
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? `Edit ${employee.full_name}` : 'Add a worker'}
      submitLabel={employee ? 'Save' : 'Add worker'}
      pending={save.isPending}
      error={save.error}
      onSubmit={form.handleSubmit((v) => {
        const values = v as z.output<typeof workerSchema>
        if (values.start_date && values.end_date && values.end_date < values.start_date) return form.setError('end_date', { message: 'End date is before the start date' })
        save.mutate(values)
      })}
    >
      <FieldRow>
        <Field label="Full name" htmlFor="wk-name" error={errors.full_name?.message} required>
          <Input id="wk-name" maxLength={120} {...form.register('full_name')} />
        </Field>
        <Field label="Role" htmlFor="wk-role" error={errors.job_title?.message}>
          <Input id="wk-role" maxLength={80} placeholder="e.g. Pen attendant, Supervisor" {...form.register('job_title')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Employment" htmlFor="wk-type">
          <Select id="wk-type" {...form.register('employment_type')}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone" htmlFor="wk-phone" error={errors.phone?.message}>
          <Input id="wk-phone" type="tel" maxLength={40} {...form.register('phone')} />
        </Field>
      </FieldRow>
      <Field label="Works on" hint="Leave all unticked if they work on every site">
        <div className="grid gap-2 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="site_ids"
            render={({ field }) => (
              <>
                {sites.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={s.name}
                    checked={field.value.includes(s.id)}
                    onChange={(e) => field.onChange(e.target.checked ? [...field.value, s.id] : field.value.filter((x) => x !== s.id))}
                  />
                ))}
              </>
            )}
          />
        </div>
      </Field>
      <FieldRow>
        <Field label="Signs in as" htmlFor="wk-user" hint="Link their account so they see My tasks">
          <Select id="wk-user" {...form.register('user_id')}>
            <option value="">No account</option>
            {members
              .filter((m) => m.status === 'active')
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {memberName(m)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Worker code" htmlFor="wk-code" error={errors.code?.message}>
          <Input id="wk-code" maxLength={20} {...form.register('code')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Start date" htmlFor="wk-start">
          <Input id="wk-start" type="date" {...form.register('start_date')} />
        </Field>
        <Field label="End date" htmlFor="wk-end" error={errors.end_date?.message}>
          <Input id="wk-end" type="date" {...form.register('end_date')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Emergency contact" htmlFor="wk-emer" error={errors.emergency_contact?.message}>
          <Input id="wk-emer" maxLength={160} {...form.register('emergency_contact')} />
        </Field>
        <Field label="Status" htmlFor="wk-status">
          <Select id="wk-status" {...form.register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </FieldRow>
      <Field label="Notes" htmlFor="wk-notes">
        <Textarea id="wk-notes" rows={2} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}
