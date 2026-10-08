# MDvoro engineering standards

## Architecture

- UI composition lives in `app/` and `components/`; domain logic belongs in `lib/` or Supabase functions.
- Browser code never owns answer keys, entitlements, role checks, secrets, or authoritative learning mutations.
- Learning state is derived from immutable events and server-owned projections.
- Every database mutation exposed to the browser has a single authoritative server/database boundary.

## Security

- Prefer `security invoker`; use `security definer` only when RLS boundaries require it. Every definer function must set `search_path = ''` and schema-qualify objects.
- New RPCs are deny-by-default and receive explicit grants only after a security test is added.
- Mutation endpoints must enforce same-origin, authentication, authorization, input validation, size limits, rate limits, and no-store responses.

## Data correctness

- Client retries must be idempotent for authoritative learning mutations.
- Projection tables are rebuildable from source events and are never writable by learner roles.
- User-local concepts such as streaks and daily goals use the learner's stored timezone.

## Maintainability

- Keep functions small and single-purpose.
- Keep domain contracts close to their validation and tests.
- Prefer explicit types over `any`; avoid suppressions such as `@ts-ignore`.
- Do not add a dependency for functionality already available in the platform.
- Every new feature should include a migration, route contract, UI state model, and automated guard when applicable.

## Delivery

The merge gate is `npm run verify`. CI installs from `package-lock.json` using `npm ci`, then runs architecture, security, quality, typecheck, tests, and production build gates.

## Current verification boundary

Static/source verification is performed in this environment. Full runtime verification requires installing dependencies and connecting the project to a disposable Supabase/Postgres environment; the release must not be labeled fully verified until those gates pass.
