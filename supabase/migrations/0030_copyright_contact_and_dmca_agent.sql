-- Phase 25: complete copyright notice contact fields and configurable public DMCA agent support.
-- The application owner must publish truthful designated-agent details before relying on a DMCA safe-harbor process.

alter table public.copyright_notices
  add column if not exists reporter_phone text,
  add column if not exists reporter_address text;

alter table public.copyright_notices
  drop constraint if exists copyright_notices_phone_check,
  drop constraint if exists copyright_notices_address_check;

alter table public.copyright_notices
  add constraint copyright_notices_phone_check check (reporter_phone is null or char_length(reporter_phone) between 7 and 40),
  add constraint copyright_notices_address_check check (reporter_address is null or char_length(reporter_address) between 5 and 500);

-- Remove the legacy callable signature to prevent ambiguous RPC behavior.
drop function if exists public.submit_copyright_notice(text,text,text,text,text,boolean,boolean);

create or replace function public.submit_copyright_notice(
  p_reporter_name text,
  p_reporter_email text,
  p_reporter_phone text,
  p_reporter_address text,
  p_signature text,
  p_work_description text,
  p_infringing_location text,
  p_good_faith_statement boolean,
  p_accuracy_statement boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if nullif(trim(p_reporter_name),'') is null
     or nullif(trim(p_reporter_email),'') is null
     or nullif(trim(p_reporter_phone),'') is null
     or nullif(trim(p_reporter_address),'') is null
     or nullif(trim(p_signature),'') is null
     or nullif(trim(p_work_description),'') is null
     or nullif(trim(p_infringing_location),'') is null then
    raise exception 'required';
  end if;
  if p_good_faith_statement is not true or p_accuracy_statement is not true then
    raise exception 'attestation_required';
  end if;
  insert into public.copyright_notices(
    reporter_name, reporter_email, reporter_phone, reporter_address, signature,
    work_description, infringing_location, good_faith_statement, accuracy_statement
  )
  values(
    left(trim(p_reporter_name),120),
    left(trim(p_reporter_email),320),
    left(trim(p_reporter_phone),40),
    left(trim(p_reporter_address),500),
    left(trim(p_signature),160),
    left(trim(p_work_description),10000),
    left(trim(p_infringing_location),4000),
    true,
    true
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_copyright_notice(text,text,text,text,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.submit_copyright_notice(text,text,text,text,text,text,text,boolean,boolean) to anon,authenticated;

drop function if exists public.admin_list_copyright_notices(integer);

create or replace function public.admin_list_copyright_notices(p_limit integer default 100)
returns table(
  id uuid,
  reporter_name text,
  reporter_email text,
  reporter_phone text,
  reporter_address text,
  signature text,
  work_description text,
  infringing_location text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,c.reporter_name,c.reporter_email,c.reporter_phone,c.reporter_address,c.signature,c.work_description,c.infringing_location,c.status,c.created_at
  from public.copyright_notices c
  where public.has_permission('platform.audit')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),200);
$$;
revoke all on function public.admin_list_copyright_notices(integer) from public,anon;
grant execute on function public.admin_list_copyright_notices(integer) to authenticated;
