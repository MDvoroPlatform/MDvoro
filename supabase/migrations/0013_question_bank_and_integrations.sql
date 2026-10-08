-- MDvoro Phase 10: production QBank delivery contracts + AI integration support.

-- After an answer is submitted, revealing the correct option is safe and improves review UX.
-- Before submission, the answer key remains inaccessible.
drop function if exists public.submit_question_answer(uuid,text,integer,smallint);
create or replace function public.submit_question_answer(
  p_question_id uuid,
  p_selected_answer text,
  p_duration_ms integer default null,
  p_confidence smallint default null
)
returns table(is_correct boolean, correct_answer text, explanation text, key_learning_point text)
language plpgsql security definer set search_path=public
as $$
declare
  v_correct text;
  v_explanation text;
  v_learning text;
  v_is_correct boolean;
  v_tier text;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence < 1 or p_confidence > 5) then raise exception 'invalid_confidence'; end if;

  select q.answer_key, q.explanation, q.access_tier, v.key_learning_point
    into v_correct, v_explanation, v_tier, v_learning
  from public.questions q
  left join lateral (
    select key_learning_point
    from public.question_versions qv
    where qv.question_id = q.id
    order by qv.version_no desc
    limit 1
  ) v on true
  where q.id = p_question_id and q.is_published = true and q.workflow_status = 'published';

  if not found then raise exception 'question_not_available'; end if;
  if v_tier = 'premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;

  v_is_correct := upper(trim(p_selected_answer)) = upper(trim(v_correct));
  insert into public.question_attempts(user_id, question_id, selected_answer, is_correct, duration_ms, confidence)
  values (auth.uid(), p_question_id, p_selected_answer, v_is_correct, p_duration_ms, p_confidence);

  return query select v_is_correct, v_correct, v_explanation, v_learning;
end;
$$;
revoke all on function public.submit_question_answer(uuid,text,integer,smallint) from public;
grant execute on function public.submit_question_answer(uuid,text,integer,smallint) to authenticated;

-- Student-safe bank overview. It exposes counts and filters, never answer keys.
create or replace function public.question_bank_overview(p_exam_id uuid default null)
returns table(
  exam_id uuid,
  exam_code text,
  exam_name text,
  total_published bigint,
  free_published bigint,
  premium_published bigint,
  subject_count bigint
)
language sql stable security definer set search_path=public
as $$
  select e.id,e.code,e.name,
    count(q.id) filter (where q.is_published and q.workflow_status='published'),
    count(q.id) filter (where q.is_published and q.workflow_status='published' and q.access_tier='free'),
    count(q.id) filter (where q.is_published and q.workflow_status='published' and q.access_tier='premium'),
    count(distinct q.subject) filter (where q.is_published and q.workflow_status='published')
  from public.exams e
  left join public.questions q on q.exam_id=e.id
  where p_exam_id is null or e.id=p_exam_id
  group by e.id,e.code,e.name
  order by e.code;
$$;
revoke all on function public.question_bank_overview(uuid) from public;
grant execute on function public.question_bank_overview(uuid) to authenticated;
