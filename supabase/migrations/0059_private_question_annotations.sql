-- Private, passage-level question annotations. Anchors are plain-text ranges and
-- context; the client renders marks without inserting user content as HTML.
create table if not exists public.question_annotations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  segment_key text not null check (segment_key ~ '^(stem|explanation|key_learning_point|option:[A-Z])$'),
  quote text not null check (char_length(quote) between 1 and 2000),
  prefix text not null default '' check (char_length(prefix) <= 80),
  suffix text not null default '' check (char_length(suffix) <= 80),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  color text not null check (color in ('yellow','green','blue','pink','orange')),
  note text check (note is null or char_length(note) <= 1000),
  anchor_version smallint not null default 1 check (anchor_version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists question_annotations_owner_question_idx
  on public.question_annotations(user_id,question_id,segment_key,start_offset);
drop trigger if exists question_annotations_updated_at on public.question_annotations;
create trigger question_annotations_updated_at
  before update on public.question_annotations
  for each row execute function public.set_updated_at();

alter table public.question_annotations enable row level security;
revoke all on public.question_annotations from anon,authenticated;
grant select,insert,update,delete on public.question_annotations to authenticated;
drop policy if exists question_annotations_read_own on public.question_annotations;
create policy question_annotations_read_own on public.question_annotations
  for select to authenticated using (user_id=auth.uid());
drop policy if exists question_annotations_insert_own on public.question_annotations;
create policy question_annotations_insert_own on public.question_annotations
  for insert to authenticated with check (
    user_id=auth.uid() and exists(
      select 1 from public.questions q
      where q.id=question_id and q.is_published and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
    )
  );
drop policy if exists question_annotations_update_own on public.question_annotations;
create policy question_annotations_update_own on public.question_annotations
  for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists question_annotations_delete_own on public.question_annotations;
create policy question_annotations_delete_own on public.question_annotations
  for delete to authenticated using (user_id=auth.uid());

-- Passage annotation writes have a dedicated per-user rate-limit bucket.
create or replace function public.consume_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_key text; v_hits integer; v_started timestamptz; v_now timestamptz:=now();
begin
  if auth.uid() is null then return false; end if;
  if p_action is null or p_action not in (
    'qbank_answer','qbank_next','qbank_catalog','qbank_break','qbank_annotation',
    'flashcard_review','flashcard_delete','admin_write','admin_upload','auth_mutation'
  ) then return false; end if;
  if p_limit<1 or p_limit>10000 or p_window_seconds<1 or p_window_seconds>3600 then return false; end if;
  v_key:=auth.uid()::text||':'||p_action;
  insert into public.rate_limit_buckets(bucket_key,window_started,hits) values(v_key,v_now,1)
  on conflict(bucket_key) do update set
    window_started=case when public.rate_limit_buckets.window_started<=v_now-make_interval(secs=>p_window_seconds) then v_now else public.rate_limit_buckets.window_started end,
    hits=case when public.rate_limit_buckets.window_started<=v_now-make_interval(secs=>p_window_seconds) then 1 else public.rate_limit_buckets.hits+1 end
  returning hits,window_started into v_hits,v_started;
  return v_hits<=p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon;
grant execute on function public.consume_rate_limit(text,integer,integer) to authenticated;
