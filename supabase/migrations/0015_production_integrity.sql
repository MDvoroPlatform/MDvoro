-- MDvoro Phase 15: production integrity and defense-in-depth.
-- Additive hardening: safe to apply after Phase 14.

-- Application users never need CREATE in the public schema. This also reduces
-- the attack surface of SECURITY DEFINER functions that use public as search_path.
revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;

-- Privileged admin paths must be MFA-backed even when a caller bypasses the
-- Next.js HTTP layer and invokes an allowed RPC directly through Supabase.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.id = auth.uid()
      and rp.permission_key = p_permission
      and (p.role <> 'admin' or (auth.jwt()->>'aal') = 'aal2')
  );
$$;
revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- The application uses get_next_question/get_question_for_learning as its
-- student delivery boundary. Do not expose the older public view through the Data API.
revoke all on public.question_public from anon;
revoke all on public.question_public from authenticated;

-- Internal defense-in-depth rate guard. It is intentionally not executable by
-- application callers; trigger functions invoke it with the caller's auth.uid().
create or replace function public.guard_authenticated_write_rate(
  p_action text, p_limit integer, p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_hits integer;
  v_now timestamptz := now();
begin
  if v_user is null then return true; end if;
  if p_action is null or p_action !~ '^[a-z_]+$' then return false; end if;
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 3600 then return false; end if;
  v_key := v_user::text || ':db:' || p_action;
  insert into public.rate_limit_buckets(bucket_key,window_started,hits)
  values(v_key,v_now,1)
  on conflict(bucket_key) do update set
    window_started = case
      when public.rate_limit_buckets.window_started <= v_now - make_interval(secs=>p_window_seconds) then v_now
      else public.rate_limit_buckets.window_started
    end,
    hits = case
      when public.rate_limit_buckets.window_started <= v_now - make_interval(secs=>p_window_seconds) then 1
      else public.rate_limit_buckets.hits + 1
    end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.guard_authenticated_write_rate(text,integer,integer) from public;

create or replace function public.guard_write_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_limit integer;
  v_window integer;
begin
  if auth.uid() is null then return new; end if;
  v_action := case TG_TABLE_NAME
    when 'question_attempts' then 'question_attempts'
    when 'flashcards' then 'flashcards_create'
    when 'flashcard_decks' then 'flashcard_decks_create'
    when 'study_plans' then 'study_plans_write'
    when 'content_generation_jobs' then 'ai_generation_jobs'
    else TG_TABLE_NAME
  end;
  v_limit := case v_action
    when 'question_attempts' then 240
    when 'flashcards_create' then 180
    when 'flashcard_decks_create' then 60
    when 'study_plans_write' then 30
    when 'ai_generation_jobs' then 60
    else 120
  end;
  v_window := case v_action
    when 'study_plans_write' then 60
    else 60
  end;
  if not public.guard_authenticated_write_rate(v_action,v_limit,v_window) then
    raise exception 'rate_limited';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_write_trigger() from public;

drop trigger if exists guard_question_attempts_write on public.question_attempts;
create trigger guard_question_attempts_write before insert on public.question_attempts
for each row execute function public.guard_write_trigger();

drop trigger if exists guard_flashcards_create on public.flashcards;
create trigger guard_flashcards_create before insert on public.flashcards
for each row execute function public.guard_write_trigger();

drop trigger if exists guard_flashcard_decks_create on public.flashcard_decks;
create trigger guard_flashcard_decks_create before insert on public.flashcard_decks
for each row execute function public.guard_write_trigger();

drop trigger if exists guard_study_plans_write on public.study_plans;
create trigger guard_study_plans_write before insert or update on public.study_plans
for each row execute function public.guard_write_trigger();

drop trigger if exists guard_ai_generation_jobs on public.content_generation_jobs;
create trigger guard_ai_generation_jobs before insert on public.content_generation_jobs
for each row execute function public.guard_write_trigger();
