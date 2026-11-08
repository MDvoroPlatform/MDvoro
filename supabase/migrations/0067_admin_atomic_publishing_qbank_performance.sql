-- Admin is the only top-level administrator. Keep the legacy enum value so old
-- deployments and audit records remain readable, but migrate existing accounts
-- and prevent assigning that role again.
-- Keep a private rollback map for the one-time role normalization. A rollback
-- can restore only these rows and only while they still have the migrated role.
create table if not exists public.admin_role_migration_0067_backup (
  user_id uuid primary key,
  previous_role public.user_role not null,
  migrated_at timestamptz not null default now()
);
alter table public.admin_role_migration_0067_backup enable row level security;
revoke all on public.admin_role_migration_0067_backup from public, anon, authenticated;
comment on table public.admin_role_migration_0067_backup is
  'Restricted rollback map for migration 0067; restore prior roles only for rows still at admin and retain the audit log.';
insert into public.admin_role_migration_0067_backup(user_id, previous_role)
select p.id, p.role from public.profiles p
where p.role = 'super_admin'::public.user_role
on conflict (user_id) do nothing;

insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
select null, 'profile', p.id, 'legacy_admin_role_migrated', jsonb_build_object('from', 'super_admin', 'to', 'admin')
from public.profiles p where p.role = 'super_admin'::public.user_role;

update public.profiles set role = 'admin'::public.user_role
where role = 'super_admin'::public.user_role;
-- Keep legacy role_permissions rows untouched so migration rollback retains the
-- original permission map; no application path can assign super_admin again.

create or replace function public.admin_set_user_role_v2(p_user_id uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target public.user_role; v_target_status text; v_admin_count bigint;
begin
  if not public.has_permission('team.manage') then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'self_role_change_forbidden'; end if;
  if p_role = 'super_admin'::public.user_role then raise exception 'legacy_role_disabled'; end if;
  select p.role, p.account_status into v_target, v_target_status
  from public.profiles p where p.id = p_user_id for update;
  if v_target is null then raise exception 'user_not_found'; end if;
  if v_target = 'admin'::public.user_role and v_target_status = 'active' and p_role <> 'admin'::public.user_role then
    select count(*) into v_admin_count from public.profiles p
    where p.account_status = 'active' and p.role = 'admin'::public.user_role;
    if v_admin_count <= 1 then raise exception 'last_admin_protected'; end if;
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,'role_changed',jsonb_build_object('from',v_target,'to',p_role));
end;
$$;
revoke all on function public.admin_set_user_role_v2(uuid,public.user_role) from public,anon;
grant execute on function public.admin_set_user_role_v2(uuid,public.user_role) to authenticated;

-- Preserve the historical RPC name for existing clients while routing it through
-- the current top-level-admin authorization and last-admin protections.
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_set_user_role_v2(p_user_id,p_role);
end;
$$;
revoke all on function public.admin_set_user_role(uuid,public.user_role) from public,anon;
grant execute on function public.admin_set_user_role(uuid,public.user_role) to authenticated;

-- Updating a published question is an explicit admin action. Save/version all
-- content while preserving publication; only the dedicated unpublish RPC changes it.
create or replace function public.update_question_draft(
  p_question_id uuid, p_exam_id uuid, p_stem text, p_subject text, p_topic text,
  p_options jsonb, p_answer_key text, p_explanation text, p_key_learning_point text,
  p_difficulty smallint, p_media_ids uuid[] default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_next integer; v_version_id uuid; v_status text; v_is_published boolean; v_actor_role public.user_role;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.exams where id = p_exam_id) then raise exception 'exam_not_found'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then raise exception 'invalid_options'; end if;
  if not exists(select 1 from jsonb_array_elements(p_options) x where x->>'id' = p_answer_key) then raise exception 'answer_not_in_options'; end if;

  select q.workflow_status,q.is_published,p.role into v_status,v_is_published,v_actor_role
  from public.questions q join public.profiles p on p.id = auth.uid()
  where q.id = p_question_id and p.account_status = 'active' for update of q;
  if not found then raise exception 'question_not_found'; end if;
  if v_is_published and v_actor_role not in ('admin'::public.user_role,'super_admin'::public.user_role) then
    raise exception 'admin_required_for_published_question_edit';
  end if;

  select coalesce(max(version_no),0)+1 into v_next from public.question_versions where question_id = p_question_id;
  insert into public.question_versions(question_id,version_no,stem,subject,topic,options,answer_key,explanation,key_learning_point,difficulty,created_by)
  values(p_question_id,v_next,p_stem,p_subject,nullif(p_topic,''),p_options,p_answer_key,p_explanation,p_key_learning_point,p_difficulty,auth.uid())
  returning id into v_version_id;

  delete from public.question_media where question_id = p_question_id;
  if coalesce(array_length(p_media_ids,1),0) > 0 then
    insert into public.question_media(question_id,media_id,position)
    select p_question_id,x,row_number() over(order by ordinality)-1
    from unnest(p_media_ids) with ordinality as media(x,ordinality);
  end if;

  update public.questions set exam_id=p_exam_id,stem=p_stem,subject=p_subject,topic=nullif(p_topic,''),options=p_options,
    answer_key=p_answer_key,explanation=p_explanation,difficulty=p_difficulty,
    is_published=v_is_published,workflow_status=case when v_is_published then v_status else 'draft' end,updated_at=now()
  where id=p_question_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,case when v_is_published then 'published_question_updated' else 'draft_updated' end,
    jsonb_build_object('version_id',v_version_id,'version_no',v_next,'publication_preserved',v_is_published));
  return v_version_id;
end;
$$;
revoke all on function public.update_question_draft(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) from public,anon;
grant execute on function public.update_question_draft(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) to authenticated;

-- One transaction covers the question version, media, taxonomy, recall terms,
-- reconstruction label, rights metadata, and optional direct publication.
alter table public.question_versions add column if not exists authoring_metadata jsonb;

create or replace function public.admin_save_question(
  p_question_id uuid, p_exam_id uuid, p_stem text, p_subject text, p_topic text,
  p_options jsonb, p_answer_key text, p_explanation text, p_key_learning_point text,
  p_difficulty smallint, p_media_ids uuid[], p_taxonomy_ids uuid[], p_key_terms text[],
  p_is_reconstruction boolean, p_reconstruction_year smallint, p_reconstruction_label text,
  p_rights_basis text, p_source_reference text, p_publish boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_question_id uuid; v_version_id uuid; v_status text; v_is_published boolean; v_actor_role public.user_role;
  v_existing_rights public.question_rights%rowtype; v_preserve_rights_verification boolean:=false;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  select p.role into v_actor_role from public.profiles p where p.id=auth.uid() and p.account_status='active';
  if p_publish and v_actor_role not in ('admin'::public.user_role,'super_admin'::public.user_role) then raise exception 'forbidden'; end if;
  if p_is_reconstruction and (p_reconstruction_year is null or p_reconstruction_year < 1900 or p_reconstruction_year > 2100) then
    raise exception 'reconstruction_year_required';
  end if;

  if p_question_id is null then
    v_question_id := public.create_question(p_exam_id,p_stem,p_subject,p_topic,p_options,p_answer_key,p_explanation,
      p_key_learning_point,p_difficulty,coalesce(p_media_ids,'{}'::uuid[]));
    select qv.id into v_version_id from public.question_versions qv
      where qv.question_id=v_question_id order by qv.version_no desc limit 1;
  else
    v_question_id := p_question_id;
    v_version_id := public.update_question_draft(v_question_id,p_exam_id,p_stem,p_subject,p_topic,p_options,p_answer_key,
      p_explanation,p_key_learning_point,p_difficulty,coalesce(p_media_ids,'{}'::uuid[]));
  end if;

  perform public.set_question_taxonomy(v_question_id,coalesce(p_taxonomy_ids,'{}'::uuid[]));
  perform public.set_question_key_terms(v_question_id,coalesce(p_key_terms,'{}'::text[]));
  perform public.admin_set_question_reconstruction(v_question_id,coalesce(p_is_reconstruction,false),p_reconstruction_year,p_reconstruction_label);
  select r.* into v_existing_rights from public.question_rights r where r.question_id=v_question_id for update;
  if found then
    v_preserve_rights_verification:=v_existing_rights.verified
      and v_existing_rights.rights_basis=p_rights_basis
      and coalesce(v_existing_rights.source_reference,'')=coalesce(nullif(trim(p_source_reference),''),'');
  end if;
  perform public.admin_upsert_question_rights(v_question_id,p_rights_basis,v_existing_rights.source_name,
    v_existing_rights.source_year,p_source_reference,v_existing_rights.attribution,false,v_existing_rights.notes);
  if v_preserve_rights_verification then
    update public.question_rights set verified=true,verified_at=v_existing_rights.verified_at,verified_by=v_existing_rights.verified_by
    where question_id=v_question_id;
  end if;
  update public.question_versions qv set authoring_metadata=jsonb_build_object(
    'media_ids',coalesce((select jsonb_agg(qm.media_id order by qm.position) from public.question_media qm where qm.question_id=v_question_id),'[]'::jsonb),
    'taxonomy_ids',coalesce((select jsonb_agg(qt.taxonomy_id order by qt.is_primary desc,qt.taxonomy_id) from public.question_taxonomy qt where qt.question_id=v_question_id),'[]'::jsonb),
    'key_terms',coalesce((select to_jsonb(q.key_terms) from public.questions q where q.id=v_question_id),'[]'::jsonb),
    'is_reconstruction',coalesce((select q.is_reconstruction from public.questions q where q.id=v_question_id),false),
    'reconstruction_year',(select q.reconstruction_year from public.questions q where q.id=v_question_id),
    'reconstruction_label',(select q.reconstruction_label from public.questions q where q.id=v_question_id),
    'rights',(select jsonb_build_object('rights_basis',r.rights_basis,'source_name',r.source_name,'source_year',r.source_year,
      'source_reference',r.source_reference,'attribution',r.attribution,'verified',r.verified,'notes',r.notes)
      from public.question_rights r where r.question_id=v_question_id)
  ) where qv.id=v_version_id;
  if p_publish then perform public.admin_publish_question(v_question_id); end if;

  select q.workflow_status,q.is_published into v_status,v_is_published from public.questions q where q.id=v_question_id;
  return jsonb_build_object('id',v_question_id,'versionId',v_version_id,'workflowStatus',v_status,'isPublished',v_is_published);
end;
$$;
revoke all on function public.admin_save_question(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[],uuid[],text[],boolean,smallint,text,text,text,boolean) from public,anon;
grant execute on function public.admin_save_question(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[],uuid[],text[],boolean,smallint,text,text,text,boolean) to authenticated;

create or replace function public.admin_list_question_versions(p_question_id uuid)
returns table(id uuid,version_no integer,stem text,subject text,topic text,created_at timestamptz,authoring_metadata jsonb)
language sql stable security definer set search_path = '' as $$
  select qv.id,qv.version_no,qv.stem,qv.subject,qv.topic,qv.created_at,qv.authoring_metadata
  from public.question_versions qv
  where qv.question_id=p_question_id and (public.can_edit_content() or public.can_review_content())
  order by qv.version_no desc;
$$;
revoke all on function public.admin_list_question_versions(uuid) from public,anon;
grant execute on function public.admin_list_question_versions(uuid) to authenticated;

create or replace function public.admin_restore_question_version(p_question_id uuid,p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_question public.questions%rowtype; v_source public.question_versions%rowtype;
  v_actor_role public.user_role; v_next integer; v_new_version uuid; v_metadata jsonb; v_rights jsonb;
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  select p.role into v_actor_role from public.profiles p where p.id=auth.uid() and p.account_status='active';
  select * into v_question from public.questions q where q.id=p_question_id for update;
  if not found then raise exception 'question_not_found'; end if;
  if v_question.is_published and v_actor_role not in ('admin'::public.user_role,'super_admin'::public.user_role) then
    raise exception 'admin_required_for_published_question_edit';
  end if;
  select * into v_source from public.question_versions qv where qv.id=p_version_id and qv.question_id=p_question_id;
  if not found then raise exception 'version_not_found'; end if;
  select coalesce(max(qv.version_no),0)+1 into v_next from public.question_versions qv where qv.question_id=p_question_id;
  insert into public.question_versions(question_id,version_no,stem,subject,topic,options,answer_key,explanation,key_learning_point,difficulty,key_terms,authoring_metadata,created_by)
  values(p_question_id,v_next,v_source.stem,v_source.subject,v_source.topic,v_source.options,v_source.answer_key,v_source.explanation,
    v_source.key_learning_point,v_source.difficulty,v_source.key_terms,v_source.authoring_metadata,auth.uid()) returning id into v_new_version;
  update public.questions set stem=v_source.stem,subject=v_source.subject,topic=v_source.topic,options=v_source.options,
    answer_key=v_source.answer_key,explanation=v_source.explanation,difficulty=v_source.difficulty,key_terms=v_source.key_terms,updated_at=now()
  where id=p_question_id;

  v_metadata:=v_source.authoring_metadata;
  if v_metadata is not null then
    delete from public.question_media where question_id=p_question_id;
    insert into public.question_media(question_id,media_id,position)
    select p_question_id,x.media_id,row_number() over(order by x.ordinality)-1
    from jsonb_array_elements_text(coalesce(v_metadata->'media_ids','[]'::jsonb)) with ordinality as x(media_id,ordinality);
    perform public.set_question_taxonomy(p_question_id,coalesce(array(select value::uuid from jsonb_array_elements_text(coalesce(v_metadata->'taxonomy_ids','[]'::jsonb))), '{}'::uuid[]));
    perform public.set_question_key_terms(p_question_id,coalesce(array(select value from jsonb_array_elements_text(coalesce(v_metadata->'key_terms','[]'::jsonb))), '{}'::text[]));
    perform public.admin_set_question_reconstruction(p_question_id,coalesce((v_metadata->>'is_reconstruction')::boolean,false),
      nullif(v_metadata->>'reconstruction_year','')::smallint,v_metadata->>'reconstruction_label');
    v_rights:=v_metadata->'rights';
    if v_rights is not null then
      perform public.admin_upsert_question_rights(p_question_id,v_rights->>'rights_basis',v_rights->>'source_name',
        nullif(v_rights->>'source_year','')::smallint,v_rights->>'source_reference',v_rights->>'attribution',
        coalesce((v_rights->>'verified')::boolean,false),v_rights->>'notes');
    end if;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'question_version_restored',jsonb_build_object('restored_from_version_id',v_source.id,
    'restored_from_version_no',v_source.version_no,'new_version_id',v_new_version,'new_version_no',v_next,
    'authoring_metadata_restored',v_metadata is not null,'publication_preserved',v_question.is_published));
  return jsonb_build_object('id',p_question_id,'versionId',v_new_version,'versionNo',v_next,
    'workflowStatus',v_question.workflow_status,'isPublished',v_question.is_published,'metadataRestored',v_metadata is not null);
end;
$$;
revoke all on function public.admin_restore_question_version(uuid,uuid) from public,anon;
grant execute on function public.admin_restore_question_version(uuid,uuid) to authenticated;

create or replace function public.admin_unpublish_question(p_question_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  if not public.has_permission('content.review') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role in ('admin'::public.user_role,'super_admin'::public.user_role)) then raise exception 'forbidden'; end if;
  update public.questions set is_published=false,workflow_status='draft',updated_at=now()
    where id=p_question_id and is_published=true and workflow_status='published';
  if not found then raise exception 'question_not_published'; end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'admin_unpublished',jsonb_build_object('previous_status','published'));
end;
$$;
revoke all on function public.admin_unpublish_question(uuid) from public,anon;
grant execute on function public.admin_unpublish_question(uuid) to authenticated;

-- Compact immutable navigation payload. It applies the same ownership, exam block,
-- timer, answer-key, media, and subscription checks without rebuilding the full
-- session navigator array on each prefetched question.
create index if not exists questions_qbank_exam_subject_topic_idx
  on public.questions(exam_id,subject,topic)
  where is_published and workflow_status='published';
comment on index public.questions_qbank_exam_subject_topic_idx is
  'Supports the exam/subject/topic predicates used by QBank pool counts and builder filtering.';

-- Build the filter tree from one materialized question candidate set rather than
-- rescanning the published bank separately for availability, sources and topics.
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
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_sources jsonb;
  v_disciplines jsonb;
  v_available bigint;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_status not in ('all','unanswered','incorrect','saved','notes') then raise exception 'invalid_question_status'; end if;

  with latest_session as materialized (
    select ss.id from public.study_sessions ss
    where ss.user_id=auth.uid() and ss.status in ('completed','expired')
    order by coalesce(ss.finished_at,ss.created_at) desc limit 1
  ), base as materialized (
    select q.id,q.subject,q.topic,q.qbank_source_id,coalesce(qs.attempts,0) attempts,coalesce(qs.correct,0) correct
    from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i join latest_session ls on ls.id=i.session_id where i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
  ), selected_sources as materialized (
    select b.* from base b
    where p_all_sources or b.qbank_source_id=any(coalesce(p_source_ids,'{}'::uuid[]))
      or exists(select 1 from public.qbank_sources c where c.id=b.qbank_source_id and c.parent_id=any(coalesce(p_source_ids,'{}'::uuid[])))
  ), source_counts as materialized (
    select s.id,count(q.id)::bigint n
    from public.qbank_sources s
    left join base q on (q.qbank_source_id=s.id or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=s.id))
      and (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[])) or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects))
    where s.exam_id=p_exam_id group by s.id
  ), discipline_counts as materialized (
    select es.subject_key,count(distinct q.id)::bigint n
    from public.exam_subjects es
    left join selected_sources q on q.subject=es.subject_key or exists(
      select 1 from public.taxonomy_nodes d where d.node_type='subject'
        and lower(es.subject_key)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
        and lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
    )
    where es.exam_id=p_exam_id and es.enabled group by es.subject_key
  ), topic_counts as materialized (
    select t.id,
      case when t.name='Others' then count(q.id) filter(where not exists(
        select 1 from public.taxonomy_nodes listed
        where listed.parent_id=d.id and listed.node_type='topic' and listed.status='active' and listed.name<>'Others'
          and lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(listed.aliases,listed.name)) x))
      )) else count(q.id) filter(where lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(t.aliases,t.name)) x))) end::bigint n
    from public.taxonomy_nodes t
    join public.taxonomy_nodes d on d.id=t.parent_id and d.node_type='subject'
    left join selected_sources q on lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
    where t.node_type='topic' and t.status='active' group by t.id,d.id
  )
  select
    (select count(*)::bigint from selected_sources q where
      (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[])) or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects))),
    (select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'key',p.source_key,'name',p.name,'kind',p.source_kind,'count',coalesce(pc.n,0),
      'children',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'key',c.source_key,'name',c.name,'kind',c.source_kind,'count',coalesce(cc.n,0)) order by c.sort_order,c.name)
        from public.qbank_sources c left join source_counts cc on cc.id=c.id where c.parent_id=p.id),'[]'::jsonb)
    ) order by p.sort_order,p.name),'[]'::jsonb)
      from public.qbank_sources p left join source_counts pc on pc.id=p.id
      where p.exam_id=p_exam_id and p.parent_id is null),
    (select coalesce(jsonb_agg(jsonb_build_object(
      'value',es.subject_key,'label',es.subject_key,'count',coalesce(dc.n,0),
      'topics',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'count',coalesce(tc.n,0),'isOthers',t.name='Others') order by t.sort_order,t.name)
        from public.taxonomy_nodes t join public.taxonomy_nodes d on d.id=t.parent_id
        left join topic_counts tc on tc.id=t.id
        where t.node_type='topic' and t.status='active'
          and lower(es.subject_key)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
          and (t.name<>'Others' or coalesce(tc.n,0)>0)),'[]'::jsonb)
    ) order by es.sort_order,es.subject_key),'[]'::jsonb)
      from public.exam_subjects es left join discipline_counts dc on dc.subject_key=es.subject_key
      where es.exam_id=p_exam_id and es.enabled)
  into v_available,v_sources,v_disciplines;

  return jsonb_build_object('sources',v_sources,'disciplines',v_disciplines,'available',v_available);
end;
$$;
revoke all on function public.qbank_builder_filter_tree(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[]) from public,anon;
grant execute on function public.qbank_builder_filter_tree(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[]) to authenticated;

create or replace function public.get_study_session_state_compact(p_session_id uuid,p_position integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_session record; v_item record; v_question jsonb; v_requested integer; v_current_block integer;
  v_session_block_count integer; v_active_elapsed numeric; v_break_elapsed numeric:=0;
  v_wall_elapsed numeric; v_on_break boolean:=false; v_break_remaining integer:=0; v_key_terms text[];
begin
  select s.*,e.code exam_code,e.name exam_name,ep.total_duration_minutes,ep.max_items,
    ep.block_duration_minutes,ep.block_max_items,ep.block_count,ep.previous_block_review_allowed
  into v_session from public.study_sessions s join public.exams e on e.id=s.exam_id
    join public.exam_profiles ep on ep.exam_id=s.exam_id
  where s.id=p_session_id and s.user_id=auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  v_wall_elapsed:=greatest(0,extract(epoch from now()-v_session.started_at));
  if v_session.status='in_progress' and v_session.mode='exam' and v_session.time_limit_seconds is not null
    and v_wall_elapsed>=v_session.time_limit_seconds then raise exception 'session_expired'; end if;
  if v_session.break_started_at is not null or (v_session.mode='practice' and v_session.practice_pause_started_at is not null) then
    v_on_break:=true;
    v_break_elapsed:=greatest(0,extract(epoch from now()-coalesce(v_session.practice_pause_started_at,v_session.break_started_at)));
  end if;
  v_active_elapsed:=greatest(0,v_wall_elapsed-v_session.break_seconds_used-v_session.practice_paused_seconds-v_break_elapsed);
  v_session_block_count:=greatest(1,ceil(v_session.requested_count::numeric/nullif(v_session.block_max_items,0))::integer);
  v_current_block:=case when v_session.mode='exam' then least(v_session_block_count,floor(v_active_elapsed/(v_session.block_duration_minutes*60))::integer+1) else greatest(1,v_session.current_block) end;
  v_break_remaining:=case when v_session.mode='exam' then greatest(0,v_session.break_seconds_allowed-v_session.break_seconds_used-floor(v_break_elapsed)::integer) else 0 end;
  v_requested:=case when coalesce(p_position,0)<=0 then v_session.current_position else greatest(1,least(p_position,v_session.requested_count)) end;
  select si.* into v_item from public.study_session_items si where si.session_id=p_session_id and si.position=v_requested;
  if not found then raise exception 'session_item_not_found'; end if;
  if not v_on_break and v_session.status='in_progress' and v_session.mode='exam' and not v_session.previous_block_review_allowed then
    if v_item.block_number<v_current_block then raise exception 'block_closed'; end if;
    if v_item.block_number>v_current_block then raise exception 'block_not_open'; end if;
  end if;
  select public.student_key_terms(v_item.question_id) into v_key_terms from public.questions q where q.id=v_item.question_id;
  if v_on_break then v_question:=null;
  else
    select jsonb_build_object('id',q.id,'content_code',q.content_code,'exam_id',q.exam_id,'stem',q.stem,'subject',q.subject,'topic',q.topic,
      'options',q.options,'difficulty',q.difficulty,
      'key_terms',case when v_item.is_correct is not null or v_session.mode='practice' then v_key_terms else array[]::text[] end,
      'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'caption',qm.caption,'position',qm.position) order by qm.position)
        from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb),
      'answered',v_item.is_correct is not null,'selected_answer',v_item.selected_answer,'is_correct',v_item.is_correct,
      'correct_answer',case when v_item.is_correct is not null then q.answer_key else null end,
      'explanation',case when v_item.is_correct is not null then q.explanation else null end,
      'key_learning_point',case when v_item.is_correct is not null then (select vv.key_learning_point from public.question_versions vv where vv.question_id=q.id order by vv.version_no desc limit 1) else null end,
      'note',v_item.note,'is_saved',exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
    into v_question from public.questions q where q.id=v_item.question_id and q.is_published and q.workflow_status='published';
  end if;
  if v_question is null and not v_on_break then raise exception 'question_not_available'; end if;
  if not v_on_break and coalesce((select q.is_reconstruction from public.questions q where q.id=v_item.question_id),false) then
    v_question:=jsonb_set(v_question,'{reconstruction}',jsonb_build_object('is_reconstruction',true,
      'year',(select q.reconstruction_year from public.questions q where q.id=v_item.question_id),
      'label',coalesce((select q.reconstruction_label from public.questions q where q.id=v_item.question_id),'שחזור')),true);
  end if;
  return jsonb_build_object('session',jsonb_build_object('id',v_session.id,'exam_code',v_session.exam_code,'exam_name',v_session.exam_name,
    'mode',v_session.mode,'status',v_session.status,'requested_count',v_session.requested_count,'time_limit_seconds',v_session.time_limit_seconds,
    'started_at',v_session.started_at,'finished_at',v_session.finished_at,'current_position',case when coalesce(p_position,0)<=0 then v_session.current_position else v_requested end,
    'current_block',v_current_block,'block_count',v_session_block_count,'score_percent',v_session.score_percent,'correct_count',v_session.correct_count,
    'answered_count',v_session.answered_count,'total_duration_minutes',v_session.total_duration_minutes,'max_items',v_session.max_items,
    'block_duration_minutes',v_session.block_duration_minutes,'block_max_items',v_session.block_max_items,
    'previous_block_review_allowed',v_session.previous_block_review_allowed,'break_seconds_allowed',v_session.break_seconds_allowed,
    'break_seconds_used',v_session.break_seconds_used,'break_remaining_seconds',v_break_remaining,'break_started_at',coalesce(v_session.practice_pause_started_at,v_session.break_started_at),
    'on_break',v_on_break,'active_block_position',v_current_block),'question',v_question);
end;
$$;
revoke all on function public.get_study_session_state_compact(uuid,integer) from public,anon;
grant execute on function public.get_study_session_state_compact(uuid,integer) to authenticated;
