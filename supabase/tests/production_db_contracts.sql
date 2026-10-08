-- Execute this file only against a disposable Supabase/Postgres database after all migrations.
-- This is intentionally a runtime contract, not a static source scan.
begin;
do $$
declare
  expected text[] := array[
    'profiles','subscriptions','questions','question_attempts','flashcard_decks','flashcards',
    'flashcard_reviews','study_plans','media_assets','media_sources','question_media',
    'question_versions','content_reviews','content_audit_logs','permissions','role_permissions',
    'rate_limit_buckets','learner_question_stats','learner_taxonomy_mastery',
    'learner_exam_stats','learner_exam_daily_stats'
  ];
  t text;
  enabled boolean;
begin
  foreach t in array expected loop
    if to_regclass('public.'||t) is null then
      raise exception 'required table missing: public.%', t;
    end if;
    select relrowsecurity into enabled from pg_class where oid=('public.'||t)::regclass;
    if not enabled then raise exception 'RLS disabled: public.%', t; end if;
  end loop;
end $$;

-- Every SECURITY DEFINER function in public must pin an empty search_path.
do $$
declare n integer;
begin
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.prosecdef
    and not coalesce(
      p.proconfig @> array['search_path=']::text[]
      or p.proconfig @> array['search_path=""']::text[], false
    );
  if n > 0 then raise exception '% public SECURITY DEFINER functions have unsafe search_path', n; end if;
end $$;

-- Client roles must not receive direct access to canonical protected question data.
do $$
begin
  if has_table_privilege('anon','public.questions','SELECT') then raise exception 'anon can SELECT questions'; end if;
  if has_table_privilege('authenticated','public.questions','SELECT') then raise exception 'authenticated can SELECT questions'; end if;
  if has_table_privilege('authenticated','public.question_attempts','INSERT') then raise exception 'authenticated can forge attempts'; end if;
  if has_table_privilege('authenticated','public.flashcard_reviews','INSERT') then raise exception 'authenticated can forge reviews'; end if;
  if has_schema_privilege('authenticated','public','CREATE') then raise exception 'authenticated can CREATE in public schema'; end if;
end $$;
select 'production_db_contracts: PASS' as result;
rollback;
