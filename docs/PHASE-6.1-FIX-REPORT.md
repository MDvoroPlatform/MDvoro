# MDvoro Phase 6.1 — Fix & Hardening Report

Date: 2026-10-08

## Fixed blockers

- Removed incorrect `.parse().data` usage from question/team routes.
- Switched refined question update schema to `safeExtend`.
- Fixed duplicate `className` and admin navigation typing.
- Corrected taxonomy same-origin handling and added authorization/error/rate-limit handling.
- Added PostgreSQL drops before changed `RETURNS TABLE` function definitions in migration 0004.
- Replaced recursive `profiles` RLS policy with the permission helper.
- Added `flashcard_review` and `qbank_next` rate-limit actions.
- Added server-authoritative flashcard review scheduling and revoked direct scheduling/review writes.
- Added atomic question-taxonomy RPC and audit logging.
- Added student-safe media alt text.
- Added admin MFA enforcement through Supabase AAL2.
- Fixed CSP nonce propagation to request and response and removed inline progress styling.
- Added upload request-size gating and stronger media signature validation.
- Added anonymous RPC/view hardening.
- Added separation of duties for medical question review and AI suggestion review.
- Added AI job completion/failure contracts and an AI review route.
- Added flashcard creation RPC/API/UI.
- Added QBank request rate limiting, validation, cancellation-safe loading, and duplicate-submit protection.
- Added adaptive question selection that prioritizes unseen/weak/old questions.
- Added keyboard shortcuts and same-session relearning behavior to flashcards.
- Added Vitest path alias and CI quality/security contract checks.
- Removed stale `tsconfig.tsbuildinfo` and ignored future build-info files.
- Added static quality-contract and database security-contract tests.

## Verification completed in this environment

- `npm run check:architecture` — PASS
- `npm run check:quality` — PASS
- Static scan for duplicate `className` — PASS
- Static scan for `.parse(...).data` — PASS
- Static scan for inline `style=` in application/components — PASS
- Static CSS-class coverage scan — PASS
- No stale `tsconfig.tsbuildinfo` remains
- No client-side service-role/answer-key pattern detected by architecture gate

## Not falsely claimed

A real `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, or live Supabase migration reset was not possible in this offline environment because dependencies/node_modules and a live Postgres/Supabase instance were unavailable. The project therefore must still pass those commands in a networked CI environment before production deployment.
