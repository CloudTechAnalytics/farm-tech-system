import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'
import type { ActivityProductionType } from '@/shared/lib/permissions'

export type TaskStatus = 'planned' | 'in_progress' | 'awaiting_review' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export const TASK_STATUS: Record<TaskStatus, { label: string; variant: 'info' | 'warning' | 'primary' | 'success' | 'neutral' }> = {
  planned: { label: 'To do', variant: 'info' },
  in_progress: { label: 'In progress', variant: 'warning' },
  awaiting_review: { label: 'Awaiting review', variant: 'primary' },
  done: { label: 'Done', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export const PRIORITY: Record<TaskPriority, { label: string; variant: 'neutral' | 'outline' | 'warning' | 'danger' }> = {
  low: { label: 'Low', variant: 'outline' },
  normal: { label: 'Normal', variant: 'neutral' },
  high: { label: 'High', variant: 'warning' },
  urgent: { label: 'Urgent', variant: 'danger' },
}

export interface Task {
  id: string
  organization_id: string
  site_id: string
  site_name: string
  production_type: ActivityProductionType
  batch_id: string | null
  batch_code: string | null
  crop_cycle_id: string | null
  crop_cycle_code: string | null
  category_id: string
  category_name: string
  title: string
  due_on: string
  status: TaskStatus
  priority: TaskPriority
  requires_review: boolean
  notes: string | null
  assigned_employee_id: string | null
  assignee_name: string | null
  assignee_user_id: string | null
  created_by: string | null
  created_by_name: string | null
  reviewed_by_name: string | null
  review_note: string | null
  completion_note: string | null
  activity_log_id: string | null
  activity_summary: string | null
  repeat_every_days: number | null
  started_at: string | null
  submitted_at: string | null
  completed_at: string | null
  is_overdue: boolean
  created_at: string
}

export interface TaskInput {
  site_id: string
  production_type: ActivityProductionType
  category_id: string
  title: string
  due_on: string
  batch_id?: string
  crop_cycle_id?: string
  notes?: string
  assigned_employee_id?: string
  priority: TaskPriority
  requires_review: boolean
  repeat_every_days?: number | null
}

export interface TaskFilters {
  siteId?: string
  /** open = to do + in progress + awaiting review */
  status?: 'open' | TaskStatus | ''
  assignee?: string
  mineUserId?: string
  overdueOnly?: boolean
  priority?: string
  search?: string
  from?: string
  to?: string
}

export const EMPLOYMENT_TYPES = ['permanent', 'casual', 'contract', 'seasonal'] as const
export const EMPLOYMENT_LABEL: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  permanent: 'Permanent',
  casual: 'Casual',
  contract: 'Contract',
  seasonal: 'Seasonal',
}

export interface Employee {
  id: string
  organization_id: string
  code: string | null
  full_name: string
  job_title: string | null
  employment_type: (typeof EMPLOYMENT_TYPES)[number]
  phone: string | null
  email: string | null
  user_id: string | null
  account_name: string | null
  start_date: string | null
  end_date: string | null
  status: 'active' | 'inactive'
  emergency_contact: string | null
  notes: string | null
  site_ids: string[]
  site_names: string[]
  open_tasks: number
  overdue_tasks: number
}

export interface EmployeeInput {
  full_name: string
  site_ids: string[]
  code?: string
  job_title?: string
  employment_type: Employee['employment_type']
  phone?: string
  email?: string
  user_id?: string
  start_date?: string
  end_date?: string
  status: Employee['status']
  emergency_contact?: string
  notes?: string
}

const clean = (s?: string) => (s ?? '').replace(/[,()%]/g, ' ').trim()

export const tasksService = {
  async list(orgId: string, f: TaskFilters = {}): Promise<Task[]> {
    let q = supabase.from('task_summaries').select('*').eq('organization_id', orgId).order('due_on').order('created_at').limit(500)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.status === 'open') q = q.in('status', ['planned', 'in_progress', 'awaiting_review'])
    else if (f.status) q = q.eq('status', f.status)
    if (f.assignee === 'unassigned') q = q.is('assigned_employee_id', null)
    else if (f.assignee) q = q.eq('assigned_employee_id', f.assignee)
    if (f.mineUserId) q = q.eq('assignee_user_id', f.mineUserId)
    if (f.overdueOnly) q = q.eq('is_overdue', true)
    if (f.priority) q = q.eq('priority', f.priority)
    if (f.from) q = q.gte('due_on', f.from)
    if (f.to) q = q.lte('due_on', f.to)
    const s = clean(f.search)
    if (s) q = q.or(`title.ilike.%${s}%,assignee_name.ilike.%${s}%,category_name.ilike.%${s}%,batch_code.ilike.%${s}%,crop_cycle_code.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as Task[]
  },

  async save(orgId: string, taskId: string | null, v: TaskInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_task', {
      // null creates a new task
      p_task: taskId as string,
      p_org: orgId,
      p_site: v.site_id,
      p_production_type: v.production_type,
      p_category: v.category_id,
      p_title: v.title,
      p_due_on: v.due_on,
      p_batch: blankToNull(v.batch_id) ?? undefined,
      p_crop_cycle: blankToNull(v.crop_cycle_id) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
      p_assigned_employee: blankToNull(v.assigned_employee_id) ?? undefined,
      p_priority: v.priority,
      p_requires_review: v.requires_review,
      p_repeat_every_days: v.repeat_every_days ?? undefined,
    })
    if (error) throw error
    return data as string
  },

  async setStatus(taskId: string, status: 'in_progress' | 'done' | 'cancelled', opts: { note?: string; activityLogId?: string } = {}) {
    const { data, error } = await supabase.rpc('set_task_status', {
      p_task: taskId,
      p_status: status,
      p_note: blankToNull(opts.note) ?? undefined,
      p_activity_log: blankToNull(opts.activityLogId) ?? undefined,
    })
    if (error) throw error
    return data as { status: TaskStatus; next_task_id: string | null }
  },

  /** Recent daily-log entries on a site, to link as the record of the work. */
  async recentLogEntries(siteId: string) {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('activity_logs')
      .select('id, occurred_on, summary')
      .eq('site_id', siteId)
      .is('voided_at', null)
      .gte('occurred_on', since)
      .order('occurred_on', { ascending: false })
      .order('occurred_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data ?? []
  },
}

export const workforceService = {
  async list(orgId: string, f: { search?: string; status?: string; siteId?: string } = {}): Promise<Employee[]> {
    let q = supabase.from('employee_summaries').select('*').eq('organization_id', orgId).order('full_name').limit(500)
    if (f.status) q = q.eq('status', f.status)
    if (f.siteId) q = q.contains('site_ids', [f.siteId])
    const s = clean(f.search)
    if (s) q = q.or(`full_name.ilike.%${s}%,job_title.ilike.%${s}%,phone.ilike.%${s}%,code.ilike.%${s}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as Employee[]
  },

  /** Names visible to every member, for assignee pickers. */
  async names(orgId: string) {
    const { data, error } = await supabase.from('employee_names').select('id, full_name, job_title, status, user_id, site_ids').eq('organization_id', orgId).order('full_name')
    if (error) throw error
    return data ?? []
  },

  async save(orgId: string, employeeId: string | null, v: EmployeeInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_employee', {
      // null creates a new worker
      p_employee: employeeId as string,
      p_org: orgId,
      p_full_name: v.full_name,
      p_site_ids: v.site_ids,
      p_code: blankToNull(v.code) ?? undefined,
      p_job_title: blankToNull(v.job_title) ?? undefined,
      p_employment_type: v.employment_type,
      p_phone: blankToNull(v.phone) ?? undefined,
      p_email: blankToNull(v.email) ?? undefined,
      p_user: blankToNull(v.user_id) ?? undefined,
      p_start_date: blankToNull(v.start_date) ?? undefined,
      p_end_date: blankToNull(v.end_date) ?? undefined,
      p_status: v.status,
      p_emergency_contact: blankToNull(v.emergency_contact) ?? undefined,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
    return data as string
  },
}
