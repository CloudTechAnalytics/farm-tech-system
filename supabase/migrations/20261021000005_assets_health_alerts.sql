-- ============================================================================
-- Release 2 · 0005 Equipment and assets, health and biosecurity, and alerts
-- for every new module.
--
-- Maintenance paid on the spot is one finance expense linked to the record;
-- work billed by a supplier is paid through the bill instead, never both.
-- Treatments that use stock write one consumption movement. A treatment with
-- a withdrawal period blocks selling produce or animals from that batch or
-- crop cycle until it ends.
-- ============================================================================

insert into public.permissions (key, area, label, description, sort_order) values
  ('assets.view',   'Assets', 'View equipment',          'See equipment, maintenance schedules and service history', 70),
  ('assets.manage', 'Assets', 'Manage equipment',        'Add equipment, plan maintenance and record repairs', 71),
  ('health.view',   'Health', 'View health records',     'See treatments, vaccinations, incidents and water quality', 72),
  ('health.record', 'Health', 'Record health events',    'Record treatments, vaccinations, inspections, incidents and water tests', 73)
on conflict (key) do nothing;

select private.grant_permission_to_templates('assets.view', array['owner', 'manager', 'accountant', 'worker']);
select private.grant_permission_to_templates('assets.manage', array['owner', 'manager']);
select private.grant_permission_to_templates('health.view', array['owner', 'manager']);
select private.grant_permission_to_templates('health.record', array['owner', 'manager']);

-- ===========================================================================
-- Equipment and assets
-- ===========================================================================
create table public.assets (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  site_id             uuid not null,
  code                text check (code is null or code ~ '^[A-Za-z0-9-]{1,20}$'),
  name                text not null check (length(trim(name)) between 2 and 120),
  category            text not null default 'equipment'
                        check (category in ('vehicle', 'tractor', 'generator', 'pump', 'building', 'equipment', 'tool', 'other')),
  production_unit_id  uuid,
  make                text check (make is null or length(make) <= 80),
  model               text check (model is null or length(model) <= 80),
  serial_number       text check (serial_number is null or length(serial_number) <= 80),
  purchase_date       date,
  purchase_cost       numeric(14, 2) check (purchase_cost is null or purchase_cost >= 0),
  supplier_id         uuid,
  warranty_until      date,
  condition           text not null default 'good' check (condition in ('good', 'fair', 'poor', 'out_of_service')),
  out_of_service_since timestamptz,
  status              text not null default 'active' check (status in ('active', 'disposed')),
  notes               text check (notes is null or length(notes) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (organization_id, code),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (production_unit_id, site_id) references public.production_units (id, site_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id)
);

create trigger trg_assets_updated_at before update on public.assets
  for each row execute function private.set_updated_at();
create trigger trg_audit_assets after insert or update on public.assets
  for each row execute function private.audit_row_change();

-- Track when equipment went out of service, for downtime.
create or replace function private.track_out_of_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.condition = 'out_of_service' and (tg_op = 'INSERT' or old.condition is distinct from 'out_of_service') then
    new.out_of_service_since := now();
  elsif new.condition <> 'out_of_service' then
    new.out_of_service_since := null;
  end if;
  return new;
end;
$$;

create trigger trg_track_out_of_service before insert or update of condition on public.assets
  for each row execute function private.track_out_of_service();

create table public.maintenance_plans (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  asset_id         uuid not null,
  title            text not null check (length(trim(title)) between 2 and 160),
  interval_days    integer not null check (interval_days between 1 and 3650),
  next_due_on      date not null,
  last_done_on     date,
  is_active        boolean not null default true,
  notes            text check (notes is null or length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (asset_id, site_id) references public.assets (id, site_id) on delete cascade
);

create trigger trg_maintenance_plans_updated_at before update on public.maintenance_plans
  for each row execute function private.set_updated_at();
create trigger trg_audit_maintenance_plans after insert or update on public.maintenance_plans
  for each row execute function private.audit_row_change();

create table public.maintenance_records (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  site_id                 uuid not null,
  asset_id                uuid not null,
  maintenance_plan_id     uuid,
  kind                    text not null check (kind in ('service', 'repair', 'inspection')),
  performed_on            date not null,
  description             text not null check (length(trim(description)) between 2 and 500),
  cost                    numeric(14, 2) check (cost is null or cost >= 0),
  downtime_hours          numeric(8, 2) check (downtime_hours is null or downtime_hours >= 0),
  performed_by            text check (performed_by is null or length(performed_by) <= 120),
  supplier_id             uuid,
  supplier_bill_id        uuid,
  finance_transaction_id  uuid unique,
  condition_after         text check (condition_after in ('good', 'fair', 'poor', 'out_of_service')),
  status                  text not null default 'posted' check (status in ('posted', 'voided')),
  void_reason             text,
  voided_at               timestamptz,
  recorded_by             uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (asset_id, site_id) references public.assets (id, site_id),
  foreign key (maintenance_plan_id, organization_id) references public.maintenance_plans (id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (supplier_bill_id, organization_id) references public.supplier_bills (id, organization_id),
  foreign key (finance_transaction_id, organization_id) references public.finance_transactions (id, organization_id),
  check (finance_transaction_id is null or supplier_bill_id is null),
  check ((status = 'voided') = (voided_at is not null))
);

create index idx_maintenance_records_asset on public.maintenance_records (asset_id, performed_on desc);

create or replace function public.record_maintenance(
  p_key uuid, p_asset uuid, p_kind text, p_performed_on date, p_description text,
  p_plan uuid default null, p_cost numeric default null, p_paid_now boolean default false, p_payment_method text default null,
  p_supplier uuid default null, p_supplier_bill uuid default null, p_downtime_hours numeric default null,
  p_performed_by text default null, p_condition_after text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.assets;
  v_prev jsonb;
  v_id uuid;
  v_txn uuid;
  v_p public.maintenance_plans;
begin
  select * into v_a from public.assets where id = p_asset;
  if not found or not public.has_site_access(v_a.organization_id, v_a.site_id) then
    raise exception 'Equipment not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_a.organization_id, p_key, 'record_maintenance');
  if v_prev is not null then return v_prev; end if;
  perform private.require(v_a.organization_id, v_a.site_id, 'assets.manage');
  perform private.require_date(p_performed_on);
  if v_a.status <> 'active' then raise exception '% has been disposed of.', v_a.name using errcode = 'P0001'; end if;
  if p_kind not in ('service', 'repair', 'inspection') then raise exception 'Choose service, repair or inspection.' using errcode = '22023'; end if;
  if coalesce(length(trim(p_description)), 0) < 2 then raise exception 'Describe the work done.' using errcode = '22023'; end if;
  if p_cost is not null and p_cost < 0 then raise exception 'Cost cannot be negative.' using errcode = '22023'; end if;
  if coalesce(p_paid_now, false) and p_supplier_bill is not null then
    raise exception 'This cost is on a supplier bill; pay the bill instead of recording it as paid here.' using errcode = '22023';
  end if;
  if p_supplier_bill is not null and not exists (select 1 from public.supplier_bills where id = p_supplier_bill and organization_id = v_a.organization_id and status = 'posted') then
    raise exception 'Supplier bill not found.' using errcode = 'P0002';
  end if;
  if p_supplier is not null and not exists (select 1 from public.suppliers where id = p_supplier and organization_id = v_a.organization_id) then
    raise exception 'Supplier not found.' using errcode = 'P0002';
  end if;
  if p_plan is not null then
    select * into v_p from public.maintenance_plans where id = p_plan and asset_id = p_asset for update;
    if not found then raise exception 'That schedule is not for this equipment.' using errcode = 'P0002'; end if;
  end if;
  if coalesce(p_paid_now, false) then
    if coalesce(p_cost, 0) <= 0 then raise exception 'Enter the cost to record it as paid.' using errcode = '22023'; end if;
    if p_payment_method is null then raise exception 'Choose how it was paid.' using errcode = '22023'; end if;
    perform private.require(v_a.organization_id, v_a.site_id, 'finance.record');
    v_txn := private.insert_finance(v_a.organization_id, v_a.site_id, 'expense', private.category_id(v_a.organization_id, 'expense', 'repairs'),
      p_cost, p_performed_on, p_payment_method, left(initcap(p_kind) || ': ' || v_a.name || ' — ' || trim(p_description), 300),
      null, (select left(name, 120) from public.suppliers where id = p_supplier), 'general');
  end if;

  insert into public.maintenance_records (organization_id, site_id, asset_id, maintenance_plan_id, kind, performed_on, description, cost,
    downtime_hours, performed_by, supplier_id, supplier_bill_id, finance_transaction_id, condition_after)
  values (v_a.organization_id, v_a.site_id, p_asset, p_plan, p_kind, p_performed_on, trim(p_description), p_cost,
    p_downtime_hours, nullif(trim(p_performed_by), ''), p_supplier, p_supplier_bill, v_txn, p_condition_after)
  returning id into v_id;

  if p_plan is not null then
    update public.maintenance_plans set last_done_on = greatest(coalesce(last_done_on, p_performed_on), p_performed_on),
      next_due_on = greatest(coalesce(last_done_on, p_performed_on), p_performed_on) + interval_days
    where id = p_plan;
  end if;
  if p_condition_after is not null then update public.assets set condition = p_condition_after where id = p_asset; end if;

  perform private.log_system(v_a.organization_id, v_a.site_id, p_performed_on, 'general', 'maintenance',
    initcap(p_kind) || ': ' || v_a.name || ' — ' || trim(p_description), p_finance => v_txn);
  return private.idem_finish(v_a.organization_id, p_key, 'record_maintenance', jsonb_build_object('maintenance_record_id', v_id, 'finance_transaction_id', v_txn));
end;
$$;

create or replace function public.void_maintenance_record(p_key uuid, p_record uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.maintenance_records;
  v_prev jsonb;
  v_t public.finance_transactions;
  v_rev uuid;
begin
  select * into v_r from public.maintenance_records where id = p_record;
  if not found or not public.has_site_access(v_r.organization_id, v_r.site_id) then
    raise exception 'Maintenance record not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_r.organization_id, p_key, 'void_maintenance_record');
  if v_prev is not null then return v_prev; end if;
  select * into v_r from public.maintenance_records where id = p_record for update;
  perform private.require(v_r.organization_id, v_r.site_id, 'assets.manage');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = '22023'; end if;
  if v_r.status = 'voided' then raise exception 'This record is already voided.' using errcode = 'P0001'; end if;
  -- Voided first, so the reversal guard below recognises this as the record's own correction.
  update public.maintenance_records set status = 'voided', voided_at = now(), void_reason = trim(p_reason) where id = p_record;
  if v_r.finance_transaction_id is not null then
    perform private.require(v_r.organization_id, v_r.site_id, 'finance.reverse');
    select * into v_t from public.finance_transactions where id = v_r.finance_transaction_id for update;
    if v_t.status = 'posted' then
      insert into public.finance_transactions (organization_id, site_id, txn_date, kind, category_id, amount, currency, payment_method,
        description, reference, counterparty, production_type, reverses_id, reversal_reason, recorded_by)
      values (v_t.organization_id, v_t.site_id, current_date, v_t.kind, v_t.category_id, -v_t.amount, v_t.currency, v_t.payment_method,
        left('Reversal: ' || v_t.description, 300), v_t.reference, v_t.counterparty, v_t.production_type, v_t.id, trim(p_reason), auth.uid())
      returning id into v_rev;
      update public.finance_transactions set status = 'reversed' where id = v_t.id;
    end if;
  end if;
  perform private.audit(v_r.organization_id, v_r.site_id, 'maintenance.voided', 'maintenance_records', p_record, trim(p_reason));
  return private.idem_finish(v_r.organization_id, p_key, 'void_maintenance_record', jsonb_build_object('finance_reversal_id', v_rev));
end;
$$;

-- The expense of a maintenance record is reversed by voiding the record.
create or replace function private.guard_linked_finance_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reverses_id is not null and exists (
    select 1 from public.maintenance_records m where m.finance_transaction_id = new.reverses_id and m.status = 'posted'
  ) then
    raise exception 'This expense belongs to a maintenance record. Void the record instead.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_guard_linked_finance_reversal before insert on public.finance_transactions
  for each row execute function private.guard_linked_finance_reversal();

create view public.asset_summaries with (security_invoker = true) as
select
  a.*,
  fs.name as site_name,
  pu.name as location_name,
  s.name as supplier_name,
  np.next_due_on,
  np.title as next_due_title,
  (np.next_due_on is not null and np.next_due_on < public.org_today(a.organization_id)) as maintenance_overdue,
  coalesce(m.cost_12m, 0) as maintenance_cost_12m,
  coalesce(m.downtime_12m, 0) as downtime_hours_12m,
  m.last_service_on
from public.assets a
join public.farm_sites fs on fs.id = a.site_id
left join public.production_units pu on pu.id = a.production_unit_id
left join public.suppliers s on s.id = a.supplier_id
left join lateral (
  select p.next_due_on, p.title from public.maintenance_plans p where p.asset_id = a.id and p.is_active order by p.next_due_on limit 1
) np on true
left join lateral (
  select sum(r.cost) as cost_12m, sum(r.downtime_hours) as downtime_12m, max(r.performed_on) as last_service_on
  from public.maintenance_records r
  where r.asset_id = a.id and r.status = 'posted' and r.performed_on >= public.org_today(a.organization_id) - 365
) m on true;

-- ===========================================================================
-- Health and biosecurity
-- ===========================================================================
create table public.health_records (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  site_id               uuid not null,
  record_type           text not null check (record_type in ('treatment', 'vaccination', 'inspection', 'incident', 'water_quality', 'pest_disease')),
  production_type       text not null check (production_type in ('poultry', 'fish', 'crop', 'general')),
  batch_id              uuid,
  crop_cycle_id         uuid,
  production_unit_id    uuid,
  record_date           date not null,
  title                 text not null check (length(trim(title)) between 2 and 160),
  -- Treatment and vaccination
  product_name          text check (product_name is null or length(product_name) <= 120),
  inventory_item_id     uuid,
  quantity              numeric(18, 4) check (quantity is null or quantity > 0),
  unit_id               uuid references public.units (id),
  store_id              uuid,
  inventory_movement_id uuid unique,
  dose                  text check (dose is null or length(dose) <= 120),
  route                 text check (route is null or route in ('water', 'feed', 'injection', 'spray', 'eye_drop', 'dip', 'topical', 'other')),
  withdrawal_days       integer check (withdrawal_days is null or withdrawal_days between 0 and 365),
  withdrawal_until      date,
  next_due_on           date,
  administered_by       text check (administered_by is null or length(administered_by) <= 120),
  vet_name              text check (vet_name is null or length(vet_name) <= 120),
  -- Incidents, inspections and pests
  severity              text check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  affected_count        integer check (affected_count is null or affected_count >= 0),
  affected_area_pct     numeric(5, 2) check (affected_area_pct is null or affected_area_pct between 0 and 100),
  action_taken          text check (action_taken is null or length(action_taken) <= 1000),
  outcome               text check (outcome is null or outcome in ('pass', 'fail', 'needs_action')),
  incident_status       text check (incident_status is null or incident_status in ('open', 'resolved')),
  resolved_on           date,
  -- Water quality (fish)
  water_temp_c          numeric(5, 2) check (water_temp_c is null or water_temp_c between -5 and 60),
  ph                    numeric(4, 2) check (ph is null or ph between 0 and 14),
  dissolved_oxygen_mg_l numeric(6, 2) check (dissolved_oxygen_mg_l is null or dissolved_oxygen_mg_l between 0 and 50),
  ammonia_mg_l          numeric(6, 3) check (ammonia_mg_l is null or ammonia_mg_l between 0 and 100),
  nitrite_mg_l          numeric(6, 3) check (nitrite_mg_l is null or nitrite_mg_l between 0 and 100),
  notes                 text check (notes is null or length(notes) <= 2000),
  voided_at             timestamptz,
  void_reason           text,
  recorded_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (crop_cycle_id, site_id) references public.crop_cycles (id, site_id),
  foreign key (production_unit_id, site_id) references public.production_units (id, site_id),
  foreign key (inventory_item_id, organization_id) references public.inventory_items (id, organization_id),
  foreign key (store_id, site_id) references public.stores (id, site_id),
  foreign key (inventory_movement_id, organization_id) references public.inventory_movements (id, organization_id),
  check (batch_id is null or crop_cycle_id is null),
  check (inventory_item_id is null or (quantity is not null and unit_id is not null and store_id is not null)),
  check (record_type <> 'water_quality' or coalesce(water_temp_c, ph, dissolved_oxygen_mg_l, ammonia_mg_l, nitrite_mg_l) is not null),
  check (resolved_on is null or resolved_on >= record_date)
);

create index idx_health_org_date on public.health_records (organization_id, record_date desc);
create index idx_health_withdrawal on public.health_records (batch_id, withdrawal_until) where voided_at is null and withdrawal_until is not null;
create index idx_health_cycle_withdrawal on public.health_records (crop_cycle_id, withdrawal_until) where voided_at is null and withdrawal_until is not null;

create trigger trg_audit_health_records after update on public.health_records
  for each row execute function private.audit_row_change();

-- p: { record_type, production_type, site_id, record_date, title, batch_id?, crop_cycle_id?, production_unit_id?,
--      product_name?, inventory_item_id?, quantity?, unit_id?, store_id?, dose?, route?, withdrawal_days?, next_due_on?,
--      administered_by?, vet_name?, severity?, affected_count?, affected_area_pct?, action_taken?, outcome?,
--      water_temp_c?, ph?, dissolved_oxygen_mg_l?, ammonia_mg_l?, nitrite_mg_l?, notes? }
create or replace function public.record_health(p_key uuid, p_org uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_site uuid := nullif(p ->> 'site_id', '')::uuid;
  v_type text := p ->> 'record_type';
  v_ptype text := coalesce(p ->> 'production_type', 'general');
  v_date date := (p ->> 'record_date')::date;
  v_batch uuid := nullif(p ->> 'batch_id', '')::uuid;
  v_cycle uuid := nullif(p ->> 'crop_cycle_id', '')::uuid;
  v_item public.inventory_items;
  v_store public.stores;
  v_qty numeric := nullif(p ->> 'quantity', '')::numeric;
  v_unit uuid := nullif(p ->> 'unit_id', '')::uuid;
  v_factor numeric;
  v_move uuid;
  v_wd integer := nullif(p ->> 'withdrawal_days', '')::integer;
  v_id uuid;
  v_b public.batches;
  v_c public.crop_cycles;
begin
  v_prev := private.idem_begin(p_org, p_key, 'record_health');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, v_site, 'health.record');
  if v_site is null then raise exception 'Choose the farm site.' using errcode = '22023'; end if;
  perform private.require_date(v_date);
  if v_type not in ('treatment', 'vaccination', 'inspection', 'incident', 'water_quality', 'pest_disease') then
    raise exception 'Choose what kind of health record this is.' using errcode = '22023';
  end if;
  if v_batch is not null then
    select * into v_b from public.batches where id = v_batch and site_id = v_site;
    if not found then raise exception 'Batch not found on this site.' using errcode = 'P0002'; end if;
    if v_date < v_b.start_date then raise exception 'The date is before batch % started.', v_b.code using errcode = '22023'; end if;
    v_ptype := v_b.production_type;
  end if;
  if v_cycle is not null then
    select * into v_c from public.crop_cycles where id = v_cycle and site_id = v_site;
    if not found then raise exception 'Crop cycle not found on this site.' using errcode = 'P0002'; end if;
    v_ptype := 'crop';
  end if;
  if v_type = 'water_quality' and v_ptype <> 'fish' and v_batch is null and nullif(p ->> 'production_unit_id', '') is null then
    raise exception 'Record water quality against a fish batch or pond.' using errcode = '22023';
  end if;
  if v_wd is not null and v_type not in ('treatment', 'vaccination', 'pest_disease') then
    raise exception 'Withdrawal periods apply to treatments, vaccinations and crop sprays.' using errcode = '22023';
  end if;
  if v_wd > 0 and v_batch is null and v_cycle is null then
    raise exception 'Choose the batch or crop cycle the withdrawal period applies to.' using errcode = '22023';
  end if;

  -- Stock used for the treatment comes out of the store once.
  if nullif(p ->> 'inventory_item_id', '') is not null then
    if v_type not in ('treatment', 'vaccination', 'pest_disease') then
      raise exception 'Only treatments, vaccinations and sprays use stock.' using errcode = '22023';
    end if;
    v_store := private.get_store((p ->> 'store_id')::uuid, 'inventory.record');
    if v_store.site_id <> v_site then raise exception 'Use a store on the same site.' using errcode = '22023'; end if;
    v_item := private.lock_item((p ->> 'inventory_item_id')::uuid, p_org);
    perform private.require_positive(v_qty, 'Quantity');
    v_factor := private.item_factor(p_org, v_item, v_unit);
    v_move := private.insert_movement(p_org, v_site, v_store.id, v_item.id, 'consumption', v_date,
      -round(v_qty * v_factor, 4), v_qty, v_unit, v_factor,
      p_reason => left(initcap(replace(v_type, '_', ' ')) || ': ' || trim(p ->> 'title'), 500), p_batch => v_batch, p_cycle => v_cycle);
  end if;

  insert into public.health_records (organization_id, site_id, record_type, production_type, batch_id, crop_cycle_id, production_unit_id,
    record_date, title, product_name, inventory_item_id, quantity, unit_id, store_id, inventory_movement_id, dose, route,
    withdrawal_days, withdrawal_until, next_due_on, administered_by, vet_name, severity, affected_count, affected_area_pct,
    action_taken, outcome, incident_status, water_temp_c, ph, dissolved_oxygen_mg_l, ammonia_mg_l, nitrite_mg_l, notes)
  values (p_org, v_site, v_type, v_ptype, v_batch, v_cycle, nullif(p ->> 'production_unit_id', '')::uuid,
    v_date, trim(p ->> 'title'), coalesce(nullif(trim(p ->> 'product_name'), ''), v_item.name), v_item.id,
    case when v_item.id is not null then v_qty end, case when v_item.id is not null then v_unit end, v_store.id, v_move,
    nullif(trim(p ->> 'dose'), ''), nullif(p ->> 'route', ''),
    v_wd, case when v_wd > 0 then v_date + v_wd end, nullif(p ->> 'next_due_on', '')::date,
    nullif(trim(p ->> 'administered_by'), ''), nullif(trim(p ->> 'vet_name'), ''), nullif(p ->> 'severity', ''),
    nullif(p ->> 'affected_count', '')::integer, nullif(p ->> 'affected_area_pct', '')::numeric, nullif(trim(p ->> 'action_taken'), ''),
    nullif(p ->> 'outcome', ''), case when v_type in ('incident', 'pest_disease') then 'open' end,
    nullif(p ->> 'water_temp_c', '')::numeric, nullif(p ->> 'ph', '')::numeric, nullif(p ->> 'dissolved_oxygen_mg_l', '')::numeric,
    nullif(p ->> 'ammonia_mg_l', '')::numeric, nullif(p ->> 'nitrite_mg_l', '')::numeric, nullif(trim(p ->> 'notes'), ''))
  returning id into v_id;

  if (select next_due_on from public.health_records where id = v_id) < v_date then
    raise exception 'The next due date must be after the record date.' using errcode = '22023';
  end if;

  perform private.log_system(p_org, v_site, v_date, v_ptype,
    case v_type when 'vaccination' then 'vaccination' when 'treatment' then 'medication' else 'health_check' end,
    initcap(replace(v_type, '_', ' ')) || ': ' || trim(p ->> 'title'), p_batch => v_batch, p_cycle => v_cycle,
    p_quantity => case when v_item.id is not null then v_qty end, p_unit => case when v_item.id is not null then v_unit end, p_movement => v_move);
  return private.idem_finish(p_org, p_key, 'record_health', jsonb_build_object('health_record_id', v_id, 'movement_id', v_move));
end;
$$;

create or replace function public.void_health_record(p_key uuid, p_record uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h public.health_records;
  v_m public.inventory_movements;
  v_prev jsonb;
begin
  select * into v_h from public.health_records where id = p_record;
  if not found or not public.has_site_access(v_h.organization_id, v_h.site_id) then
    raise exception 'Health record not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_h.organization_id, p_key, 'void_health_record');
  if v_prev is not null then return v_prev; end if;
  select * into v_h from public.health_records where id = p_record for update;
  perform private.require(v_h.organization_id, v_h.site_id, 'health.record');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = '22023'; end if;
  if v_h.voided_at is not null then raise exception 'This record is already voided.' using errcode = 'P0001'; end if;
  if v_h.inventory_movement_id is not null then
    select * into v_m from public.inventory_movements where id = v_h.inventory_movement_id;
    perform private.lock_item(v_m.item_id, v_m.organization_id);
    perform set_config('harvest.voiding_health', 'on', true);
    perform private.insert_movement(v_m.organization_id, v_m.site_id, v_m.store_id, v_m.item_id, 'reversal', current_date,
      -v_m.quantity, v_m.entered_quantity, v_m.entered_unit_id, v_m.conversion_factor,
      p_reason => 'Void health record: ' || trim(p_reason), p_batch => v_m.batch_id, p_cycle => v_m.crop_cycle_id, p_reverses => v_m.id);
    perform set_config('harvest.voiding_health', 'off', true);
  end if;
  update public.health_records set voided_at = now(), void_reason = trim(p_reason) where id = p_record;
  update public.activity_logs set voided_at = now(), void_reason = 'Health record voided: ' || trim(p_reason)
  where inventory_movement_id = v_h.inventory_movement_id and v_h.inventory_movement_id is not null and voided_at is null;
  perform private.audit(v_h.organization_id, v_h.site_id, 'health_record.voided', 'health_records', p_record, trim(p_reason));
  return private.idem_finish(v_h.organization_id, p_key, 'void_health_record', jsonb_build_object('health_record_id', p_record));
end;
$$;

-- Stock used by a health record is corrected by voiding the record.
create or replace function private.guard_health_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reverses_movement_id is not null and current_setting('harvest.voiding_health', true) is distinct from 'on'
     and exists (select 1 from public.health_records h where h.inventory_movement_id = new.reverses_movement_id) then
    raise exception 'This stock was used on a health record. Void the health record instead.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_guard_health_reversal before insert on public.inventory_movements
  for each row execute function private.guard_health_reversal();

create or replace function public.resolve_health_incident(p_record uuid, p_resolved_on date, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.health_records;
begin
  select * into v from public.health_records where id = p_record for update;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then raise exception 'Health record not found.' using errcode = 'P0002'; end if;
  perform private.require(v.organization_id, v.site_id, 'health.record');
  if v.incident_status is distinct from 'open' then raise exception 'Only an open incident can be resolved.' using errcode = 'P0001'; end if;
  if p_resolved_on < v.record_date or p_resolved_on > public.org_today(v.organization_id) then
    raise exception 'Enter a resolution date between the incident date and today.' using errcode = '22023';
  end if;
  update public.health_records set incident_status = 'resolved', resolved_on = p_resolved_on,
    action_taken = coalesce(nullif(trim(p_note), ''), action_taken) where id = p_record;
end;
$$;

-- Selling during a withdrawal period. p_source is a batch or crop cycle; p_on is the
-- sale date for animals, or the date the produce was collected or harvested.
create or replace function private.assert_sellable(p_batch uuid, p_on date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.health_records;
begin
  select * into v from public.health_records h
  where (h.batch_id = p_batch or h.crop_cycle_id = p_batch) and h.voided_at is null
    and h.withdrawal_until is not null and h.record_date <= p_on and h.withdrawal_until > p_on
  order by h.withdrawal_until desc limit 1;
  if found then
    raise exception '% is under a withdrawal period after "%" until %. It cannot be sold before then.',
      coalesce((select code from public.batches where id = p_batch), (select code from public.crop_cycles where id = p_batch)),
      v.title, to_char(v.withdrawal_until, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
end;
$$;

-- Crop produce: check the cycle's pre-harvest interval when it is sold.
create or replace function private.check_disposal_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.production_records;
begin
  if new.kind = 'sold' then
    select * into v_r from public.production_records where id = new.production_record_id;
    if v_r.crop_cycle_id is not null then perform private.assert_sellable(v_r.crop_cycle_id, v_r.record_date); end if;
  end if;
  return new;
end;
$$;

create trigger trg_check_disposal_withdrawal before insert on public.production_disposals
  for each row execute function private.check_disposal_withdrawal();

create view public.health_record_summaries with (security_invoker = true) as
select
  h.*,
  fs.name as site_name,
  b.code as batch_code,
  cc.code as crop_cycle_code,
  pu.name as production_unit_name,
  u.symbol as unit_symbol,
  coalesce(p.full_name, p.email::text) as recorded_by_name,
  (h.voided_at is null and h.withdrawal_until is not null and h.withdrawal_until > public.org_today(h.organization_id)) as in_withdrawal,
  (h.record_type = 'water_quality' and (
     h.dissolved_oxygen_mg_l < 3 or h.ammonia_mg_l > 0.5 or h.nitrite_mg_l > 0.5 or h.ph < 6.5 or h.ph > 9
     or h.water_temp_c < 20 or h.water_temp_c > 34)) as out_of_range
from public.health_records h
join public.farm_sites fs on fs.id = h.site_id
left join public.batches b on b.id = h.batch_id
left join public.crop_cycles cc on cc.id = h.crop_cycle_id
left join public.production_units pu on pu.id = h.production_unit_id
left join public.units u on u.id = h.unit_id
left join public.profiles p on p.id = h.recorded_by;

-- ===========================================================================
-- RLS and grants
-- ===========================================================================
alter table public.assets              enable row level security;
alter table public.maintenance_plans   enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.health_records      enable row level security;

create policy assets_select on public.assets for select to authenticated using (public.can(organization_id, site_id, 'assets.view'));
create policy assets_insert on public.assets for insert to authenticated with check (public.can(organization_id, site_id, 'assets.manage'));
create policy assets_update on public.assets for update to authenticated
  using (public.can(organization_id, site_id, 'assets.manage')) with check (public.can(organization_id, site_id, 'assets.manage'));

create policy maintenance_plans_select on public.maintenance_plans for select to authenticated using (public.can(organization_id, site_id, 'assets.view'));
create policy maintenance_plans_insert on public.maintenance_plans for insert to authenticated with check (public.can(organization_id, site_id, 'assets.manage'));
create policy maintenance_plans_update on public.maintenance_plans for update to authenticated
  using (public.can(organization_id, site_id, 'assets.manage')) with check (public.can(organization_id, site_id, 'assets.manage'));

create policy maintenance_records_select on public.maintenance_records for select to authenticated using (public.can(organization_id, site_id, 'assets.view'));
create policy health_records_select on public.health_records for select to authenticated using (public.can(organization_id, site_id, 'health.view'));

revoke all on public.assets, public.maintenance_plans, public.maintenance_records, public.health_records from anon, authenticated;
grant select on public.assets, public.maintenance_plans, public.maintenance_records, public.health_records to authenticated;
grant insert (organization_id, site_id, code, name, category, production_unit_id, make, model, serial_number, purchase_date, purchase_cost,
  supplier_id, warranty_until, condition, notes) on public.assets to authenticated;
grant update (site_id, code, name, category, production_unit_id, make, model, serial_number, purchase_date, purchase_cost,
  supplier_id, warranty_until, condition, status, notes) on public.assets to authenticated;
grant insert (organization_id, site_id, asset_id, title, interval_days, next_due_on, notes) on public.maintenance_plans to authenticated;
grant update (title, interval_days, next_due_on, is_active, notes) on public.maintenance_plans to authenticated;
grant select on public.asset_summaries, public.health_record_summaries to authenticated;
revoke all on public.asset_summaries, public.health_record_summaries from anon;

-- ===========================================================================
-- Alerts: the original checks plus every new module
-- ===========================================================================
alter function public.org_alerts(uuid, uuid) rename to org_alerts_core;

create or replace function public.org_alerts(p_org uuid, p_site uuid default null)
returns table (
  alert_key text, kind text, severity text, site_id uuid, site_name text, entity_type text, entity_id uuid,
  title text, detail text, alert_date date
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_set public.alert_settings;
  v_today date := public.org_today(p_org);
begin
  select * into v_set from public.alert_settings where organization_id = p_org;
  if not found then return; end if;

  -- Stock, mortality, rejection, missing records and harvests; tasks are reported below.
  return query
  select c.* from public.org_alerts_core(p_org, p_site) c where c.kind not in ('overdue_activity', 'upcoming_activity');

  -- Tasks: overdue, due soon and waiting for a supervisor.
  return query
  select 'task:' || t.id,
    case when t.status = 'awaiting_review' then 'task_review' when t.due_on < v_today then 'overdue_activity' else 'upcoming_activity' end,
    case when t.status <> 'awaiting_review' and t.due_on < v_today and t.priority in ('high', 'urgent') then 'critical'
         when t.status <> 'awaiting_review' and t.due_on < v_today then 'warning' else 'info' end,
    t.site_id, t.site_name, 'planned_activity', t.id, t.title,
    case when t.status = 'awaiting_review' then 'Done by ' || coalesce(t.assignee_name, 'a worker') || ', waiting for review'
         when t.due_on < v_today then 'Overdue since ' || to_char(t.due_on, 'DD Mon YYYY')
         else 'Due ' || to_char(t.due_on, 'DD Mon YYYY') end
      || coalesce(' · ' || t.assignee_name, ''),
    t.due_on
  from public.task_summaries t
  where t.organization_id = p_org and (p_site is null or t.site_id = p_site)
    and ((t.status in ('planned', 'in_progress') and t.due_on <= v_today + v_set.upcoming_activity_days)
         or (t.status = 'awaiting_review' and public.has_permission(p_org, 'tasks.manage')));

  -- Money owed and overdue (shown to those who can see the figures).
  return query
  select 'invoice:' || s.id, 'overdue_invoice', case when v_today - s.due_date > 30 then 'critical' else 'warning' end,
    s.site_id, s.site_name, 'sale', s.id,
    'Overdue: ' || s.invoice_number || ' · ' || coalesce(s.customer_display_name, 'walk-in customer'),
    to_char(s.amount_outstanding, 'FM999,999,999,990.00') || ' due ' || to_char(s.due_date, 'DD Mon YYYY'),
    s.due_date
  from public.sale_summaries s
  where s.organization_id = p_org and s.is_overdue and (p_site is null or s.site_id = p_site)
    and public.has_permission(p_org, 'finance.view');

  return query
  select 'bill:' || b.id, 'overdue_bill', case when v_today - b.due_date > 30 then 'critical' else 'warning' end,
    b.site_id, fs.name, 'supplier_bill', b.id,
    'Bill overdue: ' || b.supplier_name || ' ' || b.bill_number,
    to_char(b.amount_outstanding, 'FM999,999,999,990.00') || ' due ' || to_char(b.due_date, 'DD Mon YYYY'),
    b.due_date
  from public.supplier_bill_summaries b
  left join public.farm_sites fs on fs.id = b.site_id
  where b.organization_id = p_org and b.is_overdue and (p_site is null or b.site_id = p_site)
    and public.has_permission(p_org, 'finance.view');

  -- Procurement waiting on someone.
  return query
  select 'pr:' || r.id, 'request_awaiting_approval', 'info', r.site_id, r.site_name, 'purchase_request', r.id,
    'Purchase request ' || r.request_number || ' needs approval', left(r.reason, 120), r.created_at::date
  from public.purchase_request_summaries r
  where r.organization_id = p_org and r.status = 'submitted' and (p_site is null or r.site_id = p_site)
    and public.has_permission(p_org, 'procurement.approve');

  return query
  select 'po:' || o.id, 'late_delivery', 'warning', o.site_id, o.site_name, 'purchase_order', o.id,
    'Late delivery: ' || o.po_number || ' from ' || o.supplier_name, 'Expected ' || to_char(o.expected_date, 'DD Mon YYYY'), o.expected_date
  from public.purchase_order_summaries o
  where o.organization_id = p_org and o.receipt_status in ('awaiting', 'partially_received')
    and o.expected_date < v_today and (p_site is null or o.site_id = p_site);

  -- Equipment maintenance due within the upcoming window, or overdue.
  return query
  select 'maint:' || p.id, case when p.next_due_on < v_today then 'maintenance_overdue' else 'maintenance_due' end,
    case when p.next_due_on < v_today then 'warning' else 'info' end,
    a.site_id, fs.name, 'asset', a.id, p.title || ' · ' || a.name,
    case when p.next_due_on < v_today then 'Overdue since ' else 'Due ' end || to_char(p.next_due_on, 'DD Mon YYYY'),
    p.next_due_on
  from public.maintenance_plans p
  join public.assets a on a.id = p.asset_id and a.status = 'active'
  join public.farm_sites fs on fs.id = a.site_id
  where p.organization_id = p_org and p.is_active and (p_site is null or a.site_id = p_site)
    and p.next_due_on <= v_today + v_set.upcoming_activity_days;

  return query
  select 'down:' || a.id, 'equipment_down', 'warning', a.site_id, fs.name, 'asset', a.id, a.name || ' is out of service',
    'Since ' || to_char(a.out_of_service_since, 'DD Mon YYYY'), a.out_of_service_since::date
  from public.assets a
  join public.farm_sites fs on fs.id = a.site_id
  where a.organization_id = p_org and a.status = 'active' and a.condition = 'out_of_service' and (p_site is null or a.site_id = p_site);

  -- Health: boosters due, active withdrawal periods, open serious incidents, water out of range.
  return query
  select 'vacc:' || h.id, 'vaccination_due', case when h.next_due_on < v_today then 'warning' else 'info' end,
    h.site_id, h.site_name, 'health_record', h.id,
    'Due: ' || h.title || coalesce(' · ' || coalesce(h.batch_code, h.crop_cycle_code), ''),
    case when h.next_due_on < v_today then 'Overdue since ' else 'Due ' end || to_char(h.next_due_on, 'DD Mon YYYY'), h.next_due_on
  from public.health_record_summaries h
  where h.organization_id = p_org and h.voided_at is null and h.next_due_on is not null
    and h.next_due_on <= v_today + v_set.upcoming_activity_days and (p_site is null or h.site_id = p_site)
    -- A later record of the same kind on the same batch, cycle or site counts as done.
    and not exists (select 1 from public.health_records n where n.organization_id = h.organization_id and n.voided_at is null
                    and n.record_type = h.record_type and n.record_date > h.record_date and n.record_date >= h.next_due_on - 3
                    and n.site_id = h.site_id
                    and n.batch_id is not distinct from h.batch_id and n.crop_cycle_id is not distinct from h.crop_cycle_id);

  return query
  select 'withdrawal:' || h.id, 'withdrawal_active', 'info', h.site_id, h.site_name, 'health_record', h.id,
    'Do not sell from ' || coalesce(h.batch_code, h.crop_cycle_code) || ' until ' || to_char(h.withdrawal_until, 'DD Mon'),
    'Withdrawal after ' || h.title, h.record_date
  from public.health_record_summaries h
  where h.organization_id = p_org and h.in_withdrawal and (p_site is null or h.site_id = p_site);

  return query
  select 'incident:' || h.id, 'health_incident', case when h.severity = 'critical' then 'critical' else 'warning' end,
    h.site_id, h.site_name, 'health_record', h.id, 'Open ' || replace(h.record_type, '_', ' ') || ': ' || h.title,
    initcap(coalesce(h.severity, 'unrated')) || ' severity since ' || to_char(h.record_date, 'DD Mon'), h.record_date
  from public.health_record_summaries h
  where h.organization_id = p_org and h.voided_at is null and h.incident_status = 'open'
    and h.severity in ('high', 'critical') and (p_site is null or h.site_id = p_site);

  return query
  select 'water:' || h.id, 'water_quality', 'warning', h.site_id, h.site_name, 'health_record', h.id,
    'Water quality out of range' || coalesce(' in ' || coalesce(h.batch_code, h.production_unit_name), ''),
    concat_ws(', ', 'DO ' || trim_scale(h.dissolved_oxygen_mg_l) || ' mg/L', 'ammonia ' || trim_scale(h.ammonia_mg_l) || ' mg/L',
      'nitrite ' || trim_scale(h.nitrite_mg_l) || ' mg/L', 'pH ' || trim_scale(h.ph), trim_scale(h.water_temp_c) || ' °C'),
    h.record_date
  from public.health_record_summaries h
  where h.organization_id = p_org and h.voided_at is null and h.out_of_range and h.record_date >= v_today - 2
    and (p_site is null or h.site_id = p_site);
end;
$$;

-- Activity categories used by system log entries from this release.
insert into private.default_categories (kind, code, name, production_type, sort_order)
select v.kind, v.code, v.name, v.pt, v.so
from (values ('activity', 'health_check', 'Health check', 'general', 41), ('activity', 'medication', 'Medication / treatment', 'general', 42)) v(kind, code, name, pt, so)
where not exists (select 1 from private.default_categories d where d.kind = v.kind and d.code = v.code);

insert into public.categories (organization_id, kind, code, name, production_type, is_system, sort_order)
select o.id, d.kind, d.code, d.name, d.production_type, true, d.sort_order
from public.organizations o cross join private.default_categories d
where d.kind = 'activity' and d.code in ('health_check', 'medication', 'maintenance')
  and not exists (select 1 from public.categories c where c.organization_id = o.id and c.kind = d.kind and c.code = d.code);

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.org_alerts(uuid, uuid),
  public.org_alerts_core(uuid, uuid),
  public.record_maintenance(uuid, uuid, text, date, text, uuid, numeric, boolean, text, uuid, uuid, numeric, text, text),
  public.void_maintenance_record(uuid, uuid, text),
  public.record_health(uuid, uuid, jsonb),
  public.void_health_record(uuid, uuid, text),
  public.resolve_health_incident(uuid, date, text)
  to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
