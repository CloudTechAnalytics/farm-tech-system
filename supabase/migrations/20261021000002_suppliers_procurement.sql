-- ============================================================================
-- Release 2 · 0002 Suppliers and procurement: purchase requests, purchase
-- orders, goods received notes, supplier bills and bill payments.
--
-- Goods received enter stock through `inventory_movements` (type purchase, at
-- the PO price) and record no expense. The expense is recorded only when a
-- supplier bill is paid, as a `finance_transactions` expense linked to the
-- bill, so a purchase can never be counted twice.
-- ============================================================================

insert into public.permissions (key, area, label, description, sort_order) values
  ('suppliers.manage',    'Procurement', 'Manage suppliers',        'Add and edit suppliers and their details', 50),
  ('procurement.request', 'Procurement', 'Request purchases',       'Raise purchase requests for approval', 51),
  ('procurement.approve', 'Procurement', 'Approve and order',       'Approve purchase requests and issue purchase orders', 52)
on conflict (key) do nothing;

select private.grant_permission_to_templates('suppliers.manage', array['owner', 'manager', 'accountant']);
select private.grant_permission_to_templates('procurement.request', array['owner', 'manager']);
select private.grant_permission_to_templates('procurement.approve', array['owner']);

create or replace function public.can_see_procurement(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(p_org, 'suppliers.manage') or public.has_permission(p_org, 'procurement.request')
      or public.has_permission(p_org, 'procurement.approve') or public.has_permission(p_org, 'inventory.manage')
      or public.has_permission(p_org, 'finance.view');
$$;

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  code                text check (code is null or code ~ '^[A-Za-z0-9-]{1,20}$'),
  name                text not null check (length(trim(name)) between 2 and 160),
  category            text not null default 'other'
                        check (category in ('feed', 'livestock', 'seed', 'agrochemical', 'veterinary', 'equipment', 'fuel', 'services', 'other')),
  contact_person      text check (contact_person is null or length(contact_person) <= 120),
  phone               text check (phone is null or length(phone) <= 40),
  email               extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address             text check (address is null or length(address) <= 300),
  city                text check (city is null or length(city) <= 80),
  bank_name           text check (bank_name is null or length(bank_name) <= 80),
  bank_account        text check (bank_account is null or length(bank_account) <= 40),
  payment_terms_days  integer not null default 0 check (payment_terms_days between 0 and 365),
  status              text not null default 'active' check (status in ('active', 'inactive')),
  notes               text check (notes is null or length(notes) <= 2000),
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code)
);

create index idx_suppliers_org_name on public.suppliers (organization_id, lower(name));
create trigger trg_suppliers_updated_at before update on public.suppliers
  for each row execute function private.set_updated_at();
create trigger trg_audit_suppliers after insert or update on public.suppliers
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Purchase requests
-- ---------------------------------------------------------------------------
create table public.purchase_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  request_number   text not null,
  needed_by        date,
  reason           text not null check (length(trim(reason)) between 2 and 500),
  status           text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'ordered', 'cancelled')),
  requested_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  decided_by       uuid references public.profiles (id) on delete set null,
  decided_at       timestamptz,
  decision_note    text check (decision_note is null or length(decision_note) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (organization_id, request_number),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id)
);

create trigger trg_purchase_requests_updated_at before update on public.purchase_requests
  for each row execute function private.set_updated_at();
create trigger trg_audit_purchase_requests after update on public.purchase_requests
  for each row execute function private.audit_row_change();

create table public.purchase_request_lines (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  site_id              uuid not null,
  purchase_request_id  uuid not null,
  item_id              uuid,
  description          text not null check (length(trim(description)) between 2 and 160),
  quantity             numeric(18, 4) not null check (quantity > 0),
  unit_id              uuid not null references public.units (id),
  estimated_unit_cost  numeric(14, 2) check (estimated_unit_cost is null or estimated_unit_cost >= 0),
  created_at           timestamptz not null default now(),
  foreign key (purchase_request_id, site_id) references public.purchase_requests (id, site_id) on delete cascade,
  foreign key (item_id, organization_id) references public.inventory_items (id, organization_id)
);

create index idx_pr_lines_request on public.purchase_request_lines (purchase_request_id);

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
create table public.purchase_orders (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  site_id              uuid not null,
  po_number            text not null,
  supplier_id          uuid not null,
  store_id             uuid not null,
  purchase_request_id  uuid,
  order_date           date not null,
  expected_date        date,
  status               text not null default 'issued' check (status in ('draft', 'issued', 'closed', 'cancelled')),
  notes                text check (notes is null or length(notes) <= 1000),
  status_reason        text,
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (organization_id, po_number),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (store_id, site_id) references public.stores (id, site_id),
  foreign key (purchase_request_id, site_id) references public.purchase_requests (id, site_id),
  check (expected_date is null or expected_date >= order_date)
);

create index idx_po_org_date on public.purchase_orders (organization_id, order_date desc);
create trigger trg_purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function private.set_updated_at();
create trigger trg_audit_purchase_orders after update on public.purchase_orders
  for each row execute function private.audit_row_change();

create table public.purchase_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  site_id            uuid not null,
  purchase_order_id  uuid not null,
  item_id            uuid,
  description        text not null check (length(trim(description)) between 2 and 160),
  quantity           numeric(18, 4) not null check (quantity > 0),
  unit_id            uuid not null references public.units (id),
  unit_price         numeric(14, 2) not null check (unit_price >= 0),
  line_total         numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at         timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, purchase_order_id),
  foreign key (purchase_order_id, site_id) references public.purchase_orders (id, site_id) on delete cascade,
  foreign key (item_id, organization_id) references public.inventory_items (id, organization_id)
);

create index idx_po_lines_order on public.purchase_order_lines (purchase_order_id);

-- ---------------------------------------------------------------------------
-- Goods received notes
-- ---------------------------------------------------------------------------
create table public.goods_receipts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  site_id            uuid not null,
  grn_number         text not null,
  purchase_order_id  uuid not null,
  store_id           uuid not null,
  received_date      date not null,
  delivery_reference text check (delivery_reference is null or length(delivery_reference) <= 80),
  notes              text check (notes is null or length(notes) <= 1000),
  status             text not null default 'posted' check (status in ('posted', 'voided')),
  void_reason        text,
  voided_at          timestamptz,
  received_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, site_id),
  unique (organization_id, grn_number),
  foreign key (purchase_order_id, site_id) references public.purchase_orders (id, site_id),
  foreign key (store_id, site_id) references public.stores (id, site_id),
  check ((status = 'voided') = (voided_at is not null))
);

create index idx_grn_po on public.goods_receipts (purchase_order_id);

create table public.goods_receipt_lines (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  site_id                 uuid not null,
  goods_receipt_id        uuid not null,
  purchase_order_id       uuid not null,
  purchase_order_line_id  uuid not null,
  quantity_received       numeric(18, 4) not null check (quantity_received >= 0),
  quantity_rejected       numeric(18, 4) not null default 0 check (quantity_rejected >= 0),
  rejection_reason        text check (rejection_reason is null or length(rejection_reason) <= 300),
  inventory_movement_id   uuid unique,
  created_at              timestamptz not null default now(),
  foreign key (goods_receipt_id, site_id) references public.goods_receipts (id, site_id) on delete cascade,
  foreign key (purchase_order_line_id, purchase_order_id) references public.purchase_order_lines (id, purchase_order_id),
  foreign key (inventory_movement_id, organization_id) references public.inventory_movements (id, organization_id),
  check (quantity_received > 0 or quantity_rejected > 0)
);

create index idx_grn_lines_po_line on public.goods_receipt_lines (purchase_order_line_id);

-- Stock from a goods received note is corrected by voiding the note, which
-- keeps the order's received quantities right.
create or replace function private.guard_receipt_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grn text;
begin
  if new.reverses_movement_id is null or current_setting('harvest.voiding_receipt', true) = 'on' then
    return new;
  end if;
  select g.grn_number into v_grn from public.goods_receipt_lines l join public.goods_receipts g on g.id = l.goods_receipt_id
  where l.inventory_movement_id = new.reverses_movement_id;
  if found then
    raise exception 'This stock was received on %. Void the goods received note instead.', v_grn using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_guard_receipt_reversal before insert on public.inventory_movements
  for each row execute function private.guard_receipt_reversal();

-- ---------------------------------------------------------------------------
-- Supplier bills and payments
-- ---------------------------------------------------------------------------
create table public.supplier_bills (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  site_id            uuid,
  supplier_id        uuid not null,
  purchase_order_id  uuid,
  bill_number        text not null check (length(trim(bill_number)) between 1 and 60),
  bill_date          date not null,
  due_date           date,
  amount             numeric(14, 2) not null check (amount > 0),
  category_id        uuid not null,
  description        text not null check (length(trim(description)) between 2 and 300),
  status             text not null default 'posted' check (status in ('posted', 'voided')),
  void_reason        text,
  voided_at          timestamptz,
  recorded_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (purchase_order_id, organization_id) references public.purchase_orders (id, organization_id),
  foreign key (category_id, organization_id) references public.categories (id, organization_id),
  check (due_date is null or due_date >= bill_date),
  check ((status = 'voided') = (voided_at is not null))
);

-- The same supplier invoice cannot be entered twice.
create unique index supplier_bills_number_unique on public.supplier_bills (supplier_id, lower(trim(bill_number))) where status = 'posted';
create index idx_supplier_bills_org on public.supplier_bills (organization_id, bill_date desc);

alter table public.finance_transactions
  add column supplier_bill_id uuid,
  add constraint finance_supplier_bill_fk foreign key (supplier_bill_id, organization_id) references public.supplier_bills (id, organization_id);
create index idx_finance_supplier_bill on public.finance_transactions (supplier_bill_id) where supplier_bill_id is not null;

-- Paid on a bill: payments not reversed. A reversed payment and its reversal row both drop out.
create or replace function private.bill_paid(p_bill uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.finance_transactions
  where supplier_bill_id = p_bill and status = 'posted' and reverses_id is null;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- p_lines: [{ "item_id"?, "description"?, "quantity", "unit_id", "estimated_unit_cost"? }]
create or replace function public.create_purchase_request(
  p_key uuid, p_org uuid, p_site uuid, p_reason text, p_lines jsonb, p_needed_by date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_id uuid;
  v_number text;
  v_line jsonb;
  v_item public.inventory_items;
  v_unit uuid;
begin
  v_prev := private.idem_begin(p_org, p_key, 'create_purchase_request');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, p_site, 'procurement.request');
  if coalesce(trim(p_reason), '') = '' then raise exception 'Say why the purchase is needed.' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the request.' using errcode = '22023';
  end if;
  v_number := private.next_number(p_org, 'purchase_request', 'PR-');
  insert into public.purchase_requests (organization_id, site_id, request_number, needed_by, reason)
  values (p_org, p_site, v_number, p_needed_by, trim(p_reason))
  returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := null;
    if nullif(v_line ->> 'item_id', '') is not null then
      select * into v_item from public.inventory_items where id = (v_line ->> 'item_id')::uuid and organization_id = p_org;
      if not found then raise exception 'Inventory item not found.' using errcode = 'P0002'; end if;
    end if;
    v_unit := coalesce(nullif(v_line ->> 'unit_id', '')::uuid, v_item.base_unit_id);
    perform private.assert_unit(p_org, v_unit);
    if v_item.id is not null then perform private.item_factor(p_org, v_item, v_unit); end if;
    perform private.require_positive((v_line ->> 'quantity')::numeric, 'Quantity');
    insert into public.purchase_request_lines (organization_id, site_id, purchase_request_id, item_id, description, quantity, unit_id, estimated_unit_cost)
    values (p_org, p_site, v_id, v_item.id, coalesce(nullif(trim(v_line ->> 'description'), ''), v_item.name),
      (v_line ->> 'quantity')::numeric, v_unit, nullif(v_line ->> 'estimated_unit_cost', '')::numeric);
  end loop;
  perform private.audit(p_org, p_site, 'purchase_request.created', 'purchase_requests', v_id, 'Purchase request ' || v_number);
  return private.idem_finish(p_org, p_key, 'create_purchase_request', jsonb_build_object('purchase_request_id', v_id, 'request_number', v_number));
end;
$$;

create or replace function public.decide_purchase_request(p_request uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.purchase_requests;
begin
  select * into v from public.purchase_requests where id = p_request for update;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then
    raise exception 'Purchase request not found.' using errcode = 'P0002';
  end if;
  if p_decision = 'cancelled' then
    -- The requester may withdraw their own request; approvers may cancel any.
    if v.requested_by is distinct from auth.uid() then perform private.require(v.organization_id, v.site_id, 'procurement.approve'); end if;
    if v.status not in ('submitted', 'approved') then raise exception 'This request can no longer be cancelled.' using errcode = 'P0001'; end if;
  elsif p_decision in ('approved', 'rejected') then
    perform private.require(v.organization_id, v.site_id, 'procurement.approve');
    if v.status <> 'submitted' then raise exception 'This request has already been decided.' using errcode = 'P0001'; end if;
    if p_decision = 'rejected' and coalesce(trim(p_note), '') = '' then
      raise exception 'Give a reason for rejecting the request.' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  update public.purchase_requests
  set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_request;
end;
$$;

-- p_lines: [{ "item_id"?, "description"?, "quantity", "unit_id"?, "unit_price" }]
create or replace function public.create_purchase_order(
  p_key uuid, p_org uuid, p_site uuid, p_supplier uuid, p_store uuid, p_order_date date, p_lines jsonb,
  p_expected_date date default null, p_request uuid default null, p_notes text default null, p_issue boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_id uuid;
  v_number text;
  v_line jsonb;
  v_item public.inventory_items;
  v_unit uuid;
  v_req public.purchase_requests;
begin
  v_prev := private.idem_begin(p_org, p_key, 'create_purchase_order');
  if v_prev is not null then return v_prev; end if;
  perform private.require(p_org, p_site, 'procurement.approve');
  perform private.require_date(p_order_date);
  if not exists (select 1 from public.suppliers where id = p_supplier and organization_id = p_org and status = 'active') then
    raise exception 'Choose an active supplier.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.stores where id = p_store and site_id = p_site and status = 'active') then
    raise exception 'Choose an active store on this site to receive the goods.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the order.' using errcode = '22023';
  end if;
  if p_request is not null then
    select * into v_req from public.purchase_requests where id = p_request and site_id = p_site for update;
    if not found then raise exception 'Purchase request not found on this site.' using errcode = 'P0002'; end if;
    if v_req.status <> 'approved' then raise exception 'Only an approved request can be ordered.' using errcode = 'P0001'; end if;
  end if;

  v_number := private.next_number(p_org, 'purchase_order', 'PO-');
  insert into public.purchase_orders (organization_id, site_id, po_number, supplier_id, store_id, purchase_request_id, order_date, expected_date, status, notes)
  values (p_org, p_site, v_number, p_supplier, p_store, p_request, p_order_date, p_expected_date,
    case when coalesce(p_issue, true) then 'issued' else 'draft' end, nullif(trim(p_notes), ''))
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := null;
    if nullif(v_line ->> 'item_id', '') is not null then
      select * into v_item from public.inventory_items where id = (v_line ->> 'item_id')::uuid and organization_id = p_org;
      if not found then raise exception 'Inventory item not found.' using errcode = 'P0002'; end if;
    elsif coalesce(trim(v_line ->> 'description'), '') = '' then
      raise exception 'Describe each line that is not a stock item.' using errcode = '22023';
    end if;
    v_unit := coalesce(nullif(v_line ->> 'unit_id', '')::uuid, v_item.base_unit_id);
    perform private.assert_unit(p_org, v_unit);
    if v_item.id is not null then perform private.item_factor(p_org, v_item, v_unit); end if;
    perform private.require_positive((v_line ->> 'quantity')::numeric, 'Quantity');
    if coalesce((v_line ->> 'unit_price')::numeric, -1) < 0 then raise exception 'Enter a price for each line.' using errcode = '22023'; end if;
    insert into public.purchase_order_lines (organization_id, site_id, purchase_order_id, item_id, description, quantity, unit_id, unit_price)
    values (p_org, p_site, v_id, v_item.id, coalesce(nullif(trim(v_line ->> 'description'), ''), v_item.name),
      (v_line ->> 'quantity')::numeric, v_unit, round((v_line ->> 'unit_price')::numeric, 2));
  end loop;

  if p_request is not null then update public.purchase_requests set status = 'ordered' where id = p_request; end if;
  perform private.audit(p_org, p_site, 'purchase_order.created', 'purchase_orders', v_id, 'Purchase order ' || v_number);
  return private.idem_finish(p_org, p_key, 'create_purchase_order', jsonb_build_object('purchase_order_id', v_id, 'po_number', v_number));
end;
$$;

-- Received on a PO line, in the line's unit, from posted receipts.
create or replace function private.po_line_received(p_line uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.quantity_received), 0)
  from public.goods_receipt_lines l join public.goods_receipts g on g.id = l.goods_receipt_id and g.status = 'posted'
  where l.purchase_order_line_id = p_line;
$$;

create or replace function public.set_purchase_order_status(p_order uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.purchase_orders;
begin
  select * into v from public.purchase_orders where id = p_order for update;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then
    raise exception 'Purchase order not found.' using errcode = 'P0002';
  end if;
  perform private.require(v.organization_id, v.site_id, 'procurement.approve');
  if v.status in ('cancelled', 'closed') then raise exception 'This order is already %.', v.status using errcode = 'P0001'; end if;
  if p_status = 'issued' then
    if v.status <> 'draft' then raise exception 'Only a draft order can be issued.' using errcode = 'P0001'; end if;
  elsif p_status = 'cancelled' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to cancel an order.' using errcode = '22023'; end if;
    if exists (select 1 from public.goods_receipts where purchase_order_id = p_order and status = 'posted') then
      raise exception 'Goods have been received on this order. Close it instead.' using errcode = 'P0001';
    end if;
  elsif p_status = 'closed' then
    -- Closing stops further receipts on an order the supplier will not complete.
    if v.status <> 'issued' then raise exception 'Only an issued order can be closed.' using errcode = 'P0001'; end if;
  else
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  update public.purchase_orders set status = p_status, status_reason = nullif(trim(p_reason), '') where id = p_order;
  if p_status = 'cancelled' and v.purchase_request_id is not null then
    update public.purchase_requests set status = 'approved' where id = v.purchase_request_id and status = 'ordered';
  end if;
end;
$$;

-- p_lines: [{ "order_line_id", "quantity_received", "quantity_rejected"?, "rejection_reason"? }]
create or replace function public.receive_purchase_order(
  p_key uuid, p_order uuid, p_received_date date, p_lines jsonb,
  p_store uuid default null, p_delivery_reference text default null, p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
  v_prev jsonb;
  v_grn uuid;
  v_number text;
  v_req jsonb;
  v_ol public.purchase_order_lines;
  v_item public.inventory_items;
  v_store public.stores;
  v_recv numeric;
  v_rej numeric;
  v_factor numeric;
  v_base numeric;
  v_move uuid;
  v_supplier text;
  v_count integer := 0;
begin
  select * into v_po from public.purchase_orders where id = p_order;
  if not found or not public.has_site_access(v_po.organization_id, v_po.site_id) then
    raise exception 'Purchase order not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_po.organization_id, p_key, 'receive_purchase_order');
  if v_prev is not null then return v_prev; end if;
  select * into v_po from public.purchase_orders where id = p_order for update;
  v_store := private.get_store(coalesce(p_store, v_po.store_id), 'inventory.manage');
  if v_store.site_id <> v_po.site_id then raise exception 'Goods must be received into a store on the order''s site.' using errcode = '22023'; end if;
  perform private.require_date(p_received_date);
  if v_po.status <> 'issued' then raise exception 'Only an issued order can be received (this one is %).', v_po.status using errcode = 'P0001'; end if;
  if p_received_date < v_po.order_date then raise exception 'The receipt date is before the order date.' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Enter what was received.' using errcode = '22023';
  end if;
  select name into v_supplier from public.suppliers where id = v_po.supplier_id;

  v_number := private.next_number(v_po.organization_id, 'goods_receipt', 'GRN-');
  insert into public.goods_receipts (organization_id, site_id, grn_number, purchase_order_id, store_id, received_date, delivery_reference, notes)
  values (v_po.organization_id, v_po.site_id, v_number, p_order, v_store.id, p_received_date,
    nullif(trim(p_delivery_reference), ''), nullif(trim(p_notes), ''))
  returning id into v_grn;

  for v_req in select * from jsonb_array_elements(p_lines) loop
    select * into v_ol from public.purchase_order_lines where id = (v_req ->> 'order_line_id')::uuid and purchase_order_id = p_order;
    if not found then raise exception 'Order line not found.' using errcode = 'P0002'; end if;
    v_recv := coalesce(nullif(v_req ->> 'quantity_received', '')::numeric, 0);
    v_rej := coalesce(nullif(v_req ->> 'quantity_rejected', '')::numeric, 0);
    if v_recv < 0 or v_rej < 0 then raise exception 'Quantities cannot be negative.' using errcode = '22023'; end if;
    continue when v_recv = 0 and v_rej = 0;
    if v_rej > 0 and coalesce(trim(v_req ->> 'rejection_reason'), '') = '' then
      raise exception 'Say why goods on "%" were rejected.', v_ol.description using errcode = '22023';
    end if;
    -- Quantity verification: accepted goods may not exceed what is still outstanding on the order.
    if round(v_recv + private.po_line_received(v_ol.id), 4) > v_ol.quantity then
      raise exception 'Only % remains to receive on "%"; you entered %.',
        trim(to_char(v_ol.quantity - private.po_line_received(v_ol.id), 'FM999999990.####')), v_ol.description,
        trim(to_char(v_recv, 'FM999999990.####')) using errcode = '23514';
    end if;
    v_move := null;
    if v_ol.item_id is not null and v_recv > 0 then
      v_item := private.lock_item(v_ol.item_id, v_po.organization_id);
      v_factor := private.item_factor(v_po.organization_id, v_item, v_ol.unit_id);
      v_base := round(v_recv * v_factor, 4);
      v_move := private.insert_movement(v_po.organization_id, v_po.site_id, v_store.id, v_item.id, 'purchase', p_received_date,
        v_base, v_recv, v_ol.unit_id, v_factor,
        p_unit_cost => round(v_ol.unit_price / v_factor, 4), p_total_cost => round(v_recv * v_ol.unit_price, 2),
        p_supplier => left(v_supplier, 120), p_reference => v_po.po_number || ' / ' || v_number);
      perform private.log_system(v_po.organization_id, v_po.site_id, p_received_date, coalesce(v_item.production_type, 'general'),
        'stock_received', 'Received ' || v_item.name || ': ' || trim(to_char(v_recv, 'FM999999990.####')) || ' '
          || (select symbol from public.units where id = v_ol.unit_id) || ' on ' || v_po.po_number || ' from ' || v_supplier,
        p_quantity => v_recv, p_unit => v_ol.unit_id, p_movement => v_move);
    end if;
    insert into public.goods_receipt_lines (organization_id, site_id, goods_receipt_id, purchase_order_id, purchase_order_line_id,
      quantity_received, quantity_rejected, rejection_reason, inventory_movement_id)
    values (v_po.organization_id, v_po.site_id, v_grn, p_order, v_ol.id, v_recv, v_rej, nullif(trim(v_req ->> 'rejection_reason'), ''), v_move);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Enter a quantity for at least one line.' using errcode = '22023'; end if;
  perform private.audit(v_po.organization_id, v_po.site_id, 'goods_receipt.created', 'goods_receipts', v_grn,
    'Goods received ' || v_number || ' on ' || v_po.po_number);
  return private.idem_finish(v_po.organization_id, p_key, 'receive_purchase_order', jsonb_build_object('goods_receipt_id', v_grn, 'grn_number', v_number));
end;
$$;

create or replace function public.void_goods_receipt(p_key uuid, p_receipt uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.goods_receipts;
  v_prev jsonb;
  v_m public.inventory_movements;
begin
  select * into v_g from public.goods_receipts where id = p_receipt;
  if not found or not public.has_site_access(v_g.organization_id, v_g.site_id) then
    raise exception 'Goods received note not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_g.organization_id, p_key, 'void_goods_receipt');
  if v_prev is not null then return v_prev; end if;
  select * into v_g from public.goods_receipts where id = p_receipt for update;
  perform private.require(v_g.organization_id, v_g.site_id, 'inventory.manage');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to void a receipt.' using errcode = '22023'; end if;
  if v_g.status = 'voided' then raise exception 'This receipt is already voided.' using errcode = 'P0001'; end if;

  perform set_config('harvest.voiding_receipt', 'on', true);
  for v_m in
    select m.* from public.inventory_movements m join public.goods_receipt_lines l on l.inventory_movement_id = m.id
    where l.goods_receipt_id = p_receipt
  loop
    perform private.lock_item(v_m.item_id, v_m.organization_id);
    -- The stock balance trigger refuses this if the goods have already been used.
    perform private.insert_movement(v_m.organization_id, v_m.site_id, v_m.store_id, v_m.item_id, 'reversal', current_date,
      -v_m.quantity, v_m.entered_quantity, v_m.entered_unit_id, v_m.conversion_factor,
      p_reason => 'Void ' || v_g.grn_number || ': ' || trim(p_reason), p_reverses => v_m.id);
    update public.activity_logs set voided_at = now(), void_reason = 'Receipt voided: ' || trim(p_reason)
    where inventory_movement_id = v_m.id and voided_at is null;
  end loop;
  perform set_config('harvest.voiding_receipt', 'off', true);

  update public.goods_receipts set status = 'voided', voided_at = now(), void_reason = trim(p_reason) where id = p_receipt;
  perform private.audit(v_g.organization_id, v_g.site_id, 'goods_receipt.voided', 'goods_receipts', p_receipt, trim(p_reason));
  return private.idem_finish(v_g.organization_id, p_key, 'void_goods_receipt', jsonb_build_object('goods_receipt_id', p_receipt));
end;
$$;

create or replace function public.record_supplier_bill(
  p_key uuid, p_org uuid, p_supplier uuid, p_bill_number text, p_bill_date date, p_amount numeric, p_description text,
  p_due_date date default null, p_site uuid default null, p_order uuid default null, p_category uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_s public.suppliers;
  v_po public.purchase_orders;
  v_site uuid := p_site;
  v_cat uuid := p_category;
  v_id uuid;
  v_po_total numeric;
  v_billed numeric;
begin
  v_prev := private.idem_begin(p_org, p_key, 'record_supplier_bill');
  if v_prev is not null then return v_prev; end if;
  select * into v_s from public.suppliers where id = p_supplier and organization_id = p_org;
  if not found then raise exception 'Supplier not found.' using errcode = 'P0002'; end if;
  if p_order is not null then
    select * into v_po from public.purchase_orders where id = p_order and organization_id = p_org for update;
    if not found then raise exception 'Purchase order not found.' using errcode = 'P0002'; end if;
    if v_po.supplier_id <> p_supplier then raise exception 'That purchase order is with a different supplier.' using errcode = '22023'; end if;
    if v_po.status in ('draft', 'cancelled') then raise exception 'Bills can only be recorded against issued orders.' using errcode = 'P0001'; end if;
    v_site := v_po.site_id;
  end if;
  perform private.require(p_org, v_site, 'finance.record');
  perform private.require_date(p_bill_date);
  perform private.require_positive(p_amount, 'Amount');
  if coalesce(trim(p_bill_number), '') = '' then raise exception 'Enter the supplier''s invoice number.' using errcode = '22023'; end if;
  if p_due_date is not null and p_due_date < p_bill_date then raise exception 'The due date cannot be before the bill date.' using errcode = '22023'; end if;
  if exists (select 1 from public.supplier_bills where supplier_id = p_supplier and status = 'posted'
             and lower(trim(bill_number)) = lower(trim(p_bill_number))) then
    raise exception 'Invoice % from % has already been recorded.', trim(p_bill_number), v_s.name using errcode = '23505';
  end if;
  if v_po.id is not null then
    select coalesce(sum(line_total), 0) into v_po_total from public.purchase_order_lines where purchase_order_id = p_order;
    select coalesce(sum(amount), 0) into v_billed from public.supplier_bills where purchase_order_id = p_order and status = 'posted';
    if v_billed + p_amount > v_po_total then
      raise exception 'Bills on % would total % against an order value of %.', v_po.po_number,
        to_char(v_billed + p_amount, 'FM999,999,999,990.00'), to_char(v_po_total, 'FM999,999,999,990.00') using errcode = '23514';
    end if;
  end if;
  if v_cat is null then
    v_cat := private.category_id(p_org, 'expense', case
      when v_po.id is not null and not exists (select 1 from public.purchase_order_lines l join public.inventory_items i on i.id = l.item_id
                                               where l.purchase_order_id = p_order and not i.is_feed)
           and exists (select 1 from public.purchase_order_lines where purchase_order_id = p_order and item_id is not null) then 'feed'
      else 'inventory_purchase' end);
  elsif not exists (select 1 from public.categories where id = v_cat and organization_id = p_org and kind = 'expense') then
    raise exception 'Choose an expense category.' using errcode = '22023';
  end if;

  insert into public.supplier_bills (organization_id, site_id, supplier_id, purchase_order_id, bill_number, bill_date, due_date, amount, category_id, description)
  values (p_org, v_site, p_supplier, p_order, trim(p_bill_number), p_bill_date,
    coalesce(p_due_date, p_bill_date + v_s.payment_terms_days), round(p_amount, 2), v_cat, trim(p_description))
  returning id into v_id;
  perform private.audit(p_org, v_site, 'supplier_bill.created', 'supplier_bills', v_id, 'Bill ' || trim(p_bill_number) || ' from ' || v_s.name);
  return private.idem_finish(p_org, p_key, 'record_supplier_bill', jsonb_build_object('supplier_bill_id', v_id));
end;
$$;

create or replace function public.pay_supplier_bill(
  p_key uuid, p_bill uuid, p_amount numeric, p_payment_date date, p_payment_method text, p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.supplier_bills;
  v_prev jsonb;
  v_outstanding numeric;
  v_supplier text;
  v_txn uuid;
begin
  select * into v_b from public.supplier_bills where id = p_bill;
  if not found or not public.has_site_access(v_b.organization_id, v_b.site_id) then
    raise exception 'Bill not found.' using errcode = 'P0002';
  end if;
  v_prev := private.idem_begin(v_b.organization_id, p_key, 'pay_supplier_bill');
  if v_prev is not null then return v_prev; end if;
  select * into v_b from public.supplier_bills where id = p_bill for update;
  perform private.require(v_b.organization_id, v_b.site_id, 'finance.record');
  perform private.require_date(p_payment_date);
  perform private.require_positive(p_amount, 'Amount');
  if v_b.status <> 'posted' then raise exception 'This bill has been voided.' using errcode = 'P0001'; end if;
  if p_payment_method is null then raise exception 'Choose how the bill was paid.' using errcode = '22023'; end if;
  if p_payment_date < v_b.bill_date then raise exception 'The payment date is before the bill date.' using errcode = '22023'; end if;
  v_outstanding := v_b.amount - private.bill_paid(p_bill);
  if round(p_amount, 2) > v_outstanding then
    raise exception 'Only % is outstanding on this bill.', to_char(v_outstanding, 'FM999,999,999,990.00') using errcode = '23514';
  end if;
  select name into v_supplier from public.suppliers where id = v_b.supplier_id;
  insert into public.finance_transactions (organization_id, site_id, txn_date, kind, category_id, amount, currency, payment_method,
    description, reference, counterparty, production_type, supplier_bill_id, recorded_by)
  values (v_b.organization_id, v_b.site_id, p_payment_date, 'expense', v_b.category_id, round(p_amount, 2),
    (select currency from public.organizations where id = v_b.organization_id), p_payment_method,
    left('Bill ' || v_b.bill_number || ': ' || v_b.description, 300), nullif(trim(p_reference), ''), left(v_supplier, 120), 'general', p_bill, auth.uid())
  returning id into v_txn;
  perform private.log_system(v_b.organization_id, v_b.site_id, p_payment_date, 'general', 'payment',
    'Paid ' || v_supplier || ' ' || to_char(p_amount, 'FM999,999,999,990.00') || ' on bill ' || v_b.bill_number, p_finance => v_txn);
  return private.idem_finish(v_b.organization_id, p_key, 'pay_supplier_bill', jsonb_build_object(
    'finance_transaction_id', v_txn, 'outstanding', v_outstanding - round(p_amount, 2)));
end;
$$;

create or replace function public.void_supplier_bill(p_bill uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.supplier_bills;
begin
  select * into v from public.supplier_bills where id = p_bill for update;
  if not found or not public.has_site_access(v.organization_id, v.site_id) then
    raise exception 'Bill not found.' using errcode = 'P0002';
  end if;
  perform private.require(v.organization_id, v.site_id, 'finance.reverse');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to void a bill.' using errcode = '22023'; end if;
  if v.status = 'voided' then raise exception 'This bill is already voided.' using errcode = 'P0001'; end if;
  if private.bill_paid(p_bill) > 0 then
    raise exception 'Payments have been made on this bill. Reverse them in Income & expenses first.' using errcode = 'P0001';
  end if;
  update public.supplier_bills set status = 'voided', voided_at = now(), void_reason = trim(p_reason) where id = p_bill;
  perform private.audit(v.organization_id, v.site_id, 'supplier_bill.voided', 'supplier_bills', p_bill, trim(p_reason));
end;
$$;

-- The activity category used for bill payments, for new and existing organizations.
insert into private.default_categories (kind, code, name, production_type, sort_order)
values ('activity', 'payment', 'Supplier payment', 'general', 95);

insert into public.categories (organization_id, kind, code, name, production_type, is_system, sort_order)
select o.id, 'activity', 'payment', 'Supplier payment', 'general', true, 95
from public.organizations o
where not exists (select 1 from public.categories c where c.organization_id = o.id and c.kind = 'activity' and c.code = 'payment');

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view public.purchase_order_line_progress with (security_invoker = true) as
select
  l.*,
  u.symbol as unit_symbol,
  i.name as item_name,
  coalesce(r.received, 0) as received_quantity,
  coalesce(r.rejected, 0) as rejected_quantity,
  greatest(l.quantity - coalesce(r.received, 0), 0) as remaining_quantity
from public.purchase_order_lines l
join public.units u on u.id = l.unit_id
left join public.inventory_items i on i.id = l.item_id
left join lateral (
  select sum(gl.quantity_received) as received, sum(gl.quantity_rejected) as rejected
  from public.goods_receipt_lines gl join public.goods_receipts g on g.id = gl.goods_receipt_id and g.status = 'posted'
  where gl.purchase_order_line_id = l.id
) r on true;

create view public.purchase_order_summaries with (security_invoker = true) as
select
  po.*,
  s.name as supplier_name,
  fs.name as site_name,
  st.name as store_name,
  pr.request_number,
  coalesce(t.total, 0) as order_total,
  coalesce(t.received_value, 0) as received_value,
  coalesce(t.lines, 0)::integer as line_count,
  coalesce(b.billed, 0) as billed_amount,
  coalesce(b.paid, 0) as paid_amount,
  case
    when po.status in ('draft', 'cancelled') then po.status
    when coalesce(t.remaining_lines, 0) = 0 and coalesce(t.lines, 0) > 0 then 'received'
    when po.status = 'closed' then 'closed'
    when coalesce(t.received_value, 0) > 0 then 'partially_received'
    else 'awaiting'
  end as receipt_status
from public.purchase_orders po
join public.suppliers s on s.id = po.supplier_id
join public.farm_sites fs on fs.id = po.site_id
join public.stores st on st.id = po.store_id
left join public.purchase_requests pr on pr.id = po.purchase_request_id
left join lateral (
  select sum(lp.line_total) as total,
    sum(round(least(lp.received_quantity, lp.quantity) * lp.unit_price, 2)) as received_value,
    count(*) as lines,
    count(*) filter (where lp.remaining_quantity > 0.00005) as remaining_lines
  from public.purchase_order_line_progress lp where lp.purchase_order_id = po.id
) t on true
left join lateral (
  select sum(sb.amount) as billed, sum(private_paid.paid) as paid
  from public.supplier_bills sb
  cross join lateral (select coalesce(sum(ft.amount), 0) as paid from public.finance_transactions ft
                      where ft.supplier_bill_id = sb.id and ft.status = 'posted' and ft.reverses_id is null) private_paid
  where sb.purchase_order_id = po.id and sb.status = 'posted'
) b on true;

create view public.supplier_bill_summaries with (security_invoker = true) as
select
  sb.*,
  s.name as supplier_name,
  c.name as category_name,
  po.po_number,
  coalesce(p.paid, 0) as amount_paid,
  case when sb.status = 'voided' then 0 else sb.amount - coalesce(p.paid, 0) end as amount_outstanding,
  (sb.status = 'posted' and sb.due_date is not null and sb.due_date < public.org_today(sb.organization_id)
     and sb.amount - coalesce(p.paid, 0) > 0) as is_overdue
from public.supplier_bills sb
join public.suppliers s on s.id = sb.supplier_id
join public.categories c on c.id = sb.category_id
left join public.purchase_orders po on po.id = sb.purchase_order_id
left join lateral (
  select sum(ft.amount) as paid from public.finance_transactions ft
  where ft.supplier_bill_id = sb.id and ft.status = 'posted' and ft.reverses_id is null
) p on true;

create view public.supplier_balances with (security_invoker = true) as
select
  s.*,
  coalesce(b.bills, 0)::integer as bill_count,
  coalesce(b.billed, 0) as total_billed,
  coalesce(b.paid, 0) as total_paid,
  coalesce(b.billed, 0) - coalesce(b.paid, 0) as balance_outstanding,
  coalesce(b.overdue, 0) as overdue_amount,
  coalesce(o.open_orders, 0)::integer as open_orders,
  greatest(b.last_bill, o.last_order) as last_activity_date
from public.suppliers s
left join lateral (
  select count(*) as bills, sum(bs.amount) as billed, sum(bs.amount_paid) as paid,
    sum(bs.amount_outstanding) filter (where bs.is_overdue) as overdue, max(bs.bill_date) as last_bill
  from public.supplier_bill_summaries bs where bs.supplier_id = s.id and bs.status = 'posted'
) b on true
left join lateral (
  select count(*) filter (where po.status = 'issued') as open_orders, max(po.order_date) as last_order
  from public.purchase_orders po where po.supplier_id = s.id
) o on true;

create view public.purchase_request_summaries with (security_invoker = true) as
select
  pr.*,
  fs.name as site_name,
  coalesce(rp.full_name, rp.email::text) as requested_by_name,
  coalesce(dp.full_name, dp.email::text) as decided_by_name,
  coalesce(l.lines, 0)::integer as line_count,
  coalesce(l.estimate, 0) as estimated_total,
  po.id as purchase_order_id,
  po.po_number
from public.purchase_requests pr
join public.farm_sites fs on fs.id = pr.site_id
left join public.profiles rp on rp.id = pr.requested_by
left join public.profiles dp on dp.id = pr.decided_by
left join lateral (
  select count(*) as lines, sum(round(quantity * coalesce(estimated_unit_cost, 0), 2)) as estimate
  from public.purchase_request_lines where purchase_request_id = pr.id
) l on true
left join lateral (
  select id, po_number from public.purchase_orders where purchase_request_id = pr.id and status <> 'cancelled' order by created_at desc limit 1
) po on true;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.suppliers              enable row level security;
alter table public.purchase_requests      enable row level security;
alter table public.purchase_request_lines enable row level security;
alter table public.purchase_orders        enable row level security;
alter table public.purchase_order_lines   enable row level security;
alter table public.goods_receipts         enable row level security;
alter table public.goods_receipt_lines    enable row level security;
alter table public.supplier_bills         enable row level security;

create policy suppliers_select on public.suppliers for select to authenticated using (public.can_see_procurement(organization_id));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.has_permission(organization_id, 'suppliers.manage'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_permission(organization_id, 'suppliers.manage')) with check (public.has_permission(organization_id, 'suppliers.manage'));

create policy purchase_requests_select on public.purchase_requests for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_procurement(organization_id));
create policy purchase_request_lines_select on public.purchase_request_lines for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_procurement(organization_id));
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_procurement(organization_id));
create policy purchase_order_lines_select on public.purchase_order_lines for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_procurement(organization_id));
create policy goods_receipts_select on public.goods_receipts for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_procurement(organization_id));
create policy goods_receipt_lines_select on public.goods_receipt_lines for select to authenticated
  using (public.has_site_access(organization_id, site_id) and public.can_see_procurement(organization_id));
create policy supplier_bills_select on public.supplier_bills for select to authenticated
  using (public.has_site_access(organization_id, site_id)
         and (public.has_permission(organization_id, 'finance.view') or public.has_permission(organization_id, 'suppliers.manage')
              or public.has_permission(organization_id, 'procurement.approve')));

revoke all on public.suppliers, public.purchase_requests, public.purchase_request_lines, public.purchase_orders,
  public.purchase_order_lines, public.goods_receipts, public.goods_receipt_lines, public.supplier_bills from anon, authenticated;
grant select on public.suppliers, public.purchase_requests, public.purchase_request_lines, public.purchase_orders,
  public.purchase_order_lines, public.goods_receipts, public.goods_receipt_lines, public.supplier_bills to authenticated;
grant insert (organization_id, code, name, category, contact_person, phone, email, address, city, bank_name, bank_account, payment_terms_days, notes)
  on public.suppliers to authenticated;
grant update (code, name, category, contact_person, phone, email, address, city, bank_name, bank_account, payment_terms_days, status, notes)
  on public.suppliers to authenticated;

grant select on public.purchase_order_line_progress, public.purchase_order_summaries, public.supplier_bill_summaries,
  public.supplier_balances, public.purchase_request_summaries to authenticated;
revoke all on public.purchase_order_line_progress, public.purchase_order_summaries, public.supplier_bill_summaries,
  public.supplier_balances, public.purchase_request_summaries from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.can_see_procurement(uuid),
  public.create_purchase_request(uuid, uuid, uuid, text, jsonb, date),
  public.decide_purchase_request(uuid, text, text),
  public.create_purchase_order(uuid, uuid, uuid, uuid, uuid, date, jsonb, date, uuid, text, boolean),
  public.set_purchase_order_status(uuid, text, text),
  public.receive_purchase_order(uuid, uuid, date, jsonb, uuid, text, text),
  public.void_goods_receipt(uuid, uuid, text),
  public.record_supplier_bill(uuid, uuid, uuid, text, date, numeric, text, date, uuid, uuid, uuid),
  public.pay_supplier_bill(uuid, uuid, numeric, date, text, text),
  public.void_supplier_bill(uuid, text)
  to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
