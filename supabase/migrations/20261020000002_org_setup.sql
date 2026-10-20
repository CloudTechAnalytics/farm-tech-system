-- ============================================================================
-- 0002 Organization setup: units, categories, production units, alert
-- settings, and the RPCs that create organizations, sites, invitations and
-- manage members and role permissions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Units of measure. System units have organization_id NULL. Conversion is
-- explicit: quantity_in_base = quantity * to_base, within one dimension only.
-- Base units: count = each, mass = kg, volume = litre, area = m2, length = m.
-- ---------------------------------------------------------------------------
create table public.units (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations (id) on delete cascade,
  code             text not null check (code ~ '^[a-z0-9_]{1,24}$'),
  name             text not null check (length(trim(name)) between 1 and 60),
  symbol           text not null check (length(symbol) between 1 and 16),
  dimension        text not null check (dimension in ('count', 'mass', 'volume', 'area', 'length')),
  to_base          numeric(20, 10) not null check (to_base > 0),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create unique index units_code_unique on public.units (organization_id, code) nulls not distinct;

insert into public.units (code, name, symbol, dimension, to_base) values
  ('each',     'Each',                 'pcs',   'count',  1),
  ('dozen',    'Dozen',                'doz',   'count',  12),
  ('crate30',  'Crate (30)',           'crate', 'count',  30),
  ('kg',       'Kilogram',             'kg',    'mass',   1),
  ('g',        'Gram',                 'g',     'mass',   0.001),
  ('tonne',    'Tonne',                't',     'mass',   1000),
  ('bag25',    'Bag (25 kg)',          'bag',   'mass',   25),
  ('bag50',    'Bag (50 kg)',          'bag',   'mass',   50),
  ('l',        'Litre',                'L',     'volume', 1),
  ('ml',       'Millilitre',           'mL',    'volume', 0.001),
  ('m2',       'Square metre',         'm²',    'area',   1),
  ('ha',       'Hectare',              'ha',    'area',   10000),
  ('acre',     'Acre',                 'ac',    'area',   4046.8564224),
  ('plot_ng',  'Plot (50 ft × 100 ft)', 'plot', 'area',   464.5152),
  ('m',        'Metre',                'm',     'length', 1);

-- A unit is usable by an organization if it is a system unit or its own.
create or replace function private.assert_unit(p_org uuid, p_unit uuid)
returns public.units
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit public.units;
begin
  select * into v_unit from public.units
  where id = p_unit and (organization_id is null or organization_id = p_org) and is_active;
  if not found then
    raise exception 'Unit of measure not found.' using errcode = 'P0002';
  end if;
  return v_unit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories: one table, four kinds. Seeded per organization with stable
-- codes that the operational RPCs rely on; names are editable.
-- ---------------------------------------------------------------------------
create table public.categories (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  kind             text not null check (kind in ('activity', 'inventory', 'income', 'expense')),
  code             text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name             text not null check (length(trim(name)) between 2 and 80),
  production_type  text check (production_type in ('poultry', 'fish', 'crop', 'general')),
  is_system        boolean not null default false,
  is_active        boolean not null default true,
  sort_order       integer not null default 100,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, kind, code)
);

create trigger trg_categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger trg_audit_categories after insert or update or delete on public.categories
  for each row execute function private.audit_row_change();

-- System codes cannot be changed or deleted, only renamed or deactivated.
create or replace function private.protect_system_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deleting the whole organization cascades here; that is allowed.
  if tg_op = 'DELETE' and old.is_system
     and exists (select 1 from public.organizations o where o.id = old.organization_id) then
    raise exception 'Built-in categories cannot be deleted. Deactivate it instead.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.code <> old.code or new.kind <> old.kind or new.is_system <> old.is_system
     or new.organization_id <> old.organization_id) then
    raise exception 'Category code and kind cannot be changed.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_protect_system_category before update or delete on public.categories
  for each row execute function private.protect_system_category();

create table private.default_categories (
  kind             text not null,
  code             text not null,
  name             text not null,
  production_type  text,
  sort_order       integer not null,
  primary key (kind, code)
);

insert into private.default_categories (kind, code, name, production_type, sort_order) values
  -- Activities written by the system when an operation is recorded
  ('activity', 'stocking',              'Stocking / batch start',   'general', 10),
  ('activity', 'mortality',             'Mortality',                'general', 11),
  ('activity', 'cull',                  'Cull',                     'poultry', 12),
  ('activity', 'feed_issue',            'Feed issued',              'general', 13),
  ('activity', 'feed_consumption',      'Feed consumed',            'general', 14),
  ('activity', 'feed_return',           'Feed returned to store',   'general', 15),
  ('activity', 'feed_wastage',          'Feed wasted',              'general', 16),
  ('activity', 'egg_collection',        'Egg collection',           'poultry', 17),
  ('activity', 'sampling',              'Growth sampling',          'fish',    18),
  ('activity', 'harvest',               'Harvest',                  'general', 19),
  ('activity', 'transfer',              'Transfer',                 'general', 20),
  ('activity', 'sale',                  'Sale',                     'general', 21),
  ('activity', 'batch_close',           'Batch / cycle closed',     'general', 22),
  ('activity', 'input_application',     'Input applied',            'crop',    23),
  ('activity', 'population_adjustment', 'Population adjustment',    'general', 24),
  ('activity', 'stock_received',        'Stock received',           'general', 25),
  ('activity', 'stock_used',            'Stock used',               'general', 26),
  ('activity', 'stock_wastage',         'Stock wasted',             'general', 27),
  ('activity', 'stock_count',           'Stock count',              'general', 28),
  -- Activities users record by hand
  ('activity', 'vaccination',           'Vaccination',              'poultry', 40),
  ('activity', 'medication',            'Treatment / medication',   'general', 41),
  ('activity', 'weighing',              'Weighing',                 'general', 42),
  ('activity', 'water_quality',         'Water quality check',      'fish',    43),
  ('activity', 'land_preparation',      'Land preparation',         'crop',    44),
  ('activity', 'planting',              'Planting',                 'crop',    45),
  ('activity', 'irrigation',            'Irrigation',               'crop',    46),
  ('activity', 'fertilizer',            'Fertilizer application',   'crop',    47),
  ('activity', 'pesticide',             'Pesticide application',    'crop',    48),
  ('activity', 'weeding',               'Weeding',                  'crop',    49),
  ('activity', 'labour',                'Labour',                   'general', 50),
  ('activity', 'crop_loss',             'Crop loss',                'crop',    51),
  ('activity', 'field_observation',     'Field observation',        'crop',    52),
  ('activity', 'cleaning',              'Cleaning / sanitation',    'general', 53),
  ('activity', 'maintenance',           'Maintenance',              'general', 54),
  ('activity', 'other',                 'Other',                    'general', 99),
  -- Inventory item categories
  ('inventory', 'poultry_feed',   'Poultry feed',           'poultry', 10),
  ('inventory', 'fish_feed',      'Fish feed',              'fish',    11),
  ('inventory', 'seeds',          'Seeds and seedlings',    'crop',    12),
  ('inventory', 'fertilizer',     'Fertilizers',            'crop',    13),
  ('inventory', 'treatment',      'Approved treatment products', 'general', 14),
  ('inventory', 'packaging',      'Packaging materials',    'general', 15),
  ('inventory', 'equipment',      'Equipment and tools',    'general', 16),
  ('inventory', 'consumables',    'Consumables',            'general', 17),
  ('inventory', 'fuel',           'Fuel',                   'general', 18),
  ('inventory', 'other',          'Other',                  'general', 99),
  -- Income
  ('income', 'egg_sales',        'Egg sales',               'poultry', 10),
  ('income', 'bird_sales',       'Bird sales',              'poultry', 11),
  ('income', 'fish_sales',       'Fish sales',              'fish',    12),
  ('income', 'crop_sales',       'Crop sales',              'crop',    13),
  ('income', 'produce_sales',    'Other produce sales',     'general', 14),
  ('income', 'other_income',     'Other income',            'general', 99),
  -- Expenses
  ('expense', 'feed',            'Feed',                    'general', 10),
  ('expense', 'stock_purchase',  'Birds / fingerlings purchased', 'general', 11),
  ('expense', 'seeds',           'Seeds and seedlings',     'crop',    12),
  ('expense', 'fertilizer',      'Fertilizers',             'crop',    13),
  ('expense', 'agrochemicals',   'Pesticides and herbicides', 'crop',  14),
  ('expense', 'veterinary',      'Veterinary and treatment', 'general', 15),
  ('expense', 'labour',          'Labour',                  'general', 16),
  ('expense', 'transport',       'Transport',               'general', 17),
  ('expense', 'utilities',       'Utilities (power, water)', 'general', 18),
  ('expense', 'fuel',            'Fuel',                    'general', 19),
  ('expense', 'repairs',         'Repairs and maintenance', 'general', 20),
  ('expense', 'packaging',       'Packaging',               'general', 21),
  ('expense', 'equipment',       'Small equipment',         'general', 22),
  ('expense', 'rent',            'Land / rent',             'general', 23),
  ('expense', 'inventory_purchase', 'Other farm inputs',    'general', 24),
  ('expense', 'other_expense',   'Other expenses',          'general', 99);

create or replace function private.category_id(p_org uuid, p_kind text, p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.categories where organization_id = p_org and kind = p_kind and code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- Production units: houses, ponds, tanks, fields, plots
-- ---------------------------------------------------------------------------
create table public.production_units (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  production_type  text not null check (production_type in ('poultry', 'fish', 'crop')),
  kind             text not null check (kind in ('poultry_house', 'pen', 'cage', 'pond', 'tank', 'raceway', 'field', 'plot', 'greenhouse', 'other')),
  name             text not null check (length(trim(name)) between 1 and 80),
  capacity         numeric(14, 2) check (capacity is null or capacity > 0),
  capacity_note    text check (capacity_note is null or length(capacity_note) <= 80),
  area             numeric(14, 4) check (area is null or area > 0),
  area_unit_id     uuid references public.units (id),
  status           text not null default 'active' check (status in ('active', 'archived')),
  notes            text check (notes is null or length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (site_id, name),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id) on delete cascade,
  check ((production_type = 'poultry' and kind in ('poultry_house', 'pen', 'cage', 'other'))
      or (production_type = 'fish'    and kind in ('pond', 'tank', 'raceway', 'cage', 'other'))
      or (production_type = 'crop'    and kind in ('field', 'plot', 'greenhouse', 'other')))
);

create index idx_production_units_site on public.production_units (site_id);

create trigger trg_production_units_updated_at before update on public.production_units
  for each row execute function private.set_updated_at();
create trigger trg_audit_production_units after insert or update or delete on public.production_units
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Alert thresholds (one row per organization)
-- ---------------------------------------------------------------------------
create table public.alert_settings (
  organization_id                uuid primary key references public.organizations (id) on delete cascade,
  low_stock_enabled              boolean not null default true,
  poultry_daily_mortality_pct    numeric(5, 2) not null default 0.50 check (poultry_daily_mortality_pct > 0 and poultry_daily_mortality_pct <= 100),
  fish_daily_mortality_pct       numeric(5, 2) not null default 1.00 check (fish_daily_mortality_pct > 0 and fish_daily_mortality_pct <= 100),
  mortality_alerts_enabled       boolean not null default true,
  missing_records_enabled        boolean not null default true,
  missing_records_after_days     integer not null default 1 check (missing_records_after_days between 1 and 14),
  upcoming_activity_days         integer not null default 7 check (upcoming_activity_days between 1 and 60),
  updated_at                     timestamptz not null default now()
);

create trigger trg_alert_settings_updated_at before update on public.alert_settings
  for each row execute function private.set_updated_at();
create trigger trg_audit_alert_settings after update on public.alert_settings
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS and grants for this migration's tables
-- ---------------------------------------------------------------------------
alter table public.units            enable row level security;
alter table public.categories       enable row level security;
alter table public.production_units enable row level security;
alter table public.alert_settings   enable row level security;

create policy units_select on public.units for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));
create policy units_insert on public.units for insert to authenticated
  with check (organization_id is not null and public.has_permission(organization_id, 'settings.manage'));
create policy units_update on public.units for update to authenticated
  using (organization_id is not null and public.has_permission(organization_id, 'settings.manage'))
  with check (organization_id is not null and public.has_permission(organization_id, 'settings.manage'));

create policy categories_select on public.categories for select to authenticated
  using (public.is_org_member(organization_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (public.has_permission(organization_id, 'settings.manage') and not is_system);
create policy categories_update on public.categories for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage'))
  with check (public.has_permission(organization_id, 'settings.manage'));

create policy production_units_select on public.production_units for select to authenticated
  using (public.can(organization_id, site_id, 'operations.view'));
create policy production_units_insert on public.production_units for insert to authenticated
  with check (public.can(organization_id, site_id, 'settings.manage'));
create policy production_units_update on public.production_units for update to authenticated
  using (public.can(organization_id, site_id, 'settings.manage'))
  with check (public.can(organization_id, site_id, 'settings.manage'));

create policy alert_settings_select on public.alert_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy alert_settings_update on public.alert_settings for update to authenticated
  using (public.has_permission(organization_id, 'org.manage'))
  with check (public.has_permission(organization_id, 'org.manage'));

revoke all on public.units, public.categories, public.production_units, public.alert_settings from anon, authenticated;
grant select on public.units, public.categories, public.production_units, public.alert_settings to authenticated;
grant insert (organization_id, code, name, symbol, dimension, to_base) on public.units to authenticated;
grant update (name, symbol, is_active) on public.units to authenticated;
grant insert (organization_id, kind, code, name, production_type, sort_order) on public.categories to authenticated;
grant update (name, is_active, sort_order) on public.categories to authenticated;
grant insert (organization_id, site_id, production_type, kind, name, capacity, capacity_note, area, area_unit_id, notes)
  on public.production_units to authenticated;
grant update (name, kind, capacity, capacity_note, area, area_unit_id, status, notes) on public.production_units to authenticated;
grant update (low_stock_enabled, poultry_daily_mortality_pct, fish_daily_mortality_pct, mortality_alerts_enabled,
  missing_records_enabled, missing_records_after_days, upcoming_activity_days) on public.alert_settings to authenticated;

-- ============================================================================
-- Organization lifecycle RPCs
-- ============================================================================

create or replace function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g')), ''), 'farm');
$$;

-- Any signed-in user may create an organization (self-service signup) and
-- becomes its owner. Capped per user to limit abuse.
create or replace function public.create_organization(
  p_name text,
  p_country text default 'NG',
  p_currency text default 'NGN',
  p_timezone text default 'Africa/Lagos'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_slug text;
  v_owner_role uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if (select count(*) from public.organizations where created_by = v_uid) >= 3 then
    raise exception 'You have reached the limit of 3 organizations per account. Contact support to add more.' using errcode = 'P0001';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Enter a farm or business name of at least 2 characters.' using errcode = '22023';
  end if;

  v_slug := left(private.slugify(p_name), 40);
  if exists (select 1 from public.organizations where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  end if;

  -- Suppress per-row audit noise from seeding roles and categories.
  perform set_config('farmledger.bootstrapping', 'on', true);

  insert into public.organizations (name, slug, country, currency, timezone, created_by)
  values (trim(p_name), v_slug, upper(p_country), upper(p_currency), p_timezone, v_uid)
  returning id into v_org;

  insert into public.subscriptions (organization_id, plan_key, status, trial_ends_at)
  values (v_org, 'early_access', 'trialing', now() + interval '90 days');

  insert into public.roles (organization_id, template_key, name, description, rank, is_owner_role)
  select v_org, rt.key, rt.name, rt.description, rt.rank, rt.is_owner_role from public.role_templates rt;

  insert into public.role_permissions (role_id, organization_id, permission_key)
  select r.id, v_org, rtp.permission_key
  from public.roles r
  join public.role_template_permissions rtp on rtp.role_key = r.template_key
  where r.organization_id = v_org;

  select id into v_owner_role from public.roles where organization_id = v_org and is_owner_role;

  insert into public.memberships (organization_id, user_id, role_id, status, access_scope)
  values (v_org, v_uid, v_owner_role, 'active', 'organization');

  insert into public.categories (organization_id, kind, code, name, production_type, is_system, sort_order)
  select v_org, kind, code, name, production_type, true, sort_order from private.default_categories;

  insert into public.alert_settings (organization_id) values (v_org);

  perform set_config('farmledger.bootstrapping', 'off', true);
  perform private.audit(v_org, null, 'organization.created', 'organizations', v_org, 'Created organization ' || trim(p_name));
  return v_org;
end;
$$;

-- Sites are created through an RPC so plan limits apply and a default store
-- is created with the site (stores are added in 0004).
create or replace function public.create_site(
  p_org uuid,
  p_name text,
  p_code text default null,
  p_address text default null,
  p_state_region text default null,
  p_country text default 'NG',
  p_contact_name text default null,
  p_contact_phone text default null,
  p_size_hectares numeric default null,
  p_has_poultry boolean default false,
  p_has_fish boolean default false,
  p_has_crops boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid;
  v_limit integer;
begin
  perform private.require(p_org, null, 'sites.manage');
  if not public.has_site_access(p_org, null) then
    raise exception 'Only users with access to the whole organization can add farm sites.' using errcode = '42501';
  end if;

  select pl.max_sites into v_limit
  from public.subscriptions s join public.plans pl on pl.key = s.plan_key
  where s.organization_id = p_org;
  if v_limit is not null and (select count(*) from public.farm_sites where organization_id = p_org and status = 'active') >= v_limit then
    raise exception 'Your plan allows % active farm sites. Archive a site or upgrade your plan.', v_limit using errcode = 'P0001';
  end if;

  insert into public.farm_sites (organization_id, name, code, address, state_region, country, contact_name,
    contact_phone, size_hectares, has_poultry, has_fish, has_crops, notes)
  values (p_org, trim(p_name), nullif(trim(p_code), ''), nullif(trim(p_address), ''), nullif(trim(p_state_region), ''),
    upper(coalesce(p_country, 'NG')), nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''),
    p_size_hectares, coalesce(p_has_poultry, false), coalesce(p_has_fish, false), coalesce(p_has_crops, false),
    nullif(trim(p_notes), ''))
  returning id into v_site;

  return v_site;
end;
$$;

create or replace function public.set_site_status(p_site uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.farm_sites where id = p_site;
  if v_org is null then
    raise exception 'Farm site not found.' using errcode = 'P0002';
  end if;
  perform private.require(v_org, p_site, 'sites.manage');
  if p_status not in ('active', 'archived') then
    raise exception 'Unknown site status.' using errcode = '22023';
  end if;
  update public.farm_sites
  set status = p_status, archived_at = case when p_status = 'archived' then now() end
  where id = p_site;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations. The raw token is returned once and never stored.
-- ---------------------------------------------------------------------------
create or replace function private.assert_assignable_role(p_org uuid, p_role uuid)
returns public.roles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  select * into v_role from public.roles where id = p_role and organization_id = p_org;
  if not found then
    raise exception 'Role not found in this organization.' using errcode = 'P0002';
  end if;
  if v_role.is_owner_role and not public.is_org_owner(p_org) then
    raise exception 'Only a farm owner can grant the owner role.' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function private.assert_sites_in_org(p_org uuid, p_sites uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(coalesce(p_sites, '{}')) s(id)
    where not exists (select 1 from public.farm_sites f where f.id = s.id and f.organization_id = p_org)
  ) then
    raise exception 'One or more farm sites do not belong to this organization.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_invitation(
  p_org uuid,
  p_email text,
  p_role uuid,
  p_access_scope text default 'organization',
  p_site_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
  v_limit integer;
  v_email extensions.citext := lower(trim(p_email));
begin
  perform private.require(p_org, null, 'members.manage');
  v_role := private.assert_assignable_role(p_org, p_role);
  if p_access_scope not in ('organization', 'sites') then
    raise exception 'Choose whole organization or specific sites.' using errcode = '22023';
  end if;
  if v_role.is_owner_role and p_access_scope <> 'organization' then
    raise exception 'Farm owners always have access to every site.' using errcode = '22023';
  end if;
  if p_access_scope = 'sites' and coalesce(array_length(p_site_ids, 1), 0) = 0 then
    raise exception 'Select at least one farm site.' using errcode = '22023';
  end if;
  perform private.assert_sites_in_org(p_org, p_site_ids);

  if exists (select 1 from public.memberships m join public.profiles p on p.id = m.user_id
             where m.organization_id = p_org and p.email = v_email and m.status = 'active') then
    raise exception 'This person is already a member of the organization.' using errcode = '23505';
  end if;

  select pl.max_members into v_limit
  from public.subscriptions s join public.plans pl on pl.key = s.plan_key
  where s.organization_id = p_org;
  if v_limit is not null and (
      (select count(*) from public.memberships where organization_id = p_org and status = 'active')
    + (select count(*) from public.invitations where organization_id = p_org and status = 'pending' and expires_at > now())
  ) >= v_limit then
    raise exception 'Your plan allows % users. Remove a user or upgrade your plan.', v_limit using errcode = 'P0001';
  end if;

  -- Replace any older pending invitation to the same address.
  update public.invitations set status = 'revoked'
  where organization_id = p_org and email = v_email and status = 'pending';

  insert into public.invitations (organization_id, email, role_id, access_scope, site_ids, token_hash, invited_by)
  values (p_org, v_email, p_role, p_access_scope,
          case when p_access_scope = 'sites' then p_site_ids else '{}' end,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;

  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.invitations where id = p_invitation and status = 'pending';
  if v_org is null then
    raise exception 'Invitation not found or no longer pending.' using errcode = 'P0002';
  end if;
  perform private.require(v_org, null, 'members.manage');
  update public.invitations set status = 'revoked' where id = p_invitation;
end;
$$;

-- Shown on the accept page before the user commits. Reveals only the
-- organization name and role name, and only to the invited email address.
create or replace function public.get_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_email text := lower(auth.jwt() ->> 'email');
begin
  select * into v_inv from public.invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_inv.status <> 'pending' then
    return jsonb_build_object('status', v_inv.status);
  end if;
  if v_inv.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_email is distinct from lower(v_inv.email::text) then
    return jsonb_build_object('status', 'wrong_email');
  end if;
  return jsonb_build_object(
    'status', 'pending',
    'organization_name', (select name from public.organizations where id = v_inv.organization_id),
    'role_name', (select name from public.roles where id = v_inv.role_id),
    'expires_at', v_inv.expires_at
  );
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_membership uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'This invitation is no longer valid.' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'This invitation has expired. Ask the farm owner to send a new one.' using errcode = 'P0001';
  end if;
  if v_email is distinct from lower(v_inv.email::text) then
    raise exception 'This invitation was sent to a different email address.' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status, access_scope, invited_by, joined_at)
  values (v_inv.organization_id, v_uid, v_inv.role_id, 'active', v_inv.access_scope, v_inv.invited_by, now())
  on conflict (organization_id, user_id) do update
    set role_id = excluded.role_id, status = 'active', access_scope = excluded.access_scope,
        removed_at = null, joined_at = now()
  returning id into v_membership;

  delete from public.member_sites where membership_id = v_membership;
  insert into public.member_sites (membership_id, site_id, organization_id)
  select v_membership, s, v_inv.organization_id from unnest(v_inv.site_ids) s
  where exists (select 1 from public.farm_sites f where f.id = s and f.organization_id = v_inv.organization_id);

  update public.invitations set status = 'accepted', accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member management
-- ---------------------------------------------------------------------------
create or replace function private.active_owner_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.memberships m join public.roles r on r.id = m.role_id
  where m.organization_id = p_org and m.status = 'active' and r.is_owner_role;
$$;

create or replace function public.update_member_access(
  p_membership uuid,
  p_role uuid,
  p_access_scope text,
  p_site_ids uuid[] default '{}',
  p_job_title text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_old_role public.roles;
  v_new_role public.roles;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if not found then
    raise exception 'User not found in this organization.' using errcode = 'P0002';
  end if;
  perform private.require(v_m.organization_id, null, 'members.manage');
  select * into v_old_role from public.roles where id = v_m.role_id;
  v_new_role := private.assert_assignable_role(v_m.organization_id, p_role);

  if v_old_role.is_owner_role and not public.is_org_owner(v_m.organization_id) then
    raise exception 'Only a farm owner can change another owner''s access.' using errcode = '42501';
  end if;
  if v_old_role.is_owner_role and not v_new_role.is_owner_role and private.active_owner_count(v_m.organization_id) <= 1 then
    raise exception 'The organization must keep at least one farm owner.' using errcode = 'P0001';
  end if;
  if p_access_scope not in ('organization', 'sites') then
    raise exception 'Choose whole organization or specific sites.' using errcode = '22023';
  end if;
  if v_new_role.is_owner_role and p_access_scope <> 'organization' then
    raise exception 'Farm owners always have access to every site.' using errcode = '22023';
  end if;
  if p_access_scope = 'sites' and coalesce(array_length(p_site_ids, 1), 0) = 0 then
    raise exception 'Select at least one farm site.' using errcode = '22023';
  end if;
  perform private.assert_sites_in_org(v_m.organization_id, p_site_ids);

  update public.memberships
  set role_id = p_role, access_scope = p_access_scope, job_title = nullif(trim(p_job_title), '')
  where id = p_membership;

  delete from public.member_sites where membership_id = p_membership;
  if p_access_scope = 'sites' then
    insert into public.member_sites (membership_id, site_id, organization_id)
    select p_membership, s, v_m.organization_id from unnest(p_site_ids) s;
  end if;

  perform private.audit(v_m.organization_id, null, 'member.access_changed', 'memberships', p_membership,
    'Changed role or site access', jsonb_build_object('role_id', v_m.role_id, 'access_scope', v_m.access_scope),
    jsonb_build_object('role_id', p_role, 'access_scope', p_access_scope, 'site_ids', p_site_ids));
end;
$$;

create or replace function public.set_member_status(p_membership uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_is_owner boolean;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if not found then
    raise exception 'User not found in this organization.' using errcode = 'P0002';
  end if;
  perform private.require(v_m.organization_id, null, 'members.manage');
  if p_status not in ('active', 'suspended', 'removed') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  if v_m.user_id = auth.uid() and p_status <> 'active' then
    raise exception 'You cannot suspend or remove yourself.' using errcode = 'P0001';
  end if;
  select r.is_owner_role into v_is_owner from public.roles r where r.id = v_m.role_id;
  if v_is_owner and not public.is_org_owner(v_m.organization_id) then
    raise exception 'Only a farm owner can suspend or remove another owner.' using errcode = '42501';
  end if;
  if v_is_owner and p_status <> 'active' and private.active_owner_count(v_m.organization_id) <= 1 then
    raise exception 'The organization must keep at least one farm owner.' using errcode = 'P0001';
  end if;

  update public.memberships
  set status = p_status, removed_at = case when p_status = 'removed' then now() end
  where id = p_membership;
  if p_status = 'removed' then
    delete from public.member_sites where membership_id = p_membership;
  end if;
end;
$$;

-- Replace the permission set of a non-owner role.
create or replace function public.set_role_permissions(p_role uuid, p_permission_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  select * into v_role from public.roles where id = p_role;
  if not found then
    raise exception 'Role not found.' using errcode = 'P0002';
  end if;
  perform private.require(v_role.organization_id, null, 'members.manage');
  if v_role.is_owner_role then
    raise exception 'The farm owner role always has every permission.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_permission_keys) k where not exists (select 1 from public.permissions p where p.key = k)) then
    raise exception 'Unknown permission.' using errcode = '22023';
  end if;

  delete from public.role_permissions
  where role_id = p_role and permission_key <> all (p_permission_keys);
  insert into public.role_permissions (role_id, organization_id, permission_key)
  select p_role, v_role.organization_id, k from unnest(p_permission_keys) k
  on conflict do nothing;
end;
$$;

create or replace function public.create_role(p_org uuid, p_name text, p_description text, p_permission_keys text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  perform private.require(p_org, null, 'members.manage');
  insert into public.roles (organization_id, name, description, rank, is_owner_role)
  values (p_org, trim(p_name), nullif(trim(p_description), ''), 50, false)
  returning id into v_role;
  perform public.set_role_permissions(v_role, coalesce(p_permission_keys, '{}'));
  return v_role;
end;
$$;

-- Platform overview: aggregate counts only, never tenant records.
create or replace function public.platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrators only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'organizations', (select count(*) from public.organizations where status <> 'closed'),
    'organizations_last_30_days', (select count(*) from public.organizations where created_at > now() - interval '30 days'),
    'farm_sites', (select count(*) from public.farm_sites where status = 'active'),
    'active_users', (select count(distinct user_id) from public.memberships where status = 'active'),
    'subscriptions_by_status', coalesce((select jsonb_object_agg(status, n) from (
        select status, count(*) n from public.subscriptions group by status) s), '{}'::jsonb)
  );
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_organization(text, text, text, text),
  public.create_site(uuid, text, text, text, text, text, text, text, numeric, boolean, boolean, boolean, text),
  public.set_site_status(uuid, text),
  public.create_invitation(uuid, text, uuid, text, uuid[]),
  public.revoke_invitation(uuid),
  public.get_invitation(text),
  public.accept_invitation(text),
  public.update_member_access(uuid, uuid, text, uuid[], text),
  public.set_member_status(uuid, text),
  public.set_role_permissions(uuid, text[]),
  public.create_role(uuid, text, text, text[]),
  public.platform_overview()
  to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
