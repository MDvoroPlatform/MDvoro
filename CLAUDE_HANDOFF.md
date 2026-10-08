# MDvoro — Claude Engineering Handoff

This document transfers the current project state to Claude so work can continue without restarting the project or repeating completed hardening. It contains no credentials.

## Executive summary

MDvoro is a Next.js learning platform backed by Supabase Auth and Postgres. The source is now published on the public GitHub repository `MDvoroPlatform/MDvoro`, branch `main`. The Supabase project is `MDvoro Platform`, ref `yqadaomiudllzujngbba`.

The source and database security work has advanced substantially, including real-database authorization and concurrency tests. **The application is not deployed and is not yet ready for a public production launch.** Hosting/domain, production Auth configuration, operational controls, initial administrator/content, and operator/legal details remain release gates. The owner plans to add a domain and publish later.

Do not restart MDvoro, redo the completed hardening, remove features, or claim full production readiness before the remaining release gates are verified.

## Repository and source of truth

- Repository: `https://github.com/MDvoroPlatform/MDvoro`
- Branch: `main`
- Current `main` commit: `d3d8707e0294d1ebc43d8529faeb8b86959cc3ff` (`Update GitHub publication readiness`).
- The application source commit immediately before the documentation-only readiness correction is `de705725af1ad141e14efddfd7a8b805f69850d6`.
- At handoff, local `main` was clean and matched `origin/main`.
- The repo is public. No `.env.local`, service-role key, database password, Supabase PAT, or other known secret was committed.
- Start by inspecting the current checkout, `git status`, recent commits, `PRODUCTION_READINESS.md`, `DEPLOYMENT.md`, and `ENVIRONMENT.md`. Do not treat an old ZIP as the source of truth.
- `MDvoro-FINAL-VERIFIED-PREDEPLOY.zip` is a pre-deployment archive, not a final production release. Do not label it production-ready.

## Project characteristics

- Next.js App Router, React, TypeScript strict mode, Supabase Auth/Postgres/RLS, Zod.
- Node is pinned to 22.23.3; npm is pinned in `package.json`.
- `npm run verify` is the consolidated source verification command. It includes static architecture/security contracts, production dependency audit, lint, typecheck, Vitest and production build.
- `npm run test:e2e` runs Playwright browser tests.
- `supabase/migrations/` contains the database evolution; use the live migration history and current files together before any schema operation.
- `npm run provision:admin` is the trusted CLI entry point for provisioning an existing Auth account as the first admin. Never expose its service-role key to browser code or commit it.

## Completed work and verified evidence

### Supabase / real Postgres

- The correct Supabase project was identified as `yqadaomiudllzujngbba` (MDvoro Platform).
- All 45 migrations in the source migration chain were applied to that project and the remote migration history was checked through `0045_restore_admin_mfa_gate`.
- Live SQL contracts passed: `supabase/tests/production_db_contracts.sql`, `supabase/tests/security_contracts.sql`, and `supabase/tests/rls_core.sql`.
- Disposable real Auth users and database fixtures were used, then removed. The final check reported zero test users and test exams.
- Student access, own-account profile/flashcard/study-plan isolation, protected question data, and blocked direct attempt writes passed.
- Privilege escalation attempts passed: students could not change roles or call the admin role-management RPC; invalid answer options were rejected.
- Admin authorization passed: an admin without AAL2/MFA was denied protected user access; the same admin with AAL2 was allowed; students could not read admin user data.
- Flashcard create/review/delete, cross-account access protections, study-plan upsert and active-exam changes passed.
- Leaderboard privacy passed. Concurrent test: five distinct answer submissions plus five concurrent retries sharing an idempotency key produced six canonical attempts and matching question/exam/daily projections.
- Live database tests exposed issues that were fixed before the suite passed: an accidental grant on a deprecated question view was revoked; AAL2 checks were restored for admin permissions; defects in migration SQL/signatures were corrected; the empty `search_path` contract was corrected.

### Source checks (run against the application commit `de705725...` before the docs-only `d3d8707...` commit)

- `npm run verify` passed after the final source cleanup.
- Four Vitest files / seven unit tests passed.
- ESLint reported zero warnings and zero errors; TypeScript passed; the production build generated 61 pages.
- `npm run test:e2e` passed 2/2 narrow auth-entry smoke tests (desktop Chromium and mobile WebKit). These are not a full end-to-end product suite and did not use production Auth credentials.
- `npm audit --omit=dev --audit-level=high` found zero vulnerabilities.
- `npm audit --audit-level=high` found zero vulnerabilities, including development dependencies.
- The latest commit `d3d8707...` changes only the readiness report to record the successful GitHub publication. The source checks were not rerun after that documentation-only change.

### GitHub publication

- Source upload to `main` succeeded and the remote SHA was verified.
- GitHub collaborator access was set up specifically for the existing local account `mdvoro`; a broad Git Credential Manager OAuth request was denied rather than granting wider permissions.
- Git credentials and one-time codes must never be copied into chat or source files.

## Credentials and secret-handling history

- A temporary Supabase management PAT was accidentally visible in the dashboard when created. It was revoked; Supabase showed no active access tokens afterward. Do not reuse or attempt to recover it. Do not create another management PAT unless a clearly necessary action requires it, and never show/store its value in chat or source.
- `.env.local` is ignored by Git and was not committed. It contains only the public Supabase project URL and publishable key in the local setup. Verify current local state privately; never print its contents into logs or chat.
- The app uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never use a service-role key in any `NEXT_PUBLIC_*` variable.
- `SUPABASE_SERVICE_ROLE_KEY` is for the trusted admin CLI only and must be entered through a secure local environment/secret manager, never committed or pasted into chat.
- No secrets should be requested when the action can be performed through a dashboard or local prompt without exposing them to Claude.

## Current release blockers (verified on 2026-10-08)

1. **No hosting deployment or production domain is configured.** Supabase is the backend/database; it does not publish this Next.js website. Coordinate a hosting provider choice with the owner when needed. The owner plans to add a domain and publish later.
2. **Production environment is unset.** See `ENVIRONMENT.md` and `DEPLOYMENT.md`. In production, configure at least:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (the canonical HTTPS origin)
   - `MDVORO_APP_ORIGIN` (same exact HTTPS origin)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - matching Turnstile secret and CAPTCHA provider in Supabase Auth settings
3. **Supabase Auth is still local-development oriented.** The dashboard showed Site URL `http://localhost:3000`, no production redirect URLs, signup and email confirmation enabled, and custom SMTP disabled. MFA was enabled and AAL1 session duration limiting was enabled. CAPTCHA status was not verified; local Turnstile site key was absent. After a domain/host exists, set the canonical Site URL and restrict allow-listed redirects, including `/auth/callback`, to intended production/staging origins. Configure reliable SMTP and verify confirmation/reset flows.
4. **Initial production admin and content are absent.** The database contains schema, not production accounts/questions/exams. Create the owner Auth account via normal signup, enable MFA, then provision only that exact account with the trusted admin CLI. Do not create a first-user-becomes-admin shortcut. Medical question content needs review/licensing before publication.
5. **Operations are unverified.** Configure and test Supabase backup/PITR and perform a restore drill; configure monitoring/alerting, production rate limits, WAF/edge protections and incident ownership. Verify deployed security headers, health/readiness endpoints, account lifecycle and production browser flows.
6. **External assurance is incomplete.** No independent penetration test or full DAST was completed. The checks found no known vulnerabilities in the tested scope; that is not proof that the application has no vulnerabilities.
7. **Operator/legal details are missing.** Legal/privacy/contact pages need the real operator identity, contact details, intended markets and review of privacy/vendor obligations. Do not invent these details.
8. **Documentation is inconsistent and needs a focused cleanup.** The GitHub README currently tells operators to apply migrations only through `0016_security_function_closure.sql` and lists live DB behavioral/RLS tests as future gates, while the verified project has 45 migrations applied and those live tests passed. Reconcile README and other user-facing setup docs with current verified evidence, keeping the actual remaining gates. Do not alter migration SQL/history merely to make documentation consistent.

## Recommended continuation plan

1. Inspect current GitHub checkout and worktree; preserve all existing source and uncommitted user changes.
2. Read `PRODUCTION_READINESS.md`, `DEPLOYMENT.md`, `ENVIRONMENT.md`, `.github/workflows/`, and Supabase migration history. Correct stale documentation identified above.
3. Work on remaining launch gates in owner-friendly steps. The user prefers simple Arabic instructions, one concrete action at a time, and does not want to handle technical details unnecessarily.
4. Do not assume a hosting provider or domain. The owner said domain setup and publication will happen later; finish all independent source/documentation/backend preparation and clearly identify what specifically requires that future domain/host.
5. When the owner provides the host/domain, configure environment secrets in the hosting provider’s secret manager and Supabase Auth URLs/CAPTCHA/SMTP. Never put secrets in GitHub, chat, screenshots, or `.env.example`.
6. Do not reapply the 45 migrations blindly to the already-migrated live project. Verify remote migration history first. Use a separate disposable staging project for new migration/RLS work, and use temporary fixtures with explicit cleanup.
7. After any code/config change, run `npm run verify`, `npm run test:e2e`, relevant live database checks, production dependency audit, and final build as applicable. Avoid destructive testing against real learner data.
8. Re-check actual deployed application and Supabase Auth flows after deployment. Update `PRODUCTION_READINESS.md` with evidence and leave the readiness decision as NOT READY until every production gate is objectively passed.
9. Create a clean final production archive only after production deployment and all release gates pass. Commit/push final changes with no credentials or `.env` files.

## Suggested first prompt to Claude

> Continue the existing MDvoro project from the current repository state. Read `CLAUDE_HANDOFF.md`, `PRODUCTION_READINESS.md`, `DEPLOYMENT.md`, and `ENVIRONMENT.md` first. Do not restart the project or redo completed hardening. The source is already on GitHub `main` at commit `d3d8707e0294d1ebc43d8529faeb8b86959cc3ff`; Supabase project `yqadaomiudllzujngbba` already has 45 migrations applied and the documented live RLS/admin/MFA/isolation/concurrency tests passed. First reconcile stale README/setup guidance with verified evidence and inspect the current worktree. Then complete every release gate that does not depend on a domain/hosting choice. The owner is nontechnical and wants the domain/public deployment later, so give simple Arabic instructions only when a specific owner action is unavoidable. Never expose or commit credentials. Do not claim production-ready until production hosting, Auth URLs/SMTP/CAPTCHA, operational recovery/monitoring, initial admin/content and deployed-flow checks are verified.
