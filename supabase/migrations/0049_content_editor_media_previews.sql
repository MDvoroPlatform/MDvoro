-- Keep medical media private from learners until linked to published content,
-- while allowing authorized editors to preview assets during question authoring.
drop policy if exists "content editors preview private medical media" on storage.objects;
create policy "content editors preview private medical media"
on storage.objects for select to authenticated
using (bucket_id = 'medical-media' and public.can_edit_content());

-- Expose only the non-sensitive source/rights fields needed by the editor.
create or replace function public.admin_get_question_rights(p_question_id uuid)
returns table(rights_basis text, source_reference text)
language sql stable security definer set search_path = '' as $$
  select r.rights_basis, r.source_reference
  from public.question_rights r
  where r.question_id = p_question_id
    and public.has_permission('content.write')
  limit 1;
$$;
revoke all on function public.admin_get_question_rights(uuid) from public;
grant execute on function public.admin_get_question_rights(uuid) to authenticated;
