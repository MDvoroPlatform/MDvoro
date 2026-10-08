-- MDvoro Phase 16: close remaining SECURITY DEFINER execution/search-path gaps.
-- Reproducible database hardening; safe to apply after Phase 15.

-- These user-facing reporting functions are intentionally callable only by signed-in users.
revoke all on function public.flashcard_review_queue(integer) from public, anon, authenticated;
grant execute on function public.flashcard_review_queue(integer) to authenticated;

revoke all on function public.flashcard_dashboard_stats() from public, anon, authenticated;
grant execute on function public.flashcard_dashboard_stats() to authenticated;

-- The auth trigger helper never needs direct Data API execution.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Supabase recommends an empty search_path for SECURITY DEFINER functions so an
-- untrusted caller cannot shadow unqualified objects (including temp objects).
-- All MDvoro SECURITY DEFINER bodies use schema-qualified application tables.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = ''''', fn.signature);
  end loop;
end;
$$;
