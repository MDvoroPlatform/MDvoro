# MDvoro Phase 11 — Production Hardening Audit

## Scope
Static and structural audit of the Phase 10 codebase, followed by targeted hardening for request boundaries, answer integrity, study-plan invariants, AI payload limits, and API error hygiene.

## Checks passed
- `node scripts/check-architecture.mjs` — passed.
- `node scripts/check-quality.mjs` — passed.
- Application scan for `parse(...).data` misuse — 0 matches.
- Explicit `any` in application code — 0 matches.
- TODO/FIXME/HACK markers in application/security code — 0 matches.
- High-confidence API-key/token patterns in project files — 0 matches.
- Client architecture scan prevents server-only imports/secrets in client components.

## Hardening completed
1. Bulk question import is rate-limited before parsing the request body.
2. Bulk import no longer returns Zod validation internals to the client.
3. Study-plan writes now require same-origin requests, have a body-size ceiling, and are rate-limited.
4. QBank answer requests have a body-size ceiling.
5. Flashcard creation has a body-size ceiling.
6. Exam-selection writes have a body-size ceiling.
7. Server-side question answering rejects answer IDs that are not present in the published question options.
8. Historical duplicate study plans are reconciled deterministically before enforcing one active plan per learner.
9. AI generation input receives a database-level size constraint in addition to application validation.
10. Anonymous access is explicitly revoked for the sensitive AI/study-plan tables.

## Verification limitation
The environment did not have the project's npm dependencies installed. Two attempts to install dependencies timed out, so a genuine Next.js production build, ESLint run, Vitest run, Playwright run, and live Supabase migration were not claimed as successful. A bare global TypeScript compiler was also unable to resolve the project's framework dependencies, so its output was dependency-missing noise rather than a valid project typecheck.

A final production gate still requires running, in the real project environment:
- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Supabase migrations against a disposable database
- Playwright E2E against the built app
- `npm audit --audit-level=high`
