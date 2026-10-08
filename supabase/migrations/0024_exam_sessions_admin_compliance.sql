-- MDvoro Phase 22: professional exam-session engine, learner review tools,
-- presence/revenue admin telemetry, account deletion and privacy operations.
-- All learner state changes remain server-authored and idempotent.

-- -----------------------------------------------------------------------------
-- Exam catalogue and official-timing profiles.
-- -----------------------------------------------------------------------------
create table if not exists public.exam_profiles (
  exam_id uuid primary key references public.exams(id) on delete cascade,
  total_duration_minutes integer not null check (total_duration_minutes between 1 and 1440),
  max_items integer not null check (max_items between 1 and 1000),
  block_duration_minutes integer not null check (block_duration_minutes between 1 and 180),
  block_max_items integer not null check (block_max_items between 1 and 200),
  block_count integer not null check (block_count between 1 and 64),
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  previous_block_review_allowed boolean not null default true,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.exams(code,name,description) values
  ('IMLE','Israel Medical Licensing Exam','Israeli medical licensing / internship-licensing examination profile.'),
  ('USMLE_STEP1','USMLE Step 1','Foundational medical sciences licensing examination profile.'),
  ('USMLE_STEP2','USMLE Step 2 CK','Clinical knowledge licensing examination profile.')
on conflict (code) do nothing;

insert into public.exam_profiles(exam_id,total_duration_minutes,max_items,block_duration_minutes,block_max_items,block_count,break_minutes,previous_block_review_allowed)
select e.id, 300, 210, 150, 105, 2, 0, true from public.exams e where e.code='IMLE'
on conflict (exam_id) do update set
  total_duration_minutes=excluded.total_duration_minutes,max_items=excluded.max_items,
  block_duration_minutes=excluded.block_duration_minutes,block_max_items=excluded.block_max_items,
  block_count=excluded.block_count,break_minutes=excluded.break_minutes,
  previous_block_review_allowed=excluded.previous_block_review_allowed,updated_at=now();

insert into public.exam_profiles(exam_id,total_duration_minutes,max_items,block_duration_minutes,block_max_items,block_count,break_minutes,previous_block_review_allowed)
select e.id, 480, 280, 30, 20, 14, 55, false from public.exams e where e.code='USMLE_STEP1'
on conflict (exam_id) do update set
  total_duration_minutes=excluded.total_duration_minutes,max_items=excluded.max_items,
  block_duration_minutes=excluded.block_duration_minutes,block_max_items=excluded.block_max_items,
  block_count=excluded.block_count,break_minutes=excluded.break_minutes,
  previous_block_review_allowed=excluded.previous_block_review_allowed,updated_at=now();

insert into public.exam_profiles(exam_id,total_duration_minutes,max_items,block_duration_minutes,block_max_items,block_count,break_minutes,previous_block_review_allowed)
select e.id, 540, 318, 30, 20, 16, 55, false from public.exams e where e.code='USMLE_STEP2'
on conflict (exam_id) do update set
  total_duration_minutes=excluded.total_duration_minutes,max_items=excluded.max_items,
  block_duration_minutes=excluded.block_duration_minutes,block_max_items=excluded.block_max_items,
  block_count=excluded.block_count,break_minutes=excluded.break_minutes,
  previous_block_review_allowed=excluded.previous_block_review_allowed,updated_at=now();

create table if not exists public.exam_subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  subject_key text not null check (char_length(subject_key) between 2 and 120),
  sort_order smallint not null default 0,
  enabled boolean not null default true,
  unique(exam_id,subject_key)
);

insert into public.exam_subjects(exam_id,subject_key,sort_order)
select e.id,s.subject_key,s.sort_order
from public.exams e cross join (values
  ('Internal Medicine',10),('Pediatrics',20),('Surgery',30),('Psychiatry',40),('Obstetrics & Gynecology',50),
  ('Anatomy',60),('Physiology',70),('Biochemistry',80),('Pathology',90),('Pharmacology',100),
  ('Microbiology',110),('Behavioral Sciences',120),('Biostatistics & Epidemiology',130),('Ethics',140)
) as s(subject_key,sort_order)
on conflict (exam_id,subject_key) do update set sort_order=excluded.sort_order;

alter table public.exams enable row level security;
alter table public.exam_profiles enable row level security;
alter table public.exam_subjects enable row level security;
revoke all on public.exam_profiles, public.exam_subjects from anon, authenticated;

create or replace function public.qbank_catalog(p_exam_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_exam jsonb; v_subjects jsonb; v_topics jsonb; v_count bigint;
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
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published' and nullif(trim(q.topic),'') is not null
      and (q.access_tier='free' or public.has_active_subscription())
  ) x;

  select count(*) into v_count from public.questions q
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());

  return jsonb_build_object('exam',v_exam,'subjects',v_subjects,'topics',v_topics,'available_questions',v_count);
end;
$$;
revoke all on function public.qbank_catalog(uuid) from public,anon;
grant execute on function public.qbank_catalog(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Question key terms: human-authored first, deterministic fallback second.
-- -----------------------------------------------------------------------------
alter table public.questions add column if not exists key_terms text[] not null default '{}';
alter table public.question_versions add column if not exists key_terms text[] not null default '{}';

create or replace function public.student_key_terms(p_question_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    nullif(q.key_terms,'{}'),
    case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end
  )
  from public.questions q
  where q.id=p_question_id;
$$;
revoke all on function public.student_key_terms(uuid) from public,anon,authenticated;

-- -----------------------------------------------------------------------------
-- Sessions and persistent review state.
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname='study_session_mode') then
    create type public.study_session_mode as enum ('practice','exam');
  end if;
  if not exists (select 1 from pg_type where typname='study_session_status') then
    create type public.study_session_status as enum ('in_progress','completed','expired','abandoned');
  end if;
end $$;

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete restrict,
  mode public.study_session_mode not null,
  status public.study_session_status not null default 'in_progress',
  requested_count integer not null check (requested_count between 1 and 300),
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds between 1 and 86400),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  current_position integer not null default 1 check (current_position between 1 and 300),
  current_block integer not null default 1 check (current_block between 1 and 64),
  score_percent numeric(5,2),
  correct_count integer not null default 0 check (correct_count >= 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.study_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  position integer not null check (position between 1 and 300),
  block_number integer not null check (block_number between 1 and 64),
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_answer text,
  is_correct boolean,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  confidence smallint check (confidence is null or confidence between 1 and 5),
  answered_at timestamptz,
  marked_for_review boolean not null default false,
  note text check (note is null or char_length(note) <= 5000),
  unique(session_id,position),
  unique(session_id,question_id)
);

alter table public.question_attempts
  add column if not exists session_id uuid references public.study_sessions(id) on delete set null,
  add column if not exists session_item_id uuid references public.study_session_items(id) on delete set null;

create unique index if not exists question_attempts_session_item_uidx
  on public.question_attempts(session_item_id) where session_item_id is not null;
create index if not exists study_sessions_user_created_idx on public.study_sessions(user_id,created_at desc);
create index if not exists study_sessions_user_status_idx on public.study_sessions(user_id,status,created_at desc);
create index if not exists study_session_items_session_position_idx on public.study_session_items(session_id,position);
create index if not exists study_session_items_question_idx on public.study_session_items(question_id);

create table if not exists public.question_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,question_id)
);

create table if not exists public.question_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 5000),
  updated_at timestamptz not null default now(),
  primary key(user_id,question_id)
);

alter table public.study_sessions enable row level security;
alter table public.study_session_items enable row level security;
alter table public.question_bookmarks enable row level security;
alter table public.question_notes enable row level security;
revoke all on public.study_sessions,public.study_session_items,public.question_bookmarks,public.question_notes from anon,authenticated;

create policy "users read own study sessions" on public.study_sessions for select to authenticated using (user_id=auth.uid());
create policy "users read own session items" on public.study_session_items for select to authenticated using (exists(select 1 from public.study_sessions s where s.id=session_id and s.user_id=auth.uid()));
create policy "users read own bookmarks" on public.question_bookmarks for select to authenticated using (user_id=auth.uid());
create policy "users read own notes" on public.question_notes for select to authenticated using (user_id=auth.uid());

create or replace function public.start_study_session(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare v_exam record; v_session uuid; v_total integer; v_time integer;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_question_count is null or p_question_count<1 or p_question_count>300 then raise exception 'invalid_question_count'; end if;
  select e.id,e.code,ep.* into v_exam from public.exams e join public.exam_profiles ep on ep.exam_id=e.id where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_mode='exam' and p_question_count>v_exam.max_items then raise exception 'exam_question_limit'; end if;

  v_time := case when p_mode='practice' then null else least(
    v_exam.total_duration_minutes*60,
    greatest(v_exam.block_duration_minutes*60, ceil(p_question_count::numeric/v_exam.block_max_items)::integer*v_exam.block_duration_minutes*60)
  ) end;

  select count(*) into v_total
  from public.questions q
  where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics));
  if v_total<p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,configuration)
  values(auth.uid(),p_exam_id,p_mode,p_question_count,v_time,
    jsonb_build_object('subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),'exam_code',v_exam.code)
  ) returning id into v_session;

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by random())::int,
      ceil(row_number() over(order by random())::numeric/v_exam.block_max_items)::int,q.id
    from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
      and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    order by random() limit p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    select v_session,row_number() over(order by adaptive_score desc,random())::int,
      ceil(row_number() over(order by adaptive_score desc,random())::numeric/v_exam.block_max_items)::int,q.id
    from (
      select q.*,
        case when coalesce(qs.attempts,0)=0 then 1000
             else (100 - round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4
        end
        + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end as adaptive_score
      from public.questions q
      left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    ) q
    order by adaptive_score desc,random() limit p_question_count;
  end if;

  perform public.record_learning_event(auth.uid(),'study_plan_changed','study_session',v_session,v_session,jsonb_build_object('action','session_started','exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count));
  return query select v_session,v_time,v_exam.block_count,v_exam.block_duration_minutes,v_exam.block_max_items;
end;
$$;
revoke all on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode) from public,anon;
grant execute on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode) to authenticated;

create or replace function public.get_study_session_state(p_session_id uuid,p_position integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_session record; v_item record; v_question jsonb; v_items jsonb;
begin
  select s.*,e.code exam_code,e.name exam_name,ep.total_duration_minutes,ep.max_items,ep.block_duration_minutes,ep.block_max_items,ep.previous_block_review_allowed
  into v_session
  from public.study_sessions s join public.exams e on e.id=s.exam_id join public.exam_profiles ep on ep.exam_id=e.id
  where s.id=p_session_id and s.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;

  select si.* into v_item from public.study_session_items si where si.session_id=p_session_id and si.position=greatest(1,least(p_position,v_session.requested_count));
  if not found then raise exception 'session_item_not_found'; end if;

  select jsonb_build_object(
    'id',q.id,'content_code',q.content_code,'exam_id',q.exam_id,'stem',q.stem,'subject',q.subject,'topic',q.topic,
    'options',q.options,'difficulty',q.difficulty,'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position)
      from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb),
    'answered',si.is_correct is not null,'selected_answer',si.selected_answer,'is_correct',si.is_correct,
    'correct_answer',case when si.is_correct is not null then q.answer_key else null end,
    'explanation',case when si.is_correct is not null then q.explanation else null end,
    'key_learning_point',case when si.is_correct is not null then (select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1) else null end
  ) into v_question
  from public.questions q join public.study_session_items si on si.question_id=q.id
  where si.id=v_item.id and q.is_published and q.workflow_status='published';

  select coalesce(jsonb_agg(jsonb_build_object(
    'position',si.position,'block',si.block_number,'answered',si.is_correct is not null,'correct',si.is_correct,'marked',si.marked_for_review,
    'has_note',nullif(trim(coalesce(si.note,'')),'') is not null
  ) order by si.position),'[]'::jsonb) into v_items
  from public.study_session_items si where si.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object('id',v_session.id,'exam_code',v_session.exam_code,'exam_name',v_session.exam_name,'mode',v_session.mode,
      'status',v_session.status,'requested_count',v_session.requested_count,'time_limit_seconds',v_session.time_limit_seconds,
      'started_at',v_session.started_at,'finished_at',v_session.finished_at,'current_position',v_session.current_position,'current_block',v_session.current_block,
      'score_percent',v_session.score_percent,'correct_count',v_session.correct_count,'answered_count',v_session.answered_count,
      'total_duration_minutes',v_session.total_duration_minutes,'max_items',v_session.max_items,'block_duration_minutes',v_session.block_duration_minutes,
      'block_max_items',v_session.block_max_items,'previous_block_review_allowed',v_session.previous_block_review_allowed),
    'question',v_question,'items',v_items
  );
end;
$$;
revoke all on function public.get_study_session_state(uuid,integer) from public,anon;
grant execute on function public.get_study_session_state(uuid,integer) to authenticated;

create or replace function public.submit_study_session_answer(
  p_session_id uuid,p_position integer,p_selected_answer text,p_duration_ms integer default null,p_confidence smallint default null,p_client_mutation_id uuid default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare s record; si record; q record; v_correct boolean; v_attempt uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select ss.*,ep.previous_block_review_allowed into s
  from public.study_sessions ss join public.exam_profiles ep on ep.exam_id=ss.exam_id
  where ss.id=p_session_id and ss.user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status<>'in_progress' then raise exception 'session_not_active'; end if;
  if s.mode='exam' and s.time_limit_seconds is not null and now()>s.started_at + make_interval(secs=>s.time_limit_seconds) then
    update public.study_sessions set status='expired',finished_at=now() where id=p_session_id;
    raise exception 'session_expired';
  end if;
  select * into si from public.study_session_items where session_id=p_session_id and position=p_position for update;
  if not found then raise exception 'session_item_not_found'; end if;
  if si.is_correct is not null then
    select qa.id into v_attempt from public.question_attempts qa where qa.session_item_id=si.id order by qa.created_at desc limit 1;
    select q.answer_key=q.selected_answer into v_correct from public.question_attempts q where q.id=v_attempt;
    return jsonb_build_object('already_answered',true,'is_correct',si.is_correct,'selected_answer',si.selected_answer);
  end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence<1 or p_confidence>5) then raise exception 'invalid_confidence'; end if;
  select * into q from public.questions where id=si.question_id and is_published and workflow_status='published';
  if not found then raise exception 'question_not_available'; end if;
  if q.access_tier='premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=p_selected_answer) then raise exception 'invalid_answer_option'; end if;
  v_correct := p_selected_answer=q.answer_key;

  insert into public.question_attempts(user_id,question_id,session_id,session_item_id,selected_answer,is_correct,duration_ms,confidence,client_mutation_id)
  values(auth.uid(),q.id,p_session_id,si.id,p_selected_answer,v_correct,p_duration_ms,p_confidence,p_client_mutation_id)
  on conflict (session_item_id) do nothing
  returning id into v_attempt;

  if v_attempt is null then
    select qa.id into v_attempt from public.question_attempts qa where qa.session_item_id=si.id;
    select qa.is_correct into v_correct from public.question_attempts qa where qa.id=v_attempt;
  end if;

  update public.study_session_items set selected_answer=p_selected_answer,is_correct=v_correct,duration_ms=p_duration_ms,confidence=p_confidence,answered_at=coalesce(answered_at,now()) where id=si.id;
  update public.study_sessions set answered_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct is not null),
    correct_count=(select count(*) from public.study_session_items where session_id=p_session_id and is_correct=true),
    current_position=greatest(current_position,least(p_position,requested_count)),
    current_block=(select block_number from public.study_session_items where session_id=p_session_id and position=greatest(current_position,least(p_position,requested_count)))
  where id=p_session_id;

  v_result := jsonb_build_object(
    'already_answered',false,'is_correct',v_correct,'correct_answer',q.answer_key,
    'explanation',q.explanation,'key_learning_point',(select v.key_learning_point from public.question_versions v where v.question_id=q.id order by v.version_no desc limit 1),
    'key_terms',coalesce(nullif(q.key_terms,'{}'),case when nullif(trim(q.topic),'') is not null then array[left(trim(q.topic),80)]::text[] else array[]::text[] end)
  );
  return v_result;
exception when unique_violation then
  return jsonb_build_object('already_answered',true);
end;
$$;
revoke all on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) from public,anon;
grant execute on function public.submit_study_session_answer(uuid,integer,text,integer,smallint,uuid) to authenticated;

create or replace function public.set_study_session_item_state(p_session_id uuid,p_position integer,p_marked boolean default null,p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_item_id uuid; v_question_id uuid;
begin
  select id,question_id into v_item_id,v_question_id from public.study_session_items si join public.study_sessions ss on ss.id=si.session_id where si.session_id=p_session_id and si.position=p_position and ss.user_id=auth.uid();
  if not found then raise exception 'session_item_not_found'; end if;
  if p_marked is not null then update public.study_session_items set marked_for_review=p_marked where id=v_item_id;
    if p_marked then insert into public.question_bookmarks(user_id,question_id) values(auth.uid(),v_question_id) on conflict do nothing;
    else delete from public.question_bookmarks where user_id=auth.uid() and question_id=v_question_id;
    end if;
  end if;
  if p_note is not null then
    if char_length(p_note)>5000 then raise exception 'note_too_large'; end if;
    if nullif(trim(p_note),'') is null then delete from public.question_notes where user_id=auth.uid() and question_id=v_question_id;
      update public.study_session_items set note=null where id=v_item_id;
    else
      insert into public.question_notes(user_id,question_id,note) values(auth.uid(),v_question_id,trim(p_note)) on conflict(user_id,question_id) do update set note=excluded.note,updated_at=now();
      update public.study_session_items set note=trim(p_note) where id=v_item_id;
    end if;
  end if;
end;
$$;
revoke all on function public.set_study_session_item_state(uuid,integer,boolean,text) from public,anon;
grant execute on function public.set_study_session_item_state(uuid,integer,boolean,text) to authenticated;

create or replace function public.finish_study_session(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare s record; v_total integer; v_answered integer; v_correct integer; v_score numeric;
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status='in_progress' then
    select count(*),count(*) filter(where is_correct is not null),count(*) filter(where is_correct=true) into v_total,v_answered,v_correct from public.study_session_items where session_id=p_session_id;
    v_score:=case when v_total=0 then 0 else round((v_correct::numeric/v_total::numeric)*100,2) end;
    update public.study_sessions set status='completed',finished_at=now(),score_percent=v_score,correct_count=v_correct,answered_count=v_answered where id=p_session_id;
  else v_total:=s.requested_count; v_answered:=s.answered_count; v_correct:=s.correct_count; v_score:=s.score_percent;
  end if;
  return jsonb_build_object('session_id',p_session_id,'status','completed','total_questions',v_total,'answered_count',v_answered,'correct_count',v_correct,'unanswered_count',v_total-v_answered,'score_percent',v_score);
end;
$$;
revoke all on function public.finish_study_session(uuid) from public,anon;
grant execute on function public.finish_study_session(uuid) to authenticated;

create or replace function public.study_session_result(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s record; v_breakdown jsonb; v_items jsonb;
begin
  select ss.*,e.code exam_code,e.name exam_name into s from public.study_sessions ss join public.exams e on e.id=ss.exam_id where ss.id=p_session_id and ss.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('subject',x.subject,'total',x.total,'correct',x.correct,'incorrect',x.incorrect,'unanswered',x.unanswered,'accuracy',case when x.total=0 then 0 else round(100*x.correct::numeric/x.total,1) end) order by x.subject),'[]'::jsonb)
    into v_breakdown
  from (select q.subject,count(*) total,count(*) filter(where si.is_correct=true) correct,count(*) filter(where si.is_correct=false) incorrect,count(*) filter(where si.is_correct is null) unanswered
        from public.study_session_items si join public.questions q on q.id=si.question_id where si.session_id=p_session_id group by q.subject) x;
  select coalesce(jsonb_agg(jsonb_build_object('position',si.position,'question_id',q.id,'content_code',q.content_code,'subject',q.subject,'topic',q.topic,'selected_answer',si.selected_answer,'is_correct',si.is_correct,'duration_ms',si.duration_ms,'marked',si.marked_for_review,'note',coalesce(si.note,''),'correct_answer',case when si.is_correct is not null then q.answer_key else null end,'explanation',case when si.is_correct is not null then q.explanation else null end) order by si.position),'[]'::jsonb)
    into v_items from public.study_session_items si join public.questions q on q.id=si.question_id where si.session_id=p_session_id;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'exam_code',s.exam_code,'exam_name',s.exam_name,'mode',s.mode,'status',s.status,'requested_count',s.requested_count,'started_at',s.started_at,'finished_at',s.finished_at,'score_percent',s.score_percent,'correct_count',s.correct_count,'answered_count',s.answered_count), 'breakdown',v_breakdown,'items',v_items);
end;
$$;
revoke all on function public.study_session_result(uuid) from public,anon;
grant execute on function public.study_session_result(uuid) to authenticated;

create or replace function public.list_study_sessions(p_limit integer default 50)
returns table(id uuid,exam_code text,exam_name text,mode text,status text,requested_count integer,answered_count integer,correct_count integer,score_percent numeric,started_at timestamptz,finished_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id,e.code,e.name,s.mode::text,s.status::text,s.requested_count,s.answered_count,s.correct_count,s.score_percent,s.started_at,s.finished_at
  from public.study_sessions s join public.exams e on e.id=s.exam_id where s.user_id=auth.uid() order by s.created_at desc limit least(greatest(coalesce(p_limit,50),1),100);
$$;
revoke all on function public.list_study_sessions(integer) from public,anon;
grant execute on function public.list_study_sessions(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Presence + revenue operations.
-- -----------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  last_seen_at timestamptz not null default now()
);
create index if not exists user_presence_last_seen_idx on public.user_presence(last_seen_at desc);
alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon,authenticated;

create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (char_length(provider) between 2 and 60),
  provider_transaction_id text unique,
  kind text not null check (kind in ('subscription','one_time','refund','chargeback','adjustment')),
  status text not null check (status in ('pending','paid','failed','refunded','voided')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null default 'ILS',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists billing_transactions_occurred_idx on public.billing_transactions(occurred_at desc,status);
create index if not exists billing_transactions_user_idx on public.billing_transactions(user_id,occurred_at desc);
alter table public.billing_transactions enable row level security;
revoke all on public.billing_transactions from anon,authenticated;

create or replace function public.touch_presence(p_session_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  insert into public.user_presence(user_id,session_id,last_seen_at) values(auth.uid(),p_session_id,now())
  on conflict(user_id) do update set session_id=excluded.session_id,last_seen_at=now();
end;
$$;
revoke all on function public.touch_presence(uuid) from public,anon;
grant execute on function public.touch_presence(uuid) to authenticated;

create or replace function public.admin_platform_metrics()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when exists(select 1 from public.profiles where id=auth.uid() and role='admin') then jsonb_build_object(
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
language sql stable security definer set search_path = ''
as $$
  select b.occurred_at::date,b.provider,b.kind,b.status,b.currency,b.amount_minor,b.id
  from public.billing_transactions b
  where exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
    and b.occurred_at >= date_trunc('month',p_month::timestamptz)
    and b.occurred_at < date_trunc('month',p_month::timestamptz)+interval '1 month'
  order by b.occurred_at asc;
$$;
revoke all on function public.admin_monthly_revenue(date) from public,anon;
grant execute on function public.admin_monthly_revenue(date) to authenticated;

-- -----------------------------------------------------------------------------
-- Account deletion: explicit confirmation + server-side destructive operation.
-- -----------------------------------------------------------------------------
create or replace function public.delete_my_account(p_confirmation text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if upper(trim(coalesce(p_confirmation,''))) <> 'DELETE' then raise exception 'confirmation_required'; end if;
  delete from auth.users where id=auth.uid();
  if found then return; end if;
  raise exception 'account_deletion_failed';
end;
$$;
revoke all on function public.delete_my_account(text) from public,anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Tighten the public surface of all new tables/functions.
-- -----------------------------------------------------------------------------
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef=true and p.prokind='f'
  loop
    execute format('alter function %s set search_path = ''''',fn.signature);
  end loop;
end;
$$;
