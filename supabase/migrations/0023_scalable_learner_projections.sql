-- MDvoro scalable learner projections.
-- Keeps learner-facing selection and analytics fast as raw attempt history grows.
-- Source of truth remains question_attempts/flashcard_reviews; these are rebuildable projections.

create table if not exists public.learner_question_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0),
  duration_sum_ms bigint not null default 0 check (duration_sum_ms >= 0),
  duration_count integer not null default 0 check (duration_count >= 0),
  confidence_sum integer not null default 0 check (confidence_sum >= 0),
  confidence_count integer not null default 0 check (confidence_count >= 0),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id),
  check (correct <= attempts),
  check (duration_count <= attempts),
  check (confidence_count <= attempts)
);

create index if not exists learner_question_stats_user_last_idx
  on public.learner_question_stats(user_id,last_attempt_at desc);

create table if not exists public.learner_taxonomy_mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  taxonomy_id uuid not null references public.taxonomy_nodes(id) on delete cascade,
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0),
  duration_sum_ms bigint not null default 0 check (duration_sum_ms >= 0),
  duration_count integer not null default 0 check (duration_count >= 0),
  confidence_sum integer not null default 0 check (confidence_sum >= 0),
  confidence_count integer not null default 0 check (confidence_count >= 0),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id,taxonomy_id),
  check (correct <= attempts),
  check (duration_count <= attempts),
  check (confidence_count <= attempts)
);

create index if not exists learner_taxonomy_mastery_user_accuracy_idx
  on public.learner_taxonomy_mastery(user_id,attempts,correct,last_attempt_at desc);

alter table public.learner_question_stats enable row level security;
alter table public.learner_taxonomy_mastery enable row level security;
revoke all on public.learner_question_stats from anon,authenticated;
revoke all on public.learner_taxonomy_mastery from anon,authenticated;

-- Rebuildable projection writer. It is not directly executable by application roles.
create or replace function public.project_question_attempt()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_duration bigint := coalesce(new.duration_ms,0);
  v_confidence integer := coalesce(new.confidence,0);
  v_has_duration boolean := new.duration_ms is not null and new.duration_ms > 0;
  v_has_confidence boolean := new.confidence is not null;
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
    attempts=learner_question_stats.attempts+1,
    correct=learner_question_stats.correct+case when new.is_correct then 1 else 0 end,
    duration_sum_ms=learner_question_stats.duration_sum_ms+v_duration,
    duration_count=learner_question_stats.duration_count+case when v_has_duration then 1 else 0 end,
    confidence_sum=learner_question_stats.confidence_sum+v_confidence,
    confidence_count=learner_question_stats.confidence_count+case when v_has_confidence then 1 else 0 end,
    first_attempt_at=least(learner_question_stats.first_attempt_at,new.created_at),
    last_attempt_at=greatest(learner_question_stats.last_attempt_at,new.created_at),
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
    attempts=learner_taxonomy_mastery.attempts+1,
    correct=learner_taxonomy_mastery.correct+case when new.is_correct then 1 else 0 end,
    duration_sum_ms=learner_taxonomy_mastery.duration_sum_ms+v_duration,
    duration_count=learner_taxonomy_mastery.duration_count+case when v_has_duration then 1 else 0 end,
    confidence_sum=learner_taxonomy_mastery.confidence_sum+v_confidence,
    confidence_count=learner_taxonomy_mastery.confidence_count+case when v_has_confidence then 1 else 0 end,
    first_attempt_at=least(learner_taxonomy_mastery.first_attempt_at,new.created_at),
    last_attempt_at=greatest(learner_taxonomy_mastery.last_attempt_at,new.created_at),
    updated_at=now();

  return new;
end;
$$;
revoke all on function public.project_question_attempt() from public,anon,authenticated;
alter function public.project_question_attempt() set search_path = '';

drop trigger if exists learner_question_projection on public.question_attempts;
create trigger learner_question_projection
after insert on public.question_attempts
for each row execute function public.project_question_attempt();

-- Backfill projections exactly once for existing history. Upserts make it safe to rerun
-- during a deployment rehearsal after truncating/rebuilding projection tables.
insert into public.learner_question_stats(
  user_id,question_id,attempts,correct,duration_sum_ms,duration_count,
  confidence_sum,confidence_count,first_attempt_at,last_attempt_at,updated_at
)
select a.user_id,a.question_id,count(*)::int,
  sum(case when a.is_correct then 1 else 0 end)::int,
  coalesce(sum(a.duration_ms) filter (where a.duration_ms is not null and a.duration_ms>0),0)::bigint,
  count(a.duration_ms) filter (where a.duration_ms is not null and a.duration_ms>0)::int,
  coalesce(sum(a.confidence) filter (where a.confidence is not null),0)::int,
  count(a.confidence) filter (where a.confidence is not null)::int,
  min(a.created_at),max(a.created_at),now()
from public.question_attempts a
group by a.user_id,a.question_id
on conflict (user_id,question_id) do update set
  attempts=excluded.attempts,correct=excluded.correct,duration_sum_ms=excluded.duration_sum_ms,
  duration_count=excluded.duration_count,confidence_sum=excluded.confidence_sum,
  confidence_count=excluded.confidence_count,first_attempt_at=excluded.first_attempt_at,
  last_attempt_at=excluded.last_attempt_at,updated_at=now();

insert into public.learner_taxonomy_mastery(
  user_id,taxonomy_id,attempts,correct,duration_sum_ms,duration_count,
  confidence_sum,confidence_count,first_attempt_at,last_attempt_at,updated_at
)
select a.user_id,qt.taxonomy_id,count(*)::int,
  sum(case when a.is_correct then 1 else 0 end)::int,
  coalesce(sum(a.duration_ms) filter (where a.duration_ms is not null and a.duration_ms>0),0)::bigint,
  count(a.duration_ms) filter (where a.duration_ms is not null and a.duration_ms>0)::int,
  coalesce(sum(a.confidence) filter (where a.confidence is not null),0)::int,
  count(a.confidence) filter (where a.confidence is not null)::int,
  min(a.created_at),max(a.created_at),now()
from public.question_attempts a
join public.question_taxonomy qt on qt.question_id=a.question_id
group by a.user_id,qt.taxonomy_id
on conflict (user_id,taxonomy_id) do update set
  attempts=excluded.attempts,correct=excluded.correct,duration_sum_ms=excluded.duration_sum_ms,
  duration_count=excluded.duration_count,confidence_sum=excluded.confidence_sum,
  confidence_count=excluded.confidence_count,first_attempt_at=excluded.first_attempt_at,
  last_attempt_at=excluded.last_attempt_at,updated_at=now();

-- Faster adaptive delivery: candidate scoring uses projections instead of repeated raw-history scans.
create or replace function public.get_next_question(
  p_exam_id uuid default null,
  p_subject text default null,
  p_topic text default null
)
returns table(
  id uuid,content_code text,exam_id uuid,stem text,subject text,topic text,
  options jsonb,difficulty smallint,media jsonb
)
language sql stable security definer set search_path = ''
as $$
with candidates_base as (
  select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.difficulty,q.updated_at,
    coalesce(qs.attempts,0) as attempts,
    coalesce(qs.correct::numeric/nullif(qs.attempts,0),0.5) as accuracy,
    coalesce(qs.last_attempt_at,timestamptz 'epoch') as last_seen
  from public.questions q
  left join public.learner_question_stats qs on qs.question_id=q.id and qs.user_id=(select auth.uid())
  where q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription())
    and (p_exam_id is null or q.exam_id=p_exam_id)
    and (p_subject is null or p_subject='' or q.subject=p_subject)
    and (p_topic is null or p_topic='' or q.topic=p_topic)
),
taxonomy_scores as (
  select qt.question_id,
    min(case when lm.attempts is null or lm.attempts=0 then 1.0 else lm.correct::numeric/lm.attempts end) as weakest_accuracy
  from public.question_taxonomy qt
  join candidates_base cb on cb.id=qt.question_id
  left join public.learner_taxonomy_mastery lm
    on lm.taxonomy_id=qt.taxonomy_id and lm.user_id=(select auth.uid())
  group by qt.question_id
),
candidates as (
  select cb.*,coalesce(ts.weakest_accuracy,1.0) as weakest_taxonomy_accuracy
  from candidates_base cb left join taxonomy_scores ts on ts.question_id=cb.id
),
picked as (
  select * from candidates
  order by attempts asc,weakest_taxonomy_accuracy asc,accuracy asc,last_seen asc,difficulty desc,updated_at desc
  limit 1
)
select p.id,p.content_code,p.exam_id,p.stem,p.subject,p.topic,p.options,p.difficulty,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'kind',m.kind,'student_alt_text',coalesce(m.student_alt_text,'Medical image'),
    'external_url',m.external_url,'storage_path',m.storage_path,'caption',qm.caption,'position',qm.position
  ) order by qm.position)
  from public.question_media qm join public.media_assets m on m.id=qm.media_id
  where qm.question_id=p.id),'[]'::jsonb)
from picked p;
$$;
revoke all on function public.get_next_question(uuid,text,text) from public,anon;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;
alter function public.get_next_question(uuid,text,text) set search_path = '';
