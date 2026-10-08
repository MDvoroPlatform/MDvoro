# MDvoro Production Security Release Gate

## Status

This document is a release gate, not a numeric security score. MDvoro does not claim "99/100" or any equivalent guarantee.

## Implemented hardening

- CSP no longer uses `unsafe-inline` for scripts or styles.
- Page CSP is nonce-based and generated per request.
- Signup requires Cloudflare Turnstile in production.
- Production state-changing requests fail closed when `MDVORO_APP_ORIGIN` is missing or invalid.
- `NEXT_PUBLIC_SITE_URL` and `MDVORO_APP_ORIGIN` are required in production and must match.
- A public Turnstile site key is required by the web application; the matching secret must be configured in Supabase Auth CAPTCHA settings.
- Source-level RLS gate currently verifies 40/40 public tables have an RLS enable marker.
- Database contract suite is designed to verify RLS state, protected table privileges and SECURITY DEFINER search paths against a real PostgreSQL/Supabase database when run.
- Historical numeric readiness claims were removed from project documentation.

## Required before public launch

1. Configure the production Supabase project and apply every migration in order.
2. Configure Supabase CAPTCHA/Turnstile with the same production site key/secret.
3. Run `supabase/tests/rls_core.sql`, `supabase/tests/security_contracts.sql`, and `supabase/tests/production_db_contracts.sql` against a disposable production-like database.
4. Install dependencies from the committed lockfile with `npm ci`.
5. Run `npm run verify` and resolve lint/type/test/build failures.
6. Run the Playwright E2E suite against a staging deployment.
7. Run `npm run security:audit` and review the full dependency report. The current full audit reports a high severity issue in a development-only Next lint plugin dependency chain; npm reports no patched `braces` version. `npm run security:audit:production` checks runtime dependencies separately.
8. Verify production response headers with an external scanner and verify CSP reports/violations.
9. Perform an external penetration test before making security-sensitive claims.

## Important limitation

A source scan cannot prove that PostgreSQL policies behave correctly for real `anon` and `authenticated` sessions. The runtime SQL suite exists specifically to close that evidence gap. Until it has been executed against the deployed database, RLS runtime verification remains an open release gate.

Local `npm run verify` passes source gates, lint (with three warnings), typecheck, unit tests and a production build; the production dependency audit reports zero vulnerabilities. The full dependency audit reports high severity `braces` advisories in the development-only lint tool chain. Live database authorization and deployed security settings remain unverified. The project is not yet cleared for production use with real student data.
