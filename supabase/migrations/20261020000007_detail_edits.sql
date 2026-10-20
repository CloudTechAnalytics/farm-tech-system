-- ============================================================================
-- 0007 Editing descriptive details. Quantities and dates that drive the
-- ledgers (start date, initial quantity, area) are not editable here; they
-- are corrected through adjustments so history stays intact. Every change is
-- captured by the audit triggers on batches and crop_cycles.
-- ============================================================================

create or replace function public.update_batch_details(
  p_batch uuid,
  p_breed text default null,
  p_source text default null,
  p_production_unit uuid default null,
  p_expects_daily_records boolean default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.batches;
begin
  v_b := private.lock_batch(p_batch, 'batches.manage');
  if p_production_unit is not null and not exists (
      select 1 from public.production_units where id = p_production_unit and site_id = v_b.site_id
        and production_type = v_b.production_type and status = 'active') then
    raise exception 'Choose an active % unit on this site.', v_b.production_type using errcode = '22023';
  end if;
  update public.batches set
    breed = coalesce(nullif(trim(p_breed), ''), breed),
    source = coalesce(nullif(trim(p_source), ''), source),
    production_unit_id = coalesce(p_production_unit, production_unit_id),
    expects_daily_records = coalesce(p_expects_daily_records, expects_daily_records),
    notes = case when p_notes is null then notes else nullif(trim(p_notes), '') end
  where id = p_batch;
end;
$$;

create or replace function public.update_crop_cycle_details(
  p_cycle uuid,
  p_expected_harvest_date date default null,
  p_variety text default null,
  p_season text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.crop_cycles;
begin
  select * into v_c from public.crop_cycles where id = p_cycle for update;
  if not found or not public.has_site_access(v_c.organization_id, v_c.site_id) then
    raise exception 'Crop cycle not found.' using errcode = 'P0002';
  end if;
  perform private.require(v_c.organization_id, v_c.site_id, 'batches.manage');
  if p_expected_harvest_date is not null and v_c.planting_date is not null and p_expected_harvest_date < v_c.planting_date then
    raise exception 'The expected harvest date is before planting.' using errcode = '22023';
  end if;
  update public.crop_cycles set
    expected_harvest_date = coalesce(p_expected_harvest_date, expected_harvest_date),
    variety = coalesce(nullif(trim(p_variety), ''), variety),
    season = coalesce(nullif(trim(p_season), ''), season),
    notes = case when p_notes is null then notes else nullif(trim(p_notes), '') end
  where id = p_cycle;
end;
$$;

revoke execute on function public.update_batch_details(uuid, text, text, uuid, boolean, text),
  public.update_crop_cycle_details(uuid, date, text, text, text) from public, anon;
grant execute on function public.update_batch_details(uuid, text, text, uuid, boolean, text),
  public.update_crop_cycle_details(uuid, date, text, text, text) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
