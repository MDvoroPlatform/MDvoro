-- MDvoro Phase 26: deterministic QBank selection, current exam timing metadata,
-- multi-currency admin metrics, and explicit Super Admin exam-profile controls.

alter table public.exam_profiles
  add column if not exists timing_verified boolean not null default false,
  add column if not exists timing_source text not null default 'operator_configured',
  add column if not exists timing_notes text;

-- Current official USMLE timing profiles verified against the official exam pages.
update public.exam_profiles ep
set timing_verified = true,
    timing_source = 'https://www.usmle.org/step-exams/step-1/step-1-exam-content',
    timing_notes = 'Current Step 1 schedule: 14 x 30-minute blocks, up to 20 items per block, 8-hour testing session, minimum 55-minute break, optional 5-minute tutorial. MDvoro caps learner sessions at 300 questions.'
from public.exams e
where e.id = ep.exam_id and e.code = 'USMLE_STEP1';

update public.exam_profiles ep
set timing_verified = true,
    timing_source = 'https://www.usmle.org/step-2-ck',
    timing_notes = 'Current Step 2 CK schedule: 16 x 30-minute blocks, up to 20 items per block, 9-hour testing session, minimum 55-minute break, optional 5-minute tutorial. MDvoro caps learner sessions at 300 questions.'
from public.exams e
where e.id = ep.exam_id and e.code = 'USMLE_STEP2';

update public.exam_profiles ep
set max_items = least(max_items,300),
    timing_verified = false,
    timing_source = 'operator_configured',
    timing_notes = 'Verify the current official Israeli medical licensing examination schedule with the responsible authority before presenting official timing claims.'
from public.exams e
where e.id = ep.exam_id and e.code = 'IMLE';

-- Canonical catalog response used by the web client. This is the only place the client
-- gets learner-visible exam timing metadata and topic/subject availability.
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
    'max_items',least(ep.max_items,300),
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

  select coalesce(
    jsonb_agg(jsonb_build_object('value',s.subject_key,'label',s.subject_key) order by s.sort_order),
    '[]'::jsonb
  ) into v_subjects
  from public.exam_subjects s
  where s.exam_id=p_exam_id and s.enabled;

  select coalesce(jsonb_agg(x.topic order by x.topic),'[]'::jsonb)
  into v_topics
  from (
    select distinct q.topic
    from public.questions q
    where q.exam_id=p_exam_id
      and q.is_published=true
      and q.workflow_status='published'
      and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())
  ) x;

  select coalesce(
    jsonb_agg(jsonb_build_object('subject',x.subject,'topic',x.topic) order by x.subject,x.topic),
    '[]'::jsonb
  ) into v_topics_by_subject
  from (
    select distinct q.subject,q.topic
    from public.questions q
    where q.exam_id=p_exam_id
      and q.is_published=true
      and q.workflow_status='published'
      and nullif(trim(q.subject),'') is not null
      and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())
  ) x;

  select count(*) into v_count
  from public.questions q
  where q.exam_id=p_exam_id
    and q.is_published=true
    and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());

  return jsonb_build_object(
    'exam',v_exam,
    'subjects',v_subjects,
    'topics',v_topics,
    'topics_by_subject',v_topics_by_subject,
    'available_questions',v_count
  );
end;
$$;
revoke all on function public.qbank_catalog(uuid) from public,anon;
grant execute on function public.qbank_catalog(uuid) to authenticated;



-- Deterministic, human-governed key terms. No AI is required: use up to three active taxonomy names,
-- preferring primary mappings, then fall back to the question topic.
create or replace function public.student_key_terms(p_question_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (
      select array_agg(x.name order by x.rank)
      from (
        select n.name,
               row_number() over(order by qt.is_primary desc, n.node_type, n.sort_order, n.name) as rank
        from public.question_taxonomy qt
        join public.taxonomy_nodes n on n.id=qt.taxonomy_id
        where qt.question_id=p_question_id and n.status='active'
      ) x
      where x.rank <= 3
    ),
    case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end
  )
  from public.questions q
  where q.id=p_question_id;
$$;
revoke all on function public.student_key_terms(uuid) from public,anon,authenticated;

-- Official timing is a time-window policy. When MDvoro's 300-question product cap is
-- lower than an official profile's item count, keep the official exam-day window while
-- deriving the actual number of blocks from the selected item count.
drop function if exists public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text);

create or replace function public.start_study_session(
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
  v_allowed_pools text[] := array['mixed','unseen','incorrect','answered','unanswered','bookmarked'];
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then raise exception 'account_inactive'; end if;
  if p_question_count < 1 or p_question_count > 300 then raise exception 'invalid_question_count'; end if;
  if not (p_pool = any(v_allowed_pools)) then raise exception 'invalid_pool'; end if;

  select e.id,e.code,e.max_items,ep.total_duration_minutes,ep.max_items profile_max_items,
         ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.break_minutes,
         ep.previous_block_review_allowed,ep.timing_verified,ep.timing_source
  into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled=true;
  if not found then raise exception 'exam_not_found'; end if;

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
    where not exists(
      select 1 from public.questions q
      where q.exam_id=v_exam.id and q.topic=requested_topic and q.is_published=true and q.workflow_status='published'
    )
  ) then raise exception 'invalid_topic'; end if;

  if p_mode='exam' and p_question_count > least(v_exam.profile_max_items,300) then raise exception 'exam_question_limit'; end if;

  v_full_window := p_mode='exam' and p_question_count >= least(v_exam.profile_max_items,300) and v_exam.timing_verified;
  v_blocks := greatest(1,least(v_exam.block_count,ceil(p_question_count::numeric/v_exam.block_max_items)::integer));
  v_break := case when v_full_window and v_blocks > 1 then v_exam.break_minutes*60 else 0 end;
  v_time := case
    when p_mode='practice' then null
    when v_full_window then v_exam.total_duration_minutes*60
    else greatest(v_exam.block_duration_minutes*60,v_blocks*v_exam.block_duration_minutes*60)
  end;
  v_timing_policy := case
    when p_mode<>'exam' then 'untimed_practice'
    when v_full_window then 'official_timing_window_capped_to_product_limit'
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
  if v_total < p_question_count then raise exception 'insufficient_questions'; end if;

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
      'product_question_cap',300
    ),
    1,1
  ) returning id into v_session;

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,
      ceil(row_number() over(order by random())::numeric / v_exam.block_max_items)::int,
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

-- Super Admin-only read/write surface for exam delivery profiles.
create or replace function public.admin_exam_profile(p_exam_id uuid)
returns table(
  exam_id uuid,
  code text,
  name text,
  description text,
  total_duration_minutes integer,
  max_items integer,
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
         ep.total_duration_minutes,ep.max_items,ep.block_duration_minutes,ep.block_max_items,ep.block_count,
         ep.break_minutes,ep.previous_block_review_allowed,ep.enabled,ep.timing_verified,ep.timing_source,
         ep.timing_notes,ep.updated_at
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and public.has_permission('platform.system');
$$;
revoke all on function public.admin_exam_profile(uuid) from public,anon;
grant execute on function public.admin_exam_profile(uuid) to authenticated;

-- Do not silently combine different currencies in a single amount.
create or replace function public.admin_platform_metrics()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with month_rows as (
    select b.currency,
           sum(case when b.kind in ('refund','chargeback') or b.status in ('refunded','voided') then -b.amount_minor else b.amount_minor end)::bigint total_minor,
           count(*) filter(where b.status='paid')::bigint paid_count
    from public.billing_transactions b
    where b.occurred_at >= date_trunc('month',now())
      and b.status in ('paid','refunded','voided')
    group by b.currency
  ), month_json as (
    select coalesce(jsonb_object_agg(currency,total_minor),'{}'::jsonb) data,
           count(*) currency_count,
           coalesce(min(currency),'') one_currency,
           coalesce(sum(paid_count),0)::bigint paid_transactions
    from month_rows
  )
  select case when public.has_permission('platform.system') then jsonb_build_object(
    'online_users',(select count(*) from public.user_presence where last_seen_at > now()-interval '5 minutes'),
    'active_users_24h',(select count(distinct user_id) from public.learning_events where occurred_at > now()-interval '24 hours'),
    'total_users',(select count(*) from public.profiles),
    'active_subscribers',(select count(distinct user_id) from public.subscriptions where status in ('trialing','active') and (current_period_end is null or current_period_end>now())),
    'month_revenue_minor',case when month_json.currency_count=1 then coalesce((month_json.data ->> month_json.one_currency)::bigint,0) else 0 end,
    'month_revenue_by_currency',month_json.data,
    'month_transactions',month_json.paid_transactions,
    'month_currency',case when month_json.currency_count=1 then month_json.one_currency when month_json.currency_count=0 then '—' else 'MULTI' end
  ) else '{}'::jsonb end
  from month_json;
$$;
revoke all on function public.admin_platform_metrics() from public,anon;
grant execute on function public.admin_platform_metrics() to authenticated;

-- Dynamic learner-visible counts for the current exam/subject/topic filters.
create or replace function public.qbank_pool_counts(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}'
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with latest_session as (
    select ss.id
    from public.study_sessions ss
    where ss.user_id=auth.uid() and ss.status in ('completed','expired')
    order by coalesce(ss.finished_at,ss.created_at) desc
    limit 1
  )
  select jsonb_build_object(
    'total', count(*)::bigint,
    'unseen', count(*) filter(where coalesce(ls.attempts,0)=0)::bigint,
    'answered', count(*) filter(where coalesce(ls.attempts,0)>0)::bigint,
    'unanswered', count(*) filter(where exists(select 1 from public.study_session_items lsi join latest_session lss on lss.id=lsi.session_id where lsi.question_id=q.id and lsi.is_correct is null))::bigint,
    'incorrect', count(*) filter(where coalesce(ls.attempts,0)>0 and ls.correct<ls.attempts)::bigint,
    'bookmarked', count(*) filter(where exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))::bigint
  )
  from public.questions q
  left join public.learner_question_stats ls on ls.user_id=auth.uid() and ls.question_id=q.id
  where q.exam_id=p_exam_id
    and q.is_published=true
    and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics));
$$;
revoke all on function public.qbank_pool_counts(uuid,text[],text[]) from public,anon;
grant execute on function public.qbank_pool_counts(uuid,text[],text[]) to authenticated;

create or replace function public.get_study_session_state(p_session_id uuid,p_position integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_session record; v_item record; v_question jsonb; v_items jsonb;
  v_requested integer; v_current_block integer; v_session_block_count integer;
  v_active_elapsed numeric; v_break_elapsed numeric := 0; v_wall_elapsed numeric;
  v_on_break boolean := false; v_break_remaining integer := 0; v_key_terms text[];
begin
  select s.*,e.code exam_code,e.name exam_name,ep.total_duration_minutes,ep.max_items,
    ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.previous_block_review_allowed
  into v_session
  from public.study_sessions s join public.exams e on e.id=s.exam_id join public.exam_profiles ep on ep.exam_id=e.id
  where s.id=p_session_id and s.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;

  v_wall_elapsed:=greatest(0,extract(epoch from now()-v_session.started_at));
  if v_session.status='in_progress' and v_session.mode='exam' and v_session.time_limit_seconds is not null
     and v_wall_elapsed >= v_session.time_limit_seconds then raise exception 'session_expired'; end if;
  if v_session.break_started_at is not null then
    v_on_break:=true;
    v_break_elapsed:=greatest(0,extract(epoch from now()-v_session.break_started_at));
  end if;
  v_active_elapsed:=greatest(0,v_wall_elapsed-v_session.break_seconds_used-v_break_elapsed);
  v_session_block_count:=greatest(1,ceil(v_session.requested_count::numeric/nullif(v_session.block_max_items,0))::integer);
  v_current_block:=case when v_session.mode='exam' then least(v_session_block_count,floor(v_active_elapsed/(v_session.block_duration_minutes*60))::integer+1) else greatest(1,v_session.current_block) end;
  v_break_remaining:=greatest(0,v_session.break_seconds_allowed-v_session.break_seconds_used-floor(v_break_elapsed)::integer);

  v_requested:=case when coalesce(p_position,0)<=0 then v_session.current_position else greatest(1,least(p_position,v_session.requested_count)) end;
  select si.* into v_item from public.study_session_items si where si.session_id=p_session_id and si.position=v_requested;
  if not found then raise exception 'session_item_not_found'; end if;

  if not v_on_break and v_session.status='in_progress' and v_session.mode='exam' and not v_session.previous_block_review_allowed then
    if v_item.block_number < v_current_block then raise exception 'block_closed'; end if;
    if v_item.block_number > v_current_block then raise exception 'block_not_open'; end if;
  end if;

  select public.student_key_terms(v_item.question_id) into v_key_terms from public.questions q where q.id=v_item.question_id;

  if v_on_break then
    v_question:=null;
  else
    select jsonb_build_object(
      'id',q.id,'content_code',q.content_code,'exam_id',q.exam_id,'stem',q.stem,'subject',q.subject,'topic',q.topic,
      'options',q.options,'difficulty',q.difficulty,
      'key_terms',case when v_item.is_correct is not null or v_session.mode='practice' then v_key_terms else array[]::text[] end,
      'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position)
        from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb),
      'answered',v_item.is_correct is not null,'selected_answer',v_item.selected_answer,'is_correct',v_item.is_correct,
      'correct_answer',case when v_item.is_correct is not null then q.answer_key else null end,
      'explanation',case when v_item.is_correct is not null then q.explanation else null end,
      'key_learning_point',case when v_item.is_correct is not null then (select vv.key_learning_point from public.question_versions vv where vv.question_id=q.id order by vv.version_no desc limit 1) else null end,
      'note',v_item.note
    ) into v_question
    from public.questions q where q.id=v_item.question_id and q.is_published and q.workflow_status='published';
  end if;
  if v_question is null then raise exception 'question_not_available'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('position',si.position,'block',si.block_number,'answered',si.is_correct is not null,
    'correct',si.is_correct,'marked',si.marked_for_review,'has_note',nullif(trim(coalesce(si.note,'')),'') is not null) order by si.position),'[]'::jsonb)
  into v_items from public.study_session_items si where si.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object('id',v_session.id,'exam_code',v_session.exam_code,'exam_name',v_session.exam_name,
      'mode',v_session.mode,'status',v_session.status,'requested_count',v_session.requested_count,
      'time_limit_seconds',v_session.time_limit_seconds,'started_at',v_session.started_at,'finished_at',v_session.finished_at,
      'current_position',case when p_position is null or p_position<=0 then v_session.current_position else v_requested end,
      'current_block',v_current_block,'block_count',v_session_block_count,'score_percent',v_session.score_percent,
      'correct_count',v_session.correct_count,'answered_count',v_session.answered_count,'total_duration_minutes',v_session.total_duration_minutes,
      'max_items',v_session.max_items,'block_duration_minutes',v_session.block_duration_minutes,'block_max_items',v_session.block_max_items,
      'previous_block_review_allowed',v_session.previous_block_review_allowed,'break_seconds_allowed',v_session.break_seconds_allowed,
      'break_seconds_used',v_session.break_seconds_used,'break_remaining_seconds',v_break_remaining,'break_started_at',v_session.break_started_at,
      'on_break',v_on_break,'active_block_position',v_current_block),
    'question',v_question,'items',v_items);
end;
$$;
revoke all on function public.get_study_session_state(uuid,integer) from public,anon;
grant execute on function public.get_study_session_state(uuid,integer) to authenticated;

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
    'key_terms',public.student_key_terms(q.id),
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
