-- Fix the filter tree's topic count lookup so the QBank can load its discipline options.
create or replace function public.qbank_builder_filter_tree(
  p_exam_id uuid,
  p_all_sources boolean default true,
  p_source_ids uuid[] default '{}',
  p_all_disciplines boolean default true,
  p_full_subjects text[] default '{}',
  p_topic_ids uuid[] default '{}',
  p_other_subjects text[] default '{}',
  p_status text default 'all',
  p_difficulties smallint[] default '{}'
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_sources jsonb;
  v_disciplines jsonb;
  v_available bigint;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_status not in ('all','unanswered','incorrect','saved','notes') then raise exception 'invalid_question_status'; end if;

  with base as (
    select q.* from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
    )
  select count(*) into v_available from base q
  where (p_all_sources or q.qbank_source_id=any(p_source_ids)
    or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=any(p_source_ids)))
    and (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[]))
      or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects));

  with base as (
    select q.* from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
  ), source_counts as (
    select s.id,count(q.id)::bigint n from public.qbank_sources s
    left join base q on (q.qbank_source_id=s.id or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=s.id))
      and (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[])) or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects))
    where s.exam_id=p_exam_id group by s.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'key',p.source_key,'name',p.name,'kind',p.source_kind,'count',coalesce(pc.n,0),
    'children',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'key',c.source_key,'name',c.name,'kind',c.source_kind,'count',coalesce(cc.n,0)) order by c.sort_order,c.name)
      from public.qbank_sources c left join source_counts cc on cc.id=c.id where c.parent_id=p.id),'[]'::jsonb)
  ) order by p.sort_order,p.name),'[]'::jsonb)
  into v_sources from public.qbank_sources p left join source_counts pc on pc.id=p.id
  where p.exam_id=p_exam_id and p.parent_id is null;

  with base as (
    select q.* from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
      and (p_all_sources or q.qbank_source_id=any(p_source_ids)
        or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=any(p_source_ids)))
  ), discipline_counts as (
    select es.subject_key,count(distinct q.id)::bigint n from public.exam_subjects es
    left join base q on q.subject=es.subject_key or exists(
      select 1 from public.taxonomy_nodes d where d.node_type='subject'
        and lower(es.subject_key)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
        and lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
    )
    where es.exam_id=p_exam_id and es.enabled group by es.subject_key
  ), topic_counts as (
    select t.id,
      case when t.name='Others' then count(q.id) filter(where not exists(
        select 1 from public.taxonomy_nodes listed
        where listed.parent_id=d.id and listed.node_type='topic' and listed.status='active' and listed.name<>'Others'
          and lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(listed.aliases,listed.name)) x))
      )) else count(q.id) filter(where lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(t.aliases,t.name)) x))) end::bigint n
    from public.taxonomy_nodes t
    join public.taxonomy_nodes d on d.id=t.parent_id and d.node_type='subject'
    left join base q on lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
    where t.node_type='topic' and t.status='active' group by t.id,d.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'value',es.subject_key,'label',es.subject_key,'count',coalesce(dc.n,0),
    'topics',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'count',coalesce((select n from topic_counts where id=t.id),0),'isOthers',t.name='Others') order by t.sort_order,t.name)
      from public.taxonomy_nodes t join public.taxonomy_nodes d on d.id=t.parent_id
      where t.node_type='topic' and t.status='active' and lower(es.subject_key)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
      and (t.name<>'Others' or coalesce((select n from topic_counts where id=t.id),0)>0)),'[]'::jsonb)
  ) order by es.sort_order,es.subject_key),'[]'::jsonb)
  into v_disciplines from public.exam_subjects es left join discipline_counts dc on dc.subject_key=es.subject_key
  where es.exam_id=p_exam_id and es.enabled;

  return jsonb_build_object('sources',v_sources,'disciplines',v_disciplines,'available',v_available);
end $$;
revoke all on function public.qbank_builder_filter_tree(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[]) from public,anon;
grant execute on function public.qbank_builder_filter_tree(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[]) to authenticated;
