# MDvoro Phase 20 — Final Engineering Hardening

## Target
Raise the application toward enterprise-grade architecture while keeping AI disabled by default.

## Changes
- Atomic/idempotent QBank answer mutations with exact replay responses.
- Atomic/idempotent flashcard reviews with persisted transition snapshots.
- Append-only learner event ledger populated by database triggers.
- Profile timezone preference for learner-local day boundaries.
- Direct table writes for learner attempts/reviews removed; RPCs are authoritative.
- Legacy non-idempotent RPC signatures explicitly revoked.
- Server request IDs and safe 5xx handling for unexpected API errors.
- Safe local redirect handling in auth callback.
- Working password recovery and password reset screens.
- Keyboard-accessible flashcard review controls.
- Confidence capture in QBank for rules-based learning.
- AI admin endpoint is feature-flagged off by default.
- Enterprise static gate + deterministic CI requirement for package-lock.json.

## Verification boundary
Static/source checks are executable in this workspace. This project intentionally does not claim a numeric security or production-readiness score. Final release requires dependency-backed build/typecheck/tests, live Supabase migrations and RLS tests, staging E2E, SCA/audit, and external penetration testing.
- Rebuildable learner-question and learner-taxonomy projections with authoritative DB triggers.
- Adaptive question selection moved from repeated raw-history scans to indexed learner projections.
