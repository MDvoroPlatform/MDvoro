-- Phase 32: Board Success Center analytics.
-- Server-side only. No new client-controlled writes.

create or replace function public.learning_exam_blueprint(p_exam_id uuid)
returns table(subject text, available bigint, attempted bigint, correct bigint, accuracy numeric, coverage numeric)
language sql stable security definer set search_path = ''
as $$
  with pool as (
    select q.id, q.subject
    from public.questions q
    where q.exam_id=p_exam_id
      and q.is_published=true
      and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
  ),
  attempts as (
    select a.question_id,
      count(*)::bigint attempts,
      count(*) filter(where a.is_correct=true)::bigint correct
    from public.question_attempts a
    join pool p on p.id=a.question_id
    where a.user_id=auth.uid()
    group by a.question_id
  ),
  branch as (
    select p.subject,
      count(*)::bigint available,
      count(*) filter(where coalesce(a.attempts,0)>0)::bigint attempted,
      coalesce(sum(coalesce(a.correct,0)),0)::bigint correct,
      coalesce(round(100.0*sum(coalesce(a.correct,0))/nullif(sum(coalesce(a.attempts,0)),0),1),0)::numeric accuracy
    from pool p left join attempts a on a.question_id=p.id
    group by p.subject
  )
  select subject,available,attempted,correct,accuracy,
    coalesce(round(100.0*attempted/nullif(available,0),1),0)::numeric coverage
  from branch
  order by coverage asc, accuracy asc, subject asc;
$$;
revoke all on function public.learning_exam_blueprint(uuid) from public,anon;
grant execute on function public.learning_exam_blueprint(uuid) to authenticated;

create or replace function public.learning_daily_activity(p_days integer default 14)
returns table(day date, questions bigint, correct bigint, accuracy numeric)
language sql stable security definer set search_path = ''
as $$
  with days as (
    select generate_series(current_date-greatest(1,least(p_days,31))+1,current_date,interval '1 day')::date as study_day
  ),
  raw as (
    select (a.created_at at time zone coalesce(nullif(p.timezone,''),'UTC'))::date as study_day,
      count(*)::bigint questions,
      coalesce(sum(case when a.is_correct then 1 else 0 end),0)::bigint correct
    from public.question_attempts a
    join public.profiles p on p.id=a.user_id
    where a.user_id=auth.uid()
      and a.created_at >= now() - (greatest(1,least(p_days,31)) || ' days')::interval
    group by 1
  )
  select d.study_day,coalesce(r.questions,0),coalesce(r.correct,0),
    case when coalesce(r.questions,0)>0 then round(100.0*r.correct/r.questions,1) else 0 end::numeric
  from days d left join raw r on r.study_day=d.study_day
  order by d.study_day;
$$;
revoke all on function public.learning_daily_activity(integer) from public,anon;
grant execute on function public.learning_daily_activity(integer) to authenticated;

create or replace function public.learning_mistake_profile(p_exam_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with recent as (
    select a.is_correct,a.confidence,a.duration_ms,q.exam_id,q.content_code
    from public.question_attempts a
    join public.questions q on q.id=a.question_id
    where a.user_id=auth.uid() and q.exam_id=p_exam_id and a.is_correct is not null
  )
  select jsonb_build_object(
    'total_wrong',coalesce(count(*) filter(where is_correct=false),0)::int,
    'high_confidence_wrong',coalesce(count(*) filter(where is_correct=false and confidence>=4),0)::int,
    'low_confidence_wrong',coalesce(count(*) filter(where is_correct=false and confidence<=2),0)::int,
    'slow_wrong',coalesce(count(*) filter(where is_correct=false and duration_ms>=180000),0)::int
  ) from recent;
$$;
revoke all on function public.learning_mistake_profile(uuid) from public,anon;
grant execute on function public.learning_mistake_profile(uuid) to authenticated;
