-- MDvoro Flashcard Engine v2: adaptive spaced repetition, retention goals,
-- source traceability, suspension, and server-authoritative review scheduling.

alter table public.flashcards
  add column if not exists card_type text not null default 'basic' check (card_type in ('basic','cloze','image_occlusion','clinical','rapid_recall')),
  add column if not exists tags text[] not null default '{}',
  add column if not exists source_question_id uuid references public.questions(id) on delete set null,
  add column if not exists knowledge_id uuid references public.knowledge_cards(id) on delete set null,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists lapse_count integer not null default 0 check (lapse_count >= 0),
  add column if not exists learning_step smallint not null default 0 check (learning_step >= 0),
  add column if not exists stability_days numeric(10,2) not null default 0 check (stability_days >= 0),
  add column if not exists difficulty numeric(5,2) not null default 5 check (difficulty between 1 and 10),
  add column if not exists desired_retention numeric(4,3) not null default 0.90 check (desired_retention between 0.70 and 0.99),
  add column if not exists suspended boolean not null default false;

create index if not exists flashcards_owner_active_due_idx on public.flashcards(owner_id, suspended, due_at);
create index if not exists flashcards_owner_deck_due_idx on public.flashcards(owner_id, deck_id, due_at);
create index if not exists flashcards_source_question_idx on public.flashcards(source_question_id);

create or replace function public.review_flashcard(
  p_flashcard_id uuid,
  p_rating smallint,
  p_duration_ms integer default null
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
language plpgsql security definer set search_path = public
as $$
declare
  v_card public.flashcards%rowtype;
  v_interval numeric(10,2);
  v_ease numeric(5,2);
  v_reps integer;
  v_lapses integer;
  v_stability numeric(10,2);
  v_difficulty numeric(5,2);
  v_due timestamptz;
  v_bucket text;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_rating < 0 or p_rating > 4 then raise exception 'invalid_rating'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;

  select * into v_card
  from public.flashcards
  where id = p_flashcard_id and owner_id = v_user
  for update;

  if not found then raise exception 'card_not_found'; end if;
  if v_card.suspended then raise exception 'card_suspended'; end if;

  v_interval := greatest(v_card.interval_days, 0);
  v_ease := v_card.ease_factor;
  v_reps := v_card.repetitions;
  v_lapses := v_card.lapse_count;
  v_stability := v_card.stability_days;
  v_difficulty := v_card.difficulty;

  if p_rating = 0 then
    -- Again: relearning step. Preserve a small memory trace while forcing near-term retrieval.
    v_lapses := v_lapses + 1;
    v_reps := 0;
    v_stability := greatest(0.5, v_stability * 0.55);
    v_difficulty := least(10, v_difficulty + 0.8);
    v_ease := greatest(1.30, v_ease - 0.20);
    v_interval := 0.04; -- ~1 hour
    v_due := now() + interval '1 hour';
    v_bucket := 'again';
  elsif p_rating = 1 then
    -- Hard: short but meaningful growth.
    v_reps := v_reps + 1;
    v_difficulty := least(10, v_difficulty + 0.25);
    v_ease := greatest(1.30, v_ease - 0.10);
    v_stability := greatest(1, v_stability * 1.35 + 0.5);
    v_interval := greatest(0.08, v_stability * 0.55);
    v_due := now() + make_interval(secs => greatest(3600, round(v_interval * 86400)::integer));
    v_bucket := 'hard';
  elsif p_rating = 2 then
    -- Good: default adaptive progression.
    v_reps := v_reps + 1;
    v_stability := greatest(1, v_stability * (1.85 + (10 - v_difficulty) * 0.035) + 0.75);
    v_interval := least(3650, greatest(0.17, v_stability));
    v_due := now() + make_interval(secs => greatest(3600, round(v_interval * 86400)::integer));
    v_bucket := 'good';
  else
    -- Easy/Perfect: reward clean retrieval without allowing runaway intervals.
    v_reps := v_reps + 1;
    v_difficulty := greatest(1, v_difficulty - 0.35);
    v_ease := least(4.0, v_ease + 0.10);
    v_stability := greatest(1, v_stability * 2.65 + 1.25);
    v_interval := least(3650, greatest(0.5, v_stability * 1.15));
    v_due := now() + make_interval(secs => greatest(3600, round(v_interval * 86400)::integer));
    v_bucket := 'easy';
  end if;

  update public.flashcards
  set due_at = v_due,
      interval_days = round(v_interval, 2),
      ease_factor = round(v_ease, 2),
      repetitions = v_reps,
      lapse_count = v_lapses,
      stability_days = round(v_stability, 2),
      difficulty = round(v_difficulty, 2),
      last_reviewed_at = now(),
      updated_at = now()
  where id = v_card.id;

  insert into public.flashcard_reviews(user_id, flashcard_id, rating, duration_ms)
  values (v_user, v_card.id, p_rating, p_duration_ms);

  return query select v_card.id, v_due, round(v_interval,2), round(v_ease,2), v_reps,
    v_lapses, round(v_stability,2), round(v_difficulty,2), v_bucket;
end;
$$;

revoke all on function public.review_flashcard(uuid, smallint, integer) from public;
grant execute on function public.review_flashcard(uuid, smallint, integer) to authenticated;

create or replace function public.flashcard_review_queue(p_limit integer default 30)
returns table(
  id uuid,
  deck_id uuid,
  front text,
  back text,
  card_type text,
  tags text[],
  due_at timestamptz,
  interval_days numeric,
  difficulty numeric,
  source_question_id uuid,
  knowledge_id uuid
)
language sql stable security invoker
as $$
  select f.id, f.deck_id, f.front, f.back, f.card_type, f.tags, f.due_at,
         f.interval_days, f.difficulty, f.source_question_id, f.knowledge_id
  from public.flashcards f
  where f.owner_id = auth.uid()
    and f.suspended = false
    and f.due_at <= now()
  order by f.due_at asc, f.difficulty desc, f.created_at asc
  limit greatest(1, least(coalesce(p_limit,30), 100));
$$;

grant execute on function public.flashcard_review_queue(integer) to authenticated;

create or replace function public.flashcard_dashboard_stats()
returns table(
  total_cards bigint,
  due_now bigint,
  reviewed_today bigint,
  mastered bigint,
  learning bigint,
  suspended bigint,
  average_difficulty numeric,
  retention_30d numeric
)
language sql stable security invoker
as $$
  with owned as (
    select * from public.flashcards where owner_id = auth.uid()
  ),
  reviews as (
    select * from public.flashcard_reviews where user_id = auth.uid() and reviewed_at >= now() - interval '30 days'
  )
  select
    (select count(*) from owned),
    (select count(*) from owned where suspended = false and due_at <= now()),
    (select count(*) from reviews where reviewed_at >= date_trunc('day', now())),
    (select count(*) from owned where repetitions >= 5 and interval_days >= 21),
    (select count(*) from owned where repetitions < 5 and suspended = false),
    (select count(*) from owned where suspended = true),
    coalesce((select round(avg(difficulty),2) from owned),0),
    coalesce((select round(100.0 * avg(case when rating >= 2 then 1 else 0 end),1) from reviews),0);
$$;

grant execute on function public.flashcard_dashboard_stats() to authenticated;
