-- Phase 30: reconstruction labeling + remove per-question rights metadata gate.
-- Historical questions may be labeled as reconstructions without forcing editorial rights forms.
-- This does NOT declare third-party material public-domain or waive any applicable rights.

alter table public.questions
  add column if not exists is_reconstruction boolean not null default false,
  add column if not exists reconstruction_year smallint,
  add column if not exists reconstruction_label text;

alter table public.questions
  drop constraint if exists questions_reconstruction_year_check;
alter table public.questions
  add constraint questions_reconstruction_year_check
  check (reconstruction_year is null or reconstruction_year between 1900 and 2100);

create index if not exists questions_reconstruction_idx
  on public.questions(is_reconstruction, reconstruction_year, exam_id);

create or replace function public.admin_set_question_reconstruction(
  p_question_id uuid,
  p_is_reconstruction boolean,
  p_reconstruction_year smallint default null,
  p_reconstruction_label text default null
)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.questions where id=p_question_id) then raise exception 'question_not_found'; end if;
  if p_is_reconstruction and (p_reconstruction_year is null or p_reconstruction_year < 1900 or p_reconstruction_year > 2100) then
    raise exception 'reconstruction_year_required';
  end if;
  update public.questions
    set is_reconstruction=p_is_reconstruction,
        reconstruction_year=case when p_is_reconstruction then p_reconstruction_year else null end,
        reconstruction_label=case
          when p_is_reconstruction then coalesce(nullif(trim(p_reconstruction_label),''), 'שחזור')
          else null
        end,
        updated_at=now()
  where id=p_question_id;
end;
$$;
revoke all on function public.admin_set_question_reconstruction(uuid,boolean,smallint,text) from public;
grant execute on function public.admin_set_question_reconstruction(uuid,boolean,smallint,text) to authenticated;

-- Publishing no longer depends on the optional question_rights table.
-- Keep the table/functions from Phase 29 for migration compatibility, but they are no longer a publication gate.
create or replace function public.review_question(p_question_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare v_version_id uuid; v_creator uuid;
begin
  if not public.can_review_content() then raise exception 'forbidden'; end if;
  if p_decision not in ('approved','changes_requested','rejected') then raise exception 'invalid_decision'; end if;
  select id,created_by into v_version_id,v_creator from public.question_versions where question_id=p_question_id order by version_no desc limit 1;
  if v_version_id is null then raise exception 'version_not_found'; end if;
  if v_creator=auth.uid() then raise exception 'self_review_forbidden'; end if;
  if not exists(select 1 from public.questions where id=p_question_id and workflow_status='in_review') then raise exception 'question_not_in_review'; end if;
  insert into public.content_reviews(question_id,version_id,reviewer_id,decision,note) values(p_question_id,v_version_id,auth.uid(),p_decision,p_note);
  if p_decision='approved' then
    update public.questions q set stem=v.stem,subject=v.subject,topic=v.topic,options=v.options,answer_key=v.answer_key,explanation=v.explanation,difficulty=v.difficulty,is_published=true,workflow_status='published'
    from public.question_versions v where q.id=p_question_id and v.id=v_version_id;
  elsif p_decision='changes_requested' then update public.questions set is_published=false,workflow_status='draft' where id=p_question_id;
  else update public.questions set is_published=false,workflow_status='archived' where id=p_question_id;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'reviewed',jsonb_build_object('decision',p_decision,'version_id',v_version_id));
end;
$$;
revoke all on function public.review_question(uuid,text,text) from public;
grant execute on function public.review_question(uuid,text,text) to authenticated;

-- Expose only the non-sensitive reconstruction label through the existing editorial read contract.
drop function if exists public.admin_get_question(uuid);
create function public.admin_get_question(p_question_id uuid)
returns table(id uuid,content_code text,exam_id uuid,stem text,subject text,topic text,options jsonb,answer_key text,explanation text,key_learning_point text,difficulty smallint,workflow_status text,is_published boolean,media_ids uuid[],version_no integer,is_reconstruction boolean,reconstruction_year smallint,reconstruction_label text)
language sql stable security definer set search_path=public as $$
  select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.answer_key,q.explanation,v.key_learning_point,q.difficulty,q.workflow_status,q.is_published,
    coalesce(array_agg(qm.media_id order by qm.position) filter(where qm.media_id is not null),'{}'),v.version_no,
    q.is_reconstruction,q.reconstruction_year,q.reconstruction_label
  from public.questions q
  left join lateral(select qv.key_learning_point,qv.version_no from public.question_versions qv where qv.question_id=q.id order by qv.version_no desc limit 1)v on true
  left join public.question_media qm on qm.question_id=q.id
  where (public.can_edit_content() or public.can_review_content()) and q.id=p_question_id
  group by q.id,v.key_learning_point,v.version_no;
$$;
revoke all on function public.admin_get_question(uuid) from public;
grant execute on function public.admin_get_question(uuid) to authenticated;

drop view if exists public.question_public;
create view public.question_public as
select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.difficulty,
  q.is_reconstruction,q.reconstruction_year,q.reconstruction_label,
  coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'title',m.title,'alt_text',m.alt_text,'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position) filter(where m.id is not null),'[]'::jsonb) as media
from public.questions q left join public.question_media qm on qm.question_id=q.id left join public.media_assets m on m.id=qm.media_id
where q.is_published=true and (q.access_tier='free' or public.has_active_subscription())
group by q.id;
grant select on public.question_public to authenticated;

-- Add the reconstruction badge to the student session question payload.
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

  select public.student_key_terms(v_item.question_id) into v_key_terms from public.questions q where q.id=v_item.question_id;

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
  if coalesce((select q.is_reconstruction from public.questions q where q.id=v_item.question_id),false) then
    v_question := jsonb_set(v_question,'{reconstruction}',jsonb_build_object(
      'is_reconstruction',true,
      'year',(select q.reconstruction_year from public.questions q where q.id=v_item.question_id),
      'label',coalesce((select q.reconstruction_label from public.questions q where q.id=v_item.question_id),'שחזור')
    ),true);
  end if;

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
revoke all on function public.get_study_session_state(uuid,integer) from public,anon;
grant execute on function public.get_study_session_state(uuid,integer) to authenticated;
