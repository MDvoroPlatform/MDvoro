-- Private learner feedback and a permission-gated editorial issue queue.
create table if not exists public.qbank_question_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,question_id)
);
create index if not exists qbank_question_ratings_question_idx on public.qbank_question_ratings(question_id);
drop trigger if exists qbank_question_ratings_updated_at on public.qbank_question_ratings;
create trigger qbank_question_ratings_updated_at before update on public.qbank_question_ratings
for each row execute function public.set_updated_at();

create table if not exists public.qbank_question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  category text not null check (category in ('incorrect_answer','typo','unclear','outdated','other')),
  message text not null default '' check (char_length(message) <= 2000),
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  reported_at timestamptz not null default now(),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz
);
create index if not exists qbank_question_reports_status_date_idx on public.qbank_question_reports(status,reported_at desc);
create index if not exists qbank_question_reports_owner_idx on public.qbank_question_reports(user_id,reported_at desc);

alter table public.qbank_question_ratings enable row level security;
alter table public.qbank_question_reports enable row level security;
revoke all on public.qbank_question_ratings,public.qbank_question_reports from anon,authenticated;
grant select,insert,update on public.qbank_question_ratings to authenticated;
grant select,insert on public.qbank_question_reports to authenticated;

drop policy if exists qbank_ratings_read_own on public.qbank_question_ratings;
create policy qbank_ratings_read_own on public.qbank_question_ratings for select to authenticated
using(user_id=auth.uid());
drop policy if exists qbank_ratings_write_own on public.qbank_question_ratings;
create policy qbank_ratings_write_own on public.qbank_question_ratings for insert to authenticated
with check(user_id=auth.uid() and exists(select 1 from public.questions q where q.id=question_id and q.is_published and q.workflow_status='published' and (q.access_tier='free' or public.has_active_subscription())));
drop policy if exists qbank_ratings_update_own on public.qbank_question_ratings;
create policy qbank_ratings_update_own on public.qbank_question_ratings for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists qbank_reports_read_own on public.qbank_question_reports;
create policy qbank_reports_read_own on public.qbank_question_reports for select to authenticated
using(user_id=auth.uid());
drop policy if exists qbank_reports_insert_own on public.qbank_question_reports;
create policy qbank_reports_insert_own on public.qbank_question_reports for insert to authenticated
with check(user_id=auth.uid() and exists(select 1 from public.questions q where q.id=question_id and q.is_published and q.workflow_status='published' and (q.access_tier='free' or public.has_active_subscription())));

create or replace function public.admin_list_qbank_question_reports(p_status text default 'open',p_limit integer default 100)
returns table(id uuid,question_id uuid,content_code text,subject text,topic text,stem text,category text,message text,status text,reported_at timestamptz,resolution_note text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_permission('content.read') then raise exception 'forbidden'; end if;
  if p_status not in ('open','in_review','resolved','dismissed','all') then raise exception 'invalid_status'; end if;
  if p_limit<1 or p_limit>200 then raise exception 'invalid_limit'; end if;
  return query select r.id,q.id,q.content_code,q.subject,q.topic,q.stem,r.category,r.message,r.status,r.reported_at,r.resolution_note
    from public.qbank_question_reports r join public.questions q on q.id=r.question_id
    where p_status='all' or r.status=p_status order by r.reported_at desc limit p_limit;
end;
$$;
revoke all on function public.admin_list_qbank_question_reports(text,integer) from public,anon;
grant execute on function public.admin_list_qbank_question_reports(text,integer) to authenticated;

create or replace function public.admin_update_qbank_question_report(p_report_id uuid,p_status text,p_note text default null)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_question_id uuid;
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  if p_status not in ('open','in_review','resolved','dismissed') then raise exception 'invalid_status'; end if;
  if p_note is not null and char_length(p_note)>2000 then raise exception 'note_too_long'; end if;
  update public.qbank_question_reports set status=p_status,resolution_note=nullif(trim(coalesce(p_note,'')),''),
    resolved_by=case when p_status in ('resolved','dismissed') then auth.uid() else null end,
    resolved_at=case when p_status in ('resolved','dismissed') then now() else null end
    where id=p_report_id returning question_id into v_question_id;
  if v_question_id is null then raise exception 'report_not_found'; end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'qbank_question_report',p_report_id,'updated',jsonb_build_object('status',p_status,'question_id',v_question_id));
end;
$$;
revoke all on function public.admin_update_qbank_question_report(uuid,text,text) from public,anon;
grant execute on function public.admin_update_qbank_question_report(uuid,text,text) to authenticated;

-- Extend the existing allowlist with a dedicated feedback bucket.
create or replace function public.consume_rate_limit(p_action text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_key text; v_hits integer; v_started timestamptz; v_now timestamptz:=now();
begin
  if auth.uid() is null then return false; end if;
  if p_action is null or p_action not in ('qbank_answer','qbank_next','qbank_catalog','qbank_break','qbank_annotation','qbank_feedback','flashcard_review','flashcard_delete','admin_write','admin_upload','auth_mutation') then return false; end if;
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
