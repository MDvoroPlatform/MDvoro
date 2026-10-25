-- Lab reference data is managed separately from QBank questions. Students can
-- only read records a content reviewer explicitly approved with a citation.
create table if not exists public.lab_values (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  category text not null check (category in ('hematology','electrolytes','renal','liver','endocrine','other')),
  reference_range text not null check (char_length(trim(reference_range)) between 1 and 240),
  unit text not null check (char_length(trim(unit)) between 1 and 40),
  si_reference_range text not null check (char_length(trim(si_reference_range)) between 1 and 240),
  si_unit text not null check (char_length(trim(si_unit)) between 1 and 40),
  population text not null default 'Adult' check (char_length(trim(population)) between 1 and 120),
  source_reference text not null check (char_length(trim(source_reference)) between 8 and 1000),
  review_note text check (review_note is null or char_length(review_note)<=1000),
  status text not null default 'pending' check (status in ('pending','in_review','approved','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status<>'approved') or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists lab_values_student_idx on public.lab_values(category,name) where status='approved';
drop trigger if exists lab_values_updated_at on public.lab_values;
create trigger lab_values_updated_at before update on public.lab_values
for each row execute function public.set_updated_at();

alter table public.lab_values enable row level security;
revoke all on public.lab_values from anon,authenticated;
grant select on public.lab_values to authenticated;
drop policy if exists lab_values_students_read_approved on public.lab_values;
create policy lab_values_students_read_approved on public.lab_values for select to authenticated using(status='approved');

create or replace function public.admin_list_lab_values(p_status text default 'all')
returns setof public.lab_values language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_permission('content.read') then raise exception 'forbidden'; end if;
  if p_status not in ('all','pending','in_review','approved','archived') then raise exception 'invalid_status'; end if;
  return query select * from public.lab_values where p_status='all' or status=p_status order by category,name limit 500;
end;
$$;
revoke all on function public.admin_list_lab_values(text) from public,anon;
grant execute on function public.admin_list_lab_values(text) to authenticated;

create or replace function public.admin_upsert_lab_value(
  p_id uuid,p_name text,p_category text,p_reference_range text,p_unit text,
  p_si_reference_range text,p_si_unit text,p_population text,p_source_reference text,
  p_review_note text,p_status text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare v_id uuid; v_old_status text;
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  if p_category not in ('hematology','electrolytes','renal','liver','endocrine','other') then raise exception 'invalid_category'; end if;
  if p_status not in ('pending','in_review','approved','archived') then raise exception 'invalid_status'; end if;
  if p_status='approved' and nullif(trim(coalesce(p_source_reference,'')),'') is null then raise exception 'source_required_for_approval'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 160 or length(trim(coalesce(p_reference_range,''))) not between 1 and 240
    or length(trim(coalesce(p_unit,''))) not between 1 and 40 or length(trim(coalesce(p_si_reference_range,''))) not between 1 and 240
    or length(trim(coalesce(p_si_unit,''))) not between 1 and 40 or length(trim(coalesce(p_population,''))) not between 1 and 120
    or length(trim(coalesce(p_source_reference,''))) not between 8 and 1000 or length(coalesce(p_review_note,''))>1000 then raise exception 'invalid_lab_value'; end if;
  if p_id is null then
    insert into public.lab_values(name,category,reference_range,unit,si_reference_range,si_unit,population,source_reference,review_note,status,created_by,updated_by,reviewed_by,reviewed_at)
    values(trim(p_name),p_category,trim(p_reference_range),trim(p_unit),trim(p_si_reference_range),trim(p_si_unit),trim(p_population),trim(p_source_reference),nullif(trim(coalesce(p_review_note,'')),''),p_status,auth.uid(),auth.uid(),case when p_status='approved' then auth.uid() end,case when p_status='approved' then now() end)
    returning id into v_id;
  else
    select status into v_old_status from public.lab_values where id=p_id for update;
    if not found then raise exception 'lab_value_not_found'; end if;
    update public.lab_values set name=trim(p_name),category=p_category,reference_range=trim(p_reference_range),unit=trim(p_unit),
      si_reference_range=trim(p_si_reference_range),si_unit=trim(p_si_unit),population=trim(p_population),source_reference=trim(p_source_reference),
      review_note=nullif(trim(coalesce(p_review_note,'')),''),status=p_status,updated_by=auth.uid(),
      reviewed_by=case when p_status='approved' then auth.uid() when v_old_status='approved' then null else reviewed_by end,
      reviewed_at=case when p_status='approved' then now() when v_old_status='approved' then null else reviewed_at end
      where id=p_id returning id into v_id;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
    values(auth.uid(),'lab_value',v_id,'upserted',jsonb_build_object('status',p_status,'category',p_category));
  return v_id;
end;
$$;
revoke all on function public.admin_upsert_lab_value(uuid,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.admin_upsert_lab_value(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;
