-- Run inside a disposable Supabase/Postgres database after all migrations.
do $$
declare v boolean; v_text text;
begin
  select relrowsecurity into v from pg_class where oid='public.profiles'::regclass;
  if not v then raise exception 'profiles RLS is disabled'; end if;
  select polqual::text into v_text from pg_policy where polrelid='public.profiles'::regclass and polname='admins read staff directory';
  if v_text is null or v_text ilike '%public.profiles p%' then raise exception 'recursive profiles policy detected'; end if;
  if has_table_privilege('authenticated','public.flashcards','INSERT') then raise exception 'authenticated can forge flashcards'; end if;
  if has_table_privilege('authenticated','public.flashcards','UPDATE') then raise exception 'authenticated can forge flashcard schedule'; end if;
  if has_table_privilege('authenticated','public.flashcard_reviews','INSERT') then raise exception 'authenticated can forge flashcard review events'; end if;
  if to_regclass('public.question_public') is not null then
    if has_table_privilege('anon','public.question_public','SELECT') then raise exception 'anon can read question_public'; end if;
    if has_table_privilege('authenticated','public.question_public','SELECT') then raise exception 'authenticated can read deprecated question_public view'; end if;
  end if;
  if to_regprocedure('public.review_flashcard(uuid,smallint,integer)') is not null
      and has_function_privilege('anon','public.review_flashcard(uuid,smallint,integer)','EXECUTE') then raise exception 'anon can execute legacy review_flashcard'; end if;
  if has_schema_privilege('authenticated','public','CREATE') then raise exception 'authenticated can CREATE in public schema'; end if;
  if pg_get_functiondef('public.has_permission(text)'::regprocedure) not ilike '%aal2%' then raise exception 'admin MFA gate missing from has_permission'; end if;
  if to_regprocedure('public.review_flashcard(uuid,smallint,integer)') is not null
      and has_function_privilege('authenticated','public.review_flashcard(uuid,smallint,integer)','EXECUTE') then raise exception 'legacy review_flashcard signature is executable'; end if;
  if to_regprocedure('public.review_flashcard(uuid,smallint,integer,uuid)') is null
      or not has_function_privilege('authenticated','public.review_flashcard(uuid,smallint,integer,uuid)','EXECUTE') then raise exception 'current review_flashcard signature missing'; end if;
  if to_regprocedure('public.submit_question_answer(uuid,text,integer,smallint)') is not null
      and has_function_privilege('authenticated','public.submit_question_answer(uuid,text,integer,smallint)','EXECUTE') then raise exception 'legacy submit_question_answer signature is executable'; end if;
  if to_regprocedure('public.submit_question_answer(uuid,text,integer,smallint,uuid)') is null
      or not has_function_privilege('authenticated','public.submit_question_answer(uuid,text,integer,smallint,uuid)','EXECUTE') then raise exception 'current submit_question_answer signature missing'; end if;
  if not has_function_privilege('authenticated','public.set_question_taxonomy(uuid,uuid[])','EXECUTE') then raise exception 'taxonomy RPC missing'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='taxonomy_nodes_root_slug_uidx') then raise exception 'root taxonomy uniqueness index missing'; end if;
end $$;

-- Every SECURITY DEFINER function in public must pin an empty search_path.
-- This prevents caller-controlled object shadowing when definer privileges apply.
do $$
declare
  unsafe_count integer;
begin
  select count(*) into unsafe_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
    and not coalesce(
      p.proconfig @> array['search_path=']::text[]
      or p.proconfig @> array['search_path=""']::text[], false
    );
  if unsafe_count > 0 then raise exception 'security_contract_failed: % public SECURITY DEFINER functions do not pin empty search_path', unsafe_count; end if;
end;
$$;


-- Future functions must not become API-callable by accident. A new RPC must
-- explicitly grant the role that needs it.
do $$
declare
  bad_defaults integer := 0;
begin
  if has_schema_privilege('authenticated','public','CREATE') then raise exception 'authenticated can CREATE in public schema'; end if;
  if has_function_privilege('anon','public.smart_student_snapshot()','EXECUTE') then raise exception 'anon can execute smart_student_snapshot'; end if;
end $$;

-- The student learning-context RPC must keep its publication/entitlement gate.
do $$
declare fn text;
begin
  fn := pg_get_functiondef('public.question_learning_context(uuid)'::regprocedure);
  if fn not ilike '%q.is_published = true%' then raise exception 'question_learning_context publication gate missing'; end if;
  if fn not ilike '%public.has_active_subscription()%' then raise exception 'question_learning_context entitlement gate missing'; end if;
end $$;

-- Library overview must remain the only count boundary for protected question data.
do $$
begin
  if not has_function_privilege('authenticated','public.library_overview()','EXECUTE') then raise exception 'library_overview RPC missing'; end if;
  if has_table_privilege('authenticated','public.questions','SELECT') then raise exception 'authenticated can bypass library question boundary'; end if;
end $$;


-- Scalable learner projections must remain server-maintained and inaccessible directly.
do $$
declare v_def text;
begin
  if has_table_privilege('authenticated','public.learner_question_stats','SELECT') then raise exception 'authenticated can read learner_question_stats directly'; end if;
  if has_table_privilege('authenticated','public.learner_taxonomy_mastery','SELECT') then raise exception 'authenticated can read learner_taxonomy_mastery directly'; end if;
  if not exists(select 1 from pg_trigger where tgname='learner_question_projection' and tgrelid='public.question_attempts'::regclass) then raise exception 'learner question projection trigger missing'; end if;
  v_def := pg_get_functiondef('public.project_question_attempt()'::regprocedure);
  if v_def not ilike '%security definer%' or not exists(
    select 1 from pg_proc p where p.oid='public.project_question_attempt()'::regprocedure
      and (p.proconfig @> array['search_path=']::text[] or p.proconfig @> array['search_path=""']::text[])
  ) then raise exception 'projection trigger security boundary missing'; end if;
  if not has_function_privilege('authenticated','public.get_next_question(uuid,text,text)','EXECUTE') then raise exception 'current get_next_question missing'; end if;
  if has_function_privilege('anon','public.get_next_question(uuid,text,text)','EXECUTE') then raise exception 'anon can execute get_next_question'; end if;
end $$;
