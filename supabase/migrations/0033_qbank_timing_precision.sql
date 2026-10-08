-- MDvoro Phase 27: separate official exam limits from the product's 300-question cap.

alter table public.exam_profiles
  add column if not exists product_max_items integer not null default 300
    check (product_max_items between 1 and 300);

update public.exam_profiles
set product_max_items = least(coalesce(product_max_items,300),300);

update public.exam_profiles ep
set product_max_items = 300
where exists (
  select 1 from public.exams e where e.id=ep.exam_id and e.code in ('IMLE','USMLE_STEP1','USMLE_STEP2')
);

-- Keep the official USMLE item limits in max_items and the MDvoro learner cap in product_max_items.
-- Step 1: 280 max items. Step 2 CK: 318 max items officially; MDvoro learner cap remains 300.
update public.exam_profiles ep
set max_items = 280,
    product_max_items = 300
where exists (select 1 from public.exams e where e.id=ep.exam_id and e.code='USMLE_STEP1');

update public.exam_profiles ep
set max_items = 318,
    product_max_items = 300
where exists (select 1 from public.exams e where e.id=ep.exam_id and e.code='USMLE_STEP2');

-- IMLE remains operator-configured until its official schedule is verified and entered.
update public.exam_profiles ep
set product_max_items = 300
where exists (select 1 from public.exams e where e.id=ep.exam_id and e.code='IMLE');

-- Replace the prior Super Admin read surface because the return shape now exposes both limits.
drop function if exists public.admin_exam_profile(uuid);
create function public.admin_exam_profile(p_exam_id uuid)
returns table(
  exam_id uuid,
  code text,
  name text,
  description text,
  total_duration_minutes integer,
  official_max_items integer,
  product_max_items integer,
  block_duration_minutes integer,
  block_max_items integer,
  block_count integer,
  break_minutes integer,
  previous_block_review_allowed boolean,
  enabled boolean,
  timing_verified boolean,
  timing_source text,
  timing_notes text,
  updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select e.id,e.code,e.name,e.description,
         ep.total_duration_minutes,ep.max_items,ep.product_max_items,ep.block_duration_minutes,ep.block_max_items,ep.block_count,
         ep.break_minutes,ep.previous_block_review_allowed,ep.enabled,ep.timing_verified,ep.timing_source,
         ep.timing_notes,ep.updated_at
  from public.exams e
  join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and public.has_permission('platform.system');
$$;
revoke all on function public.admin_exam_profile(uuid) from public,anon;
grant execute on function public.admin_exam_profile(uuid) to authenticated;

-- Replace the update surface so the official source limit and the learner-facing product cap are explicit.
drop function if exists public.admin_update_exam_profile(uuid,integer,integer,integer,integer,integer,integer,boolean,boolean,boolean,text,text);
create function public.admin_update_exam_profile(
  p_exam_id uuid,
  p_total_duration_minutes integer,
  p_official_max_items integer,
  p_product_max_items integer,
  p_block_duration_minutes integer,
  p_block_max_items integer,
  p_block_count integer,
  p_break_minutes integer,
  p_previous_block_review_allowed boolean,
  p_enabled boolean,
  p_timing_verified boolean,
  p_timing_source text,
  p_timing_notes text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.has_permission('platform.system') then raise exception 'forbidden'; end if;
  if p_total_duration_minutes<1 or p_total_duration_minutes>1440 then raise exception 'invalid_duration'; end if;
  if p_official_max_items<1 or p_official_max_items>1000 then raise exception 'invalid_official_max_items'; end if;
  if p_product_max_items<1 or p_product_max_items>300 then raise exception 'invalid_product_max_items'; end if;
  if p_product_max_items>p_official_max_items then raise exception 'product_cap_exceeds_official_limit'; end if;
  if p_block_duration_minutes<1 or p_block_duration_minutes>180 then raise exception 'invalid_block_duration'; end if;
  if p_block_max_items<1 or p_block_max_items>200 then raise exception 'invalid_block_items'; end if;
  if p_block_count<1 or p_block_count>64 then raise exception 'invalid_block_count'; end if;
  if p_break_minutes<0 or p_break_minutes>240 then raise exception 'invalid_break'; end if;

  update public.exam_profiles
  set total_duration_minutes=p_total_duration_minutes,
      max_items=p_official_max_items,
      product_max_items=p_product_max_items,
      block_duration_minutes=p_block_duration_minutes,
      block_max_items=p_block_max_items,
      block_count=p_block_count,
      break_minutes=p_break_minutes,
      previous_block_review_allowed=p_previous_block_review_allowed,
      enabled=p_enabled,
      timing_verified=p_timing_verified,
      timing_source=left(trim(coalesce(p_timing_source,'operator_configured')),120),
      timing_notes=nullif(left(trim(coalesce(p_timing_notes,'')),1000),''),
      updated_at=now()
  where exam_id=p_exam_id;

  if not found then raise exception 'exam_profile_not_found'; end if;

  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(
    auth.uid(),'exam_profile',p_exam_id,'exam_profile_updated',
    jsonb_build_object(
      'timing_verified',p_timing_verified,
      'timing_source',p_timing_source,
      'official_max_items',p_official_max_items,
      'product_max_items',p_product_max_items,
      'enabled',p_enabled
    )
  );
end;
$$;
revoke all on function public.admin_update_exam_profile(uuid,integer,integer,integer,integer,integer,integer,integer,boolean,boolean,boolean,text,text) from public,anon;
grant execute on function public.admin_update_exam_profile(uuid,integer,integer,integer,integer,integer,integer,integer,boolean,boolean,boolean,text,text) to authenticated;

-- Canonical learner-visible catalog: expose both the official limit and MDvoro's hard UI/API cap.
create or replace function public.qbank_catalog(p_exam_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_exam jsonb;
  v_subjects jsonb;
  v_topics jsonb;
  v_topics_by_subject jsonb;
  v_count bigint;
begin
  select jsonb_build_object(
    'id',e.id,
    'code',e.code,
    'name',e.name,
    'total_duration_minutes',ep.total_duration_minutes,
    'max_items',least(ep.product_max_items,300),
    'official_max_items',ep.max_items,
    'product_max_items',least(ep.product_max_items,300),
    'block_duration_minutes',ep.block_duration_minutes,
    'block_max_items',ep.block_max_items,
    'block_count',ep.block_count,
    'break_minutes',ep.break_minutes,
    'previous_block_review_allowed',ep.previous_block_review_allowed,
    'timing_verified',ep.timing_verified,
    'timing_source',ep.timing_source,
    'timing_notes',ep.timing_notes
  ) into v_exam
  from public.exams e
  join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled=true;

  if v_exam is null then raise exception 'exam_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('value',s.subject_key,'label',s.subject_key) order by s.sort_order),'[]'::jsonb)
  into v_subjects
  from public.exam_subjects s
  where s.exam_id=p_exam_id and s.enabled;

  select coalesce(jsonb_agg(x.topic order by x.topic),'[]'::jsonb)
  into v_topics
  from (
    select distinct q.topic
    from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('subject',x.subject,'topic',x.topic) order by x.subject,x.topic),'[]'::jsonb)
  into v_topics_by_subject
  from (
    select distinct q.subject,q.topic
    from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and nullif(trim(q.subject),'') is not null and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())
  ) x;

  select count(*) into v_count
  from public.questions q
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());

  return jsonb_build_object('exam',v_exam,'subjects',v_subjects,'topics',v_topics,'topics_by_subject',v_topics_by_subject,'available_questions',v_count);
end;
$$;
revoke all on function public.qbank_catalog(uuid) from public,anon;
grant execute on function public.qbank_catalog(uuid) to authenticated;

-- Canonical session start: 300 is a product cap, while the official limit remains profile-specific.
-- Exact official timing is only claimed when the selected count reaches the official item limit.
drop function if exists public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text);
create function public.start_study_session(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice',
  p_pool text default 'mixed'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer,break_seconds integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_exam record;
  v_session uuid;
  v_total bigint;
  v_last_session uuid;
  v_full_window boolean;
  v_blocks integer;
  v_break integer;
  v_time integer;
  v_timing_policy text;
  v_product_cap integer;
  v_allowed_pools text[] := array['mixed','unseen','incorrect','answered','unanswered','bookmarked'];
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then raise exception 'account_inactive'; end if;
  if p_question_count < 1 or p_question_count > 300 then raise exception 'invalid_question_count'; end if;
  if not (p_pool = any(v_allowed_pools)) then raise exception 'invalid_pool'; end if;

  select e.id,e.code,e.max_items official_max_items,least(ep.product_max_items,300) product_max_items,
         ep.total_duration_minutes,ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.break_minutes,
         ep.previous_block_review_allowed,ep.timing_verified,ep.timing_source
  into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled=true;
  if not found then raise exception 'exam_not_found'; end if;

  v_product_cap:=least(v_exam.product_max_items,300);
  if p_question_count>v_product_cap then raise exception 'exam_question_limit'; end if;

  select ss.id into v_last_session
  from public.study_sessions ss
  where ss.user_id=auth.uid() and ss.status in ('completed','expired')
  order by coalesce(ss.finished_at,ss.created_at) desc
  limit 1;

  if exists(
    select 1 from unnest(coalesce(p_subjects,'{}'::text[])) requested_subject
    where not exists(select 1 from public.exam_subjects s where s.exam_id=v_exam.id and s.enabled and s.subject_key=requested_subject)
  ) then raise exception 'invalid_subject'; end if;

  if exists(
    select 1 from unnest(coalesce(p_topics,'{}'::text[])) requested_topic
    where not exists(select 1 from public.questions q where q.exam_id=v_exam.id and q.topic=requested_topic and q.is_published=true and q.workflow_status='published')
  ) then raise exception 'invalid_topic'; end if;

  v_full_window:=p_mode='exam' and p_question_count>=v_exam.official_max_items and v_exam.timing_verified;
  v_blocks:=greatest(1,least(v_exam.block_count,ceil(p_question_count::numeric/v_exam.block_max_items)::integer));
  v_break:=case when p_mode='exam' and v_blocks>1 and v_exam.timing_verified then v_exam.break_minutes*60 else 0 end;
  v_time:=case
    when p_mode='practice' then null
    when v_full_window then v_exam.total_duration_minutes*60
    else v_blocks*v_exam.block_duration_minutes*60
  end;
  v_timing_policy:=case
    when p_mode<>'exam' then 'untimed_practice'
    when v_full_window then 'official_exam_timing'
    else 'scaled_block_pacing'
  end;

  select count(*) into v_total
  from public.questions q
  left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    and (
      p_pool='mixed'
      or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
      or (p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null))
      or (p_pool='answered' and coalesce(qs.attempts,0)>0)
      or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
      or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
    );
  if v_total<p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,break_seconds_allowed,configuration,current_block,current_position)
  values(
    auth.uid(),p_exam_id,p_mode,p_question_count,v_time,v_break,
    jsonb_build_object(
      'subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),
      'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),
      'exam_code',v_exam.code,
      'pool',p_pool,
      'timing_policy',v_timing_policy,
      'timing_verified',v_exam.timing_verified,
      'timing_source',v_exam.timing_source,
      'official_max_items',v_exam.official_max_items,
      'product_question_cap',v_product_cap
    ),
    1,1
  ) returning id into v_session;

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
      and (
        p_pool='mixed'
        or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
        or (p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null))
        or (p_pool='answered' and coalesce(qs.attempts,0)>0)
        or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
        or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
      )
    order by random() limit p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by adaptive_score desc,random())::int,
      ceil(row_number() over(order by adaptive_score desc,random())::numeric/v_exam.block_max_items)::int,q.id
    from (
      select q,
        (case
          when p_pool='unseen' and coalesce(qs.attempts,0)=0 then 5000
          when p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null) then 4500
          when p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts then 4000
          when p_pool='answered' and coalesce(qs.attempts,0)>0 then 2500
          when p_pool='bookmarked' then 3000
          when coalesce(qs.attempts,0)=0 then 1000
          else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4
        end)
        + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end adaptive_score
      from public.questions q
      left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (
          p_pool='mixed'
          or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
          or (p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null))
          or (p_pool='answered' and coalesce(qs.attempts,0)>0)
          or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
          or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
        )
    ) q order by adaptive_score desc,random() limit p_question_count;
  end if;

  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,
    jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'pool',p_pool,'timing_policy',v_timing_policy));

  return query select v_session,v_time,v_blocks,v_exam.block_duration_minutes,v_exam.block_max_items,v_break;
end;
$$;
revoke all on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) from public,anon;
grant execute on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) to authenticated;
