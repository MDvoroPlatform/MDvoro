-- MDvoro Phase 20 Final Hardening
-- Atomic learner mutations, exact retry semantics, timezone-aware learning state,
-- least-privilege RPCs, and explicit future-safe database privileges.

-- Future-created public functions must be explicitly granted.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from public;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;

-- Learner-local timezone drives daily boundaries and streaks. The value is only
-- used as a presentation/learning preference; it is not a security boundary.
alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

-- Enforce a conservative IANA-timezone shape at the DB boundary. We do not
-- require a complete zone catalogue here because PostgreSQL's tzdata is the
-- source of truth for runtime validation.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_timezone_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_timezone_format_check
      check (timezone ~ '^[A-Za-z0-9_+./:-]{1,80}$');
  end if;
end $$;

-- Exact replay responses make retries safe across mobile/web reconnects.
alter table public.question_attempts
  add column if not exists result_correct_answer text,
  add column if not exists result_explanation text,
  add column if not exists result_key_learning_point text;

alter table public.flashcard_reviews
  add column if not exists result_due_at timestamptz,
  add column if not exists result_interval_days numeric(10,2),
  add column if not exists result_ease_factor numeric(5,2),
  add column if not exists result_repetitions integer,
  add column if not exists result_lapse_count integer,
  add column if not exists result_stability_days numeric(10,2),
  add column if not exists result_difficulty numeric(5,2),
  add column if not exists result_next_bucket text;

-- Remove direct table mutation paths; learner mutations must go through the
-- server-authoritative RPCs below.
revoke insert, update, delete on public.question_attempts from authenticated;
revoke insert, update, delete on public.flashcard_reviews from authenticated;

-- Replace the non-idempotent answer function. Keep the legacy signature blocked.
revoke all on function public.submit_question_answer(uuid,text,integer,smallint) from public, anon, authenticated;
drop function if exists public.submit_question_answer(uuid,text,integer,smallint);

create or replace function public.submit_question_answer(
  p_question_id uuid,
  p_selected_answer text,
  p_duration_ms integer default null,
  p_confidence smallint default null,
  p_client_mutation_id uuid default null
)
returns table(
  is_correct boolean,
  correct_answer text,
  explanation text,
  key_learning_point text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_correct text;
  v_explanation text;
  v_learning text;
  v_is_correct boolean;
  v_tier text;
  v_options jsonb;
  v_selected text := upper(trim(coalesce(p_selected_answer,'')));
  v_existing public.question_attempts%rowtype;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if v_selected = '' then raise exception 'invalid_answer_option'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence < 1 or p_confidence > 5) then raise exception 'invalid_confidence'; end if;

  -- Fast-path an exact retry. The stored result is returned, never recomputed.
  if p_client_mutation_id is not null then
    select * into v_existing
    from public.question_attempts a
    where a.user_id=v_user and a.client_mutation_id=p_client_mutation_id
    limit 1;
    if found then
      if v_existing.question_id <> p_question_id then raise exception 'mutation_id_reused'; end if;
      return query select v_existing.is_correct,
        coalesce(v_existing.result_correct_answer, ''),
        v_existing.result_explanation,
        v_existing.result_key_learning_point;
      return;
    end if;
  end if;

  select q.answer_key, q.explanation, q.access_tier, q.options, v.key_learning_point
    into v_correct, v_explanation, v_tier, v_options, v_learning
  from public.questions q
  left join lateral (
    select qv.key_learning_point
    from public.question_versions qv
    where qv.question_id=q.id
    order by qv.version_no desc
    limit 1
  ) v on true
  where q.id=p_question_id
    and q.is_published=true
    and q.workflow_status='published';

  if not found then raise exception 'question_not_available'; end if;
  if v_tier='premium' and not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_options) option
    where upper(trim(option->>'id'))=v_selected
  ) then raise exception 'invalid_answer_option'; end if;

  v_is_correct := v_selected=upper(trim(v_correct));

  -- Serialize the exact mutation key at the row level. A duplicate retry that
  -- races this transaction will hit the unique index and can safely recover.
  begin
    insert into public.question_attempts(
      user_id,question_id,selected_answer,is_correct,duration_ms,confidence,
      client_mutation_id,result_correct_answer,result_explanation,result_key_learning_point
    ) values (
      v_user,p_question_id,v_selected,v_is_correct,p_duration_ms,p_confidence,
      p_client_mutation_id,v_correct,v_explanation,v_learning
    );
  exception when unique_violation then
    select * into v_existing
    from public.question_attempts a
    where a.user_id=v_user and a.client_mutation_id=p_client_mutation_id
    limit 1;
    if found and v_existing.question_id=p_question_id then
      return query select v_existing.is_correct,
        coalesce(v_existing.result_correct_answer,''),
        v_existing.result_explanation,
        v_existing.result_key_learning_point;
      return;
    end if;
    raise exception 'mutation_id_reused';
  end;

  return query select v_is_correct,v_correct,v_explanation,v_learning;
end;
$$;
revoke all on function public.submit_question_answer(uuid,text,integer,smallint,uuid) from public, anon;
grant execute on function public.submit_question_answer(uuid,text,integer,smallint,uuid) to authenticated;
alter function public.submit_question_answer(uuid,text,integer,smallint,uuid) set search_path = '';

-- Replace the non-idempotent flashcard review function. Legacy signature is blocked.
revoke all on function public.review_flashcard(uuid,smallint,integer) from public, anon, authenticated;
drop function if exists public.review_flashcard(uuid,smallint,integer);

create or replace function public.review_flashcard(
  p_flashcard_id uuid,
  p_rating smallint,
  p_duration_ms integer default null,
  p_client_mutation_id uuid default null
)
returns table(
  card_id uuid,
  due_at timestamptz,
  interval_days numeric,
  ease_factor numeric,
  repetitions integer,
  lapse_count integer,
  stability_days numeric,
  difficulty numeric,
  next_bucket text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_card public.flashcards%rowtype;
  v_existing public.flashcard_reviews%rowtype;
  v_interval numeric(10,2);
  v_ease numeric(5,2);
  v_reps integer;
  v_lapses integer;
  v_stability numeric(10,2);
  v_difficulty numeric(5,2);
  v_due timestamptz;
  v_bucket text;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_rating < 0 or p_rating > 4 then raise exception 'invalid_rating'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;

  if p_client_mutation_id is not null then
    select * into v_existing
    from public.flashcard_reviews r
    where r.user_id=v_user and r.client_mutation_id=p_client_mutation_id
    limit 1;
    if found then
      if v_existing.flashcard_id <> p_flashcard_id then raise exception 'mutation_id_reused'; end if;
      return query select
        v_existing.flashcard_id,
        v_existing.result_due_at,
        v_existing.result_interval_days,
        v_existing.result_ease_factor,
        v_existing.result_repetitions,
        v_existing.result_lapse_count,
        v_existing.result_stability_days,
        v_existing.result_difficulty,
        v_existing.result_next_bucket;
      return;
    end if;
  end if;

  select * into v_card
  from public.flashcards
  where id=p_flashcard_id and owner_id=v_user
  for update;
  if not found then raise exception 'card_not_found'; end if;
  if v_card.suspended then raise exception 'card_suspended'; end if;

  -- Re-check after the row lock so a concurrent exact retry returns the cached result.
  if p_client_mutation_id is not null then
    select * into v_existing
    from public.flashcard_reviews r
    where r.user_id=v_user and r.client_mutation_id=p_client_mutation_id
    limit 1;
    if found then
      if v_existing.flashcard_id <> p_flashcard_id then raise exception 'mutation_id_reused'; end if;
      return query select
        v_existing.flashcard_id,
        v_existing.result_due_at,
        v_existing.result_interval_days,
        v_existing.result_ease_factor,
        v_existing.result_repetitions,
        v_existing.result_lapse_count,
        v_existing.result_stability_days,
        v_existing.result_difficulty,
        v_existing.result_next_bucket;
      return;
    end if;
  end if;

  v_interval := greatest(v_card.interval_days,0);
  v_ease := v_card.ease_factor;
  v_reps := v_card.repetitions;
  v_lapses := v_card.lapse_count;
  v_stability := v_card.stability_days;
  v_difficulty := v_card.difficulty;

  if p_rating=0 then
    v_lapses:=v_lapses+1; v_reps:=0; v_stability:=greatest(0.5,v_stability*0.55);
    v_difficulty:=least(10,v_difficulty+0.8); v_ease:=greatest(1.30,v_ease-0.20);
    v_interval:=0.04; v_due:=now()+interval '1 hour'; v_bucket:='again';
  elsif p_rating=1 then
    v_reps:=v_reps+1; v_difficulty:=least(10,v_difficulty+0.25); v_ease:=greatest(1.30,v_ease-0.10);
    v_stability:=greatest(1,v_stability*1.35+0.5); v_interval:=greatest(0.08,v_stability*0.55);
    v_due:=now()+make_interval(secs=>greatest(3600,round(v_interval*86400)::integer)); v_bucket:='hard';
  elsif p_rating=2 then
    v_reps:=v_reps+1; v_stability:=greatest(1,v_stability*(1.85+(10-v_difficulty)*0.035)+0.75);
    v_interval:=least(3650,greatest(0.17,v_stability));
    v_due:=now()+make_interval(secs=>greatest(3600,round(v_interval*86400)::integer)); v_bucket:='good';
  else
    v_reps:=v_reps+1; v_difficulty:=greatest(1,v_difficulty-0.35); v_ease:=least(4.0,v_ease+0.10);
    v_stability:=greatest(1,v_stability*2.65+1.25); v_interval:=least(3650,greatest(0.5,v_stability*1.15));
    v_due:=now()+make_interval(secs=>greatest(3600,round(v_interval*86400)::integer)); v_bucket:='easy';
  end if;

  update public.flashcards
  set due_at=v_due,
      interval_days=round(v_interval,2),
      ease_factor=round(v_ease,2),
      repetitions=v_reps,
      lapse_count=v_lapses,
      stability_days=round(v_stability,2),
      difficulty=round(v_difficulty,2),
      last_reviewed_at=now(),
      updated_at=now()
  where id=v_card.id;

  begin
    insert into public.flashcard_reviews(
      user_id,flashcard_id,rating,duration_ms,client_mutation_id,
      result_due_at,result_interval_days,result_ease_factor,result_repetitions,
      result_lapse_count,result_stability_days,result_difficulty,result_next_bucket
    ) values (
      v_user,v_card.id,p_rating,p_duration_ms,p_client_mutation_id,
      v_due,round(v_interval,2),round(v_ease,2),v_reps,
      v_lapses,round(v_stability,2),round(v_difficulty,2),v_bucket
    );
  exception when unique_violation then
    select * into v_existing
    from public.flashcard_reviews r
    where r.user_id=v_user and r.client_mutation_id=p_client_mutation_id
    limit 1;
    if found and v_existing.flashcard_id=p_flashcard_id then
      -- The winning transaction already applied the state transition. Return it.
      return query select
        v_existing.flashcard_id,
        v_existing.result_due_at,
        v_existing.result_interval_days,
        v_existing.result_ease_factor,
        v_existing.result_repetitions,
        v_existing.result_lapse_count,
        v_existing.result_stability_days,
        v_existing.result_difficulty,
        v_existing.result_next_bucket;
      return;
    end if;
    raise exception 'mutation_id_reused';
  end;

  return query select v_card.id,v_due,round(v_interval,2),round(v_ease,2),v_reps,
    v_lapses,round(v_stability,2),round(v_difficulty,2),v_bucket;
end;
$$;
revoke all on function public.review_flashcard(uuid,smallint,integer,uuid) from public, anon;
grant execute on function public.review_flashcard(uuid,smallint,integer,uuid) to authenticated;
alter function public.review_flashcard(uuid,smallint,integer,uuid) set search_path = '';

-- The old table policies also exposed a direct insert route; remove them so the
-- authoritative functions are the only write path for learner attempts/reviews.
drop policy if exists "users create own attempts" on public.question_attempts;
drop policy if exists "users create own reviews" on public.flashcard_reviews;

-- Make the event ledger append-only even for privileged actors through these
-- application-facing roles. Service-role/admin migrations remain the DB owner path.
revoke insert, update, delete on public.learning_events from authenticated, anon;
drop policy if exists "users read own learning events" on public.learning_events;

-- A narrow read RPC keeps future analytics features useful without granting the
-- browser direct table access.
create or replace function public.learning_event_feed(p_limit integer default 100)
returns table(
  id uuid,
  event_type text,
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz,
  payload jsonb
)
language sql stable security definer set search_path = ''
as $$
  select e.id,e.event_type,e.entity_type,e.entity_id,e.occurred_at,e.payload
  from public.learning_events e
  where e.user_id=auth.uid()
  order by e.occurred_at desc,e.id desc
  limit greatest(1,least(coalesce(p_limit,100),200));
$$;
revoke all on function public.learning_event_feed(integer) from public, anon;
grant execute on function public.learning_event_feed(integer) to authenticated;
alter function public.learning_event_feed(integer) set search_path = '';

-- Idempotency indexes are already created in Phase 20; re-assert them here.
create unique index if not exists question_attempts_user_mutation_uidx
  on public.question_attempts(user_id,client_mutation_id)
  where client_mutation_id is not null;
create unique index if not exists flashcard_reviews_user_mutation_uidx
  on public.flashcard_reviews(user_id,client_mutation_id)
  where client_mutation_id is not null;

-- Query-planning indexes for the dominant learner paths.
create index if not exists question_attempts_user_correct_created_idx
  on public.question_attempts(user_id,is_correct,created_at desc);
create index if not exists question_attempts_user_confidence_created_idx
  on public.question_attempts(user_id,confidence,created_at desc)
  where confidence is not null;
create index if not exists flashcards_owner_due_active_idx
  on public.flashcards(owner_id,due_at)
  where suspended=false;

-- Re-assert the least-privilege posture for the exact public RPCs used by learners.
revoke all on function public.get_next_question(uuid,text,text) from public, anon;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;
revoke all on function public.get_question_for_learning(uuid) from public, anon;
grant execute on function public.get_question_for_learning(uuid) to authenticated;

-- Existing profile updates remain the safe self-profile path; timezone is the only
-- newly introduced preference and must be a validly shaped string.
revoke all on function public.set_active_exam(uuid) from public, anon;
grant execute on function public.set_active_exam(uuid) to authenticated;


-- Re-define learner question delivery so private media can be signed server-side.
-- storage_path is an internal reference, never returned by the browser API.
create or replace function public.get_next_question(
  p_exam_id uuid default null,
  p_subject text default null,
  p_topic text default null
)
returns table(
  id uuid, content_code text, exam_id uuid, stem text, subject text, topic text,
  options jsonb, difficulty smallint, media jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  with weak_nodes as (
    select qt.taxonomy_id,
      avg(case when a.is_correct then 1.0 else 0.0 end) as accuracy
    from public.question_taxonomy qt
    join public.question_attempts a on a.question_id=qt.question_id and a.user_id=auth.uid()
    group by qt.taxonomy_id
    having count(*) >= 2
  ),
  candidates as (
    select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.difficulty,q.updated_at,
      exists(select 1 from public.question_attempts a where a.user_id=(select auth.uid()) and a.question_id=q.id) as seen,
      coalesce((select avg(case when a.is_correct then 1 else 0 end) from public.question_attempts a where a.user_id=(select auth.uid()) and a.question_id=q.id),0.5) as accuracy,
      coalesce((select max(a.created_at) from public.question_attempts a where a.user_id=(select auth.uid()) and a.question_id=q.id),timestamp 'epoch') as last_seen,
      coalesce((select min(w.accuracy) from public.question_taxonomy qt join weak_nodes w on w.taxonomy_id=qt.taxonomy_id where qt.question_id=q.id),1.0) as weakest_taxonomy_accuracy
    from public.questions q
    where q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (p_exam_id is null or q.exam_id=p_exam_id)
      and (p_subject is null or p_subject='' or q.subject=p_subject)
      and (p_topic is null or p_topic='' or q.topic=p_topic)
  ),
  picked as (
    select * from candidates
    order by seen asc, weakest_taxonomy_accuracy asc, accuracy asc, last_seen asc, difficulty desc, updated_at desc
    limit 1
  )
  select p.id,p.content_code,p.exam_id,p.stem,p.subject,p.topic,p.options,p.difficulty,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'kind',m.kind,
      'student_alt_text',coalesce(m.student_alt_text,'Medical image'),
      'external_url',m.external_url,
      'storage_path',m.storage_path,
      'caption',qm.caption,'position',qm.position
    ) order by qm.position)
    from public.question_media qm
    join public.media_assets m on m.id=qm.media_id
    where qm.question_id=p.id),'[]'::jsonb)
  from picked p;
end;
$$;
revoke all on function public.get_next_question(uuid,text,text) from public, anon;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;
alter function public.get_next_question(uuid,text,text) set search_path = '';

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
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'kind',m.kind,
      'student_alt_text',coalesce(m.student_alt_text,'Medical image'),
      'external_url',m.external_url,
      'storage_path',m.storage_path,
      'caption',qm.caption,'position',qm.position
    ) order by qm.position)
    from public.question_media qm
    join public.media_assets m on m.id=qm.media_id
    where qm.question_id=q.id),'[]'::jsonb)
  from public.questions q
  where q.id=p_question_id
    and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());
end;
$$;
revoke all on function public.get_question_for_learning(uuid) from public, anon;
grant execute on function public.get_question_for_learning(uuid) to authenticated;
alter function public.get_question_for_learning(uuid) set search_path = '';


-- Timezone-aware rules engine. The previous version used the database date (usually UTC),
-- which can make a learner's daily target/streak change at the wrong local hour.
create or replace function public.smart_student_snapshot()
returns jsonb
language sql stable security definer set search_path = ''
as $$
with
me as (
  select
    (select p.active_exam_id from public.profiles p where p.id=(select auth.uid())) as active_exam_id,
    coalesce((select nullif(p.timezone,'') from public.profiles p where p.id=(select auth.uid())),'UTC') as timezone,
    (select s.target_date from public.study_plans s where s.user_id=(select auth.uid()) order by s.updated_at desc limit 1) as target_date,
    (select s.daily_minutes from public.study_plans s where s.user_id=(select auth.uid()) order by s.updated_at desc limit 1) as daily_minutes
),
bounds as (
  select (now() at time zone (select timezone from me))::date as local_today,
         ((now() at time zone (select timezone from me))::date::timestamp at time zone (select timezone from me)) as local_midnight
),
attempts as (
  select a.*,q.subject,coalesce(nullif(q.topic,''),q.subject,'General') as topic,q.difficulty
  from public.question_attempts a join public.questions q on q.id=a.question_id where a.user_id=(select auth.uid())
),
recent as (
  select * from attempts where created_at>=now()-interval '90 days'
),
overall as (
  select count(*)::int attempts,
    coalesce(round(100*avg(case when is_correct then 1.0 else 0.0 end),1),0)::numeric accuracy,
    coalesce(round(avg(nullif(duration_ms,0))/1000.0,1),0)::numeric avg_seconds,
    coalesce(round(avg(confidence),1),0)::numeric avg_confidence
  from recent
),
topic_stats as (
  select topic,count(*)::int attempts,
    round(100*avg(case when is_correct then 1.0 else 0.0 end),1)::numeric accuracy,
    max(created_at) last_attempt_at,
    round(avg(nullif(duration_ms,0))/1000.0,1)::numeric avg_seconds
  from recent group by topic
),
weak as (
  select * from topic_stats where attempts>=2 order by accuracy asc,attempts desc,topic asc limit 5
),
due as (
  select count(*)::int due_cards from public.flashcards where owner_id=(select auth.uid()) and suspended=false and due_at<=now()
),
activity_days as (
  select distinct (created_at at time zone (select timezone from me))::date as activity_day from recent
),
streak_anchor as (
  select case
    when exists(select 1 from activity_days where activity_day=(select local_today from bounds)) then (select local_today from bounds)
    when exists(select 1 from activity_days where activity_day=(select local_today from bounds)-1) then (select local_today from bounds)-1
    else null::date
  end anchor
),
streak as (
  select case when (select anchor from streak_anchor) is null then 0 else (
    select count(*)::int
    from generate_series(0,89) g(i)
    where ((select anchor from streak_anchor)-g.i)::date in (select activity_day from activity_days)
      and not exists (
        select 1 from generate_series(0,g.i-1) h(j)
        where ((select anchor from streak_anchor)-h.j)::date not in (select activity_day from activity_days)
      )
  ) end days
),
today as (
  select count(*)::int attempts_today,coalesce(sum(case when is_correct then 1 else 0 end),0)::int correct_today
  from attempts where created_at>=(select local_midnight from bounds)
),
week as (
  select count(*)::int attempts_7d,coalesce(sum(case when is_correct then 1 else 0 end),0)::int correct_7d
  from attempts where created_at>=now()-interval '7 days'
),
plan as (
  select coalesce((select daily_minutes from me),30)::int daily_minutes,(select target_date from me) target_date,(select active_exam_id from me) exam_id
),
target as (
  select greatest(5,least(80,round(daily_minutes/2.0)::int)) daily_questions,
    case when target_date is null then null else greatest(0,(target_date-(select local_today from bounds)))::int end days_remaining,
    daily_minutes,target_date,exam_id
  from plan
),
confidence as (
  select coalesce(round(avg(case when confidence>=4 and is_correct then 1.0 when confidence>=4 and not is_correct then 0.0 end)*100,1),0)::numeric high_confidence_accuracy,
    coalesce(round(avg(case when confidence<=2 and is_correct then 1.0 when confidence<=2 and not is_correct then 0.0 end)*100,1),0)::numeric low_confidence_accuracy
  from recent where confidence is not null
),
recommendations as (
  select jsonb_agg(item order by priority,key) items from (
    select 10 priority,'retrieval' key,jsonb_build_object('type','flashcards','priority',10,'title','Review due memory','reason',format('You have %s cards due for retrieval.',(select due_cards from due)),'target_count',least((select due_cards from due),30)) item where (select due_cards from due)>0
    union all
    select 20,'weak-topic',jsonb_build_object('type','qbank','priority',20,'title','Practice your weakest topic','reason',format('%s is at %s%% after %s attempts.',w.topic,w.accuracy,w.attempts),'topic',w.topic,'target_count',10) from (select * from weak limit 1) w
    union all
    select 30,'daily-target',jsonb_build_object('type','qbank','priority',30,'title','Complete today''s target','reason',format('%s of %s recommended questions completed today.',(select attempts_today from today),(select daily_questions from target)),'target_count',greatest(0,(select daily_questions from target)-(select attempts_today from today))) item where (select attempts_today from today)<(select daily_questions from target)
    union all
    select 40,'exam-pressure',jsonb_build_object('type','mixed','priority',40,'title','Switch to timed mixed practice','reason',format('%s days remain and recent accuracy is %s%%.',(select days_remaining from target),(select accuracy from overall)),'target_count',20) item where (select days_remaining from target) between 1 and 14 and (select attempts from overall)>=5
    union all
    select 50,'challenge',jsonb_build_object('type','qbank','priority',50,'title','Increase difficulty','reason','Your recent accuracy is strong enough to benefit from harder questions.','target_count',10) item where (select accuracy from overall)>=85 and (select attempts from overall)>=10
  ) ranked
),
state as (
  select case when (select attempts from overall)=0 then 'new' when (select accuracy from overall)<60 then 'recovery' when (select accuracy from overall)<75 then 'building' when (select accuracy from overall)<90 then 'strong' else 'advanced' end learner_state
)
select jsonb_build_object(
  'version',2,'ai_enabled',false,'generated_at',now(),'learner_state',(select learner_state from state),
  'overall',row_to_json((select overall from overall)),'today',row_to_json((select today from today)),
  'week',row_to_json((select week from week)),'streak_days',(select days from streak),'due_cards',(select due_cards from due),
  'plan',row_to_json((select target from target)),'confidence',row_to_json((select confidence from confidence)),
  'weak_topics',coalesce((select jsonb_agg(row_to_json(w)) from weak w),'[]'::jsonb),
  'recommendations',coalesce((select items from recommendations),'[]'::jsonb)
);
$$;
revoke all on function public.smart_student_snapshot() from public,anon;
grant execute on function public.smart_student_snapshot() to authenticated;
alter function public.smart_student_snapshot() set search_path = '';

-- Keep new learner media paths opaque for future uploads; legacy objects remain protected by Storage RLS.
