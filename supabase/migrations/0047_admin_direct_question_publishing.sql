-- Permit active, MFA-assured administrators to publish questions directly.
-- This intentionally skips the independent review queue while preserving versions,
-- database authorization, and an immutable audit record.
create or replace function public.admin_publish_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_version_id uuid;
  v_previous_status text;
begin
  if not public.has_permission('content.write')
     or not public.has_permission('content.review') then
    raise exception 'forbidden';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active';

  if v_role is null or v_role not in ('admin'::public.user_role, 'super_admin'::public.user_role) then
    raise exception 'forbidden';
  end if;

  select q.workflow_status into v_previous_status
  from public.questions q
  where q.id = p_question_id
  for update;
  if not found then raise exception 'question_not_found'; end if;

  select qv.id into v_version_id
  from public.question_versions qv
  where qv.question_id = p_question_id
  order by qv.version_no desc
  limit 1;
  if v_version_id is null then raise exception 'version_not_found'; end if;

  update public.questions q
  set is_published = true, workflow_status = 'published', updated_at = now()
  where q.id = p_question_id;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (
    auth.uid(), 'question', p_question_id, 'admin_direct_published',
    jsonb_build_object(
      'version_id', v_version_id,
      'previous_status', v_previous_status,
      'independent_review', false
    )
  );
end;
$$;

revoke all on function public.admin_publish_question(uuid) from public, anon;
grant execute on function public.admin_publish_question(uuid) to authenticated;
