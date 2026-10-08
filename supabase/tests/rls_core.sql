-- Run after migrations against a disposable Supabase/Postgres database.
-- This uses native assertions so it can also run through the Supabase Management API
-- without installing pgTAP into a production project.
begin;

do $$
declare
  expected record;
begin
  for expected in
    select * from (values
      ('profiles','users read own profile'),
      ('question_attempts','users read own attempts'),
      ('flashcards','owners read cards'),
      ('flashcards','owners update cards'),
      ('flashcard_reviews','users read own reviews'),
      ('study_plans','users read own study plans'),
      ('study_plans','users delete own study plans'),
      ('media_assets','students read linked published media')
    ) as policy(table_name,policy_name)
  loop
    if not exists (
      select 1 from pg_policy p
      join pg_class c on c.oid=p.polrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=expected.table_name and p.polname=expected.policy_name
    ) then
      raise exception 'missing RLS policy: public.%.%', expected.table_name, expected.policy_name;
    end if;
  end loop;

  if has_table_privilege('authenticated','public.questions','SELECT') then raise exception 'students have direct question-table SELECT'; end if;
  if has_table_privilege('authenticated','public.question_versions','SELECT') then raise exception 'students have direct question_versions SELECT'; end if;
  if has_table_privilege('authenticated','public.question_attempts','INSERT') then raise exception 'students can forge attempts directly'; end if;
  if has_table_privilege('authenticated','public.rate_limit_buckets','SELECT') then raise exception 'rate-limit state is directly readable'; end if;
  if has_table_privilege('authenticated','public.flashcard_reviews','INSERT') then raise exception 'students can forge flashcard reviews directly'; end if;
end $$;

select 'rls_core: PASS' as result;
rollback;
