-- The deprecated compatibility view was re-granted to authenticated in 0036.
-- Student delivery uses security-checked RPCs; prevent direct API reads.
revoke all on public.question_public from public, anon, authenticated;
