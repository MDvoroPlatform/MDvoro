-- Resolve private media paths only for questions in the caller's own session.
-- The API server uses these paths to create short-lived signed URLs; paths are
-- never included in the learner-facing question payload.
create or replace function public.get_study_session_media_paths(
  p_session_id uuid,
  p_position integer
)
returns table(id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.storage_path
  from public.study_sessions s
  join public.study_session_items si on si.session_id = s.id and si.position = p_position
  join public.questions q on q.id = si.question_id
  join public.question_media qm on qm.question_id = q.id
  join public.media_assets m on m.id = qm.media_id
  where s.id = p_session_id
    and s.user_id = (select auth.uid())
    and q.is_published = true
    and q.workflow_status = 'published'
    and m.storage_path is not null
    and (q.access_tier = 'free' or public.has_active_subscription());
$$;

revoke all on function public.get_study_session_media_paths(uuid, integer) from public, anon;
grant execute on function public.get_study_session_media_paths(uuid, integer) to authenticated;
