# Deployment

## Build and start

Use Node.js 22.23.3 as specified in `.nvmrc` and npm. Install from the committed lockfile with `npm ci`, run `npm run verify`, then run `npm run build` and `npm start` in the hosting environment.

Set the production variables in `ENVIRONMENT.md` before build and runtime. Production startup fails closed when required public Supabase, canonical site origin, or Turnstile configuration is absent or invalid. `NEXT_PUBLIC_SITE_URL` and `MDVORO_APP_ORIGIN` must share an HTTPS origin.

## Supabase release sequence

1. The latest recorded live migration history ends at `0045_restore_admin_mfa_gate`. The repository contains additional migrations through version `0052`; several later SQL changes were applied manually and are not recorded in the remote migration history. **Do not run `supabase db push` against production until the live schema has been compared with every unrecorded migration and the already-applied versions have been reconciled with `supabase migration repair`.** Use a disposable staging project for this reconciliation first.
2. Live SQL/RLS contracts and disposable student/admin isolation, privilege-escalation, flashcard, study-plan, leaderboard privacy, and concurrent-idempotency checks passed in earlier verification. Re-run them against staging after migration-history reconciliation. Review Auth redirect URLs, MFA, email verification, CAPTCHA, SMTP, backup/PITR, and rate limits in Supabase settings before launch.
3. Configure the auth callback URL at `/auth/callback` and restrict redirect URLs to the production origin.
4. Provision the initial administrator with the trusted CLI only, then enable MFA before granting production access.
5. Verify deployed CSP and security headers, signup CAPTCHA, state-changing same-origin behavior, health/readiness responses and account lifecycle flows.

The application is deployed to Netlify at `https://mdvoro-platform.netlify.app` and `https://mdvoro.com`. The deployment and application health endpoints were verified during the 2026-10-23 audit. Custom SMTP delivery, backup/PITR recovery, migration-history reconciliation, independent header/security review, and hosted workload capacity remain release gates; see `PRODUCTION_READINESS.md` for evidence and dates.

## Health endpoints

- `/api/health/live` reports process liveness without depending on Supabase.
- `/api/health/ready` performs an authenticated-client database read and returns 503 when Supabase is unavailable.

## Rollback

Use the hosting provider's previous immutable application release. The current Supabase backup/PITR configuration and a successful restore have not been verified. Review migration reversibility before deployment; this repository does not provide automated rollback migrations for the full schema history.
