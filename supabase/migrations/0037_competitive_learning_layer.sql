-- Phase 31: competitive learning layer.
-- Adds a privacy-safe readiness snapshot and a persistent personal notebook over existing question notes.

create or replace function public.learning_readiness(p_exam_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with accessible_questions as (
    select count(*)::numeric as published_count
    from public.questions q
    where q.exam_id=p_exam_id
      and q.is_published=true
      and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
  ),
  my_attempts as (
    select
      count(*) filter (where qa.is_correct is not null)::numeric as attempts,
      count(*) filter (where qa.is_correct=true)::numeric as correct,
      count(distinct qa.question_id)::numeric as distinct_questions,
      count(*) filter (where qa.is_correct is not null and qa.created_at >= now()-interval '7 days')::numeric as attempts_7d,
      count(*) filter (where qa.is_correct=true and qa.confidence >= 4)::numeric as high_conf_correct,
      count(*) filter (where qa.is_correct is not null and qa.confidence >= 4)::numeric as high_conf_attempts,
      count(*) filter (where qa.is_correct=true and qa.confidence <= 2)::numeric as low_conf_correct,
      count(*) filter (where qa.is_correct is not null and qa.confidence <= 2)::numeric as low_conf_attempts
    from public.question_attempts qa
    join public.questions q on q.id=qa.question_id
    where qa.user_id=auth.uid() and q.exam_id=p_exam_id
  ),
  my_metrics as (
    select
      a.*,
      case when a.attempts>0 then round(a.correct/a.attempts*100,1) else 0 end as accuracy,
      case when aq.published_count>0 then least(100,round(a.distinct_questions/aq.published_count*100,1)) else 0 end as coverage,
      case when a.attempts_7d>0 then least(100,round(a.attempts_7d/40*100,1)) else 0 end as activity,
      case when a.high_conf_attempts>0 and a.low_conf_attempts>0
        then round((a.high_conf_correct/a.high_conf_attempts*100)-(a.low_conf_correct/a.low_conf_attempts*100),1)
        else null end as confidence_gap
    from my_attempts a cross join accessible_questions aq
  ),
  due as (
    select count(*)::numeric as due_cards
    from public.flashcards f
    where f.owner_id=auth.uid() and f.due_at <= now()
  ),
  peer as (
    select qa.user_id,
      count(*)::numeric as attempts,
      sum(case when qa.is_correct=true then 1 else 0 end)::numeric / nullif(count(*)::numeric,0) * 100 as accuracy
    from public.question_attempts qa
    join public.questions q on q.id=qa.question_id
    where q.exam_id=p_exam_id and qa.is_correct is not null
    group by qa.user_id
    having count(*) >= 20
  ),
  peer_summary as (
    select
      count(*)::integer as participant_count,
      count(*) filter(where peer.accuracy < (select accuracy from my_metrics))::integer as lower_count
    from peer
  ),
  score as (
    select
      mm.*,
      d.due_cards,
      least(100,round(mm.accuracy*0.50 + mm.coverage*0.20 + mm.activity*0.15 + greatest(0,100-least(100,d.due_cards/50*100))*0.15,1)) as readiness_score,
      ps.participant_count,
      case when ps.participant_count >= 10 then round(ps.lower_count::numeric/nullif(ps.participant_count,0)*100,1) else null end as peer_percentile
    from my_metrics mm cross join due d cross join peer_summary ps
  )
  select jsonb_build_object(
    'exam_id', p_exam_id,
    'readiness_score', readiness_score,
    'attempts', attempts,
    'accuracy', accuracy,
    'coverage', coverage,
    'attempts_7d', attempts_7d,
    'due_cards', due_cards,
    'confidence_gap', confidence_gap,
    'peer_percentile', peer_percentile,
    'peer_participants', participant_count
  )
  from score;
$$;
revoke all on function public.learning_readiness(uuid) from public, anon;
grant execute on function public.learning_readiness(uuid) to authenticated;

create or replace function public.list_my_notebook(p_limit integer default 100)
returns table(
  session_id uuid,
  note_position integer,
  noted_at timestamptz,
  exam_code text,
  exam_name text,
  question_id uuid,
  content_code text,
  subject text,
  topic text,
  stem text,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ss.id,
    si.position,
    coalesce(ss.finished_at,ss.created_at),
    e.code,
    e.name,
    q.id,
    q.content_code,
    q.subject,
    q.topic,
    q.stem,
    si.note
  from public.study_session_items si
  join public.study_sessions ss on ss.id=si.session_id and ss.user_id=auth.uid()
  join public.exams e on e.id=ss.exam_id
  join public.questions q on q.id=si.question_id
  where nullif(trim(coalesce(si.note,'')),'') is not null
  order by coalesce(ss.finished_at,ss.created_at) desc, si.position asc
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.list_my_notebook(integer) from public, anon;
grant execute on function public.list_my_notebook(integer) to authenticated;
