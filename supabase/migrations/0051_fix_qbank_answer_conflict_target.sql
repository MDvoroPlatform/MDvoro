-- Match the partial unique index used to guarantee one attempt per session item.
-- PostgreSQL requires the ON CONFLICT target predicate to infer this index.
create or replace function public.submit_study_session_answer(
  p_session_id uuid,p_position integer,p_selected_answer text,p_duration_ms integer default null,p_confidence smallint default null,p_client_mutation_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; si record; q record; v_correct boolean; v_attempt uuid; v_existing_item uuid; v_current_block integer; v_wall_elapsed numeric; v_active_elapsed numeric;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  select ss.*,ep.previous_block_review_allowed,ep.block_count,ep.block_duration_minutes,ep.block_max_items into s
  from public.study_sessions ss join public.exam_profiles ep on ep.exam_id=ss.exam_id where ss.id=p_session_id and ss.user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status<>'in_progress' then raise exception 'session_not_active'; end if;
  v_wall_elapsed:=greatest(0,extract(epoch from now()-s.started_at));
  if s.mode='exam' and s.time_limit_seconds is not null and v_wall_elapsed>=s.time_limit_seconds then
    update public.study_sessions set status='expired',finished_at=now() where id=p_session_id;
    raise exception 'session_expired';
  end if;
  if s.break_started_at is not null then raise exception 'on_break'; end if;
  select * into si from public.study_session_items where session_id=p_session_id and position=p_position for update;
  if not found then raise exception 'session_item_not_found'; end if;
  if s.mode='exam' and not s.previous_block_review_allowed then
    v_active_elapsed:=greatest(0,v_wall_elapsed-s.break_seconds_used);
    v_current_block:=least(s.block_count,floor(v_active_elapsed/(s.block_duration_minutes*60))::integer+1);
    if si.block_number<v_current_block then raise exception 'block_closed'; end if;
    if si.block_number>v_current_block then raise exception 'block_not_open'; end if;
  end if;
  if p_client_mutation_id is not null then
    select qa.id,qa.session_item_id,qa.is_correct into v_attempt,v_existing_item,v_correct from public.question_attempts qa where qa.user_id=auth.uid() and qa.client_mutation_id=p_client_mutation_id;
    if v_attempt is not null then
      if v_existing_item<>si.id then raise exception 'mutation_id_reused'; end if;
      return jsonb_build_object('already_answered',true,'is_correct',v_correct,'selected_answer',si.selected_answer);
    end if;
  end if;
  if si.is_correct is not null then return jsonb_build_object('already_answered',true,'is_correct',si.is_correct,'selected_answer',si.selected_answer); end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence<1 or p_confidence>5) then raise exception 'invalid_confidence'; end if;
  select * into q from public.questions where id=si.question_id and is_published and workflow_status='published';
  if not found then raise exception 'question_not_available'; end if;
  if q.access_tier='premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=p_selected_answer) then raise exception 'invalid_answer_option'; end if;
  v_correct:=p_selected_answer=q.answer_key;
  insert into public.question_attempts(user_id,question_id,session_id,session_item_id,selected_answer,is_correct,duration_ms,confidence,client_mutation_id)
  values(auth.uid(),q.id,p_session_id,si.id,p_selected_answer,v_correct,p_duration_ms,p_confidence,p_client_mutation_id)
  on conflict (session_item_id) where session_item_id is not null do nothing
  returning id into v_attempt;
  if v_attempt is null then select qa.id,qa.is_correct into v_attempt,v_correct from public.question_attempts qa where qa.session_item_id=si.id; end if;
  update public.study_session_items set selected_answer=p_selected_answer,is_correct=v_correct,duration_ms=p_duration_ms,confidence=p_confidence,answered_at=coalesce(answered_at,now()) where id=si.id;
  update public.study_sessions set answered_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct is not null),
    correct_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct=true),current_position=greatest(current_position,least(p_position,requested_count)) where id=p_session_id;
  return jsonb_build_object('already_answered',false,'is_correct',v_correct,'correct_answer',q.answer_key,'explanation',q.explanation,
    'key_learning_point',(select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1),
    'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end));
exception when unique_violation then
  return jsonb_build_object('already_answered',true);
end;
$$;
revoke all on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) from public,anon;
grant execute on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) to authenticated;
