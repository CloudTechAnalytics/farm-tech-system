-- ============================================================================
-- 0003 Operations schema: batches, crop cycles, inventory, feed, production,
-- sales, finance and the unified daily log.
--
-- Source of truth for every quantity (nothing below stores an editable copy):
--   population of a batch       = sum(batch_events.quantity)
--   stock in a store            = sum(inventory_movements.quantity)
--   feed held at a batch        = sum(feed_events.quantity)
--   produce still available     = production_records.quantity - rejected - sum(posted disposals)
--   sale value                  = sum(sale_lines.line_total)
--   money in / out              = sum(finance_transactions.amount) by kind
-- Ledger rows are never updated or deleted. Corrections are reversal rows
-- with the opposite sign that point at the row they reverse.
-- ============================================================================

alter table public.production_units add constraint production_units_id_site_key unique (id, site_id);

-- ---------------------------------------------------------------------------
-- Livestock batches (poultry flocks and fish batches share one structure;
-- their differences are columns and rules, not separate ledgers)
-- ---------------------------------------------------------------------------
create table public.batches (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  site_id                uuid not null,
  production_unit_id     uuid,
  production_type        text not null check (production_type in ('poultry', 'fish')),
  code                   text not null check (length(trim(code)) between 1 and 40),
  species                text not null check (length(trim(species)) between 2 and 60),
  breed                  text check (breed is null or length(breed) <= 80),
  purpose                text not null check (purpose in ('layers', 'broilers', 'breeders', 'cockerels', 'table_fish', 'fingerlings', 'broodstock', 'other')),
  source                 text check (source is null or length(source) <= 120),
  start_date             date not null,
  initial_quantity       integer not null check (initial_quantity > 0),
  initial_avg_weight_g   numeric(12, 2) check (initial_avg_weight_g is null or initial_avg_weight_g > 0),
  count_basis            text not null check (count_basis in ('counted', 'estimated')),
  expects_daily_records  boolean not null default true,
  status                 text not null default 'active' check (status in ('active', 'closed')),
  closed_on              date,
  close_reason           text check (close_reason is null or length(close_reason) <= 500),
  notes                  text check (notes is null or length(notes) <= 2000),
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (organization_id, code),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (production_unit_id, site_id) references public.production_units (id, site_id),
  check ((status = 'closed') = (closed_on is not null)),
  check (production_type <> 'poultry' or purpose in ('layers', 'broilers', 'breeders', 'cockerels', 'other')),
  check (production_type <> 'fish' or purpose in ('table_fish', 'fingerlings', 'broodstock', 'other'))
);

create index idx_batches_site_status on public.batches (site_id, status);

create trigger trg_batches_updated_at before update on public.batches
  for each row execute function private.set_updated_at();
create trigger trg_audit_batches after update on public.batches
  for each row execute function private.audit_row_change();

create table public.batch_events (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  site_id               uuid not null,
  batch_id              uuid not null,
  event_date            date not null,
  kind                  text not null check (kind in ('acquisition', 'opening', 'transfer_in', 'mortality', 'cull',
                          'sale', 'transfer_out', 'harvest', 'theft_loss', 'adjustment', 'reversal')),
  quantity              integer not null check (quantity <> 0),
  weight_kg             numeric(14, 3) check (weight_kg is null or weight_kg > 0),
  is_estimate           boolean not null default false,
  reason                text check (reason is null or length(reason) <= 500),
  transfer_group_id     uuid,
  counterpart_batch_id  uuid,
  reverses_event_id     uuid unique references public.batch_events (id),
  recorded_by           uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (counterpart_batch_id, organization_id) references public.batches (id, organization_id),
  check ((kind = 'reversal') = (reverses_event_id is not null)),
  check (kind not in ('acquisition', 'opening', 'transfer_in') or quantity > 0),
  check (kind not in ('mortality', 'cull', 'sale', 'transfer_out', 'harvest', 'theft_loss') or quantity < 0)
);

create index idx_batch_events_batch_date on public.batch_events (batch_id, event_date);
create index idx_batch_events_org_date on public.batch_events (organization_id, event_date);

-- Backstop: a population can never go negative, whatever wrote the row.
create or replace function private.check_batch_population()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select coalesce(sum(quantity), 0) from public.batch_events where batch_id = new.batch_id) < 0 then
    raise exception 'This would leave the batch with a negative population.' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger trg_check_batch_population after insert on public.batch_events
  for each row execute function private.check_batch_population();

create table public.fish_samples (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  batch_id         uuid not null,
  sample_date      date not null,
  sample_size      integer not null check (sample_size > 0),
  total_weight_g   numeric(14, 2) not null check (total_weight_g > 0),
  avg_weight_g     numeric(14, 2) generated always as (round(total_weight_g / sample_size, 2)) stored,
  notes            text check (notes is null or length(notes) <= 1000),
  voided_at        timestamptz,
  void_reason      text,
  recorded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id)
);

create index idx_fish_samples_batch on public.fish_samples (batch_id, sample_date desc);

-- ---------------------------------------------------------------------------
-- Crop cycles
-- ---------------------------------------------------------------------------
create table public.crop_cycles (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  site_id                uuid not null,
  production_unit_id     uuid not null,
  code                   text not null check (length(trim(code)) between 1 and 40),
  crop                   text not null check (length(trim(crop)) between 2 and 60),
  variety                text check (variety is null or length(variety) <= 80),
  season                 text check (season is null or length(season) <= 40),
  planting_date          date,
  area                   numeric(14, 4) not null check (area > 0),
  area_unit_id           uuid not null references public.units (id),
  expected_harvest_date  date,
  status                 text not null default 'planned' check (status in ('planned', 'active', 'harvested', 'closed', 'failed')),
  closed_on              date,
  close_reason           text check (close_reason is null or length(close_reason) <= 500),
  notes                  text check (notes is null or length(notes) <= 2000),
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (organization_id, code),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (production_unit_id, site_id) references public.production_units (id, site_id),
  check (status = 'planned' or planting_date is not null),
  check (expected_harvest_date is null or planting_date is null or expected_harvest_date >= planting_date)
);

create index idx_crop_cycles_site_status on public.crop_cycles (site_id, status);

create trigger trg_crop_cycles_updated_at before update on public.crop_cycles
  for each row execute function private.set_updated_at();
create trigger trg_audit_crop_cycles after update on public.crop_cycles
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create table public.stores (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  name             text not null check (length(trim(name)) between 2 and 80),
  is_default       boolean not null default false,
  status           text not null default 'active' check (status in ('active', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (site_id, name),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id) on delete cascade
);

create unique index stores_one_default_per_site on public.stores (site_id) where is_default;

create trigger trg_stores_updated_at before update on public.stores
  for each row execute function private.set_updated_at();
create trigger trg_audit_stores after insert or update on public.stores
  for each row execute function private.audit_row_change();

-- Every new site gets a default store.
create or replace function private.create_default_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stores (organization_id, site_id, name, is_default)
  values (new.organization_id, new.id, 'Main store', true);
  return new;
end;
$$;

create trigger trg_site_default_store after insert on public.farm_sites
  for each row execute function private.create_default_store();

create table public.inventory_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (length(trim(name)) between 2 and 120),
  category_id      uuid not null,
  base_unit_id     uuid not null references public.units (id),
  sku              text check (sku is null or length(sku) <= 40),
  production_type  text check (production_type in ('poultry', 'fish', 'crop', 'general')),
  is_feed          boolean not null default false,
  reorder_level    numeric(18, 4) check (reorder_level is null or reorder_level >= 0),
  status           text not null default 'active' check (status in ('active', 'archived')),
  notes            text check (notes is null or length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name),
  foreign key (category_id, organization_id) references public.categories (id, organization_id)
);

create trigger trg_inventory_items_updated_at before update on public.inventory_items
  for each row execute function private.set_updated_at();
create trigger trg_audit_inventory_items after insert or update on public.inventory_items
  for each row execute function private.audit_row_change();

create or replace function private.check_item_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.base_unit_id
                 and (u.organization_id is null or u.organization_id = new.organization_id)) then
    raise exception 'Unit of measure not found.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.categories c where c.id = new.category_id and c.kind = 'inventory') then
    raise exception 'Choose an inventory category.' using errcode = '23514';
  end if;
  -- The base unit fixes how the ledger is stored; it cannot change once stock has moved.
  if tg_op = 'UPDATE' and new.base_unit_id <> old.base_unit_id
     and exists (select 1 from public.inventory_movements m where m.item_id = new.id) then
    raise exception 'The unit cannot change after stock has been recorded for this item.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.stock_counts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  site_id            uuid not null,
  store_id           uuid not null,
  item_id            uuid not null,
  count_date         date not null,
  system_quantity    numeric(18, 4) not null,
  counted_quantity   numeric(18, 4) not null check (counted_quantity >= 0),
  variance           numeric(18, 4) generated always as (counted_quantity - system_quantity) stored,
  reason             text check (reason is null or length(reason) <= 500),
  recorded_by        uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (store_id, site_id) references public.stores (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (item_id, organization_id) references public.inventory_items (id, organization_id)
);

create table public.inventory_movements (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  site_id               uuid not null,
  store_id              uuid not null,
  item_id               uuid not null,
  movement_type         text not null check (movement_type in ('opening', 'purchase', 'receipt', 'issue', 'consumption',
                          'transfer_in', 'transfer_out', 'adjustment', 'return', 'wastage', 'reversal')),
  movement_date         date not null,
  quantity              numeric(18, 4) not null check (quantity <> 0),
  entered_quantity      numeric(18, 4) not null check (entered_quantity > 0),
  entered_unit_id       uuid not null references public.units (id),
  conversion_factor     numeric(20, 10) not null check (conversion_factor > 0),
  unit_cost             numeric(16, 4) check (unit_cost is null or unit_cost >= 0),
  total_cost            numeric(14, 2) check (total_cost is null or total_cost >= 0),
  supplier              text check (supplier is null or length(supplier) <= 120),
  reference             text check (reference is null or length(reference) <= 80),
  reason                text check (reason is null or length(reason) <= 500),
  batch_id              uuid,
  crop_cycle_id         uuid,
  transfer_group_id     uuid,
  stock_count_id        uuid,
  reverses_movement_id  uuid unique references public.inventory_movements (id),
  recorded_by           uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (store_id, site_id) references public.stores (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (item_id, organization_id) references public.inventory_items (id, organization_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (crop_cycle_id, site_id) references public.crop_cycles (id, site_id),
  foreign key (stock_count_id, organization_id) references public.stock_counts (id, organization_id),
  check ((movement_type = 'reversal') = (reverses_movement_id is not null)),
  check (movement_type not in ('opening', 'purchase', 'receipt', 'transfer_in', 'return') or quantity > 0),
  check (movement_type not in ('issue', 'consumption', 'transfer_out', 'wastage') or quantity < 0),
  check (batch_id is null or crop_cycle_id is null)
);

create index idx_inventory_movements_item_store on public.inventory_movements (item_id, store_id);
create index idx_inventory_movements_org_date on public.inventory_movements (organization_id, movement_date);

create trigger trg_check_item_refs before insert or update on public.inventory_items
  for each row execute function private.check_item_refs();

-- Backstop: no store balance may go negative.
create or replace function private.check_stock_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select coalesce(sum(quantity), 0) from public.inventory_movements
      where item_id = new.item_id and store_id = new.store_id) < 0 then
    raise exception 'Not enough stock in this store for this movement.' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger trg_check_stock_balance after insert on public.inventory_movements
  for each row execute function private.check_stock_balance();

-- Feed held at a batch (house or pond side). Store stock is deducted once,
-- when feed is ISSUED. Consumption and wastage reduce the feed held at the
-- batch, never the store. A return moves feed back into the store.
--   issued   +q  (paired with inventory issue  -q)
--   consumed -q  (no inventory effect)
--   wasted   -q  (no inventory effect)
--   returned -q  (paired with inventory return +q)
create table public.feed_events (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  site_id                uuid not null,
  batch_id               uuid not null,
  item_id                uuid not null,
  event_date             date not null,
  kind                   text not null check (kind in ('issued', 'consumed', 'wasted', 'returned', 'reversal')),
  quantity               numeric(18, 4) not null check (quantity <> 0),
  inventory_movement_id  uuid unique references public.inventory_movements (id),
  reverses_feed_event_id uuid unique references public.feed_events (id),
  notes                  text check (notes is null or length(notes) <= 500),
  recorded_by            uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (item_id, organization_id) references public.inventory_items (id, organization_id),
  check ((kind = 'reversal') = (reverses_feed_event_id is not null)),
  check (kind <> 'issued' or quantity > 0),
  check (kind not in ('consumed', 'wasted', 'returned') or quantity < 0),
  check (kind not in ('issued', 'returned') or inventory_movement_id is not null)
);

create index idx_feed_events_batch_item on public.feed_events (batch_id, item_id);
create index idx_feed_events_org_date on public.feed_events (organization_id, event_date);

create or replace function private.check_feed_on_hand()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select coalesce(sum(quantity), 0) from public.feed_events
      where batch_id = new.batch_id and item_id = new.item_id) < 0 then
    raise exception 'More feed recorded than was issued to this batch.' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger trg_check_feed_on_hand after insert on public.feed_events
  for each row execute function private.check_feed_on_hand();

-- ---------------------------------------------------------------------------
-- Production and harvest records, and what happened to the output
-- ---------------------------------------------------------------------------
create table public.production_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  site_id            uuid not null,
  production_type    text not null check (production_type in ('poultry', 'fish', 'crop')),
  record_kind        text not null check (record_kind in ('egg_collection', 'fish_harvest', 'crop_harvest', 'poultry_processing', 'other_output')),
  batch_id           uuid,
  crop_cycle_id      uuid,
  product            text not null check (length(trim(product)) between 2 and 80),
  record_date        date not null,
  quantity           numeric(18, 4) not null check (quantity > 0),
  unit_id            uuid not null references public.units (id),
  rejected_quantity  numeric(18, 4) not null default 0 check (rejected_quantity >= 0),
  grade              text check (grade is null or length(grade) <= 40),
  weight_kg          numeric(14, 3) check (weight_kg is null or weight_kg > 0),
  head_count         integer check (head_count is null or head_count > 0),
  is_estimate        boolean not null default false,
  destination        text check (destination is null or length(destination) <= 120),
  batch_event_id     uuid unique references public.batch_events (id),
  notes              text check (notes is null or length(notes) <= 1000),
  responsible_id     uuid references public.profiles (id) on delete set null,
  status             text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at          timestamptz,
  void_reason        text,
  recorded_by        uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (crop_cycle_id, site_id) references public.crop_cycles (id, site_id),
  check (rejected_quantity <= quantity),
  check ((batch_id is null) <> (crop_cycle_id is null)),
  check ((production_type = 'crop') = (crop_cycle_id is not null)),
  check ((status = 'voided') = (voided_at is not null))
);

create index idx_production_records_org_date on public.production_records (organization_id, record_date);
create index idx_production_records_batch on public.production_records (batch_id);
create index idx_production_records_cycle on public.production_records (crop_cycle_id);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  sale_date        date not null,
  customer_name    text check (customer_name is null or length(customer_name) <= 120),
  customer_phone   text check (customer_phone is null or length(customer_phone) <= 40),
  currency         char(3) not null,
  notes            text check (notes is null or length(notes) <= 1000),
  status           text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at        timestamptz,
  void_reason      text,
  recorded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  check ((status = 'voided') = (voided_at is not null))
);

create index idx_sales_org_date on public.sales (organization_id, sale_date);

create table public.sale_lines (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  site_id               uuid not null,
  sale_id               uuid not null,
  line_type             text not null check (line_type in ('produce', 'livestock', 'other')),
  production_record_id  uuid,
  batch_id              uuid,
  description           text not null check (length(trim(description)) between 2 and 160),
  quantity              numeric(18, 4) not null check (quantity > 0),
  unit_id               uuid not null references public.units (id),
  unit_price            numeric(14, 2) not null check (unit_price >= 0),
  line_total            numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  weight_kg             numeric(14, 3) check (weight_kg is null or weight_kg > 0),
  batch_event_id        uuid unique references public.batch_events (id),
  created_at            timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (sale_id, site_id) references public.sales (id, site_id) on delete cascade,
  foreign key (production_record_id, site_id) references public.production_records (id, site_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  check (line_type <> 'produce' or (production_record_id is not null and batch_id is null)),
  check (line_type <> 'livestock' or (batch_id is not null and production_record_id is null and quantity = round(quantity))),
  check (line_type <> 'other' or (batch_id is null and production_record_id is null))
);

create index idx_sale_lines_sale on public.sale_lines (sale_id);

create table public.production_disposals (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  site_id               uuid not null,
  production_record_id  uuid not null,
  disposal_date         date not null,
  kind                  text not null check (kind in ('sold', 'internal_use', 'given_away', 'spoiled', 'other')),
  quantity              numeric(18, 4) not null check (quantity > 0),
  sale_line_id          uuid unique references public.sale_lines (id),
  notes                 text check (notes is null or length(notes) <= 500),
  status                text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at             timestamptz,
  recorded_by           uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  foreign key (production_record_id, site_id) references public.production_records (id, site_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  check ((kind = 'sold') = (sale_line_id is not null)),
  check ((status = 'voided') = (voided_at is not null))
);

create index idx_production_disposals_record on public.production_disposals (production_record_id) where status = 'posted';

-- ---------------------------------------------------------------------------
-- Finance: recorded cash income and expenses (not an accounting ledger)
-- ---------------------------------------------------------------------------
create table public.finance_transactions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  site_id                uuid,
  txn_date               date not null,
  kind                   text not null check (kind in ('income', 'expense')),
  category_id            uuid not null,
  amount                 numeric(14, 2) not null check (amount <> 0),
  currency               char(3) not null,
  payment_method         text check (payment_method in ('cash', 'bank_transfer', 'pos', 'mobile_money', 'cheque', 'other')),
  description            text not null check (length(trim(description)) between 2 and 300),
  reference              text check (reference is null or length(reference) <= 80),
  counterparty           text check (counterparty is null or length(counterparty) <= 120),
  production_type        text check (production_type in ('poultry', 'fish', 'crop', 'general')),
  batch_id               uuid,
  crop_cycle_id          uuid,
  sale_id                uuid,
  inventory_movement_id  uuid unique,
  status                 text not null default 'posted' check (status in ('posted', 'reversed')),
  reverses_id            uuid unique references public.finance_transactions (id),
  reversal_reason        text,
  recorded_by            uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (category_id, organization_id) references public.categories (id, organization_id),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id),
  foreign key (crop_cycle_id, organization_id) references public.crop_cycles (id, organization_id),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (inventory_movement_id, organization_id) references public.inventory_movements (id, organization_id),
  check ((reverses_id is null and amount > 0) or (reverses_id is not null and amount < 0)),
  check (batch_id is null or crop_cycle_id is null)
);

create index idx_finance_org_date on public.finance_transactions (organization_id, txn_date);
create index idx_finance_sale on public.finance_transactions (sale_id) where sale_id is not null;

create trigger trg_finance_updated_at before update on public.finance_transactions
  for each row execute function private.set_updated_at();

create or replace function private.check_finance_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.categories c where c.id = new.category_id and c.kind = new.kind) then
    raise exception 'The category does not match an % transaction.', new.kind using errcode = '23514';
  end if;
  if new.currency <> (select o.currency from public.organizations o where o.id = new.organization_id) then
    raise exception 'Transactions must use the organization currency.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_check_finance_refs before insert on public.finance_transactions
  for each row execute function private.check_finance_refs();

-- Organization currency is fixed once money has been recorded.
create or replace function private.protect_org_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency <> old.currency and exists (select 1 from public.finance_transactions where organization_id = new.id) then
    raise exception 'Currency cannot change after transactions have been recorded.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_protect_org_currency before update of currency on public.organizations
  for each row execute function private.protect_org_currency();

-- ---------------------------------------------------------------------------
-- Unified daily operations log
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  site_id                 uuid not null,
  occurred_on             date not null,
  occurred_at             timestamptz,
  production_type         text not null check (production_type in ('poultry', 'fish', 'crop', 'general')),
  batch_id                uuid,
  crop_cycle_id           uuid,
  production_unit_id      uuid,
  category_id             uuid not null,
  quantity                numeric(18, 4),
  unit_id                 uuid references public.units (id),
  summary                 text not null check (length(summary) between 2 and 300),
  notes                   text check (notes is null or length(notes) <= 2000),
  responsible_id          uuid references public.profiles (id) on delete set null,
  source                  text not null check (source in ('manual', 'system')),
  batch_event_id          uuid references public.batch_events (id),
  feed_event_id           uuid references public.feed_events (id),
  inventory_movement_id   uuid references public.inventory_movements (id),
  production_record_id    uuid references public.production_records (id),
  finance_transaction_id  uuid references public.finance_transactions (id),
  sale_id                 uuid references public.sales (id),
  voided_at               timestamptz,
  void_reason             text,
  recorded_by             uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (crop_cycle_id, site_id) references public.crop_cycles (id, site_id),
  foreign key (production_unit_id, site_id) references public.production_units (id, site_id),
  foreign key (category_id, organization_id) references public.categories (id, organization_id),
  check (quantity is null or unit_id is not null)
);

create index idx_activity_logs_site_date on public.activity_logs (site_id, occurred_on desc);
create index idx_activity_logs_org_date on public.activity_logs (organization_id, occurred_on desc);
create index idx_activity_logs_batch on public.activity_logs (batch_id, occurred_on desc) where batch_id is not null;
create index idx_activity_logs_cycle on public.activity_logs (crop_cycle_id, occurred_on desc) where crop_cycle_id is not null;

create table public.planned_activities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  production_type  text not null check (production_type in ('poultry', 'fish', 'crop', 'general')),
  batch_id         uuid,
  crop_cycle_id    uuid,
  category_id      uuid not null,
  title            text not null check (length(trim(title)) between 2 and 160),
  due_on           date not null,
  status           text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  completed_at     timestamptz,
  notes            text check (notes is null or length(notes) <= 1000),
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (batch_id, site_id) references public.batches (id, site_id),
  foreign key (crop_cycle_id, site_id) references public.crop_cycles (id, site_id),
  foreign key (category_id, organization_id) references public.categories (id, organization_id)
);

create index idx_planned_activities_due on public.planned_activities (organization_id, due_on) where status = 'planned';

create trigger trg_planned_activities_updated_at before update on public.planned_activities
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.batches              enable row level security;
alter table public.batch_events         enable row level security;
alter table public.fish_samples         enable row level security;
alter table public.crop_cycles          enable row level security;
alter table public.stores               enable row level security;
alter table public.inventory_items      enable row level security;
alter table public.stock_counts         enable row level security;
alter table public.inventory_movements  enable row level security;
alter table public.feed_events          enable row level security;
alter table public.production_records   enable row level security;
alter table public.sales                enable row level security;
alter table public.sale_lines           enable row level security;
alter table public.production_disposals enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.activity_logs        enable row level security;
alter table public.planned_activities   enable row level security;

-- Operations (quantities, no money)
create policy batches_select on public.batches for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy batch_events_select on public.batch_events for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy fish_samples_select on public.fish_samples for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy crop_cycles_select on public.crop_cycles for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy feed_events_select on public.feed_events for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy production_records_select on public.production_records for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy production_disposals_select on public.production_disposals for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy activity_logs_select on public.activity_logs for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy planned_activities_select on public.planned_activities for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy planned_activities_insert on public.planned_activities for insert to authenticated
  with check (public.can(organization_id, site_id, 'operations.record'));
create policy planned_activities_update on public.planned_activities for update to authenticated
  using (public.can(organization_id, site_id, 'operations.record'))
  with check (public.can(organization_id, site_id, 'operations.record'));

-- Inventory
create policy stores_select on public.stores for select to authenticated
  using (public.has_site_access(organization_id, site_id)
         and (public.has_permission(organization_id, 'inventory.view') or public.has_permission(organization_id, 'operations.record')));
create policy stores_insert on public.stores for insert to authenticated
  with check (public.can(organization_id, site_id, 'inventory.manage') and not is_default);
create policy stores_update on public.stores for update to authenticated
  using (public.can(organization_id, site_id, 'inventory.manage'))
  with check (public.can(organization_id, site_id, 'inventory.manage'));
create policy inventory_items_select on public.inventory_items for select to authenticated
  using (public.has_permission(organization_id, 'inventory.view') or public.has_permission(organization_id, 'operations.record'));
create policy inventory_items_insert on public.inventory_items for insert to authenticated
  with check (public.has_permission(organization_id, 'inventory.manage'));
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (public.has_permission(organization_id, 'inventory.manage'))
  with check (public.has_permission(organization_id, 'inventory.manage'));
create policy inventory_movements_select on public.inventory_movements for select to authenticated
  using (public.can(organization_id, site_id, 'inventory.view'));
create policy stock_counts_select on public.stock_counts for select to authenticated
  using (public.can(organization_id, site_id, 'inventory.view'));

-- Money
create policy sales_select on public.sales for select to authenticated
  using (public.has_site_access(organization_id, site_id)
         and (public.has_permission(organization_id, 'finance.view') or public.has_permission(organization_id, 'sales.record')));
create policy sale_lines_select on public.sale_lines for select to authenticated
  using (public.has_site_access(organization_id, site_id)
         and (public.has_permission(organization_id, 'finance.view') or public.has_permission(organization_id, 'sales.record')));
create policy finance_transactions_select on public.finance_transactions for select to authenticated
  using (public.can(organization_id, site_id, 'finance.view'));

-- Grants: read everywhere RLS allows; direct writes only on planning and
-- configuration tables. Every ledger write goes through an RPC.
revoke all on public.batches, public.batch_events, public.fish_samples, public.crop_cycles, public.stores,
  public.inventory_items, public.stock_counts, public.inventory_movements, public.feed_events,
  public.production_records, public.sales, public.sale_lines, public.production_disposals,
  public.finance_transactions, public.activity_logs, public.planned_activities
  from anon, authenticated;

grant select on public.batches, public.batch_events, public.fish_samples, public.crop_cycles, public.stores,
  public.inventory_items, public.stock_counts, public.inventory_movements, public.feed_events,
  public.production_records, public.sales, public.sale_lines, public.production_disposals,
  public.finance_transactions, public.activity_logs, public.planned_activities
  to authenticated;

grant insert (organization_id, site_id, name) on public.stores to authenticated;
grant update (name, status) on public.stores to authenticated;
grant insert (organization_id, name, category_id, base_unit_id, sku, production_type, is_feed, reorder_level, notes)
  on public.inventory_items to authenticated;
grant update (name, category_id, base_unit_id, sku, production_type, is_feed, reorder_level, status, notes)
  on public.inventory_items to authenticated;
grant insert (organization_id, site_id, production_type, batch_id, crop_cycle_id, category_id, title, due_on, notes)
  on public.planned_activities to authenticated;
grant update (title, due_on, status, completed_at, notes) on public.planned_activities to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
