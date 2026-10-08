-- MDvoro Phase 19: final security/integrity closure.
-- This migration must be applied after Phase 18. It closes post-Phase-16
-- security-definer drift and prevents authenticated users from querying
-- learning context for unpublished/inaccessible questions.

alter function public.smart_student_snapshot() set search_path = '';

create or replace function public.question_learning_context(p_question_id uuid)
returns table(
  taxonomy jsonb,
  knowledge jsonb,
  existing_card_id uuid
)
language sql stable security definer set search_path = ''
as $$
  with accessible_question as (
    select q.id
    from public.questions q
    where q.id = p_question_id
      and q.is_published = true
      and q.workflow_status = 'published'
      and (q.access_tier = 'free' or public.has_active_subscription())
    limit 1
  )
  select
    case when exists (select 1 from accessible_question) then
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'name', n.name, 'type', n.node_type, 'parent_id', n.parent_id
      ) order by qt.is_primary desc, n.node_type, n.name)
        from public.question_taxonomy qt
        join public.taxonomy_nodes n on n.id = qt.taxonomy_id
        where qt.question_id = p_question_id and n.status = 'active'),'[]'::jsonb)
    else '[]'::jsonb end as taxonomy,
    case when exists (select 1 from accessible_question) then
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'title', k.title, 'relation', qk.relation
      ) order by qk.relation, k.title)
        from public.question_knowledge qk
        join public.knowledge_cards k on k.id = qk.knowledge_id
        where qk.question_id = p_question_id and k.status = 'published'),'[]'::jsonb)
    else '[]'::jsonb end as knowledge,
    case when exists (select 1 from accessible_question) then
      (select f.id
        from public.flashcards f
        where f.owner_id = auth.uid() and f.source_question_id = p_question_id
        order by f.created_at desc limit 1)
    else null end as existing_card_id;
$$;

revoke all on function public.question_learning_context(uuid) from public;
grant execute on function public.question_learning_context(uuid) to authenticated;

-- Re-assert the global invariant for all public SECURITY DEFINER functions.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef = true and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = ''''', fn.signature);
  end loop;
end;
$$;

revoke all on function public.smart_student_snapshot() from public;
grant execute on function public.smart_student_snapshot() to authenticated;


create or replace function public.library_overview()
returns table(
  published_cards bigint,
  active_topics bigint,
  published_questions bigint,
  free_questions bigint,
  premium_questions bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from public.knowledge_cards k where k.status = 'published'),
    (select count(*) from public.taxonomy_nodes t where t.status = 'active'),
    (select count(*) from public.questions q where q.is_published = true and q.workflow_status = 'published' and (q.access_tier = 'free' or public.has_active_subscription())),
    (select count(*) from public.questions q where q.is_published = true and q.workflow_status = 'published' and q.access_tier = 'free'),
    (select count(*) from public.questions q where q.is_published = true and q.workflow_status = 'published' and q.access_tier = 'premium' and public.has_active_subscription());
$$;

revoke all on function public.library_overview() from public;
grant execute on function public.library_overview() to authenticated;
