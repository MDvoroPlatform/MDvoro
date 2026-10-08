-- Phase 31: subject-level heatmap for fast weakness discovery.
create or replace function public.learning_subject_heatmap()
returns table(subject text, attempts bigint, correct bigint, accuracy numeric)
language sql stable security definer set search_path = ''
as $$
  select q.subject,
    count(a.id)::bigint as attempts,
    coalesce(sum(case when a.is_correct then 1 else 0 end),0)::bigint as correct,
    round(100.0 * avg(case when a.is_correct then 1.0 else 0.0 end),1) as accuracy
  from public.question_attempts a
  join public.questions q on q.id=a.question_id
  where a.user_id=auth.uid()
    and q.is_published=true
    and q.workflow_status='published'
  group by q.subject
  order by accuracy asc, attempts desc, q.subject;
$$;
revoke all on function public.learning_subject_heatmap() from public,anon;
grant execute on function public.learning_subject_heatmap() to authenticated;
