-- MDvoro Phase 26: final QBank correctness, configurable exam profiles,
-- operational controls, and production/legal guardrails.

-- Keep one canonical session-start RPC. The older five-argument overload must not remain callable.
drop function if exists public.start_study_session(uuid,text[],text[],integer,public.study_session_mode);

-- Exam profiles are data-driven so new/changed exams can be updated without code rewrites.
alter table public.exam_profiles
  add column if not exists timing_verified boolean not null default false,
  add column if not exists timing_source text not null default 'operator_configured',
  add column if not exists timing_notes text;

-- The official 2026 USMLE profiles are verified against USMLE's published exam-delivery pages.
update public.exam_profiles ep
set timing_verified=true,
    timing_source='usmle_official_2026',
    timing_notes=case
      when e.code='USMLE_STEP1' then 'Verified against USMLE Step 1 delivery guidance effective May 14, 2026: 8-hour day, 14 x 30-minute blocks, max 20 items per block, minimum 55-minute break bank, 5-minute optional tutorial.'
      when e.code='USMLE_STEP2' then 'Verified against USMLE Step 2 CK delivery guidance effective May 7, 2026: 9-hour day, 16 x 30-minute blocks, max 20 items per block, minimum 55-minute break bank, 5-minute optional tutorial.'
      else ep.timing_notes
    end
from public.exams e
where e.id=ep.exam_id and e.code in ('USMLE_STEP1','USMLE_STEP2');

-- IMLE is intentionally operator-configurable until MDvoro has a source-confirmed current timing profile.
update public.exam_profiles ep
set max_items=300,
    timing_verified=false,
    timing_source='operator_configured',
    timing_notes='Operator-configured profile. Verify the current Ministry of Health exam instructions before publishing an official-timing claim.'
from public.exams e
where e.id=ep.exam_id and e.code='IMLE';

-- Canonical session-start rules with explicit topic validation and accurate full-window block modelling.
create or replace function public.start_study_session(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice',
  p_pool text default 'mixed'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer,break_seconds_allowed integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_exam record;
  v_session uuid;
  v_total integer;
  v_time integer;
  v_blocks integer;
  v_break integer;
  v_full_window boolean;
  v_timing_policy text;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count < 1 or p_question_count > 300 then raise exception 'invalid_question_count'; end if;
  if p_pool not in ('mixed','unseen','unanswered','incorrect','answered','bookmarked') then raise exception 'invalid_pool'; end if;

  select e.id,e.code,e.name,ep.* into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;

  if exists (
    select 1 from unnest(coalesce(p_subjects,'{}'::text[])) requested_subject
    where not exists(
      select 1 from public.exam_subjects es
      where es.exam_id=v_exam.id and es.subject_key=requested_subject and es.enabled
    )
  ) then raise exception 'invalid_subject'; end if;

  if exists (
    select 1 from unnest(coalesce(p_topics,'{}'::text[])) requested_topic
    where not exists(
      select 1 from public.questions q
      where q.exam_id=v_exam.id and q.topic=requested_topic and q.is_published=true and q.workflow_status='published'
    )
  ) then raise exception 'invalid_topic'; end if;

  if p_mode='exam' and p_question_count>v_exam.max_items then raise exception 'exam_question_limit'; end if;

  v_full_window := p_mode='exam' and p_question_count >= least(v_exam.max_items,300) and v_exam.timing_verified;
  v_blocks := case when v_full_window then v_exam.block_count else greatest(1,ceil(p_question_count::numeric/v_exam.block_max_items)::integer) end;
  v_break := case when v_full_window and v_exam.block_count>1 then v_exam.break_minutes*60 else 0 end;
  v_time := case
    when p_mode='practice' then null
    when v_full_window then v_exam.total_duration_minutes*60
    else greatest(v_exam.block_duration_minutes*60,v_blocks*v_exam.block_duration_minutes*60)
  end;
  v_timing_policy := case
    when p_mode<>'exam' then 'untimed_practice'
    when v_full_window then 'official_profile_window'
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
      or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct)
      or (p_pool='answered' and coalesce(qs.attempts,0)>0)
      or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
      or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
    );
  if v_total < p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,break_seconds_allowed,configuration)
  values(
    auth.uid(),p_exam_id,p_mode,p_question_count,v_time,v_break,
    jsonb_build_object(
      'subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),
      'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),
      'exam_code',v_exam.code,
      'pool',p_pool,
      'timing_policy',v_timing_policy,
      'timing_verified',v_exam.timing_verified,
      'timing_source',v_exam.timing_source
    )
  ) returning id into v_session;

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,
      case when v_full_window
        then ceil(row_number() over(order by random())::numeric / v_exam.block_max_items)::int
        else ceil(row_number() over(order by random())::numeric / v_exam.block_max_items)::int
      end,
      q.id
    from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
      and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
      and (
        p_pool='mixed'
        or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
        or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct)
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
          when p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct then 4500
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
          or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct)
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

-- Rich result payload for the learner's post-exam analysis screen.
create or replace function public.study_session_result(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s record;
  v_breakdown jsonb;
  v_topic_breakdown jsonb;
  v_items jsonb;
  v_duration integer;
begin
  select ss.*,e.code exam_code,e.name exam_name,ep.timing_verified,ep.timing_source
  into s
  from public.study_sessions ss
  join public.exams e on e.id=ss.exam_id
  join public.exam_profiles ep on ep.exam_id=ss.exam_id
  where ss.id=p_session_id and ss.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  if s.status='in_progress' then raise exception 'session_not_complete'; end if;

  v_duration:=greatest(0,extract(epoch from coalesce(s.finished_at,now())-s.started_at)::integer);

  select coalesce(jsonb_agg(jsonb_build_object(
    'subject',x.subject,'total',x.total,'correct',x.correct,'incorrect',x.incorrect,'unanswered',x.unanswered,
    'accuracy',case when x.total=0 then 0 else round(100*x.correct::numeric/x.total,1) end
  ) order by x.subject),'[]'::jsonb)
  into v_breakdown
  from (
    select q.subject,count(*) total,count(*) filter(where si.is_correct=true) correct,
      count(*) filter(where si.is_correct=false) incorrect,count(*) filter(where si.is_correct is null) unanswered
    from public.study_session_items si join public.questions q on q.id=si.question_id
    where si.session_id=p_session_id group by q.subject
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'topic',x.topic,'total',x.total,'correct',x.correct,'incorrect',x.incorrect,'unanswered',x.unanswered,
    'accuracy',case when x.total=0 then 0 else round(100*x.correct::numeric/x.total,1) end
  ) order by x.topic),'[]'::jsonb)
  into v_topic_breakdown
  from (
    select coalesce(nullif(trim(q.topic),''),'General') topic,count(*) total,count(*) filter(where si.is_correct=true) correct,
      count(*) filter(where si.is_correct=false) incorrect,count(*) filter(where si.is_correct is null) unanswered
    from public.study_session_items si join public.questions q on q.id=si.question_id
    where si.session_id=p_session_id group by coalesce(nullif(trim(q.topic),''),'General')
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'position',si.position,'question_id',q.id,'content_code',q.content_code,'subject',q.subject,'topic',q.topic,'stem',q.stem,
    'options',q.options,'selected_answer',si.selected_answer,'is_correct',si.is_correct,'duration_ms',si.duration_ms,
    'marked',si.marked_for_review,'note',coalesce(si.note,''),'correct_answer',case when si.is_correct is not null then q.answer_key else null end,
    'explanation',case when si.is_correct is not null then q.explanation else null end,
    'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end),
    'key_learning_point',(select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1)
  ) order by si.position),'[]'::jsonb)
  into v_items
  from public.study_session_items si join public.questions q on q.id=si.question_id
  where si.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object(
      'id',s.id,'exam_id',s.exam_id,'exam_code',s.exam_code,'exam_name',s.exam_name,'mode',s.mode,'status',s.status,
      'requested_count',s.requested_count,'started_at',s.started_at,'finished_at',s.finished_at,'duration_seconds',v_duration,
      'score_percent',s.score_percent,'correct_count',s.correct_count,'answered_count',s.answered_count,
      'unanswered_count',s.requested_count-s.answered_count,'marked_count',(select count(*) from public.study_session_items where session_id=p_session_id and marked_for_review),
      'note_count',(select count(*) from public.study_session_items where session_id=p_session_id and note is not null and nullif(trim(note),'') is not null),
      'timing_verified',s.timing_verified,'timing_source',s.timing_source
    ),
    'breakdown',v_breakdown,'topic_breakdown',v_topic_breakdown,'items',v_items
  );
end;
$$;
revoke all on function public.study_session_result(uuid) from public,anon;
grant execute on function public.study_session_result(uuid) to authenticated;

-- Staff may adjust exam-profile timing without touching application code. Only system-authorized admins can do it.
create or replace function public.admin_update_exam_profile(
  p_exam_id uuid,
  p_total_duration_minutes integer,
  p_max_items integer,
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
  if p_max_items<1 or p_max_items>1000 then raise exception 'invalid_max_items'; end if;
  if p_block_duration_minutes<1 or p_block_duration_minutes>180 then raise exception 'invalid_block_duration'; end if;
  if p_block_max_items<1 or p_block_max_items>200 then raise exception 'invalid_block_items'; end if;
  if p_block_count<1 or p_block_count>64 then raise exception 'invalid_block_count'; end if;
  if p_break_minutes<0 or p_break_minutes>240 then raise exception 'invalid_break'; end if;
  update public.exam_profiles
  set total_duration_minutes=p_total_duration_minutes,
      max_items=p_max_items,
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
  values(auth.uid(),'exam_profile',p_exam_id,'exam_profile_updated',jsonb_build_object('timing_verified',p_timing_verified,'timing_source',p_timing_source,'enabled',p_enabled));
end;
$$;
revoke all on function public.admin_update_exam_profile(uuid,integer,integer,integer,integer,integer,integer,boolean,boolean,boolean,text,text) from public,anon;
grant execute on function public.admin_update_exam_profile(uuid,integer,integer,integer,integer,integer,integer,boolean,boolean,boolean,text,text) to authenticated;

-- Operational revenue reporting must not silently mix currencies. Return one row per currency.
create or replace function public.admin_monthly_revenue_summary(p_month date default date_trunc('month',now())::date)
returns table(currency text,total_minor bigint,paid_transactions bigint)
language sql stable security definer set search_path = ''
as $$
  select b.currency,
         coalesce(sum(case when b.kind in ('refund','chargeback') or b.status in ('refunded','voided') then -b.amount_minor else b.amount_minor end),0)::bigint,
         count(*) filter(where b.status='paid')::bigint
  from public.billing_transactions b
  where public.has_permission('platform.revenue')
    and b.occurred_at >= date_trunc('month',p_month::timestamptz)
    and b.occurred_at < date_trunc('month',p_month::timestamptz)+interval '1 month'
  group by b.currency
  order by b.currency;
$$;
revoke all on function public.admin_monthly_revenue_summary(date) from public,anon;
grant execute on function public.admin_monthly_revenue_summary(date) to authenticated;

-- Lightweight public liveness/readiness support is exposed at the application layer; DB readiness remains private.
