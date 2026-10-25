-- Practice sessions are untimed by default, but learners can pause elapsed time.
-- Exams keep their configured timing rules and existing bounded break behavior.
alter table public.study_sessions
  add column if not exists practice_paused_seconds integer not null default 0 check (practice_paused_seconds between 0 and 86400),
  add column if not exists practice_pause_started_at timestamptz;

create or replace function public.pause_practice_session(p_session_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'unauthorized'; end if;
  update public.study_sessions set practice_pause_started_at=now(),break_started_at=now()
  where id=p_session_id and user_id=auth.uid() and status='in_progress' and mode='practice'
    and practice_pause_started_at is null and break_started_at is null;
  if not found then raise exception 'session_not_pauseable'; end if;
end;
$$;
revoke all on function public.pause_practice_session(uuid) from public,anon;
grant execute on function public.pause_practice_session(uuid) to authenticated;

create or replace function public.resume_practice_session(p_session_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_elapsed integer;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'unauthorized'; end if;
  select greatest(0,floor(extract(epoch from now()-practice_pause_started_at))::integer) into v_elapsed
  from public.study_sessions where id=p_session_id and user_id=auth.uid() and status='in_progress'
    and mode='practice' and practice_pause_started_at is not null for update;
  if not found then raise exception 'session_not_resumable'; end if;
  update public.study_sessions set practice_paused_seconds=practice_paused_seconds+v_elapsed,practice_pause_started_at=null,break_started_at=null
    where id=p_session_id and user_id=auth.uid();
end;
$$;
revoke all on function public.resume_practice_session(uuid) from public,anon;
grant execute on function public.resume_practice_session(uuid) to authenticated;

-- Allow the canonical session-state RPC to represent a paused session without
-- a question payload. This also makes a refresh during an exam break recoverable.
create or replace function public.get_study_session_state(p_session_id uuid,p_position integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_session record; v_item record; v_question jsonb; v_items jsonb;
  v_requested integer; v_current_block integer; v_session_block_count integer;
  v_active_elapsed numeric; v_break_elapsed numeric:=0; v_wall_elapsed numeric;
  v_on_break boolean:=false; v_break_remaining integer:=0; v_key_terms text[];
begin
  select s.*,e.code exam_code,e.name exam_name,ep.total_duration_minutes,ep.max_items,
    ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.previous_block_review_allowed
  into v_session from public.study_sessions s join public.exams e on e.id=s.exam_id
    join public.exam_profiles ep on ep.exam_id=s.exam_id
  where s.id=p_session_id and s.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  v_wall_elapsed:=greatest(0,extract(epoch from now()-v_session.started_at));
  if v_session.status='in_progress' and v_session.mode='exam' and v_session.time_limit_seconds is not null
    and v_wall_elapsed>=v_session.time_limit_seconds then raise exception 'session_expired'; end if;
  if v_session.break_started_at is not null or (v_session.mode='practice' and v_session.practice_pause_started_at is not null) then
    v_on_break:=true;
    v_break_elapsed:=greatest(0,extract(epoch from now()-coalesce(v_session.practice_pause_started_at,v_session.break_started_at)));
  end if;
  v_active_elapsed:=greatest(0,v_wall_elapsed-v_session.break_seconds_used-v_session.practice_paused_seconds-v_break_elapsed);
  v_session_block_count:=greatest(1,ceil(v_session.requested_count::numeric/nullif(v_session.block_max_items,0))::integer);
  v_current_block:=case when v_session.mode='exam' then least(v_session_block_count,floor(v_active_elapsed/(v_session.block_duration_minutes*60))::integer+1) else greatest(1,v_session.current_block) end;
  v_break_remaining:=case when v_session.mode='exam' then greatest(0,v_session.break_seconds_allowed-v_session.break_seconds_used-floor(v_break_elapsed)::integer) else 0 end;
  v_requested:=case when coalesce(p_position,0)<=0 then v_session.current_position else greatest(1,least(p_position,v_session.requested_count)) end;
  select si.* into v_item from public.study_session_items si where si.session_id=p_session_id and si.position=v_requested;
  if not found then raise exception 'session_item_not_found'; end if;
  if not v_on_break and v_session.status='in_progress' and v_session.mode='exam' and not v_session.previous_block_review_allowed then
    if v_item.block_number<v_current_block then raise exception 'block_closed'; end if;
    if v_item.block_number>v_current_block then raise exception 'block_not_open'; end if;
  end if;
  select public.student_key_terms(v_item.question_id) into v_key_terms from public.questions q where q.id=v_item.question_id;
  if v_on_break then
    v_question:=null;
  else
    select jsonb_build_object('id',q.id,'content_code',q.content_code,'exam_id',q.exam_id,'stem',q.stem,'subject',q.subject,'topic',q.topic,
      'options',q.options,'difficulty',q.difficulty,
      'key_terms',case when v_item.is_correct is not null or v_session.mode='practice' then v_key_terms else array[]::text[] end,
      'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position)
        from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb),
      'answered',v_item.is_correct is not null,'selected_answer',v_item.selected_answer,'is_correct',v_item.is_correct,
      'correct_answer',case when v_item.is_correct is not null then q.answer_key else null end,
      'explanation',case when v_item.is_correct is not null then q.explanation else null end,
      'key_learning_point',case when v_item.is_correct is not null then (select vv.key_learning_point from public.question_versions vv where vv.question_id=q.id order by vv.version_no desc limit 1) else null end,
      'note',v_item.note) into v_question
    from public.questions q where q.id=v_item.question_id and q.is_published and q.workflow_status='published';
  end if;
  if v_question is null and not v_on_break then raise exception 'question_not_available'; end if;
  if not v_on_break and coalesce((select q.is_reconstruction from public.questions q where q.id=v_item.question_id),false) then
    v_question:=jsonb_set(v_question,'{reconstruction}',jsonb_build_object('is_reconstruction',true,
      'year',(select q.reconstruction_year from public.questions q where q.id=v_item.question_id),
      'label',coalesce((select q.reconstruction_label from public.questions q where q.id=v_item.question_id),'שחזור')),true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('position',si.position,'block',si.block_number,'answered',si.is_correct is not null,
    'correct',si.is_correct,'marked',si.marked_for_review,'has_note',nullif(trim(coalesce(si.note,'')),'') is not null) order by si.position),'[]'::jsonb)
  into v_items from public.study_session_items si where si.session_id=p_session_id;
  return jsonb_build_object('session',jsonb_build_object('id',v_session.id,'exam_code',v_session.exam_code,'exam_name',v_session.exam_name,
    'mode',v_session.mode,'status',v_session.status,'requested_count',v_session.requested_count,'time_limit_seconds',v_session.time_limit_seconds,
    'started_at',v_session.started_at,'finished_at',v_session.finished_at,'current_position',case when p_position is null or p_position<=0 then v_session.current_position else v_requested end,
    'current_block',v_current_block,'block_count',v_session_block_count,'score_percent',v_session.score_percent,'correct_count',v_session.correct_count,
    'answered_count',v_session.answered_count,'total_duration_minutes',v_session.total_duration_minutes,'max_items',v_session.max_items,
    'block_duration_minutes',v_session.block_duration_minutes,'block_max_items',v_session.block_max_items,
    'previous_block_review_allowed',v_session.previous_block_review_allowed,'break_seconds_allowed',v_session.break_seconds_allowed,
    'break_seconds_used',v_session.break_seconds_used,'break_remaining_seconds',v_break_remaining,'break_started_at',coalesce(v_session.practice_pause_started_at,v_session.break_started_at),
    'on_break',v_on_break,'active_block_position',v_current_block),'question',v_question,'items',v_items);
end;
$$;
revoke all on function public.get_study_session_state(uuid,integer) from public,anon;
grant execute on function public.get_study_session_state(uuid,integer) to authenticated;
