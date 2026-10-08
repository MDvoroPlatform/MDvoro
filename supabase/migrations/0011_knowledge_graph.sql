-- MDvoro Knowledge Graph v1.
-- The graph is a governed learning map: taxonomy -> questions -> knowledge -> memory.
-- Student-visible data is limited to published content and the current learner's activity.

create or replace function public.learning_knowledge_graph(p_limit integer default 60)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,60),12),120);
  v_nodes jsonb;
  v_edges jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;

  with eligible_questions as (
    select q.id, q.subject, q.topic
    from public.questions q
    where q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
  ),
  used_taxonomy as (
    select n.id,n.parent_id,n.name,n.node_type,n.description,
      count(distinct eq.id)::bigint as question_count,
      count(distinct a.id)::bigint as attempts,
      coalesce(round(100.0*avg(case when a.is_correct then 1.0 else 0.0 end),1),null) as accuracy
    from public.taxonomy_nodes n
    join public.question_taxonomy qt on qt.taxonomy_id=n.id
    join eligible_questions eq on eq.id=qt.question_id
    left join public.question_attempts a on a.question_id=eq.id and a.user_id=auth.uid()
    where n.status='active'
    group by n.id,n.parent_id,n.name,n.node_type,n.description
    order by count(distinct a.id) desc, count(distinct eq.id) desc, n.name
    limit v_limit
  ),
  used_questions as (
    select distinct eq.id,eq.subject,eq.topic
    from eligible_questions eq
    join public.question_taxonomy qt on qt.question_id=eq.id
    where qt.taxonomy_id in (select id from used_taxonomy)
    limit v_limit
  ),
  used_knowledge as (
    select distinct k.id,k.title,k.summary
    from public.knowledge_cards k
    join public.question_knowledge qk on qk.knowledge_id=k.id
    join used_questions uq on uq.id=qk.question_id
    where k.status='published'
    limit v_limit
  ),
  node_rows as (
    select jsonb_build_object('id',t.id,'kind','taxonomy','label',t.name,'type',t.node_type,
      'parent_id',t.parent_id,'question_count',t.question_count,'attempts',t.attempts,'accuracy',t.accuracy) as node
    from used_taxonomy t
    union all
    select jsonb_build_object('id',q.id,'kind','question','label',coalesce(nullif(q.topic,''),q.subject,'Question'),'type','question')
    from used_questions q
    union all
    select jsonb_build_object('id',k.id,'kind','knowledge','label',k.title,'type','knowledge')
    from used_knowledge k
  ),
  edge_rows as (
    select jsonb_build_object('from',qt.taxonomy_id,'to',qt.question_id,'type','tested_by') as edge
    from public.question_taxonomy qt join used_questions q on q.id=qt.question_id
    where qt.taxonomy_id in (select id from used_taxonomy)
    union all
    select jsonb_build_object('from',qk.question_id,'to',qk.knowledge_id,'type',qk.relation) as edge
    from public.question_knowledge qk join used_questions q on q.id=qk.question_id join used_knowledge k on k.id=qk.knowledge_id
    union all
    select jsonb_build_object('from',t.parent_id,'to',t.id,'type','contains') as edge
    from used_taxonomy t where t.parent_id is not null and t.parent_id in (select id from used_taxonomy)
  )
  select coalesce((select jsonb_agg(node) from node_rows),'[]'::jsonb),
         coalesce((select jsonb_agg(edge) from edge_rows),'[]'::jsonb)
    into v_nodes,v_edges;

  return jsonb_build_object(
    'nodes',v_nodes,
    'edges',v_edges,
    'generated_at',now()
  );
end;
$$;
revoke all on function public.learning_knowledge_graph(integer) from public;
grant execute on function public.learning_knowledge_graph(integer) to authenticated;

-- Feed graph mastery into question selection. Questions in weak concepts are favored,
-- while unseen questions still win when the learner has no history.
create or replace function public.get_next_question(p_exam_id uuid default null,p_subject text default null,p_topic text default null)
returns table(id uuid,content_code text,exam_id uuid,stem text,subject text,topic text,options jsonb,difficulty smallint,media jsonb)
language plpgsql volatile security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  with weak_nodes as (
    select qt.taxonomy_id,
      avg(case when a.is_correct then 1.0 else 0.0 end) as accuracy
    from public.question_taxonomy qt
    join public.question_attempts a on a.question_id=qt.question_id and a.user_id=auth.uid()
    group by qt.taxonomy_id
    having count(*) >= 2
  ),
  candidates as (
    select q.*,
      exists(select 1 from public.question_attempts a where a.user_id=auth.uid() and a.question_id=q.id) as seen,
      coalesce((select avg(case when a.is_correct then 1 else 0 end) from public.question_attempts a where a.user_id=auth.uid() and a.question_id=q.id),0.5) as accuracy,
      coalesce((select max(a.created_at) from public.question_attempts a where a.user_id=auth.uid() and a.question_id=q.id),timestamp 'epoch') as last_seen,
      coalesce((select min(w.accuracy) from public.question_taxonomy qt join weak_nodes w on w.taxonomy_id=qt.taxonomy_id where qt.question_id=q.id),1.0) as weakest_taxonomy_accuracy
    from public.questions q
    where q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (p_exam_id is null or q.exam_id=p_exam_id)
      and (p_subject is null or p_subject='' or q.subject=p_subject)
      and (p_topic is null or p_topic='' or q.topic=p_topic)
  ), picked as (
    select * from candidates
    order by seen asc, weakest_taxonomy_accuracy asc, accuracy asc, last_seen asc, difficulty desc, updated_at desc
    limit 1
  )
  select p.id,p.content_code,p.exam_id,p.stem,p.subject,p.topic,p.options,p.difficulty,
    coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'student_alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'storage_path',m.storage_path,'caption',qm.caption,'position',qm.position) order by qm.position)
      from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=p.id),'[]'::jsonb)
  from picked p;
end; $$;
revoke all on function public.get_next_question(uuid,text,text) from public;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;
