-- MDvoro Phase 31: close the QBank -> flashcard loop server-side.
-- Creates one private learner-owned flashcard from an accessible published question.
create or replace function public.create_flashcard_from_question(p_question_id uuid)
returns table(card_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stem text;
  v_explanation text;
  v_key_learning_point text;
  v_subject text;
  v_topic text;
  v_existing uuid;
  v_back text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select q.stem, q.explanation, q.key_learning_point, q.subject, q.topic
    into v_stem, v_explanation, v_key_learning_point, v_subject, v_topic
  from public.questions q
  where q.id = p_question_id
    and q.is_published = true
    and q.workflow_status = 'published'
    and (q.access_tier = 'free' or public.has_active_subscription())
  limit 1;

  if v_stem is null then
    raise exception 'question_not_found';
  end if;

  select f.id into v_existing
  from public.flashcards f
  where f.owner_id = auth.uid()
    and f.source_question_id = p_question_id
  order by f.created_at desc
  limit 1;

  if v_existing is not null then
    return query select v_existing, false;
    return;
  end if;

  v_back := coalesce(nullif(trim(v_explanation), ''), 'Review this question and its rationale again.')
    || case when nullif(trim(v_key_learning_point), '') is not null
      then E'\n\nKey learning point: ' || trim(v_key_learning_point)
      else '' end;

  insert into public.flashcards(owner_id, front, back, card_type, tags, source_question_id)
  values (
    auth.uid(),
    trim(v_stem),
    v_back,
    'clinical',
    array_remove(array[nullif(trim(v_subject), ''), nullif(trim(v_topic), '')], null),
    p_question_id
  )
  returning id into v_id;

  return query select v_id, true;
end;
$$;

revoke all on function public.create_flashcard_from_question(uuid) from public;
grant execute on function public.create_flashcard_from_question(uuid) to authenticated;
