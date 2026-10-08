# MDvoro Phase 28 — QBank + Admin + Legal Final Audit

## Learner QBank

- Exam selection: IMLE, USMLE Step 1, USMLE Step 2 profiles are data-driven.
- Subject selection: zero, one, many, or all supported subjects.
- Topic selection: constrained by selected subjects and supports multiple/all topics.
- Question count: 1–300 product cap; exact official item limits remain separate in exam profiles.
- Practice mode: untimed.
- Exam mode: server-authoritative timer and block rules; exact official timing is claimed only when the selected count reaches the verified official item limit.
- Mark for review, per-question notes, deterministic up-to-three key terms, question navigator, review history, and saved sessions are present.
- Result pages expose score, answered/incorrect/unanswered counts, subject/topic breakdowns, per-question review, notes, key terms, and follow-up pools.
- Pool semantics: `unseen` means never answered; `incorrect` means learner has at least one wrong answer; `answered` means at least one attempt; `unanswered` means left unanswered in the latest completed/expired session; `bookmarked` means explicitly saved.

## Current official USMLE timing used by verified profiles

- Step 1, on/after May 14, 2026: 14 × 30-minute blocks, up to 20 items per block, 8-hour session, minimum 55-minute break, optional 5-minute tutorial.
- Step 2 CK, on/after May 7, 2026: 16 × 30-minute blocks, up to 20 items per block, 9-hour session, minimum 55-minute break, optional 5-minute tutorial.
- MDvoro intentionally caps learner sessions at 300 questions. Therefore a 300-item Step 2 session is not represented as an exact full official form; it uses scaled 30-minute block pacing and is labeled accordingly.
- IMLE timing remains operator-configured until the official current schedule is independently verified.

## Admin / Super Admin

- Online users: derived from heartbeat/presence over the last 5 minutes.
- Revenue: separated by currency; monthly CSV export is available to admins. Provider settlement remains the accounting source of truth.
- Users & access: status, lifecycle controls, and role controls are permission-gated; super-admin actions require the super-admin role and admin MFA.
- Exam profiles: super-admin can change official limit, MDvoro product cap, timing, block size, breaks, review policy, enablement, and verification metadata without changing application code.
- Audit & copyright, system, integrations, content, media, taxonomy, knowledge, import, and review areas are role-gated.

## Account / legal / availability

- Account deletion requires an explicit `DELETE` confirmation and rate-limits the endpoint.
- Cookie consent is implemented for the current cookie usage. Optional analytics/marketing cookies should not be introduced without expanding the consent model.
- Privacy, cookies, terms, copyright, and DMCA pages exist.
- DMCA page intentionally does not claim safe-harbor readiness until truthful designated-agent details are configured and the agent is registered with the U.S. Copyright Office where applicable.
- Health, liveness, and readiness endpoints exist; production backups, alerting, provider failover, and disaster-recovery configuration remain deployment responsibilities.

## Deployment gates not reproducibly executed in this environment

- `npm ci` / deterministic install (no lockfile is present and npm registry access timed out here).
- Full Next.js production build, ESLint, TypeScript typecheck, Vitest, Playwright, live Supabase/RLS execution, and `npm audit` require a networked CI environment with project dependencies and real service credentials.

## Static gate result

Architecture, HTTP contracts, RLS source, TypeScript syntax, SQL structure, production readiness, hygiene, learning engine, and QBank contract gates are expected to be run in CI before deployment.
