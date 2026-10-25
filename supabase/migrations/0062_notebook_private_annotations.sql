-- Add a private, searchable projection of the learner's passage annotations.
create or replace function public.list_my_qbank_annotations(p_limit integer default 200)
returns table(
  annotation_id uuid,noted_at timestamptz,exam_code text,question_id uuid,
  content_code text,subject text,topic text,stem text,segment_key text,
  quote text,color text,note text
)
language sql stable security definer set search_path='' as $$
  select a.id,a.created_at,e.code,q.id,q.content_code,q.subject,q.topic,q.stem,
    a.segment_key,a.quote,a.color,a.note
  from public.question_annotations a
  join public.questions q on q.id=a.question_id
  join public.exams e on e.id=q.exam_id
  where a.user_id=auth.uid()
  order by a.updated_at desc,a.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),500));
$$;
revoke all on function public.list_my_qbank_annotations(integer) from public,anon;
grant execute on function public.list_my_qbank_annotations(integer) to authenticated;
