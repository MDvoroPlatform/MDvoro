# Production readiness evidence

Status reflects database checks completed on 2026-10-08 and application/load checks completed on 2026-10-09 against the checked-out source and Supabase project `yqadaomiudllzujngbba` (MDvoro Platform). It is evidence-based and does not claim complete security.

## Previous work and current baseline

- The user reported that the preceding Codex session hardened 33 files, passed `npm run verify`, created `MDvoro-FINAL-PRODUCTION-READY.zip`, and could not execute live database tests. That history and the ZIP's source provenance could not be verified because this restored checkout had no Git commits or history.
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
| Full source, lint, typecheck, unit tests, and build | PASS | `npm run verify` completed on 2026-10-09. Static gates, ESLint, TypeScript, four Vitest files / seven tests, production dependency audit, and production build passed; build generated all 61 pages. |
| Browser smoke and responsive tests | PASS | `npm run test:e2e -- --workers=1`: 4/4 tests passed across desktop Chromium and iPhone emulation, covering public/auth entry and responsive public/legal pages. These use local development configuration, not production Auth credentials. |
| Production dependency audit | PASS | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities. |
| Full dependency audit | WARNING | `npm audit --audit-level=high` reports one newly published high-severity advisory (CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm) through the development-only chain `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. `braces@3.0.3` is the latest published release and is affected; no patched upstream version is available. The production dependency audit remains clean. |
| Local web-tier load probe | LIMITED PASS | Against the local optimized production server, 100/100, 500/500, 1,000/1,000, and 2,500/2,500 liveness requests passed with a 10-second timeout. At 5,000 requests, 3,710/5,000 passed before the 10-second timeout (p95 10.17s). Repeating 5,000 with a 30-second timeout passed 5,000/5,000 (p50 10.28s, p95 17.32s, p99 17.85s). This is a same-machine probe of `/api/health/live`, not a deployed capacity test and not a database/authenticated workload benchmark. |
| Supabase Auth configuration | BLOCKED | Dashboard shows site URL `http://localhost:3000` and no redirect URLs. Email signups and confirmation are enabled, but custom SMTP is disabled. MFA shows enabled and AAL1 session duration limiting is on. CAPTCHA status was not verified, and the local Turnstile site key is absent. |
| Deployment and domain | BLOCKED | No hosting account/project or verified production domain is connected. The local canonical origin is localhost; production environment values, deployed headers, backups/PITR, and recovery checks remain unverified. |
| Initial operations/content | BLOCKED | No production administrator has been provisioned, and the database contains schema but no production question/exam content or user accounts. Provisioning needs the operator's account and content with rights. |
| Legal/operator information | BLOCKED | Legal pages require the actual operator identity and contact information, plus review of privacy/vendor obligations; these facts cannot be invented. |
| GitHub publication | PASS | The verified source is published on `main` in `MDvoroPlatform/MDvoro`. Remote `refs/heads/main` was checked on 2026-10-09 and matches local commit `2cac4ff6e86e915440f3640eb3f7fd5c37e2d29f`. No `.env.local` or service-role secret was committed. |

## Findings fixed during live testing

- A later migration re-granted `authenticated` access to `public.question_public`. Live privilege inspection caught it. The view is not used by the application; the new migration revokes API access.
- Migration `0028` replaced the earlier MFA-protected `has_permission` function. Live admin checks found that the actual deployed function no longer enforced AAL2. A new migration restores the gate for both admin roles.
- Several migration syntax/type/signature defects were found only when Postgres parsed the actual migration chain. Corresponding source migrations were corrected before the full chain was applied.
- The original search-path contract test misclassified PostgreSQL's stored representation of an empty path (`search_path=""`); the SQL contract now accepts both equivalent catalog representations.

## Current load-test interpretation

The 5,000-request probe confirms the local production server eventually returned a successful liveness response to all requests when given 30 seconds, but response times were high. It does not establish that a hosted deployment can serve 5,000 real users or authenticated requests: the generator and server shared this workstation, and the probe did not exercise Supabase, login, QBank, admin, or other database-backed flows. A representative staging deployment and a controlled ramp test with test accounts are still required before making a capacity claim. No load was sent to the live Supabase project.

The current full dependency audit also has one unresolved development-tool advisory. It is not in the production dependency tree, and the package's latest published version has no upstream fix yet. Re-run the audit and update the Next ESLint toolchain when the maintainer publishes a patched release.

## Release decision

**MDvoro is not yet fully production-ready.** The live database authorization, isolation, admin MFA, and concurrency gates have passed, and the production dependency tree has no known vulnerabilities. The full audit has one unresolved high-severity development-tool advisory. Production use still requires a hosting target and verified domain, production environment values, CAPTCHA and SMTP configuration, Auth redirect URLs, initial admin and content provisioning, verified backups/recovery and deployed headers, representative hosted load testing, and operator/legal details. The exposed temporary PAT has been revoked. Do not put real student records in this project before those remaining release gates are complete.
