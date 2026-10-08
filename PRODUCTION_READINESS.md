# Production readiness evidence

Status reflects database checks completed on 2026-10-08, application/load checks completed on 2026-10-09, and the first production Netlify deploy on 2026-10-09 against the checked-out source and Supabase project `yqadaomiudllzujngbba` (MDvoro Platform). It is evidence-based and does not claim complete security.

## Previous work and current baseline

- The user reported that the preceding Codex session hardened 33 files, passed `npm run verify`, created `MDvoro-FINAL-PRODUCTION-READY.zip`, and could not execute live database tests. This workspace's current source history is available from GitHub; the exact contents/source provenance of that earlier ZIP were not independently reconstructed.
- The restored source already contained the hardened MDvoro application, 43 database migrations, and local test/configuration documentation. `.env.local` contains the public Supabase project URL and publishable key and is ignored by Git; no service-role key or database password is required by the web application.
- The correct Supabase project was verified as MDvoro Platform, ref `yqadaomiudllzujngbba`. All 45 source migrations have now been applied and are present in the remote migration history.
- Applying migrations to real Postgres exposed runtime SQL defects that source checks had not detected. The migration sources were repaired, and two forward migrations were added: `0044_revoke_legacy_question_view.sql` removes an accidental read grant on the deprecated question view; `0045_restore_admin_mfa_gate.sql` restores AAL2 enforcement for admin and super-admin permissions.
- The temporary Supabase PAT was exposed in the dashboard's creation dialog and has been revoked. Supabase confirmed that no access tokens remain. It was not committed to the repository.

## Verification status

| Check | Status | Evidence / limitation |
|---|---|---|
| Supabase project connection | PASS | Local public URL/key point to the verified project. The temporary management token has since been revoked; it was not committed. |
| Database schema and migration history | PASS | All 45 migrations applied; remote migration history verified through `0045_restore_admin_mfa_gate`. |
| Production database contracts | PASS | `supabase/tests/production_db_contracts.sql` executed against the live project. |
| Security function/RLS contracts | PASS | `supabase/tests/security_contracts.sql` and `supabase/tests/rls_core.sql` executed against the live project. |
| Live student authorization and account isolation | PASS | Disposable student accounts could read their own profile, flashcards, and plans only. Protected question data and direct attempt writes were blocked. |
| Privilege escalation | PASS | A student could not change their role or call the admin role-management RPC. Invalid answer options were rejected. |
| Live admin authorization | PASS | An admin without AAL2 was denied `platform.users`; the same admin with AAL2 could list users. A student did not receive admin user data. |
| Flashcard and study-plan RPCs | PASS | Student create/review/delete, cross-account review/delete protection, study-plan upsert, and active-exam changes passed. |
| Leaderboard privacy and concurrent writes | PASS | Student opt-out displayed as “Anonymous student”. Five distinct answer submissions plus five concurrent retries with the same idempotency key produced exactly six canonical attempts and matching question/exam/daily projections. |
| Test-data cleanup | PASS | All disposable Auth users, exam/question fixtures, and dependent rows were removed; final check found zero test users and exams. |
| Full source, lint, typecheck, unit tests, and build | PASS | Re-run on 2026-10-09 in the current session: `npm run verify` passed all static gates, ESLint, TypeScript, four Vitest files / seven tests, the production dependency audit, and the production build; build generated all 61 pages. |
| Browser smoke and responsive tests | PASS | Re-run on 2026-10-09 against the optimized production server: 8/8 passed across Chromium and iPhone emulation. The application used the real Supabase URL/key from ignored `.env.local`; only anonymous requests were made, with no Auth users or database writes. Covers public/auth entry and legal pages across 21 page/viewport combinations (320–1440 px), anonymous redirects on protected student/admin pages, and 5 protected API routes returning 401. |
| GitHub Actions configuration | UPDATED | CI uses non-secret placeholder Supabase/origin/Turnstile values and a local Auth mock so verification does not depend on `.env.local` or the live project; it installs Chromium/WebKit and runs browser tests after `npm run verify`. Local verification with these values passed. |
| Production dependency audit | PASS | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities. |
| Full dependency audit | PASS | Re-run on 2026-10-09: `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` both report 0 vulnerabilities. The previously reported development-tool advisory is no longer returned by the current audit. |
| Local web-tier load probe | LIMITED PASS | Against the local optimized production server, 100/100, 500/500, 1,000/1,000, and 2,500/2,500 liveness requests passed with a 10-second timeout. At 5,000 requests, 3,710/5,000 passed before the 10-second timeout (p95 10.17s). Repeating 5,000 with a 30-second timeout passed 5,000/5,000 (p50 10.28s, p95 17.32s, p99 17.85s). This is a same-machine probe of `/api/health/live`, not a deployed capacity test and not a database/authenticated workload benchmark. |
| Supabase Auth configuration | PARTIAL / SECRET ROTATION REQUIRED | On 2026-10-09, Auth CAPTCHA was enabled with Cloudflare Turnstile; the provider secret was saved directly in Supabase and is not in the repository. The replacement secret was exposed in browser accessibility output during configuration and must be rotated again in Cloudflare after its rotation cooldown, then replaced in Supabase. Site URL is `https://mdvoro-platform.netlify.app`, and redirect allowlist contains `https://mdvoro-platform.netlify.app/**`. MFA remains enabled and AAL1 session duration limiting is on. Custom SMTP is still disabled and its production deliverability has not been verified. |
| Live signup and server-side CAPTCHA verification | FAIL | On 2026-10-09, the Cloudflare widget displayed success, but six real `/auth/v1/signup` requests returned HTTP 400. Supabase Auth logs identify `captcha_failed`: `captcha protection: request disallowed (invalid-input-secret)`. The Supabase Turnstile secret does not currently validate with Cloudflare. No account was created; signup and subsequent login are unavailable until the correct current widget secret is saved in Supabase. |
| Netlify connection and production deploy | PASS / PUBLIC; AUTH BLOCKED | On 2026-10-09, the Netlify project `mdvoro-platform` was created from `MDvoroPlatform/MDvoro` main using the Next.js runtime. Production deploy `6ac817fb80c8386cf47c7dee` completed successfully from commit `ca9616fe7cee3f5090903cee28b3109df8246b12`. Netlify confirms “Your project is public” and “Anyone can visit your production site.” The live URL `https://mdvoro-platform.netlify.app` opens the signup page and renders the Cloudflare Turnstile widget; however, live Supabase logs show server-side CAPTCHA verification fails, so signup and login are blocked. Netlify has the two Supabase public client values, site/origin URLs, and Turnstile site key as environment variables; no service-role key or database password is configured there. Deployed headers were processed, but an independent header audit, backups/PITR and recovery checks remain unverified. |
| Initial operations/content | BLOCKED | No production administrator has been provisioned, and the database contains schema but no production question/exam content or user accounts. Provisioning needs the operator's account and content with rights. |
| Legal/operator information | BLOCKED | Legal pages require the actual operator identity and contact information, plus review of privacy/vendor obligations; these facts cannot be invented. |
| GitHub publication | PASS | Source and current auth-boundary/CI updates are published to `main` in `MDvoroPlatform/MDvoro`; the remote head is verified after push. No `.env.local` or service-role secret was committed. |

## Findings fixed during live testing

- A later migration re-granted `authenticated` access to `public.question_public`. Live privilege inspection caught it. The view is not used by the application; the new migration revokes API access.
- Migration `0028` replaced the earlier MFA-protected `has_permission` function. Live admin checks found that the actual deployed function no longer enforced AAL2. A new migration restores the gate for both admin roles.
- Several migration syntax/type/signature defects were found only when Postgres parsed the actual migration chain. Corresponding source migrations were corrected before the full chain was applied.
- The original search-path contract test misclassified PostgreSQL's stored representation of an empty path (`search_path=""`); the SQL contract now accepts both equivalent catalog representations.

## Current load-test interpretation

The 5,000-request probe confirms the local production server eventually returned a successful liveness response to all requests when given 30 seconds, but response times were high. It does not establish that a hosted deployment can serve 5,000 real users or authenticated requests: the generator and server shared this workstation, and the probe did not exercise Supabase, login, QBank, admin, or other database-backed flows. A representative staging deployment and a controlled ramp test with test accounts are still required before making a capacity claim. No load was sent to the live Supabase project.

The latest full and production dependency audits both report zero vulnerabilities. Re-run the audits before each production release because advisory status changes over time.

## Application changes from the latest browser checks

- Protected student and admin page navigation now checks the verified session claims in Proxy and redirects anonymous visitors to `/login` before streaming the page shell. The page layouts, server authorization checks, MFA gates, and API checks remain in place.
- Added an isolated local Supabase Auth mock for browser tests. The mock always represents an unauthenticated visitor and cannot write to the MDvoro Supabase project.
- GitHub Actions now supplies non-secret CI-only environment values, installs Chromium/WebKit, and runs the browser suite after the full build verification.

## Release decision

**MDvoro is not yet fully production-ready, and signup/login are currently blocked.** The live database authorization, isolation, admin MFA, and concurrency gates have passed. On 2026-10-09, `npm run verify` passed the static gates, ESLint, TypeScript, all four Vitest files (7 tests), and production build (61 pages); both full and production dependency audits reported zero vulnerabilities. Netlify is publicly accessible at `https://mdvoro-platform.netlify.app`, but six live signup attempts failed with `captcha_failed` / `invalid-input-secret` after the browser widget itself displayed success. The Turnstile secret must be corrected in Supabase; its replacement appeared in browser accessibility output and should be rotated before saving the correct value. The old temporary PAT has been revoked. Remaining release gates include restoring server-side signup CAPTCHA verification, custom SMTP and email delivery verification, initial admin and content provisioning, verified backups/recovery and deployed-header review, representative hosted load testing, and operator/legal details. Do not put real student records in this project before those remaining release gates are complete.
