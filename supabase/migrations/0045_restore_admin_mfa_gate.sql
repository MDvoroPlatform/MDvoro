-- Restore the MFA requirement for privileged admin permission checks.
-- Migration 0028 replaced the earlier gate while adding the super-admin role.
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
    join public.role_permissions rp on rp.role = p.role
    where p.id = auth.uid()
      and p.account_status = 'active'
      and rp.permission_key = p_permission
      and (
        p.role not in ('admin'::public.user_role, 'super_admin'::public.user_role)
        or (auth.jwt() ->> 'aal') = 'aal2'
      )
  );
$$;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;
