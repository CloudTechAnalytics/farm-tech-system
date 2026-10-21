-- ============================================================================
-- Release 2 · 0003 Workforce and tasks.
--
-- Employees are the people who work on the farm, with or without an account.
-- Tasks extend the existing `planned_activities` (no second task table): they
-- gain an assignee, priority, in-progress and review states, a repeat
-- interval and a link to the daily-log entry that records the work.
-- Status changes go through `set_task_status` so the review rule holds.
-- ============================================================================

insert into public.permissions (key, area, label, description, sort_order) values
  ('workforce.manage', 'People', 'Manage workers',  'Add and edit employee records, roles and site assignments', 60),
  ('tasks.manage',     'People', 'Manage tasks',    'Assign tasks, set priorities and review completed work', 61)
on conflict (key) do nothing;

select private.grant_permission_to_templates('workforce.manage', array['owner', 'manager']);
select private.grant_permission_to_templates('tasks.manage', array['owner', 'manager']);

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  code             text check (code is null or code ~ '^[A-Za-z0-9-]{1,20}$'),
  full_name        text not null check (length(trim(full_name)) between 2 and 120),
  job_title        text check (job_title is null or length(job_title) <= 80),
  employment_type  text not null default 'permanent' check (employment_type in ('permanent', 'casual', 'contract', 'seasonal')),
  phone            text check (phone is null or length(phone) <= 40),
  email            extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id          uuid references public.profiles (id) on delete set null,
  start_date       date,
  end_date         date,
  status           text not null default 'active' check (status in ('active', 'inactive')),
  emergency_contact text check (emergency_contact is null or length(emergency_contact) <= 160),
  notes            text check (notes is null or length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code),
  unique (organization_id, user_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create trigger trg_employees_updated_at before update on public.employees
  for each row execute function private.set_updated_at();
create trigger trg_audit_employees after insert or update on public.employees
  for each row execute function private.audit_row_change();

-- A linked account must belong to the same organization.
create or replace function private.check_employee_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.memberships m where m.organization_id = new.organization_id and m.user_id = new.user_id and m.status <> 'removed'
  ) then
    raise exception 'That account is not a member of this organization.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger trg_check_employee_user before insert or update of user_id on public.employees
  for each row execute function private.check_employee_user();

create table public.employee_sites (
  employee_id      uuid not null,
  organization_id  uuid not null,
  site_id          uuid not null,
  primary key (employee_id, site_id),
  foreign key (employee_id, organization_id) references public.employees (id, organization_id) on delete cascade,
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id) on delete cascade
);

-- Names only, for assignee pickers and task lists. Phone numbers and notes
-- stay behind workforce permissions on the table itself.
create view public.employee_names with (security_barrier = true) as
select e.id, e.organization_id, e.full_name, e.job_title, e.status, e.user_id,
  coalesce((select array_agg(es.site_id) from public.employee_sites es where es.employee_id = e.id), '{}') as site_ids
from public.employees e
where public.is_org_member(e.organization_id);

-- ---------------------------------------------------------------------------
-- Tasks: extend planned_activities
-- ---------------------------------------------------------------------------
alter table public.planned_activities
  add column assigned_employee_id uuid,
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  add column requires_review boolean not null default false,
  add column started_at timestamptz,
  add column submitted_at timestamptz,
  add column completed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or length(review_note) <= 500),
  add column completion_note text check (completion_note is null or length(completion_note) <= 1000),
  add column activity_log_id uuid,
  add column repeat_every_days integer check (repeat_every_days is null or repeat_every_days between 1 and 365),
  add column repeats_from_id uuid references public.planned_activities (id) on delete set null,
  add constraint planned_activities_employee_fk foreign key (assigned_employee_id, organization_id) references public.employees (id, organization_id),
  add constraint planned_activities_log_fk foreign key (activity_log_id) references public.activity_logs (id) on delete set null,
  add constraint planned_activities_id_org unique (id, organization_id);

alter table public.planned_activities drop constraint planned_activities_status_check;
alter table public.planned_activities add constraint planned_activities_status_check
  check (status in ('planned', 'in_progress', 'awaiting_review', 'done', 'cancelled'));

create index idx_tasks_assignee on public.planned_activities (assigned_employee_id) where status in ('planned', 'in_progress', 'awaiting_review');
drop index if exists public.idx_planned_activities_due;
create index idx_planned_activities_due on public.planned_activities (organization_id, due_on) where status in ('planned', 'in_progress', 'awaiting_review');

create trigger trg_audit_planned_activities after update on public.planned_activities
  for each row execute function private.audit_row_change();

-- Writes now go through the RPCs below.
revoke insert, update on public.planned_activities from authenticated;

create or replace function private.is_task_assignee(p_task public.planned_activities)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.employees e where e.id = p_task.assigned_employee_id and e.user_id = auth.uid());
$$;

-- Create (p_task null) or edit a task. Assigning or prioritising needs tasks.manage.
create or replace function public.save_task(
  p_task uuid,
  p_org uuid,
  p_site uuid,
  p_production_type text,
  p_category uuid,
  p_title text,
  p_due_on date,
  p_batch uuid default null,
  p_crop_cycle uuid default null,
  p_notes text default null,
  p_assigned_employee uuid default null,
  p_priority text default 'normal',
  p_requires_review boolean default false,
  p_repeat_every_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.planned_activities;
  v_id uuid;
  v_manage boolean;
begin
  perform private.require(p_org, p_site, 'operations.record');
  v_manage := public.has_permission(p_org, 'tasks.manage');
  if p_task is not null then
    select * into v from public.planned_activities where id = p_task and organization_id = p_org for update;
    if not found or not public.has_site_access(p_org, v.site_id) then raise exception 'Task not found.' using errcode = 'P0002'; end if;
    if v.status in ('done', 'cancelled') then raise exception 'A finished task cannot be edited.' using errcode = 'P0001'; end if;
    if not v_manage and v.created_by is distinct from auth.uid() then
      raise exception 'Only the person who created this task, or a supervisor, can edit it.' using errcode = '42501';
    end if;
  end if;
  if not v_manage and (
       p_assigned_employee is distinct from coalesce(v.assigned_employee_id, null)
    or coalesce(p_priority, 'normal') is distinct from coalesce(v.priority, 'normal')
    or coalesce(p_requires_review, false) is distinct from coalesce(v.requires_review, false)) then
    raise exception 'Assigning tasks, setting priority and review need the Manage tasks permission.' using errcode = '42501';
  end if;
  if p_production_type not in ('poultry', 'fish', 'crop', 'general') then raise exception 'Choose the area of the farm.' using errcode = '22023'; end if;
  if not exists (select 1 from public.categories where id = p_category and organization_id = p_org and kind = 'activity') then
    raise exception 'Choose an activity type.' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_title)), 0) < 2 then raise exception 'Give the task a title.' using errcode = '22023'; end if;
  if p_due_on is null then raise exception 'Enter a due date.' using errcode = '22023'; end if;
  if p_assigned_employee is not null and not exists (
    select 1 from public.employees e where e.id = p_assigned_employee and e.organization_id = p_org and e.status = 'active'
      and (not exists (select 1 from public.employee_sites es where es.employee_id = e.id)
           or exists (select 1 from public.employee_sites es where es.employee_id = e.id and es.site_id = p_site))
  ) then
    raise exception 'Choose an active worker assigned to this site.' using errcode = '22023';
  end if;

  if p_task is null then
    insert into public.planned_activities (organization_id, site_id, production_type, batch_id, crop_cycle_id, category_id, title, due_on, notes,
      assigned_employee_id, priority, requires_review, repeat_every_days)
    values (p_org, p_site, p_production_type, p_batch, p_crop_cycle, p_category, trim(p_title), p_due_on, nullif(trim(p_notes), ''),
      p_assigned_employee, coalesce(p_priority, 'normal'), coalesce(p_requires_review, false), p_repeat_every_days)
    returning id into v_id;
  else
    update public.planned_activities set site_id = p_site, production_type = p_production_type, batch_id = p_batch, crop_cycle_id = p_crop_cycle,
      category_id = p_category, title = trim(p_title), due_on = p_due_on, notes = nullif(trim(p_notes), ''),
      assigned_employee_id = p_assigned_employee, priority = coalesce(p_priority, 'normal'),
      requires_review = coalesce(p_requires_review, false), repeat_every_days = p_repeat_every_days
    where id = p_task;
    v_id := p_task;
  end if;
  return v_id;
end;
$$;

-- planned → in_progress → done, or → awaiting_review → done / back to in_progress.
create or replace function public.set_task_status(
  p_task uuid, p_status text, p_note text default null, p_activity_log uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.planned_activities;
  v_manage boolean;
  v_worker boolean;
  v_new text := p_status;
  v_next uuid;
begin
  select * into v from public.planned_activities where id = p_task for update;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then raise exception 'Task not found.' using errcode = 'P0002'; end if;
  v_manage := public.has_permission(v.organization_id, 'tasks.manage');
  -- Anyone who records farm work may work on unassigned tasks; assigned tasks belong to the assignee and supervisors.
  v_worker := public.has_permission(v.organization_id, 'operations.record')
    and (v.assigned_employee_id is null or private.is_task_assignee(v) or v_manage);
  if p_activity_log is not null and not exists (
    select 1 from public.activity_logs where id = p_activity_log and organization_id = v.organization_id and site_id = v.site_id and voided_at is null
  ) then
    raise exception 'The linked daily-log entry was not found on this site.' using errcode = 'P0002';
  end if;

  if p_status = 'in_progress' then
    if not v_worker then raise exception 'This task is assigned to someone else.' using errcode = '42501'; end if;
    if v.status = 'awaiting_review' then
      -- A supervisor sends the work back.
      if not v_manage then raise exception 'Only a supervisor can send work back.' using errcode = '42501'; end if;
      if coalesce(trim(p_note), '') = '' then raise exception 'Say what still needs doing.' using errcode = '22023'; end if;
      update public.planned_activities set status = 'in_progress', review_note = trim(p_note), reviewed_by = auth.uid(), reviewed_at = now() where id = p_task;
    elsif v.status = 'planned' then
      update public.planned_activities set status = 'in_progress', started_at = now() where id = p_task;
    else
      raise exception 'This task cannot be started from its current state.' using errcode = 'P0001';
    end if;

  elsif p_status = 'done' then
    if v.status = 'awaiting_review' then
      if not v_manage then raise exception 'Only a supervisor can approve this work.' using errcode = '42501'; end if;
      update public.planned_activities set status = 'done', reviewed_by = auth.uid(), reviewed_at = now(),
        review_note = coalesce(nullif(trim(p_note), ''), review_note) where id = p_task;
    elsif v.status in ('planned', 'in_progress') then
      if not v_worker then raise exception 'This task is assigned to someone else.' using errcode = '42501'; end if;
      v_new := case when v.requires_review then 'awaiting_review' else 'done' end;
      update public.planned_activities set status = v_new, completed_by = auth.uid(),
        completed_at = case when v_new = 'done' then now() end,
        submitted_at = case when v_new = 'awaiting_review' then now() end,
        started_at = coalesce(started_at, now()),
        completion_note = nullif(trim(p_note), ''), activity_log_id = coalesce(p_activity_log, activity_log_id)
      where id = p_task;
    else
      raise exception 'This task is already %.', replace(v.status, '_', ' ') using errcode = 'P0001';
    end if;
    if v_new = 'done' then
      update public.planned_activities set completed_at = coalesce(completed_at, now()) where id = p_task;
    end if;

  elsif p_status = 'cancelled' then
    if not v_manage and v.created_by is distinct from auth.uid() then
      raise exception 'Only the person who created this task, or a supervisor, can cancel it.' using errcode = '42501';
    end if;
    if v.status in ('done', 'cancelled') then raise exception 'This task is already finished.' using errcode = 'P0001'; end if;
    update public.planned_activities set status = 'cancelled', review_note = nullif(trim(p_note), '') where id = p_task;
  else
    raise exception 'Unknown status.' using errcode = '22023';
  end if;

  -- A repeating task schedules its next occurrence once this one is done.
  if v_new = 'done' and v.repeat_every_days is not null
     and not exists (select 1 from public.planned_activities where repeats_from_id = p_task) then
    insert into public.planned_activities (organization_id, site_id, production_type, batch_id, crop_cycle_id, category_id, title, due_on, notes,
      assigned_employee_id, priority, requires_review, repeat_every_days, repeats_from_id, created_by)
    values (v.organization_id, v.site_id, v.production_type, v.batch_id, v.crop_cycle_id, v.category_id, v.title,
      greatest(v.due_on, public.org_today(v.organization_id)) + v.repeat_every_days, v.notes,
      v.assigned_employee_id, v.priority, v.requires_review, v.repeat_every_days, p_task, v.created_by)
    returning id into v_next;
  end if;

  return jsonb_build_object('status', (select status from public.planned_activities where id = p_task), 'next_task_id', v_next);
end;
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view public.task_summaries with (security_invoker = true) as
select
  pa.*,
  fs.name as site_name,
  c.name as category_name,
  b.code as batch_code,
  cc.code as crop_cycle_code,
  en.full_name as assignee_name,
  en.user_id as assignee_user_id,
  coalesce(cp.full_name, cp.email::text) as created_by_name,
  coalesce(rp.full_name, rp.email::text) as reviewed_by_name,
  al.summary as activity_summary,
  (pa.status in ('planned', 'in_progress') and pa.due_on < public.org_today(pa.organization_id)) as is_overdue
from public.planned_activities pa
join public.farm_sites fs on fs.id = pa.site_id
join public.categories c on c.id = pa.category_id
left join public.batches b on b.id = pa.batch_id
left join public.crop_cycles cc on cc.id = pa.crop_cycle_id
left join public.employee_names en on en.id = pa.assigned_employee_id
left join public.profiles cp on cp.id = pa.created_by
left join public.profiles rp on rp.id = pa.reviewed_by
left join public.activity_logs al on al.id = pa.activity_log_id;

create view public.employee_summaries with (security_invoker = true) as
select
  e.*,
  coalesce(p.full_name, p.email::text) as account_name,
  coalesce((select array_agg(fs.name order by fs.name) from public.employee_sites es join public.farm_sites fs on fs.id = es.site_id where es.employee_id = e.id), '{}') as site_names,
  coalesce((select array_agg(es.site_id) from public.employee_sites es where es.employee_id = e.id), '{}') as site_ids,
  (select count(*) from public.planned_activities t where t.assigned_employee_id = e.id and t.status in ('planned', 'in_progress', 'awaiting_review'))::integer as open_tasks,
  (select count(*) from public.planned_activities t where t.assigned_employee_id = e.id and t.status in ('planned', 'in_progress')
     and t.due_on < public.org_today(e.organization_id))::integer as overdue_tasks
from public.employees e
left join public.profiles p on p.id = e.user_id;

-- ---------------------------------------------------------------------------
-- Employee RPC: details and site assignments in one step
-- ---------------------------------------------------------------------------
create or replace function public.save_employee(
  p_employee uuid, p_org uuid, p_full_name text, p_site_ids uuid[],
  p_code text default null, p_job_title text default null, p_employment_type text default 'permanent',
  p_phone text default null, p_email text default null, p_user uuid default null,
  p_start_date date default null, p_end_date date default null, p_status text default 'active',
  p_emergency_contact text default null, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_employee;
begin
  perform private.require(p_org, null, 'workforce.manage');
  if exists (select 1 from unnest(coalesce(p_site_ids, '{}')) s where not exists (select 1 from public.farm_sites f where f.id = s and f.organization_id = p_org)) then
    raise exception 'Farm site not found.' using errcode = 'P0002';
  end if;
  if v_id is null then
    insert into public.employees (organization_id, code, full_name, job_title, employment_type, phone, email, user_id, start_date, end_date, status, emergency_contact, notes)
    values (p_org, nullif(trim(p_code), ''), trim(p_full_name), nullif(trim(p_job_title), ''), coalesce(p_employment_type, 'permanent'),
      nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_user, p_start_date, p_end_date, coalesce(p_status, 'active'),
      nullif(trim(p_emergency_contact), ''), nullif(trim(p_notes), ''))
    returning id into v_id;
  else
    update public.employees set code = nullif(trim(p_code), ''), full_name = trim(p_full_name), job_title = nullif(trim(p_job_title), ''),
      employment_type = coalesce(p_employment_type, 'permanent'), phone = nullif(trim(p_phone), ''), email = nullif(trim(p_email), ''),
      user_id = p_user, start_date = p_start_date, end_date = p_end_date, status = coalesce(p_status, 'active'),
      emergency_contact = nullif(trim(p_emergency_contact), ''), notes = nullif(trim(p_notes), '')
    where id = v_id and organization_id = p_org;
    if not found then raise exception 'Worker not found.' using errcode = 'P0002'; end if;
    delete from public.employee_sites where employee_id = v_id;
  end if;
  insert into public.employee_sites (employee_id, organization_id, site_id)
  select v_id, p_org, s from unnest(coalesce(p_site_ids, '{}')) s on conflict do nothing;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.employees      enable row level security;
alter table public.employee_sites enable row level security;

create policy employees_select on public.employees for select to authenticated
  using (public.has_permission(organization_id, 'workforce.manage') or public.has_permission(organization_id, 'tasks.manage') or user_id = auth.uid());
create policy employee_sites_select on public.employee_sites for select to authenticated
  using (public.has_permission(organization_id, 'workforce.manage') or public.has_permission(organization_id, 'tasks.manage'));

revoke all on public.employees, public.employee_sites from anon, authenticated;
grant select on public.employees, public.employee_sites to authenticated;
grant select on public.employee_names, public.task_summaries, public.employee_summaries to authenticated;
revoke all on public.employee_names, public.task_summaries, public.employee_summaries from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.save_task(uuid, uuid, uuid, text, uuid, text, date, uuid, uuid, text, uuid, text, boolean, integer),
  public.set_task_status(uuid, text, text, uuid),
  public.save_employee(uuid, uuid, text, uuid[], text, text, text, text, text, uuid, date, date, text, text, text)
  to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
