-- MDvoro Phase 20: enterprise integrity, idempotency, event ledger, and future-safe grants.
-- Goals:
--   1. Prevent new public functions/tables from becoming Data API-readable by default.
--   2. Make answer/review mutations idempotent under retries and race conditions.
--   3. Create an immutable learner-event ledger fed by authoritative DB triggers.
--   4. Never expose private storage paths in student question delivery RPCs.

-- Future objects must be explicitly granted to authenticated callers.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;

-- Idempotency keys are generated client-side and are never trusted for ownership.
alter table public.question_attempts
  add column if not exists client_mutation_id uuid;

alter table public.flashcard_reviews
  add column if not exists client_mutation_id uuid;

create unique index if not exists question_attempts_user_mutation_uidx
  on public.question_attempts(user_id, client_mutation_id)
  where client_mutation_id is not null;

create unique index if not exists flashcard_reviews_user_mutation_uidx
  on public.flashcard_reviews(user_id, client_mutation_id)
  where client_mutation_id is not null;

create index if not exists question_attempts_user_created_id_idx
  on public.question_attempts(user_id, created_at desc, id desc);

create index if not exists flashcard_reviews_user_reviewed_id_idx
  on public.flashcard_reviews(user_id, reviewed_at desc, id desc);

-- Immutable, server-authored learning event stream. Direct student writes are forbidden.
create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'question_answered','flashcard_reviewed','study_plan_changed','exam_selected'
  )),
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  source_id uuid,
  created_at timestamptz not null default now(),
  constraint learning_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists learning_events_user_occurred_idx
  on public.learning_events(user_id, occurred_at desc, id desc);
create index if not exists learning_events_user_type_occurred_idx
  on public.learning_events(user_id, event_type, occurred_at desc);

alter table public.learning_events enable row level security;
revoke all on public.learning_events from anon, authenticated;
create policy "users read own learning events"
  on public.learning_events for select to authenticated
  using (user_id = auth.uid());

-- One canonical helper for trigger-authored events.
create or replace function public.record_learning_event(
  p_user_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_source_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then raise exception 'learning_event_user_required'; end if;
  if p_event_type not in ('question_answered','flashcard_reviewed','study_plan_changed','exam_selected') then
    raise exception 'learning_event_type_invalid';
  end if;
  insert into public.learning_events(user_id,event_type,entity_type,entity_id,payload,source_id)
  values(p_user_id,p_event_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),p_source_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_learning_event(uuid,text,text,uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.trg_question_attempt_learning_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.record_learning_event(
    new.user_id,
    'question_answered',
    'question',
    new.question_id,
    new.id,
    jsonb_build_object(
      'is_correct', new.is_correct,
      'duration_ms', new.duration_ms,
      'confidence', new.confidence,
      'client_mutation_id', new.client_mutation_id
    )
  );
  return new;
end;
$$;
revoke all on function public.trg_question_attempt_learning_event() from public, anon, authenticated;

drop trigger if exists question_attempt_learning_event on public.question_attempts;
create trigger question_attempt_learning_event
after insert on public.question_attempts
for each row execute function public.trg_question_attempt_learning_event();

create or replace function public.trg_flashcard_review_learning_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.record_learning_event(
    new.user_id,
    'flashcard_reviewed',
    'flashcard',
    new.flashcard_id,
    new.id,
    jsonb_build_object(
      'rating', new.rating,
      'duration_ms', new.duration_ms,
      'client_mutation_id', new.client_mutation_id
    )
  );
  return new;
end;
$$;
revoke all on function public.trg_flashcard_review_learning_event() from public, anon, authenticated;

drop trigger if exists flashcard_review_learning_event on public.flashcard_reviews;
create trigger flashcard_review_learning_event
after insert on public.flashcard_reviews
for each row execute function public.trg_flashcard_review_learning_event();

create or replace function public.trg_study_plan_learning_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.record_learning_event(
    new.user_id,
    'study_plan_changed',
    'study_plan',
    new.id,
    new.id,
    jsonb_build_object(
      'exam_id', new.exam_id,
      'target_date', new.target_date,
      'daily_minutes', new.daily_minutes
    )
  );
  return new;
end;
$$;
revoke all on function public.trg_study_plan_learning_event() from public, anon, authenticated;

drop trigger if exists study_plan_learning_event on public.study_plans;
create trigger study_plan_learning_event
after insert or update on public.study_plans
for each row execute function public.trg_study_plan_learning_event();

create or replace function public.trg_profile_exam_learning_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.active_exam_id is distinct from old.active_exam_id then
    perform public.record_learning_event(
      new.id,
      'exam_selected',
      'exam',
      new.active_exam_id,
      new.id,
      jsonb_build_object('previous_exam_id', old.active_exam_id)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.trg_profile_exam_learning_event() from public, anon, authenticated;

drop trigger if exists profile_exam_learning_event on public.profiles;
create trigger profile_exam_learning_event
after update of active_exam_id on public.profiles
for each row execute function public.trg_profile_exam_learning_event();

-- Replace question delivery with student-safe media projection.
create or replace function public.get_next_question(
  p_exam_id uuid default null,
  p_subject text default null,
  p_topic text default null
)
returns table(
  id uuid, content_code text, exam_id uuid, stem text, subject text, topic text,
  options jsonb, difficulty smallint, media jsonb
)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  with weak_nodes as (
    select qt.taxonomy_id,
      avg(case when a.is_correct then 1.0 else 0.0 end) as accuracy
    from public.question_taxonomy qt
    join public.question_attempts a
      on a.question_id = qt.question_id and a.user_id = auth.uid()
    group by qt.taxonomy_id
    having count(*) >= 2
  ),
  candidates as (
    select q.id, q.content_code, q.exam_id, q.stem, q.subject, q.topic,
      q.options, q.difficulty, q.updated_at,
      exists(
        select 1 from public.question_attempts a
        where a.user_id = auth.uid() and a.question_id = q.id
      ) as seen,
      coalesce((
        select avg(case when a.is_correct then 1 else 0 end)
        from public.question_attempts a
        where a.user_id = auth.uid() and a.question_id = q.id
      ),0.5) as accuracy,
      coalesce((
        select max(a.created_at)
        from public.question_attempts a
        where a.user_id = auth.uid() and a.question_id = q.id
      ),timestamp 'epoch') as last_seen,
      coalesce((
        select min(w.accuracy)
        from public.question_taxonomy qt
        join weak_nodes w on w.taxonomy_id = qt.taxonomy_id
        where qt.question_id = q.id
      ),1.0) as weakest_taxonomy_accuracy
    from public.questions q
    where q.is_published = true
      and q.workflow_status = 'published'
      and (q.access_tier = 'free' or public.has_active_subscription())
      and (p_exam_id is null or q.exam_id = p_exam_id)
      and (p_subject is null or p_subject = '' or q.subject = p_subject)
      and (p_topic is null or p_topic = '' or q.topic = p_topic)
  ), picked as (
    select * from candidates
    order by seen asc, weakest_taxonomy_accuracy asc, accuracy asc,
      last_seen asc, difficulty desc, updated_at desc
    limit 1
  )
  select p.id, p.content_code, p.exam_id, p.stem, p.subject, p.topic,
    p.options, p.difficulty,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,
        'kind',m.kind,
        'student_alt_text',coalesce(m.student_alt_text,'Medical image'),
        'external_url',m.external_url,
        'caption',qm.caption,
        'position',qm.position
      ) order by qm.position)
      from public.question_media qm
      join public.media_assets m on m.id = qm.media_id
      where qm.question_id = p.id
        and (m.external_url is not null or m.storage_path is not null)
    ),'[]'::jsonb)
  from picked p;
end;
$$;

create or replace function public.get_question_for_learning(p_question_id uuid)
returns table(
  id uuid, content_code text, exam_id uuid, stem text, subject text, topic text,
  options jsonb, difficulty smallint, media jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.difficulty,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,
        'kind',m.kind,
        'student_alt_text',coalesce(m.student_alt_text,'Medical image'),
        'external_url',m.external_url,
        'caption',qm.caption,
        'position',qm.position
      ) order by qm.position)
      from public.question_media qm
      join public.media_assets m on m.id = qm.media_id
      where qm.question_id = q.id
    ),'[]'::jsonb)
  from public.questions q
  where q.id=p_question_id
    and q.is_published=true
    and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());
end;
$$;

revoke all on function public.get_next_question(uuid,text,text) from public;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;
revoke all on function public.get_question_for_learning(uuid) from public;
grant execute on function public.get_question_for_learning(uuid) to authenticated;

-- Explicitly re-assert empty search_path on the new security-definer functions.
alter function public.get_next_question(uuid,text,text) set search_path = '';
alter function public.get_question_for_learning(uuid) set search_path = '';
alter function public.record_learning_event(uuid,text,text,uuid,uuid,jsonb) set search_path = '';
alter function public.trg_question_attempt_learning_event() set search_path = '';
alter function public.trg_flashcard_review_learning_event() set search_path = '';
alter function public.trg_study_plan_learning_event() set search_path = '';
alter function public.trg_profile_exam_learning_event() set search_path = '';
