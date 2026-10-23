-- Manual access grants for future paid plans and audited question deletion.
create unique index if not exists subscriptions_manual_admin_user_idx
  on public.subscriptions(user_id)
  where provider = 'manual_admin';

create or replace function public.admin_set_manual_subscription(
  p_user_id uuid,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('platform.users') then raise exception 'forbidden'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'invalid_expiration'; end if;
  if not exists(select 1 from auth.users where id = p_user_id) then raise exception 'user_not_found'; end if;

  insert into public.subscriptions(user_id, status, provider, current_period_end)
  values(p_user_id, 'active', 'manual_admin', p_expires_at)
  on conflict (user_id) where provider = 'manual_admin'
  do update set status = 'active', current_period_end = excluded.current_period_end, updated_at = now();

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values(auth.uid(), 'profile', p_user_id, 'manual_subscription_granted', jsonb_build_object('expires_at', p_expires_at));
end;
$$;
revoke all on function public.admin_set_manual_subscription(uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_manual_subscription(uuid, timestamptz) to authenticated;

create or replace function public.admin_log_password_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('platform.users') then raise exception 'forbidden'; end if;
  if not exists(select 1 from auth.users where id = p_user_id) then raise exception 'user_not_found'; end if;
  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values(auth.uid(), 'profile', p_user_id, 'user_password_reset_by_admin', '{}'::jsonb);
end;
$$;
revoke all on function public.admin_log_password_reset(uuid) from public, anon;
grant execute on function public.admin_log_password_reset(uuid) to authenticated;

create or replace function public.admin_list_user_access(p_search text default null, p_limit integer default 100, p_offset integer default 0)
returns table(
  id uuid,
  email text,
  full_name text,
  role text,
  account_status text,
  status_reason text,
  created_at timestamptz,
  last_seen_at timestamptz,
  subscription_active boolean,
  subscription_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, u.email, p.full_name, p.role::text, p.account_status, p.status_reason,
         p.created_at, up.last_seen_at,
         exists(select 1 from public.subscriptions s where s.user_id = p.id
           and s.status in ('trialing', 'active')
           and (s.current_period_end is null or s.current_period_end > now())) as subscription_active,
         (select max(s.current_period_end) from public.subscriptions s
          where s.user_id = p.id and s.status in ('trialing', 'active')
            and (s.current_period_end is null or s.current_period_end > now())) as subscription_until
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_presence up on up.user_id = p.id
  where public.has_permission('platform.users')
    and (nullif(trim(p_search), '') is null
      or coalesce(u.email, '') ilike '%' || trim(p_search) || '%'
      or coalesce(p.full_name, '') ilike '%' || trim(p_search) || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.admin_list_user_access(text, integer, integer) from public, anon;
grant execute on function public.admin_list_user_access(text, integer, integer) to authenticated;

create or replace function public.admin_delete_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('content.archive') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.questions where id = p_question_id) then raise exception 'question_not_found'; end if;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values(auth.uid(), 'question', p_question_id, 'question_deleted', '{}'::jsonb);
  delete from public.questions where id = p_question_id;
exception when foreign_key_violation then
  raise exception 'question_in_use';
end;
$$;
revoke all on function public.admin_delete_question(uuid) from public, anon;
grant execute on function public.admin_delete_question(uuid) to authenticated;
