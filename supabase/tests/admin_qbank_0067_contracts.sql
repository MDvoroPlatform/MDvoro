-- Run after migration 0067 on a disposable Supabase/Postgres database.
-- Structural contracts are safe to run in a transaction and make no persistent changes.
begin;

do $$
declare
  fn regprocedure;
  body text;
  table_rls boolean;
begin
  fn := to_regprocedure('public.admin_save_question(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[],uuid[],text[],boolean,smallint,text,text,text,boolean)');
  if fn is null then raise exception 'admin_save_question RPC is missing'; end if;
  if not has_function_privilege('authenticated',fn,'EXECUTE') or has_function_privilege('anon',fn,'EXECUTE') then
    raise exception 'admin_save_question grants are incorrect';
  end if;
  body := pg_get_functiondef(fn);
  if body not ilike '%v_existing_rights.source_name%' or body not ilike '%v_existing_rights.attribution%'
      or body not ilike '%v_existing_rights.notes%' or body not ilike '%v_preserve_rights_verification%' then
    raise exception 'atomic save drops rights metadata hidden from the editor';
  end if;
  foreach fn in array array[
    'public.set_question_taxonomy(uuid,uuid[])'::regprocedure,
    'public.set_question_key_terms(uuid,text[])'::regprocedure,
    'public.admin_set_question_reconstruction(uuid,boolean,smallint,text)'::regprocedure,
    'public.admin_upsert_question_rights(uuid,text,text,smallint,text,text,boolean,text)'::regprocedure,
    'public.admin_publish_question(uuid)'::regprocedure
  ] loop
    if body not ilike '%'||split_part(fn::text,'(',1)||'%' then
      raise exception 'atomic question save is missing operation %', fn;
    end if;
  end loop;

  fn := 'public.update_question_draft(uuid,uuid,text,text,text,jsonb,text,text,text,smallint,uuid[])'::regprocedure;
  body := pg_get_functiondef(fn);
  if body not ilike '%is_published=v_is_published%' or body not ilike '%publication_preserved%' then
    raise exception 'editing a published question does not preserve publication';
  end if;
  fn := 'public.admin_unpublish_question(uuid)'::regprocedure;
  if not has_function_privilege('authenticated',fn,'EXECUTE') or has_function_privilege('anon',fn,'EXECUTE') then
    raise exception 'admin_unpublish_question grants are incorrect';
  end if;

  fn := 'public.admin_restore_question_version(uuid,uuid)'::regprocedure;
  body := pg_get_functiondef(fn);
  if body not ilike '%question_version_restored%' or body not ilike '%publication_preserved%' then
    raise exception 'version restoration is missing audit or publication preservation';
  end if;
  select c.relrowsecurity into table_rls from pg_class c where c.oid='public.admin_role_migration_0067_backup'::regclass;
  if not table_rls or has_table_privilege('authenticated','public.admin_role_migration_0067_backup','SELECT') then
    raise exception 'legacy role rollback map is not private';
  end if;
  if exists(select 1 from public.profiles where role='super_admin'::public.user_role) then
    raise exception 'legacy super_admin profiles remain after normalization';
  end if;

  fn := 'public.qbank_builder_filter_tree(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[])'::regprocedure;
  body := pg_get_functiondef(fn);
  if body not ilike '%base as materialized%' or body not ilike '%selected_sources as materialized%' then
    raise exception 'QBank filter tree is not reusing materialized candidate sets';
  end if;
  fn := 'public.get_study_session_state_compact(uuid,integer)'::regprocedure;
  body := pg_get_functiondef(fn);
  if body not ilike '%s.user_id=auth.uid()%' or not has_function_privilege('authenticated',fn,'EXECUTE')
      or has_function_privilege('anon',fn,'EXECUTE') then
    raise exception 'compact QBank session state ownership/grants are incorrect';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='questions_qbank_exam_subject_topic_idx') then
    raise exception 'QBank exam/subject/topic index is missing';
  end if;
end $$;

select 'admin_qbank_0067_contracts: PASS' as result;
rollback;
