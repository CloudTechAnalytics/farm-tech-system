-- ============================================================================
-- 0004 Operational RPCs. Every operation that changes a population, a stock
-- balance, produce on hand or money is one function call:
--   1. idempotency check (same key returns the first result, no second write)
--   2. lock the parent row (batch, inventory item, production record, sale)
--   3. permission and site check
--   4. validate against the current balance
--   5. write ledger rows, the daily-log entry and audit in one transaction
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared internals
-- ---------------------------------------------------------------------------
create or replace function private.unit_id(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.units where organization_id is null and code = p_code;
$$;

create or replace function private.batch_population(p_batch uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0)::integer from public.batch_events where batch_id = p_batch;
$$;

create or replace function private.stock_balance(p_item uuid, p_store uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0) from public.inventory_movements where item_id = p_item and store_id = p_store;
$$;

create or replace function private.feed_on_hand(p_batch uuid, p_item uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0) from public.feed_events where batch_id = p_batch and item_id = p_item;
$$;

create or replace function private.record_available(p_record uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select r.quantity - r.rejected_quantity
       - coalesce((select sum(d.quantity) from public.production_disposals d
                   where d.production_record_id = r.id and d.status = 'posted'), 0)
  from public.production_records r where r.id = p_record;
$$;

-- Lock a batch for update after confirming the caller may act on it.
create or replace function private.lock_batch(p_batch uuid, p_perm text)
returns public.batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.batches;
begin
  select * into v from public.batches where id = p_batch for update;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then
    raise exception 'Batch not found.' using errcode = 'P0002';
  end if;
  perform private.require(v.organization_id, v.site_id, p_perm);
  return v;
end;
$$;

create or replace function private.lock_item(p_item uuid, p_org uuid)
returns public.inventory_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inventory_items;
begin
  select * into v from public.inventory_items where id = p_item and organization_id = p_org for update;
  if not found then
    raise exception 'Inventory item not found.' using errcode = 'P0002';
  end if;
  if v.status <> 'active' then
    raise exception '% is archived and cannot be moved.', v.name using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function private.get_store(p_store uuid, p_perm text)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.stores;
begin
  select * into v from public.stores where id = p_store;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then
    raise exception 'Store not found.' using errcode = 'P0002';
  end if;
  perform private.require(v.organization_id, v.site_id, p_perm);
  if v.status <> 'active' then
    raise exception 'This store is archived.' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Factor that converts a quantity entered in p_unit into the item's base unit.
create or replace function private.item_factor(p_org uuid, p_item public.inventory_items, p_unit uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entered public.units;
  v_base public.units;
begin
  v_entered := private.assert_unit(p_org, p_unit);
  select * into v_base from public.units where id = p_item.base_unit_id;
  if v_entered.dimension <> v_base.dimension then
    raise exception '% is measured in %; % cannot be converted.', p_item.name, v_base.name, v_entered.name using errcode = '22023';
  end if;
  return v_entered.to_base / v_base.to_base;
end;
$$;

create or replace function private.unit_factor(p_org uuid, p_from uuid, p_to uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from public.units;
  v_to public.units;
begin
  v_from := private.assert_unit(p_org, p_from);
  select * into v_to from public.units where id = p_to;
  if v_from.dimension <> v_to.dimension then
    raise exception 'Cannot convert % into %.', v_from.name, v_to.name using errcode = '22023';
  end if;
  return v_from.to_base / v_to.to_base;
end;
$$;

create or replace function private.require_positive(p_value numeric, p_label text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value <= 0 then
    raise exception '% must be greater than zero.', p_label using errcode = '22023';
  end if;
end;
$$;

create or replace function private.require_date(p_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_date is null then
    raise exception 'Enter a date.' using errcode = '22023';
  end if;
  if p_date > current_date + 1 then
    raise exception 'The date cannot be in the future.' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.require_member(p_org uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is not null and not exists (
    select 1 from public.memberships where organization_id = p_org and user_id = p_user and status = 'active') then
    raise exception 'The responsible person must be an active user of this organization.' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.log_system(
  p_org uuid, p_site uuid, p_date date, p_production_type text, p_category_code text, p_summary text,
  p_batch uuid default null, p_cycle uuid default null, p_quantity numeric default null, p_unit uuid default null,
  p_notes text default null, p_batch_event uuid default null, p_feed_event uuid default null,
  p_movement uuid default null, p_production_record uuid default null, p_finance uuid default null,
  p_sale uuid default null, p_responsible uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.activity_logs (organization_id, site_id, occurred_on, occurred_at, production_type, batch_id,
    crop_cycle_id, category_id, quantity, unit_id, summary, notes, responsible_id, source, batch_event_id,
    feed_event_id, inventory_movement_id, production_record_id, finance_transaction_id, sale_id, recorded_by)
  values (p_org, p_site, p_date, now(), p_production_type, p_batch, p_cycle,
    private.category_id(p_org, 'activity', p_category_code), p_quantity, p_unit, left(p_summary, 300),
    nullif(trim(p_notes), ''), coalesce(p_responsible, auth.uid()), 'system', p_batch_event, p_feed_event,
    p_movement, p_production_record, p_finance, p_sale, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.insert_movement(
  p_org uuid, p_site uuid, p_store uuid, p_item uuid, p_type text, p_date date, p_quantity numeric,
  p_entered_quantity numeric, p_entered_unit uuid, p_factor numeric,
  p_unit_cost numeric default null, p_total_cost numeric default null, p_supplier text default null,
  p_reference text default null, p_reason text default null, p_batch uuid default null, p_cycle uuid default null,
  p_transfer_group uuid default null, p_stock_count uuid default null, p_reverses uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.inventory_movements (organization_id, site_id, store_id, item_id, movement_type, movement_date,
    quantity, entered_quantity, entered_unit_id, conversion_factor, unit_cost, total_cost, supplier, reference,
    reason, batch_id, crop_cycle_id, transfer_group_id, stock_count_id, reverses_movement_id, recorded_by)
  values (p_org, p_site, p_store, p_item, p_type, p_date, round(p_quantity, 4), round(p_entered_quantity, 4),
    p_entered_unit, p_factor, p_unit_cost, p_total_cost, nullif(trim(p_supplier), ''), nullif(trim(p_reference), ''),
    nullif(trim(p_reason), ''), p_batch, p_cycle, p_transfer_group, p_stock_count, p_reverses, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.insert_finance(
  p_org uuid, p_site uuid, p_kind text, p_category uuid, p_amount numeric, p_date date, p_method text,
  p_description text, p_reference text default null, p_counterparty text default null,
  p_production_type text default null, p_batch uuid default null, p_cycle uuid default null,
  p_sale uuid default null, p_movement uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.finance_transactions (organization_id, site_id, txn_date, kind, category_id, amount, currency,
    payment_method, description, reference, counterparty, production_type, batch_id, crop_cycle_id, sale_id,
    inventory_movement_id, recorded_by)
  values (p_org, p_site, p_date, p_kind, p_category, round(p_amount, 2),
    (select currency from public.organizations where id = p_org), p_method, trim(p_description),
    nullif(trim(p_reference), ''), nullif(trim(p_counterparty), ''), p_production_type, p_batch, p_cycle,
    p_sale, p_movement, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ===========================================================================
-- Batches (poultry and fish)
-- ===========================================================================
create or replace function public.create_batch(
  p_key uuid,
  p_org uuid,
  p_site uuid,
  p_production_type text,
  p_code text,
  p_species text,
  p_purpose text,
  p_start_date date,
  p_initial_quantity integer,
  p_start_kind text default 'acquisition',
  p_production_unit uuid default null,
  p_breed text default null,
  p_source text default null,
  p_initial_avg_weight_g numeric default null,
  p_count_basis text default null,
  p_expects_daily_records boolean default true,
  p_notes text default null,
  p_purchase_amount numeric default null,
  p_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_batch uuid;
  v_event uuid;
  v_txn uuid;
  v_basis text;
  v_noun text := case when p_production_type = 'fish' then 'fish' else 'birds' end;
begin
  v_prev := private.idem_begin(p_org, p_key, 'create_batch');
  if v_prev is not null then return v_prev; end if;

  perform private.require(p_org, p_site, 'batches.manage');
  perform private.require_date(p_start_date);
  perform private.require_positive(p_initial_quantity, 'Starting quantity');
  if p_start_kind not in ('acquisition', 'opening') then
    raise exception 'Choose whether this is a new acquisition or an opening count.' using errcode = '22023';
  end if;
  if p_production_type not in ('poultry', 'fish') then
    raise exception 'Choose poultry or fish.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.farm_sites where id = p_site and organization_id = p_org and status = 'active') then
    raise exception 'Farm site not found or archived.' using errcode = 'P0002';
  end if;
  if p_production_unit is not null and not exists (
      select 1 from public.production_units where id = p_production_unit and site_id = p_site
        and production_type = p_production_type and status = 'active') then
    raise exception 'Choose an active % unit on this site.', p_production_type using errcode = '22023';
  end if;
  if coalesce(p_purchase_amount, 0) > 0 then
    perform private.require(p_org, p_site, 'finance.record');
  end if;

  -- Fish populations are estimates unless the farm counted every fish.
  v_basis := coalesce(p_count_basis, case when p_production_type = 'fish' then 'estimated' else 'counted' end);

  insert into public.batches (organization_id, site_id, production_unit_id, production_type, code, species, breed,
    purpose, source, start_date, initial_quantity, initial_avg_weight_g, count_basis, expects_daily_records, notes, created_by)
  values (p_org, p_site, p_production_unit, p_production_type, upper(trim(p_code)), trim(p_species),
    nullif(trim(p_breed), ''), p_purpose, nullif(trim(p_source), ''), p_start_date, p_initial_quantity,
    p_initial_avg_weight_g, v_basis, coalesce(p_expects_daily_records, true), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_batch;

  insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate, reason, recorded_by)
  values (p_org, p_site, v_batch, p_start_date, p_start_kind, p_initial_quantity, v_basis = 'estimated',
    case when p_start_kind = 'opening' then 'Opening count' else nullif(trim(p_source), '') end, auth.uid())
  returning id into v_event;

  if coalesce(p_purchase_amount, 0) > 0 then
    v_txn := private.insert_finance(p_org, p_site, 'expense', private.category_id(p_org, 'expense', 'stock_purchase'),
      p_purchase_amount, p_start_date, p_payment_method,
      'Purchase of ' || p_initial_quantity || ' ' || v_noun || ' for batch ' || upper(trim(p_code)),
      null, p_source, p_production_type, v_batch);
  end if;

  perform private.log_system(p_org, p_site, p_start_date, p_production_type, 'stocking',
    'Started batch ' || upper(trim(p_code)) || ' with ' || p_initial_quantity || ' ' || v_noun
      || case when v_basis = 'estimated' then ' (estimated)' else '' end,
    p_batch => v_batch, p_quantity => p_initial_quantity, p_unit => private.unit_id('each'),
    p_batch_event => v_event, p_finance => v_txn);

  return private.idem_finish(p_org, p_key, 'create_batch', jsonb_build_object('batch_id', v_batch, 'event_id', v_event));
end;
$$;

-- Mortality, culls, theft/loss and manual count adjustments.
create or replace function public.record_population_change(
  p_key uuid,
  p_batch uuid,
  p_kind text,
  p_quantity integer,
  p_event_date date,
  p_reason text default null,
  p_notes text default null,
  p_responsible uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_prev jsonb;
  v_pop integer;
  v_signed integer;
  v_event uuid;
  v_label text;
begin
  select organization_id into v_b.organization_id from public.batches where id = p_batch;
  if v_b.organization_id is null then
    raise exception 'Batch not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'record_population_change');
  if v_prev is not null then return v_prev; end if;

  v_b := private.lock_batch(p_batch, case when p_kind = 'adjustment' then 'batches.manage' else 'operations.record' end);
  perform private.require_date(p_event_date);
  perform private.require_member(v_b.organization_id, p_responsible);
  if v_b.status <> 'active' then
    raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001';
  end if;
  if p_event_date < v_b.start_date then
    raise exception 'The date is before batch % started (%).', v_b.code, v_b.start_date using errcode = '22023';
  end if;
  if p_kind not in ('mortality', 'cull', 'theft_loss', 'adjustment') then
    raise exception 'Unknown population change.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity = 0 or (p_kind <> 'adjustment' and p_quantity < 0) then
    raise exception 'Enter a quantity greater than zero.' using errcode = '22023';
  end if;
  if p_kind in ('adjustment', 'theft_loss') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required for this change.' using errcode = '22023';
  end if;

  v_signed := case when p_kind = 'adjustment' then p_quantity else -abs(p_quantity) end;
  v_pop := private.batch_population(p_batch);
  if v_pop + v_signed < 0 then
    raise exception 'Batch % has % % recorded; you entered %.', v_b.code, v_pop,
      case when v_b.production_type = 'fish' then 'fish' else 'birds' end, abs(v_signed) using errcode = '23514';
  end if;

  insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate, reason, recorded_by)
  values (v_b.organization_id, v_b.site_id, p_batch, p_event_date, p_kind, v_signed,
    v_b.count_basis = 'estimated' and p_kind = 'adjustment', nullif(trim(p_reason), ''), auth.uid())
  returning id into v_event;

  v_label := case p_kind when 'mortality' then 'Mortality' when 'cull' then 'Culled'
    when 'theft_loss' then 'Lost / stolen' else 'Population adjusted' end;
  perform private.log_system(v_b.organization_id, v_b.site_id, p_event_date, v_b.production_type,
    case p_kind when 'mortality' then 'mortality' when 'cull' then 'cull' else 'population_adjustment' end,
    v_label || ' in ' || v_b.code || ': ' || case when p_kind = 'adjustment' and v_signed > 0 then '+' else '' end
      || case when p_kind = 'adjustment' then v_signed else abs(v_signed) end
      || coalesce(' (' || nullif(trim(p_reason), '') || ')', ''),
    p_batch => p_batch, p_quantity => abs(v_signed), p_unit => private.unit_id('each'), p_notes => p_notes,
    p_batch_event => v_event, p_responsible => p_responsible);

  return private.idem_finish(v_b.organization_id, p_key, 'record_population_change',
    jsonb_build_object('event_id', v_event, 'population', v_pop + v_signed));
end;
$$;

create or replace function public.transfer_between_batches(
  p_key uuid,
  p_from_batch uuid,
  p_to_batch uuid,
  p_quantity integer,
  p_event_date date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_prev jsonb;
  v_from public.batches;
  v_to public.batches;
  v_group uuid := gen_random_uuid();
  v_out uuid;
  v_in uuid;
begin
  select organization_id into v_org from public.batches where id = p_from_batch;
  if v_org is null then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_org, p_key, 'transfer_between_batches');
  if v_prev is not null then return v_prev; end if;

  if p_from_batch = p_to_batch then
    raise exception 'Choose two different batches.' using errcode = '22023';
  end if;
  -- Lock in a stable order to avoid deadlocks between opposite transfers.
  if p_from_batch < p_to_batch then
    v_from := private.lock_batch(p_from_batch, 'batches.manage');
    v_to := private.lock_batch(p_to_batch, 'batches.manage');
  else
    v_to := private.lock_batch(p_to_batch, 'batches.manage');
    v_from := private.lock_batch(p_from_batch, 'batches.manage');
  end if;
  if v_to.organization_id <> v_from.organization_id then
    raise exception 'Batch not found.' using errcode = 'P0002';
  end if;
  if v_from.status <> 'active' or v_to.status <> 'active' then
    raise exception 'Both batches must be active.' using errcode = 'P0001';
  end if;
  if v_from.production_type <> v_to.production_type then
    raise exception 'Transfers must be between batches of the same type.' using errcode = '22023';
  end if;
  perform private.require_date(p_event_date);
  perform private.require_positive(p_quantity, 'Quantity');
  if private.batch_population(p_from_batch) < p_quantity then
    raise exception 'Batch % has only % recorded.', v_from.code, private.batch_population(p_from_batch) using errcode = '23514';
  end if;

  insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, reason,
    transfer_group_id, counterpart_batch_id, is_estimate, recorded_by)
  values (v_org, v_from.site_id, p_from_batch, p_event_date, 'transfer_out', -p_quantity, nullif(trim(p_reason), ''),
    v_group, p_to_batch, v_from.count_basis = 'estimated', auth.uid())
  returning id into v_out;
  insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, reason,
    transfer_group_id, counterpart_batch_id, is_estimate, recorded_by)
  values (v_org, v_to.site_id, p_to_batch, p_event_date, 'transfer_in', p_quantity, nullif(trim(p_reason), ''),
    v_group, p_from_batch, v_from.count_basis = 'estimated', auth.uid())
  returning id into v_in;

  perform private.log_system(v_org, v_from.site_id, p_event_date, v_from.production_type, 'transfer',
    'Transferred ' || p_quantity || ' from ' || v_from.code || ' to ' || v_to.code,
    p_batch => p_from_batch, p_quantity => p_quantity, p_unit => private.unit_id('each'), p_batch_event => v_out);
  perform private.log_system(v_org, v_to.site_id, p_event_date, v_to.production_type, 'transfer',
    'Received ' || p_quantity || ' from ' || v_from.code,
    p_batch => p_to_batch, p_quantity => p_quantity, p_unit => private.unit_id('each'), p_batch_event => v_in);

  return private.idem_finish(v_org, p_key, 'transfer_between_batches',
    jsonb_build_object('transfer_group_id', v_group, 'out_event_id', v_out, 'in_event_id', v_in));
end;
$$;

create or replace function public.close_batch(
  p_batch uuid,
  p_closed_on date,
  p_reason text,
  p_write_off_remaining boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_pop integer;
  v_feed numeric;
  v_event uuid;
begin
  v_b := private.lock_batch(p_batch, 'batches.manage');
  if v_b.status = 'closed' then
    raise exception 'Batch % is already closed.', v_b.code using errcode = 'P0001';
  end if;
  perform private.require_date(p_closed_on);
  if p_closed_on < v_b.start_date then
    raise exception 'The closing date is before the batch started.' using errcode = '22023';
  end if;
  select coalesce(sum(quantity), 0) into v_feed from public.feed_events where batch_id = p_batch;
  if v_feed > 0 then
    raise exception 'Batch % still holds % of issued feed. Record it as consumed, wasted or returned first.', v_b.code, round(v_feed, 2)
      using errcode = 'P0001';
  end if;
  v_pop := private.batch_population(p_batch);
  if v_pop > 0 and not coalesce(p_write_off_remaining, false) then
    raise exception 'Batch % still has % recorded. Record sales, transfers or losses, or confirm a write-off.', v_b.code, v_pop
      using errcode = 'P0001';
  end if;
  if v_pop > 0 then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'A reason is required to write off the remaining population.' using errcode = '22023';
    end if;
    insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate, reason, recorded_by)
    values (v_b.organization_id, v_b.site_id, p_batch, p_closed_on, 'adjustment', -v_pop, v_b.count_basis = 'estimated',
      'Written off at closing: ' || trim(p_reason), auth.uid())
    returning id into v_event;
  end if;

  update public.batches set status = 'closed', closed_on = p_closed_on, close_reason = nullif(trim(p_reason), '')
  where id = p_batch;

  perform private.log_system(v_b.organization_id, v_b.site_id, p_closed_on, v_b.production_type, 'batch_close',
    'Closed batch ' || v_b.code || case when v_pop > 0 then ' (' || v_pop || ' written off)' else '' end,
    p_batch => p_batch, p_batch_event => v_event, p_notes => p_reason);
  return jsonb_build_object('batch_id', p_batch, 'written_off', greatest(v_pop, 0));
end;
$$;

create or replace function public.reverse_batch_event(p_key uuid, p_event uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.batch_events;
  v_b public.batches;
  v_prev jsonb;
  v_rev uuid;
begin
  select * into v_e from public.batch_events where id = p_event;
  if not found then raise exception 'Record not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_e.organization_id, p_key, 'reverse_batch_event');
  if v_prev is not null then return v_prev; end if;

  v_b := private.lock_batch(v_e.batch_id, 'batches.manage');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reverse a record.' using errcode = '22023';
  end if;
  if v_e.kind = 'reversal' then
    raise exception 'A reversal cannot itself be reversed. Record a new entry instead.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.batch_events where reverses_event_id = p_event) then
    raise exception 'This record has already been reversed.' using errcode = 'P0001';
  end if;
  if v_e.kind in ('acquisition', 'opening') then
    raise exception 'The starting count cannot be reversed. Use a population adjustment.' using errcode = 'P0001';
  end if;
  if v_e.kind in ('transfer_in', 'transfer_out') then
    raise exception 'Transfers cannot be reversed one side at a time. Record a transfer back.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sale_lines where batch_event_id = p_event) then
    raise exception 'This was recorded through a sale. Void the sale instead.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.production_records where batch_event_id = p_event and status = 'posted') then
    raise exception 'This was recorded through a harvest. Void the harvest record instead.' using errcode = 'P0001';
  end if;
  if v_b.status <> 'active' then
    raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001';
  end if;

  insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate,
    reason, reverses_event_id, recorded_by)
  values (v_e.organization_id, v_e.site_id, v_e.batch_id, current_date, 'reversal', -v_e.quantity, v_e.is_estimate,
    trim(p_reason), p_event, auth.uid())
  returning id into v_rev;

  update public.activity_logs set voided_at = now(), void_reason = 'Reversed: ' || trim(p_reason)
  where batch_event_id = p_event and voided_at is null;

  perform private.audit(v_e.organization_id, v_e.site_id, 'batch_event.reversed', 'batch_events', p_event, trim(p_reason),
    to_jsonb(v_e), null);
  return private.idem_finish(v_e.organization_id, p_key, 'reverse_batch_event', jsonb_build_object('reversal_id', v_rev));
end;
$$;

create or replace function public.record_fish_sample(
  p_key uuid,
  p_batch uuid,
  p_sample_date date,
  p_sample_size integer,
  p_total_weight_g numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_prev jsonb;
  v_id uuid;
begin
  select * into v_b from public.batches where id = p_batch;
  if not found then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'record_fish_sample');
  if v_prev is not null then return v_prev; end if;
  v_b := private.lock_batch(p_batch, 'operations.record');
  if v_b.production_type <> 'fish' then
    raise exception 'Growth sampling applies to fish batches.' using errcode = '22023';
  end if;
  if v_b.status <> 'active' then raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001'; end if;
  perform private.require_date(p_sample_date);
  perform private.require_positive(p_sample_size, 'Number of fish sampled');
  perform private.require_positive(p_total_weight_g, 'Total sample weight');

  insert into public.fish_samples (organization_id, site_id, batch_id, sample_date, sample_size, total_weight_g, notes, recorded_by)
  values (v_b.organization_id, v_b.site_id, p_batch, p_sample_date, p_sample_size, p_total_weight_g, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  perform private.log_system(v_b.organization_id, v_b.site_id, p_sample_date, 'fish', 'sampling',
    'Sampled ' || p_sample_size || ' fish in ' || v_b.code || ': average ' || round(p_total_weight_g / p_sample_size, 1) || ' g',
    p_batch => p_batch, p_quantity => p_sample_size, p_unit => private.unit_id('each'), p_notes => p_notes);
  return private.idem_finish(v_b.organization_id, p_key, 'record_fish_sample', jsonb_build_object('sample_id', v_id));
end;
$$;

-- ===========================================================================
-- Production records
-- ===========================================================================
create or replace function public.record_egg_collection(
  p_key uuid,
  p_batch uuid,
  p_record_date date,
  p_quantity numeric,
  p_unit uuid,
  p_rejected_quantity numeric default 0,
  p_grade text default null,
  p_notes text default null,
  p_responsible uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_prev jsonb;
  v_unit public.units;
  v_id uuid;
begin
  select * into v_b from public.batches where id = p_batch;
  if not found then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'record_egg_collection');
  if v_prev is not null then return v_prev; end if;
  v_b := private.lock_batch(p_batch, 'operations.record');
  if v_b.production_type <> 'poultry' then
    raise exception 'Egg collection applies to poultry batches.' using errcode = '22023';
  end if;
  if v_b.status <> 'active' then raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001'; end if;
  perform private.require_date(p_record_date);
  perform private.require_positive(p_quantity, 'Eggs collected');
  perform private.require_member(v_b.organization_id, p_responsible);
  v_unit := private.assert_unit(v_b.organization_id, p_unit);
  if v_unit.dimension <> 'count' then
    raise exception 'Record eggs as a count (pieces, crates or dozens).' using errcode = '22023';
  end if;
  if coalesce(p_rejected_quantity, 0) < 0 or coalesce(p_rejected_quantity, 0) > p_quantity then
    raise exception 'Cracked or rejected eggs must be between zero and the number collected.' using errcode = '22023';
  end if;

  insert into public.production_records (organization_id, site_id, production_type, record_kind, batch_id, product,
    record_date, quantity, unit_id, rejected_quantity, grade, notes, responsible_id, recorded_by)
  values (v_b.organization_id, v_b.site_id, 'poultry', 'egg_collection', p_batch, 'Eggs', p_record_date, p_quantity,
    p_unit, coalesce(p_rejected_quantity, 0), nullif(trim(p_grade), ''), nullif(trim(p_notes), ''),
    coalesce(p_responsible, auth.uid()), auth.uid())
  returning id into v_id;

  perform private.log_system(v_b.organization_id, v_b.site_id, p_record_date, 'poultry', 'egg_collection',
    'Collected eggs from ' || v_b.code || ': ' || trim(to_char(p_quantity, 'FM999999990.##')) || ' ' || v_unit.name
      || case when coalesce(p_rejected_quantity, 0) > 0
           then ' (' || trim(to_char(p_rejected_quantity, 'FM999999990.##')) || ' rejected)' else '' end,
    p_batch => p_batch, p_quantity => p_quantity, p_unit => p_unit, p_notes => p_notes,
    p_production_record => v_id, p_responsible => p_responsible);
  return private.idem_finish(v_b.organization_id, p_key, 'record_egg_collection', jsonb_build_object('record_id', v_id));
end;
$$;

-- A fish harvest removes fish from the batch and creates produce (by weight).
-- If an estimated population turns out lower than the real harvest count,
-- the difference is recorded as an explicit adjustment, never hidden.
create or replace function public.record_fish_harvest(
  p_key uuid,
  p_batch uuid,
  p_record_date date,
  p_head_count integer,
  p_weight_kg numeric,
  p_count_is_estimate boolean default true,
  p_rejected_kg numeric default 0,
  p_grade text default null,
  p_destination text default null,
  p_notes text default null,
  p_final_harvest boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_prev jsonb;
  v_pop integer;
  v_event uuid;
  v_record uuid;
  v_adjusted integer := 0;
  v_written_off integer := 0;
begin
  select * into v_b from public.batches where id = p_batch;
  if not found then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'record_fish_harvest');
  if v_prev is not null then return v_prev; end if;
  v_b := private.lock_batch(p_batch, 'operations.record');
  if v_b.production_type <> 'fish' then
    raise exception 'Fish harvests apply to fish batches.' using errcode = '22023';
  end if;
  if v_b.status <> 'active' then raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001'; end if;
  if coalesce(p_final_harvest, false) then
    perform private.require(v_b.organization_id, v_b.site_id, 'batches.manage');
  end if;
  perform private.require_date(p_record_date);
  perform private.require_positive(p_head_count, 'Number of fish harvested');
  perform private.require_positive(p_weight_kg, 'Harvest weight');
  if coalesce(p_rejected_kg, 0) < 0 or coalesce(p_rejected_kg, 0) > p_weight_kg then
    raise exception 'Rejected weight must be between zero and the harvest weight.' using errcode = '22023';
  end if;

  v_pop := private.batch_population(p_batch);
  if p_head_count > v_pop then
    if v_b.count_basis <> 'estimated' then
      raise exception 'Batch % has % fish recorded; you entered %.', v_b.code, v_pop, p_head_count using errcode = '23514';
    end if;
    v_adjusted := p_head_count - v_pop;
    insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate, reason, recorded_by)
    values (v_b.organization_id, v_b.site_id, p_batch, p_record_date, 'adjustment', v_adjusted, true,
      'Harvest count exceeded the estimated population', auth.uid());
  end if;

  insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, weight_kg, is_estimate, reason, recorded_by)
  values (v_b.organization_id, v_b.site_id, p_batch, p_record_date, 'harvest', -p_head_count, p_weight_kg,
    coalesce(p_count_is_estimate, true), 'Harvest', auth.uid())
  returning id into v_event;

  insert into public.production_records (organization_id, site_id, production_type, record_kind, batch_id, product,
    record_date, quantity, unit_id, rejected_quantity, grade, weight_kg, head_count, is_estimate, destination,
    batch_event_id, notes, responsible_id, recorded_by)
  values (v_b.organization_id, v_b.site_id, 'fish', 'fish_harvest', p_batch, v_b.species, p_record_date, p_weight_kg,
    private.unit_id('kg'), coalesce(p_rejected_kg, 0), nullif(trim(p_grade), ''), p_weight_kg, p_head_count,
    coalesce(p_count_is_estimate, true), nullif(trim(p_destination), ''), v_event, nullif(trim(p_notes), ''),
    auth.uid(), auth.uid())
  returning id into v_record;

  if coalesce(p_final_harvest, false) then
    v_pop := private.batch_population(p_batch);
    if v_pop > 0 then
      v_written_off := v_pop;
      insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate, reason, recorded_by)
      values (v_b.organization_id, v_b.site_id, p_batch, p_record_date, 'adjustment', -v_pop, true,
        'Remaining estimate written off at final harvest', auth.uid());
    end if;
  end if;

  perform private.log_system(v_b.organization_id, v_b.site_id, p_record_date, 'fish', 'harvest',
    'Harvested ' || p_head_count || case when coalesce(p_count_is_estimate, true) then ' (est.)' else '' end
      || ' fish, ' || round(p_weight_kg, 1) || ' kg from ' || v_b.code,
    p_batch => p_batch, p_quantity => p_weight_kg, p_unit => private.unit_id('kg'), p_notes => p_notes,
    p_batch_event => v_event, p_production_record => v_record);

  return private.idem_finish(v_b.organization_id, p_key, 'record_fish_harvest', jsonb_build_object(
    'record_id', v_record, 'event_id', v_event, 'estimate_adjusted_by', v_adjusted, 'written_off', v_written_off));
end;
$$;

create or replace function public.record_crop_harvest(
  p_key uuid,
  p_cycle uuid,
  p_record_date date,
  p_quantity numeric,
  p_unit uuid,
  p_product text default null,
  p_rejected_quantity numeric default 0,
  p_grade text default null,
  p_destination text default null,
  p_notes text default null,
  p_responsible uuid default null,
  p_mark_harvested boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.crop_cycles;
  v_prev jsonb;
  v_unit public.units;
  v_id uuid;
begin
  select * into v_c from public.crop_cycles where id = p_cycle;
  if not found or not public.has_site_access(v_c.organization_id, v_c.site_id) then
    raise exception 'Crop cycle not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_c.organization_id, p_key, 'record_crop_harvest');
  if v_prev is not null then return v_prev; end if;
  select * into v_c from public.crop_cycles where id = p_cycle for update;
  perform private.require(v_c.organization_id, v_c.site_id, 'operations.record');
  if coalesce(p_mark_harvested, false) then
    perform private.require(v_c.organization_id, v_c.site_id, 'batches.manage');
  end if;
  if v_c.status not in ('active', 'harvested') then
    raise exception 'Harvests can only be recorded on an active crop cycle.' using errcode = 'P0001';
  end if;
  perform private.require_date(p_record_date);
  if p_record_date < v_c.planting_date then
    raise exception 'The harvest date is before planting (%).', v_c.planting_date using errcode = '22023';
  end if;
  perform private.require_positive(p_quantity, 'Harvest quantity');
  perform private.require_member(v_c.organization_id, p_responsible);
  v_unit := private.assert_unit(v_c.organization_id, p_unit);
  if coalesce(p_rejected_quantity, 0) < 0 or coalesce(p_rejected_quantity, 0) > p_quantity then
    raise exception 'Rejected quantity must be between zero and the harvested quantity.' using errcode = '22023';
  end if;

  insert into public.production_records (organization_id, site_id, production_type, record_kind, crop_cycle_id, product,
    record_date, quantity, unit_id, rejected_quantity, grade, destination, notes, responsible_id, recorded_by)
  values (v_c.organization_id, v_c.site_id, 'crop', 'crop_harvest', p_cycle, coalesce(nullif(trim(p_product), ''), v_c.crop),
    p_record_date, p_quantity, p_unit, coalesce(p_rejected_quantity, 0), nullif(trim(p_grade), ''),
    nullif(trim(p_destination), ''), nullif(trim(p_notes), ''), coalesce(p_responsible, auth.uid()), auth.uid())
  returning id into v_id;

  if coalesce(p_mark_harvested, false) and v_c.status = 'active' then
    update public.crop_cycles set status = 'harvested' where id = p_cycle;
  end if;

  perform private.log_system(v_c.organization_id, v_c.site_id, p_record_date, 'crop', 'harvest',
    'Harvested ' || coalesce(nullif(trim(p_product), ''), v_c.crop) || ' from ' || v_c.code || ': '
      || trim(to_char(p_quantity, 'FM999999990.##')) || ' ' || v_unit.name,
    p_cycle => p_cycle, p_quantity => p_quantity, p_unit => p_unit, p_notes => p_notes,
    p_production_record => v_id, p_responsible => p_responsible);
  return private.idem_finish(v_c.organization_id, p_key, 'record_crop_harvest', jsonb_build_object('record_id', v_id));
end;
$$;

-- Non-sale disposals of produce: home use, gifts, spoilage.
create or replace function public.record_disposal(
  p_key uuid,
  p_record uuid,
  p_kind text,
  p_quantity numeric,
  p_disposal_date date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.production_records;
  v_prev jsonb;
  v_available numeric;
  v_id uuid;
begin
  select * into v_r from public.production_records where id = p_record;
  if not found or not public.has_site_access(v_r.organization_id, v_r.site_id) then
    raise exception 'Production record not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_r.organization_id, p_key, 'record_disposal');
  if v_prev is not null then return v_prev; end if;
  select * into v_r from public.production_records where id = p_record for update;
  perform private.require(v_r.organization_id, v_r.site_id, 'operations.record');
  if v_r.status <> 'posted' then raise exception 'This production record has been voided.' using errcode = 'P0001'; end if;
  if p_kind not in ('internal_use', 'given_away', 'spoiled', 'other') then
    raise exception 'Use the sales screen to record sold produce.' using errcode = '22023';
  end if;
  perform private.require_date(p_disposal_date);
  perform private.require_positive(p_quantity, 'Quantity');
  if p_disposal_date < v_r.record_date then
    raise exception 'The date is before the produce was recorded.' using errcode = '22023';
  end if;
  v_available := private.record_available(p_record);
  if p_quantity > v_available then
    raise exception 'Only % remains available from this record.', trim(to_char(v_available, 'FM999999990.####')) using errcode = '23514';
  end if;

  insert into public.production_disposals (organization_id, site_id, production_record_id, disposal_date, kind, quantity, notes, recorded_by)
  values (v_r.organization_id, v_r.site_id, p_record, p_disposal_date, p_kind, p_quantity, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  return private.idem_finish(v_r.organization_id, p_key, 'record_disposal',
    jsonb_build_object('disposal_id', v_id, 'available', v_available - p_quantity));
end;
$$;

create or replace function public.void_production_record(p_record uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.production_records;
  v_b public.batches;
begin
  select * into v_r from public.production_records where id = p_record for update;
  if not found or not public.has_site_access(v_r.organization_id, v_r.site_id) then
    raise exception 'Production record not found.' using errcode = 'P0002';
  end if;
  perform private.require(v_r.organization_id, v_r.site_id, 'batches.manage');
  if v_r.status <> 'posted' then raise exception 'This record is already voided.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = '22023'; end if;
  if exists (select 1 from public.production_disposals where production_record_id = p_record and status = 'posted') then
    raise exception 'Some of this produce has been sold or used. Void those records first.' using errcode = 'P0001';
  end if;

  if v_r.batch_event_id is not null then
    v_b := private.lock_batch(v_r.batch_id, 'batches.manage');
    if v_b.status <> 'active' then
      raise exception 'The batch is closed, so this harvest can no longer be voided.' using errcode = 'P0001';
    end if;
    insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate,
      reason, reverses_event_id, recorded_by)
    select organization_id, site_id, batch_id, current_date, 'reversal', -quantity, is_estimate,
      'Harvest voided: ' || trim(p_reason), id, auth.uid()
    from public.batch_events where id = v_r.batch_event_id;
  end if;

  update public.production_records set status = 'voided', voided_at = now(), void_reason = trim(p_reason) where id = p_record;
  update public.activity_logs set voided_at = now(), void_reason = 'Voided: ' || trim(p_reason)
  where production_record_id = p_record and voided_at is null;
  perform private.audit(v_r.organization_id, v_r.site_id, 'production_record.voided', 'production_records', p_record,
    trim(p_reason), to_jsonb(v_r), null);
end;
$$;

-- ===========================================================================
-- Crop cycles
-- ===========================================================================
create or replace function public.create_crop_cycle(
  p_org uuid,
  p_site uuid,
  p_production_unit uuid,
  p_code text,
  p_crop text,
  p_area numeric,
  p_area_unit uuid,
  p_planting_date date default null,
  p_variety text default null,
  p_season text default null,
  p_expected_harvest_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_area_unit public.units;
begin
  perform private.require(p_org, p_site, 'batches.manage');
  if not exists (select 1 from public.production_units where id = p_production_unit and site_id = p_site
                 and organization_id = p_org and production_type = 'crop' and status = 'active') then
    raise exception 'Choose an active field or plot on this site.' using errcode = '22023';
  end if;
  perform private.require_positive(p_area, 'Area');
  v_area_unit := private.assert_unit(p_org, p_area_unit);
  if v_area_unit.dimension <> 'area' then
    raise exception 'Choose an area unit such as hectares or acres.' using errcode = '22023';
  end if;
  if p_planting_date is not null then perform private.require_date(p_planting_date); end if;

  insert into public.crop_cycles (organization_id, site_id, production_unit_id, code, crop, variety, season, planting_date,
    area, area_unit_id, expected_harvest_date, status, notes, created_by)
  values (p_org, p_site, p_production_unit, upper(trim(p_code)), trim(p_crop), nullif(trim(p_variety), ''),
    nullif(trim(p_season), ''), p_planting_date, p_area, p_area_unit, p_expected_harvest_date,
    case when p_planting_date is null then 'planned' else 'active' end, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  if p_planting_date is not null then
    perform private.log_system(p_org, p_site, p_planting_date, 'crop', 'planting',
      'Planted ' || trim(p_crop) || ' (' || upper(trim(p_code)) || ') on ' || trim(to_char(p_area, 'FM999999990.####')) || ' ' || v_area_unit.symbol,
      p_cycle => v_id, p_quantity => p_area, p_unit => p_area_unit);
  end if;
  return v_id;
end;
$$;

create or replace function public.set_crop_cycle_status(
  p_cycle uuid,
  p_status text,
  p_date date default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.crop_cycles;
  v_unit public.units;
begin
  select * into v_c from public.crop_cycles where id = p_cycle for update;
  if not found or not public.has_site_access(v_c.organization_id, v_c.site_id) then
    raise exception 'Crop cycle not found.' using errcode = 'P0002';
  end if;
  perform private.require(v_c.organization_id, v_c.site_id, 'batches.manage');

  if p_status = 'active' then
    if v_c.status <> 'planned' then raise exception 'Only a planned cycle can be started.' using errcode = 'P0001'; end if;
    perform private.require_date(p_date);
    update public.crop_cycles set status = 'active', planting_date = p_date where id = p_cycle;
    select * into v_unit from public.units where id = v_c.area_unit_id;
    perform private.log_system(v_c.organization_id, v_c.site_id, p_date, 'crop', 'planting',
      'Planted ' || v_c.crop || ' (' || v_c.code || ')', p_cycle => p_cycle, p_quantity => v_c.area, p_unit => v_c.area_unit_id);
  elsif p_status in ('harvested', 'closed', 'failed') then
    if v_c.status in ('closed', 'failed') then raise exception 'This cycle is already closed.' using errcode = 'P0001'; end if;
    if p_status = 'harvested' and v_c.status <> 'active' then
      raise exception 'Only an active cycle can be marked harvested.' using errcode = 'P0001';
    end if;
    if p_status = 'failed' and coalesce(trim(p_reason), '') = '' then
      raise exception 'A reason is required when a cycle fails.' using errcode = '22023';
    end if;
    update public.crop_cycles
    set status = p_status,
        closed_on = case when p_status in ('closed', 'failed') then coalesce(p_date, current_date) end,
        close_reason = case when p_status in ('closed', 'failed') then nullif(trim(p_reason), '') end
    where id = p_cycle;
    if p_status in ('closed', 'failed') then
      perform private.log_system(v_c.organization_id, v_c.site_id, coalesce(p_date, current_date), 'crop', 'batch_close',
        case when p_status = 'failed' then 'Crop cycle ' || v_c.code || ' failed' else 'Closed crop cycle ' || v_c.code end,
        p_cycle => p_cycle, p_notes => p_reason);
    end if;
  else
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
end;
$$;

-- ===========================================================================
-- Inventory
-- ===========================================================================
create or replace function public.record_stock_receipt(
  p_key uuid,
  p_store uuid,
  p_item uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit uuid,
  p_movement_date date,
  p_total_cost numeric default null,
  p_supplier text default null,
  p_reference text default null,
  p_reason text default null,
  p_record_expense boolean default false,
  p_payment_method text default null,
  p_expense_category uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.stores;
  v_i public.inventory_items;
  v_prev jsonb;
  v_factor numeric;
  v_base numeric;
  v_move uuid;
  v_txn uuid;
  v_cat uuid;
begin
  select * into v_s from public.stores where id = p_store;
  if not found then raise exception 'Store not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_s.organization_id, p_key, 'record_stock_receipt');
  if v_prev is not null then return v_prev; end if;

  v_s := private.get_store(p_store, 'inventory.manage');
  v_i := private.lock_item(p_item, v_s.organization_id);
  if p_movement_type not in ('opening', 'purchase', 'receipt') then
    raise exception 'Choose opening balance, purchase or other receipt.' using errcode = '22023';
  end if;
  perform private.require_date(p_movement_date);
  perform private.require_positive(p_quantity, 'Quantity');
  if p_total_cost is not null and p_total_cost < 0 then
    raise exception 'Cost cannot be negative.' using errcode = '22023';
  end if;
  if p_movement_type = 'opening' and exists (select 1 from public.inventory_movements where item_id = p_item and store_id = p_store) then
    raise exception 'This item already has stock history in this store. Use a stock count to correct the balance.' using errcode = 'P0001';
  end if;
  if p_movement_type = 'receipt' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Describe where this stock came from.' using errcode = '22023';
  end if;
  if coalesce(p_record_expense, false) then
    if p_movement_type <> 'purchase' then
      raise exception 'Only purchases can be recorded as an expense.' using errcode = '22023';
    end if;
    if coalesce(p_total_cost, 0) <= 0 then
      raise exception 'Enter the purchase cost to record it as an expense.' using errcode = '22023';
    end if;
    perform private.require(v_s.organization_id, v_s.site_id, 'finance.record');
  end if;

  v_factor := private.item_factor(v_s.organization_id, v_i, p_unit);
  v_base := round(p_quantity * v_factor, 4);
  v_move := private.insert_movement(v_s.organization_id, v_s.site_id, p_store, p_item, p_movement_type, p_movement_date,
    v_base, p_quantity, p_unit, v_factor,
    p_unit_cost => case when p_total_cost is not null then round(p_total_cost / v_base, 4) end,
    p_total_cost => p_total_cost, p_supplier => p_supplier, p_reference => p_reference, p_reason => p_reason);

  if coalesce(p_record_expense, false) then
    v_cat := coalesce(p_expense_category, private.category_id(v_s.organization_id, 'expense',
      case when v_i.is_feed then 'feed' else 'inventory_purchase' end));
    v_txn := private.insert_finance(v_s.organization_id, v_s.site_id, 'expense', v_cat, p_total_cost, p_movement_date,
      p_payment_method, 'Purchase: ' || trim(to_char(p_quantity, 'FM999999990.####')) || ' × ' || v_i.name,
      p_reference, p_supplier, coalesce(v_i.production_type, 'general'), p_movement => v_move);
  end if;

  perform private.log_system(v_s.organization_id, v_s.site_id, p_movement_date, coalesce(v_i.production_type, 'general'),
    'stock_received', case p_movement_type when 'opening' then 'Opening balance of ' when 'purchase' then 'Purchased ' else 'Received ' end
      || v_i.name || ': ' || trim(to_char(p_quantity, 'FM999999990.####')) || ' ' || (select name from public.units where id = p_unit) || ' into ' || v_s.name,
    p_quantity => p_quantity, p_unit => p_unit, p_movement => v_move, p_finance => v_txn);

  return private.idem_finish(v_s.organization_id, p_key, 'record_stock_receipt', jsonb_build_object(
    'movement_id', v_move, 'finance_transaction_id', v_txn, 'balance', private.stock_balance(p_item, p_store)));
end;
$$;

-- General usage from a store: crop inputs, packaging, fuel, consumables.
create or replace function public.record_stock_usage(
  p_key uuid,
  p_store uuid,
  p_item uuid,
  p_quantity numeric,
  p_unit uuid,
  p_movement_date date,
  p_crop_cycle uuid default null,
  p_activity_code text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.stores;
  v_i public.inventory_items;
  v_c public.crop_cycles;
  v_prev jsonb;
  v_factor numeric;
  v_base numeric;
  v_balance numeric;
  v_move uuid;
  v_code text;
begin
  select * into v_s from public.stores where id = p_store;
  if not found then raise exception 'Store not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_s.organization_id, p_key, 'record_stock_usage');
  if v_prev is not null then return v_prev; end if;

  v_s := private.get_store(p_store, 'inventory.record');
  v_i := private.lock_item(p_item, v_s.organization_id);
  if v_i.is_feed and p_crop_cycle is null then
    raise exception 'Issue feed to a batch from the feed screen so consumption is tracked.' using errcode = '22023';
  end if;
  perform private.require_date(p_movement_date);
  perform private.require_positive(p_quantity, 'Quantity');
  if p_crop_cycle is not null then
    select * into v_c from public.crop_cycles where id = p_crop_cycle and site_id = v_s.site_id;
    if not found then raise exception 'The crop cycle must be on the same site as the store.' using errcode = '22023'; end if;
    if v_c.status not in ('active', 'planned') then raise exception 'Crop cycle % is closed.', v_c.code using errcode = 'P0001'; end if;
    perform private.require(v_s.organization_id, v_s.site_id, 'operations.record');
    v_code := coalesce(p_activity_code, 'input_application');
    if v_code not in ('input_application', 'fertilizer', 'pesticide', 'planting', 'irrigation', 'other') then
      raise exception 'Unknown activity.' using errcode = '22023';
    end if;
  elsif coalesce(trim(p_reason), '') = '' then
    raise exception 'Describe what the stock was used for.' using errcode = '22023';
  end if;

  v_factor := private.item_factor(v_s.organization_id, v_i, p_unit);
  v_base := round(p_quantity * v_factor, 4);
  v_balance := private.stock_balance(p_item, p_store);
  if v_base > v_balance then
    raise exception '% has % % in %; you entered %.', v_i.name, trim(to_char(v_balance, 'FM999999990.####')),
      (select symbol from public.units where id = v_i.base_unit_id), v_s.name, trim(to_char(v_base, 'FM999999990.####'))
      using errcode = '23514';
  end if;

  v_move := private.insert_movement(v_s.organization_id, v_s.site_id, p_store, p_item, 'consumption', p_movement_date,
    -v_base, p_quantity, p_unit, v_factor, p_reason => p_reason, p_cycle => p_crop_cycle);

  perform private.log_system(v_s.organization_id, v_s.site_id, p_movement_date,
    case when p_crop_cycle is not null then 'crop' else coalesce(v_i.production_type, 'general') end,
    coalesce(v_code, 'stock_used'),
    'Used ' || v_i.name || ': ' || trim(to_char(p_quantity, 'FM999999990.####')) || ' ' || (select name from public.units where id = p_unit)
      || coalesce(' on ' || v_c.code, '') || coalesce(' (' || nullif(trim(p_reason), '') || ')', ''),
    p_cycle => p_crop_cycle, p_quantity => p_quantity, p_unit => p_unit, p_movement => v_move);

  return private.idem_finish(v_s.organization_id, p_key, 'record_stock_usage',
    jsonb_build_object('movement_id', v_move, 'balance', v_balance - v_base));
end;
$$;

create or replace function public.record_stock_wastage(
  p_key uuid,
  p_store uuid,
  p_item uuid,
  p_quantity numeric,
  p_unit uuid,
  p_movement_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.stores;
  v_i public.inventory_items;
  v_prev jsonb;
  v_factor numeric;
  v_base numeric;
  v_balance numeric;
  v_move uuid;
begin
  select * into v_s from public.stores where id = p_store;
  if not found then raise exception 'Store not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_s.organization_id, p_key, 'record_stock_wastage');
  if v_prev is not null then return v_prev; end if;
  v_s := private.get_store(p_store, 'inventory.record');
  v_i := private.lock_item(p_item, v_s.organization_id);
  perform private.require_date(p_movement_date);
  perform private.require_positive(p_quantity, 'Quantity');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for wastage.' using errcode = '22023'; end if;
  v_factor := private.item_factor(v_s.organization_id, v_i, p_unit);
  v_base := round(p_quantity * v_factor, 4);
  v_balance := private.stock_balance(p_item, p_store);
  if v_base > v_balance then
    raise exception '% has only % in %.', v_i.name, trim(to_char(v_balance, 'FM999999990.####')), v_s.name using errcode = '23514';
  end if;
  v_move := private.insert_movement(v_s.organization_id, v_s.site_id, p_store, p_item, 'wastage', p_movement_date,
    -v_base, p_quantity, p_unit, v_factor, p_reason => p_reason);
  perform private.log_system(v_s.organization_id, v_s.site_id, p_movement_date, coalesce(v_i.production_type, 'general'),
    'stock_wastage',
    'Wasted in store: ' || v_i.name || ', ' || trim(to_char(p_quantity, 'FM999999990.####')) || ' ' || (select name from public.units where id = p_unit) || ' (' || trim(p_reason) || ')',
    p_quantity => p_quantity, p_unit => p_unit, p_movement => v_move);
  return private.idem_finish(v_s.organization_id, p_key, 'record_stock_wastage',
    jsonb_build_object('movement_id', v_move, 'balance', v_balance - v_base));
end;
$$;

create or replace function public.transfer_stock(
  p_key uuid,
  p_from_store uuid,
  p_to_store uuid,
  p_item uuid,
  p_quantity numeric,
  p_unit uuid,
  p_movement_date date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.stores;
  v_to public.stores;
  v_i public.inventory_items;
  v_prev jsonb;
  v_factor numeric;
  v_base numeric;
  v_balance numeric;
  v_group uuid := gen_random_uuid();
  v_out uuid;
  v_in uuid;
begin
  select * into v_from from public.stores where id = p_from_store;
  if not found then raise exception 'Store not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_from.organization_id, p_key, 'transfer_stock');
  if v_prev is not null then return v_prev; end if;
  v_from := private.get_store(p_from_store, 'inventory.manage');
  v_to := private.get_store(p_to_store, 'inventory.manage');
  if v_from.id = v_to.id then raise exception 'Choose two different stores.' using errcode = '22023'; end if;
  if v_from.organization_id <> v_to.organization_id then raise exception 'Store not found.' using errcode = 'P0002'; end if;
  v_i := private.lock_item(p_item, v_from.organization_id);
  perform private.require_date(p_movement_date);
  perform private.require_positive(p_quantity, 'Quantity');
  v_factor := private.item_factor(v_from.organization_id, v_i, p_unit);
  v_base := round(p_quantity * v_factor, 4);
  v_balance := private.stock_balance(p_item, p_from_store);
  if v_base > v_balance then
    raise exception '% has only % in %.', v_i.name, trim(to_char(v_balance, 'FM999999990.####')), v_from.name using errcode = '23514';
  end if;

  v_out := private.insert_movement(v_from.organization_id, v_from.site_id, p_from_store, p_item, 'transfer_out', p_movement_date,
    -v_base, p_quantity, p_unit, v_factor, p_reason => coalesce(nullif(trim(p_reason), ''), 'Transfer to ' || v_to.name),
    p_transfer_group => v_group);
  v_in := private.insert_movement(v_to.organization_id, v_to.site_id, p_to_store, p_item, 'transfer_in', p_movement_date,
    v_base, p_quantity, p_unit, v_factor, p_reason => coalesce(nullif(trim(p_reason), ''), 'Transfer from ' || v_from.name),
    p_transfer_group => v_group);

  perform private.log_system(v_from.organization_id, v_from.site_id, p_movement_date, coalesce(v_i.production_type, 'general'),
    'transfer', 'Transferred ' || v_i.name || ' from ' || v_from.name || ' to ' || v_to.name || ': ' || trim(to_char(p_quantity, 'FM999999990.####')) || ' ' || (select name from public.units where id = p_unit),
    p_quantity => p_quantity, p_unit => p_unit, p_movement => v_out);
  return private.idem_finish(v_from.organization_id, p_key, 'transfer_stock',
    jsonb_build_object('transfer_group_id', v_group, 'out_movement_id', v_out, 'in_movement_id', v_in));
end;
$$;

-- Physical count: records what was counted and posts the difference as an
-- adjustment, so the ledger matches the shelf.
create or replace function public.record_stock_count(
  p_key uuid,
  p_store uuid,
  p_item uuid,
  p_counted_quantity numeric,
  p_unit uuid,
  p_count_date date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.stores;
  v_i public.inventory_items;
  v_prev jsonb;
  v_factor numeric;
  v_counted numeric;
  v_system numeric;
  v_count uuid;
  v_move uuid;
begin
  select * into v_s from public.stores where id = p_store;
  if not found then raise exception 'Store not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_s.organization_id, p_key, 'record_stock_count');
  if v_prev is not null then return v_prev; end if;
  v_s := private.get_store(p_store, 'inventory.manage');
  v_i := private.lock_item(p_item, v_s.organization_id);
  perform private.require_date(p_count_date);
  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'Enter the quantity counted (zero or more).' using errcode = '22023';
  end if;
  v_factor := private.item_factor(v_s.organization_id, v_i, p_unit);
  v_counted := round(p_counted_quantity * v_factor, 4);
  v_system := private.stock_balance(p_item, p_store);
  if v_counted <> v_system and coalesce(trim(p_reason), '') = '' then
    raise exception 'The count differs from the system balance by %. Give a reason for the difference.',
      trim(to_char(v_counted - v_system, 'FM999999990.####')) using errcode = '22023';
  end if;

  insert into public.stock_counts (organization_id, site_id, store_id, item_id, count_date, system_quantity, counted_quantity, reason, recorded_by)
  values (v_s.organization_id, v_s.site_id, p_store, p_item, p_count_date, v_system, v_counted, nullif(trim(p_reason), ''), auth.uid())
  returning id into v_count;

  if v_counted <> v_system then
    v_move := private.insert_movement(v_s.organization_id, v_s.site_id, p_store, p_item, 'adjustment', p_count_date,
      v_counted - v_system, abs(v_counted - v_system), v_i.base_unit_id, 1,
      p_reason => 'Stock count: ' || trim(p_reason), p_stock_count => v_count);
    perform private.log_system(v_s.organization_id, v_s.site_id, p_count_date, coalesce(v_i.production_type, 'general'),
      'stock_count', 'Stock count adjusted ' || v_i.name || ' in ' || v_s.name || ' by ' || trim(to_char(v_counted - v_system, 'FM999999990.####')),
      p_quantity => abs(v_counted - v_system), p_unit => v_i.base_unit_id, p_movement => v_move, p_notes => p_reason);
  end if;

  return private.idem_finish(v_s.organization_id, p_key, 'record_stock_count', jsonb_build_object(
    'stock_count_id', v_count, 'adjustment_movement_id', v_move, 'variance', v_counted - v_system));
end;
$$;

create or replace function public.reverse_inventory_movement(p_key uuid, p_movement uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.inventory_movements;
  v_prev jsonb;
  v_rev uuid;
  v_txn public.finance_transactions;
  v_txn_rev uuid;
begin
  select * into v_m from public.inventory_movements where id = p_movement;
  if not found or not public.has_site_access(v_m.organization_id, v_m.site_id) then
    raise exception 'Stock movement not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_m.organization_id, p_key, 'reverse_inventory_movement');
  if v_prev is not null then return v_prev; end if;
  perform private.require(v_m.organization_id, v_m.site_id, 'inventory.manage');
  perform private.lock_item(v_m.item_id, v_m.organization_id);
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reverse a movement.' using errcode = '22023'; end if;
  if v_m.movement_type = 'reversal' then
    raise exception 'A reversal cannot itself be reversed.' using errcode = 'P0001';
  end if;
  if v_m.movement_type in ('transfer_in', 'transfer_out') then
    raise exception 'Transfers cannot be reversed one side at a time. Transfer the stock back instead.' using errcode = 'P0001';
  end if;
  if v_m.stock_count_id is not null then
    raise exception 'Stock count adjustments are corrected by counting again.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.feed_events where inventory_movement_id = p_movement) then
    raise exception 'This movement belongs to a feed record. Reverse the feed record instead.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.inventory_movements where reverses_movement_id = p_movement) then
    raise exception 'This movement has already been reversed.' using errcode = 'P0001';
  end if;

  select * into v_txn from public.finance_transactions
  where inventory_movement_id = p_movement and status = 'posted' and reverses_id is null;
  if found then
    perform private.require(v_m.organization_id, v_m.site_id, 'finance.reverse');
  end if;

  v_rev := private.insert_movement(v_m.organization_id, v_m.site_id, v_m.store_id, v_m.item_id, 'reversal', current_date,
    -v_m.quantity, v_m.entered_quantity, v_m.entered_unit_id, v_m.conversion_factor,
    p_reason => 'Reversal: ' || trim(p_reason), p_batch => v_m.batch_id, p_cycle => v_m.crop_cycle_id, p_reverses => p_movement);

  if v_txn.id is not null then
    insert into public.finance_transactions (organization_id, site_id, txn_date, kind, category_id, amount, currency,
      payment_method, description, reference, counterparty, production_type, batch_id, crop_cycle_id, reverses_id,
      reversal_reason, recorded_by)
    values (v_txn.organization_id, v_txn.site_id, current_date, v_txn.kind, v_txn.category_id, -v_txn.amount,
      v_txn.currency, v_txn.payment_method, 'Reversal: ' || v_txn.description, v_txn.reference, v_txn.counterparty,
      v_txn.production_type, v_txn.batch_id, v_txn.crop_cycle_id, v_txn.id, trim(p_reason), auth.uid())
    returning id into v_txn_rev;
    update public.finance_transactions set status = 'reversed' where id = v_txn.id;
  end if;

  update public.activity_logs set voided_at = now(), void_reason = 'Reversed: ' || trim(p_reason)
  where inventory_movement_id = p_movement and voided_at is null;
  perform private.audit(v_m.organization_id, v_m.site_id, 'inventory_movement.reversed', 'inventory_movements', p_movement,
    trim(p_reason), to_jsonb(v_m), null);
  return private.idem_finish(v_m.organization_id, p_key, 'reverse_inventory_movement',
    jsonb_build_object('reversal_id', v_rev, 'finance_reversal_id', v_txn_rev));
end;
$$;

-- ===========================================================================
-- Feed. Store stock is deducted exactly once, on issue.
-- ===========================================================================
create or replace function public.issue_feed(
  p_key uuid,
  p_batch uuid,
  p_store uuid,
  p_item uuid,
  p_quantity numeric,
  p_unit uuid,
  p_event_date date,
  p_consumed_now boolean default false,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_s public.stores;
  v_i public.inventory_items;
  v_prev jsonb;
  v_factor numeric;
  v_base numeric;
  v_balance numeric;
  v_move uuid;
  v_issue uuid;
  v_consume uuid;
begin
  select * into v_b from public.batches where id = p_batch;
  if not found then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'issue_feed');
  if v_prev is not null then return v_prev; end if;

  v_b := private.lock_batch(p_batch, 'inventory.record');
  if coalesce(p_consumed_now, false) then
    perform private.require(v_b.organization_id, v_b.site_id, 'operations.record');
  end if;
  if v_b.status <> 'active' then raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001'; end if;
  v_s := private.get_store(p_store, 'inventory.record');
  if v_s.site_id <> v_b.site_id then
    raise exception 'Issue feed from a store on the same site as the batch.' using errcode = '22023';
  end if;
  v_i := private.lock_item(p_item, v_b.organization_id);
  if not v_i.is_feed then raise exception '% is not marked as feed.', v_i.name using errcode = '22023'; end if;
  perform private.require_date(p_event_date);
  if p_event_date < v_b.start_date then raise exception 'The date is before the batch started.' using errcode = '22023'; end if;
  perform private.require_positive(p_quantity, 'Quantity');

  v_factor := private.item_factor(v_b.organization_id, v_i, p_unit);
  v_base := round(p_quantity * v_factor, 4);
  v_balance := private.stock_balance(p_item, p_store);
  if v_base > v_balance then
    raise exception '% has % % in %; you entered %.', v_i.name, trim(to_char(v_balance, 'FM999999990.####')),
      (select symbol from public.units where id = v_i.base_unit_id), v_s.name, trim(to_char(v_base, 'FM999999990.####'))
      using errcode = '23514';
  end if;

  v_move := private.insert_movement(v_b.organization_id, v_b.site_id, p_store, p_item, 'issue', p_event_date,
    -v_base, p_quantity, p_unit, v_factor, p_reason => 'Issued to ' || v_b.code, p_batch => p_batch);

  insert into public.feed_events (organization_id, site_id, batch_id, item_id, event_date, kind, quantity, inventory_movement_id, notes, recorded_by)
  values (v_b.organization_id, v_b.site_id, p_batch, p_item, p_event_date, 'issued', v_base, v_move, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_issue;

  if coalesce(p_consumed_now, false) then
    insert into public.feed_events (organization_id, site_id, batch_id, item_id, event_date, kind, quantity, notes, recorded_by)
    values (v_b.organization_id, v_b.site_id, p_batch, p_item, p_event_date, 'consumed', -v_base, nullif(trim(p_notes), ''), auth.uid())
    returning id into v_consume;
  end if;

  perform private.log_system(v_b.organization_id, v_b.site_id, p_event_date, v_b.production_type,
    case when v_consume is not null then 'feed_consumption' else 'feed_issue' end,
    case when v_consume is not null then 'Fed ' else 'Issued ' end || v_i.name || ' to ' || v_b.code || ': '
      || trim(to_char(p_quantity, 'FM999999990.####')) || ' ' || (select name from public.units where id = p_unit),
    p_batch => p_batch, p_quantity => p_quantity, p_unit => p_unit, p_notes => p_notes,
    p_feed_event => coalesce(v_consume, v_issue), p_movement => v_move);

  return private.idem_finish(v_b.organization_id, p_key, 'issue_feed', jsonb_build_object(
    'movement_id', v_move, 'issue_event_id', v_issue, 'consumption_event_id', v_consume,
    'store_balance', v_balance - v_base, 'feed_at_batch', private.feed_on_hand(p_batch, p_item)));
end;
$$;

-- Consumed or wasted feed already held at the batch. No inventory effect.
create or replace function public.record_feed_use(
  p_key uuid,
  p_batch uuid,
  p_item uuid,
  p_kind text,
  p_quantity numeric,
  p_unit uuid,
  p_event_date date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_i public.inventory_items;
  v_prev jsonb;
  v_factor numeric;
  v_base numeric;
  v_on_hand numeric;
  v_event uuid;
begin
  select * into v_b from public.batches where id = p_batch;
  if not found then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'record_feed_use');
  if v_prev is not null then return v_prev; end if;
  v_b := private.lock_batch(p_batch, 'operations.record');
  if p_kind not in ('consumed', 'wasted') then raise exception 'Choose consumed or wasted.' using errcode = '22023'; end if;
  if p_kind = 'wasted' and coalesce(trim(p_notes), '') = '' then
    raise exception 'Describe why the feed was wasted.' using errcode = '22023';
  end if;
  select * into v_i from public.inventory_items where id = p_item and organization_id = v_b.organization_id;
  if not found then raise exception 'Feed item not found.' using errcode = 'P0002'; end if;
  perform private.require_date(p_event_date);
  perform private.require_positive(p_quantity, 'Quantity');
  v_factor := private.item_factor(v_b.organization_id, v_i, p_unit);
  v_base := round(p_quantity * v_factor, 4);
  v_on_hand := private.feed_on_hand(p_batch, p_item);
  if v_base > v_on_hand then
    raise exception 'Only % % of % has been issued to % and not yet used. Issue more feed first.',
      trim(to_char(v_on_hand, 'FM999999990.####')), (select symbol from public.units where id = v_i.base_unit_id), v_i.name, v_b.code
      using errcode = '23514';
  end if;

  insert into public.feed_events (organization_id, site_id, batch_id, item_id, event_date, kind, quantity, notes, recorded_by)
  values (v_b.organization_id, v_b.site_id, p_batch, p_item, p_event_date, p_kind, -v_base, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_event;

  perform private.log_system(v_b.organization_id, v_b.site_id, p_event_date, v_b.production_type,
    case when p_kind = 'consumed' then 'feed_consumption' else 'feed_wastage' end,
    case when p_kind = 'consumed' then 'Fed ' else 'Wasted ' end || v_i.name || ' at ' || v_b.code || ': '
      || trim(to_char(p_quantity, 'FM999999990.####')) || ' ' || (select name from public.units where id = p_unit),
    p_batch => p_batch, p_quantity => p_quantity, p_unit => p_unit, p_notes => p_notes, p_feed_event => v_event);
  return private.idem_finish(v_b.organization_id, p_key, 'record_feed_use',
    jsonb_build_object('feed_event_id', v_event, 'feed_at_batch', v_on_hand - v_base));
end;
$$;

create or replace function public.return_feed(
  p_key uuid,
  p_batch uuid,
  p_store uuid,
  p_item uuid,
  p_quantity numeric,
  p_unit uuid,
  p_event_date date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
  v_s public.stores;
  v_i public.inventory_items;
  v_prev jsonb;
  v_factor numeric;
  v_base numeric;
  v_on_hand numeric;
  v_move uuid;
  v_event uuid;
begin
  select * into v_b from public.batches where id = p_batch;
  if not found then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'return_feed');
  if v_prev is not null then return v_prev; end if;
  v_b := private.lock_batch(p_batch, 'inventory.record');
  v_s := private.get_store(p_store, 'inventory.record');
  if v_s.site_id <> v_b.site_id then
    raise exception 'Return feed to a store on the same site as the batch.' using errcode = '22023';
  end if;
  v_i := private.lock_item(p_item, v_b.organization_id);
  perform private.require_date(p_event_date);
  perform private.require_positive(p_quantity, 'Quantity');
  v_factor := private.item_factor(v_b.organization_id, v_i, p_unit);
  v_base := round(p_quantity * v_factor, 4);
  v_on_hand := private.feed_on_hand(p_batch, p_item);
  if v_base > v_on_hand then
    raise exception 'Only % of % is held at %.', trim(to_char(v_on_hand, 'FM999999990.####')), v_i.name, v_b.code using errcode = '23514';
  end if;

  v_move := private.insert_movement(v_b.organization_id, v_b.site_id, p_store, p_item, 'return', p_event_date,
    v_base, p_quantity, p_unit, v_factor, p_reason => 'Returned from ' || v_b.code, p_batch => p_batch);
  insert into public.feed_events (organization_id, site_id, batch_id, item_id, event_date, kind, quantity, inventory_movement_id, notes, recorded_by)
  values (v_b.organization_id, v_b.site_id, p_batch, p_item, p_event_date, 'returned', -v_base, v_move, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_event;

  perform private.log_system(v_b.organization_id, v_b.site_id, p_event_date, v_b.production_type, 'feed_return',
    'Returned ' || v_i.name || ' from ' || v_b.code || ' to ' || v_s.name || ': '
      || trim(to_char(p_quantity, 'FM999999990.####')) || ' ' || (select name from public.units where id = p_unit),
    p_batch => p_batch, p_quantity => p_quantity, p_unit => p_unit, p_notes => p_notes, p_feed_event => v_event, p_movement => v_move);
  return private.idem_finish(v_b.organization_id, p_key, 'return_feed',
    jsonb_build_object('feed_event_id', v_event, 'movement_id', v_move));
end;
$$;

create or replace function public.reverse_feed_event(p_key uuid, p_feed_event uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.feed_events;
  v_m public.inventory_movements;
  v_b public.batches;
  v_prev jsonb;
  v_rev uuid;
  v_move_rev uuid;
begin
  select * into v_e from public.feed_events where id = p_feed_event;
  if not found then raise exception 'Feed record not found.' using errcode = 'P0002'; end if;
  v_prev := private.idem_begin(v_e.organization_id, p_key, 'reverse_feed_event');
  if v_prev is not null then return v_prev; end if;
  v_b := private.lock_batch(v_e.batch_id, 'inventory.manage');
  perform private.lock_item(v_e.item_id, v_e.organization_id);
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = '22023'; end if;
  if v_e.kind = 'reversal' then raise exception 'A reversal cannot itself be reversed.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.feed_events where reverses_feed_event_id = p_feed_event) then
    raise exception 'This feed record has already been reversed.' using errcode = 'P0001';
  end if;

  if v_e.inventory_movement_id is not null then
    select * into v_m from public.inventory_movements where id = v_e.inventory_movement_id;
    v_move_rev := private.insert_movement(v_m.organization_id, v_m.site_id, v_m.store_id, v_m.item_id, 'reversal', current_date,
      -v_m.quantity, v_m.entered_quantity, v_m.entered_unit_id, v_m.conversion_factor,
      p_reason => 'Reversal: ' || trim(p_reason), p_batch => v_m.batch_id, p_reverses => v_m.id);
  end if;

  insert into public.feed_events (organization_id, site_id, batch_id, item_id, event_date, kind, quantity,
    reverses_feed_event_id, notes, recorded_by)
  values (v_e.organization_id, v_e.site_id, v_e.batch_id, v_e.item_id, current_date, 'reversal', -v_e.quantity,
    p_feed_event, 'Reversal: ' || trim(p_reason), auth.uid())
  returning id into v_rev;

  update public.activity_logs set voided_at = now(), void_reason = 'Reversed: ' || trim(p_reason)
  where (feed_event_id = p_feed_event or (v_e.inventory_movement_id is not null and inventory_movement_id = v_e.inventory_movement_id))
    and voided_at is null;
  perform private.audit(v_e.organization_id, v_e.site_id, 'feed_event.reversed', 'feed_events', p_feed_event,
    trim(p_reason), to_jsonb(v_e), null);
  return private.idem_finish(v_e.organization_id, p_key, 'reverse_feed_event',
    jsonb_build_object('reversal_id', v_rev, 'movement_reversal_id', v_move_rev));
end;
$$;

-- ===========================================================================
-- Sales and income
-- ===========================================================================
create or replace function private.sale_total(p_sale uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(line_total), 0) from public.sale_lines where sale_id = p_sale;
$$;

create or replace function private.sale_received(p_sale uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.finance_transactions where sale_id = p_sale and kind = 'income';
$$;

-- Split an amount received across the sale's income categories in
-- proportion to line value. The last category absorbs rounding.
create or replace function private.post_sale_income(p_sale uuid, p_amount numeric, p_date date, p_method text, p_reference text)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_total numeric := private.sale_total(p_sale);
  v_rec record;
  v_left numeric := round(p_amount, 2);
  v_part numeric;
  v_ids uuid[] := '{}';
  v_count integer;
  v_i integer := 0;
begin
  select * into v_sale from public.sales where id = p_sale;
  if v_total <= 0 or p_amount <= 0 then return v_ids; end if;
  select count(distinct income_code) into v_count from (
    select case
      when l.line_type = 'produce' then case r.record_kind when 'egg_collection' then 'egg_sales' when 'fish_harvest' then 'fish_sales'
        when 'crop_harvest' then 'crop_sales' else 'produce_sales' end
      when l.line_type = 'livestock' then case b.production_type when 'fish' then 'fish_sales' else 'bird_sales' end
      else 'produce_sales' end as income_code
    from public.sale_lines l
    left join public.production_records r on r.id = l.production_record_id
    left join public.batches b on b.id = l.batch_id
    where l.sale_id = p_sale) x;

  for v_rec in
    select income_code, sum(line_total) as value,
           case when count(distinct production_type) = 1 then min(production_type) else 'general' end as production_type,
           case when count(distinct batch_id) = 1 and count(*) = count(batch_id) then min(batch_id::text)::uuid end as batch_id,
           case when count(distinct crop_cycle_id) = 1 and count(*) = count(crop_cycle_id) then min(crop_cycle_id::text)::uuid end as crop_cycle_id
    from (
      select l.line_total,
        case
          when l.line_type = 'produce' then case r.record_kind when 'egg_collection' then 'egg_sales' when 'fish_harvest' then 'fish_sales'
            when 'crop_harvest' then 'crop_sales' else 'produce_sales' end
          when l.line_type = 'livestock' then case b.production_type when 'fish' then 'fish_sales' else 'bird_sales' end
          else 'produce_sales' end as income_code,
        coalesce(r.production_type, b.production_type, 'general') as production_type,
        coalesce(r.batch_id, l.batch_id) as batch_id,
        r.crop_cycle_id
      from public.sale_lines l
      left join public.production_records r on r.id = l.production_record_id
      left join public.batches b on b.id = l.batch_id
      where l.sale_id = p_sale
    ) x
    group by income_code
    order by income_code
  loop
    v_i := v_i + 1;
    v_part := case when v_i = v_count then v_left else round(p_amount * v_rec.value / v_total, 2) end;
    v_left := v_left - v_part;
    if v_part > 0 then
      v_ids := v_ids || private.insert_finance(v_sale.organization_id, v_sale.site_id, 'income',
        private.category_id(v_sale.organization_id, 'income', v_rec.income_code), v_part, p_date, p_method,
        'Sale' || coalesce(' to ' || v_sale.customer_name, '') || ' on ' || to_char(v_sale.sale_date, 'DD Mon YYYY'),
        p_reference, v_sale.customer_name, v_rec.production_type,
        -- Link to one batch or cycle only when a single one is involved.
        case when v_rec.crop_cycle_id is null then v_rec.batch_id end, v_rec.crop_cycle_id, p_sale);
    end if;
  end loop;
  return v_ids;
end;
$$;

-- p_lines: [{ "line_type": "produce"|"livestock"|"other", "production_record_id", "batch_id",
--             "description", "quantity", "unit_id", "unit_price", "weight_kg" }]
create or replace function public.record_sale(
  p_key uuid,
  p_org uuid,
  p_site uuid,
  p_sale_date date,
  p_lines jsonb,
  p_amount_received numeric default 0,
  p_payment_method text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_sale uuid;
  v_line jsonb;
  v_line_id uuid;
  v_type text;
  v_qty numeric;
  v_price numeric;
  v_unit uuid;
  v_r public.production_records;
  v_b public.batches;
  v_factor numeric;
  v_available numeric;
  v_event uuid;
  v_total numeric;
  v_txns uuid[] := '{}';
  v_desc text;
  v_pop integer;
begin
  v_prev := private.idem_begin(p_org, p_key, 'record_sale');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, p_site, 'sales.record');
  perform private.require_date(p_sale_date);
  if not exists (select 1 from public.farm_sites where id = p_site and organization_id = p_org) then
    raise exception 'Farm site not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the sale.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'A sale can have at most 50 lines.' using errcode = '22023';
  end if;
  if coalesce(p_amount_received, 0) < 0 then
    raise exception 'Amount received cannot be negative.' using errcode = '22023';
  end if;

  insert into public.sales (organization_id, site_id, sale_date, customer_name, customer_phone, currency, notes, recorded_by)
  values (p_org, p_site, p_sale_date, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    (select currency from public.organizations where id = p_org), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_type := v_line ->> 'line_type';
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := (v_line ->> 'unit_price')::numeric;
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_desc := nullif(trim(v_line ->> 'description'), '');
    perform private.require_positive(v_qty, 'Quantity');
    if v_price is null or v_price < 0 then raise exception 'Enter a price of zero or more.' using errcode = '22023'; end if;
    perform private.assert_unit(p_org, v_unit);

    if v_type = 'produce' then
      select * into v_r from public.production_records
      where id = (v_line ->> 'production_record_id')::uuid and site_id = p_site for update;
      if not found then raise exception 'Produce record not found on this site.' using errcode = 'P0002'; end if;
      if v_r.status <> 'posted' then raise exception 'A selected produce record has been voided.' using errcode = 'P0001'; end if;
      if v_r.record_date > p_sale_date then
        raise exception 'The sale date is before the produce was recorded (%).', v_r.record_date using errcode = '22023';
      end if;
      v_factor := private.unit_factor(p_org, v_unit, v_r.unit_id);
      v_available := private.record_available(v_r.id);
      if round(v_qty * v_factor, 4) > v_available then
        raise exception 'Only % % of % from % is still available.', trim(to_char(v_available, 'FM999999990.####')),
          (select symbol from public.units where id = v_r.unit_id), v_r.product, to_char(v_r.record_date, 'DD Mon') using errcode = '23514';
      end if;
      insert into public.sale_lines (organization_id, site_id, sale_id, line_type, production_record_id, description,
        quantity, unit_id, unit_price, weight_kg)
      values (p_org, p_site, v_sale, 'produce', v_r.id, coalesce(v_desc, v_r.product || coalesce(' (' || v_r.grade || ')', '')),
        v_qty, v_unit, v_price, (v_line ->> 'weight_kg')::numeric)
      returning id into v_line_id;
      insert into public.production_disposals (organization_id, site_id, production_record_id, disposal_date, kind, quantity, sale_line_id, recorded_by)
      values (p_org, p_site, v_r.id, p_sale_date, 'sold', round(v_qty * v_factor, 4), v_line_id, auth.uid());

    elsif v_type = 'livestock' then
      if v_qty <> round(v_qty) then raise exception 'Live animals are sold in whole numbers.' using errcode = '22023'; end if;
      v_b := private.lock_batch((v_line ->> 'batch_id')::uuid, 'sales.record');
      if v_b.site_id <> p_site then raise exception 'The batch must be on the sale''s site.' using errcode = '22023'; end if;
      if v_b.status <> 'active' then raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001'; end if;
      if (select dimension from public.units where id = v_unit) <> 'count' or v_unit <> private.unit_id('each') then
        raise exception 'Live animals are sold per head.' using errcode = '22023';
      end if;
      v_pop := private.batch_population(v_b.id);
      if v_qty > v_pop then
        raise exception 'Batch % has % recorded; you entered %.', v_b.code, v_pop, v_qty::integer using errcode = '23514';
      end if;
      insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, weight_kg, is_estimate, reason, recorded_by)
      values (p_org, p_site, v_b.id, p_sale_date, 'sale', -(v_qty::integer), (v_line ->> 'weight_kg')::numeric,
        v_b.count_basis = 'estimated', 'Sale', auth.uid())
      returning id into v_event;
      insert into public.sale_lines (organization_id, site_id, sale_id, line_type, batch_id, description, quantity, unit_id,
        unit_price, weight_kg, batch_event_id)
      values (p_org, p_site, v_sale, 'livestock', v_b.id,
        coalesce(v_desc, 'Live ' || lower(v_b.species) || ' from ' || v_b.code), v_qty, v_unit, v_price,
        (v_line ->> 'weight_kg')::numeric, v_event);
      perform private.log_system(p_org, p_site, p_sale_date, v_b.production_type, 'sale',
        'Sold ' || v_qty::integer || ' live from ' || v_b.code, p_batch => v_b.id, p_quantity => v_qty,
        p_unit => v_unit, p_batch_event => v_event, p_sale => v_sale);

    elsif v_type = 'other' then
      if v_desc is null then raise exception 'Describe each item sold.' using errcode = '22023'; end if;
      insert into public.sale_lines (organization_id, site_id, sale_id, line_type, description, quantity, unit_id, unit_price)
      values (p_org, p_site, v_sale, 'other', v_desc, v_qty, v_unit, v_price);
    else
      raise exception 'Unknown sale line type.' using errcode = '22023';
    end if;
  end loop;

  v_total := private.sale_total(v_sale);
  if coalesce(p_amount_received, 0) > v_total then
    raise exception 'Amount received (%) is more than the sale total (%).', p_amount_received, v_total using errcode = '22023';
  end if;
  if coalesce(p_amount_received, 0) > 0 then
    if p_payment_method is null then raise exception 'Choose how the money was received.' using errcode = '22023'; end if;
    v_txns := private.post_sale_income(v_sale, p_amount_received, p_sale_date, p_payment_method, p_reference);
  end if;

  perform private.log_system(p_org, p_site, p_sale_date, 'general', 'sale',
    'Sale' || coalesce(' to ' || nullif(trim(p_customer_name), ''), '') || ': ' || jsonb_array_length(p_lines) || ' item(s), total '
      || to_char(v_total, 'FM999,999,999,990.00'), p_sale => v_sale);

  return private.idem_finish(p_org, p_key, 'record_sale', jsonb_build_object(
    'sale_id', v_sale, 'total', v_total, 'received', coalesce(p_amount_received, 0), 'finance_transaction_ids', to_jsonb(v_txns)));
end;
$$;

create or replace function public.record_sale_payment(
  p_key uuid,
  p_sale uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.sales;
  v_prev jsonb;
  v_outstanding numeric;
  v_txns uuid[];
begin
  select * into v_s from public.sales where id = p_sale;
  if not found or not public.has_site_access(v_s.organization_id, v_s.site_id) then
    raise exception 'Sale not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_s.organization_id, p_key, 'record_sale_payment');
  if v_prev is not null then return v_prev; end if;
  select * into v_s from public.sales where id = p_sale for update;
  perform private.require(v_s.organization_id, v_s.site_id, 'sales.record');
  if v_s.status <> 'posted' then raise exception 'This sale has been voided.' using errcode = 'P0001'; end if;
  perform private.require_date(p_payment_date);
  perform private.require_positive(p_amount, 'Amount');
  if p_payment_method is null then raise exception 'Choose how the money was received.' using errcode = '22023'; end if;
  if p_payment_date < v_s.sale_date then raise exception 'The payment date is before the sale.' using errcode = '22023'; end if;
  v_outstanding := private.sale_total(p_sale) - private.sale_received(p_sale);
  if p_amount > v_outstanding then
    raise exception 'Only % is outstanding on this sale.', to_char(v_outstanding, 'FM999,999,999,990.00') using errcode = '23514';
  end if;
  v_txns := private.post_sale_income(p_sale, p_amount, p_payment_date, p_payment_method, p_reference);
  return private.idem_finish(v_s.organization_id, p_key, 'record_sale_payment',
    jsonb_build_object('finance_transaction_ids', to_jsonb(v_txns), 'outstanding', v_outstanding - p_amount));
end;
$$;

create or replace function public.void_sale(p_key uuid, p_sale uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.sales;
  v_prev jsonb;
  v_line public.sale_lines;
  v_txn public.finance_transactions;
begin
  select * into v_s from public.sales where id = p_sale;
  if not found or not public.has_site_access(v_s.organization_id, v_s.site_id) then
    raise exception 'Sale not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_s.organization_id, p_key, 'void_sale');
  if v_prev is not null then return v_prev; end if;
  select * into v_s from public.sales where id = p_sale for update;
  perform private.require(v_s.organization_id, v_s.site_id, 'finance.reverse');
  if v_s.status <> 'posted' then raise exception 'This sale is already voided.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to void a sale.' using errcode = '22023'; end if;

  for v_line in select * from public.sale_lines where sale_id = p_sale loop
    if v_line.line_type = 'produce' then
      update public.production_disposals set status = 'voided', voided_at = now() where sale_line_id = v_line.id;
    elsif v_line.line_type = 'livestock' then
      perform private.lock_batch(v_line.batch_id, 'sales.record');
      if (select status from public.batches where id = v_line.batch_id) <> 'active' then
        raise exception 'Batch has been closed since this sale, so the sale cannot be voided.' using errcode = 'P0001';
      end if;
      insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, is_estimate,
        reason, reverses_event_id, recorded_by)
      select organization_id, site_id, batch_id, current_date, 'reversal', -quantity, is_estimate,
        'Sale voided: ' || trim(p_reason), id, auth.uid()
      from public.batch_events where id = v_line.batch_event_id;
    end if;
  end loop;

  for v_txn in select * from public.finance_transactions where sale_id = p_sale and status = 'posted' and reverses_id is null loop
    insert into public.finance_transactions (organization_id, site_id, txn_date, kind, category_id, amount, currency,
      payment_method, description, reference, counterparty, production_type, batch_id, crop_cycle_id, sale_id,
      reverses_id, reversal_reason, recorded_by)
    values (v_txn.organization_id, v_txn.site_id, current_date, v_txn.kind, v_txn.category_id, -v_txn.amount, v_txn.currency,
      v_txn.payment_method, 'Reversal: ' || v_txn.description, v_txn.reference, v_txn.counterparty, v_txn.production_type,
      v_txn.batch_id, v_txn.crop_cycle_id, p_sale, v_txn.id, trim(p_reason), auth.uid());
    update public.finance_transactions set status = 'reversed' where id = v_txn.id;
  end loop;

  update public.sales set status = 'voided', voided_at = now(), void_reason = trim(p_reason) where id = p_sale;
  update public.activity_logs set voided_at = now(), void_reason = 'Sale voided: ' || trim(p_reason)
  where sale_id = p_sale and voided_at is null;
  perform private.audit(v_s.organization_id, v_s.site_id, 'sale.voided', 'sales', p_sale, trim(p_reason), to_jsonb(v_s), null);
  return private.idem_finish(v_s.organization_id, p_key, 'void_sale', jsonb_build_object('sale_id', p_sale));
end;
$$;

-- ===========================================================================
-- Income and expenses recorded directly
-- ===========================================================================
create or replace function public.record_finance_transaction(
  p_key uuid,
  p_org uuid,
  p_kind text,
  p_category uuid,
  p_amount numeric,
  p_txn_date date,
  p_description text,
  p_site uuid default null,
  p_payment_method text default null,
  p_reference text default null,
  p_counterparty text default null,
  p_production_type text default null,
  p_batch uuid default null,
  p_crop_cycle uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_id uuid;
  v_cat public.categories;
begin
  v_prev := private.idem_begin(p_org, p_key, 'record_finance_transaction');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, p_site, 'finance.record');
  if p_site is null and not public.has_site_access(p_org, null) then
    raise exception 'Choose a farm site. Organization-wide entries need access to every site.' using errcode = '42501';
  end if;
  perform private.require_date(p_txn_date);
  perform private.require_positive(p_amount, 'Amount');
  if p_amount > 999999999999 then raise exception 'Amount is too large.' using errcode = '22023'; end if;
  if p_kind not in ('income', 'expense') then raise exception 'Choose income or expense.' using errcode = '22023'; end if;
  select * into v_cat from public.categories where id = p_category and organization_id = p_org and kind = p_kind and is_active;
  if not found then raise exception 'Choose an active % category.', p_kind using errcode = '22023'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Enter a description.' using errcode = '22023'; end if;
  if p_batch is not null and not exists (select 1 from public.batches where id = p_batch and organization_id = p_org
      and (p_site is null or site_id = p_site)) then
    raise exception 'The batch is not on the selected site.' using errcode = '22023';
  end if;
  if p_crop_cycle is not null and not exists (select 1 from public.crop_cycles where id = p_crop_cycle and organization_id = p_org
      and (p_site is null or site_id = p_site)) then
    raise exception 'The crop cycle is not on the selected site.' using errcode = '22023';
  end if;

  v_id := private.insert_finance(p_org, p_site, p_kind, p_category, p_amount, p_txn_date, p_payment_method, p_description,
    p_reference, p_counterparty,
    coalesce(p_production_type, case when p_batch is not null then (select production_type from public.batches where id = p_batch)
      when p_crop_cycle is not null then 'crop' end),
    p_batch, p_crop_cycle);
  perform private.audit(p_org, p_site, 'finance.recorded', 'finance_transactions', v_id,
    initcap(p_kind) || ' ' || to_char(p_amount, 'FM999,999,999,990.00') || ': ' || trim(p_description));
  return private.idem_finish(p_org, p_key, 'record_finance_transaction', jsonb_build_object('transaction_id', v_id));
end;
$$;

create or replace function public.reverse_finance_transaction(p_key uuid, p_transaction uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.finance_transactions;
  v_prev jsonb;
  v_rev uuid;
begin
  select * into v_t from public.finance_transactions where id = p_transaction;
  if not found or not public.has_site_access(v_t.organization_id, v_t.site_id) then
    raise exception 'Transaction not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_t.organization_id, p_key, 'reverse_finance_transaction');
  if v_prev is not null then return v_prev; end if;
  select * into v_t from public.finance_transactions where id = p_transaction for update;
  perform private.require(v_t.organization_id, v_t.site_id, 'finance.reverse');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reverse a transaction.' using errcode = '22023'; end if;
  if v_t.reverses_id is not null then raise exception 'A reversal cannot itself be reversed.' using errcode = 'P0001'; end if;
  if v_t.status = 'reversed' then raise exception 'This transaction has already been reversed.' using errcode = 'P0001'; end if;
  if v_t.sale_id is not null then raise exception 'This income belongs to a sale. Void the sale instead.' using errcode = 'P0001'; end if;

  insert into public.finance_transactions (organization_id, site_id, txn_date, kind, category_id, amount, currency,
    payment_method, description, reference, counterparty, production_type, batch_id, crop_cycle_id, reverses_id,
    reversal_reason, recorded_by)
  values (v_t.organization_id, v_t.site_id, current_date, v_t.kind, v_t.category_id, -v_t.amount, v_t.currency,
    v_t.payment_method, 'Reversal: ' || v_t.description, v_t.reference, v_t.counterparty, v_t.production_type,
    v_t.batch_id, v_t.crop_cycle_id, v_t.id, trim(p_reason), auth.uid())
  returning id into v_rev;
  update public.finance_transactions set status = 'reversed' where id = p_transaction;
  perform private.audit(v_t.organization_id, v_t.site_id, 'finance.reversed', 'finance_transactions', p_transaction,
    trim(p_reason), to_jsonb(v_t), null);
  return private.idem_finish(v_t.organization_id, p_key, 'reverse_finance_transaction', jsonb_build_object('reversal_id', v_rev));
end;
$$;

-- ===========================================================================
-- Daily log: manual entries
-- ===========================================================================
create or replace function public.log_activity(
  p_key uuid,
  p_org uuid,
  p_site uuid,
  p_occurred_on date,
  p_production_type text,
  p_category uuid,
  p_summary text,
  p_batch uuid default null,
  p_crop_cycle uuid default null,
  p_production_unit uuid default null,
  p_quantity numeric default null,
  p_unit uuid default null,
  p_notes text default null,
  p_responsible uuid default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_cat public.categories;
  v_id uuid;
begin
  v_prev := private.idem_begin(p_org, p_key, 'log_activity');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, p_site, 'operations.record');
  perform private.require_date(p_occurred_on);
  perform private.require_member(p_org, p_responsible);
  if p_production_type not in ('poultry', 'fish', 'crop', 'general') then
    raise exception 'Choose a production type.' using errcode = '22023';
  end if;
  select * into v_cat from public.categories where id = p_category and organization_id = p_org and kind = 'activity' and is_active;
  if not found then raise exception 'Choose an activity type.' using errcode = '22023'; end if;
  -- Ledger-backed activities must use their own workflow so quantities reconcile.
  if v_cat.code in ('stocking', 'mortality', 'cull', 'feed_issue', 'feed_consumption', 'feed_return', 'feed_wastage',
                    'egg_collection', 'sampling', 'harvest', 'transfer', 'sale', 'batch_close', 'input_application',
                    'population_adjustment', 'stock_received', 'stock_used', 'stock_wastage', 'stock_count') then
    raise exception '"%" must be recorded from its own screen so balances stay correct.', v_cat.name using errcode = '22023';
  end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'Describe the activity.' using errcode = '22023'; end if;
  if p_quantity is not null then
    if p_unit is null then raise exception 'Choose a unit for the quantity.' using errcode = '22023'; end if;
    perform private.assert_unit(p_org, p_unit);
  end if;
  if p_batch is not null and not exists (select 1 from public.batches where id = p_batch and site_id = p_site) then
    raise exception 'The batch is not on this site.' using errcode = '22023';
  end if;
  if p_crop_cycle is not null and not exists (select 1 from public.crop_cycles where id = p_crop_cycle and site_id = p_site) then
    raise exception 'The crop cycle is not on this site.' using errcode = '22023';
  end if;
  if p_production_unit is not null and not exists (select 1 from public.production_units where id = p_production_unit and site_id = p_site) then
    raise exception 'The production unit is not on this site.' using errcode = '22023';
  end if;

  insert into public.activity_logs (organization_id, site_id, occurred_on, occurred_at, production_type, batch_id, crop_cycle_id,
    production_unit_id, category_id, quantity, unit_id, summary, notes, responsible_id, source, recorded_by)
  values (p_org, p_site, p_occurred_on, p_occurred_at, p_production_type, p_batch, p_crop_cycle, p_production_unit, p_category,
    p_quantity, p_unit, trim(p_summary), nullif(trim(p_notes), ''), coalesce(p_responsible, auth.uid()), 'manual', auth.uid())
  returning id into v_id;
  return private.idem_finish(p_org, p_key, 'log_activity', jsonb_build_object('activity_id', v_id));
end;
$$;

create or replace function public.void_activity(p_activity uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.activity_logs;
begin
  select * into v_a from public.activity_logs where id = p_activity for update;
  if not found or not public.has_site_access(v_a.organization_id, v_a.site_id) then
    raise exception 'Activity not found.' using errcode = 'P0002';
  end if;
  perform private.require(v_a.organization_id, v_a.site_id, 'operations.record');
  if v_a.source <> 'manual' then
    raise exception 'This entry was created by a stock, population or sales record. Reverse that record instead.' using errcode = 'P0001';
  end if;
  if v_a.recorded_by is distinct from auth.uid() and not public.has_permission(v_a.organization_id, 'batches.manage') then
    raise exception 'Only the person who recorded this entry or a manager can void it.' using errcode = '42501';
  end if;
  if v_a.voided_at is not null then raise exception 'This entry is already voided.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = '22023'; end if;
  update public.activity_logs set voided_at = now(), void_reason = trim(p_reason) where id = p_activity;
  perform private.audit(v_a.organization_id, v_a.site_id, 'activity.voided', 'activity_logs', p_activity, trim(p_reason), to_jsonb(v_a), null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants: RPCs to authenticated only; internals to nobody.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_batch(uuid, uuid, uuid, text, text, text, text, date, integer, text, uuid, text, text, numeric, text, boolean, text, numeric, text),
  public.record_population_change(uuid, uuid, text, integer, date, text, text, uuid),
  public.transfer_between_batches(uuid, uuid, uuid, integer, date, text),
  public.close_batch(uuid, date, text, boolean),
  public.reverse_batch_event(uuid, uuid, text),
  public.record_fish_sample(uuid, uuid, date, integer, numeric, text),
  public.record_egg_collection(uuid, uuid, date, numeric, uuid, numeric, text, text, uuid),
  public.record_fish_harvest(uuid, uuid, date, integer, numeric, boolean, numeric, text, text, text, boolean),
  public.record_crop_harvest(uuid, uuid, date, numeric, uuid, text, numeric, text, text, text, uuid, boolean),
  public.record_disposal(uuid, uuid, text, numeric, date, text),
  public.void_production_record(uuid, text),
  public.create_crop_cycle(uuid, uuid, uuid, text, text, numeric, uuid, date, text, text, date, text),
  public.set_crop_cycle_status(uuid, text, date, text),
  public.record_stock_receipt(uuid, uuid, uuid, text, numeric, uuid, date, numeric, text, text, text, boolean, text, uuid),
  public.record_stock_usage(uuid, uuid, uuid, numeric, uuid, date, uuid, text, text),
  public.record_stock_wastage(uuid, uuid, uuid, numeric, uuid, date, text),
  public.transfer_stock(uuid, uuid, uuid, uuid, numeric, uuid, date, text),
  public.record_stock_count(uuid, uuid, uuid, numeric, uuid, date, text),
  public.reverse_inventory_movement(uuid, uuid, text),
  public.issue_feed(uuid, uuid, uuid, uuid, numeric, uuid, date, boolean, text),
  public.record_feed_use(uuid, uuid, uuid, text, numeric, uuid, date, text),
  public.return_feed(uuid, uuid, uuid, uuid, numeric, uuid, date, text),
  public.reverse_feed_event(uuid, uuid, text),
  public.record_sale(uuid, uuid, uuid, date, jsonb, numeric, text, text, text, text, text),
  public.record_sale_payment(uuid, uuid, numeric, date, text, text),
  public.void_sale(uuid, uuid, text),
  public.record_finance_transaction(uuid, uuid, text, uuid, numeric, date, text, uuid, text, text, text, text, uuid, uuid),
  public.reverse_finance_transaction(uuid, uuid, text),
  public.log_activity(uuid, uuid, uuid, date, text, uuid, text, uuid, uuid, uuid, numeric, uuid, text, uuid, timestamptz),
  public.void_activity(uuid, text)
  to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
