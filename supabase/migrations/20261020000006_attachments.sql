-- ============================================================================
-- 0006 Attachments: receipts, photos and documents on records.
-- Files live in a PRIVATE bucket at  <organization_id>/<site_id>/<uuid>-<name>.
-- Access to the file follows access to the site. The browser reads files
-- only through short-lived signed URLs.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.attachments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid not null,
  entity_type      text not null check (entity_type in ('activity_log', 'finance_transaction', 'inventory_movement',
                     'production_record', 'sale', 'batch', 'crop_cycle')),
  entity_id        uuid not null,
  storage_path     text not null unique,
  file_name        text not null check (length(file_name) between 1 and 200),
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (site_id, organization_id) references public.farm_sites (id, organization_id),
  check (storage_path like organization_id::text || '/' || site_id::text || '/%')
);

create index idx_attachments_entity on public.attachments (entity_type, entity_id);

-- The attached record must exist in the same organization and site.
create or replace function private.check_attachment_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  v_ok := case new.entity_type
    when 'activity_log'        then exists (select 1 from public.activity_logs where id = new.entity_id and site_id = new.site_id)
    when 'finance_transaction' then exists (select 1 from public.finance_transactions where id = new.entity_id
                                    and organization_id = new.organization_id and (site_id = new.site_id or site_id is null))
    when 'inventory_movement'  then exists (select 1 from public.inventory_movements where id = new.entity_id and site_id = new.site_id)
    when 'production_record'   then exists (select 1 from public.production_records where id = new.entity_id and site_id = new.site_id)
    when 'sale'                then exists (select 1 from public.sales where id = new.entity_id and site_id = new.site_id)
    when 'batch'               then exists (select 1 from public.batches where id = new.entity_id and site_id = new.site_id)
    when 'crop_cycle'          then exists (select 1 from public.crop_cycles where id = new.entity_id and site_id = new.site_id)
  end;
  if not v_ok then
    raise exception 'The record for this attachment was not found on this site.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger trg_check_attachment_target before insert on public.attachments
  for each row execute function private.check_attachment_target();
create trigger trg_audit_attachments after insert or delete on public.attachments
  for each row execute function private.audit_row_change();

-- Uploading requires a permission that matches the kind of record.
create or replace function public.can_attach(p_org uuid, p_site uuid, p_entity_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_site_access(p_org, p_site) and case
    when p_entity_type in ('finance_transaction', 'sale') then public.has_permission(p_org, 'finance.record')
                                                             or public.has_permission(p_org, 'sales.record')
    when p_entity_type = 'inventory_movement' then public.has_permission(p_org, 'inventory.record')
    else public.has_permission(p_org, 'operations.record')
  end;
$$;

alter table public.attachments enable row level security;

create policy attachments_select on public.attachments for select to authenticated
  using (public.has_site_access(organization_id, site_id) and case
    when entity_type in ('finance_transaction', 'sale') then public.has_permission(organization_id, 'finance.view')
                                                          or public.has_permission(organization_id, 'sales.record')
    when entity_type = 'inventory_movement' then public.has_permission(organization_id, 'inventory.view')
    else public.has_permission(organization_id, 'operations.view') end);
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.can_attach(organization_id, site_id, entity_type));
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.has_site_access(organization_id, site_id)
         and (uploaded_by = auth.uid() or public.has_permission(organization_id, 'settings.manage')));

revoke all on public.attachments from anon, authenticated;
grant select, delete on public.attachments to authenticated;
grant insert (organization_id, site_id, entity_type, entity_id, storage_path, file_name, mime_type, size_bytes)
  on public.attachments to authenticated;

-- Storage object policies. Path segment 1 = organization, 2 = site.
create or replace function public.attachment_path_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if array_length(v_parts, 1) < 2 then return false; end if;
  return public.has_site_access(v_parts[1]::uuid, v_parts[2]::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

create policy attachments_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and exists (
    select 1 from public.attachments a where a.storage_path = name));
create policy attachments_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.attachment_path_ok(name));
create policy attachments_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.attachment_path_ok(name)
         and (owner_id = auth.uid()::text or not exists (select 1 from public.attachments a where a.storage_path = name)));

revoke execute on function public.can_attach(uuid, uuid, text), public.attachment_path_ok(text) from public, anon;
grant execute on function public.can_attach(uuid, uuid, text), public.attachment_path_ok(text) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
