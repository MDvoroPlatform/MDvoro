-- Phase 31: Israel reconstruction-first QBank
create or replace function public.start_reconstruction_session(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice',
  p_pool text default 'mixed',
  p_reconstruction_year smallint default null
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer,break_seconds_allowed integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_exam record;
  v_session uuid;
  v_total integer;
  v_time integer;
  v_blocks integer;
  v_break integer;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count < 1 or p_question_count > 300 then raise exception 'invalid_question_count'; end if;
  if p_reconstruction_year is null or p_reconstruction_year < 1900 or p_reconstruction_year > 2100 then raise exception 'reconstruction_year_required'; end if;
  if p_pool not in ('mixed','unseen','unanswered','incorrect','answered','bookmarked') then raise exception 'invalid_pool'; end if;

  select e.id,e.code,ep.* into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_mode='exam' and p_question_count > v_exam.max_items then raise exception 'exam_question_limit'; end if;

  v_blocks := greatest(1,ceil(p_question_count::numeric / v_exam.block_max_items)::integer);
  v_break := case
    when p_mode='exam' and p_question_count >= v_exam.max_items and v_exam.block_count > 1 then v_exam.break_minutes * 60
    else 0
  end;
  v_time := case
    when p_mode='practice' then null
    when p_question_count >= v_exam.max_items then v_exam.total_duration_minutes * 60
    else v_blocks * v_exam.block_duration_minutes * 60
  end;

  select count(*) into v_total
  from public.questions q
  left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
  where q.exam_id=p_exam_id and q.is_reconstruction=true and q.reconstruction_year=p_reconstruction_year and q.is_published=true and q.workflow_status='published'
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
      'reconstruction_year',p_reconstruction_year,
      'timing_policy',case when p_mode='exam' and p_question_count >= v_exam.max_items then 'official_full_exam_window' else 'scaled_block_pacing' end
    )
  ) returning id into v_session;

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,
      ceil(row_number() over(order by random())::numeric/v_exam.block_max_items)::int,q.id
    from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_reconstruction=true and q.reconstruction_year=p_reconstruction_year and q.is_published=true and q.workflow_status='published'
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
      where q.exam_id=p_exam_id and q.is_reconstruction=true and q.reconstruction_year=p_reconstruction_year and q.is_published=true and q.workflow_status='published'
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
    jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'pool',p_pool,
      'reconstruction_year',p_reconstruction_year,'break_seconds_allowed',v_break));
  return query select v_session,v_time,case when p_mode='exam' then v_blocks else 1 end,v_exam.block_duration_minutes,v_exam.block_max_items,v_break;
end;
$$;
revoke all on function public.start_reconstruction_session(uuid,text[],text[],integer,public.study_session_mode,text,smallint) from public,anon;
grant execute on function public.start_reconstruction_session(uuid,text[],text[],integer,public.study_session_mode,text,smallint) to authenticated;

create or replace function public.qbank_reconstruction_years(p_exam_id uuid)
returns table(year smallint, question_count bigint)
language sql stable security definer set search_path = ''
as $$
  select q.reconstruction_year, count(*)::bigint
  from public.questions q
  where q.exam_id=p_exam_id
    and q.is_reconstruction=true
    and q.reconstruction_year is not null
    and q.is_published=true
    and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
  group by q.reconstruction_year
  order by q.reconstruction_year desc;
$$;
revoke all on function public.qbank_reconstruction_years(uuid) from public,anon;
grant execute on function public.qbank_reconstruction_years(uuid) to authenticated;

create or replace function public.qbank_reconstruction_pool_counts(
  p_exam_id uuid,
  p_reconstruction_year smallint,
  p_subjects text[] default '{}',
  p_topics text[] default '{}'
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with latest_session as (
    select ss.id from public.study_sessions ss
    where ss.user_id=auth.uid() and ss.status in ('completed','expired')
    order by coalesce(ss.finished_at,ss.created_at) desc limit 1
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
    and q.is_reconstruction=true
    and q.reconstruction_year=p_reconstruction_year
    and q.is_published=true
    and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics));
$$;
revoke all on function public.qbank_reconstruction_pool_counts(uuid,smallint,text[],text[]) from public,anon;
grant execute on function public.qbank_reconstruction_pool_counts(uuid,smallint,text[],text[]) to authenticated;
