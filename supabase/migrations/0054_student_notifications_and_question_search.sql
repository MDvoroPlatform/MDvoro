create extension if not exists pg_trgm with schema extensions;

create table if not exists public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists admin_announcements_created_idx
  on public.admin_announcements(created_at desc) where active;

create table if not exists public.user_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null check (char_length(notification_key) between 1 and 120),
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

alter table public.admin_announcements enable row level security;
alter table public.user_notification_reads enable row level security;
revoke all on public.admin_announcements from anon, authenticated;
revoke all on public.user_notification_reads from anon, authenticated;

create or replace function public.admin_send_announcement(p_title text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('platform.users') then raise exception 'forbidden'; end if;
  if nullif(trim(p_title), '') is null or char_length(trim(p_title)) > 120 then raise exception 'invalid_title'; end if;
  if nullif(trim(p_message), '') is null or char_length(trim(p_message)) > 2000 then raise exception 'invalid_message'; end if;

  insert into public.admin_announcements(title, message, created_by)
  values (trim(p_title), trim(p_message), auth.uid())
  returning id into v_id;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values(auth.uid(), 'announcement', v_id, 'admin_announcement_sent', jsonb_build_object('title', trim(p_title)));
  return v_id;
end;
$$;
revoke all on function public.admin_send_announcement(text, text) from public, anon;
grant execute on function public.admin_send_announcement(text, text) to authenticated;

create or replace function public.my_notifications()
returns table(
  notification_key text,
  kind text,
  title text,
  message text,
  created_at timestamptz,
  read_at timestamptz,
  subscription_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select s.current_period_end
    from public.subscriptions s
    where s.user_id = auth.uid()
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_end desc nulls first
    limit 1
  ), feed as (
    select ('announcement:' || a.id::text) as notification_key,
           'announcement'::text as kind, a.title, a.message, a.created_at,
           null::timestamptz as subscription_until
    from public.admin_announcements a
    where auth.uid() is not null and a.active and a.created_at >= coalesce(
      (select p.created_at from public.profiles p where p.id = auth.uid()), now()
    )
    union all
    select ('subscription-expiring:' || to_char(m.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
           'subscription_expiring'::text, ''::text, ''::text, now(), m.current_period_end
    from mine m
    where m.current_period_end is not null
      and m.current_period_end <= now() + interval '7 days'
  )
  select f.notification_key, f.kind, f.title, f.message, f.created_at,
         r.read_at, f.subscription_until
  from feed f
  left join public.user_notification_reads r
    on r.user_id = auth.uid() and r.notification_key = f.notification_key
  order by f.created_at desc
  limit 50;
$$;
revoke all on function public.my_notifications() from public, anon;
grant execute on function public.my_notifications() to authenticated;

create or replace function public.mark_my_notification_read(p_notification_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_notification_key is null or char_length(p_notification_key) > 120 then
    raise exception 'invalid_notification';
  end if;
  if p_notification_key like 'announcement:%' then
    if not exists (
      select 1 from public.admin_announcements a
      where a.id::text = substring(p_notification_key from 14) and a.active
        and a.created_at >= coalesce((select p.created_at from public.profiles p where p.id = auth.uid()), now())
    ) then raise exception 'notification_not_found'; end if;
  elsif p_notification_key like 'subscription-expiring:%' then
    if not exists (
      select 1 from public.subscriptions s
      where s.user_id = auth.uid() and s.status in ('trialing', 'active')
        and s.current_period_end is not null and s.current_period_end > now()
        and s.current_period_end <= now() + interval '7 days'
        and ('subscription-expiring:' || to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) = p_notification_key
    ) then raise exception 'notification_not_found'; end if;
  else
    raise exception 'notification_not_found';
  end if;

  insert into public.user_notification_reads(user_id, notification_key)
  values(auth.uid(), p_notification_key)
  on conflict (user_id, notification_key) do update set read_at = excluded.read_at;
end;
$$;
revoke all on function public.mark_my_notification_read(text) from public, anon;
grant execute on function public.mark_my_notification_read(text) to authenticated;

create or replace function public.my_subscription_status()
returns table(is_active boolean, subscription_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid() and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  ), (
    select max(s.current_period_end) from public.subscriptions s
    where s.user_id = auth.uid() and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
revoke all on function public.my_subscription_status() from public, anon;
grant execute on function public.my_subscription_status() to authenticated;

create or replace function public.student_search_questions(p_query text, p_limit integer default 15)
returns table(id uuid, content_code text, stem text, subject text, topic text, exam_code text, exam_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with query_value as (
    select lower(regexp_replace(trim(coalesce(p_query, '')), '[^[:alnum:]]', '', 'g')) as normalized,
           trim(coalesce(p_query, '')) as raw
  ), active_exam as (
    select p.active_exam_id from public.profiles p where p.id = auth.uid()
  )
  select q.id, q.content_code, q.stem, q.subject, q.topic, e.code, e.name
  from public.questions q
  join public.exams e on e.id = q.exam_id
  cross join query_value v
  where auth.uid() is not null
    and char_length(v.normalized) >= 4
    and q.is_published = true and q.workflow_status = 'published'
    and (q.access_tier = 'free' or public.has_active_subscription())
    and (not exists(select 1 from active_exam where active_exam_id is not null)
      or q.exam_id = (select active_exam_id from active_exam limit 1))
    and (
      q.stem ilike '%' || v.raw || '%'
      or coalesce(q.explanation, '') ilike '%' || v.raw || '%'
      or coalesce(q.topic, '') ilike '%' || v.raw || '%'
      or coalesce(q.subject, '') ilike '%' || v.raw || '%'
      or coalesce(q.content_code, '') ilike '%' || v.raw || '%'
      or extensions.word_similarity(v.normalized,
          lower(regexp_replace(coalesce(q.stem, '') || ' ' || coalesce(q.explanation, '') || ' ' || coalesce(q.topic, ''), '[^[:alnum:]]', '', 'g'))
        ) >= 0.28
    )
  order by case when q.stem ilike '%' || v.raw || '%' then 0 else 1 end,
    extensions.word_similarity(v.normalized,
      lower(regexp_replace(coalesce(q.stem, '') || ' ' || coalesce(q.explanation, '') || ' ' || coalesce(q.topic, ''), '[^[:alnum:]]', '', 'g'))
    ) desc,
    q.updated_at desc
  limit least(greatest(coalesce(p_limit, 15), 1), 30);
$$;
revoke all on function public.student_search_questions(text, integer) from public, anon;
grant execute on function public.student_search_questions(text, integer) to authenticated;
