-- MDvoro Learning Intelligence v1: real learner analytics and free-tier correctness.
-- Keeps analytics server-side and derives every metric from verified learning events.

-- Free questions must be answerable without a premium subscription.
create or replace function public.submit_question_answer(
  p_question_id uuid,
  p_selected_answer text,
  p_duration_ms integer default null,
  p_confidence smallint default null
)
returns table(is_correct boolean, explanation text, key_learning_point text)
language plpgsql security definer set search_path = public
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
  where q.id = p_question_id and q.is_published = true;

  if not found then raise exception 'question_not_available'; end if;
  if v_tier = 'premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;

  v_is_correct := p_selected_answer = v_correct;

  insert into public.question_attempts(user_id, question_id, selected_answer, is_correct, duration_ms, confidence)
  values (auth.uid(), p_question_id, p_selected_answer, v_is_correct, p_duration_ms, p_confidence);

  return query select v_is_correct, v_explanation, v_learning;
end;
$$;

revoke all on function public.submit_question_answer(uuid,text,integer,smallint) from public;
grant execute on function public.submit_question_answer(uuid,text,integer,smallint) to authenticated;

create or replace function public.learning_dashboard()
returns table(
  attempts_total bigint,
  correct_total bigint,
  accuracy_percent numeric,
  answered_today bigint,
  flashcards_total bigint,
  flashcards_due bigint,
  weak_topics jsonb
)
language sql stable security definer set search_path = public
as $$
  with attempts as (
    select a.question_id, a.is_correct, a.created_at
    from public.question_attempts a
    where a.user_id = auth.uid()
  ),
  topic_stats as (
    select
      coalesce(nullif(q.topic,''), q.subject, 'General') as topic,
      count(*)::bigint as attempts,
      sum(case when a.is_correct then 1 else 0 end)::bigint as correct,
      round(100.0 * avg(case when a.is_correct then 1.0 else 0.0 end), 1) as accuracy
    from attempts a
    join public.questions q on q.id = a.question_id
    group by coalesce(nullif(q.topic,''), q.subject, 'General')
    having count(*) >= 2
    order by accuracy asc, attempts desc, topic asc
    limit 8
  ),
  cards as (
    select count(*)::bigint as total,
           count(*) filter (where suspended = false and due_at <= now())::bigint as due
    from public.flashcards
    where owner_id = auth.uid()
  )
  select
    count(*)::bigint,
    coalesce(sum(case when is_correct then 1 else 0 end),0)::bigint,
    coalesce(round(100.0 * avg(case when is_correct then 1.0 else 0.0 end),1),0),
    count(*) filter (where created_at >= date_trunc('day', now()))::bigint,
    cards.total,
    cards.due,
    coalesce((select jsonb_agg(jsonb_build_object('topic',topic,'attempts',attempts,'correct',correct,'accuracy',accuracy)) from topic_stats),'[]'::jsonb)
  from attempts, cards
  group by cards.total, cards.due;
$$;

revoke all on function public.learning_dashboard() from public;
grant execute on function public.learning_dashboard() to authenticated;

create index if not exists question_attempts_user_created_question_idx
  on public.question_attempts(user_id, created_at desc, question_id);
