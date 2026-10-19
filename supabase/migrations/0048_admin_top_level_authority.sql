-- Make the admin role the highest product-level authority while preserving
-- MFA, active-account checks, self-protection, last-admin protection, and audit logs.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and (
        p.role in ('admin'::public.user_role, 'super_admin'::public.user_role)
        or exists (
          select 1
          from public.role_permissions rp
          where rp.role = p.role and rp.permission_key = p_permission
        )
      )
      and (
        p.role not in ('admin'::public.user_role, 'super_admin'::public.user_role)
        or (auth.jwt() ->> 'aal') = 'aal2'
      )
  );
$$;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

insert into public.role_permissions(role, permission_key)
select 'admin'::public.user_role, p.key
from public.permissions p
on conflict do nothing;

-- Administrators may manage every account role, including legacy super_admin
-- accounts; no user can change their own role and one active administrator remains.
create or replace function public.admin_set_user_role_v2(
  p_user_id uuid,
  p_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.user_role;
  v_target_status text;
  v_admin_count bigint;
begin
  if not public.has_permission('team.manage') then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'self_role_change_forbidden'; end if;

  select p.role, p.account_status into v_target, v_target_status
  from public.profiles p where p.id = p_user_id;
  if v_target is null then raise exception 'user_not_found'; end if;

  if v_target_status = 'active'
     and v_target in ('admin'::public.user_role, 'super_admin'::public.user_role)
     and p_role not in ('admin'::public.user_role, 'super_admin'::public.user_role) then
    select count(*) into v_admin_count from public.profiles p
    where p.account_status = 'active'
      and p.role in ('admin'::public.user_role, 'super_admin'::public.user_role);
    if v_admin_count <= 1 then raise exception 'last_admin_protected'; end if;
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'profile', p_user_id, 'role_changed', jsonb_build_object('from', v_target, 'to', p_role));
end;
$$;
revoke all on function public.admin_set_user_role_v2(uuid, public.user_role) from public, anon;
grant execute on function public.admin_set_user_role_v2(uuid, public.user_role) to authenticated;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.user_role;
  v_target_status text;
  v_admin_count bigint;
begin
  if not public.has_permission('platform.users.suspend') then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'self_status_change_forbidden'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'invalid_status'; end if;

  select p.role, p.account_status into v_target, v_target_status
  from public.profiles p where p.id = p_user_id;
  if v_target is null then raise exception 'user_not_found'; end if;

  if p_status = 'suspended'
     and v_target_status = 'active'
     and v_target in ('admin'::public.user_role, 'super_admin'::public.user_role) then
    select count(*) into v_admin_count from public.profiles p
    where p.account_status = 'active'
      and p.role in ('admin'::public.user_role, 'super_admin'::public.user_role);
    if v_admin_count <= 1 then raise exception 'last_admin_protected'; end if;
  end if;

  update public.profiles
  set account_status = p_status,
      status_reason = nullif(left(trim(coalesce(p_reason, '')), 500), ''),
      suspended_at = case when p_status = 'suspended' then now() else null end
  where id = p_user_id;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'profile', p_user_id,
    case when p_status = 'suspended' then 'user_suspended' else 'user_reactivated' end,
    jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
end;
$$;
revoke all on function public.admin_set_user_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.user_role;
  v_target_status text;
  v_admin_count bigint;
begin
  if not public.has_permission('platform.users.delete') then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'use_self_delete'; end if;

  select p.role, p.account_status into v_target, v_target_status
  from public.profiles p where p.id = p_user_id;
  if v_target is null then raise exception 'user_not_found'; end if;

  if v_target_status = 'active'
     and v_target in ('admin'::public.user_role, 'super_admin'::public.user_role) then
    select count(*) into v_admin_count from public.profiles p
    where p.account_status = 'active'
      and p.role in ('admin'::public.user_role, 'super_admin'::public.user_role);
    if v_admin_count <= 1 then raise exception 'last_admin_protected'; end if;
  end if;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'profile', p_user_id, 'user_deleted', jsonb_build_object('former_role', v_target));
  delete from auth.users where id = p_user_id;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
