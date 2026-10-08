-- MDvoro Rules-Based Learning Engine v1
-- No AI, no model calls, no generated text. Every recommendation is derived
-- deterministically from authenticated learner events, content metadata and plan settings.

create or replace function public.smart_student_snapshot()
returns jsonb
language sql stable security definer set search_path = ''
as $$
with
me as (
  select p.active_exam_id, sp.target_date, sp.daily_minutes
  from public.profiles p
  left join lateral (
    select * from public.study_plans s
    where s.user_id = auth.uid()
    order by s.updated_at desc
    limit 1
  ) sp on true
  where p.id = auth.uid()
),
attempts as (
  select a.*, q.subject, coalesce(nullif(q.topic,''), q.subject, 'General') as topic,
         q.difficulty
  from public.question_attempts a
  join public.questions q on q.id = a.question_id
  where a.user_id = auth.uid()
),
recent as (
  select * from attempts where created_at >= now() - interval '90 days'
),
overall as (
  select count(*)::int attempts,
         coalesce(round(100 * avg(case when is_correct then 1.0 else 0.0 end),1),0)::numeric accuracy,
         coalesce(round(avg(nullif(duration_ms,0))/1000.0,1),0)::numeric avg_seconds,
         coalesce(round(avg(confidence),1),0)::numeric avg_confidence
  from recent
),
topic_stats as (
  select topic, count(*)::int attempts,
         round(100 * avg(case when is_correct then 1.0 else 0.0 end),1)::numeric accuracy,
         max(created_at) last_attempt_at,
         round(avg(nullif(duration_ms,0))/1000.0,1)::numeric avg_seconds
  from recent
  group by topic
),
weak as (
  select * from topic_stats
  where attempts >= 2
  order by accuracy asc, attempts desc, topic asc
  limit 5
),
due as (
  select count(*)::int due_cards
  from public.flashcards
  where owner_id=auth.uid() and suspended=false and due_at <= now()
),
activity_days as (
  select distinct (created_at at time zone 'UTC')::date as activity_day
  from recent
),
streak as (
  select count(*)::int days
  from generate_series(0,89) g(i)
  where ((current_date - g.i)::date) in (select activity_day from activity_days)
    and not exists (
      select 1 from generate_series(0,g.i-1) h(j)
      where ((current_date - h.j)::date) not in (select activity_day from activity_days)
    )
),
today as (
  select count(*)::int attempts_today,
         coalesce(sum(case when is_correct then 1 else 0 end),0)::int correct_today
  from attempts where created_at >= date_trunc('day',now())
),
week as (
  select count(*)::int attempts_7d,
         coalesce(sum(case when is_correct then 1 else 0 end),0)::int correct_7d
  from attempts where created_at >= now() - interval '7 days'
),
plan as (
  select coalesce((select daily_minutes from me),30)::int daily_minutes,
         (select target_date from me) target_date,
         (select active_exam_id from me) exam_id
),
target as (
  select greatest(5, least(80, round(daily_minutes / 2.0)::int)) daily_questions,
         case when target_date is null then null else greatest(0,(target_date-current_date))::int end days_remaining,
         daily_minutes,target_date,exam_id
  from plan
),
confidence as (
  select coalesce(round(avg(case when confidence >= 4 and is_correct then 1.0 when confidence >= 4 and not is_correct then 0.0 end)*100,1),0)::numeric high_confidence_accuracy,
         coalesce(round(avg(case when confidence <= 2 and is_correct then 1.0 when confidence <= 2 and not is_correct then 0.0 end)*100,1),0)::numeric low_confidence_accuracy
  from recent
  where confidence is not null
),
recommendations as (
  select jsonb_agg(item order by priority, key) items
  from (
    select 10 priority, 'retrieval' key,
      jsonb_build_object('type','flashcards','priority',10,'title','Review due memory','reason',format('You have %s cards due for retrieval.',(select due_cards from due)),'target_count',least((select due_cards from due),30)) item
    where (select due_cards from due) > 0
    union all
    select 20, 'weak-topic',
      jsonb_build_object('type','qbank','priority',20,'title','Practice your weakest topic','reason',format('%s is at %s%% after %s attempts.',w.topic,w.accuracy,w.attempts),'topic',w.topic,'target_count',10) item
    from (select * from weak limit 1) w
    union all
    select 30, 'daily-target',
      jsonb_build_object('type','qbank','priority',30,'title','Complete today''s target','reason',format('%s of %s recommended questions completed today.',(select attempts_today from today),(select daily_questions from target)),'target_count',greatest(0,(select daily_questions from target)-(select attempts_today from today))) item
    where (select attempts_today from today) < (select daily_questions from target)
    union all
    select 40, 'exam-pressure',
      jsonb_build_object('type','mixed','priority',40,'title','Switch to timed mixed practice','reason',format('%s days remain and recent accuracy is %s%%.',(select days_remaining from target),(select accuracy from overall)),'target_count',20) item
    where (select days_remaining from target) between 1 and 14 and (select attempts from overall) >= 5
    union all
    select 50, 'challenge',
      jsonb_build_object('type','qbank','priority',50,'title','Increase difficulty','reason','Your recent accuracy is strong enough to benefit from harder questions.','target_count',10) item
    where (select accuracy from overall) >= 85 and (select attempts from overall) >= 10
  ) ranked
),
state as (
  select case
    when (select attempts from overall)=0 then 'new'
    when (select accuracy from overall)<60 then 'recovery'
    when (select accuracy from overall)<75 then 'building'
    when (select accuracy from overall)<90 then 'strong'
    else 'advanced'
  end learner_state
)
select jsonb_build_object(
  'version',1,
  'ai_enabled',false,
  'generated_at',now(),
  'learner_state',(select learner_state from state),
  'overall',row_to_json((select overall from overall)),
  'today',row_to_json((select today from today)),
  'week',row_to_json((select week from week)),
  'streak_days',(select days from streak),
  'due_cards',(select due_cards from due),
  'plan',row_to_json((select target from target)),
  'confidence',row_to_json((select confidence from confidence)),
  'weak_topics',coalesce((select jsonb_agg(row_to_json(w)) from weak w),'[]'::jsonb),
  'recommendations',coalesce((select items from recommendations),'[]'::jsonb)
);
$$;

revoke all on function public.smart_student_snapshot() from public;
grant execute on function public.smart_student_snapshot() to authenticated;

create index if not exists question_attempts_user_created_topic_idx
  on public.question_attempts(user_id, created_at desc);
