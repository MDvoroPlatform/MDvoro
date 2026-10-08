# Contributing to MDvoro

## Development loop

1. Create a focused branch.
2. Read `docs/AI-CODING-GUIDE.md`.
3. Keep domain logic typed and close to its domain.
4. Add database migrations for schema changes.
5. Add tests for authorization/workflow behavior.
6. Run lint, typecheck, tests and build.
7. Review the diff for secrets, direct database access, PII logging and privilege escalation.

## Code organization

- `app/` — routes, pages and API boundaries.
- `components/` — UI and client interactions.
- `lib/server/` — authentication/authorization/API infrastructure.
- `lib/content/` — content-domain utilities and contracts.
- `lib/validation/` — Zod input schemas.
- `supabase/migrations/` — immutable database evolution.
- `supabase/tests/` — database security tests.
- `docs/` — architecture and operational contracts.

## Pull request checklist

- [ ] No client-side authorization is relied upon.
- [ ] No secrets or service-role keys reach the client bundle.
- [ ] New mutations validate input.
- [ ] Privileged mutations are rate limited where appropriate.
- [ ] RLS/RPC permissions are updated.
- [ ] Audit trail exists for staff/content actions.
- [ ] Medical content has a source/license record when external.
- [ ] No copyrighted source content was copied without permission.
- [ ] Tests updated.
- [ ] Build/typecheck/lint results reported honestly.
