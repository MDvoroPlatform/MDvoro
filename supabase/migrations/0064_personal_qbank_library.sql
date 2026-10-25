-- Searchable projection of existing saved and previously incorrect questions.
create or replace function public.list_my_qbank_library(p_limit integer default 300)
returns table(
  question_id uuid,exam_code text,content_code text,subject text,topic text,stem text,
  saved_at timestamptz,last_attempt_at timestamptz,is_saved boolean,was_incorrect boolean
)
language sql stable security definer set search_path='' as $$
  select q.id,e.code,q.content_code,q.subject,q.topic,q.stem,b.created_at,s.last_attempt_at,
    b.question_id is not null,coalesce(s.attempts,0)>coalesce(s.correct,0)
  from public.questions q join public.exams e on e.id=q.exam_id
  left join public.question_bookmarks b on b.question_id=q.id and b.user_id=auth.uid()
  left join public.learner_question_stats s on s.question_id=q.id and s.user_id=auth.uid()
  where auth.uid() is not null and q.is_published and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (b.question_id is not null or coalesce(s.attempts,0)>coalesce(s.correct,0))
  order by coalesce(b.created_at,s.last_attempt_at) desc nulls last,q.content_code
  limit greatest(1,least(coalesce(p_limit,300),500));
$$;
revoke all on function public.list_my_qbank_library(integer) from public,anon;
grant execute on function public.list_my_qbank_library(integer) to authenticated;
