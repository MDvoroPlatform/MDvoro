-- MDvoro Learning Loop v1: question -> concept -> flashcard -> SRS -> retest.
-- Server derives concept context and a next action from verified learning events.

create or replace function public.question_learning_context(p_question_id uuid)
returns table(
  taxonomy jsonb,
  knowledge jsonb,
  existing_card_id uuid
)
language sql stable security definer set search_path=public
as $$
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'name', n.name, 'type', n.node_type, 'parent_id', n.parent_id
    ) order by qt.is_primary desc, n.node_type, n.name)
      from public.question_taxonomy qt
      join public.taxonomy_nodes n on n.id=qt.taxonomy_id
      where qt.question_id=p_question_id and n.status='active'),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', k.id, 'title', k.title, 'relation', qk.relation
    ) order by qk.relation, k.title)
      from public.question_knowledge qk
      join public.knowledge_cards k on k.id=qk.knowledge_id
      where qk.question_id=p_question_id and k.status='published'),'[]'::jsonb),
    (select f.id from public.flashcards f
      where f.owner_id=auth.uid() and f.source_question_id=p_question_id
      order by f.created_at desc limit 1);
$$;
revoke all on function public.question_learning_context(uuid) from public;
grant execute on function public.question_learning_context(uuid) to authenticated;

create or replace function public.learning_mastery()
returns table(
  node_id uuid,
  node_name text,
  node_type text,
  attempts bigint,
  correct bigint,
  accuracy numeric,
  due_cards bigint,
  last_attempt_at timestamptz
)
language sql stable security definer set search_path=public
as $$
  with stats as (
    select n.id,n.name,n.node_type,
      count(a.id)::bigint attempts,
      coalesce(sum(case when a.is_correct then 1 else 0 end),0)::bigint correct,
      round(100.0 * avg(case when a.is_correct then 1.0 else 0.0 end),1) accuracy,
      max(a.created_at) last_attempt_at
    from public.taxonomy_nodes n
    join public.question_taxonomy qt on qt.taxonomy_id=n.id
    join public.question_attempts a on a.question_id=qt.question_id and a.user_id=auth.uid()
    where n.status='active'
    group by n.id,n.name,n.node_type
    having count(a.id) >= 2
  ), cards as (
    select knowledge_id,count(*) filter (where suspended=false and due_at<=now())::bigint due_cards
    from public.flashcards where owner_id=auth.uid() and knowledge_id is not null group by knowledge_id
  )
  select s.id,s.name,s.node_type,s.attempts,s.correct,s.accuracy,
    coalesce(c.due_cards,0),s.last_attempt_at
  from stats s left join cards c on c.knowledge_id=s.id
  order by s.accuracy asc,s.attempts desc,s.name
  limit 20;
$$;
revoke all on function public.learning_mastery() from public;
grant execute on function public.learning_mastery() to authenticated;

create or replace function public.learning_next_action()
returns table(
  action_type text,
  node_id uuid,
  node_name text,
  question_id uuid,
  reason text
)
language sql stable security definer set search_path=public
as $$
  with weak as (
    select n.id,n.name,round(100.0*avg(case when a.is_correct then 1.0 else 0.0 end),1) accuracy
    from public.taxonomy_nodes n
    join public.question_taxonomy qt on qt.taxonomy_id=n.id
    join public.question_attempts a on a.question_id=qt.question_id and a.user_id=auth.uid()
    where n.status='active'
    group by n.id,n.name
    having count(a.id)>=2
    order by accuracy asc,count(a.id) desc,n.name
    limit 1
  ),
  due as (
    select f.knowledge_id
    from public.flashcards f
    where f.owner_id=auth.uid() and f.suspended=false and f.due_at<=now() and f.knowledge_id is not null
    order by f.due_at asc limit 1
  )
  select
    case when exists(select 1 from due) then 'flashcard' else 'qbank' end,
    coalesce((select id from weak),(select knowledge_id from due)),
    (select name from weak),
    (select q.id
      from public.questions q
      join public.question_taxonomy qt on qt.question_id=q.id
      where qt.taxonomy_id=(select id from weak)
        and q.is_published=true and q.workflow_status='published'
        and (q.access_tier='free' or public.has_active_subscription())
      order by not exists(select 1 from public.question_attempts a where a.user_id=auth.uid() and a.question_id=q.id), q.updated_at desc
      limit 1),
    case when exists(select 1 from due) then 'A linked memory card is due for retrieval.'
         when exists(select 1 from weak) then 'This is currently your weakest tested concept.'
         else 'Start a question to build your first mastery signal.' end;
$$;
revoke all on function public.learning_next_action() from public;
grant execute on function public.learning_next_action() to authenticated;
