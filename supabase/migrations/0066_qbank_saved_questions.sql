create or replace function public.set_question_bookmark(p_question_id uuid, p_saved boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_saved then
    if not exists (
      select 1 from public.questions q
      where q.id = p_question_id
        and q.is_published = true
        and q.workflow_status = 'published'
        and (q.access_tier = 'free' or public.has_active_subscription())
    ) then raise exception 'question_unavailable'; end if;
    insert into public.question_bookmarks(user_id, question_id)
      values (auth.uid(), p_question_id)
      on conflict (user_id, question_id) do nothing;
  else
    delete from public.question_bookmarks
    where user_id = auth.uid() and question_id = p_question_id;
  end if;
  return p_saved;
end;
$$;

revoke all on function public.set_question_bookmark(uuid, boolean) from public, anon;
grant execute on function public.set_question_bookmark(uuid, boolean) to authenticated;
-- The table's SELECT RLS policy limits reads to the current user's bookmarks.
grant select on table public.question_bookmarks to authenticated;
