# Production readiness evidence

Status reflects checks completed on 2026-10-08 against the checked-out source and Supabase project `yqadaomiudllzujngbba` (MDvoro Platform). It is evidence-based and does not claim complete security.

## Previous work and current baseline

- The user reported that the preceding Codex session hardened 33 files, passed `npm run verify`, created `MDvoro-FINAL-PRODUCTION-READY.zip`, and could not execute live database tests. That history and the ZIP's source provenance could not be verified because this restored checkout had no Git commits or history.
- The restored source already contained the hardened MDvoro application, 43 database migrations, and local test/configuration documentation. `.env.local` contains the public Supabase project URL and publishable key and is ignored by Git; no service-role key or database password is required by the web application.
- The correct Supabase project was verified as MDvoro Platform, ref `yqadaomiudllzujngbba`. All 45 source migrations have now been applied and are present in the remote migration history.
- Applying migrations to real Postgres exposed runtime SQL defects that source checks had not detected. The migration sources were repaired, and two forward migrations were added: `0044_revoke_legacy_question_view.sql` removes an accidental read grant on the deprecated question view; `0045_restore_admin_mfa_gate.sql` restores AAL2 enforcement for admin and super-admin permissions.

## Verification status

| Check | Status | Evidence / limitation |
|---|---|---|
| Supabase project connection | PASS | Supabase URL and publishable key point to the verified project; token was used transiently from the local clipboard and not saved in the repository. |
| Database schema and migration history | PASS | All 45 migrations applied; remote migration history verified through `0045_restore_admin_mfa_gate`. |
| Production database contracts | PASS | `supabase/tests/production_db_contracts.sql` executed against the live project. |
| Security function/RLS contracts | PASS | `supabase/tests/security_contracts.sql` and `supabase/tests/rls_core.sql` executed against the live project. |
| Live student authorization and account isolation | PASS | Disposable student accounts could read their own profile, flashcards, and plans only. Protected question data and direct attempt writes were blocked. |
| Privilege escalation | PASS | A student could not change their role or call the admin role-management RPC. Invalid answer options were rejected. |
| Live admin authorization | PASS | An admin without AAL2 was denied `platform.users`; the same admin with AAL2 could list users. A student did not receive admin user data. |
| Flashcard and study-plan RPCs | PASS | Student create/review/delete, cross-account review/delete protection, study-plan upsert, and active-exam changes passed. |
| Leaderboard privacy and concurrent writes | PASS | Student opt-out displayed as “Anonymous student”. Five distinct answer submissions plus five concurrent retries with the same idempotency key produced exactly six canonical attempts and matching question/exam/daily projections. |
| Test-data cleanup | PASS | All disposable Auth users, exam/question fixtures, and dependent rows were removed; final check found zero test users and exams. |
| Full source, lint, typecheck, unit tests, and build | PASS | `npm run verify` completed. Four Vitest files / seven tests passed; production build generated all 61 pages. ESLint reports 0 errors and 3 existing warnings. |
| Production dependency audit | PASS | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities. |
| Full dependency audit | PASS | `npm audit --audit-level=high`: 0 vulnerabilities, including development dependencies. |
| Deployed application and external Auth settings | BLOCKED | No production hosting deployment or canonical production domain is configured/verified. Production Turnstile site/secret, SMTP and email verification, Auth redirect allowlist, production environment values, deployed response headers, backup/PITR, and recovery checks still need to be configured and verified. The Supabase project was initially empty and currently has schema but no production content/accounts. |
| GitHub publication | BLOCKED | Local source commit `fd4ee9a` was created, but `git push -u origin main` returned HTTP 403: GitHub denied write access to the authenticated account `mdvoro` for `MDvoroPlatform/MDvoro`. No source was pushed. |

## Findings fixed during live testing

- A later migration re-granted `authenticated` access to `public.question_public`. Live privilege inspection caught it. The view is not used by the application; the new migration revokes API access.
- Migration `0028` replaced the earlier MFA-protected `has_permission` function. Live admin checks found that the actual deployed function no longer enforced AAL2. A new migration restores the gate for both admin roles.
- Several migration syntax/type/signature defects were found only when Postgres parsed the actual migration chain. Corresponding source migrations were corrected before the full chain was applied.
- The original search-path contract test misclassified PostgreSQL's stored representation of an empty path (`search_path=""`); the SQL contract now accepts both equivalent catalog representations.

## Release decision

**MDvoro is not yet fully production-ready.** The live database authorization, isolation, admin MFA, and concurrency gates have passed, and no known dependency vulnerabilities remain. A real deployment cannot be called production-ready until the hosting target/domain and production environment are established, Supabase Auth CAPTCHA/SMTP/verification/redirect settings are configured, the initial administrator is provisioned with MFA, backups/recovery and deployed headers are verified, and the release is exercised against those production settings. Do not put real student records in this project before those remaining release gates are complete.
