-- MDvoro Phase 34: final security / scalability hardening.
-- Goals:
-- 1) close the rate-limit action contract mismatch,
-- 2) eliminate SECURITY DEFINER search_path drift,
-- 3) make leaderboard + Board Success analytics projection-backed,
-- 4) make question->flashcard creation race-safe,
-- 5) provide indexed delivery paths for high-concurrency QBank starts.

-- -----------------------------------------------------------------------------
-- 1. Rate-limit contract: every action used by the application must be accepted.
-- -----------------------------------------------------------------------------
create or replace function public.consume_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_hits integer;
  v_started timestamptz;
  v_now timestamptz := now();
begin
  if auth.uid() is null then return false; end if;
  if p_action is null or p_action not in (
    'qbank_answer', 'qbank_next', 'qbank_catalog', 'qbank_break',
    'flashcard_review', 'flashcard_delete',
    'admin_write', 'admin_upload', 'auth_mutation'
  ) then
    return false;
  end if;
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 3600 then
    return false;
  end if;

  v_key := auth.uid()::text || ':' || p_action;
  insert into public.rate_limit_buckets(bucket_key, window_started, hits)
  values(v_key, v_now, 1)
  on conflict(bucket_key) do update set
    window_started = case
      when public.rate_limit_buckets.window_started <= v_now - make_interval(secs => p_window_seconds)
      then v_now else public.rate_limit_buckets.window_started end,
    hits = case
      when public.rate_limit_buckets.window_started <= v_now - make_interval(secs => p_window_seconds)
      then 1 else public.rate_limit_buckets.hits + 1 end
  returning hits, window_started into v_hits, v_started;

  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon;
grant execute on function public.consume_rate_limit(text,integer,integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Harden SECURITY DEFINER functions introduced after the global hardening pass.
-- -----------------------------------------------------------------------------
alter function public.admin_set_question_reconstruction(uuid,boolean,smallint,text) set search_path = '';
alter function public.review_question(uuid,text,text) set search_path = '';
alter function public.admin_get_question(uuid) set search_path = '';
alter function public.learning_readiness(uuid) set search_path = '';
alter function public.list_my_notebook(integer) set search_path = '';

-- -----------------------------------------------------------------------------
-- 3. Race-safe automatic flashcards from questions.
-- -----------------------------------------------------------------------------
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
  v_back text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select q.stem, q.explanation, q.key_learning_point, q.subject, q.topic
    into v_stem, v_explanation, v_key_learning_point, v_subject, v_topic
  from public.questions q
  where q.id = p_question_id
    and q.is_published = true
    and q.workflow_status = 'published'
    and (q.access_tier = 'free' or public.has_active_subscription())
  limit 1;

  if v_stem is null then raise exception 'question_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_question_id::text, 0));

  select f.id into v_id
  from public.flashcards f
  where f.owner_id = auth.uid() and f.source_question_id = p_question_id
  order by f.created_at desc
  limit 1;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  v_back := coalesce(nullif(trim(v_explanation), ''), 'Review this question and its rationale again.')
    || case when nullif(trim(v_key_learning_point), '') is not null
      then E'\n\nKey learning point: ' || trim(v_key_learning_point)
      else '' end;

  begin
    insert into public.flashcards(owner_id, front, back, card_type, tags, source_question_id)
    values (
      auth.uid(), trim(v_stem), v_back, 'clinical',
      array_remove(array[nullif(trim(v_subject), ''), nullif(trim(v_topic), '')], null),
      p_question_id
    ) returning id into v_id;
  exception when unique_violation then
    select f.id into v_id
    from public.flashcards f
    where f.owner_id = auth.uid() and f.source_question_id = p_question_id
    order by f.created_at desc limit 1;
    return query select v_id, false;
    return;
  end;

  return query select v_id, true;
end;
$$;
revoke all on function public.create_flashcard_from_question(uuid) from public,anon;
grant execute on function public.create_flashcard_from_question(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Projection tables for concurrent leaderboard + readiness reads.
-- -----------------------------------------------------------------------------
create table if not exists public.learner_exam_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempts bigint not null default 0 check (attempts >= 0),
  correct bigint not null default 0 check (correct >= 0),
  study_days bigint not null default 0 check (study_days >= 0),
  high_conf_attempts bigint not null default 0 check (high_conf_attempts >= 0),
  high_conf_correct bigint not null default 0 check (high_conf_correct >= 0),
  low_conf_attempts bigint not null default 0 check (low_conf_attempts >= 0),
  low_conf_correct bigint not null default 0 check (low_conf_correct >= 0),
  wrong_count bigint not null default 0 check (wrong_count >= 0),
  high_conf_wrong bigint not null default 0 check (high_conf_wrong >= 0),
  low_conf_wrong bigint not null default 0 check (low_conf_wrong >= 0),
  slow_wrong bigint not null default 0 check (slow_wrong >= 0),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id, exam_id),
  check (correct <= attempts),
  check (high_conf_correct <= high_conf_attempts),
  check (low_conf_correct <= low_conf_attempts),
  check (wrong_count <= attempts),
  check (high_conf_wrong <= wrong_count),
  check (low_conf_wrong <= wrong_count),
  check (slow_wrong <= wrong_count)
);

create table if not exists public.learner_exam_daily_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  study_day date not null,
  attempts bigint not null default 0 check (attempts >= 0),
  correct bigint not null default 0 check (correct >= 0),
  primary key(user_id, exam_id, study_day),
  check (correct <= attempts)
);

create index if not exists learner_exam_stats_exam_attempts_idx
  on public.learner_exam_stats(exam_id, attempts desc, correct desc);
create index if not exists learner_exam_daily_exam_day_idx
  on public.learner_exam_daily_stats(exam_id, study_day desc, attempts desc);
create index if not exists learner_exam_daily_user_day_idx
  on public.learner_exam_daily_stats(user_id, study_day desc);

alter table public.learner_exam_stats enable row level security;
alter table public.learner_exam_daily_stats enable row level security;
revoke all on public.learner_exam_stats from anon,authenticated;
revoke all on public.learner_exam_daily_stats from anon,authenticated;

-- -----------------------------------------------------------------------------
-- 5. Extend the immutable attempt projection trigger with exam-level projections.
-- -----------------------------------------------------------------------------
create or replace function public.project_question_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration bigint := coalesce(new.duration_ms,0);
  v_confidence integer := coalesce(new.confidence,0);
  v_has_duration boolean := new.duration_ms is not null and new.duration_ms > 0;
  v_has_confidence boolean := new.confidence is not null;
  v_exam_id uuid;
  v_study_day date;
  v_new_day boolean := false;
  v_day_exists boolean := false;
begin
  insert into public.learner_question_stats(
    user_id,question_id,attempts,correct,duration_sum_ms,duration_count,
    confidence_sum,confidence_count,first_attempt_at,last_attempt_at,updated_at
  ) values (
    new.user_id,new.question_id,1,case when new.is_correct then 1 else 0 end,
    v_duration,case when v_has_duration then 1 else 0 end,
    v_confidence,case when v_has_confidence then 1 else 0 end,
    new.created_at,new.created_at,now()
  )
  on conflict (user_id,question_id) do update set
    attempts=public.learner_question_stats.attempts+1,
    correct=public.learner_question_stats.correct+case when new.is_correct then 1 else 0 end,
    duration_sum_ms=public.learner_question_stats.duration_sum_ms+v_duration,
    duration_count=public.learner_question_stats.duration_count+case when v_has_duration then 1 else 0 end,
    confidence_sum=public.learner_question_stats.confidence_sum+v_confidence,
    confidence_count=public.learner_question_stats.confidence_count+case when v_has_confidence then 1 else 0 end,
    first_attempt_at=least(public.learner_question_stats.first_attempt_at,new.created_at),
    last_attempt_at=greatest(public.learner_question_stats.last_attempt_at,new.created_at),
    updated_at=now();

  insert into public.learner_taxonomy_mastery(
    user_id,taxonomy_id,attempts,correct,duration_sum_ms,duration_count,
    confidence_sum,confidence_count,first_attempt_at,last_attempt_at,updated_at
  )
  select new.user_id,qt.taxonomy_id,1,case when new.is_correct then 1 else 0 end,
    v_duration,case when v_has_duration then 1 else 0 end,
    v_confidence,case when v_has_confidence then 1 else 0 end,
    new.created_at,new.created_at,now()
  from public.question_taxonomy qt
  where qt.question_id=new.question_id
  on conflict (user_id,taxonomy_id) do update set
    attempts=public.learner_taxonomy_mastery.attempts+1,
    correct=public.learner_taxonomy_mastery.correct+case when new.is_correct then 1 else 0 end,
    duration_sum_ms=public.learner_taxonomy_mastery.duration_sum_ms+v_duration,
    duration_count=public.learner_taxonomy_mastery.duration_count+case when v_has_duration then 1 else 0 end,
    confidence_sum=public.learner_taxonomy_mastery.confidence_sum+v_confidence,
    confidence_count=public.learner_taxonomy_mastery.confidence_count+case when v_has_confidence then 1 else 0 end,
    first_attempt_at=least(public.learner_taxonomy_mastery.first_attempt_at,new.created_at),
    last_attempt_at=greatest(public.learner_taxonomy_mastery.last_attempt_at,new.created_at),
    updated_at=now();

  select q.exam_id into v_exam_id from public.questions q where q.id=new.question_id;
  if v_exam_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || v_exam_id::text, 0));
  select (new.created_at at time zone coalesce(nullif(p.timezone,''),'UTC'))::date
    into v_study_day
  from public.profiles p where p.id=new.user_id;
  v_study_day := coalesce(v_study_day,(new.created_at at time zone 'UTC')::date);

  select exists(
    select 1 from public.learner_exam_daily_stats d
    where d.user_id=new.user_id and d.exam_id=v_exam_id and d.study_day=v_study_day
  ) into v_day_exists;
  v_new_day := not v_day_exists;

  insert into public.learner_exam_daily_stats(user_id,exam_id,study_day,attempts,correct)
  values(new.user_id,v_exam_id,v_study_day,1,case when new.is_correct then 1 else 0 end)
  on conflict(user_id,exam_id,study_day) do update set
    attempts=public.learner_exam_daily_stats.attempts+1,
    correct=public.learner_exam_daily_stats.correct+case when new.is_correct then 1 else 0 end;

  insert into public.learner_exam_stats(
    user_id,exam_id,attempts,correct,study_days,
    high_conf_attempts,high_conf_correct,low_conf_attempts,low_conf_correct,
    wrong_count,high_conf_wrong,low_conf_wrong,slow_wrong,
    first_attempt_at,last_attempt_at,updated_at
  ) values(
    new.user_id,v_exam_id,1,case when new.is_correct then 1 else 0 end,1,
    case when v_confidence>=4 then 1 else 0 end,case when v_confidence>=4 and new.is_correct then 1 else 0 end,
    case when v_confidence between 1 and 2 then 1 else 0 end,case when v_confidence between 1 and 2 and new.is_correct then 1 else 0 end,
    case when new.is_correct=false then 1 else 0 end,
    case when new.is_correct=false and v_confidence>=4 then 1 else 0 end,
    case when new.is_correct=false and v_confidence between 1 and 2 then 1 else 0 end,
    case when new.is_correct=false and new.duration_ms>=180000 then 1 else 0 end,
    new.created_at,new.created_at,now()
  )
  on conflict(user_id,exam_id) do update set
    attempts=public.learner_exam_stats.attempts+1,
    correct=public.learner_exam_stats.correct+case when new.is_correct then 1 else 0 end,
    study_days=public.learner_exam_stats.study_days+case when v_new_day then 1 else 0 end,
    high_conf_attempts=public.learner_exam_stats.high_conf_attempts+case when v_confidence>=4 then 1 else 0 end,
    high_conf_correct=public.learner_exam_stats.high_conf_correct+case when v_confidence>=4 and new.is_correct then 1 else 0 end,
    low_conf_attempts=public.learner_exam_stats.low_conf_attempts+case when v_confidence between 1 and 2 then 1 else 0 end,
    low_conf_correct=public.learner_exam_stats.low_conf_correct+case when v_confidence between 1 and 2 and new.is_correct then 1 else 0 end,
    wrong_count=public.learner_exam_stats.wrong_count+case when new.is_correct=false then 1 else 0 end,
    high_conf_wrong=public.learner_exam_stats.high_conf_wrong+case when new.is_correct=false and v_confidence>=4 then 1 else 0 end,
    low_conf_wrong=public.learner_exam_stats.low_conf_wrong+case when new.is_correct=false and v_confidence between 1 and 2 then 1 else 0 end,
    slow_wrong=public.learner_exam_stats.slow_wrong+case when new.is_correct=false and new.duration_ms>=180000 then 1 else 0 end,
    first_attempt_at=least(public.learner_exam_stats.first_attempt_at,new.created_at),
    last_attempt_at=greatest(public.learner_exam_stats.last_attempt_at,new.created_at),
    updated_at=now();

  return new;
end;
$$;
revoke all on function public.project_question_attempt() from public,anon,authenticated;

-- Backfill the new exam projections from canonical attempt history.
insert into public.learner_exam_daily_stats(user_id,exam_id,study_day,attempts,correct)
select a.user_id,q.exam_id,
  (a.created_at at time zone coalesce(nullif(p.timezone,''),'UTC'))::date,
  count(*)::bigint,
  count(*) filter(where a.is_correct=true)::bigint
from public.question_attempts a
join public.questions q on q.id=a.question_id
join public.profiles p on p.id=a.user_id
group by a.user_id,q.exam_id,(a.created_at at time zone coalesce(nullif(p.timezone,''),'UTC'))::date
on conflict(user_id,exam_id,study_day) do update set attempts=excluded.attempts,correct=excluded.correct;

insert into public.learner_exam_stats(
  user_id,exam_id,attempts,correct,study_days,
  high_conf_attempts,high_conf_correct,low_conf_attempts,low_conf_correct,
  wrong_count,high_conf_wrong,low_conf_wrong,slow_wrong,
  first_attempt_at,last_attempt_at,updated_at
)
select
  a.user_id,q.exam_id,
  count(*)::bigint,
  count(*) filter(where a.is_correct=true)::bigint,
  count(distinct (a.created_at at time zone coalesce(nullif(p.timezone,''),'UTC'))::date)::bigint,
  count(*) filter(where a.confidence>=4)::bigint,
  count(*) filter(where a.confidence>=4 and a.is_correct=true)::bigint,
  count(*) filter(where a.confidence between 1 and 2)::bigint,
  count(*) filter(where a.confidence between 1 and 2 and a.is_correct=true)::bigint,
  count(*) filter(where a.is_correct=false)::bigint,
  count(*) filter(where a.is_correct=false and a.confidence>=4)::bigint,
  count(*) filter(where a.is_correct=false and a.confidence between 1 and 2)::bigint,
  count(*) filter(where a.is_correct=false and a.duration_ms>=180000)::bigint,
  min(a.created_at),max(a.created_at),now()
from public.question_attempts a
join public.questions q on q.id=a.question_id
join public.profiles p on p.id=a.user_id
group by a.user_id,q.exam_id
on conflict(user_id,exam_id) do update set
  attempts=excluded.attempts,correct=excluded.correct,study_days=excluded.study_days,
  high_conf_attempts=excluded.high_conf_attempts,high_conf_correct=excluded.high_conf_correct,
  low_conf_attempts=excluded.low_conf_attempts,low_conf_correct=excluded.low_conf_correct,
  wrong_count=excluded.wrong_count,high_conf_wrong=excluded.high_conf_wrong,
  low_conf_wrong=excluded.low_conf_wrong,slow_wrong=excluded.slow_wrong,
  first_attempt_at=excluded.first_attempt_at,last_attempt_at=excluded.last_attempt_at,updated_at=now();

-- -----------------------------------------------------------------------------
-- 6. Projection-backed competitive leaderboard.
-- -----------------------------------------------------------------------------
create or replace function public.public_leaderboard(
  p_exam_id uuid,
  p_period text default 'all_time',
  p_metric text default 'questions',
  p_limit integer default 50
)
returns table(
  rank integer,
  display_name text,
  questions_solved bigint,
  correct_answers bigint,
  accuracy numeric,
  study_days bigint,
  xp_score bigint,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with grouped as (
    select
      s.user_id,
      sum(s.attempts)::bigint as questions_solved,
      sum(s.correct)::bigint as correct_answers,
      round(sum(s.correct)::numeric/nullif(sum(s.attempts),0)*100,1) as accuracy,
      sum(s.study_days)::bigint as study_days,
      (sum(s.attempts)*2 + sum(s.correct)*3 + sum(s.study_days)*5)::bigint as xp_score
    from public.learner_exam_stats s
    where s.exam_id=p_exam_id
      and (p_period='all_time' or exists(
        select 1 from public.learner_exam_daily_stats d
        where d.user_id=s.user_id and d.exam_id=s.exam_id
          and d.study_day >= current_date - case when p_period='week' then 6 else 29 end
      ))
    group by s.user_id
    having sum(s.attempts) >= 5
  ),
  windowed as (
    select
      d.user_id,
      sum(d.attempts)::bigint as questions_solved,
      sum(d.correct)::bigint as correct_answers,
      count(*)::bigint as study_days
    from public.learner_exam_daily_stats d
    where d.exam_id=p_exam_id
      and p_period in ('week','month')
      and d.study_day >= current_date - case when p_period='week' then 6 else 29 end
    group by d.user_id
  ),
  normalized as (
    select g.user_id,
      case when p_period='all_time' then g.questions_solved else coalesce(w.questions_solved,0) end questions_solved,
      case when p_period='all_time' then g.correct_answers else coalesce(w.correct_answers,0) end correct_answers,
      case when p_period='all_time' then g.study_days else coalesce(w.study_days,0) end study_days
    from grouped g left join windowed w on w.user_id=g.user_id
  ),
  scored as (
    select n.*,
      round(n.correct_answers::numeric/nullif(n.questions_solved,0)*100,1) accuracy,
      (n.questions_solved*2 + n.correct_answers*3 + n.study_days*5)::bigint xp_score
    from normalized n
  ),
  ranked as (
    select s.*,
      row_number() over(order by
        case when p_metric='accuracy' then s.accuracy end desc nulls last,
        case when p_metric='xp' then s.xp_score end desc nulls last,
        case when p_metric='days' then s.study_days end desc nulls last,
        case when p_metric not in ('accuracy','xp','days') then s.questions_solved end desc nulls last,
        s.correct_answers desc,s.user_id
      )::integer as rank
    from scored s
    where s.questions_solved >= 5
  )
  select
    r.rank,
    case when p.leaderboard_visible=false then 'Anonymous student' else coalesce(nullif(trim(p.full_name),''),'MDvoro student') end,
    r.questions_solved,r.correct_answers,r.accuracy,r.study_days,r.xp_score,(r.user_id=auth.uid())
  from ranked r join public.profiles p on p.id=r.user_id
  where r.rank <= greatest(1,least(coalesce(p_limit,50),100))
  order by r.rank;
$$;
revoke all on function public.public_leaderboard(uuid,text,text,integer) from public,anon;
grant execute on function public.public_leaderboard(uuid,text,text,integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Projection-backed Board Success Center analytics.
-- -----------------------------------------------------------------------------
create or replace function public.learning_exam_blueprint(p_exam_id uuid)
returns table(subject text, available bigint, attempted bigint, correct bigint, accuracy numeric, coverage numeric)
language sql stable security definer set search_path = ''
as $$
  with pool as (
    select q.id,q.subject
    from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
  ),
  branch as (
    select p.subject,count(*)::bigint available,
      count(*) filter(where coalesce(qs.attempts,0)>0)::bigint attempted,
      coalesce(sum(coalesce(qs.correct,0)),0)::bigint correct,
      coalesce(round(100.0*sum(coalesce(qs.correct,0))/nullif(sum(coalesce(qs.attempts,0)),0),1),0)::numeric accuracy
    from pool p
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=p.id
    group by p.subject
  )
  select subject,available,attempted,correct,accuracy,
    coalesce(round(100.0*attempted/nullif(available,0),1),0)::numeric coverage
  from branch order by coverage asc,accuracy asc,subject asc;
$$;
revoke all on function public.learning_exam_blueprint(uuid) from public,anon;
grant execute on function public.learning_exam_blueprint(uuid) to authenticated;

create or replace function public.learning_daily_activity(p_days integer default 14)
returns table(day date, questions bigint, correct bigint, accuracy numeric)
language sql stable security definer set search_path = ''
as $$
  with days as (
    select generate_series(current_date-greatest(1,least(p_days,31))+1,current_date,interval '1 day')::date as study_day
  ),
  raw as (
    select d.study_day,sum(d.attempts)::bigint questions,sum(d.correct)::bigint correct
    from public.learner_exam_daily_stats d
    where d.user_id=auth.uid()
      and d.study_day >= current_date-greatest(1,least(p_days,31))+1
    group by d.study_day
  )
  select x.study_day,coalesce(r.questions,0),coalesce(r.correct,0),
    case when coalesce(r.questions,0)>0 then round(100.0*r.correct/r.questions,1) else 0 end::numeric
  from days x left join raw r on r.study_day=x.study_day order by x.study_day;
$$;
revoke all on function public.learning_daily_activity(integer) from public,anon;
grant execute on function public.learning_daily_activity(integer) to authenticated;

create or replace function public.learning_mistake_profile(p_exam_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'total_wrong',coalesce(s.wrong_count,0)::int,
    'high_confidence_wrong',coalesce(s.high_conf_wrong,0)::int,
    'low_confidence_wrong',coalesce(s.low_conf_wrong,0)::int,
    'slow_wrong',coalesce(s.slow_wrong,0)::int
  )
  from public.learner_exam_stats s
  where s.user_id=auth.uid() and s.exam_id=p_exam_id;
$$;
revoke all on function public.learning_mistake_profile(uuid) from public,anon;
grant execute on function public.learning_mistake_profile(uuid) to authenticated;

create or replace function public.learning_readiness(p_exam_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with accessible_questions as (
    select count(*)::numeric published_count
    from public.questions q
    where q.exam_id=p_exam_id and q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
  ),
  question_coverage as (
    select count(distinct s.question_id)::numeric distinct_questions
    from public.learner_question_stats s
    join public.questions q on q.id=s.question_id
    where s.user_id=auth.uid() and q.exam_id=p_exam_id and s.attempts>0
  ),
  seven as (
    select coalesce(sum(d.attempts),0)::numeric attempts_7d
    from public.learner_exam_daily_stats d
    where d.user_id=auth.uid() and d.exam_id=p_exam_id and d.study_day>=current_date-6
  ),
  mine as (
    select coalesce(max(s.attempts),0)::numeric attempts,
      coalesce(max(s.correct),0)::numeric correct,
      coalesce(max(s.high_conf_correct),0)::numeric high_conf_correct,
      coalesce(max(s.high_conf_attempts),0)::numeric high_conf_attempts,
      coalesce(max(s.low_conf_correct),0)::numeric low_conf_correct,
      coalesce(max(s.low_conf_attempts),0)::numeric low_conf_attempts
    from public.learner_exam_stats s
    where s.user_id=auth.uid() and s.exam_id=p_exam_id
  ),
  due as (
    select count(*)::numeric due_cards from public.flashcards f where f.owner_id=auth.uid() and f.due_at<=now()
  ),
  peer as (
    select s.user_id,round(s.correct::numeric/nullif(s.attempts,0)*100,1) accuracy
    from public.learner_exam_stats s
    where s.exam_id=p_exam_id and s.attempts>=20
  ),
  peer_summary as (
    select count(*)::integer participant_count,
      count(*) filter(where p.accuracy < coalesce((select correct/nullif(attempts,0)*100 from mine),0))::integer lower_count
    from peer p
  ),
  score as (
    select
      m.*,
      least(100,round(
        case when m.attempts>0 then (m.correct/m.attempts*100)*0.50 else 0 end
        + case when aq.published_count>0 then least(100,round(coalesce(qc.distinct_questions,0)/aq.published_count*100,1))*0.20 else 0 end
        + least(100,coalesce(s7.attempts_7d,0)/40*100)*0.15
        + greatest(0,100-least(100,coalesce(d.due_cards,0)/50*100))*0.15,1
      )) readiness_score,
      case when m.high_conf_attempts>0 and m.low_conf_attempts>0
        then round((m.high_conf_correct/m.high_conf_attempts*100)-(m.low_conf_correct/m.low_conf_attempts*100),1)
        else null end confidence_gap,
      ps.participant_count,
      case when ps.participant_count>=10 then round(ps.lower_count::numeric/nullif(ps.participant_count,0)*100,1) else null end peer_percentile,
      coalesce(qc.distinct_questions,0) distinct_questions,
      coalesce(s7.attempts_7d,0) attempts_7d,
      coalesce(d.due_cards,0) due_cards,
      aq.published_count
    from mine m
    cross join accessible_questions aq
    cross join question_coverage qc
    cross join seven s7
    cross join due d
    cross join peer_summary ps
  )
  select jsonb_build_object(
    'exam_id',p_exam_id,'readiness_score',readiness_score,'attempts',attempts,
    'accuracy',case when attempts>0 then round(correct/attempts*100,1) else 0 end,
    'coverage',case when published_count>0 then least(100,round(distinct_questions/published_count*100,1)) else 0 end,
    'attempts_7d',attempts_7d,'due_cards',due_cards,'confidence_gap',confidence_gap,
    'peer_percentile',peer_percentile,'peer_participants',participant_count
  )
  from score;
$$;
revoke all on function public.learning_readiness(uuid) from public,anon;
grant execute on function public.learning_readiness(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Indexed QBank delivery paths for high-concurrency starts.
-- -----------------------------------------------------------------------------
create index if not exists questions_exam_delivery_id_idx
  on public.questions(exam_id,workflow_status,is_published,access_tier,id);
create index if not exists questions_reconstruction_delivery_id_idx
  on public.questions(exam_id,reconstruction_year,is_reconstruction,workflow_status,is_published,access_tier,id);
create index if not exists question_bookmarks_user_question_idx
  on public.question_bookmarks(user_id,question_id);
create index if not exists study_session_items_session_question_correct_idx
  on public.study_session_items(session_id,question_id,is_correct);

-- The selection functions keep their product semantics but sample from an indexed
-- bounded window before scoring. This avoids ORDER BY random() across the whole bank.
create or replace function public.start_study_session(
  p_exam_id uuid,
  p_subjects text[] default '{}',
  p_topics text[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice',
  p_pool text default 'mixed'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer,break_seconds integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_exam record; v_session uuid; v_total bigint; v_last_session uuid; v_full_window boolean;
  v_blocks integer; v_break integer; v_time integer; v_timing_policy text;
  v_allowed_pools text[] := array['mixed','unseen','incorrect','answered','unanswered','bookmarked'];
  v_anchor uuid := gen_random_uuid(); v_candidate_limit integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count<1 or p_question_count>300 then raise exception 'invalid_question_count'; end if;
  if not (p_pool=any(v_allowed_pools)) then raise exception 'invalid_pool'; end if;

  select e.id,e.code,e.max_items,ep.total_duration_minutes,ep.max_items profile_max_items,
    ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.break_minutes,
    ep.timing_verified,ep.timing_source
  into v_exam from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
  where e.id=p_exam_id and ep.enabled=true;
  if not found then raise exception 'exam_not_found'; end if;

  select ss.id into v_last_session from public.study_sessions ss
  where ss.user_id=auth.uid() and ss.status in ('completed','expired')
  order by coalesce(ss.finished_at,ss.created_at) desc limit 1;

  if exists(select 1 from unnest(coalesce(p_subjects,'{}'::text[])) s where not exists(select 1 from public.exam_subjects es where es.exam_id=v_exam.id and es.enabled and es.subject_key=s)) then
    raise exception 'invalid_subject';
  end if;
  if exists(select 1 from unnest(coalesce(p_topics,'{}'::text[])) t where not exists(select 1 from public.questions q where q.exam_id=v_exam.id and q.topic=t and q.is_published and q.workflow_status='published')) then
    raise exception 'invalid_topic';
  end if;
  if p_mode='exam' and p_question_count>least(v_exam.profile_max_items,300) then raise exception 'exam_question_limit'; end if;

  v_full_window := p_mode='exam' and p_question_count>=least(v_exam.profile_max_items,300) and v_exam.timing_verified;
  v_blocks := greatest(1,least(v_exam.block_count,ceil(p_question_count::numeric/v_exam.block_max_items)::integer));
  v_break := case when v_full_window and v_blocks>1 then v_exam.break_minutes*60 else 0 end;
  v_time := case when p_mode='practice' then null when v_full_window then v_exam.total_duration_minutes*60 else greatest(v_exam.block_duration_minutes*60,v_blocks*v_exam.block_duration_minutes*60) end;
  v_timing_policy := case when p_mode<>'exam' then 'untimed_practice' when v_full_window then 'official_timing_window_capped_to_product_limit' else 'scaled_block_pacing' end;

  select count(*) into v_total from public.questions q
  left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
  where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or
      (p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null)) or
      (p_pool='answered' and coalesce(qs.attempts,0)>0) or
      (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts) or
      (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)));
  if v_total<p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,break_seconds_allowed,configuration,current_block,current_position)
  values(auth.uid(),p_exam_id,p_mode,p_question_count,v_time,v_break,
    jsonb_build_object('subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),'exam_code',v_exam.code,'pool',p_pool,'timing_policy',v_timing_policy,'timing_verified',v_exam.timing_verified,'timing_source',v_exam.timing_source,'product_question_cap',300),1,1)
  returning id into v_session;

  v_candidate_limit := greatest(p_question_count*8,240);

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    with base as (
      select q.id from public.questions q
      left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or
          (p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null)) or
          (p_pool='answered' and coalesce(qs.attempts,0)>0) or
          (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts) or
          (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)))
    ), sampled as (
      (select id from base where id>=v_anchor order by id limit v_candidate_limit)
      union all
      (select id from base where id<v_anchor order by id limit v_candidate_limit)
    ), ranked as (
      select id,row_number() over(order by md5(id::text||v_anchor::text),id)::int pos from sampled
    )
    select v_session,pos,ceil(pos::numeric/v_exam.block_max_items)::int,id from ranked where pos<=p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    with base as (
      select q.id,(
        case when p_pool='unseen' and coalesce(qs.attempts,0)=0 then 5000
          when p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null) then 4500
          when p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts then 4000
          when p_pool='answered' and coalesce(qs.attempts,0)>0 then 2500
          when p_pool='bookmarked' then 3000
          when coalesce(qs.attempts,0)=0 then 1000
          else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4 end
        + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end
      ) adaptive_score
      from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
        and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or
          (p_pool='unanswered' and exists(select 1 from public.study_session_items lsi where lsi.session_id=v_last_session and lsi.question_id=q.id and lsi.is_correct is null)) or
          (p_pool='answered' and coalesce(qs.attempts,0)>0) or
          (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts) or
          (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)))
    ), sampled as (
      (select id,adaptive_score from base where id>=v_anchor order by id limit v_candidate_limit)
      union all
      (select id,adaptive_score from base where id<v_anchor order by id limit v_candidate_limit)
    ), ranked as (
      select id,row_number() over(order by adaptive_score desc,md5(id::text||v_anchor::text),id)::int pos from sampled
    )
    select v_session,pos,ceil(pos::numeric/v_exam.block_max_items)::int,id from ranked where pos<=p_question_count;
  end if;

  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'pool',p_pool,'timing_policy',v_timing_policy));
  return query select v_session,v_time,v_blocks,v_exam.block_duration_minutes,v_exam.block_max_items,v_break;
end;
$$;
revoke all on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) from public,anon;
grant execute on function public.start_study_session(uuid,text[],text[],integer,public.study_session_mode,text) to authenticated;

-- Reconstruction sessions use the same bounded indexed sampling strategy.
create or replace function public.start_reconstruction_session(
  p_exam_id uuid,p_subjects text[] default '{}',p_topics text[] default '{}',p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice',p_pool text default 'mixed',p_reconstruction_year smallint default null
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer,break_seconds_allowed integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare v_exam record;v_session uuid;v_total bigint;v_anchor uuid:=gen_random_uuid();v_candidate_limit integer;v_blocks integer;v_break integer;v_time integer;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count<1 or p_question_count>300 then raise exception 'invalid_question_count'; end if;
  if p_reconstruction_year is null or p_reconstruction_year<1900 or p_reconstruction_year>2100 then raise exception 'reconstruction_year_required'; end if;
  if p_pool not in ('mixed','unseen','unanswered','incorrect','answered','bookmarked') then raise exception 'invalid_pool'; end if;
  select e.id,e.code,ep.* into v_exam from public.exams e join public.exam_profiles ep on ep.exam_id=e.id where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_mode='exam' and p_question_count>v_exam.max_items then raise exception 'exam_question_limit'; end if;
  v_blocks:=greatest(1,ceil(p_question_count::numeric/v_exam.block_max_items)::integer);
  v_break:=case when p_mode='exam' and p_question_count>=v_exam.max_items and v_exam.block_count>1 then v_exam.break_minutes*60 else 0 end;
  v_time:=case when p_mode='practice' then null when p_question_count>=v_exam.max_items then v_exam.total_duration_minutes*60 else v_blocks*v_exam.block_duration_minutes*60 end;

  select count(*) into v_total from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
  where q.exam_id=p_exam_id and q.is_reconstruction and q.reconstruction_year=p_reconstruction_year and q.is_published and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects))
    and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
    and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or
      (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct) or
      (p_pool='answered' and coalesce(qs.attempts,0)>0) or
      (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts) or
      (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)));
  if v_total<p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,break_seconds_allowed,configuration,current_block,current_position)
  values(auth.uid(),p_exam_id,p_mode,p_question_count,v_time,v_break,jsonb_build_object('subjects',to_jsonb(coalesce(p_subjects,'{}'::text[])),'topics',to_jsonb(coalesce(p_topics,'{}'::text[])),'exam_code',v_exam.code,'pool',p_pool,'reconstruction_year',p_reconstruction_year,'timing_policy',case when p_mode='exam' and p_question_count>=v_exam.max_items then 'official_full_exam_window' else 'scaled_block_pacing' end),1,1)
  returning id into v_session;
  v_candidate_limit:=greatest(p_question_count*8,240);

  if p_mode='exam' then
    insert into public.study_session_items(session_id,position,block_number,question_id)
    with base as (
      select q.id from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_reconstruction and q.reconstruction_year=p_reconstruction_year and q.is_published and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects)) and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct) or (p_pool='answered' and coalesce(qs.attempts,0)>0) or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts) or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)))
    ), sampled as (
      (select id from base where id>=v_anchor order by id limit v_candidate_limit)
      union all (select id from base where id<v_anchor order by id limit v_candidate_limit)
    ), ranked as (select id,row_number() over(order by md5(id::text||v_anchor::text),id)::int pos from sampled)
    select v_session,pos,ceil(pos::numeric/v_exam.block_max_items)::int,id from ranked where pos<=p_question_count;
  else
    insert into public.study_session_items(session_id,position,block_number,question_id)
    with base as (
      select q.id,(case when p_pool='unseen' and coalesce(qs.attempts,0)=0 then 5000 when p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct then 4500 when p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts then 4000 when p_pool='answered' and coalesce(qs.attempts,0)>0 then 2500 when p_pool='bookmarked' then 3000 when coalesce(qs.attempts,0)=0 then 1000 else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4 end)+case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end adaptive_score
      from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
      where q.exam_id=p_exam_id and q.is_reconstruction and q.reconstruction_year=p_reconstruction_year and q.is_published and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
        and (coalesce(array_length(p_subjects,1),0)=0 or q.subject=any(p_subjects)) and (coalesce(array_length(p_topics,1),0)=0 or q.topic=any(p_topics))
        and (p_pool='mixed' or (p_pool='unseen' and coalesce(qs.attempts,0)=0) or (p_pool='unanswered' and coalesce(qs.attempts,0)>0 and qs.attempts=qs.correct) or (p_pool='answered' and coalesce(qs.attempts,0)>0) or (p_pool='incorrect' and coalesce(qs.attempts,0)>0 and qs.correct<qs.attempts) or (p_pool='bookmarked' and exists(select 1 from public.question_bookmarks qb where qb.user_id=auth.uid() and qb.question_id=q.id)))
    ), sampled as (
      (select id,adaptive_score from base where id>=v_anchor order by id limit v_candidate_limit)
      union all
      (select id,adaptive_score from base where id<v_anchor order by id limit v_candidate_limit)
    ), ranked as (select id,row_number() over(order by adaptive_score desc,md5(id::text||v_anchor::text),id)::int pos from sampled)
    select v_session,pos,ceil(pos::numeric/v_exam.block_max_items)::int,id from ranked where pos<=p_question_count;
  end if;
  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'pool',p_pool,'reconstruction_year',p_reconstruction_year,'break_seconds_allowed',v_break));
  return query select v_session,v_time,case when p_mode='exam' then v_blocks else 1 end,v_exam.block_duration_minutes,v_exam.block_max_items,v_break;
end;
$$;
revoke all on function public.start_reconstruction_session(uuid,text[],text[],integer,public.study_session_mode,text,smallint) from public,anon;
grant execute on function public.start_reconstruction_session(uuid,text[],text[],integer,public.study_session_mode,text,smallint) to authenticated;
