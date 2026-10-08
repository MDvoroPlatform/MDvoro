-- Phase 29: Israel launch controls, site maintenance switch and learner flashcard deletion.
create table if not exists public.platform_settings (
  id boolean primary key default true check (id = true),
  under_construction boolean not null default false,
  under_construction_updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings(id) values(true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

create or replace function public.get_public_site_status()
returns table(under_construction boolean)
language sql stable security definer set search_path = ''
as $$
  select p.under_construction from public.platform_settings p where p.id = true;
$$;
revoke all on function public.get_public_site_status() from public;
grant execute on function public.get_public_site_status() to anon, authenticated;

create or replace function public.admin_set_under_construction(p_enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_permission('team.manage') then raise exception 'forbidden'; end if;
  update public.platform_settings
    set under_construction = p_enabled,
        under_construction_updated_at = now(),
        updated_by = auth.uid(),
        updated_at = now()
  where id = true;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'platform','00000000-0000-0000-0000-000000000000',case when p_enabled then 'under_construction_enabled' else 'under_construction_disabled' end,jsonb_build_object('enabled',p_enabled));
end;
$$;
revoke all on function public.admin_set_under_construction(boolean) from public;
grant execute on function public.admin_set_under_construction(boolean) to authenticated;

create or replace function public.delete_own_flashcard(p_flashcard_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  delete from public.flashcards where id = p_flashcard_id and owner_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;
revoke all on function public.delete_own_flashcard(uuid) from public;
grant execute on function public.delete_own_flashcard(uuid) to authenticated;

-- Copyright/provenance safety: every question can carry an auditable rights record.
create table if not exists public.question_rights (
  question_id uuid primary key references public.questions(id) on delete cascade,
  rights_basis text not null check (rights_basis in ('original','licensed','permission','public_domain','user_submitted','unknown')),
  source_name text,
  source_year smallint,
  source_reference text,
  attribution text,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_rights_source_year_check check (source_year is null or source_year between 1800 and 2100)
);
create index if not exists question_rights_verified_idx on public.question_rights(verified,rights_basis);
alter table public.question_rights enable row level security;
revoke all on public.question_rights from anon, authenticated;

create or replace function public.admin_upsert_question_rights(
  p_question_id uuid,
  p_rights_basis text,
  p_source_name text default null,
  p_source_year smallint default null,
  p_source_reference text default null,
  p_attribution text default null,
  p_verified boolean default false,
  p_notes text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  if p_rights_basis not in ('original','licensed','permission','public_domain','user_submitted','unknown') then raise exception 'invalid_rights_basis'; end if;
  if p_verified and p_rights_basis in ('unknown','user_submitted') then raise exception 'verification_requires_rights_basis'; end if;
  insert into public.question_rights(question_id,rights_basis,source_name,source_year,source_reference,attribution,verified,verified_at,verified_by,notes)
  values(p_question_id,p_rights_basis,nullif(trim(p_source_name),''),p_source_year,nullif(trim(p_source_reference),''),nullif(trim(p_attribution),''),p_verified,case when p_verified then now() end,case when p_verified then auth.uid() end,p_notes)
  on conflict(question_id) do update set rights_basis=excluded.rights_basis,source_name=excluded.source_name,source_year=excluded.source_year,source_reference=excluded.source_reference,attribution=excluded.attribution,verified=excluded.verified,verified_at=excluded.verified_at,verified_by=excluded.verified_by,notes=excluded.notes,updated_at=now();
end;
$$;
revoke all on function public.admin_upsert_question_rights(uuid,text,text,smallint,text,text,boolean,text) from public;
grant execute on function public.admin_upsert_question_rights(uuid,text,text,smallint,text,text,boolean,text) to authenticated;

create or replace function public.admin_question_rights_gaps(p_limit integer default 100)
returns table(question_id uuid,content_code text,exam_name text,rights_basis text,verified boolean)
language sql stable security definer set search_path = ''
as $$
  select q.id,q.content_code,e.name,coalesce(r.rights_basis,'unknown'),coalesce(r.verified,false)
  from public.questions q
  join public.exams e on e.id=q.exam_id
  left join public.question_rights r on r.question_id=q.id
  where public.has_permission('content.read')
    and (r.question_id is null or not r.verified)
  order by q.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.admin_question_rights_gaps(integer) from public;
grant execute on function public.admin_question_rights_gaps(integer) to authenticated;

-- Hard publish gate: no question can be approved without a documented, verified rights basis.
create or replace function public.review_question(p_question_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_version_id uuid; v_creator uuid;
begin
  if not public.can_review_content() then raise exception 'forbidden'; end if;
  if p_decision not in ('approved','changes_requested','rejected') then raise exception 'invalid_decision'; end if;
  select id,created_by into v_version_id,v_creator from public.question_versions where question_id=p_question_id order by version_no desc limit 1;
  if v_version_id is null then raise exception 'version_not_found'; end if;
  if v_creator=auth.uid() then raise exception 'self_review_forbidden'; end if;
  if not exists(select 1 from public.questions where id=p_question_id and workflow_status='in_review') then raise exception 'question_not_in_review'; end if;
  if p_decision='approved' and not exists(select 1 from public.question_rights r where r.question_id=p_question_id and r.verified=true and r.rights_basis <> 'unknown') then
    raise exception 'rights_not_verified';
  end if;
  insert into public.content_reviews(question_id,version_id,reviewer_id,decision,note) values(p_question_id,v_version_id,auth.uid(),p_decision,p_note);
  if p_decision='approved' then
    update public.questions q set stem=v.stem,subject=v.subject,topic=v.topic,options=v.options,answer_key=v.answer_key,explanation=v.explanation,difficulty=v.difficulty,is_published=true,workflow_status='published'
    from public.question_versions v where q.id=p_question_id and v.id=v_version_id;
  elsif p_decision='changes_requested' then update public.questions set is_published=false,workflow_status='draft' where id=p_question_id;
  else update public.questions set is_published=false,workflow_status='archived' where id=p_question_id;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'question',p_question_id,'reviewed',jsonb_build_object('decision',p_decision,'version_id',v_version_id));
end;
$$;
revoke all on function public.review_question(uuid,text,text) from public;
grant execute on function public.review_question(uuid,text,text) to authenticated;
