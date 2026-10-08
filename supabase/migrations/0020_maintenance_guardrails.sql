-- MDvoro Phase 19: future-change guardrails.
-- Prevent newly-created public functions from silently becoming callable through
-- the Supabase Data API. New application RPCs must explicitly grant the role
-- that needs them.

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- Keep the current database posture explicit as well.
revoke execute on all functions in schema public from anon;

