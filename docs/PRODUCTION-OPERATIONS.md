# MDvoro production operations

## Release gate

1. Commit the generated `package-lock.json` from a networked CI runner.
2. Run `npm ci` with Node 22.23.3.
3. Run `npm run verify` and require all gates to pass.
4. Run the Supabase/Postgres security suite against a disposable database.
5. Apply migrations in order and verify RLS/grants after migration.
6. Run Playwright against a preview deployment before production.
7. Deploy with health endpoints available at `/api/health/live` and `/api/health/ready`.

## Availability

- Keep the live endpoint free of database dependencies so a process restart can be detected independently from database readiness.
- Route traffic only to instances that pass the readiness check.
- Keep database failures isolated behind friendly error states; do not expose raw provider or SQL errors to learners.
- Use a managed platform with automatic restart/health checks rather than relying on an in-process watchdog.
- Configure database backups, point-in-time recovery and restoration drills in the Supabase project; verify restores on a schedule.

## Observability

At minimum, monitor request errors, response latency, client crashes, Web Vitals, database latency, authentication failures, rate-limit events and deployment versions. Every production incident should have a correlation/request identifier so a learner action can be traced across the HTTP/API/database path.

## Secrets

- Keep Supabase service-role keys and AI/provider keys server-side only.
- Never place provider secrets in browser code, URLs, source-controlled `.env` files or logs.
- Rotate compromised keys immediately and invalidate the old credential.
- Use deployment-secret storage rather than committing production secrets.

## Payments

The admin revenue dashboard is an operational view over `billing_transactions`. The payment provider webhook/settlement system remains the accounting source of truth. Production webhooks must validate signatures and be idempotent.

## Recovery

Maintain tested procedures for account recovery, data restoration, content rollback, disabling a compromised account, and deploying a previous known-good release. A backup is not considered a recovery plan until a restore has been tested.
