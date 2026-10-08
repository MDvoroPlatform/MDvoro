-- MDvoro Phase 11: production hardening contracts.
-- Idempotent migration: safe to apply after Phase 10.

-- Study plans are intentionally one active plan per learner. If historical data
-- contains duplicates, keep the most recently updated row before enforcing the invariant.
delete from public.study_plans older
where exists (
  select 1
  from public.study_plans newer
  where newer.user_id = older.user_id
    and (newer.updated_at, newer.created_at, newer.id) > (older.updated_at, older.created_at, older.id)
);
create unique index if not exists study_plans_user_unique on public.study_plans(user_id);

-- Harden answer submission: the selected answer must actually be one of the
-- published question's options. This prevents forged arbitrary answer values
-- from polluting learner mastery data.
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
  v_options jsonb;
  v_selected text := upper(trim(coalesce(p_selected_answer,'')));
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if v_selected = '' then raise exception 'invalid_answer_option'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence < 1 or p_confidence > 5) then raise exception 'invalid_confidence'; end if;

  select q.answer_key, q.explanation, q.access_tier, q.options, v.key_learning_point
    into v_correct, v_explanation, v_tier, v_options, v_learning
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
  if not exists (
    select 1
    from jsonb_array_elements(v_options) option
    where upper(trim(option->>'id')) = v_selected
  ) then
    raise exception 'invalid_answer_option';
  end if;

  v_is_correct := v_selected = upper(trim(v_correct));
  insert into public.question_attempts(user_id, question_id, selected_answer, is_correct, duration_ms, confidence)
  values (auth.uid(), p_question_id, v_selected, v_is_correct, p_duration_ms, p_confidence);

  return query select v_is_correct, v_correct, v_explanation, v_learning;
end;
$$;
revoke all on function public.submit_question_answer(uuid,text,integer,smallint) from public;
grant execute on function public.submit_question_answer(uuid,text,integer,smallint) to authenticated;

-- Bound AI job input at the database boundary too, so a future caller cannot
-- bypass the application-level 100 KB validation contract.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.content_generation_jobs'::regclass
      and conname = 'content_generation_jobs_input_size_check'
  ) then
    alter table public.content_generation_jobs
      add constraint content_generation_jobs_input_size_check
      check (pg_column_size(input_json) <= 200000);
  end if;
end $$;

-- Defensive privilege posture for newly introduced helper objects.
revoke all on public.content_generation_jobs from anon;
revoke all on public.ai_content_suggestions from anon;
revoke all on public.study_plans from anon;
