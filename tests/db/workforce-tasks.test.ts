import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, categoryId, createFarm, daysAgo, pool, rejects, rpc, today, type TestUser } from './helpers'

let F: Awaited<ReturnType<typeof createFarm>>
let manager: TestUser
let worker: TestUser
let otherWorker: TestUser
let employee: string
let cleaning: string

beforeAll(async () => {
  F = await createFarm('tasks')
  manager = (await addMember(F.owner, F.org, 'tasks-manager', 'manager')).user
  worker = (await addMember(F.owner, F.org, 'tasks-worker', 'worker')).user
  otherWorker = (await addMember(F.owner, F.org, 'tasks-worker2', 'worker')).user
  cleaning = await categoryId(F.org, 'activity', 'cleaning')
  employee = await rpc<string>(manager, 'save_employee', {
    p_employee: null, p_org: F.org, p_full_name: 'Musa Ibrahim', p_site_ids: [F.site], p_job_title: 'Pen attendant', p_phone: '0803 000 1111', p_user: worker.id,
  })
})

afterAll(async () => {
  await pool.end()
})

const task = (user: TestUser, extra: Record<string, unknown> = {}) =>
  rpc<string>(user, 'save_task', {
    p_task: null, p_org: F.org, p_site: F.site, p_production_type: 'general', p_category: cleaning, p_title: 'Wash drinkers, House A', p_due_on: today(), ...extra,
  })
const status = (user: TestUser, id: string, s: string, note?: string, log?: string) =>
  rpc<{ status: string; next_task_id: string | null }>(user, 'set_task_status', { p_task: id, p_status: s, p_note: note ?? null, p_activity_log: log ?? null })
const row = async (id: string) => (await pool.query(`select status, completed_by, reviewed_by, review_note, activity_log_id from planned_activities where id = $1`, [id])).rows[0]

describe('workers', () => {
  it('only workforce managers see contact details; everyone sees names for assignment', async () => {
    expect(await as(worker, (q) => q(`select full_name from employee_names where id = $1`, [employee]))).toEqual([{ full_name: 'Musa Ibrahim' }])
    // The worker sees their own record, but not colleagues' phone numbers.
    const colleague = await rpc<string>(F.owner, 'save_employee', { p_employee: null, p_org: F.org, p_full_name: 'Ada Obi', p_site_ids: [], p_phone: '0805 222 3333' })
    expect(await as(otherWorker, (q) => q(`select phone from employees where id = $1`, [colleague]))).toEqual([])
    expect((await as(worker, (q) => q<{ phone: string }>(`select phone from employees where id = $1`, [employee])))[0].phone).toBe('0803 000 1111')
    await rejects(rpc(worker, 'save_employee', { p_employee: null, p_org: F.org, p_full_name: 'Not allowed', p_site_ids: [] }), /workforce.manage/)

    const outsider = await createFarm('tasks-outsider')
    await rejects(rpc(F.owner, 'save_employee', { p_employee: null, p_org: F.org, p_full_name: 'Stranger', p_site_ids: [], p_user: outsider.owner.id }), /not a member/)
    expect(await as(outsider.owner, (q) => q(`select id from employee_names where id = $1`, [employee]))).toEqual([])
  })
})

describe('tasks', () => {
  it('assigned work needs the assignee, review needs a supervisor, and sent-back work must say why', async () => {
    const id = await task(manager, { p_assigned_employee: employee, p_requires_review: true, p_priority: 'high' })
    const summary = (await as(worker, (q) => q(`select assignee_name, is_overdue, priority from task_summaries where id = $1`, [id])))[0]
    expect(summary).toEqual({ assignee_name: 'Musa Ibrahim', is_overdue: false, priority: 'high' })

    await rejects(status(otherWorker, id, 'in_progress'), /assigned to someone else/)
    await status(worker, id, 'in_progress')
    const log = await rpc<{ activity_id: string }>(worker, 'log_activity', {
      p_key: crypto.randomUUID(), p_org: F.org, p_site: F.site, p_occurred_on: today(), p_production_type: 'general', p_category: cleaning, p_summary: 'Washed all drinkers',
    })
    const logId = log.activity_id
    expect((await status(worker, id, 'done', 'All clean', logId)).status).toBe('awaiting_review')
    expect((await row(id)).activity_log_id).toBe(logId)

    await rejects(status(worker, id, 'done'), /Only a supervisor can approve/)
    await rejects(status(manager, id, 'in_progress'), /what still needs doing/)
    await status(manager, id, 'in_progress', 'Drinker 4 still dirty')
    expect((await row(id)).status).toBe('in_progress')
    await status(worker, id, 'done')
    await status(manager, id, 'done', 'Checked')
    const done = await row(id)
    expect(done).toMatchObject({ status: 'done', completed_by: worker.id, reviewed_by: manager.id })
    await rejects(status(worker, id, 'done'), /already done/)
  })

  it('workers can plan unassigned tasks but not assign them; tables cannot be written directly', async () => {
    const id = await task(worker)
    await rejects(task(worker, { p_assigned_employee: employee }), /Manage tasks/)
    await rejects(task(worker, { p_priority: 'urgent' }), /Manage tasks/)
    // Anyone who records farm work can finish an unassigned task.
    expect((await status(otherWorker, id, 'done')).status).toBe('done')
    await rejects(
      as(worker, (q) => q(`insert into planned_activities (organization_id, site_id, production_type, category_id, title, due_on) values ($1, $2, 'general', $3, 'Sneaky', $4)`, [F.org, F.site, cleaning, today()])),
      /permission denied/,
    )
    await rejects(as(worker, (q) => q(`update planned_activities set status = 'done' where id = $1`, [id])), /permission denied/)
  })

  it('a repeating task schedules the next one when done, and overdue tasks are flagged', async () => {
    const id = await task(manager, { p_due_on: daysAgo(3), p_repeat_every_days: 7 })
    expect((await pool.query(`select is_overdue from task_summaries where id = $1`, [id])).rows[0].is_overdue).toBe(true)
    const r = await status(manager, id, 'done')
    expect(r.next_task_id).toBeTruthy()
    const next = (await pool.query(`select due_on::text as due, status, repeat_every_days from planned_activities where id = $1`, [r.next_task_id])).rows[0]
    expect(next).toEqual({ due: daysAgo(-7), status: 'planned', repeat_every_days: 7 })
  })

  it('another organization cannot see or change these tasks', async () => {
    const id = await task(manager)
    const other = await createFarm('tasks-other')
    expect(await as(other.owner, (q) => q(`select id from task_summaries where id = $1`, [id]))).toEqual([])
    await rejects(status(other.owner, id, 'done'), /not found/)
    await rejects(task(other.owner), /permission/)
  })
})
