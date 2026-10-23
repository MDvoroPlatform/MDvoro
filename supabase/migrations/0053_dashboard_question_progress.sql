-- Return one access-aware count row for the dashboard without exposing question data.
-- A null exam id means the student's entire eligible QBank; otherwise counts are exam-scoped.
create or replace function public.learning_question_progress(p_exam_id uuid default null)
returns table(total bigint, solved bigint)
language sql stable security definer set search_path = ''
as $$
  with eligible_questions as (
    select q.id
    from public.questions q
    where (p_exam_id is null or q.exam_id = p_exam_id)
      and q.is_published = true
      and q.workflow_status = 'published'
      and (q.access_tier = 'free' or public.has_active_subscription())
  )
  select count(*)::bigint,
    count(*) filter (where coalesce(s.attempts, 0) > 0)::bigint
  from eligible_questions q
  left join public.learner_question_stats s
    on s.question_id = q.id and s.user_id = auth.uid();
$$;

revoke all on function public.learning_question_progress(uuid) from public, anon;
grant execute on function public.learning_question_progress(uuid) to authenticated;
