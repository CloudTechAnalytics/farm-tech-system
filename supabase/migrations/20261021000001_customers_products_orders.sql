-- ============================================================================
-- Release 2 · 0001 Customers, products, customer pricing, sales orders and
-- invoices.
--
-- The existing `sales` table becomes the invoice (number, customer, due
-- date, order link). Fulfilling a sales order creates an invoice through the
-- same internal function as a direct sale, so produce and live animals are
-- deducted exactly once, by the invoice, and reversed only by voiding it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Per-organization document numbering (INV-00001, SO-00001, PO-00001 …)
-- ---------------------------------------------------------------------------
create table private.org_sequences (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  key              text not null,
  next_value       bigint not null default 1,
  primary key (organization_id, key)
);

create or replace function private.next_number(p_org uuid, p_key text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint;
begin
  insert into private.org_sequences (organization_id, key, next_value) values (p_org, p_key, 2)
  on conflict (organization_id, key) do update set next_value = private.org_sequences.next_value + 1
  returning next_value - 1 into v;
  return p_prefix || lpad(v::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- New permissions, granted to the template roles and to existing org roles
-- ---------------------------------------------------------------------------
insert into public.permissions (key, area, label, description, sort_order) values
  ('customers.manage', 'Sales', 'Manage customers', 'Add and edit customers, credit limits and customer prices', 44),
  ('products.manage',  'Sales', 'Manage products',  'Add and edit products, units and selling prices', 45)
on conflict (key) do nothing;

create or replace function private.grant_permission_to_templates(p_key text, p_templates text[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.role_template_permissions (role_key, permission_key)
  select t, p_key from unnest(p_templates) t
  on conflict do nothing;
  insert into public.role_permissions (role_id, organization_id, permission_key)
  select r.id, r.organization_id, p_key from public.roles r
  where r.template_key = any (p_templates)
  on conflict do nothing;
$$;

select private.grant_permission_to_templates('customers.manage', array['owner', 'manager', 'accountant']);
select private.grant_permission_to_templates('products.manage', array['owner', 'manager']);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  code                text check (code is null or code ~ '^[A-Za-z0-9-]{1,20}$'),
  name                text not null check (length(trim(name)) between 2 and 160),
  category            text not null default 'individual'
                        check (category in ('individual', 'retailer', 'wholesaler', 'processor', 'hotel_restaurant', 'institution', 'other')),
  contact_person      text check (contact_person is null or length(contact_person) <= 120),
  phone               text check (phone is null or length(phone) <= 40),
  email               extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address             text check (address is null or length(address) <= 300),
  city                text check (city is null or length(city) <= 80),
  credit_limit        numeric(14, 2) check (credit_limit is null or credit_limit >= 0),
  payment_terms_days  integer not null default 0 check (payment_terms_days between 0 and 365),
  status              text not null default 'active' check (status in ('active', 'inactive')),
  notes               text check (notes is null or length(notes) <= 2000),
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code)
);

create index idx_customers_org_name on public.customers (organization_id, lower(name));

create trigger trg_customers_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger trg_audit_customers after insert or update on public.customers
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Products: what the farm sells. Produce products draw on production records
-- whose product name matches; livestock products draw on batches of the
-- matching species; "other" products are not stock-tracked.
-- ---------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (length(trim(name)) between 2 and 120),
  sku              text check (sku is null or length(sku) <= 40),
  production_type  text not null default 'general' check (production_type in ('poultry', 'fish', 'crop', 'general')),
  source_kind      text not null check (source_kind in ('produce', 'livestock', 'other')),
  match_name       text check (match_name is null or length(trim(match_name)) between 1 and 80),
  unit_id          uuid not null references public.units (id),
  default_price    numeric(14, 2) not null default 0 check (default_price >= 0),
  is_active        boolean not null default true,
  description      text check (description is null or length(description) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name),
  check (source_kind = 'other' or match_name is not null)
);

create trigger trg_products_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger trg_audit_products after insert or update on public.products
  for each row execute function private.audit_row_change();

create or replace function private.check_product_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.units;
begin
  select * into v_unit from public.units u where u.id = new.unit_id and (u.organization_id is null or u.organization_id = new.organization_id);
  if not found then raise exception 'Unit of measure not found.' using errcode = '23503'; end if;
  if new.source_kind = 'livestock' and v_unit.code is distinct from 'each' then
    raise exception 'Live animals are sold per head (unit: Each).' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_check_product_refs before insert or update on public.products
  for each row execute function private.check_product_refs();

create table public.customer_prices (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  customer_id      uuid not null,
  product_id       uuid not null,
  unit_price       numeric(14, 2) not null check (unit_price >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (customer_id, product_id),
  foreign key (customer_id, organization_id) references public.customers (id, organization_id) on delete cascade,
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete cascade
);

create trigger trg_customer_prices_updated_at before update on public.customer_prices
  for each row execute function private.set_updated_at();
create trigger trg_audit_customer_prices after insert or update or delete on public.customer_prices
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Sales orders
-- ---------------------------------------------------------------------------
create table public.sales_orders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  order_number     text not null,
  customer_id      uuid not null,
  order_date       date not null,
  required_by      date,
  status           text not null default 'confirmed' check (status in ('draft', 'confirmed', 'cancelled')),
  notes            text check (notes is null or length(notes) <= 1000),
  cancel_reason    text,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (organization_id, order_number),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (customer_id, organization_id) references public.customers (id, organization_id),
  check (required_by is null or required_by >= order_date)
);

create index idx_sales_orders_org_date on public.sales_orders (organization_id, order_date desc);

create trigger trg_sales_orders_updated_at before update on public.sales_orders
  for each row execute function private.set_updated_at();
create trigger trg_audit_sales_orders after update on public.sales_orders
  for each row execute function private.audit_row_change();

create table public.sales_order_lines (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  sales_order_id   uuid not null,
  product_id       uuid not null,
  description      text not null check (length(trim(description)) between 2 and 160),
  quantity         numeric(18, 4) not null check (quantity > 0),
  unit_id          uuid not null references public.units (id),
  unit_price       numeric(14, 2) not null check (unit_price >= 0),
  line_total       numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (sales_order_id, site_id) references public.sales_orders (id, site_id) on delete cascade,
  foreign key (product_id, organization_id) references public.products (id, organization_id)
);

create index idx_sales_order_lines_order on public.sales_order_lines (sales_order_id);

-- ---------------------------------------------------------------------------
-- Invoices: extend the existing sales tables
-- ---------------------------------------------------------------------------
alter table public.sales
  add column customer_id uuid,
  add column invoice_number text,
  add column due_date date,
  add column sales_order_id uuid,
  add constraint sales_customer_fk foreign key (customer_id, organization_id) references public.customers (id, organization_id),
  add constraint sales_order_fk foreign key (sales_order_id, site_id) references public.sales_orders (id, site_id),
  add constraint sales_due_after_sale check (due_date is null or due_date >= sale_date);

-- Number the invoices that already exist, oldest first, before adding uniqueness.
with numbered as (
  select id, organization_id, row_number() over (partition by organization_id order by created_at, id) as n from public.sales
)
update public.sales s set invoice_number = 'INV-' || lpad(numbered.n::text, 5, '0')
from numbered where numbered.id = s.id;

insert into private.org_sequences (organization_id, key, next_value)
select organization_id, 'invoice', count(*) + 1 from public.sales group by organization_id
on conflict (organization_id, key) do update set next_value = excluded.next_value;

alter table public.sales alter column invoice_number set not null;
alter table public.sales add constraint sales_invoice_number_unique unique (organization_id, invoice_number);
create index idx_sales_customer on public.sales (customer_id) where customer_id is not null;

alter table public.sale_lines
  add column product_id uuid,
  add column sales_order_line_id uuid,
  add constraint sale_lines_product_fk foreign key (product_id, organization_id) references public.products (id, organization_id),
  add constraint sale_lines_order_line_fk foreign key (sales_order_line_id, organization_id) references public.sales_order_lines (id, organization_id);

create index idx_sale_lines_order_line on public.sale_lines (sales_order_line_id) where sales_order_line_id is not null;

-- ---------------------------------------------------------------------------
-- Selling rules shared by direct sales and order fulfilment
-- ---------------------------------------------------------------------------

-- Replaced in the health migration with the treatment withdrawal check.
create or replace function private.assert_sellable(p_batch uuid, p_on date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return;
end;
$$;

-- Creates the invoice and its lines, deducting produce or live animals once.
-- Callers handle idempotency, permissions, payment and the credit check.
create or replace function private.create_sale(
  p_org uuid, p_site uuid, p_sale_date date, p_lines jsonb,
  p_customer uuid, p_customer_name text, p_customer_phone text,
  p_due_date date, p_order uuid, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale uuid;
  v_line jsonb;
  v_line_id uuid;
  v_type text;
  v_qty numeric;
  v_price numeric;
  v_unit uuid;
  v_r public.production_records;
  v_b public.batches;
  v_c public.customers;
  v_factor numeric;
  v_available numeric;
  v_event uuid;
  v_desc text;
  v_pop integer;
  v_product uuid;
  v_order_line uuid;
begin
  if not exists (select 1 from public.farm_sites where id = p_site and organization_id = p_org) then
    raise exception 'Farm site not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the sale.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'A sale can have at most 100 lines.' using errcode = '22023';
  end if;
  if p_customer is not null then
    select * into v_c from public.customers where id = p_customer and organization_id = p_org;
    if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
    if v_c.status <> 'active' then raise exception '% is marked inactive.', v_c.name using errcode = 'P0001'; end if;
  end if;
  if p_due_date is not null and p_due_date < p_sale_date then
    raise exception 'The due date cannot be before the sale date.' using errcode = '22023';
  end if;

  insert into public.sales (organization_id, site_id, sale_date, customer_id, customer_name, customer_phone, currency, notes,
    invoice_number, due_date, sales_order_id, recorded_by)
  values (p_org, p_site, p_sale_date, p_customer,
    coalesce(left(nullif(trim(p_customer_name), ''), 120), left(v_c.name, 120)), coalesce(nullif(trim(p_customer_phone), ''), v_c.phone),
    (select currency from public.organizations where id = p_org), nullif(trim(p_notes), ''),
    private.next_number(p_org, 'invoice', 'INV-'),
    coalesce(p_due_date, case when v_c.id is not null then p_sale_date + v_c.payment_terms_days end),
    p_order, auth.uid())
  returning id into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_type := v_line ->> 'line_type';
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := (v_line ->> 'unit_price')::numeric;
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_desc := nullif(trim(v_line ->> 'description'), '');
    v_product := nullif(v_line ->> 'product_id', '')::uuid;
    v_order_line := nullif(v_line ->> 'sales_order_line_id', '')::uuid;
    perform private.require_positive(v_qty, 'Quantity');
    if v_price is null or v_price < 0 then raise exception 'Enter a price of zero or more.' using errcode = '22023'; end if;
    perform private.assert_unit(p_org, v_unit);
    if v_product is not null and not exists (select 1 from public.products where id = v_product and organization_id = p_org) then
      raise exception 'Product not found.' using errcode = 'P0002';
    end if;

    if v_type = 'produce' then
      select * into v_r from public.production_records
      where id = (v_line ->> 'production_record_id')::uuid and site_id = p_site for update;
      if not found then raise exception 'Produce record not found on this site.' using errcode = 'P0002'; end if;
      if v_r.status <> 'posted' then raise exception 'A selected produce record has been voided.' using errcode = 'P0001'; end if;
      if v_r.record_date > p_sale_date then
        raise exception 'The sale date is before the produce was recorded (%).', v_r.record_date using errcode = '22023';
      end if;
      if v_r.batch_id is not null then perform private.assert_sellable(v_r.batch_id, v_r.record_date); end if;
      v_factor := private.unit_factor(p_org, v_unit, v_r.unit_id);
      v_available := private.record_available(v_r.id);
      if round(v_qty * v_factor, 4) > v_available then
        raise exception 'Only % % of % from % is still available.', trim(to_char(v_available, 'FM999999990.####')),
          (select symbol from public.units where id = v_r.unit_id), v_r.product, to_char(v_r.record_date, 'DD Mon') using errcode = '23514';
      end if;
      insert into public.sale_lines (organization_id, site_id, sale_id, line_type, production_record_id, description,
        quantity, unit_id, unit_price, weight_kg, product_id, sales_order_line_id)
      values (p_org, p_site, v_sale, 'produce', v_r.id, coalesce(v_desc, v_r.product || coalesce(' (' || v_r.grade || ')', '')),
        v_qty, v_unit, v_price, (v_line ->> 'weight_kg')::numeric, v_product, v_order_line)
      returning id into v_line_id;
      insert into public.production_disposals (organization_id, site_id, production_record_id, disposal_date, kind, quantity, sale_line_id, recorded_by)
      values (p_org, p_site, v_r.id, p_sale_date, 'sold', round(v_qty * v_factor, 4), v_line_id, auth.uid());

    elsif v_type = 'livestock' then
      if v_qty <> round(v_qty) then raise exception 'Live animals are sold in whole numbers.' using errcode = '22023'; end if;
      v_b := private.lock_batch((v_line ->> 'batch_id')::uuid, 'sales.record');
      if v_b.site_id <> p_site then raise exception 'The batch must be on the sale''s site.' using errcode = '22023'; end if;
      if v_b.status <> 'active' then raise exception 'Batch % is closed.', v_b.code using errcode = 'P0001'; end if;
      if v_unit <> private.unit_id('each') then raise exception 'Live animals are sold per head.' using errcode = '22023'; end if;
      perform private.assert_sellable(v_b.id, p_sale_date);
      v_pop := private.batch_population(v_b.id);
      if v_qty > v_pop then
        raise exception 'Batch % has % recorded; you entered %.', v_b.code, v_pop, v_qty::integer using errcode = '23514';
      end if;
      insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity, weight_kg, is_estimate, reason, recorded_by)
      values (p_org, p_site, v_b.id, p_sale_date, 'sale', -(v_qty::integer), (v_line ->> 'weight_kg')::numeric,
        v_b.count_basis = 'estimated', 'Sale', auth.uid())
      returning id into v_event;
      insert into public.sale_lines (organization_id, site_id, sale_id, line_type, batch_id, description, quantity, unit_id,
        unit_price, weight_kg, batch_event_id, product_id, sales_order_line_id)
      values (p_org, p_site, v_sale, 'livestock', v_b.id,
        coalesce(v_desc, 'Live ' || lower(v_b.species) || ' from ' || v_b.code), v_qty, v_unit, v_price,
        (v_line ->> 'weight_kg')::numeric, v_event, v_product, v_order_line);
      perform private.log_system(p_org, p_site, p_sale_date, v_b.production_type, 'sale',
        'Sold ' || v_qty::integer || ' live from ' || v_b.code, p_batch => v_b.id, p_quantity => v_qty,
        p_unit => v_unit, p_batch_event => v_event, p_sale => v_sale);

    elsif v_type = 'other' then
      if v_desc is null then raise exception 'Describe each item sold.' using errcode = '22023'; end if;
      insert into public.sale_lines (organization_id, site_id, sale_id, line_type, description, quantity, unit_id, unit_price,
        product_id, sales_order_line_id)
      values (p_org, p_site, v_sale, 'other', v_desc, v_qty, v_unit, v_price, v_product, v_order_line);
    else
      raise exception 'Unknown sale line type.' using errcode = '22023';
    end if;
  end loop;

  return v_sale;
end;
$$;

-- Unpaid amounts may not take a customer past their credit limit.
create or replace function private.check_credit(p_customer uuid, p_new_unpaid numeric)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c public.customers;
  v_outstanding numeric;
begin
  if p_customer is null or coalesce(p_new_unpaid, 0) <= 0 then return; end if;
  select * into v_c from public.customers where id = p_customer;
  if v_c.credit_limit is null then return; end if;
  select coalesce(sum(private.sale_total(s.id) - private.sale_received(s.id)), 0) into v_outstanding
  from public.sales s where s.customer_id = p_customer and s.status = 'posted';
  if v_outstanding > v_c.credit_limit then
    raise exception '% would owe % against a credit limit of %. Take payment now or raise the limit.',
      v_c.name, to_char(v_outstanding, 'FM999,999,999,990.00'), to_char(v_c.credit_limit, 'FM999,999,999,990.00') using errcode = 'P0001';
  end if;
end;
$$;

-- Direct sale (record and fulfil in one step), now with an optional customer and due date.
drop function public.record_sale(uuid, uuid, uuid, date, jsonb, numeric, text, text, text, text, text);

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
  p_notes text default null,
  p_customer uuid default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_sale uuid;
  v_total numeric;
  v_txns uuid[] := '{}';
  v_inv text;
begin
  v_prev := private.idem_begin(p_org, p_key, 'record_sale');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, p_site, 'sales.record');
  perform private.require_date(p_sale_date);
  if coalesce(p_amount_received, 0) < 0 then
    raise exception 'Amount received cannot be negative.' using errcode = '22023';
  end if;

  v_sale := private.create_sale(p_org, p_site, p_sale_date, p_lines, p_customer, p_customer_name, p_customer_phone, p_due_date, null, p_notes);
  v_total := private.sale_total(v_sale);
  if coalesce(p_amount_received, 0) > v_total then
    raise exception 'Amount received (%) is more than the sale total (%).', p_amount_received, v_total using errcode = '22023';
  end if;
  if coalesce(p_amount_received, 0) > 0 then
    if p_payment_method is null then raise exception 'Choose how the money was received.' using errcode = '22023'; end if;
    v_txns := private.post_sale_income(v_sale, p_amount_received, p_sale_date, p_payment_method, p_reference);
  end if;
  perform private.check_credit(p_customer, v_total - coalesce(p_amount_received, 0));

  select invoice_number into v_inv from public.sales where id = v_sale;
  perform private.log_system(p_org, p_site, p_sale_date, 'general', 'sale',
    'Invoice ' || v_inv || coalesce(' to ' || (select coalesce(c.name, s.customer_name) from public.sales s left join public.customers c on c.id = s.customer_id where s.id = v_sale), '')
      || ': total ' || to_char(v_total, 'FM999,999,999,990.00'), p_sale => v_sale);

  return private.idem_finish(p_org, p_key, 'record_sale', jsonb_build_object(
    'sale_id', v_sale, 'invoice_number', v_inv, 'total', v_total, 'received', coalesce(p_amount_received, 0),
    'finance_transaction_ids', to_jsonb(v_txns)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales order RPCs
-- ---------------------------------------------------------------------------
create or replace function private.customer_price(p_customer uuid, p_product uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select unit_price from public.customer_prices where customer_id = p_customer and product_id = p_product),
    (select default_price from public.products where id = p_product));
$$;

-- p_lines: [{ "product_id", "quantity", "unit_id"?, "unit_price"?, "description"? }]
create or replace function public.create_sales_order(
  p_key uuid,
  p_org uuid,
  p_site uuid,
  p_customer uuid,
  p_order_date date,
  p_lines jsonb,
  p_required_by date default null,
  p_notes text default null,
  p_confirm boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_order uuid;
  v_number text;
  v_line jsonb;
  v_p public.products;
  v_unit uuid;
  v_unit_row public.units;
  v_qty numeric;
  v_price numeric;
begin
  v_prev := private.idem_begin(p_org, p_key, 'create_sales_order');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, p_site, 'sales.record');
  perform private.require_date(p_order_date);
  if not exists (select 1 from public.customers where id = p_customer and organization_id = p_org and status = 'active') then
    raise exception 'Choose an active customer.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.farm_sites where id = p_site and organization_id = p_org and status = 'active') then
    raise exception 'Farm site not found or archived.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one product to the order.' using errcode = '22023';
  end if;

  v_number := private.next_number(p_org, 'sales_order', 'SO-');
  insert into public.sales_orders (organization_id, site_id, order_number, customer_id, order_date, required_by, status, notes)
  values (p_org, p_site, v_number, p_customer, p_order_date, p_required_by,
    case when coalesce(p_confirm, true) then 'confirmed' else 'draft' end, nullif(trim(p_notes), ''))
  returning id into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_p from public.products where id = (v_line ->> 'product_id')::uuid and organization_id = p_org and is_active;
    if not found then raise exception 'Choose an active product for each line.' using errcode = '22023'; end if;
    v_qty := (v_line ->> 'quantity')::numeric;
    perform private.require_positive(v_qty, 'Quantity');
    v_unit := coalesce(nullif(v_line ->> 'unit_id', '')::uuid, v_p.unit_id);
    v_unit_row := private.assert_unit(p_org, v_unit);
    if v_unit_row.dimension <> (select dimension from public.units where id = v_p.unit_id) then
      raise exception '% is sold in % units.', v_p.name, (select dimension from public.units where id = v_p.unit_id) using errcode = '22023';
    end if;
    if v_p.source_kind = 'livestock' and v_qty <> round(v_qty) then
      raise exception 'Live animals are ordered in whole numbers.' using errcode = '22023';
    end if;
    v_price := coalesce(nullif(v_line ->> 'unit_price', '')::numeric,
      private.customer_price(p_customer, v_p.id) * (v_unit_row.to_base / (select to_base from public.units where id = v_p.unit_id)));
    if v_price < 0 then raise exception 'Enter a price of zero or more.' using errcode = '22023'; end if;
    insert into public.sales_order_lines (organization_id, site_id, sales_order_id, product_id, description, quantity, unit_id, unit_price)
    values (p_org, p_site, v_order, v_p.id, coalesce(nullif(trim(v_line ->> 'description'), ''), v_p.name), v_qty, v_unit, round(v_price, 2));
  end loop;

  perform private.audit(p_org, p_site, 'sales_order.created', 'sales_orders', v_order, 'Sales order ' || v_number);
  return private.idem_finish(p_org, p_key, 'create_sales_order', jsonb_build_object('sales_order_id', v_order, 'order_number', v_number));
end;
$$;

create or replace function public.set_sales_order_status(p_order uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sales_orders;
begin
  select * into v from public.sales_orders where id = p_order for update;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then
    raise exception 'Sales order not found.' using errcode = 'P0002';
  end if;
  perform private.require(v.organization_id, v.site_id, 'sales.record');
  if v.status = 'cancelled' then raise exception 'This order is already cancelled.' using errcode = 'P0001'; end if;
  if p_status = 'confirmed' then
    if v.status <> 'draft' then raise exception 'Only a draft order can be confirmed.' using errcode = 'P0001'; end if;
  elsif p_status = 'cancelled' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to cancel an order.' using errcode = '22023'; end if;
  else
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  update public.sales_orders set status = p_status, cancel_reason = case when p_status = 'cancelled' then trim(p_reason) end where id = p_order;
end;
$$;

-- Ordered vs fulfilled per order line, in the order line's unit, counting only posted invoices.
create or replace function private.order_line_fulfilled(p_line uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(sl.quantity * su.to_base / ou.to_base), 0)
  from public.sale_lines sl
  join public.sales s on s.id = sl.sale_id and s.status = 'posted'
  join public.units su on su.id = sl.unit_id
  join public.sales_order_lines ol on ol.id = sl.sales_order_line_id
  join public.units ou on ou.id = ol.unit_id
  where sl.sales_order_line_id = p_line;
$$;

-- Fulfil some or all of an order. Produce is taken from the oldest available
-- matching records on the order's site; live animals from the batch chosen.
-- p_lines: [{ "order_line_id", "quantity", "batch_id"? }]
create or replace function public.fulfil_sales_order(
  p_key uuid,
  p_order uuid,
  p_fulfil_date date,
  p_lines jsonb,
  p_amount_received numeric default 0,
  p_payment_method text default null,
  p_reference text default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.sales_orders;
  v_prev jsonb;
  v_req jsonb;
  v_ol public.sales_order_lines;
  v_p public.products;
  v_lu public.units;
  v_qty numeric;
  v_remaining numeric;
  v_need numeric;
  v_take numeric;
  v_rec record;
  v_sale_lines jsonb := '[]'::jsonb;
  v_sale uuid;
  v_total numeric;
  v_txns uuid[] := '{}';
  v_inv text;
begin
  select * into v_o from public.sales_orders where id = p_order;
  if not found or not public.has_site_access(v_o.organization_id, v_o.site_id) then
    raise exception 'Sales order not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_o.organization_id, p_key, 'fulfil_sales_order');
  if v_prev is not null then return v_prev; end if;
  select * into v_o from public.sales_orders where id = p_order for update;
  perform private.require(v_o.organization_id, v_o.site_id, 'sales.record');
  perform private.require_date(p_fulfil_date);
  if v_o.status <> 'confirmed' then raise exception 'Only a confirmed order can be fulfilled.' using errcode = 'P0001'; end if;
  if p_fulfil_date < v_o.order_date then raise exception 'The fulfilment date is before the order date.' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose at least one line to fulfil.' using errcode = '22023';
  end if;

  for v_req in select * from jsonb_array_elements(p_lines) loop
    select * into v_ol from public.sales_order_lines where id = (v_req ->> 'order_line_id')::uuid and sales_order_id = p_order;
    if not found then raise exception 'Order line not found.' using errcode = 'P0002'; end if;
    v_qty := (v_req ->> 'quantity')::numeric;
    if v_qty is null or v_qty = 0 then continue; end if;
    perform private.require_positive(v_qty, 'Quantity');
    v_remaining := v_ol.quantity - private.order_line_fulfilled(v_ol.id);
    if round(v_qty, 4) > round(v_remaining, 4) then
      raise exception 'Only % remains to fulfil on "%".', trim(to_char(v_remaining, 'FM999999990.####')), v_ol.description using errcode = '23514';
    end if;
    select * into v_p from public.products where id = v_ol.product_id;
    select * into v_lu from public.units where id = v_ol.unit_id;

    if v_p.source_kind = 'produce' then
      v_need := v_qty;
      for v_rec in
        select r.id, r.available_quantity, r.unit_to_base
        from public.production_record_balances r
        where r.organization_id = v_o.organization_id and r.site_id = v_o.site_id and r.status = 'posted'
          and lower(r.product) = lower(v_p.match_name) and r.unit_dimension = v_lu.dimension
          and r.available_quantity > 0 and r.record_date <= p_fulfil_date
        order by r.record_date, r.created_at
      loop
        exit when v_need <= 0;
        -- available converted into the order line unit
        v_take := least(v_need, floor(v_rec.available_quantity * v_rec.unit_to_base / v_lu.to_base * 10000) / 10000);
        continue when v_take <= 0;
        v_sale_lines := v_sale_lines || jsonb_build_object('line_type', 'produce', 'production_record_id', v_rec.id,
          'quantity', v_take, 'unit_id', v_ol.unit_id, 'unit_price', v_ol.unit_price, 'description', v_ol.description,
          'product_id', v_p.id, 'sales_order_line_id', v_ol.id);
        v_need := round(v_need - v_take, 4);
      end loop;
      if v_need > 0 then
        raise exception 'Not enough % available on this site: % % short.', v_p.name,
          trim(to_char(v_need, 'FM999999990.####')), v_lu.symbol using errcode = '23514';
      end if;
    elsif v_p.source_kind = 'livestock' then
      if nullif(v_req ->> 'batch_id', '') is null then
        raise exception 'Choose the batch the % come from.', lower(v_p.name) using errcode = '22023';
      end if;
      if not exists (select 1 from public.batches where id = (v_req ->> 'batch_id')::uuid and site_id = v_o.site_id
                     and lower(species) = lower(v_p.match_name)) then
        raise exception 'The batch must be % on this site.', v_p.match_name using errcode = '22023';
      end if;
      v_sale_lines := v_sale_lines || jsonb_build_object('line_type', 'livestock', 'batch_id', v_req ->> 'batch_id',
        'quantity', v_qty, 'unit_id', v_ol.unit_id, 'unit_price', v_ol.unit_price, 'description', v_ol.description,
        'product_id', v_p.id, 'sales_order_line_id', v_ol.id);
    else
      v_sale_lines := v_sale_lines || jsonb_build_object('line_type', 'other', 'quantity', v_qty, 'unit_id', v_ol.unit_id,
        'unit_price', v_ol.unit_price, 'description', v_ol.description, 'product_id', v_p.id, 'sales_order_line_id', v_ol.id);
    end if;
  end loop;

  if jsonb_array_length(v_sale_lines) = 0 then
    raise exception 'Enter a quantity for at least one line.' using errcode = '22023';
  end if;

  v_sale := private.create_sale(v_o.organization_id, v_o.site_id, p_fulfil_date, v_sale_lines, v_o.customer_id, null, null,
    p_due_date, p_order, null);
  v_total := private.sale_total(v_sale);
  if coalesce(p_amount_received, 0) < 0 or coalesce(p_amount_received, 0) > v_total then
    raise exception 'Amount received must be between zero and the invoice total (%).', v_total using errcode = '22023';
  end if;
  if coalesce(p_amount_received, 0) > 0 then
    if p_payment_method is null then raise exception 'Choose how the money was received.' using errcode = '22023'; end if;
    v_txns := private.post_sale_income(v_sale, p_amount_received, p_fulfil_date, p_payment_method, p_reference);
  end if;
  perform private.check_credit(v_o.customer_id, v_total - coalesce(p_amount_received, 0));

  select invoice_number into v_inv from public.sales where id = v_sale;
  perform private.log_system(v_o.organization_id, v_o.site_id, p_fulfil_date, 'general', 'sale',
    'Invoice ' || v_inv || ' for order ' || v_o.order_number || ' to ' || (select name from public.customers where id = v_o.customer_id)
      || ': total ' || to_char(v_total, 'FM999,999,999,990.00'), p_sale => v_sale);

  return private.idem_finish(v_o.organization_id, p_key, 'fulfil_sales_order', jsonb_build_object(
    'sale_id', v_sale, 'invoice_number', v_inv, 'total', v_total, 'received', coalesce(p_amount_received, 0)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
drop view public.sale_summaries;

create view public.sale_summaries with (security_invoker = true) as
select
  s.*,
  fs.name as site_name,
  coalesce(c.name, s.customer_name) as customer_display_name,
  so.order_number,
  coalesce(l.total, 0) as total_amount,
  coalesce(l.line_count, 0) as line_count,
  coalesce(p.received, 0) as amount_received,
  case when s.status = 'voided' then 0 else coalesce(l.total, 0) - coalesce(p.received, 0) end as amount_outstanding,
  (s.status = 'posted' and s.due_date is not null and s.due_date < public.org_today(s.organization_id)
     and coalesce(l.total, 0) - coalesce(p.received, 0) > 0) as is_overdue
from public.sales s
join public.farm_sites fs on fs.id = s.site_id
left join public.customers c on c.id = s.customer_id
left join public.sales_orders so on so.id = s.sales_order_id
left join lateral (select sum(line_total) as total, count(*) as line_count from public.sale_lines sl where sl.sale_id = s.id) l on true
left join lateral (select sum(amount) as received from public.finance_transactions ft where ft.sale_id = s.id and ft.kind = 'income') p on true;

create view public.customer_balances with (security_invoker = true) as
select
  c.*,
  coalesce(b.invoices, 0)::integer as invoice_count,
  coalesce(b.invoiced, 0) as total_invoiced,
  coalesce(b.received, 0) as total_received,
  coalesce(b.invoiced, 0) - coalesce(b.received, 0) as balance_outstanding,
  coalesce(b.overdue, 0) as overdue_amount,
  b.last_sale_date
from public.customers c
left join lateral (
  select count(*) as invoices, sum(ss.total_amount) as invoiced, sum(ss.amount_received) as received,
    sum(ss.amount_outstanding) filter (where ss.is_overdue) as overdue, max(ss.sale_date) as last_sale_date
  from public.sale_summaries ss where ss.customer_id = c.id and ss.status = 'posted'
) b on true;

create view public.product_availability with (security_invoker = true) as
select
  p.id as product_id,
  p.organization_id,
  fs.id as site_id,
  fs.name as site_name,
  case p.source_kind
    when 'produce' then (
      select round(coalesce(sum(r.available_quantity * r.unit_to_base / u.to_base), 0), 4)
      from public.production_record_balances r
      where r.organization_id = p.organization_id and r.site_id = fs.id and r.status = 'posted'
        and lower(r.product) = lower(p.match_name) and r.unit_dimension = u.dimension and r.available_quantity > 0)
    when 'livestock' then (
      select coalesce(sum(b.current_population), 0)
      from public.batch_summaries b
      where b.site_id = fs.id and b.status = 'active' and lower(b.species) = lower(p.match_name))
  end as available_quantity
from public.products p
join public.units u on u.id = p.unit_id
join public.farm_sites fs on fs.organization_id = p.organization_id and fs.status = 'active';

create view public.sales_order_line_progress with (security_invoker = true) as
select
  ol.*,
  u.symbol as unit_symbol,
  p.source_kind,
  p.match_name,
  private_fulfilled.qty as fulfilled_quantity,
  greatest(ol.quantity - private_fulfilled.qty, 0) as remaining_quantity
from public.sales_order_lines ol
join public.units u on u.id = ol.unit_id
join public.products p on p.id = ol.product_id
left join lateral (
  select coalesce(sum(sl.quantity * su.to_base / u.to_base), 0) as qty
  from public.sale_lines sl
  join public.sales s on s.id = sl.sale_id and s.status = 'posted'
  join public.units su on su.id = sl.unit_id
  where sl.sales_order_line_id = ol.id
) private_fulfilled on true;

create view public.sales_order_summaries with (security_invoker = true) as
select
  o.*,
  c.name as customer_name,
  fs.name as site_name,
  coalesce(t.total, 0) as order_total,
  coalesce(t.fulfilled_value, 0) as fulfilled_value,
  coalesce(t.lines, 0)::integer as line_count,
  case
    when o.status = 'cancelled' then 'cancelled'
    when o.status = 'draft' then 'draft'
    when coalesce(t.remaining_lines, 0) = 0 and coalesce(t.lines, 0) > 0 then 'fulfilled'
    when coalesce(t.fulfilled_value, 0) > 0 then 'partially_fulfilled'
    else 'open'
  end as fulfilment_status
from public.sales_orders o
join public.customers c on c.id = o.customer_id
join public.farm_sites fs on fs.id = o.site_id
left join lateral (
  select sum(lp.line_total) as total,
    sum(round(least(lp.fulfilled_quantity, lp.quantity) * lp.unit_price, 2)) as fulfilled_value,
    count(*) as lines,
    count(*) filter (where lp.remaining_quantity > 0.00005) as remaining_lines
  from public.sales_order_line_progress lp where lp.sales_order_id = o.id
) t on true;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.customers         enable row level security;
alter table public.products          enable row level security;
alter table public.customer_prices   enable row level security;
alter table public.sales_orders      enable row level security;
alter table public.sales_order_lines enable row level security;

create or replace function public.can_see_sales(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(p_org, 'sales.record') or public.has_permission(p_org, 'finance.view')
      or public.has_permission(p_org, 'customers.manage');
$$;

create policy customers_select on public.customers for select to authenticated using (public.can_see_sales(organization_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.has_permission(organization_id, 'customers.manage'));
create policy customers_update on public.customers for update to authenticated
  using (public.has_permission(organization_id, 'customers.manage')) with check (public.has_permission(organization_id, 'customers.manage'));

create policy products_select on public.products for select to authenticated using (public.is_org_member(organization_id));
create policy products_insert on public.products for insert to authenticated with check (public.has_permission(organization_id, 'products.manage'));
create policy products_update on public.products for update to authenticated
  using (public.has_permission(organization_id, 'products.manage')) with check (public.has_permission(organization_id, 'products.manage'));

create policy customer_prices_select on public.customer_prices for select to authenticated using (public.can_see_sales(organization_id));
create policy customer_prices_write on public.customer_prices for all to authenticated
  using (public.has_permission(organization_id, 'customers.manage')) with check (public.has_permission(organization_id, 'customers.manage'));

create policy sales_orders_select on public.sales_orders for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_sales(organization_id));
create policy sales_order_lines_select on public.sales_order_lines for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_sales(organization_id));

revoke all on public.customers, public.products, public.customer_prices, public.sales_orders, public.sales_order_lines from anon, authenticated;
grant select on public.customers, public.products, public.customer_prices, public.sales_orders, public.sales_order_lines to authenticated;
grant insert (organization_id, code, name, category, contact_person, phone, email, address, city, credit_limit, payment_terms_days, notes)
  on public.customers to authenticated;
grant update (code, name, category, contact_person, phone, email, address, city, credit_limit, payment_terms_days, status, notes)
  on public.customers to authenticated;
grant insert (organization_id, name, sku, production_type, source_kind, match_name, unit_id, default_price, description)
  on public.products to authenticated;
grant update (name, sku, production_type, match_name, unit_id, default_price, is_active, description) on public.products to authenticated;
grant insert (organization_id, customer_id, product_id, unit_price), update (unit_price), delete on public.customer_prices to authenticated;

grant select on public.sale_summaries, public.customer_balances, public.product_availability,
  public.sales_order_line_progress, public.sales_order_summaries to authenticated;
revoke all on public.sale_summaries, public.customer_balances, public.product_availability,
  public.sales_order_line_progress, public.sales_order_summaries from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.record_sale(uuid, uuid, uuid, date, jsonb, numeric, text, text, text, text, text, uuid, date),
  public.create_sales_order(uuid, uuid, uuid, uuid, date, jsonb, date, text, boolean),
  public.set_sales_order_status(uuid, text, text),
  public.fulfil_sales_order(uuid, uuid, date, jsonb, numeric, text, text, date),
  public.can_see_sales(uuid)
  to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
