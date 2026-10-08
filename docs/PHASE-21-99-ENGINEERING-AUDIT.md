# MDvoro Phase 21 — Engineering Hardening Audit

## Executive result

**No numeric production-readiness score is claimed.** The audit records verifiable engineering controls and remaining release gates.

This historical audit records the implemented code/data architecture and automated guardrails at that time. It is not evidence of current production readiness or of a completed external penetration test.

## What changed

- Reformatted 100 TS/TSX source files through the TypeScript AST printer for consistent, reviewable structure without changing application logic.
- Added server-authoritative learner projections: `learner_question_stats` and `learner_taxonomy_mastery`.
- Added a protected `project_question_attempt()` trigger so adaptive data updates atomically with authoritative question attempts.
- Reworked `get_next_question()` to use indexed learner projections instead of repeatedly scanning complete attempt history.
- Added client-mutation idempotency and result snapshots for QBank answers and Flashcard reviews.
- Closed legacy RPC signatures and added security tests for the current signatures.
- Made daily/streak calculations timezone-aware with a safe UTC fallback.
- Added deny-by-default database privileges for future functions and projection tables.
- Added source-level RLS consistency checks for all public tables in migrations.
- Added HTTP mutation contract checks and TypeScript parse checks.
- Added SQL structure checks for migrations and SECURITY DEFINER hardening markers.
- Added unit tests for same-origin protection, deterministic learning-state mapping, and AI-disabled-by-default behavior.
- Added engineering standards, threat model, security policy, pull-request release checklist and dependency automation.
- AI remains disabled unless `MDVORO_ENABLE_AI=true`; core learning behavior does not require AI.

## Verified gates in this environment

- TypeScript/TSX syntax: **100 files / 0 parse errors**
- Public tables with source-level RLS enable markers: **27 / 27**
- SQL migrations: **23**, dollar-quoted blocks structurally balanced
- HTTP contract gate: **PASS**
- RLS source gate: **PASS**
- Architecture gate: **PASS**
- Quality gate: **PASS**
- Production static gate: **PASS**
- Source hygiene gate: **PASS**
- Rules-based learning gate: **PASS**
- Dangerous HTML/eval scan: **0 matches in application source**
- Watermark/generator marker scan: **0 matches in application source**

## Production verification boundary

The environment used for this audit has no installed project dependencies and cannot resolve `registry.npmjs.org`, so `npm ci`, `next build`, Vitest runtime tests, Playwright runtime tests and live Postgres/Supabase RLS tests cannot be honestly reported as passed here.

The repository deliberately requires a committed `package-lock.json` in CI and uses `npm ci` for deterministic installs. The current archive does not contain a lockfile because it could not be generated without registry access.

Before the first production release, run:

```bash
npm ci
npm run verify
npm run check:db-contracts
npm run security:audit
```

and execute the SQL test suites against a disposable Supabase/Postgres environment. Review Supabase Security Advisor findings before launch.
