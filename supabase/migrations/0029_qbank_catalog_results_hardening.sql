-- MDvoro Phase 25: canonical QBank catalog, secure result replay, block-safe review state.
-- Keeps learner-visible behavior behind the session engine and explicit grants.

create or replace function public.qbank_catalog(p_exam_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_exam jsonb; v_subjects jsonb; v_topics jsonb; v_topics_by_subject jsonb; v_count bigint;
begin
  select jsonb_build_object(
    'id',e.id,'code',e.code,'name',e.name,
    'total_duration_minutes',ep.total_duration_minutes,'max_items',ep.max_items,
    'block_duration_minutes',ep.block_duration_minutes,'block_max_items',ep.block_max_items,
    'block_count',ep.block_count,'break_minutes',ep.break_minutes,
    'previous_block_review_allowed',ep.previous_block_review_allowed
  ) into v_exam
  from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled=true;
  if v_exam is null then raise exception 'exam_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('value',s.subject_key,'label',s.subject_key) order by s.sort_order),'[]'::jsonb)
  into v_subjects from public.exam_subjects s where s.exam_id=p_exam_id and s.enabled;

  select coalesce(jsonb_agg(x.topic order by x.topic),'[]'::jsonb)
  into v_topics from (
    select distinct q.topic from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('subject',x.subject,'topic',x.topic) order by x.subject,x.topic),'[]'::jsonb)
  into v_topics_by_subject from (
    select distinct q.subject,q.topic
    from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and nullif(trim(q.subject),'') is not null and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())
  ) x;

  select count(*) into v_count from public.questions q
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());

  return jsonb_build_object('exam',v_exam,'subjects',v_subjects,'topics',v_topics,'topics_by_subject',v_topics_by_subject,'available_questions',v_count);
end;
$$;
revoke all on function public.qbank_catalog(uuid) from public,anon;
grant execute on function public.qbank_catalog(uuid) to authenticated;

create or replace function public.get_study_session_state(p_session_id uuid,p_position integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_session record; v_item record; v_question jsonb; v_items jsonb;
  v_requested integer; v_current_block integer; v_session_block_count integer;
  v_active_elapsed numeric; v_break_elapsed numeric := 0; v_wall_elapsed numeric;
  v_on_break boolean := false; v_break_remaining integer := 0; v_key_terms text[];
begin
  select s.*,e.code exam_code,e.name exam_name,ep.total_duration_minutes,ep.max_items,
    ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.previous_block_review_allowed
  into v_session
  from public.study_sessions s join public.exams e on e.id=s.exam_id join public.exam_profiles ep on ep.exam_id=e.id
  where s.id=p_session_id and s.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;

  v_wall_elapsed:=greatest(0,extract(epoch from now()-v_session.started_at));
  if v_session.status='in_progress' and v_session.mode='exam' and v_session.time_limit_seconds is not null
     and v_wall_elapsed >= v_session.time_limit_seconds then raise exception 'session_expired'; end if;
  if v_session.break_started_at is not null then
    v_on_break:=true;
    v_break_elapsed:=greatest(0,extract(epoch from now()-v_session.break_started_at));
  end if;
  v_active_elapsed:=greatest(0,v_wall_elapsed-v_session.break_seconds_used-v_break_elapsed);
  v_session_block_count:=greatest(1,ceil(v_session.requested_count::numeric/nullif(v_session.block_max_items,0))::integer);
  v_current_block:=case when v_session.mode='exam' then least(v_session_block_count,floor(v_active_elapsed/(v_session.block_duration_minutes*60))::integer+1) else greatest(1,v_session.current_block) end;
  v_break_remaining:=greatest(0,v_session.break_seconds_allowed-v_session.break_seconds_used-floor(v_break_elapsed)::integer);

  v_requested:=case when coalesce(p_position,0)<=0 then v_session.current_position else greatest(1,least(p_position,v_session.requested_count)) end;
  select si.* into v_item from public.study_session_items si where si.session_id=p_session_id and si.position=v_requested;
  if not found then raise exception 'session_item_not_found'; end if;

  if not v_on_break and v_session.status='in_progress' and v_session.mode='exam' and not v_session.previous_block_review_allowed then
    if v_item.block_number < v_current_block then raise exception 'block_closed'; end if;
    if v_item.block_number > v_current_block then raise exception 'block_not_open'; end if;
  end if;

  select coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end)
  into v_key_terms from public.questions q where q.id=v_item.question_id;

  if v_on_break then
    v_question:=null;
  else
    select jsonb_build_object(
      'id',q.id,'content_code',q.content_code,'exam_id',q.exam_id,'stem',q.stem,'subject',q.subject,'topic',q.topic,
      'options',q.options,'difficulty',q.difficulty,
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

  select coalesce(jsonb_agg(jsonb_build_object('position',si.position,'block',si.block_number,'answered',si.is_correct is not null,
    'correct',si.is_correct,'marked',si.marked_for_review,'has_note',nullif(trim(coalesce(si.note,'')),'') is not null) order by si.position),'[]'::jsonb)
  into v_items from public.study_session_items si where si.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object('id',v_session.id,'exam_code',v_session.exam_code,'exam_name',v_session.exam_name,
      'mode',v_session.mode,'status',v_session.status,'requested_count',v_session.requested_count,
      'time_limit_seconds',v_session.time_limit_seconds,'started_at',v_session.started_at,'finished_at',v_session.finished_at,
      'current_position',case when p_position is null or p_position<=0 then v_session.current_position else v_requested end,
      'current_block',v_current_block,'block_count',v_session_block_count,'score_percent',v_session.score_percent,
      'correct_count',v_session.correct_count,'answered_count',v_session.answered_count,'total_duration_minutes',v_session.total_duration_minutes,
      'max_items',v_session.max_items,'block_duration_minutes',v_session.block_duration_minutes,'block_max_items',v_session.block_max_items,
      'previous_block_review_allowed',v_session.previous_block_review_allowed,'break_seconds_allowed',v_session.break_seconds_allowed,
      'break_seconds_used',v_session.break_seconds_used,'break_remaining_seconds',v_break_remaining,'break_started_at',v_session.break_started_at,
      'on_break',v_on_break,'active_block_position',v_current_block),
    'question',v_question,'items',v_items);
end;
$$;
revoke all on function public.get_study_session_state(uuid,integer) from public,anon;
grant execute on function public.get_study_session_state(uuid,integer) to authenticated;

create or replace function public.set_study_session_item_state(p_session_id uuid,p_position integer,p_marked boolean default null,p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s record; si record; v_current_block integer; v_elapsed numeric;
begin
  select ss.*,ep.previous_block_review_allowed,ep.block_duration_minutes,ep.block_max_items into s
  from public.study_sessions ss join public.exam_profiles ep on ep.exam_id=ss.exam_id
  where ss.id=p_session_id and ss.user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status<>'in_progress' then raise exception 'session_not_active'; end if;
  if s.break_started_at is not null then raise exception 'on_break'; end if;
  select * into si from public.study_session_items where session_id=p_session_id and position=p_position for update;
  if not found then raise exception 'session_item_not_found'; end if;
  if s.mode='exam' and not s.previous_block_review_allowed then
    v_elapsed:=greatest(0,extract(epoch from now()-s.started_at)-s.break_seconds_used);
    v_current_block:=least(ceil(s.requested_count::numeric/s.block_max_items)::integer,floor(v_elapsed/(s.block_duration_minutes*60))::integer+1);
    if si.block_number<v_current_block then raise exception 'block_closed'; end if;
    if si.block_number>v_current_block then raise exception 'block_not_open'; end if;
  end if;
  if p_marked is not null then
    update public.study_session_items set marked_for_review=p_marked where id=si.id;
    if p_marked then
      insert into public.question_bookmarks(user_id,question_id) values(auth.uid(),si.question_id) on conflict do nothing;
    else
      delete from public.question_bookmarks where user_id=auth.uid() and question_id=si.question_id;
    end if;
  end if;
  if p_note is not null then
    if char_length(p_note)>5000 then raise exception 'note_too_large'; end if;
    if nullif(trim(p_note),'') is null then
      delete from public.question_notes where user_id=auth.uid() and question_id=si.question_id;
      update public.study_session_items set note=null where id=si.id;
    else
      insert into public.question_notes(user_id,question_id,note) values(auth.uid(),si.question_id,trim(p_note))
      on conflict(user_id,question_id) do update set note=excluded.note,updated_at=now();
      update public.study_session_items set note=trim(p_note) where id=si.id;
    end if;
  end if;
end;
$$;
revoke all on function public.set_study_session_item_state(uuid,integer,boolean,text) from public,anon;
grant execute on function public.set_study_session_item_state(uuid,integer,boolean,text) to authenticated;

create or replace function public.study_session_result(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record; v_breakdown jsonb; v_items jsonb;
begin
  select ss.*,e.code exam_code,e.name exam_name into s
  from public.study_sessions ss join public.exams e on e.id=ss.exam_id
  where ss.id=p_session_id and ss.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  if s.status='in_progress' then raise exception 'session_not_complete'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('subject',x.subject,'total',x.total,'correct',x.correct,'incorrect',x.incorrect,
    'unanswered',x.unanswered,'accuracy',case when x.total=0 then 0 else round(100*x.correct::numeric/x.total,1) end) order by x.subject),'[]'::jsonb)
  into v_breakdown
  from (
    select q.subject,count(*) total,count(*) filter(where si.is_correct=true) correct,
      count(*) filter(where si.is_correct=false) incorrect,count(*) filter(where si.is_correct is null) unanswered
    from public.study_session_items si join public.questions q on q.id=si.question_id
    where si.session_id=p_session_id group by q.subject
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'position',si.position,'question_id',q.id,'content_code',q.content_code,'subject',q.subject,'topic',q.topic,'stem',q.stem,
    'options',q.options,'selected_answer',si.selected_answer,'is_correct',si.is_correct,'duration_ms',si.duration_ms,
    'marked',si.marked_for_review,'note',coalesce(si.note,''),'correct_answer',q.answer_key,'explanation',q.explanation,
    'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end),
    'key_learning_point',(select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1)
  ) order by si.position),'[]'::jsonb) into v_items
  from public.study_session_items si join public.questions q on q.id=si.question_id
  where si.session_id=p_session_id;

  return jsonb_build_object('session',jsonb_build_object('id',s.id,'exam_id',s.exam_id,'exam_code',s.exam_code,'exam_name',s.exam_name,
    'mode',s.mode,'status',s.status,'requested_count',s.requested_count,'started_at',s.started_at,'finished_at',s.finished_at,
    'score_percent',s.score_percent,'correct_count',s.correct_count,'answered_count',s.answered_count),
    'breakdown',v_breakdown,'items',v_items);
end;
$$;
revoke all on function public.study_session_result(uuid) from public,anon;
grant execute on function public.study_session_result(uuid) to authenticated;

-- Exam catalog is explicit rather than cross-seeded across every exam.
delete from public.exam_subjects;
insert into public.exam_subjects(exam_id,subject_key,sort_order)
select e.id,s.subject_key,s.sort_order from public.exams e join (values
  ('IMLE','Internal Medicine',10),('IMLE','Pediatrics',20),('IMLE','Surgery',30),('IMLE','Psychiatry',40),('IMLE','Obstetrics & Gynecology',50),
  ('USMLE_STEP1','Anatomy',10),('USMLE_STEP1','Physiology',20),('USMLE_STEP1','Biochemistry',30),('USMLE_STEP1','Pathology',40),('USMLE_STEP1','Pharmacology',50),
  ('USMLE_STEP1','Microbiology',60),('USMLE_STEP1','Behavioral Sciences',70),('USMLE_STEP1','Biostatistics & Epidemiology',80),('USMLE_STEP1','Ethics',90),
  ('USMLE_STEP2','Internal Medicine',10),('USMLE_STEP2','Pediatrics',20),('USMLE_STEP2','Surgery',30),('USMLE_STEP2','Psychiatry',40),('USMLE_STEP2','Obstetrics & Gynecology',50)
) as s(exam_code,subject_key,sort_order) on e.code=s.exam_code
on conflict (exam_id,subject_key) do update set sort_order=excluded.sort_order,enabled=true;

-- Canonical session start rules: validate exam subjects and distinguish unanswered-from-unseen questions.
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
  if exists (select 1 from unnest(coalesce(p_subjects,'{}'::text[])) requested_subject where not exists (select 1 from public.exam_subjects es where es.exam_id=v_exam.id and es.subject_key=requested_subject and es.enabled)) then raise exception 'invalid_subject'; end if;
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
      or (p_pool='unanswered' and exists(select 1 from public.study_session_items usi join public.study_sessions uss on uss.id=usi.session_id where uss.user_id=auth.uid() and usi.question_id=q.id and usi.is_correct is null))
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
        or (p_pool='unanswered' and exists(select 1 from public.study_session_items usi join public.study_sessions uss on uss.id=usi.session_id where uss.user_id=auth.uid() and usi.question_id=q.id and usi.is_correct is null))
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
          when p_pool='unanswered' and exists(select 1 from public.study_session_items usi join public.study_sessions uss on uss.id=usi.session_id where uss.user_id=auth.uid() and usi.question_id=q.id and usi.is_correct is null) then 4500
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
          or (p_pool='unanswered' and exists(select 1 from public.study_session_items usi join public.study_sessions uss on uss.id=usi.session_id where uss.user_id=auth.uid() and usi.question_id=q.id and usi.is_correct is null))
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

