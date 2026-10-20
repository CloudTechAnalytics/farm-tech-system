-- ============================================================================
-- FarmLedger by CloudTech Analytics
-- 0001 Foundation: tenancy, identity, roles and permissions, farm sites,
-- memberships, audit events and idempotency.
--
-- Conventions
--   * UUID primary keys.
--   * Every tenant-owned table carries organization_id and declares
--     unique (id, organization_id) so children can use composite foreign keys.
--     A child row therefore cannot reference a parent row in another tenant,
--     whatever IDs a request supplies.
--   * Site-scoped rows carry site_id with a composite FK to farm_sites.
--   * Helper functions used by RLS live in public (security definer, stable).
--     Internal write helpers live in the unexposed "private" schema.
--   * Platform administrators have NO implicit access to tenant rows.
-- ============================================================================

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext not null,
  full_name   text check (full_name is null or length(full_name) <= 120),
  phone       text check (phone is null or length(phone) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profile email in sync when a user changes their login email.
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Platform administrators. Granted only with the service role / SQL editor.
-- There is no client write path and no "first user becomes admin" bootstrap.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  note        text,
  granted_at  timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Organizations (tenant root)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 120),
  slug        extensions.citext not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country     char(2) not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  currency    char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  timezone    text not null default 'Africa/Lagos' check (length(timezone) between 3 and 64),
  address     text check (address is null or length(address) <= 300),
  phone       text check (phone is null or length(phone) <= 40),
  email       extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status      text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Plans and subscriptions (entitlements; payment integration deferred)
-- ---------------------------------------------------------------------------
create table public.plans (
  key          text primary key check (key ~ '^[a-z_]+$'),
  name         text not null,
  max_sites    integer check (max_sites is null or max_sites > 0),
  max_members  integer check (max_members is null or max_members > 0),
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

insert into public.plans (key, name, max_sites, max_members, sort_order) values
  ('early_access', 'Early access', 10, 25, 0),
  ('starter',      'Starter',       2,  5, 1),
  ('growth',       'Growth',       10, 25, 2),
  ('enterprise',   'Enterprise',  null, null, 3);

create table public.subscriptions (
  organization_id  uuid primary key references public.organizations (id) on delete cascade,
  plan_key         text not null references public.plans (key),
  status           text not null default 'trialing'
                     check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  trial_ends_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permission catalog and role templates
-- ---------------------------------------------------------------------------
create table public.permissions (
  key          text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  area         text not null,
  label        text not null,
  description  text not null,
  sort_order   integer not null default 0
);

insert into public.permissions (key, area, label, description, sort_order) values
  ('org.manage',        'Administration', 'Manage organization',   'Edit organization details and alert settings',                       10),
  ('members.manage',    'Administration', 'Manage users',          'Invite users, change roles and site access, remove users',           11),
  ('sites.manage',      'Administration', 'Manage farm sites',     'Create, edit and archive farm sites',                                12),
  ('settings.manage',   'Administration', 'Manage lists',          'Edit categories, units of measure and production units',             13),
  ('audit.view',        'Administration', 'View audit history',    'See who changed what and when',                                      14),
  ('operations.view',   'Operations',     'View operations',       'See batches, crop cycles, daily logs and production',                20),
  ('operations.record', 'Operations',     'Record daily work',     'Record mortality, feed use, egg collection, harvests and activities', 21),
  ('batches.manage',    'Operations',     'Manage batches',        'Start, transfer and close flocks, fish batches and crop cycles',     22),
  ('inventory.view',    'Inventory',      'View inventory',        'See stock balances and movements',                                   30),
  ('inventory.record',  'Inventory',      'Issue stock',           'Issue feed and inputs to farm operations',                           31),
  ('inventory.manage',  'Inventory',      'Manage inventory',      'Receive purchases, transfer, adjust and count stock; edit items',    32),
  ('sales.record',      'Finance',        'Record sales',          'Record sales of produce, birds and fish',                            40),
  ('finance.view',      'Finance',        'View finance',          'See income, expenses and sales values',                              41),
  ('finance.record',    'Finance',        'Record income and expenses', 'Record income and expense transactions',                        42),
  ('finance.reverse',   'Finance',        'Reverse transactions',  'Reverse posted financial transactions and sales',                    43),
  ('reports.view',      'Reports',        'View operational reports', 'Mortality, feed, inventory and production reports',               50),
  ('reports.financial', 'Reports',        'View financial reports', 'Income, expense, sales and operating surplus reports',              51),
  ('reports.export',    'Reports',        'Export reports',        'Download reports as CSV',                                            52);

create table public.role_templates (
  key            text primary key,
  name           text not null,
  description    text not null,
  rank           integer not null,
  is_owner_role  boolean not null default false
);

insert into public.role_templates (key, name, description, rank, is_owner_role) values
  ('owner',      'Farm owner',   'Full control of the organization, users, sites and finances', 10, true),
  ('manager',    'Farm manager', 'Runs assigned sites: batches, daily records, inventory and operational reports', 20, false),
  ('accountant', 'Accountant',   'Records and reviews income, expenses, sales and financial reports', 30, false),
  ('worker',     'Farm worker',  'Records daily activities, feed use, mortality and production on assigned sites', 40, false);

create table public.role_template_permissions (
  role_key        text not null references public.role_templates (key) on delete cascade,
  permission_key  text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

insert into public.role_template_permissions (role_key, permission_key)
select 'owner', key from public.permissions;

insert into public.role_template_permissions (role_key, permission_key)
select 'manager', unnest(array[
  'operations.view', 'operations.record', 'batches.manage',
  'inventory.view', 'inventory.record', 'inventory.manage',
  'sales.record', 'reports.view', 'reports.export', 'settings.manage'
]);

insert into public.role_template_permissions (role_key, permission_key)
select 'accountant', unnest(array[
  'operations.view', 'inventory.view', 'sales.record',
  'finance.view', 'finance.record', 'finance.reverse',
  'reports.view', 'reports.financial', 'reports.export'
]);

insert into public.role_template_permissions (role_key, permission_key)
select 'worker', unnest(array[
  'operations.view', 'operations.record', 'inventory.view', 'inventory.record'
]);

-- Per-organization roles, copied from the templates when an organization is
-- created so each farm can tune permissions without affecting other farms.
create table public.roles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  template_key     text references public.role_templates (key),
  name             text not null check (length(trim(name)) between 2 and 60),
  description      text,
  rank             integer not null default 100,
  is_owner_role    boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

create unique index roles_one_owner_role_per_org on public.roles (organization_id) where is_owner_role;

create trigger trg_roles_updated_at before update on public.roles
  for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id          uuid not null,
  organization_id  uuid not null,
  permission_key   text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key),
  foreign key (role_id, organization_id) references public.roles (id, organization_id) on delete cascade
);

create index idx_role_permissions_org on public.role_permissions (organization_id);

-- ---------------------------------------------------------------------------
-- Farm sites
-- ---------------------------------------------------------------------------
create table public.farm_sites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (length(trim(name)) between 2 and 120),
  code             text check (code is null or code ~ '^[A-Za-z0-9-]{1,12}$'),
  address          text check (address is null or length(address) <= 300),
  state_region     text check (state_region is null or length(state_region) <= 80),
  country          char(2) not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  contact_name     text check (contact_name is null or length(contact_name) <= 120),
  contact_phone    text check (contact_phone is null or length(contact_phone) <= 40),
  size_hectares    numeric(12, 3) check (size_hectares is null or size_hectares > 0),
  has_poultry      boolean not null default false,
  has_fish         boolean not null default false,
  has_crops        boolean not null default false,
  notes            text check (notes is null or length(notes) <= 2000),
  status           text not null default 'active' check (status in ('active', 'archived')),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name),
  unique (organization_id, code)
);

create index idx_farm_sites_org on public.farm_sites (organization_id);

create trigger trg_farm_sites_updated_at before update on public.farm_sites
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Memberships and site assignments
-- ---------------------------------------------------------------------------
create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role_id          uuid not null,
  status           text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  access_scope     text not null default 'organization' check (access_scope in ('organization', 'sites')),
  job_title        text check (job_title is null or length(job_title) <= 80),
  invited_by       uuid references public.profiles (id) on delete set null,
  joined_at        timestamptz not null default now(),
  removed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, user_id),
  foreign key (role_id, organization_id) references public.roles (id, organization_id)
);

create index idx_memberships_user on public.memberships (user_id) where status = 'active';
create index idx_memberships_org on public.memberships (organization_id);

create trigger trg_memberships_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();

create table public.member_sites (
  membership_id    uuid not null,
  site_id          uuid not null,
  organization_id  uuid not null,
  created_at       timestamptz not null default now(),
  primary key (membership_id, site_id),
  foreign key (membership_id, organization_id) references public.memberships (id, organization_id) on delete cascade,
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id) on delete cascade
);

create index idx_member_sites_site on public.member_sites (site_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers (used by every RLS policy)
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.status <> 'closed'
  );
$$;

create or replace function public.has_permission(p_org uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.status = 'active'
      and rp.permission_key = p_perm
  );
$$;

-- Site access. A NULL site means "organization-wide record", which only
-- organization-scoped members may see. (The Counsel treated NULL as open.)
create or replace function public.has_site_access(p_org uuid, p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.access_scope = 'organization'
        or (p_site is not null and exists (
          select 1 from public.member_sites ms
          where ms.membership_id = m.id and ms.site_id = p_site
        ))
      )
  );
$$;

-- Permission AND site access in one call.
create or replace function public.can(p_org uuid, p_site uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(p_org, p_perm) and public.has_site_access(p_org, p_site);
$$;

create or replace function public.is_org_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = p_org and m.user_id = auth.uid()
      and m.status = 'active' and r.is_owner_role
  );
$$;

create or replace function public.shares_organization(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships me
    join public.memberships them on them.organization_id = me.organization_id
    where me.user_id = auth.uid() and me.status = 'active'
      and them.user_id = p_user and them.status <> 'removed'
  );
$$;

-- Raise a permission error unless the caller may act. Used inside RPCs.
create or replace function private.require(p_org uuid, p_site uuid, p_perm text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if not public.has_permission(p_org, p_perm) then
    raise exception 'You do not have permission to do this (%).', p_perm using errcode = '42501';
  end if;
  if p_site is not null and not public.has_site_access(p_org, p_site) then
    raise exception 'You do not have access to this farm site.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit events. Written only by triggers and internal functions.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid,
  actor_id         uuid references public.profiles (id) on delete set null,
  action           text not null,
  entity_type      text not null,
  entity_id        uuid,
  summary          text,
  before_data      jsonb,
  after_data       jsonb,
  created_at       timestamptz not null default now()
);

create index idx_audit_events_org_created on public.audit_events (organization_id, created_at desc);
create index idx_audit_events_entity on public.audit_events (entity_type, entity_id);

create or replace function private.audit(
  p_org uuid, p_site uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_summary text, p_before jsonb default null, p_after jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (organization_id, site_id, actor_id, action, entity_type, entity_id, summary, before_data, after_data)
  values (p_org, p_site, auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, p_before, p_after);
$$;

-- Generic row-change audit trigger for configuration tables. Requires the
-- table to have organization_id; records site_id when present.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if current_setting('farmledger.bootstrapping', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;
  -- The organization itself is being deleted (cascade): nothing left to audit against.
  if not exists (select 1 from public.organizations o where o.id = (v_row ->> 'organization_id')::uuid) then
    return coalesce(new, old);
  end if;
  insert into public.audit_events (organization_id, site_id, actor_id, action, entity_type, entity_id, summary, before_data, after_data)
  values (
    (v_row ->> 'organization_id')::uuid,
    nullif(v_row ->> 'site_id', '')::uuid,
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    null,
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

-- organizations has no organization_id column; audit it explicitly.
create or replace function private.audit_organization_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(old) - 'updated_at') <> (to_jsonb(new) - 'updated_at') then
    insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, before_data, after_data)
    values (new.id, auth.uid(), 'organizations.update', 'organizations', new.id, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$$;

create trigger trg_audit_organizations after update on public.organizations
  for each row execute function private.audit_organization_change();
create trigger trg_audit_farm_sites after insert or update or delete on public.farm_sites
  for each row execute function private.audit_row_change();
create trigger trg_audit_memberships after insert or update or delete on public.memberships
  for each row execute function private.audit_row_change();
create trigger trg_audit_roles after insert or update or delete on public.roles
  for each row execute function private.audit_row_change();

create or replace function private.audit_role_permission_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.role_permissions := coalesce(new, old);
begin
  if current_setting('farmledger.bootstrapping', true) = 'on' then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_row.organization_id) then
    return coalesce(new, old);
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, summary)
  values (v_row.organization_id, auth.uid(),
          'role_permissions.' || lower(tg_op), 'roles', v_row.role_id,
          case when tg_op = 'INSERT' then 'Granted ' else 'Revoked ' end || v_row.permission_key);
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_role_permissions after insert or delete on public.role_permissions
  for each row execute function private.audit_role_permission_change();

-- ---------------------------------------------------------------------------
-- Idempotency for every operation that changes stock, population or money.
-- The client sends a fresh UUID per form submission and re-sends the same
-- UUID on retry. A transaction-scoped advisory lock serializes concurrent
-- duplicates; the second caller receives the first caller's result.
-- ---------------------------------------------------------------------------
create table private.idempotent_operations (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  idempotency_key  uuid not null,
  operation        text not null,
  result           jsonb not null,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);

create or replace function private.idem_begin(p_org uuid, p_key uuid, p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.idempotent_operations;
begin
  if p_key is null then
    raise exception 'A submission key is required for this operation.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_key::text, 0));
  select * into v_row from private.idempotent_operations
  where organization_id = p_org and idempotency_key = p_key;
  if found then
    if v_row.operation <> p_operation then
      raise exception 'This submission key was already used for a different operation.' using errcode = '22023';
    end if;
    return v_row.result || jsonb_build_object('replayed', true);
  end if;
  return null;
end;
$$;

create or replace function private.idem_finish(p_org uuid, p_key uuid, p_operation text, p_result jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  insert into private.idempotent_operations (organization_id, idempotency_key, operation, result, created_by)
  values (p_org, p_key, p_operation, p_result, auth.uid());
  select p_result || jsonb_build_object('replayed', false);
$$;

-- ---------------------------------------------------------------------------
-- Invitations (token stored only as a SHA-256 hash)
-- ---------------------------------------------------------------------------
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id          uuid not null,
  access_scope     text not null default 'organization' check (access_scope in ('organization', 'sites')),
  site_ids         uuid[] not null default '{}',
  token_hash       text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by       uuid references public.profiles (id) on delete set null,
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  accepted_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (role_id, organization_id) references public.roles (id, organization_id) on delete cascade
);

create unique index invitations_one_pending_per_email on public.invitations (organization_id, email) where status = 'pending';

create trigger trg_invitations_updated_at before update on public.invitations
  for each row execute function private.set_updated_at();
create trigger trg_audit_invitations after insert or update on public.invitations
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles                  enable row level security;
alter table public.platform_admins           enable row level security;
alter table public.organizations             enable row level security;
alter table public.plans                     enable row level security;
alter table public.subscriptions             enable row level security;
alter table public.permissions               enable row level security;
alter table public.role_templates            enable row level security;
alter table public.role_template_permissions enable row level security;
alter table public.roles                     enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.farm_sites                enable row level security;
alter table public.memberships               enable row level security;
alter table public.member_sites              enable row level security;
alter table public.audit_events              enable row level security;
alter table public.invitations               enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_organization(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy platform_admins_select_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_permission(id, 'org.manage')) with check (public.has_permission(id, 'org.manage'));

create policy plans_select on public.plans for select to authenticated using (true);
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_org_member(organization_id));

create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_templates_select on public.role_templates for select to authenticated using (true);
create policy role_template_permissions_select on public.role_template_permissions for select to authenticated using (true);

create policy roles_select on public.roles for select to authenticated
  using (public.is_org_member(organization_id));
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (public.is_org_member(organization_id));

create policy farm_sites_select on public.farm_sites for select to authenticated
  using (public.is_org_member(organization_id) and public.has_site_access(organization_id, id));
create policy farm_sites_update on public.farm_sites for update to authenticated
  using (public.has_permission(organization_id, 'sites.manage') and public.has_site_access(organization_id, id))
  with check (public.has_permission(organization_id, 'sites.manage') and public.has_site_access(organization_id, id));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));
create policy member_sites_select on public.member_sites for select to authenticated
  using (public.is_org_member(organization_id));

create policy audit_events_select on public.audit_events for select to authenticated
  using (public.has_permission(organization_id, 'audit.view'));

create policy invitations_select on public.invitations for select to authenticated
  using (public.has_permission(organization_id, 'members.manage'));

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants ALL on new public tables to anon and authenticated
-- by default; start from nothing and grant only what each table needs.
-- Writes to memberships, roles, invitations and organizations creation go
-- through security definer RPCs defined in later migrations.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.platform_admins, public.organizations, public.plans,
  public.subscriptions, public.permissions, public.role_templates, public.role_template_permissions,
  public.roles, public.role_permissions, public.farm_sites, public.memberships, public.member_sites,
  public.audit_events, public.invitations
  from anon, authenticated;

grant select on public.profiles, public.platform_admins, public.organizations, public.plans,
  public.subscriptions, public.permissions, public.role_templates, public.role_template_permissions,
  public.roles, public.role_permissions, public.farm_sites, public.memberships, public.member_sites,
  public.audit_events, public.invitations
  to authenticated;

grant update (full_name, phone) on public.profiles to authenticated;
grant update (name, address, phone, email, timezone) on public.organizations to authenticated;
grant update (name, code, address, state_region, country, contact_name, contact_phone, size_hectares,
  has_poultry, has_fish, has_crops, notes) on public.farm_sites to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.is_platform_admin(), public.is_org_member(uuid), public.has_permission(uuid, text),
  public.has_site_access(uuid, uuid), public.can(uuid, uuid, text), public.is_org_owner(uuid),
  public.shares_organization(uuid) from public, anon;
grant execute on function public.is_platform_admin(), public.is_org_member(uuid), public.has_permission(uuid, text),
  public.has_site_access(uuid, uuid), public.can(uuid, uuid, text), public.is_org_owner(uuid),
  public.shares_organization(uuid) to authenticated;
