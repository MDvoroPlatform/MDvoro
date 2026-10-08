-- MDvoro Phase 22: production completion layer.
-- Exam timing correctness, secure result access, admin operations, copyright intake,
-- and explicit RPC grants for future safety.

-- The super_admin enum value was committed by migration 0025. PostgreSQL does
-- not allow a newly added enum label to be used until that transaction commits.
insert into public.role_permissions(role,permission_key)
select 'super_admin'::public.user_role,key from public.permissions
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Exam session correctness
-- -----------------------------------------------------------------------------
create or replace function public.start_study_session(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice',
  p_pool text default 'mixed'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer)
language plpgsql volatile security definer set search_path = '' as $$
declare v_exam record; v_session uuid; v_total integer; v_time integer; v_blocks integer;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count < 1 or p_question_count > 300 then raise exception 'invalid_question_count'; end if;
  if p_pool not in ('mixed','unseen','incorrect','answered','bookmarked') then raise exception 'invalid_pool'; end if;
  select e.id,e.code,ep.* into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_mode='exam' and p_question_count > v_exam.max_items then raise exception 'exam_question_limit'; end if;
  v_blocks := greatest(1,ceil(p_question_count::numeric / v_exam.block_max_items)::integer);
  v_time := case
    when p_mode='practice' then null
    when p_question_count >= v_exam.max_items then v_exam.total_duration_minutes * 60
    else v_blocks * v_exam.block_duration_minutes * 60
  end;

  select count(*) into v_total
  from public.questions q
  left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    and (p_pool='mixed'
      or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
      or (p_pool='answered' and coalesce(qs.attempts,0)>0)
      or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
      or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)));
  if v_total < p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,configuration)
  values(auth.uid(),p_exam_id,p_mode,p_question_count,v_time,jsonb_build_object(
    'subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),
    'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),
    'exam_code',v_exam.code,
    'pool',p_pool,
    'timing_policy',case when p_mode='exam' and p_question_count >= v_exam.max_items then 'official_full_exam_window' else 'scaled_block_pacing' end
  )) returning id into v_session;

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,
      ceil(row_number() over(order by random())::numeric/v_exam.block_max_items)::int,q.id
    from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
      and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
      and (p_pool='mixed'
        or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
        or (p_pool='answered' and coalesce(qs.attempts,0)>0)
        or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
        or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)))
    order by random() limit p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by adaptive_score desc,random())::int,
      ceil(row_number() over(order by adaptive_score desc,random())::numeric/v_exam.block_max_items)::int,q.id
    from (
      select q,(case
        when p_pool='unseen' and coalesce(qs.attempts,0)=0 then 5000
        when p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts then 4000
        when p_pool='answered' and coalesce(qs.attempts,0)>0 then 2500
        when p_pool='bookmarked' then 3000
        when coalesce(qs.attempts,0)=0 then 1000
        else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4 end)
        + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end adaptive_score
      from public.questions q
      left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (p_pool='mixed'
          or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
          or (p_pool='answered' and coalesce(qs.attempts,0)>0)
          or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
          or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)))
    ) q order by adaptive_score desc,random() limit p_question_count;
  end if;

  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'pool',p_pool));
  return query select v_session,v_time,v_exam.block_count,v_exam.block_duration_minutes,v_exam.block_max_items;
end;
$$;
revoke all on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) from public,anon;
grant execute on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) to authenticated;

create or replace function public.submit_study_session_answer(
  p_session_id uuid,p_position integer,p_selected_answer text,p_duration_ms integer default null,p_confidence smallint default null,p_client_mutation_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; si record; q record; v_correct boolean; v_attempt uuid; v_existing_item uuid; v_current_block integer; v_elapsed numeric;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  select ss.*,ep.previous_block_review_allowed,ep.block_count,ep.block_duration_minutes,ep.block_max_items
    into s from public.study_sessions ss join public.exam_profiles ep on ep.exam_id=ss.exam_id
    where ss.id=p_session_id and ss.user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status<>'in_progress' then raise exception 'session_not_active'; end if;
  if s.mode='exam' and s.time_limit_seconds is not null and now()>s.started_at+make_interval(secs=>s.time_limit_seconds) then
    update public.study_sessions set status='expired',finished_at=now() where id=p_session_id;
    raise exception 'session_expired';
  end if;
  select * into si from public.study_session_items where session_id=p_session_id and position=p_position for update;
  if not found then raise exception 'session_item_not_found'; end if;

  if s.mode='exam' and not s.previous_block_review_allowed then
    v_elapsed := greatest(0,extract(epoch from now()-s.started_at));
    v_current_block := least(s.block_count, floor(v_elapsed/(s.block_duration_minutes*60))::integer+1);
    if si.block_number < v_current_block then raise exception 'block_closed'; end if;
    if si.block_number > v_current_block then raise exception 'block_not_open'; end if;
  end if;

  if p_client_mutation_id is not null then
    select qa.id,qa.session_item_id,qa.is_correct into v_attempt,v_existing_item,v_correct
    from public.question_attempts qa where qa.user_id=auth.uid() and qa.client_mutation_id=p_client_mutation_id;
    if v_attempt is not null then
      if v_existing_item<>si.id then raise exception 'mutation_id_reused'; end if;
      return jsonb_build_object('already_answered',true,'is_correct',v_correct,'selected_answer',si.selected_answer);
    end if;
  end if;
  if si.is_correct is not null then return jsonb_build_object('already_answered',true,'is_correct',si.is_correct,'selected_answer',si.selected_answer); end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence<1 or p_confidence>5) then raise exception 'invalid_confidence'; end if;

  select * into q from public.questions where id=si.question_id and is_published and workflow_status='published';
  if not found then raise exception 'question_not_available'; end if;
  if q.access_tier='premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if not exists(select 1 from jsonb_array_elements(q.options) o where upper(trim(o->>'id'))=upper(trim(p_selected_answer))) then raise exception 'invalid_answer_option'; end if;
  v_correct:=upper(trim(p_selected_answer))=upper(trim(q.answer_key));

  insert into public.question_attempts(user_id,question_id,session_id,session_item_id,selected_answer,is_correct,duration_ms,confidence,client_mutation_id)
  values(auth.uid(),q.id,p_session_id,si.id,upper(trim(p_selected_answer)),v_correct,p_duration_ms,p_confidence,p_client_mutation_id)
  on conflict (session_item_id) do nothing returning id into v_attempt;
  if v_attempt is null then select qa.is_correct into v_correct from public.question_attempts qa where qa.session_item_id=si.id; return jsonb_build_object('already_answered',true,'is_correct',v_correct); end if;

  update public.study_session_items set selected_answer=upper(trim(p_selected_answer)),is_correct=v_correct,duration_ms=p_duration_ms,confidence=p_confidence,answered_at=now() where id=si.id;
  update public.study_sessions set
    answered_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct is not null),
    correct_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct=true),
    current_position=greatest(current_position,least(p_position,requested_count)),
    current_block=(select block_number from public.study_session_items where session_id=p_session_id and position=greatest(current_position,least(p_position,requested_count)))
  where id=p_session_id;

  return jsonb_build_object('already_answered',false,'is_correct',v_correct,'correct_answer',q.answer_key,'explanation',q.explanation,
    'key_learning_point',(select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1),
    'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end));
end;
$$;
revoke all on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) from public,anon;
grant execute on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) to authenticated;

create or replace function public.study_session_result(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record; v_breakdown jsonb; v_items jsonb;
begin
  select ss.*,e.code exam_code,e.name exam_name into s from public.study_sessions ss join public.exams e on e.id=ss.exam_id
  where ss.id=p_session_id and ss.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  if s.status='in_progress' then raise exception 'session_not_complete'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('subject',x.subject,'total',x.total,'correct',x.correct,'incorrect',x.incorrect,'unanswered',x.unanswered,
    'accuracy',case when x.total=0 then 0 else round(100*x.correct::numeric/x.total,1) end) order by x.subject),'[]'::jsonb) into v_breakdown
  from (select q.subject,count(*) total,count(*) filter(where si.is_correct=true) correct,count(*) filter(where si.is_correct=false) incorrect,count(*) filter(where si.is_correct is null) unanswered
        from public.study_session_items si join public.questions q on q.id=si.question_id where si.session_id=p_session_id group by q.subject) x;
  select coalesce(jsonb_agg(jsonb_build_object('position',si.position,'question_id',q.id,'content_code',q.content_code,'subject',q.subject,'topic',q.topic,'selected_answer',si.selected_answer,
    'is_correct',si.is_correct,'duration_ms',si.duration_ms,'marked',si.marked_for_review,'note',coalesce(si.note,''),
    'correct_answer',case when si.is_correct is not null then q.answer_key else null end,
    'explanation',case when si.is_correct is not null then q.explanation else null end) order by si.position),'[]'::jsonb) into v_items
  from public.study_session_items si join public.questions q on q.id=si.question_id where si.session_id=p_session_id;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'exam_code',s.exam_code,'exam_name',s.exam_name,'mode',s.mode,'status',s.status,'requested_count',s.requested_count,
    'started_at',s.started_at,'finished_at',s.finished_at,'score_percent',s.score_percent,'correct_count',s.correct_count,'answered_count',s.answered_count),
    'breakdown',v_breakdown,'items',v_items);
end;
$$;
revoke all on function public.study_session_result(uuid) from public,anon;
grant execute on function public.study_session_result(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Admin operational reporting, user lifecycle, copyright/DMCA intake.
-- -----------------------------------------------------------------------------
create table if not exists public.copyright_notices (
  id uuid primary key default gen_random_uuid(),
  reporter_name text not null check (char_length(reporter_name) between 2 and 120),
  reporter_email text not null check (char_length(reporter_email) between 5 and 320),
  signature text not null check (char_length(signature) between 2 and 160),
  work_description text not null check (char_length(work_description) between 10 and 10000),
  infringing_location text not null check (char_length(infringing_location) between 10 and 4000),
  good_faith_statement boolean not null,
  accuracy_statement boolean not null,
  status text not null default 'open' check (status in ('open','in_review','resolved','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text
);
alter table public.copyright_notices enable row level security;
revoke all on public.copyright_notices from anon,authenticated;

create or replace function public.submit_copyright_notice(
  p_reporter_name text,p_reporter_email text,p_signature text,p_work_description text,p_infringing_location text,
  p_good_faith_statement boolean,p_accuracy_statement boolean
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if nullif(trim(p_reporter_name),'') is null or nullif(trim(p_reporter_email),'') is null then raise exception 'required'; end if;
  if p_good_faith_statement is not true or p_accuracy_statement is not true then raise exception 'attestation_required'; end if;
  insert into public.copyright_notices(reporter_name,reporter_email,signature,work_description,infringing_location,good_faith_statement,accuracy_statement)
  values(left(trim(p_reporter_name),120),left(trim(p_reporter_email),320),left(trim(p_signature),160),left(trim(p_work_description),10000),left(trim(p_infringing_location),4000),true,true)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_copyright_notice(text,text,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.submit_copyright_notice(text,text,text,text,text,boolean,boolean) to anon,authenticated;

create or replace function public.admin_list_users(p_search text default null,p_limit integer default 100)
returns table(id uuid,email text,full_name text,role text,account_status text,created_at timestamptz,active_exam_id uuid)
language sql stable security definer set search_path = '' as $$
  select u.id,u.email,p.full_name,p.role::text,coalesce(p.account_status,'active'),p.created_at,p.active_exam_id
  from auth.users u join public.profiles p on p.id=u.id
  where public.has_permission('platform.users')
    and (nullif(trim(p_search),'') is null or lower(coalesce(u.email,'')) like '%'||lower(trim(p_search))||'%' or lower(coalesce(p.full_name,'')) like '%'||lower(trim(p_search))||'%')
  order by p.created_at desc limit least(greatest(coalesce(p_limit,100),1),500);
$$;
revoke all on function public.admin_list_users(text,integer) from public,anon;
grant execute on function public.admin_list_users(text,integer) to authenticated;

create or replace function public.admin_list_copyright_notices(p_limit integer default 100)
returns table(id uuid,reporter_name text,reporter_email text,signature text,work_description text,infringing_location text,status text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id,c.reporter_name,c.reporter_email,c.signature,c.work_description,c.infringing_location,c.status,c.created_at
  from public.copyright_notices c
  where public.has_permission('platform.audit')
  order by c.created_at desc limit least(greatest(coalesce(p_limit,100),1),200);
$$;
revoke all on function public.admin_list_copyright_notices(integer) from public,anon;
grant execute on function public.admin_list_copyright_notices(integer) to authenticated;

create or replace function public.admin_set_user_status(p_user_id uuid,p_status text,p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_permission('platform.users.suspend') then raise exception 'forbidden'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid_status'; end if;
  if p_user_id=auth.uid() and p_status='suspended' then raise exception 'self_protected'; end if;
  update public.profiles set account_status=p_status,status_reason=nullif(left(trim(coalesce(p_reason,'')),500),'') ,suspended_at=case when p_status='suspended' then now() else null end where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  insert into public.content_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'user_status_changed','user',p_user_id,jsonb_build_object('status',p_status,'reason',left(coalesce(p_reason,''),500)));
end;
$$;
revoke all on function public.admin_set_user_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated;

create or replace function public.admin_resolve_copyright_notice(p_notice_id uuid,p_status text,p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_permission('platform.audit') then raise exception 'forbidden'; end if;
  if p_status not in ('in_review','resolved','rejected') then raise exception 'invalid_status'; end if;
  update public.copyright_notices set status=p_status,resolved_at=case when p_status in ('resolved','rejected') then now() else null end,resolved_by=case when p_status in ('resolved','rejected') then auth.uid() else null end,resolution_note=left(trim(coalesce(p_note,'')),4000) where id=p_notice_id;
  if not found then raise exception 'notice_not_found'; end if;
end;
$$;
revoke all on function public.admin_resolve_copyright_notice(uuid,text,text) from public,anon;
grant execute on function public.admin_resolve_copyright_notice(uuid,text,text) to authenticated;

-- Extend metrics/reporting to super administrators.
create or replace function public.admin_platform_metrics()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.has_permission('platform.system') then jsonb_build_object(
    'online_users',(select count(*) from public.user_presence where last_seen_at > now()-interval '5 minutes'),
    'active_users_24h',(select count(distinct user_id) from public.learning_events where occurred_at > now()-interval '24 hours'),
    'total_users',(select count(*) from public.profiles),
    'active_subscribers',(select count(distinct user_id) from public.subscriptions where status in ('trialing','active') and (current_period_end is null or current_period_end>now())),
    'month_revenue_minor',(select coalesce(sum(case when kind in ('refund','chargeback') or status in ('refunded','voided') then -amount_minor else amount_minor end),0) from public.billing_transactions where status in ('paid','refunded','voided') and occurred_at >= date_trunc('month',now())),
    'month_transactions',(select count(*) from public.billing_transactions where status='paid' and occurred_at >= date_trunc('month',now())),
    'month_currency',(select coalesce(min(currency),'ILS') from public.billing_transactions where status='paid' and occurred_at >= date_trunc('month',now()))
  ) else '{}'::jsonb end;
$$;
revoke all on function public.admin_platform_metrics() from public,anon;
grant execute on function public.admin_platform_metrics() to authenticated;

create or replace function public.admin_monthly_revenue(p_month date default date_trunc('month',now())::date)
returns table(day date,provider text,kind text,status text,currency text,amount_minor bigint,transaction_id uuid)
language sql stable security definer set search_path = '' as $$
  select b.occurred_at::date,b.provider,b.kind,b.status,b.currency,b.amount_minor,b.id
  from public.billing_transactions b
  where public.has_permission('platform.revenue')
    and b.occurred_at >= date_trunc('month',p_month::timestamptz)
    and b.occurred_at < date_trunc('month',p_month::timestamptz)+interval '1 month'
  order by b.occurred_at asc;
$$;
revoke all on function public.admin_monthly_revenue(date) from public,anon;
grant execute on function public.admin_monthly_revenue(date) to authenticated;

-- -----------------------------------------------------------------------------
-- Future RPC hardening and privacy helper
-- -----------------------------------------------------------------------------
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef=true and p.prokind='f'
  loop
    execute format('alter function %s set search_path = ''''',fn.signature);
  end loop;
end;
$$;


create or replace function public.qbank_catalog(p_exam_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_exam jsonb; v_subjects jsonb; v_topics jsonb; v_count bigint; v_topics_by_subject jsonb;
begin
  select jsonb_build_object('id',e.id,'code',e.code,'name',e.name,'total_duration_minutes',ep.total_duration_minutes,'max_items',ep.max_items,
    'block_duration_minutes',ep.block_duration_minutes,'block_max_items',ep.block_max_items,'block_count',ep.block_count,'break_minutes',ep.break_minutes,
    'previous_block_review_allowed',ep.previous_block_review_allowed) into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id where e.id=p_exam_id and ep.enabled=true;
  if v_exam is null then raise exception 'exam_not_found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('value',s.subject_key,'label',s.subject_key) order by s.sort_order),'[]'::jsonb) into v_subjects
  from public.exam_subjects s where s.exam_id=p_exam_id and s.enabled;
  select coalesce(jsonb_agg(x.topic order by x.topic),'[]'::jsonb),coalesce(jsonb_agg(jsonb_build_object('subject',x.subject,'topic',x.topic) order by x.subject,x.topic),'[]'::jsonb)
  into v_topics,v_topics_by_subject from (select distinct q.subject,q.topic from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published' and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())) x;
  select count(*) into v_count from public.questions q where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());
  return jsonb_build_object('exam',v_exam,'subjects',v_subjects,'topics',v_topics,'topics_by_subject',v_topics_by_subject,'available_questions',v_count);
end; $$;
revoke all on function public.qbank_catalog(uuid) from public,anon; grant execute on function public.qbank_catalog(uuid) to authenticated;

-- Never let the browser move into a previous or future locked exam block.
create or replace function public.get_study_session_state(p_session_id uuid,p_position integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_session record; v_item record; v_question jsonb; v_items jsonb; v_requested integer; v_current_block integer; v_elapsed numeric;
begin
  select s.*,e.code exam_code,e.name exam_name,ep.total_duration_minutes,ep.max_items,ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.previous_block_review_allowed
  into v_session from public.study_sessions s join public.exams e on e.id=s.exam_id join public.exam_profiles ep on ep.exam_id=e.id
  where s.id=p_session_id and s.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  v_requested:=greatest(1,least(p_position,v_session.requested_count));
  select si.* into v_item from public.study_session_items si where si.session_id=p_session_id and si.position=v_requested;
  if not found then raise exception 'session_item_not_found'; end if;
  if v_session.mode='exam' and not v_session.previous_block_review_allowed then
    if v_session.time_limit_seconds is not null and extract(epoch from now()-v_session.started_at)>=v_session.time_limit_seconds then raise exception 'session_expired'; end if;
    v_elapsed:=greatest(0,extract(epoch from now()-v_session.started_at));
    v_current_block:=least(v_session.block_count,floor(v_elapsed/(v_session.block_duration_minutes*60))::integer+1);
    if v_item.block_number < v_current_block then raise exception 'block_closed'; end if;
    if v_item.block_number > v_current_block then raise exception 'block_not_open'; end if;
  else
    v_current_block:=coalesce(v_session.current_block,1);
  end if;
  select jsonb_build_object('id',q.id,'content_code',q.content_code,'exam_id',q.exam_id,'stem',q.stem,'subject',q.subject,'topic',q.topic,'options',q.options,'difficulty',q.difficulty,
    'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position)
      from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb),
    'answered',v_item.is_correct is not null,'selected_answer',v_item.selected_answer,'is_correct',v_item.is_correct,
    'correct_answer',case when v_item.is_correct is not null then q.answer_key else null end,
    'explanation',case when v_item.is_correct is not null then q.explanation else null end,
    'key_learning_point',case when v_item.is_correct is not null then (select vv.key_learning_point from public.question_versions vv where vv.question_id=q.id order by vv.version_no desc limit 1) else null end,
    'note',v_item.note) into v_question
  from public.questions q where q.id=v_item.question_id and q.is_published and q.workflow_status='published';
  if v_question is null then raise exception 'question_not_available'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('position',si.position,'block',si.block_number,'answered',si.is_correct is not null,'correct',si.is_correct,'marked',si.marked_for_review,'has_note',nullif(trim(coalesce(si.note,'')),'') is not null) order by si.position),'[]'::jsonb)
    into v_items from public.study_session_items si where si.session_id=p_session_id;
  return jsonb_build_object('session',jsonb_build_object('id',v_session.id,'exam_code',v_session.exam_code,'exam_name',v_session.exam_name,'mode',v_session.mode,'status',v_session.status,'requested_count',v_session.requested_count,
    'time_limit_seconds',v_session.time_limit_seconds,'started_at',v_session.started_at,'finished_at',v_session.finished_at,'current_position',v_session.current_position,'current_block',v_current_block,
    'score_percent',v_session.score_percent,'correct_count',v_session.correct_count,'answered_count',v_session.answered_count,'total_duration_minutes',v_session.total_duration_minutes,'max_items',v_session.max_items,
    'block_duration_minutes',v_session.block_duration_minutes,'block_max_items',v_session.block_max_items,'previous_block_review_allowed',v_session.previous_block_review_allowed),'question',v_question,'items',v_items);
end; $$;
revoke all on function public.get_study_session_state(uuid,integer) from public,anon; grant execute on function public.get_study_session_state(uuid,integer) to authenticated;
