-- Phase 32: privacy-safe competitive leaderboard.
-- Students may opt out of public display. The leaderboard exposes aggregate study metrics only.

alter table public.profiles
  add column if not exists leaderboard_visible boolean not null default true;

create index if not exists question_attempts_leaderboard_idx
  on public.question_attempts(user_id, created_at desc)
  where is_correct is not null;

create or replace function public.set_leaderboard_visibility(p_visible boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.profiles set leaderboard_visible=coalesce(p_visible,true), updated_at=now() where id=auth.uid();
  return coalesce(p_visible,true);
end;
$$;
revoke all on function public.set_leaderboard_visibility(boolean) from public, anon;
grant execute on function public.set_leaderboard_visibility(boolean) to authenticated;

create or replace function public.my_leaderboard_visibility()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select leaderboard_visible from public.profiles where id=auth.uid()),true);
$$;
revoke all on function public.my_leaderboard_visibility() from public, anon;
grant execute on function public.my_leaderboard_visibility() to authenticated;

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
  with windowed as (
    select
      qa.user_id,
      qa.is_correct,
      qa.created_at,
      case
        when p_period='week' then now()-interval '7 days'
        when p_period='month' then now()-interval '30 days'
        else '-infinity'::timestamptz
      end as period_start
    from public.question_attempts qa
    join public.questions q on q.id=qa.question_id
    join public.profiles p on p.id=qa.user_id and p.leaderboard_visible=true
    where q.exam_id=p_exam_id
      and qa.is_correct is not null
      and qa.created_at >= case
        when p_period='week' then now()-interval '7 days'
        when p_period='month' then now()-interval '30 days'
        else '-infinity'::timestamptz
      end
  ),
  grouped as (
    select
      w.user_id,
      count(*)::bigint as questions_solved,
      count(*) filter(where w.is_correct=true)::bigint as correct_answers,
      round(count(*) filter(where w.is_correct=true)::numeric/nullif(count(*),0)*100,1) as accuracy,
      count(distinct (w.created_at at time zone 'UTC')::date)::bigint as study_days,
      (count(*)*2 + count(*) filter(where w.is_correct=true)*3 + count(distinct (w.created_at at time zone 'UTC')::date)*5)::bigint as xp_score
    from windowed w
    group by w.user_id
    having count(*) >= 5
  ),
  ranked as (
    select
      g.*,
      row_number() over(order by
        case when p_metric='accuracy' then g.accuracy else null end desc nulls last,
        case when p_metric='xp' then g.xp_score else null end desc nulls last,
        case when p_metric='days' then g.study_days else null end desc nulls last,
        case when p_metric='questions' or p_metric not in ('accuracy','xp','days') then g.questions_solved else null end desc nulls last,
        g.correct_answers desc,
        g.user_id
      )::integer as rank
    from grouped g
  )
  select
    r.rank,
    case
      when p.leaderboard_visible=false then 'Anonymous student'
      else coalesce(nullif(trim(p.full_name),''),'MDvoro student')
    end as display_name,
    r.questions_solved,
    r.correct_answers,
    r.accuracy,
    r.study_days,
    r.xp_score,
    (r.user_id=auth.uid()) as is_me
  from ranked r
  join public.profiles p on p.id=r.user_id
  where r.rank <= greatest(1,least(coalesce(p_limit,50),100))
  order by r.rank;
$$;
revoke all on function public.public_leaderboard(uuid,text,text,integer) from public, anon;
grant execute on function public.public_leaderboard(uuid,text,text,integer) to authenticated;
