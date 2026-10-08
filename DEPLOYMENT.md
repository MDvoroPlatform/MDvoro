# Deployment

## Build and start

Use Node.js 22.23.3 as specified in `.nvmrc` and npm. Install from the committed lockfile with `npm ci`, run `npm run verify`, then run `npm run build` and `npm start` in the hosting environment.

Set the production variables in `ENVIRONMENT.md` before build and runtime. Production startup fails closed when required public Supabase, canonical site origin, or Turnstile configuration is absent or invalid. `NEXT_PUBLIC_SITE_URL` and `MDVORO_APP_ORIGIN` must share an HTTPS origin.

## Supabase release sequence

1. The MDvoro Platform project (`yqadaomiudllzujngbba`) currently has all 45 migrations applied. Use a separate disposable staging project for future schema changes.
2. Live SQL/RLS contracts and disposable student/admin isolation, privilege-escalation, flashcard, study-plan, leaderboard privacy, and concurrent-idempotency checks have passed against the current project. Review Auth redirect URLs, MFA, email verification, CAPTCHA, SMTP, backup/PITR, and rate limits in Supabase settings before launch.
3. Configure the auth callback URL at `/auth/callback` and restrict redirect URLs to the production origin.
4. Provision the initial administrator with the trusted CLI only, then enable MFA before granting production access.
5. Verify deployed CSP and security headers, signup CAPTCHA, state-changing same-origin behavior, health/readiness responses and account lifecycle flows.

Production hosting, domain, production environment values, and external Auth/service settings have not been configured. Treat those as release gates; see `PRODUCTION_READINESS.md` for the current evidence.

## Health endpoints

- `/api/health/live` reports process liveness without depending on Supabase.
- `/api/health/ready` performs an authenticated-client database read and returns 503 when Supabase is unavailable.

## Rollback

Use the hosting provider's previous immutable application release and the Supabase backup/PITR process configured for the project. Review migration reversibility before deployment; this repository does not provide an automated rollback migration for all 45 schema changes.
