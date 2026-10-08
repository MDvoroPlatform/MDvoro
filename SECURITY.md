# Security policy

## Reporting

Do not publish exploitable findings in a public issue. Report suspected vulnerabilities privately to the project maintainer/security contact.

## Release gates

Run `npm ci` and `npm run verify`. Before production release, also execute the SQL contracts in `supabase/tests/` against a disposable Supabase database, review Supabase Security Advisor findings, and verify the deployed HTTP headers and auth settings. The local verification command does not substitute for those environment checks.

## Implemented controls

- Supabase Auth sessions use the SSR cookie integration and `getUser()` for server authorization.
- Staff HTTP access requires the database profile role and MFA assurance level AAL2.
- State-changing API routes use a canonical `MDVORO_APP_ORIGIN` same-origin check, bounded request bodies, input schemas, and rate limiting where available.
- Production requires explicit Supabase public configuration, `NEXT_PUBLIC_SITE_URL`, `MDVORO_APP_ORIGIN`, and the Turnstile site key. Origin configuration must be HTTPS and agree with the site URL.
- CSP uses per-request nonces and excludes `unsafe-inline` and `unsafe-eval`. Shared response headers are configured in `next.config.ts`.
- SQL migrations mark 40 public tables for RLS and define 81 policy declarations. Security-definer functions are normalized to an empty search path by migrations and checked by SQL contracts.
- Student answer evaluation and learning projections use database RPCs; direct writes to authoritative attempt/review records are revoked.

These are implementation claims backed by source checks. They are not a claim that production database policies, deployed headers, third-party settings, or every attack path have been independently verified.

## Secrets

Never commit Supabase service-role keys, provider API keys, database passwords, JWT signing secrets, or production environment files. Browser bundles may contain only publishable/public client configuration. The service-role key is used only by the explicit admin-provisioning CLI and must be supplied through its private operator environment.

## Known release blockers and limitations

- The full npm audit currently reports a high severity `braces` advisory via the development-only `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` dependency chain. npm reports no patched `braces` release and proposes downgrading the Next ESLint config to 14.x; that downgrade is not accepted. Production-only dependency audit is a separate gate.
- Database identity-isolation tests, Supabase Auth settings, Storage policies, Edge deployment behavior, and deployed CSP/security headers require a configured disposable/staging Supabase project and deployment environment.
- The project has no Git metadata in this workspace, so local history and tracked-secret review are unavailable.
- Complete the external penetration test before onboarding users with real private data.

See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md), [DEPLOYMENT.md](DEPLOYMENT.md), and [ENVIRONMENT.md](ENVIRONMENT.md).
