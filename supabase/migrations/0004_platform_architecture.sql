-- MDvoro Phase 3: maintainability, content workflow, permission contracts and admin ergonomics.
-- The previous migration defined these contracts with narrower return types. PostgreSQL cannot replace a function when its RETURNS TABLE changes, so remove the old signatures before redefining them.
drop function if exists public.get_next_question(uuid,text,text);
drop function if exists public.admin_get_question(uuid);
drop function if exists public.update_question_draft(uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]);

-- This migration intentionally adds capabilities without requiring destructive changes.

alter table public.questions
  add column if not exists workflow_status text not null default 'draft'
  check (workflow_status in ('draft','in_review','published','archived'));

alter table public.questions
  add column if not exists content_code text;

create unique index if not exists questions_content_code_uidx
  on public.questions(content_code)
  where content_code is not null;

update public.questions
set workflow_status = case when is_published then 'published' else 'draft' end
where workflow_status = 'draft';

-- Stable human-facing identifiers make support, imports and AI-assisted maintenance safer.
create or replace function public.next_content_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := 'Q-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    exit when not exists(select 1 from public.questions where content_code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke all on function public.next_content_code() from public;

update public.questions
set content_code = public.next_content_code()
where content_code is null;

-- Permission matrix: roles remain small and human-readable, while permissions are the stable contract.
create table if not exists public.permissions (
  key text primary key,
  description text not null
);

create table if not exists public.role_permissions (
  role public.user_role not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role, permission_key)
);

insert into public.permissions(key, description) values
  ('content.read', 'Read Content Studio content'),
  ('content.write', 'Create and edit content drafts'),
  ('content.review', 'Review and publish medical content'),
  ('content.archive', 'Archive content'),
  ('media.write', 'Create and edit media assets'),
  ('team.read', 'Read the staff directory'),
  ('team.manage', 'Change staff roles'),
  ('audit.read', 'Read content audit logs')
on conflict(key) do nothing;

insert into public.role_permissions(role, permission_key) values
  ('admin','content.read'),('admin','content.write'),('admin','content.review'),('admin','content.archive'),('admin','media.write'),('admin','team.read'),('admin','team.manage'),('admin','audit.read'),
  ('editor','content.read'),('editor','content.write'),('editor','media.write'),
  ('reviewer','content.read'),('reviewer','content.review'),
  ('support','content.read'),('support','team.read')
on conflict do nothing;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.id = auth.uid() and rp.permission_key = p_permission
  );
$$;
revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Staff directory access must not query profiles from inside the profiles RLS policy.
drop policy if exists "admins read staff directory" on public.profiles;
create policy "admins read staff directory" on public.profiles for select to authenticated using (
  id = auth.uid() or public.has_permission('team.read')
);

-- Replace broad role checks with permission contracts while preserving existing helper names.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_permission('content.read');
$$;
create or replace function public.can_edit_content()
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_permission('content.write');
$$;
create or replace function public.can_review_content()
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_permission('content.review');
$$;
revoke all on function public.is_staff() from public;
revoke all on function public.can_edit_content() from public;
revoke all on function public.can_review_content() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.can_edit_content() to authenticated;
grant execute on function public.can_review_content() to authenticated;

-- Admin list/search contract. Keep the client ignorant of table layout so future schema changes stay local.
create or replace function public.admin_search_questions(
  p_search text default null,
  p_status text default null,
  p_exam_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  content_code text,
  exam_id uuid,
  stem text,
  subject text,
  topic text,
  difficulty smallint,
  workflow_status text,
  is_published boolean,
  updated_at timestamptz,
  version_count bigint
)
language sql stable security definer set search_path=public as $$
  select q.id, q.content_code, q.exam_id, q.stem, q.subject, q.topic, q.difficulty,
         q.workflow_status, q.is_published, q.updated_at,
         (select count(*) from public.question_versions v where v.question_id=q.id) as version_count
  from public.questions q
  where public.is_staff()
    and (nullif(trim(p_search),'') is null or q.content_code ilike '%'||trim(p_search)||'%' or q.stem ilike '%'||trim(p_search)||'%' or q.subject ilike '%'||trim(p_search)||'%' or coalesce(q.topic,'') ilike '%'||trim(p_search)||'%')
    and (nullif(p_status,'') is null or q.workflow_status=p_status)
    and (p_exam_id is null or q.exam_id=p_exam_id)
  order by q.updated_at desc
  limit least(greatest(coalesce(p_limit,50),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_search_questions(text,text,uuid,integer,integer) from public;
grant execute on function public.admin_search_questions(text,text,uuid,integer,integer) to authenticated;

-- Saving a draft never accidentally submits it for review.
create or replace function public.update_question_draft(
  p_question_id uuid, p_exam_id uuid, p_stem text, p_subject text, p_topic text,
  p_options jsonb, p_answer_key text, p_explanation text, p_key_learning_point text,
  p_difficulty smallint, p_media_ids uuid[] default '{}'
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_next integer;
  v_version_id uuid;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.questions where id=p_question_id) then raise exception 'question_not_found'; end if;
  if not exists(select 1 from public.exams where id=p_exam_id) then raise exception 'exam_not_found'; end if;
  if jsonb_typeof(p_options)<>'array' or jsonb_array_length(p_options)<2 then raise exception 'invalid_options'; end if;
  if not exists(select 1 from jsonb_array_elements(p_options) x where x->>'id'=p_answer_key) then raise exception 'answer_not_in_options'; end if;

  select coalesce(max(version_no),0)+1 into v_next from public.question_versions where question_id=p_question_id;
  insert into public.question_versions(question_id,version_no,stem,subject,topic,options,answer_key,explanation,key_learning_point,difficulty,created_by)
  values(p_question_id,v_next,p_stem,p_subject,nullif(p_topic,''),p_options,p_answer_key,p_explanation,p_key_learning_point,p_difficulty,auth.uid())
  returning id into v_version_id;

  delete from public.question_media where question_id=p_question_id;
  if coalesce(array_length(p_media_ids,1),0)>0 then
    insert into public.question_media(question_id,media_id,position)
    select p_question_id,x,row_number() over()-1 from unnest(p_media_ids) as x;
  end if;

  update public.questions set exam_id=p_exam_id,stem=p_stem,subject=p_subject,topic=nullif(p_topic,''),options=p_options,
    answer_key=p_answer_key,explanation=p_explanation,difficulty=p_difficulty,is_published=false,workflow_status='draft'
  where id=p_question_id;

  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'draft_updated',jsonb_build_object('version_id',v_version_id,'version_no',v_next));
  return v_version_id;
end;
$$;
revoke all on function public.update_question_draft(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) from public;
grant execute on function public.update_question_draft(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) to authenticated;

create or replace function public.submit_question_for_review(p_question_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.questions q where q.id=p_question_id and q.workflow_status='draft') then raise exception 'question_not_draft'; end if;
  update public.questions set workflow_status='in_review' where id=p_question_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'submitted_for_review','{}'::jsonb);
end;
$$;
revoke all on function public.submit_question_for_review(uuid) from public;
grant execute on function public.submit_question_for_review(uuid) to authenticated;

-- Publishing is now explicitly gated on the review state.
create or replace function public.review_question(p_question_id uuid,p_decision text,p_note text default null)
returns void
language plpgsql security definer set search_path=public as $$
declare
  v_version_id uuid;
begin
  if not public.can_review_content() then raise exception 'forbidden'; end if;
  if p_decision not in ('approved','changes_requested','rejected') then raise exception 'invalid_decision'; end if;
  select id into v_version_id from public.question_versions where question_id=p_question_id order by version_no desc limit 1;
  if v_version_id is null then raise exception 'version_not_found'; end if;
  if not exists(select 1 from public.questions where id=p_question_id and workflow_status='in_review') then raise exception 'question_not_in_review'; end if;

  insert into public.content_reviews(question_id,version_id,reviewer_id,decision,note)
  values(p_question_id,v_version_id,auth.uid(),p_decision,p_note);

  if p_decision='approved' then
    update public.questions q set stem=v.stem,subject=v.subject,topic=v.topic,options=v.options,answer_key=v.answer_key,
      explanation=v.explanation,difficulty=v.difficulty,is_published=true,workflow_status='published'
    from public.question_versions v where q.id=p_question_id and v.id=v_version_id;
  elsif p_decision='changes_requested' then
    update public.questions set is_published=false,workflow_status='draft' where id=p_question_id;
  else
    update public.questions set is_published=false,workflow_status='archived' where id=p_question_id;
  end if;

  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'reviewed',jsonb_build_object('decision',p_decision,'version_id',v_version_id));
end;
$$;
revoke all on function public.review_question(uuid,text,text) from public;
grant execute on function public.review_question(uuid,text,text) to authenticated;

create or replace function public.admin_archive_question(p_question_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('content.archive') then raise exception 'forbidden'; end if;
  update public.questions set is_published=false,workflow_status='archived' where id=p_question_id;
  if not found then raise exception 'question_not_found'; end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'archived','{}'::jsonb);
end;
$$;
revoke all on function public.admin_archive_question(uuid) from public;
grant execute on function public.admin_archive_question(uuid) to authenticated;

create or replace function public.admin_duplicate_question(p_question_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_new uuid;
  v_version public.question_versions%rowtype;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  select * into v_version from public.question_versions where question_id=p_question_id order by version_no desc limit 1;
  if v_version.id is null then raise exception 'version_not_found'; end if;
  insert into public.questions(content_code,exam_id,stem,subject,topic,options,answer_key,explanation,difficulty,is_published,workflow_status,access_tier)
  select public.next_content_code(),q.exam_id,v_version.stem,v_version.subject,v_version.topic,v_version.options,v_version.answer_key,v_version.explanation,v_version.difficulty,false,'draft',q.access_tier
  from public.questions q where q.id=p_question_id returning id into v_new;
  insert into public.question_versions(question_id,version_no,stem,subject,topic,options,answer_key,explanation,key_learning_point,difficulty,created_by)
  values(v_new,1,v_version.stem,v_version.subject,v_version.topic,v_version.options,v_version.answer_key,v_version.explanation,v_version.key_learning_point,v_version.difficulty,auth.uid());
  insert into public.question_media(question_id,media_id,position,caption)
  select v_new,media_id,position,caption from public.question_media where question_id=p_question_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',v_new,'duplicated',jsonb_build_object('source_question_id',p_question_id));
  return v_new;
end;
$$;
revoke all on function public.admin_duplicate_question(uuid) from public;
grant execute on function public.admin_duplicate_question(uuid) to authenticated;

-- Media search contract includes usage count, so editors can safely reuse rather than duplicate assets.
create or replace function public.admin_search_media(p_search text default null,p_kind text default null,p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,kind text,title text,external_url text,storage_path text,license_name text,copyright_status text,attribution_required boolean,usage_count bigint,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select m.id,m.kind,m.title,m.external_url,m.storage_path,m.license_name,m.copyright_status,m.attribution_required,
    (select count(*) from public.question_media qm where qm.media_id=m.id) as usage_count,m.created_at
  from public.media_assets m
  where public.is_staff()
    and (nullif(trim(p_search),'') is null or m.title ilike '%'||trim(p_search)||'%' or coalesce(m.license_name,'') ilike '%'||trim(p_search)||'%')
    and (nullif(p_kind,'') is null or m.kind=p_kind)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),200)
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_search_media(text,text,integer,integer) from public;
grant execute on function public.admin_search_media(text,text,integer,integer) to authenticated;

-- Prevent the last administrator from accidentally locking the product out.
create or replace function public.admin_set_user_role(p_user_id uuid,p_role public.user_role)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_old public.user_role;
  v_admin_count integer;
begin
  if not public.has_permission('team.manage') then raise exception 'forbidden'; end if;
  if p_user_id=auth.uid() then raise exception 'self_role_change_forbidden'; end if;
  select role into v_old from public.profiles where id=p_user_id;
  if v_old is null then raise exception 'user_not_found'; end if;
  if v_old='admin' and p_role<>'admin' then
    select count(*) into v_admin_count from public.profiles where role='admin';
    if v_admin_count<=1 then raise exception 'last_admin_protected'; end if;
  end if;
  update public.profiles set role=p_role where id=p_user_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,'role_changed',jsonb_build_object('from',v_old,'to',p_role));
end;
$$;
revoke all on function public.admin_set_user_role(uuid,public.user_role) from public;
grant execute on function public.admin_set_user_role(uuid,public.user_role) to authenticated;

-- Keep the public projection free/premium-aware and exclude every private editorial field.
drop view if exists public.question_public;
create view public.question_public as
select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.difficulty,
  coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'title',m.title,'alt_text',m.alt_text,'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position) filter(where m.id is not null),'[]'::jsonb) as media
from public.questions q left join public.question_media qm on qm.question_id=q.id left join public.media_assets m on m.id=qm.media_id
where q.is_published=true and (q.access_tier='free' or public.has_active_subscription())
group by q.id;
grant select on public.question_public to authenticated;

-- Database-level safety for role metadata.
create policy "staff can read permission catalog" on public.permissions for select to authenticated using (public.is_staff());
create policy "staff can read role permissions" on public.role_permissions for select to authenticated using (public.is_staff());

-- Tighten direct table access: students/support must never be able to read answer keys or editorial snapshots.
drop policy if exists "staff read question metadata" on public.questions;
drop policy if exists "staff read question versions" on public.question_versions;
create policy "editors and reviewers read question versions" on public.question_versions
  for select to authenticated using (public.can_edit_content() or public.can_review_content());

-- The application API uses RPC contracts for question reads/writes.
-- Do not grant table-level SELECT on questions/question_versions to authenticated users.
revoke select on public.questions from authenticated;
revoke select on public.question_versions from authenticated;

-- Create question with a stable code and an explicit draft workflow state.
create or replace function public.create_question(
  p_exam_id uuid,p_stem text,p_subject text,p_topic text,p_options jsonb,p_answer_key text,
  p_explanation text,p_key_learning_point text,p_difficulty smallint,p_media_ids uuid[] default '{}'
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_question_id uuid; v_version_id uuid;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.exams where id=p_exam_id) then raise exception 'exam_not_found'; end if;
  if jsonb_typeof(p_options)<>'array' or jsonb_array_length(p_options)<2 then raise exception 'invalid_options'; end if;
  if not exists(select 1 from jsonb_array_elements(p_options) x where x->>'id'=p_answer_key) then raise exception 'answer_not_in_options'; end if;
  insert into public.questions(content_code,exam_id,stem,subject,topic,options,answer_key,explanation,difficulty,is_published,workflow_status,access_tier)
  values(public.next_content_code(),p_exam_id,p_stem,p_subject,nullif(p_topic,''),p_options,p_answer_key,p_explanation,p_difficulty,false,'draft','free')
  returning id into v_question_id;
  insert into public.question_versions(question_id,version_no,stem,subject,topic,options,answer_key,explanation,key_learning_point,difficulty,created_by)
  values(v_question_id,1,p_stem,p_subject,nullif(p_topic,''),p_options,p_answer_key,p_explanation,p_key_learning_point,p_difficulty,auth.uid())
  returning id into v_version_id;
  if coalesce(array_length(p_media_ids,1),0)>0 then
    insert into public.question_media(question_id,media_id,position)
    select v_question_id,x,row_number() over()-1 from unnest(p_media_ids) as x;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',v_question_id,'created',jsonb_build_object('version_id',v_version_id,'content_code',(select content_code from public.questions where id=v_question_id)));
  return v_question_id;
end;
$$;
revoke all on function public.create_question(uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) from public;
grant execute on function public.create_question(uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) to authenticated;

-- Import is atomic, assigns stable content codes, and always creates drafts.
create or replace function public.import_questions(p_items jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare item jsonb; v_count integer:=0; v_question_id uuid; v_version_id uuid; v_options jsonb; v_answer text; v_exam uuid; v_difficulty smallint;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'payload_must_be_array'; end if;
  if jsonb_array_length(p_items)>2000 then raise exception 'import_limit_exceeded'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    v_exam:=(item->>'examId')::uuid; v_options:=item->'options'; v_answer:=item->>'answerKey'; v_difficulty:=coalesce((item->>'difficulty')::smallint,3);
    if not exists(select 1 from public.exams where id=v_exam) then raise exception 'exam_not_found'; end if;
    if jsonb_typeof(v_options)<>'array' or jsonb_array_length(v_options)<2 then raise exception 'invalid_options'; end if;
    if not exists(select 1 from jsonb_array_elements(v_options) x where x->>'id'=v_answer) then raise exception 'answer_not_in_options'; end if;
    if v_difficulty<1 or v_difficulty>5 then raise exception 'invalid_difficulty'; end if;
    insert into public.questions(content_code,exam_id,stem,subject,topic,options,answer_key,explanation,difficulty,is_published,workflow_status,access_tier)
    values(public.next_content_code(),v_exam,item->>'stem',item->>'subject',nullif(item->>'topic',''),v_options,v_answer,item->>'explanation',v_difficulty,false,'draft','free')
    returning id into v_question_id;
    insert into public.question_versions(question_id,version_no,stem,subject,topic,options,answer_key,explanation,key_learning_point,difficulty,created_by)
    values(v_question_id,1,item->>'stem',item->>'subject',nullif(item->>'topic',''),v_options,v_answer,item->>'explanation',item->>'keyLearningPoint',v_difficulty,auth.uid())
    returning id into v_version_id;
    if jsonb_typeof(item->'mediaIds')='array' then
      insert into public.question_media(question_id,media_id,position)
      select v_question_id,(x::text)::uuid,row_number() over()-1 from jsonb_array_elements_text(item->'mediaIds') x;
    end if;
    insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
    values(auth.uid(),'question',v_question_id,'imported',jsonb_build_object('version_id',v_version_id));
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.import_questions(jsonb) from public;
grant execute on function public.import_questions(jsonb) to authenticated;

-- Keep admin question list compatible with the original callers while using workflow status.
create or replace function public.admin_list_questions(p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,exam_id uuid,stem text,subject text,topic text,difficulty smallint,is_published boolean,updated_at timestamptz)
language sql stable security definer set search_path=public as $$
  select q.id,q.exam_id,q.stem,q.subject,q.topic,q.difficulty,q.is_published,q.updated_at
  from public.questions q where public.is_staff()
  order by q.updated_at desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_list_questions(integer,integer) from public;
grant execute on function public.admin_list_questions(integer,integer) to authenticated;

-- Prevent accidental use of the old direct-table answer path.
revoke select on public.questions from anon,authenticated;
revoke select on public.question_versions from anon,authenticated;

-- Lightweight database-backed rate limiting for authenticated mutation endpoints.
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0)
);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(p_action text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_key text; v_hits integer; v_started timestamptz; v_now timestamptz:=now();
begin
  if auth.uid() is null then return false; end if;
  if p_action is null or p_action not in ('qbank_answer','qbank_next','flashcard_review','admin_write','admin_upload','auth_mutation') then return false; end if;
  if p_limit<1 or p_window_seconds<1 or p_window_seconds>3600 then return false; end if;
  v_key:=auth.uid()::text||':'||p_action;
  insert into public.rate_limit_buckets(bucket_key,window_started,hits)
  values(v_key,v_now,1)
  on conflict(bucket_key) do update set
    window_started=case when public.rate_limit_buckets.window_started <= v_now - make_interval(secs=>p_window_seconds) then v_now else public.rate_limit_buckets.window_started end,
    hits=case when public.rate_limit_buckets.window_started <= v_now - make_interval(secs=>p_window_seconds) then 1 else public.rate_limit_buckets.hits+1 end
  returning hits,window_started into v_hits,v_started;
  return v_hits<=p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,integer,integer) to authenticated;

-- Privileged question reads are limited to editorial/review roles; support remains metadata-only.
create or replace function public.admin_get_question(p_question_id uuid)
returns table(id uuid,content_code text,exam_id uuid,stem text,subject text,topic text,options jsonb,answer_key text,explanation text,key_learning_point text,difficulty smallint,workflow_status text,is_published boolean,media_ids uuid[],version_no integer)
language sql stable security definer set search_path=public as $$
  select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.answer_key,q.explanation,v.key_learning_point,q.difficulty,q.workflow_status,q.is_published,
    coalesce(array_agg(qm.media_id order by qm.position) filter(where qm.media_id is not null),'{}'),v.version_no
  from public.questions q
  left join lateral(select qv.key_learning_point,qv.version_no from public.question_versions qv where qv.question_id=q.id order by qv.version_no desc limit 1)v on true
  left join public.question_media qm on qm.question_id=q.id
  where (public.can_edit_content() or public.can_review_content()) and q.id=p_question_id
  group by q.id,v.key_learning_point,v.version_no;
$$;
revoke all on function public.admin_get_question(uuid) from public;
grant execute on function public.admin_get_question(uuid) to authenticated;

-- Attempt integrity: students may not submit their own correctness value. Only the answer RPC creates attempts.
drop policy if exists "users create own attempts" on public.question_attempts;
revoke insert on public.question_attempts from authenticated;

-- Answer submission must use an option that actually exists on the question.
create or replace function public.submit_question_answer(p_question_id uuid,p_selected_answer text,p_duration_ms integer default null,p_confidence smallint default null)
returns table(is_correct boolean,explanation text,key_learning_point text)
language plpgsql security definer set search_path=public as $$
declare v_correct text;v_explanation text;v_learning text;v_is_correct boolean;v_tier text;v_options jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence<1 or p_confidence>5) then raise exception 'invalid_confidence'; end if;
  select q.answer_key,q.explanation,q.access_tier,v.key_learning_point,q.options into v_correct,v_explanation,v_tier,v_learning,v_options
  from public.questions q left join lateral(select key_learning_point from public.question_versions qv where qv.question_id=q.id order by qv.version_no desc limit 1)v on true
  where q.id=p_question_id and q.is_published=true and q.workflow_status='published';
  if not found then raise exception 'question_not_available'; end if;
  if v_tier='premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if not exists(select 1 from jsonb_array_elements(v_options) option where option->>'id'=p_selected_answer) then raise exception 'invalid_answer_option'; end if;
  v_is_correct:=p_selected_answer=v_correct;
  insert into public.question_attempts(user_id,question_id,selected_answer,is_correct,duration_ms,confidence)
  values(auth.uid(),p_question_id,p_selected_answer,v_is_correct,p_duration_ms,p_confidence);
  return query select v_is_correct,v_explanation,v_learning;
end;
$$;
revoke all on function public.submit_question_answer(uuid,text,integer,smallint) from public;
grant execute on function public.submit_question_answer(uuid,text,integer,smallint) to authenticated;

-- Randomized question delivery is intentionally volatile because it uses random().
create or replace function public.get_next_question(p_exam_id uuid default null,p_subject text default null,p_topic text default null)
returns table(id uuid,content_code text,exam_id uuid,stem text,subject text,topic text,options jsonb,difficulty smallint,media jsonb)
language plpgsql volatile security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.difficulty,
    coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'title',m.title,'alt_text',m.alt_text,'external_url',m.external_url,'storage_path',m.storage_path,'caption',qm.caption,'position',qm.position) order by qm.position)
      from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb)
  from public.questions q
  where q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (p_exam_id is null or q.exam_id=p_exam_id)
    and (p_subject is null or p_subject='' or q.subject=p_subject)
    and (p_topic is null or p_topic='' or q.topic=p_topic)
  order by random() limit 1;
end;
$$;
revoke all on function public.get_next_question(uuid,text,text) from public;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;

create or replace function public.admin_content_counts()
returns table(total_questions bigint,draft_questions bigint,in_review_questions bigint,published_questions bigint,archived_questions bigint,media_assets bigint,review_events bigint)
language sql stable security definer set search_path=public as $$
  select
    (select count(*) from public.questions where public.is_staff()),
    (select count(*) from public.questions where public.is_staff() and workflow_status='draft'),
    (select count(*) from public.questions where public.is_staff() and workflow_status='in_review'),
    (select count(*) from public.questions where public.is_staff() and workflow_status='published'),
    (select count(*) from public.questions where public.is_staff() and workflow_status='archived'),
    (select count(*) from public.media_assets where public.is_staff()),
    (select count(*) from public.content_reviews where public.is_staff());
$$;
revoke all on function public.admin_content_counts() from public;
grant execute on function public.admin_content_counts() to authenticated;

-- Application code uses narrow RPC/view contracts. Remove broad authenticated table reads from content internals.
revoke select on public.media_assets, public.media_sources, public.question_media, public.content_reviews, public.content_audit_logs from authenticated;

create or replace function public.can_read_medical_media(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.media_assets m
    join public.question_media qm on qm.media_id=m.id
    join public.questions q on q.id=qm.question_id
    where m.storage_path=p_storage_path and q.is_published=true
      and (q.access_tier='free' or public.has_active_subscription())
  );
$$;
revoke all on function public.can_read_medical_media(text) from public;
grant execute on function public.can_read_medical_media(text) to authenticated;

drop policy if exists "entitled users read linked medical media" on storage.objects;
create policy "entitled users read linked medical media" on storage.objects for select to authenticated
using (bucket_id='medical-media' and public.can_read_medical_media(name));
