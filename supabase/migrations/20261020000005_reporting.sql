-- ============================================================================
-- 0005 Reporting: derived views, reports, dashboard summary and alerts.
-- Every view and function here runs with the CALLER's rights
-- (security_invoker), so RLS limits results to what the caller may see.
-- Financial figures are returned as NULL, never as zero, when the caller
-- lacks finance permissions, so a dashboard can say "not available" instead
-- of showing a misleading 0.
-- ============================================================================

alter table public.alert_settings
  add column production_rejection_pct numeric(5, 2) not null default 10.00
    check (production_rejection_pct > 0 and production_rejection_pct <= 100);
grant update (production_rejection_pct) on public.alert_settings to authenticated;

-- Local "today" for an organization (dates are entered in farm-local time).
create or replace function public.org_today(p_org uuid)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (now() at time zone coalesce((select timezone from public.organizations where id = p_org), 'UTC'))::date;
$$;

-- ---------------------------------------------------------------------------
-- Derived views
-- ---------------------------------------------------------------------------
-- Reversal rows carry kind 'reversal'; fold them back into the kind they
-- reverse so per-kind totals are net of corrections.
create view public.batch_events_net with (security_invoker = true) as
select
  e.*,
  case when e.kind = 'reversal' then o.kind else e.kind end as effective_kind
from public.batch_events e
left join public.batch_events o on o.id = e.reverses_event_id;

create view public.batch_summaries with (security_invoker = true) as
select
  b.*,
  coalesce(e.population, 0)::integer                as current_population,
  coalesce(e.placed, 0)::integer                    as total_placed,
  coalesce(e.mortality, 0)::integer                 as total_mortality,
  coalesce(e.culled, 0)::integer                    as total_culled,
  coalesce(e.sold, 0)::integer                      as total_sold,
  coalesce(e.harvested, 0)::integer                 as total_harvested,
  coalesce(e.transferred_out, 0)::integer           as total_transferred_out,
  coalesce(e.other_losses, 0)::integer              as total_other_losses,
  case when coalesce(e.placed, 0) > 0 then round(100.0 * coalesce(e.mortality, 0) / e.placed, 2) end as mortality_pct,
  coalesce(f.consumed_kg, 0)                        as feed_consumed_kg,
  coalesce(f.at_batch_kg, 0)                        as feed_at_batch_kg,
  s.avg_weight_g                                    as latest_avg_weight_g,
  s.sample_date                                     as latest_sample_date,
  case when s.avg_weight_g is not null then round(coalesce(e.population, 0) * s.avg_weight_g / 1000.0, 1) end as estimated_biomass_kg,
  pu.name                                           as production_unit_name,
  fs.name                                           as site_name
from public.batches b
join public.farm_sites fs on fs.id = b.site_id
left join public.production_units pu on pu.id = b.production_unit_id
left join lateral (
  select
    sum(quantity) as population,
    sum(quantity) filter (where effective_kind in ('acquisition', 'opening', 'transfer_in')) as placed,
    -sum(quantity) filter (where effective_kind = 'mortality') as mortality,
    -sum(quantity) filter (where effective_kind = 'cull') as culled,
    -sum(quantity) filter (where effective_kind = 'sale') as sold,
    -sum(quantity) filter (where effective_kind = 'harvest') as harvested,
    -sum(quantity) filter (where effective_kind = 'transfer_out') as transferred_out,
    -sum(quantity) filter (where effective_kind = 'theft_loss') as other_losses
  from public.batch_events_net be where be.batch_id = b.id
) e on true
left join lateral (
  select
    -sum(fe.quantity * u.to_base) filter (where coalesce(o.kind, fe.kind) = 'consumed') as consumed_kg,
    sum(fe.quantity * u.to_base) as at_batch_kg
  from public.feed_events fe
  left join public.feed_events o on o.id = fe.reverses_feed_event_id
  join public.inventory_items i on i.id = fe.item_id
  join public.units u on u.id = i.base_unit_id and u.dimension = 'mass'
  where fe.batch_id = b.id
) f on true
left join lateral (
  select fsm.avg_weight_g, fsm.sample_date from public.fish_samples fsm
  where fsm.batch_id = b.id and fsm.voided_at is null
  order by fsm.sample_date desc, fsm.created_at desc limit 1
) s on true;

create view public.inventory_balances with (security_invoker = true) as
select
  m.organization_id,
  m.site_id,
  m.store_id,
  st.name as store_name,
  fs.name as site_name,
  m.item_id,
  i.name as item_name,
  i.category_id,
  c.name as category_name,
  i.is_feed,
  i.production_type,
  i.base_unit_id,
  u.symbol as unit_symbol,
  i.reorder_level,
  round(sum(m.quantity), 4) as quantity,
  max(m.movement_date) as last_movement_date
from public.inventory_movements m
join public.inventory_items i on i.id = m.item_id
join public.categories c on c.id = i.category_id
join public.units u on u.id = i.base_unit_id
join public.stores st on st.id = m.store_id
join public.farm_sites fs on fs.id = m.site_id
group by m.organization_id, m.site_id, m.store_id, st.name, fs.name, m.item_id, i.name, i.category_id, c.name,
  i.is_feed, i.production_type, i.base_unit_id, u.symbol, i.reorder_level;

create view public.production_record_balances with (security_invoker = true) as
select
  r.*,
  u.symbol as unit_symbol,
  u.dimension as unit_dimension,
  u.to_base as unit_to_base,
  coalesce(d.disposed, 0) as disposed_quantity,
  coalesce(d.sold, 0) as sold_quantity,
  r.quantity - r.rejected_quantity - coalesce(d.disposed, 0) as available_quantity,
  coalesce(b.code, cc.code) as source_code,
  fs.name as site_name
from public.production_records r
join public.units u on u.id = r.unit_id
join public.farm_sites fs on fs.id = r.site_id
left join public.batches b on b.id = r.batch_id
left join public.crop_cycles cc on cc.id = r.crop_cycle_id
left join lateral (
  select sum(quantity) as disposed, sum(quantity) filter (where kind = 'sold') as sold
  from public.production_disposals pd where pd.production_record_id = r.id and pd.status = 'posted'
) d on true;

create view public.sale_summaries with (security_invoker = true) as
select
  s.*,
  fs.name as site_name,
  coalesce(l.total, 0) as total_amount,
  coalesce(l.line_count, 0) as line_count,
  coalesce(p.received, 0) as amount_received,
  case when s.status = 'voided' then 0 else coalesce(l.total, 0) - coalesce(p.received, 0) end as amount_outstanding
from public.sales s
join public.farm_sites fs on fs.id = s.site_id
left join lateral (select sum(line_total) as total, count(*) as line_count from public.sale_lines sl where sl.sale_id = s.id) l on true
left join lateral (select sum(amount) as received from public.finance_transactions ft where ft.sale_id = s.id and ft.kind = 'income') p on true;

create view public.crop_cycle_summaries with (security_invoker = true) as
select
  c.*,
  fs.name as site_name,
  pu.name as production_unit_name,
  au.symbol as area_unit_symbol,
  round(c.area * au.to_base / 10000.0, 4) as area_ha,
  h.harvest_kg,
  h.harvest_records,
  case when h.harvest_kg is not null and c.area > 0 then round(h.harvest_kg / (c.area * au.to_base / 10000.0), 1) end as yield_kg_per_ha
from public.crop_cycles c
join public.farm_sites fs on fs.id = c.site_id
join public.production_units pu on pu.id = c.production_unit_id
join public.units au on au.id = c.area_unit_id
left join lateral (
  select
    sum((r.quantity - r.rejected_quantity) * u.to_base) filter (where u.dimension = 'mass') as harvest_kg,
    count(*) as harvest_records
  from public.production_records r join public.units u on u.id = r.unit_id
  where r.crop_cycle_id = c.id and r.status = 'posted'
) h on true;

grant select on public.batch_summaries, public.batch_events_net, public.inventory_balances,
  public.production_record_balances, public.sale_summaries, public.crop_cycle_summaries to authenticated;
revoke all on public.batch_summaries, public.batch_events_net, public.inventory_balances,
  public.production_record_balances, public.sale_summaries, public.crop_cycle_summaries from anon;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

-- Mortality by batch for a period. Opening = population at the start of the
-- period; rate = deaths / (opening + birds or fish added during the period).
create or replace function public.report_mortality(
  p_org uuid, p_from date, p_to date, p_site uuid default null, p_production_type text default null
)
returns table (
  batch_id uuid, batch_code text, production_type text, species text, site_name text, count_basis text,
  opening_population integer, added integer, mortality integer, culled integer, other_out integer,
  closing_population integer, mortality_pct numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.code, b.production_type, b.species, fs.name, b.count_basis,
    coalesce(sum(e.quantity) filter (where e.event_date < p_from), 0)::integer,
    coalesce(sum(e.quantity) filter (where e.event_date between p_from and p_to and e.effective_kind in ('acquisition', 'opening', 'transfer_in')), 0)::integer,
    coalesce(-sum(e.quantity) filter (where e.event_date between p_from and p_to and e.effective_kind = 'mortality'), 0)::integer,
    coalesce(-sum(e.quantity) filter (where e.event_date between p_from and p_to and e.effective_kind = 'cull'), 0)::integer,
    coalesce(-sum(e.quantity) filter (where e.event_date between p_from and p_to
      and e.effective_kind in ('sale', 'harvest', 'transfer_out', 'theft_loss', 'adjustment')), 0)::integer,
    coalesce(sum(e.quantity) filter (where e.event_date <= p_to), 0)::integer,
    case when coalesce(sum(e.quantity) filter (where e.event_date < p_from), 0)
            + coalesce(sum(e.quantity) filter (where e.event_date between p_from and p_to and e.effective_kind in ('acquisition', 'opening', 'transfer_in')), 0) > 0
      then round(100.0 * coalesce(-sum(e.quantity) filter (where e.event_date between p_from and p_to and e.effective_kind = 'mortality'), 0)
        / (coalesce(sum(e.quantity) filter (where e.event_date < p_from), 0)
           + coalesce(sum(e.quantity) filter (where e.event_date between p_from and p_to and e.effective_kind in ('acquisition', 'opening', 'transfer_in')), 0)), 2)
    end
  from public.batches b
  join public.farm_sites fs on fs.id = b.site_id
  join public.batch_events_net e on e.batch_id = b.id
  where b.organization_id = p_org
    and (p_site is null or b.site_id = p_site)
    and (p_production_type is null or b.production_type = p_production_type)
    and b.start_date <= p_to
    and (b.closed_on is null or b.closed_on >= p_from)
  group by b.id, b.code, b.production_type, b.species, fs.name, b.count_basis
  order by b.production_type, b.code;
$$;

create or replace function public.report_feed(
  p_org uuid, p_from date, p_to date, p_site uuid default null, p_production_type text default null
)
returns table (
  batch_id uuid, batch_code text, production_type text, site_name text, item_id uuid, item_name text, unit_symbol text,
  issued numeric, consumed numeric, wasted numeric, returned numeric, held_at_batch numeric, population integer,
  consumed_per_head_g numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.code, b.production_type, fs.name, i.id, i.name, u.symbol,
    round(coalesce(sum(fe.quantity) filter (where fe.event_date between p_from and p_to and coalesce(o.kind, fe.kind) = 'issued'), 0), 4),
    round(coalesce(-sum(fe.quantity) filter (where fe.event_date between p_from and p_to and coalesce(o.kind, fe.kind) = 'consumed'), 0), 4),
    round(coalesce(-sum(fe.quantity) filter (where fe.event_date between p_from and p_to and coalesce(o.kind, fe.kind) = 'wasted'), 0), 4),
    round(coalesce(-sum(fe.quantity) filter (where fe.event_date between p_from and p_to and coalesce(o.kind, fe.kind) = 'returned'), 0), 4),
    round(coalesce(sum(fe.quantity) filter (where fe.event_date <= p_to), 0), 4),
    (select coalesce(sum(quantity), 0)::integer from public.batch_events be where be.batch_id = b.id and be.event_date <= p_to),
    case when u.dimension = 'mass' and (select coalesce(sum(quantity), 0) from public.batch_events be where be.batch_id = b.id and be.event_date <= p_to) > 0
      then round(1000 * u.to_base * coalesce(-sum(fe.quantity) filter (where fe.event_date between p_from and p_to and coalesce(o.kind, fe.kind) = 'consumed'), 0)
        / (select sum(quantity) from public.batch_events be where be.batch_id = b.id and be.event_date <= p_to), 1)
    end
  from public.feed_events fe
  left join public.feed_events o on o.id = fe.reverses_feed_event_id
  join public.batches b on b.id = fe.batch_id
  join public.farm_sites fs on fs.id = b.site_id
  join public.inventory_items i on i.id = fe.item_id
  join public.units u on u.id = i.base_unit_id
  where fe.organization_id = p_org
    and (p_site is null or fe.site_id = p_site)
    and (p_production_type is null or b.production_type = p_production_type)
  group by b.id, b.code, b.production_type, fs.name, i.id, i.name, u.symbol, u.dimension, u.to_base
  having coalesce(sum(abs(fe.quantity)) filter (where fe.event_date between p_from and p_to), 0) > 0
  order by b.code, i.name;
$$;

create or replace function public.report_stock_movements(
  p_org uuid, p_from date, p_to date, p_site uuid default null
)
returns table (
  item_id uuid, item_name text, category_name text, store_id uuid, store_name text, site_name text, unit_symbol text,
  opening numeric, received numeric, issued numeric, used numeric, transferred_in numeric, transferred_out numeric,
  returned numeric, wasted numeric, adjusted numeric, closing numeric, reorder_level numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.name, c.name, st.id, st.name, fs.name, u.symbol,
    round(coalesce(sum(m.quantity) filter (where m.movement_date < p_from), 0), 4),
    round(coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and coalesce(o.movement_type, m.movement_type) in ('opening', 'purchase', 'receipt')), 0), 4),
    round(coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and coalesce(o.movement_type, m.movement_type) = 'issue'), 0), 4),
    round(coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and coalesce(o.movement_type, m.movement_type) = 'consumption'), 0), 4),
    round(coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type = 'transfer_in'), 0), 4),
    round(coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type = 'transfer_out'), 0), 4),
    round(coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and coalesce(o.movement_type, m.movement_type) = 'return'), 0), 4),
    round(coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and coalesce(o.movement_type, m.movement_type) = 'wastage'), 0), 4),
    round(coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and coalesce(o.movement_type, m.movement_type) = 'adjustment'), 0), 4),
    round(coalesce(sum(m.quantity) filter (where m.movement_date <= p_to), 0), 4),
    i.reorder_level
  from public.inventory_movements m
  left join public.inventory_movements o on o.id = m.reverses_movement_id
  join public.inventory_items i on i.id = m.item_id
  join public.categories c on c.id = i.category_id
  join public.units u on u.id = i.base_unit_id
  join public.stores st on st.id = m.store_id
  join public.farm_sites fs on fs.id = m.site_id
  where m.organization_id = p_org and (p_site is null or m.site_id = p_site) and m.movement_date <= p_to
  group by i.id, i.name, c.name, st.id, st.name, fs.name, u.symbol, i.reorder_level
  order by c.name, i.name, st.name;
$$;

-- Output normalized to the base unit of its dimension (pieces, kg, litres).
create or replace function public.report_production(
  p_org uuid, p_from date, p_to date, p_site uuid default null, p_production_type text default null
)
returns table (
  production_type text, record_kind text, source_id uuid, source_code text, site_name text, product text,
  base_unit text, records integer, quantity numeric, rejected numeric, good_quantity numeric,
  sold numeric, other_disposed numeric, available numeric, has_estimates boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.production_type, r.record_kind, coalesce(r.batch_id, r.crop_cycle_id), r.source_code, r.site_name, r.product,
    case r.unit_dimension when 'count' then 'pcs' when 'mass' then 'kg' when 'volume' then 'L' when 'area' then 'm²' else 'm' end,
    count(*)::integer,
    round(sum(r.quantity * r.unit_to_base), 3),
    round(sum(r.rejected_quantity * r.unit_to_base), 3),
    round(sum((r.quantity - r.rejected_quantity) * r.unit_to_base), 3),
    round(sum(r.sold_quantity * r.unit_to_base), 3),
    round(sum((r.disposed_quantity - r.sold_quantity) * r.unit_to_base), 3),
    round(sum(r.available_quantity * r.unit_to_base), 3),
    bool_or(r.is_estimate)
  from public.production_record_balances r
  where r.organization_id = p_org and r.status = 'posted'
    and r.record_date between p_from and p_to
    and (p_site is null or r.site_id = p_site)
    and (p_production_type is null or r.production_type = p_production_type)
  group by r.production_type, r.record_kind, coalesce(r.batch_id, r.crop_cycle_id), r.source_code, r.site_name, r.product, r.unit_dimension
  order by r.production_type, r.source_code, r.product;
$$;

create or replace function public.report_finance_monthly(
  p_org uuid, p_from date, p_to date, p_site uuid default null, p_production_type text default null
)
returns table (month date, income numeric, expense numeric, net numeric, transactions integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission(p_org, 'finance.view') then
    raise exception 'You do not have permission to view financial reports.' using errcode = '42501';
  end if;
  return query
  select date_trunc('month', t.txn_date)::date,
    coalesce(sum(t.amount) filter (where t.kind = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0),
    coalesce(sum(t.amount) filter (where t.kind = 'income'), 0) - coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0),
    count(*) filter (where t.reverses_id is null)::integer
  from public.finance_transactions t
  where t.organization_id = p_org and t.txn_date between p_from and p_to
    and (p_site is null or t.site_id = p_site)
    and (p_production_type is null or t.production_type = p_production_type)
  group by 1 order by 1;
end;
$$;

create or replace function public.report_finance_by_category(
  p_org uuid, p_from date, p_to date, p_site uuid default null, p_production_type text default null
)
returns table (kind text, category_id uuid, category_name text, amount numeric, transactions integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission(p_org, 'finance.view') then
    raise exception 'You do not have permission to view financial reports.' using errcode = '42501';
  end if;
  return query
  select t.kind, c.id, c.name, sum(t.amount), count(*) filter (where t.reverses_id is null)::integer
  from public.finance_transactions t join public.categories c on c.id = t.category_id
  where t.organization_id = p_org and t.txn_date between p_from and p_to
    and (p_site is null or t.site_id = p_site)
    and (p_production_type is null or t.production_type = p_production_type)
  group by t.kind, c.id, c.name
  having sum(t.amount) <> 0
  order by t.kind, sum(t.amount) desc;
end;
$$;

create or replace function public.report_sales(
  p_org uuid, p_from date, p_to date, p_site uuid default null
)
returns table (line_type text, product text, unit_symbol text, quantity numeric, sales_value numeric, sales integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission(p_org, 'finance.view') then
    raise exception 'You do not have permission to view financial reports.' using errcode = '42501';
  end if;
  return query
  select l.line_type,
    coalesce(r.product, case when l.line_type = 'livestock' then 'Live ' || lower(b.species) end, l.description),
    u.symbol, sum(l.quantity), sum(l.line_total), count(distinct s.id)::integer
  from public.sale_lines l
  join public.sales s on s.id = l.sale_id and s.status = 'posted'
  join public.units u on u.id = l.unit_id
  left join public.production_records r on r.id = l.production_record_id
  left join public.batches b on b.id = l.batch_id
  where s.organization_id = p_org and s.sale_date between p_from and p_to and (p_site is null or s.site_id = p_site)
  group by 1, 2, 3 order by 5 desc;
end;
$$;

-- Per-site comparison. Financial columns are NULL without finance.view.
create or replace function public.report_site_performance(p_org uuid, p_from date, p_to date)
returns table (
  site_id uuid, site_name text, active_batches integer, active_crop_cycles integer, mortality integer,
  eggs_collected numeric, fish_harvest_kg numeric, crop_harvest_kg numeric, feed_consumed_kg numeric,
  income numeric, expense numeric, operating_surplus numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select fs.id, fs.name,
    (select count(*)::integer from public.batches b where b.site_id = fs.id and b.status = 'active'),
    (select count(*)::integer from public.crop_cycles c where c.site_id = fs.id and c.status in ('active', 'harvested')),
    (select coalesce(-sum(e.quantity), 0)::integer from public.batch_events_net e
      where e.site_id = fs.id and e.effective_kind = 'mortality' and e.event_date between p_from and p_to),
    (select coalesce(sum((r.quantity - r.rejected_quantity) * u.to_base), 0) from public.production_records r join public.units u on u.id = r.unit_id
      where r.site_id = fs.id and r.record_kind = 'egg_collection' and r.status = 'posted' and r.record_date between p_from and p_to),
    (select coalesce(sum(r.quantity * u.to_base), 0) from public.production_records r join public.units u on u.id = r.unit_id
      where r.site_id = fs.id and r.record_kind = 'fish_harvest' and r.status = 'posted' and r.record_date between p_from and p_to),
    (select coalesce(sum((r.quantity - r.rejected_quantity) * u.to_base), 0) from public.production_records r join public.units u on u.id = r.unit_id
      where r.site_id = fs.id and r.record_kind = 'crop_harvest' and u.dimension = 'mass' and r.status = 'posted' and r.record_date between p_from and p_to),
    (select coalesce(-sum(fe.quantity * u.to_base), 0) from public.feed_events fe
      left join public.feed_events o on o.id = fe.reverses_feed_event_id
      join public.inventory_items i on i.id = fe.item_id join public.units u on u.id = i.base_unit_id and u.dimension = 'mass'
      where fe.site_id = fs.id and coalesce(o.kind, fe.kind) = 'consumed' and fe.event_date between p_from and p_to),
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(amount), 0) from public.finance_transactions t where t.site_id = fs.id and t.kind = 'income' and t.txn_date between p_from and p_to) end,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(amount), 0) from public.finance_transactions t where t.site_id = fs.id and t.kind = 'expense' and t.txn_date between p_from and p_to) end,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(case when kind = 'income' then amount else -amount end), 0) from public.finance_transactions t
        where t.site_id = fs.id and t.txn_date between p_from and p_to) end
  from public.farm_sites fs
  where fs.organization_id = p_org
  order by fs.name;
$$;

-- Batch and crop-cycle performance over their whole life.
create or replace function public.report_cycle_performance(
  p_org uuid, p_site uuid default null, p_production_type text default null, p_include_closed boolean default true
)
returns table (
  kind text, id uuid, code text, production_type text, label text, site_name text, status text,
  started_on date, ended_on date, placed integer, mortality_pct numeric, feed_consumed_kg numeric,
  output_quantity numeric, output_unit text, yield_kg_per_ha numeric,
  linked_income numeric, linked_expense numeric, linked_surplus numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'batch', b.id, b.code, b.production_type, b.species || coalesce(' · ' || b.breed, ''), b.site_name, b.status,
    b.start_date, b.closed_on, b.total_placed, b.mortality_pct, round(b.feed_consumed_kg, 1),
    case when b.production_type = 'poultry'
      then (select coalesce(sum((r.quantity - r.rejected_quantity) * u.to_base), 0) from public.production_records r join public.units u on u.id = r.unit_id
            where r.batch_id = b.id and r.record_kind = 'egg_collection' and r.status = 'posted')
      else (select coalesce(sum(r.quantity), 0) from public.production_records r where r.batch_id = b.id and r.record_kind = 'fish_harvest' and r.status = 'posted') end,
    case when b.production_type = 'poultry' then 'eggs' else 'kg harvested' end,
    null::numeric,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(amount), 0) from public.finance_transactions t where t.batch_id = b.id and t.kind = 'income') end,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(amount), 0) from public.finance_transactions t where t.batch_id = b.id and t.kind = 'expense') end,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(case when kind = 'income' then amount else -amount end), 0) from public.finance_transactions t where t.batch_id = b.id) end
  from public.batch_summaries b
  where b.organization_id = p_org and (p_site is null or b.site_id = p_site)
    and (p_production_type is null or b.production_type = p_production_type)
    and (p_include_closed or b.status = 'active')
  union all
  select 'crop_cycle', c.id, c.code, 'crop', c.crop || coalesce(' · ' || c.variety, ''), c.site_name, c.status,
    c.planting_date, c.closed_on, null::integer, null::numeric, null::numeric,
    c.harvest_kg, 'kg harvested', c.yield_kg_per_ha,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(amount), 0) from public.finance_transactions t where t.crop_cycle_id = c.id and t.kind = 'income') end,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(amount), 0) from public.finance_transactions t where t.crop_cycle_id = c.id and t.kind = 'expense') end,
    case when public.has_permission(p_org, 'finance.view') then
      (select coalesce(sum(case when kind = 'income' then amount else -amount end), 0) from public.finance_transactions t where t.crop_cycle_id = c.id) end
  from public.crop_cycle_summaries c
  where c.organization_id = p_org and (p_site is null or c.site_id = p_site)
    and (p_production_type is null or p_production_type = 'crop')
    and (p_include_closed or c.status in ('planned', 'active', 'harvested'))
  order by 7, 8 desc nulls last;
$$;

-- Inputs drawn from stores for each crop cycle and batch (quantities only;
-- money spent is in finance_transactions).
create or replace function public.report_inputs_used(p_org uuid, p_from date, p_to date, p_site uuid default null)
returns table (target_kind text, target_id uuid, target_code text, item_name text, unit_symbol text, quantity numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select case when m.crop_cycle_id is not null then 'crop_cycle' else 'batch' end,
    coalesce(m.crop_cycle_id, m.batch_id), coalesce(c.code, b.code), i.name, u.symbol,
    round(-sum(m.quantity), 4)
  from public.inventory_movements m
  left join public.inventory_movements o on o.id = m.reverses_movement_id
  join public.inventory_items i on i.id = m.item_id
  join public.units u on u.id = i.base_unit_id
  left join public.crop_cycles c on c.id = m.crop_cycle_id
  left join public.batches b on b.id = m.batch_id
  where m.organization_id = p_org and m.movement_date between p_from and p_to
    and (p_site is null or m.site_id = p_site)
    and (m.crop_cycle_id is not null or m.batch_id is not null)
    and coalesce(o.movement_type, m.movement_type) in ('issue', 'consumption', 'return')
  group by 1, 2, 3, 4, 5
  having sum(m.quantity) <> 0
  order by 3, 4;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard summary for a period
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_summary(
  p_org uuid, p_from date, p_to date, p_site uuid default null, p_production_type text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_finance boolean := public.has_permission(p_org, 'finance.view');
  v_result jsonb;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Organization not found.' using errcode = '42501';
  end if;
  if p_from > p_to then
    raise exception 'The start date must be on or before the end date.' using errcode = '22023';
  end if;

  with
  b as (
    select * from public.batch_summaries
    where organization_id = p_org and (p_site is null or site_id = p_site)
      and (p_production_type is null or production_type = p_production_type)
  ),
  ev as (
    select e.* from public.batch_events_net e join b on b.id = e.batch_id
    where e.event_date between p_from and p_to
  ),
  opening as (
    select b.production_type, sum(e.quantity) as qty from public.batch_events e join b on b.id = e.batch_id
    where e.event_date < p_from group by b.production_type
  ),
  feed as (
    select coalesce(-sum(fe.quantity * u.to_base), 0) as kg
    from public.feed_events fe
    left join public.feed_events o on o.id = fe.reverses_feed_event_id
    join b on b.id = fe.batch_id
    join public.inventory_items i on i.id = fe.item_id
    join public.units u on u.id = i.base_unit_id and u.dimension = 'mass'
    where coalesce(o.kind, fe.kind) = 'consumed' and fe.event_date between p_from and p_to
  ),
  prod as (
    select r.record_kind, r.product,
      case r.unit_dimension when 'count' then 'pcs' when 'mass' then 'kg' when 'volume' then 'L' else r.unit_symbol end as unit,
      sum((r.quantity - r.rejected_quantity) * r.unit_to_base) as qty, bool_or(r.is_estimate) as est
    from public.production_record_balances r
    where r.organization_id = p_org and r.status = 'posted' and r.record_date between p_from and p_to
      and (p_site is null or r.site_id = p_site)
      and (p_production_type is null or r.production_type = p_production_type)
    group by 1, 2, 3
  ),
  fin as (
    select
      coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense
    from public.finance_transactions
    where v_finance and organization_id = p_org and txn_date between p_from and p_to
      and (p_site is null or site_id = p_site)
      and (p_production_type is null or production_type = p_production_type)
  ),
  sal as (
    select coalesce(sum(total_amount), 0) as value, coalesce(sum(amount_outstanding), 0) as outstanding, count(*) as n
    from public.sale_summaries
    where v_finance and organization_id = p_org and status = 'posted' and sale_date between p_from and p_to
      and (p_site is null or site_id = p_site)
  ),
  low as (
    select count(*) as n from (
      select ib.item_id, ib.site_id from public.inventory_balances ib
      where ib.organization_id = p_org and (p_site is null or ib.site_id = p_site) and ib.reorder_level is not null
      group by ib.item_id, ib.site_id, ib.reorder_level having sum(ib.quantity) <= ib.reorder_level
    ) x
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  daily as (
    select days.day,
      coalesce((select -sum(quantity) from ev where ev.event_date = days.day and ev.effective_kind = 'mortality'), 0) as mortality,
      coalesce((select sum(qty) from (
        select (r.quantity - r.rejected_quantity) * r.unit_to_base as qty from public.production_record_balances r
        where r.organization_id = p_org and r.record_kind = 'egg_collection' and r.status = 'posted' and r.record_date = days.day
          and (p_site is null or r.site_id = p_site) and (p_production_type is null or p_production_type = 'poultry')) e), 0) as eggs
    from days
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'sites', (select count(*) from public.farm_sites where organization_id = p_org and status = 'active' and (p_site is null or id = p_site)),
    'active', jsonb_build_object(
      'poultry_batches', (select count(*) from b where status = 'active' and production_type = 'poultry'),
      'fish_batches',    (select count(*) from b where status = 'active' and production_type = 'fish'),
      'crop_cycles',     (select count(*) from public.crop_cycles c where c.organization_id = p_org
                            and (p_site is null or c.site_id = p_site) and c.status in ('active', 'harvested')
                            and (p_production_type is null or p_production_type = 'crop'))
    ),
    'population', jsonb_build_object(
      'birds', (select coalesce(sum(current_population), 0) from b where status = 'active' and production_type = 'poultry'),
      'fish_estimated', (select coalesce(sum(current_population), 0) from b where status = 'active' and production_type = 'fish'),
      'fish_biomass_kg_estimated', (select sum(estimated_biomass_kg) from b where status = 'active' and production_type = 'fish')
    ),
    'mortality', jsonb_build_object(
      'poultry', (select coalesce(-sum(quantity), 0) from ev where effective_kind = 'mortality' and batch_id in (select id from b where production_type = 'poultry')),
      'fish',    (select coalesce(-sum(quantity), 0) from ev where effective_kind = 'mortality' and batch_id in (select id from b where production_type = 'fish')),
      'poultry_at_risk', (select coalesce((select qty from opening where production_type = 'poultry'), 0)
                          + coalesce((select sum(quantity) from ev where effective_kind in ('acquisition', 'opening', 'transfer_in')
                                      and batch_id in (select id from b where production_type = 'poultry')), 0)),
      'fish_at_risk', (select coalesce((select qty from opening where production_type = 'fish'), 0)
                          + coalesce((select sum(quantity) from ev where effective_kind in ('acquisition', 'opening', 'transfer_in')
                                      and batch_id in (select id from b where production_type = 'fish')), 0))
    ),
    'feed_consumed_kg', (select round(kg, 1) from feed),
    'production', coalesce((select jsonb_agg(jsonb_build_object('kind', record_kind, 'product', product, 'unit', unit,
                     'quantity', round(qty, 2), 'has_estimates', est) order by record_kind, product) from prod), '[]'::jsonb),
    'low_stock_items', (select n from low),
    'finance', case when v_finance then (select jsonb_build_object('income', income, 'expense', expense,
                  'operating_surplus', income - expense) from fin) end,
    'sales', case when v_finance then (select jsonb_build_object('value', value, 'outstanding', outstanding, 'count', n) from sal) end,
    'daily', (select jsonb_agg(jsonb_build_object('day', day, 'mortality', mortality, 'eggs', round(eggs, 0)) order by day) from daily)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alerts, computed live from records (nothing to go stale)
-- ---------------------------------------------------------------------------
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

  -- Low stock per item per site (only items with a reorder level).
  if v_set.low_stock_enabled then
    return query
    select 'low_stock:' || ib.item_id || ':' || ib.site_id, 'low_stock',
      case when sum(ib.quantity) <= 0 then 'critical' else 'warning' end,
      ib.site_id, min(ib.site_name), 'inventory_item', ib.item_id,
      min(ib.item_name) || ' is low',
      trim(to_char(sum(ib.quantity), 'FM999999990.##')) || ' ' || min(ib.unit_symbol) || ' left; reorder at '
        || trim(to_char(ib.reorder_level, 'FM999999990.##')) || ' ' || min(ib.unit_symbol),
      v_today
    from public.inventory_balances ib
    where ib.organization_id = p_org and (p_site is null or ib.site_id = p_site) and ib.reorder_level is not null
    group by ib.item_id, ib.site_id, ib.reorder_level
    having sum(ib.quantity) <= ib.reorder_level;
  end if;

  -- Daily mortality above threshold, today or yesterday.
  if v_set.mortality_alerts_enabled then
    return query
    with d as (
      select b.id, b.code, b.production_type, b.site_id, fs.name as site_name, day::date as day,
        (select coalesce(sum(quantity), 0) from public.batch_events e where e.batch_id = b.id and e.event_date < day::date) as start_pop,
        (select coalesce(-sum(quantity), 0) from public.batch_events_net e where e.batch_id = b.id and e.event_date = day::date
          and e.effective_kind = 'mortality') as deaths
      from public.batches b
      join public.farm_sites fs on fs.id = b.site_id
      cross join generate_series(v_today - 1, v_today, interval '1 day') day
      where b.organization_id = p_org and b.status = 'active' and (p_site is null or b.site_id = p_site)
    )
    select 'mortality:' || d.id || ':' || d.day, 'high_mortality',
      case when 100.0 * d.deaths / d.start_pop >= 2 * case d.production_type when 'fish' then v_set.fish_daily_mortality_pct
        else v_set.poultry_daily_mortality_pct end then 'critical' else 'warning' end,
      d.site_id, d.site_name, 'batch', d.id,
      'High mortality in ' || d.code,
      d.deaths || ' died on ' || to_char(d.day, 'DD Mon') || ' (' || round(100.0 * d.deaths / d.start_pop, 2) || '% of '
        || d.start_pop || '; alert above ' || case d.production_type when 'fish' then v_set.fish_daily_mortality_pct
        else v_set.poultry_daily_mortality_pct end || '%)',
      d.day
    from d
    where d.start_pop > 0 and d.deaths > 0
      and 100.0 * d.deaths / d.start_pop > case d.production_type when 'fish' then v_set.fish_daily_mortality_pct
        else v_set.poultry_daily_mortality_pct end;
  end if;

  -- High rejection on recent production records.
  return query
  select 'rejection:' || r.id, 'high_rejection', 'warning', r.site_id, r.site_name, 'production_record', r.id,
    'High rejection: ' || r.product || ' (' || r.source_code || ')',
    round(100.0 * r.rejected_quantity / r.quantity, 1) || '% rejected on ' || to_char(r.record_date, 'DD Mon'),
    r.record_date
  from public.production_record_balances r
  where r.organization_id = p_org and r.status = 'posted' and (p_site is null or r.site_id = p_site)
    and r.record_date >= v_today - 1
    and 100.0 * r.rejected_quantity / r.quantity > v_set.production_rejection_pct;

  -- Active batches expected to have daily records but with none recently.
  -- Only after the batch has existed long enough to owe a record.
  if v_set.missing_records_enabled then
    return query
    select 'missing:' || b.id, 'missing_records', 'info', b.site_id, fs.name, 'batch', b.id,
      'No records for ' || b.code,
      coalesce('Last record ' || to_char(last.d, 'DD Mon'), 'Nothing recorded since the batch started')
        || '. Expected daily.',
      v_today
    from public.batches b
    join public.farm_sites fs on fs.id = b.site_id
    left join lateral (
      select max(a.occurred_on) as d from public.activity_logs a where a.batch_id = b.id and a.voided_at is null
    ) last on true
    where b.organization_id = p_org and b.status = 'active' and b.expects_daily_records
      and (p_site is null or b.site_id = p_site)
      and b.start_date <= v_today - v_set.missing_records_after_days
      -- With the default of 1 day: recorded yesterday is fine; nothing since the day before alerts.
      and coalesce(last.d, b.start_date - 1) < v_today - v_set.missing_records_after_days;
  end if;

  -- Planned activities due soon or overdue.
  return query
  select 'planned:' || pa.id, case when pa.due_on < v_today then 'overdue_activity' else 'upcoming_activity' end,
    case when pa.due_on < v_today then 'warning' else 'info' end,
    pa.site_id, fs.name, 'planned_activity', pa.id, pa.title,
    case when pa.due_on < v_today then 'Overdue since ' else 'Due ' end || to_char(pa.due_on, 'DD Mon YYYY'),
    pa.due_on
  from public.planned_activities pa
  join public.farm_sites fs on fs.id = pa.site_id
  where pa.organization_id = p_org and pa.status = 'planned' and (p_site is null or pa.site_id = p_site)
    and pa.due_on <= v_today + v_set.upcoming_activity_days;

  -- Expected crop harvests coming up.
  return query
  select 'harvest:' || c.id, 'upcoming_harvest', case when c.expected_harvest_date < v_today then 'warning' else 'info' end,
    c.site_id, fs.name, 'crop_cycle', c.id,
    'Harvest expected: ' || c.crop || ' (' || c.code || ')',
    case when c.expected_harvest_date < v_today then 'Expected ' else 'Due ' end || to_char(c.expected_harvest_date, 'DD Mon YYYY'),
    c.expected_harvest_date
  from public.crop_cycles c
  join public.farm_sites fs on fs.id = c.site_id
  where c.organization_id = p_org and c.status = 'active' and c.expected_harvest_date is not null
    and (p_site is null or c.site_id = p_site)
    and c.expected_harvest_date <= v_today + v_set.upcoming_activity_days
    and not exists (select 1 from public.production_records r where r.crop_cycle_id = c.id and r.status = 'posted');
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.org_today(uuid),
  public.report_mortality(uuid, date, date, uuid, text),
  public.report_feed(uuid, date, date, uuid, text),
  public.report_stock_movements(uuid, date, date, uuid),
  public.report_production(uuid, date, date, uuid, text),
  public.report_finance_monthly(uuid, date, date, uuid, text),
  public.report_finance_by_category(uuid, date, date, uuid, text),
  public.report_sales(uuid, date, date, uuid),
  public.report_site_performance(uuid, date, date),
  public.report_cycle_performance(uuid, uuid, text, boolean),
  public.report_inputs_used(uuid, date, date, uuid),
  public.dashboard_summary(uuid, date, date, uuid, text),
  public.org_alerts(uuid, uuid)
  to authenticated;
