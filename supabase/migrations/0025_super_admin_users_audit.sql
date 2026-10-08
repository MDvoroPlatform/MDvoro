-- MDvoro Phase 23: super-admin control plane, suspension safety, and audit views.

do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='super_admin') then
    alter type public.user_role add value 'super_admin';
  end if;
end $$;

alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active','suspended')),
  add column if not exists status_reason text,
  add column if not exists suspended_at timestamptz;
create index if not exists profiles_status_idx on public.profiles(account_status,created_at desc);

insert into public.permissions(key,description) values
 ('platform.users','View and manage learner accounts'),
 ('platform.users.suspend','Suspend or reactivate learner accounts'),
 ('platform.users.delete','Delete learner accounts'),
 ('platform.revenue','Read revenue and billing metrics'),
 ('platform.audit','Read platform audit and security history'),
 ('platform.system','Read platform operational metrics')
on conflict(key) do nothing;

insert into public.role_permissions(role,permission_key) values
 ('admin','platform.users'),('admin','platform.users.suspend'),('admin','platform.revenue'),('admin','platform.audit'),('admin','platform.system')
on conflict do nothing;

create or replace function public.is_account_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active');
$$;
revoke all on function public.is_account_active() from public,anon;
grant execute on function public.is_account_active() to authenticated;

create or replace function public.admin_list_users(p_search text default null,p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,email text,full_name text,role text,account_status text,status_reason text,created_at timestamptz,last_seen_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id,u.email,p.full_name,p.role::text,p.account_status,p.status_reason,p.created_at,up.last_seen_at
  from public.profiles p join auth.users u on u.id=p.id
  left join public.user_presence up on up.user_id=p.id
  where public.has_permission('platform.users')
    and (nullif(trim(p_search),'') is null or coalesce(u.email,'') ilike '%'||trim(p_search)||'%' or coalesce(p.full_name,'') ilike '%'||trim(p_search)||'%')
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),200)
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_list_users(text,integer,integer) from public,anon;
grant execute on function public.admin_list_users(text,integer,integer) to authenticated;

create or replace function public.admin_set_user_role_v2(p_user_id uuid,p_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor public.user_role; v_target public.user_role;
begin
  select role into v_actor from public.profiles where id=auth.uid();
  if v_actor is null then raise exception 'forbidden'; end if;
  if p_user_id=auth.uid() then raise exception 'self_role_change_forbidden'; end if;
  select role into v_target from public.profiles where id=p_user_id;
  if v_target is null then raise exception 'user_not_found'; end if;
  if p_role='super_admin' and v_actor<>'super_admin' then raise exception 'super_admin_required'; end if;
  if v_target='super_admin' and v_actor<>'super_admin' then raise exception 'super_admin_required'; end if;
  if v_actor='admin' and p_role='admin' then raise exception 'super_admin_required'; end if;
  if v_actor='admin' and v_target='admin' then raise exception 'super_admin_required'; end if;
  if not public.has_permission('team.manage') then raise exception 'forbidden'; end if;
  update public.profiles set role=p_role where id=p_user_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,'role_changed',jsonb_build_object('from',v_target,'to',p_role));
end;
$$;
revoke all on function public.admin_set_user_role_v2(uuid,public.user_role) from public,anon;
grant execute on function public.admin_set_user_role_v2(uuid,public.user_role) to authenticated;

create or replace function public.admin_set_user_status(p_user_id uuid,p_status text,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target public.user_role;
begin
  if not public.has_permission('platform.users.suspend') then raise exception 'forbidden'; end if;
  if p_user_id=auth.uid() then raise exception 'self_status_change_forbidden'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid_status'; end if;
  select role into v_target from public.profiles where id=p_user_id;
  if v_target is null then raise exception 'user_not_found'; end if;
  if v_target in ('admin','super_admin') and (select role from public.profiles where id=auth.uid())<>'super_admin' then raise exception 'super_admin_required'; end if;
  update public.profiles set account_status=p_status,status_reason=nullif(trim(coalesce(p_reason,'')),''),suspended_at=case when p_status='suspended' then now() else null end where id=p_user_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,case when p_status='suspended' then 'user_suspended' else 'user_reactivated' end,jsonb_build_object('reason',p_reason));
end;
$$;
revoke all on function public.admin_set_user_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target public.user_role; v_super_count bigint;
begin
  if not public.has_permission('platform.users.delete') then raise exception 'forbidden'; end if;
  if p_user_id=auth.uid() then raise exception 'use_self_delete'; end if;
  select role into v_target from public.profiles where id=p_user_id;
  if v_target is null then raise exception 'user_not_found'; end if;
  if v_target in ('admin','super_admin') and (select role from public.profiles where id=auth.uid())<>'super_admin' then raise exception 'super_admin_required'; end if;
  if v_target='super_admin' then
    select count(*) into v_super_count from public.profiles where role='super_admin' and account_status='active';
    if v_super_count<=1 then raise exception 'last_super_admin'; end if;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,'user_deleted','{}'::jsonb);
  delete from auth.users where id=p_user_id;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public,anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_audit_feed(p_limit integer default 100)
returns table(id bigint,actor_id uuid,entity_type text,entity_id uuid,action text,metadata jsonb,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id,l.actor_id,l.entity_type,l.entity_id,l.action,l.metadata,l.created_at
  from public.content_audit_logs l where public.has_permission('platform.audit') order by l.created_at desc limit least(greatest(coalesce(p_limit,100),1),200);
$$;
revoke all on function public.admin_audit_feed(integer) from public,anon;
grant execute on function public.admin_audit_feed(integer) to authenticated;

-- Correct the legacy admin role mutator so old callers cannot bypass the hierarchy.
create or replace function public.admin_set_user_role(p_user_id uuid,p_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_set_user_role_v2(p_user_id,p_role);
end;
$$;
revoke all on function public.admin_set_user_role(uuid,public.user_role) from public,anon;
grant execute on function public.admin_set_user_role(uuid,public.user_role) to authenticated;

-- Keep account status enforced for all new exam/session writes.
create or replace function public.start_study_session(
  p_exam_id uuid,p_subjects text[] default '{}',p_topics text[] default '{}',p_question_count integer default 20,p_mode public.study_session_mode default 'practice'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer)
language plpgsql volatile security definer set search_path = '' as $$
declare v_exam record; v_session uuid; v_total integer; v_time integer;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count<1 or p_question_count>300 then raise exception 'invalid_question_count'; end if;
  select e.id,e.code,ep.* into v_exam from public.exams e join public.exam_profiles ep on ep.exam_id=e.id where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_mode='exam' and p_question_count>v_exam.max_items then raise exception 'exam_question_limit'; end if;
  v_time := case when p_mode='practice' then null else least(v_exam.total_duration_minutes*60,greatest(v_exam.block_duration_minutes*60,ceil(p_question_count::numeric/v_exam.block_max_items)::integer*v_exam.block_duration_minutes*60)) end;
  select count(*) into v_total from public.questions q where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics));
  if v_total<p_question_count then raise exception 'insufficient_questions'; end if;
  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,configuration)
  values(auth.uid(),p_exam_id,p_mode,p_question_count,v_time,jsonb_build_object('subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),'exam_code',v_exam.code)) returning id into v_session;
  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,ceil(row_number() over(order by random())::numeric/v_exam.block_max_items)::int,q.id
    from public.questions q where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
      and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics)) order by random() limit p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by adaptive_score desc,random())::int,ceil(row_number() over(order by adaptive_score desc,random())::numeric/v_exam.block_max_items)::int,q.id
    from (
      select q,(case when coalesce(qs.attempts,0)=0 then 1000 else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4 end)
        + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end adaptive_score
      from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    ) q order by adaptive_score desc,random() limit p_question_count;
  end if;
  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count));
  return query select v_session,v_time,v_exam.block_count,v_exam.block_duration_minutes,v_exam.block_max_items;
end;
$$;
revoke all on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode) from public,anon;
grant execute on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode) to authenticated;

-- Expand the immutable learning-event vocabulary for session lifecycle tracking.
alter table public.learning_events drop constraint if exists learning_events_event_type_check;
alter table public.learning_events add constraint learning_events_event_type_check check (event_type in ('question_answered','flashcard_reviewed','study_plan_changed','exam_selected','study_session_started','study_session_completed'));

create or replace function public.record_learning_event(p_user_id uuid,p_event_type text,p_entity_type text,p_entity_id uuid,p_source_id uuid,p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_user_id is null then raise exception 'learning_event_user_required'; end if;
  if p_event_type not in ('question_answered','flashcard_reviewed','study_plan_changed','exam_selected','study_session_started','study_session_completed') then raise exception 'learning_event_type_invalid'; end if;
  insert into public.learning_events(user_id,event_type,entity_type,entity_id,payload,source_id) values(p_user_id,p_event_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),p_source_id) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_learning_event(uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.finish_study_session(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; v_total integer; v_answered integer; v_correct integer; v_score numeric; v_status text;
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status='in_progress' then
    select count(*),count(*) filter(where is_correct is not null),count(*) filter(where is_correct=true) into v_total,v_answered,v_correct from public.study_session_items where session_id=p_session_id;
    v_score:=case when v_total=0 then 0 else round((v_correct::numeric/v_total::numeric)*100,2) end;
    update public.study_sessions set status='completed',finished_at=now(),score_percent=v_score,correct_count=v_correct,answered_count=v_answered where id=p_session_id;
    v_status:='completed';
    perform public.record_learning_event(auth.uid(),'study_session_completed','study_session',p_session_id,p_session_id,jsonb_build_object('score_percent',v_score,'correct_count',v_correct,'answered_count',v_answered,'total_questions',v_total));
  else
    v_total:=s.requested_count;v_answered:=s.answered_count;v_correct:=s.correct_count;v_score:=s.score_percent;v_status:=s.status::text;
  end if;
  return jsonb_build_object('session_id',p_session_id,'status',v_status,'total_questions',v_total,'answered_count',v_answered,'correct_count',v_correct,'unanswered_count',v_total-v_answered,'score_percent',v_score);
end;
$$;
revoke all on function public.finish_study_session(uuid) from public,anon;
grant execute on function public.finish_study_session(uuid) to authenticated;

-- Safer answer mutation: client mutation IDs are bound to the exact session item.
create or replace function public.submit_study_session_answer(
  p_session_id uuid,p_position integer,p_selected_answer text,p_duration_ms integer default null,p_confidence smallint default null,p_client_mutation_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; si record; q record; v_attempt uuid; v_correct boolean;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  select ss.*,ep.previous_block_review_allowed into s from public.study_sessions ss join public.exam_profiles ep on ep.exam_id=ss.exam_id where ss.id=p_session_id and ss.user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status<>'in_progress' then raise exception 'session_not_active'; end if;
  if s.mode='exam' and s.time_limit_seconds is not null and now()>s.started_at+make_interval(secs=>s.time_limit_seconds) then update public.study_sessions set status='expired',finished_at=now() where id=p_session_id;raise exception 'session_expired'; end if;
  select * into si from public.study_session_items where session_id=p_session_id and position=p_position for update;
  if not found then raise exception 'session_item_not_found'; end if;
  if s.mode='exam' and not s.previous_block_review_allowed then
    if extract(epoch from now()-s.started_at) >= (si.block_number*s.block_duration_minutes*60) then raise exception 'block_closed'; end if;
  end if;
  if p_client_mutation_id is not null then
    select id,is_correct,session_item_id into v_attempt,v_correct,v_attempt from public.question_attempts where user_id=auth.uid() and client_mutation_id=p_client_mutation_id;
    if v_attempt is not null then
      if not exists(select 1 from public.question_attempts qa where qa.id=v_attempt and qa.session_item_id=si.id) then raise exception 'mutation_id_reused'; end if;
      return jsonb_build_object('already_answered',true,'is_correct',v_correct);
    end if;
  end if;
  if si.is_correct is not null then return jsonb_build_object('already_answered',true,'is_correct',si.is_correct,'selected_answer',si.selected_answer); end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence<1 or p_confidence>5) then raise exception 'invalid_confidence'; end if;
  select * into q from public.questions where id=si.question_id and is_published and workflow_status='published';
  if not found then raise exception 'question_not_available'; end if;
  if q.access_tier='premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=p_selected_answer) then raise exception 'invalid_answer_option'; end if;
  v_correct:=p_selected_answer=q.answer_key;
  insert into public.question_attempts(user_id,question_id,session_id,session_item_id,selected_answer,is_correct,duration_ms,confidence,client_mutation_id)
  values(auth.uid(),q.id,p_session_id,si.id,p_selected_answer,v_correct,p_duration_ms,p_confidence,p_client_mutation_id)
  on conflict (session_item_id) do nothing returning id into v_attempt;
  if v_attempt is null then select is_correct into v_correct from public.question_attempts where session_item_id=si.id; return jsonb_build_object('already_answered',true,'is_correct',v_correct); end if;
  update public.study_session_items set selected_answer=p_selected_answer,is_correct=v_correct,duration_ms=p_duration_ms,confidence=p_confidence,answered_at=now() where id=si.id;
  update public.study_sessions set answered_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct is not null),correct_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct=true),current_position=greatest(current_position,least(p_position,requested_count)) where id=p_session_id;
  return jsonb_build_object('already_answered',false,'is_correct',v_correct,'correct_answer',q.answer_key,'explanation',q.explanation,'key_learning_point',(select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1),'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end));
end;
$$;
revoke all on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) from public,anon;
grant execute on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) to authenticated;

-- Correct the session state join after key-terms introduction.

-- Fix client-mutation reuse handling: preserve both attempt and session-item identities.
create or replace function public.submit_study_session_answer(
  p_session_id uuid,p_position integer,p_selected_answer text,p_duration_ms integer default null,p_confidence smallint default null,p_client_mutation_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; si record; q record; v_attempt uuid; v_existing_item uuid; v_correct boolean;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  select ss.*,ep.previous_block_review_allowed into s from public.study_sessions ss join public.exam_profiles ep on ep.exam_id=ss.exam_id where ss.id=p_session_id and ss.user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status<>'in_progress' then raise exception 'session_not_active'; end if;
  if s.mode='exam' and s.time_limit_seconds is not null and now()>s.started_at+make_interval(secs=>s.time_limit_seconds) then update public.study_sessions set status='expired',finished_at=now() where id=p_session_id;raise exception 'session_expired'; end if;
  select * into si from public.study_session_items where session_id=p_session_id and position=p_position for update;
  if not found then raise exception 'session_item_not_found'; end if;
  if s.mode='exam' and not s.previous_block_review_allowed and extract(epoch from now()-s.started_at) >= (si.block_number*s.block_duration_minutes*60) then raise exception 'block_closed'; end if;
  if p_client_mutation_id is not null then
    select qa.id,qa.session_item_id,qa.is_correct into v_attempt,v_existing_item,v_correct from public.question_attempts qa where qa.user_id=auth.uid() and qa.client_mutation_id=p_client_mutation_id;
    if v_attempt is not null then
      if v_existing_item<>si.id then raise exception 'mutation_id_reused'; end if;
      return jsonb_build_object('already_answered',true,'is_correct',v_correct);
    end if;
  end if;
  if si.is_correct is not null then return jsonb_build_object('already_answered',true,'is_correct',si.is_correct,'selected_answer',si.selected_answer); end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence<1 or p_confidence>5) then raise exception 'invalid_confidence'; end if;
  select * into q from public.questions where id=si.question_id and is_published and workflow_status='published';
  if not found then raise exception 'question_not_available'; end if;
  if q.access_tier='premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=p_selected_answer) then raise exception 'invalid_answer_option'; end if;
  v_correct:=p_selected_answer=q.answer_key;
  insert into public.question_attempts(user_id,question_id,session_id,session_item_id,selected_answer,is_correct,duration_ms,confidence,client_mutation_id)
  values(auth.uid(),q.id,p_session_id,si.id,p_selected_answer,v_correct,p_duration_ms,p_confidence,p_client_mutation_id)
  on conflict (session_item_id) do nothing returning id into v_attempt;
  if v_attempt is null then select qa.is_correct into v_correct from public.question_attempts qa where qa.session_item_id=si.id; return jsonb_build_object('already_answered',true,'is_correct',v_correct); end if;
  update public.study_session_items set selected_answer=p_selected_answer,is_correct=v_correct,duration_ms=p_duration_ms,confidence=p_confidence,answered_at=now() where id=si.id;
  update public.study_sessions set answered_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct is not null),correct_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct=true),current_position=greatest(current_position,least(p_position,requested_count)) where id=p_session_id;
  return jsonb_build_object('already_answered',false,'is_correct',v_correct,'correct_answer',q.answer_key,'explanation',q.explanation,'key_learning_point',(select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1),'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end));
end;
$$;
revoke all on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) from public,anon;
grant execute on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) to authenticated;

-- Practical question-pool controls for new sessions.
create or replace function public.start_study_session(
  p_exam_id uuid,p_subjects text[] default '{}',p_topics text[] default '{}',p_question_count integer default 20,p_mode public.study_session_mode default 'practice',p_pool text default 'mixed'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer)
language plpgsql volatile security definer set search_path = '' as $$
declare v_exam record; v_session uuid; v_total integer; v_time integer;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count<1 or p_question_count>300 then raise exception 'invalid_question_count'; end if;
  if p_pool not in ('mixed','unseen','incorrect','answered','bookmarked') then raise exception 'invalid_pool'; end if;
  select e.id,e.code,ep.* into v_exam from public.exams e join public.exam_profiles ep on ep.exam_id=e.id where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_mode='exam' and p_question_count>v_exam.max_items then raise exception 'exam_question_limit'; end if;
  v_time := case when p_mode='practice' then null else least(v_exam.total_duration_minutes*60,greatest(v_exam.block_duration_minutes*60,ceil(p_question_count::numeric/v_exam.block_max_items)::integer*v_exam.block_duration_minutes*60)) end;

  select count(*) into v_total
  from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or (p_pool='answered' and coalesce(qs.attempts,0)>0)
         or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
         or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)));
  if v_total<p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,configuration)
  values(auth.uid(),p_exam_id,p_mode,p_question_count,v_time,jsonb_build_object('subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),'exam_code',v_exam.code,'pool',p_pool)) returning id into v_session;

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,ceil(row_number() over(order by random())::numeric/v_exam.block_max_items)::int,q.id
    from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
      and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
      and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or (p_pool='answered' and coalesce(qs.attempts,0)>0)
        or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
        or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
      ) order by random() limit p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by adaptive_score desc,random())::int,ceil(row_number() over(order by adaptive_score desc,random())::numeric/v_exam.block_max_items)::int,q.id
    from (
      select q,(case when p_pool='unseen' and coalesce(qs.attempts,0)=0 then 5000
                     when p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts then 4000
                     when p_pool='answered' and coalesce(qs.attempts,0)>0 then 2500
                     when p_pool='bookmarked' then 3000
                     when coalesce(qs.attempts,0)=0 then 1000
                     else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4 end)
        + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end adaptive_score
      from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or (p_pool='answered' and coalesce(qs.attempts,0)>0)
          or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
          or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
        )
    ) q order by adaptive_score desc,random() limit p_question_count;
  end if;
  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'pool',p_pool));
  return query select v_session,v_time,v_exam.block_count,v_exam.block_duration_minutes,v_exam.block_max_items;
end;
$$;
revoke all on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) from public,anon;
grant execute on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) to authenticated;
