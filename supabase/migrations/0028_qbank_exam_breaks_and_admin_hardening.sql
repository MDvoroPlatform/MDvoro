-- MDvoro Phase 24: exact exam-session controls, retry-safe review, and admin hierarchy hardening.
-- The full-length USMLE profiles intentionally keep wall-clock time separate from active block time:
-- Step 1: 8h wall / 14x30m active blocks / 55m break bank; Step 2 CK: 9h wall / 16x30m / 55m break bank.

alter table public.study_sessions
  add column if not exists break_seconds_allowed integer not null default 0 check (break_seconds_allowed between 0 and 14400),
  add column if not exists break_seconds_used integer not null default 0 check (break_seconds_used between 0 and 14400),
  add column if not exists break_started_at timestamptz;

create index if not exists study_sessions_user_started_idx on public.study_sessions(user_id, started_at desc);

-- Remove the accidental legacy two-argument overload introduced in the previous completion pass.
drop function if exists public.admin_list_users(text, integer);

-- Super admins inherit the complete editorial surface while regular admins keep their scoped permissions.
create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role=p.role
    where p.id=auth.uid() and p.account_status='active' and rp.permission_key=p_permission
  );
$$;
revoke all on function public.has_permission(text) from public,anon;
grant execute on function public.has_permission(text) to authenticated;

drop function if exists public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text);

create or replace function public.start_study_session(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice',
  p_pool text default 'mixed'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer,break_seconds_allowed integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_exam record;
  v_session uuid;
  v_total integer;
  v_time integer;
  v_blocks integer;
  v_break integer;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count < 1 or p_question_count > 300 then raise exception 'invalid_question_count'; end if;
  if p_pool not in ('mixed','unseen','unanswered','incorrect','answered','bookmarked') then raise exception 'invalid_pool'; end if;

  select e.id,e.code,ep.* into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_mode='exam' and p_question_count > v_exam.max_items then raise exception 'exam_question_limit'; end if;

  v_blocks := greatest(1,ceil(p_question_count::numeric / v_exam.block_max_items)::integer);
  v_break := case
    when p_mode='exam' and p_question_count >= v_exam.max_items and v_exam.block_count > 1 then v_exam.break_minutes * 60
    else 0
  end;
  v_time := case
    when p_mode='practice' then null
    when p_question_count >= v_exam.max_items then v_exam.total_duration_minutes * 60
    else v_blocks * v_exam.block_duration_minutes * 60
  end;

  select count(*) into v_total
  from public.questions q
  left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    and (
      p_pool='mixed'
      or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
      or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct)
      or (p_pool='answered' and coalesce(qs.attempts,0)>0)
      or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
      or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
    );
  if v_total < p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,break_seconds_allowed,configuration)
  values(
    auth.uid(),p_exam_id,p_mode,p_question_count,v_time,v_break,
    jsonb_build_object(
      'subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),
      'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),
      'exam_code',v_exam.code,
      'pool',p_pool,
      'timing_policy',case when p_mode='exam' and p_question_count >= v_exam.max_items then 'official_full_exam_window' else 'scaled_block_pacing' end
    )
  ) returning id into v_session;

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,
      ceil(row_number() over(order by random())::numeric/v_exam.block_max_items)::int,q.id
    from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
      and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
      and (
        p_pool='mixed'
        or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
        or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct)
        or (p_pool='answered' and coalesce(qs.attempts,0)>0)
        or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
        or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
      )
    order by random() limit p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by adaptive_score desc,random())::int,
      ceil(row_number() over(order by adaptive_score desc,random())::numeric/v_exam.block_max_items)::int,q.id
    from (
      select q,
        (case
          when p_pool='unseen' and coalesce(qs.attempts,0)=0 then 5000
          when p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct then 4500
          when p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts then 4000
          when p_pool='answered' and coalesce(qs.attempts,0)>0 then 2500
          when p_pool='bookmarked' then 3000
          when coalesce(qs.attempts,0)=0 then 1000
          else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4
        end)
        + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end adaptive_score
      from public.questions q
      left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (
          p_pool='mixed'
          or (p_pool='unseen' and coalesce(qs.attempts,0)=0)
          or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct)
          or (p_pool='answered' and coalesce(qs.attempts,0)>0)
          or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts)
          or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id))
        )
    ) q order by adaptive_score desc,random() limit p_question_count;
  end if;

  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,
    jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'pool',p_pool,'break_seconds_allowed',v_break));
  return query select v_session,v_time,case when p_mode='exam' then v_blocks else 1 end,v_exam.block_duration_minutes,v_exam.block_max_items,v_break;
end;
$$;
revoke all on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) from public,anon;
grant execute on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) to authenticated;

create or replace function public.get_study_session_state(p_session_id uuid,p_position integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_session record;
  v_item record;
  v_question jsonb;
  v_items jsonb;
  v_requested integer;
  v_current_block integer;
  v_active_elapsed numeric;
  v_break_elapsed numeric := 0;
  v_wall_elapsed numeric;
  v_on_break boolean := false;
  v_break_remaining integer := 0;
  v_key_terms text[];
begin
  select s.*,e.code exam_code,e.name exam_name,ep.total_duration_minutes,ep.max_items,ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.previous_block_review_allowed
  into v_session
  from public.study_sessions s join public.exams e on e.id=s.exam_id join public.exam_profiles ep on ep.exam_id=e.id
  where s.id=p_session_id and s.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;

  v_wall_elapsed:=greatest(0,extract(epoch from now()-v_session.started_at));
  if v_session.mode='exam' and v_session.time_limit_seconds is not null and v_wall_elapsed >= v_session.time_limit_seconds then raise exception 'session_expired'; end if;
  if v_session.break_started_at is not null then
    v_on_break:=true;
    v_break_elapsed:=greatest(0,extract(epoch from now()-v_session.break_started_at));
  end if;
  v_active_elapsed:=greatest(0,v_wall_elapsed-v_session.break_seconds_used-v_break_elapsed);
  v_current_block:=case when v_session.mode='exam' then least(v_session.block_count,floor(v_active_elapsed/(v_session.block_duration_minutes*60))::integer+1) else greatest(1,v_session.current_block) end;
  v_break_remaining:=greatest(0,v_session.break_seconds_allowed-v_session.break_seconds_used-floor(v_break_elapsed)::integer);

  v_requested:=greatest(1,least(p_position,v_session.requested_count));
  select si.* into v_item from public.study_session_items si where si.session_id=p_session_id and si.position=v_requested;
  if not found then raise exception 'session_item_not_found'; end if;
  if not v_on_break and v_session.mode='exam' and not v_session.previous_block_review_allowed then
    if v_item.block_number < v_current_block then raise exception 'block_closed'; end if;
    if v_item.block_number > v_current_block then raise exception 'block_not_open'; end if;
  end if;

  select coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end)
    into v_key_terms from public.questions q where q.id=v_item.question_id;

  if v_on_break then
    v_question:=null;
  else
    select jsonb_build_object(
      'id',q.id,'content_code',q.content_code,'exam_id',q.exam_id,'stem',q.stem,'subject',q.subject,'topic',q.topic,'options',q.options,'difficulty',q.difficulty,
      'key_terms',case when v_item.is_correct is not null or v_session.mode='practice' then v_key_terms else array[]::text[] end,
      'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position)
        from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb),
      'answered',v_item.is_correct is not null,'selected_answer',v_item.selected_answer,'is_correct',v_item.is_correct,
      'correct_answer',case when v_item.is_correct is not null then q.answer_key else null end,
      'explanation',case when v_item.is_correct is not null then q.explanation else null end,
      'key_learning_point',case when v_item.is_correct is not null then (select vv.key_learning_point from public.question_versions vv where vv.question_id=q.id order by vv.version_no desc limit 1) else null end,
      'note',v_item.note
    ) into v_question
    from public.questions q where q.id=v_item.question_id and q.is_published and q.workflow_status='published';
  end if;
  if v_question is null then raise exception 'question_not_available'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('position',si.position,'block',si.block_number,'answered',si.is_correct is not null,'correct',si.is_correct,'marked',si.marked_for_review,'has_note',nullif(trim(coalesce(si.note,'')),'') is not null) order by si.position),'[]'::jsonb)
  into v_items from public.study_session_items si where si.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object('id',v_session.id,'exam_code',v_session.exam_code,'exam_name',v_session.exam_name,'mode',v_session.mode,'status',v_session.status,'requested_count',v_session.requested_count,
      'time_limit_seconds',v_session.time_limit_seconds,'started_at',v_session.started_at,'finished_at',v_session.finished_at,'current_position',v_session.current_position,'current_block',v_current_block,
      'block_count',v_session.block_count,'score_percent',v_session.score_percent,'correct_count',v_session.correct_count,'answered_count',v_session.answered_count,'total_duration_minutes',v_session.total_duration_minutes,
      'max_items',v_session.max_items,'block_duration_minutes',v_session.block_duration_minutes,'block_max_items',v_session.block_max_items,'previous_block_review_allowed',v_session.previous_block_review_allowed,
      'break_seconds_allowed',v_session.break_seconds_allowed,'break_seconds_used',v_session.break_seconds_used,'break_remaining_seconds',v_break_remaining,'break_started_at',v_session.break_started_at,'on_break',v_on_break,'active_block_position',v_current_block),
    'question',v_question,'items',v_items);
end;
$$;
revoke all on function public.get_study_session_state(uuid,integer) from public,anon;
grant execute on function public.get_study_session_state(uuid,integer) to authenticated;

create or replace function public.start_exam_break(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; v_active_elapsed numeric; v_current_block integer; v_boundary numeric;
begin
  select ss.*,ep.block_duration_minutes,ep.block_count into s from public.study_sessions ss join public.exam_profiles ep on ep.exam_id=ss.exam_id where ss.id=p_session_id and ss.user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status<>'in_progress' or s.mode<>'exam' then raise exception 'invalid_break_state'; end if;
  if s.break_seconds_allowed<=s.break_seconds_used or s.break_started_at is not null then raise exception 'invalid_break_state'; end if;
  if now()>=s.started_at+make_interval(secs=>s.time_limit_seconds) then raise exception 'session_expired'; end if;
  v_active_elapsed:=greatest(0,extract(epoch from now()-s.started_at)-s.break_seconds_used);
  v_current_block:=least(s.block_count,floor(v_active_elapsed/(s.block_duration_minutes*60))::integer+1);
  if v_current_block<=1 or v_current_block>s.block_count then raise exception 'break_not_available'; end if;
  v_boundary:=(v_current_block-1)*s.block_duration_minutes*60;
  if v_active_elapsed-v_boundary>60 then raise exception 'break_not_available'; end if;
  update public.study_sessions set break_started_at=now() where id=p_session_id;
  return jsonb_build_object('break_started',true,'break_remaining_seconds',s.break_seconds_allowed-s.break_seconds_used);
end;
$$;
revoke all on function public.start_exam_break(uuid) from public,anon;
grant execute on function public.start_exam_break(uuid) to authenticated;

create or replace function public.end_exam_break(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; v_elapsed integer; v_used integer;
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.mode<>'exam' or s.break_started_at is null then raise exception 'break_not_active'; end if;
  v_elapsed:=greatest(0,extract(epoch from now()-s.break_started_at)::integer);
  v_used:=least(s.break_seconds_allowed,s.break_seconds_used+v_elapsed);
  update public.study_sessions set break_seconds_used=v_used,break_started_at=null where id=p_session_id;
  return jsonb_build_object('break_ended',true,'break_seconds_used',v_used,'break_remaining_seconds',s.break_seconds_allowed-v_used);
end;
$$;
revoke all on function public.end_exam_break(uuid) from public,anon;
grant execute on function public.end_exam_break(uuid) to authenticated;

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
  on conflict (session_item_id) do nothing
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

create or replace function public.finish_study_session(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s record; v_total integer; v_answered integer; v_correct integer; v_score numeric; v_status public.study_session_status;
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  v_status:=s.status;
  if s.status='in_progress' then
    select count(*),count(*) filter(where is_correct is not null),count(*) filter(where is_correct=true) into v_total,v_answered,v_correct from public.study_session_items where session_id=p_session_id;
    v_score:=case when v_total=0 then 0 else round((v_correct::numeric/v_total::numeric)*100,2) end;
    if s.mode='exam' and s.time_limit_seconds is not null and now()>=s.started_at+make_interval(secs=>s.time_limit_seconds) then
      v_status:='expired';
    else
      v_status:='completed';
    end if;
    update public.study_sessions set status=v_status,finished_at=now(),score_percent=v_score,correct_count=v_correct,answered_count=v_answered,break_started_at=null where id=p_session_id;
    perform public.record_learning_event(auth.uid(),'study_session_completed','study_session',p_session_id,p_session_id,jsonb_build_object('status',v_status,'score_percent',v_score));
  else
    v_total:=s.requested_count; v_answered:=s.answered_count; v_correct:=s.correct_count; v_score:=s.score_percent;
  end if;
  return jsonb_build_object('session_id',p_session_id,'status',v_status,'total_questions',v_total,'answered_count',v_answered,'correct_count',v_correct,'unanswered_count',v_total-v_answered,'score_percent',v_score);
end;
$$;
revoke all on function public.finish_study_session(uuid) from public,anon;
grant execute on function public.finish_study_session(uuid) to authenticated;

-- Preserve high-privilege hierarchy for user lifecycle operations.
create or replace function public.admin_set_user_status(p_user_id uuid,p_status text,p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor public.user_role; v_target public.user_role; v_super_count bigint;
begin
  if not public.has_permission('platform.users.suspend') then raise exception 'forbidden'; end if;
  if p_user_id=auth.uid() then raise exception 'self_status_change_forbidden'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid_status'; end if;
  select role into v_actor from public.profiles where id=auth.uid();
  select role into v_target from public.profiles where id=p_user_id;
  if v_target is null then raise exception 'user_not_found'; end if;
  if v_target in ('admin','super_admin') and v_actor<>'super_admin' then raise exception 'super_admin_required'; end if;
  if v_target='super_admin' and p_status='suspended' then
    select count(*) into v_super_count from public.profiles where role='super_admin' and account_status='active';
    if v_super_count<=1 then raise exception 'last_super_admin'; end if;
  end if;
  update public.profiles set account_status=p_status,status_reason=nullif(left(trim(coalesce(p_reason,'')),500),''),suspended_at=case when p_status='suspended' then now() else null end where id=p_user_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,case when p_status='suspended' then 'user_suspended' else 'user_reactivated' end,jsonb_build_object('reason',left(coalesce(p_reason,''),500)));
end;
$$;
revoke all on function public.admin_set_user_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated;

-- Reporting uses permission claims rather than hard-coded role names.
create or replace function public.admin_platform_metrics()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.has_permission('platform.system') then jsonb_build_object(
    'online_users',(select count(*) from public.user_presence where last_seen_at > now()-interval '5 minutes'),
    'active_users_24h',(select count(distinct user_id) from public.learning_events where occurred_at > now()-interval '24 hours'),
    'total_users',(select count(*) from public.profiles),
    'active_subscribers',(select count(distinct user_id) from public.subscriptions where status in ('trialing','active') and (current_period_end is null or current_period_end>now())),
    'month_revenue_minor',(select coalesce(sum(case when kind in ('refund','chargeback') or status in ('refunded','voided') then -amount_minor else amount_minor end),0) from public.billing_transactions where status in ('paid','refunded','voided') and occurred_at >= date_trunc('month',now())),
    'month_transactions',(select count(*) from public.billing_transactions where status='paid' and occurred_at >= date_trunc('month',now())),
    'month_currency',(select coalesce(min(currency),'ILS') from public.billing_transactions where status='paid' and occurred_at >= date_trunc('month',now()))
  ) else '{}'::jsonb end;
$$;
revoke all on function public.admin_platform_metrics() from public,anon;
grant execute on function public.admin_platform_metrics() to authenticated;

create or replace function public.admin_monthly_revenue(p_month date default date_trunc('month',now())::date)
returns table(day date,provider text,kind text,status text,currency text,amount_minor bigint,transaction_id uuid)
language sql stable security definer set search_path = '' as $$
  select b.occurred_at::date,b.provider,b.kind,b.status,b.currency,b.amount_minor,b.id
  from public.billing_transactions b
  where public.has_permission('platform.revenue')
    and b.occurred_at >= date_trunc('month',p_month::timestamptz)
    and b.occurred_at < date_trunc('month',p_month::timestamptz)+interval '1 month'
  order by b.occurred_at asc;
$$;
revoke all on function public.admin_monthly_revenue(date) from public,anon;
grant execute on function public.admin_monthly_revenue(date) to authenticated;

-- Explicit grants for the new break operations.
select pg_catalog.set_config('search_path','','false');
