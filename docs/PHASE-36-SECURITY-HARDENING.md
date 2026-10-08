# MDvoro Phase 36 — Security & Production Hardening

## Changes completed

### CSP / XSS
- Removed `unsafe-inline` from the static Next.js security headers.
- Kept a per-request nonce CSP in the proxy.
- Added explicit Cloudflare Turnstile origins only where required.
- Kept `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, and HTTPS upgrade protections.

### Origin / CSRF
- Production no longer trusts the incoming request URL as its own origin.
- `MDVORO_APP_ORIGIN` is mandatory in production.
- Origin and Referer are normalized and compared against the configured canonical origin.
- Missing browser Origin/Referer is rejected for mutation requests.

### Signup abuse protection
- Signup now requires Cloudflare Turnstile.
- The token is passed to Supabase Auth using `captchaToken`.
- The production site key is required.
- The CAPTCHA provider secret remains server-side in the Supabase Auth CAPTCHA configuration; it is never exposed to the browser.

### Database / RLS evidence
- Source gate confirms 40/40 public tables have an RLS enable marker.
- Source inventory currently contains 81 CREATE POLICY statements.
- Added a runtime SQL contract suite covering RLS state, protected privileges and SECURITY DEFINER search paths.
- The runtime suite is intentionally not reported as passed until executed against a real disposable/production-like Supabase database.

### Documentation integrity
- Removed the 99/100 numeric readiness claim.
- Added explicit release gates and limitations.
- The project now distinguishes source-level verification from runtime database/build verification.

## Verification performed in this environment

PASS:
- RLS source gate: 40/40 tables
- Database source gate: 40 tables, 81 policies
- Quality contract check
- JavaScript syntax checks for modified `.mjs` scripts
- No `unsafe-inline` remains in application CSP configuration
- No production Turnstile secret is exposed in application source

NOT VERIFIED:
- `npm ci` / dependency-backed build
- TypeScript typecheck with installed project dependencies
- Vitest
- Playwright E2E
- Runtime Supabase RLS tests

Reason: the supplied project has no `package-lock.json`, and npm dependency resolution could not complete in this execution environment because the registry was unavailable. No false PASS is recorded.

## Release blocker

Generate and commit `package-lock.json`, then run:

```bash
npm ci
npm run verify
npm run test:e2e
npm run security:audit
```

After migrations are applied to a disposable Supabase database, execute:

```text
supabase/tests/rls_core.sql
supabase/tests/security_contracts.sql
supabase/tests/production_db_contracts.sql
```

Only after those gates pass should the project be treated as production-ready.
