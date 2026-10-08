# MDvoro Phase 16 — Professional Production Readiness Audit

Audit date: 2026-10-08

## Executive verdict

**Engineering readiness: 91/100 for a controlled production beta.**

The repository has a strong production architecture: Next.js App Router + TypeScript strict mode, Supabase Auth/Postgres/RLS/Storage, Zod request validation, server-side authorization, versioned medical content, a review workflow, adaptive learning functions, flashcards, analytics, knowledge graph, study planning, media licensing controls, AI draft tooling, and automated static quality gates.

The score is deliberately below 100 because a repository audit cannot honestly prove runtime correctness, database-policy behavior in a live Supabase project, dependency-lock reproducibility, or resistance to an external penetration test.

## What the product currently provides

1. **Authentication and account foundation** — Supabase Auth, login/sign-up, password recovery, profile records, active exam selection and account settings.
2. **Exam-aware QBank** — published-question delivery through server-side RPCs, subject/topic filters, difficulty and exam awareness, adaptive next-question selection, and a free/premium entitlement boundary.
3. **Server-authoritative answer checking** — answer keys are not sent to students before submission; correctness is derived on the server and the attempt is recorded before feedback is returned.
4. **Flashcard memory engine** — decks, card creation, card types, due queues, review scheduling, difficulty/stability tracking, lapses, retention metrics and server-authoritative review transitions.
5. **Learning analytics** — verified question attempts feed dashboard, accuracy and weak-topic calculations rather than client-provided fake metrics.
6. **Mastery and next-action intelligence** — learning functions derive mastery, weak areas, next actions and learner knowledge relationships.
7. **Knowledge graph** — taxonomy nodes, knowledge cards and questions are connected so weak concepts can inform question delivery.
8. **Adaptive study plan** — target date, daily minutes, exam and learner performance feed a transparent server-generated plan.
9. **Medical content studio** — question creation/editing, taxonomy classification, version snapshots and explicit Draft → In Review → Published → Archived workflow.
10. **Reviewer separation of duties** — content creators cannot approve their own latest version; privileged review actions are role-gated and admin paths are MFA-gated.
11. **Reusable medical media library** — private storage bucket, metadata, license fields, MIME/type limits, file-signature checks, signed student URLs and reusable links to questions.
12. **Bulk content import** — JSON/CSV import with bounded payloads, batch limits and draft-first behavior.
13. **AI content factory** — server-only OpenAI/Anthropic/Google adapters, prompt hashing, generation jobs, suggestion storage and human review before publishing.
14. **Operational security controls** — same-origin mutation checks, rate limits, request-size limits, security headers, CSP nonce support and database-level defense-in-depth limits.
15. **Maintainability framework** — stable human-facing question codes, immutable additive migrations, centralized authorization/API helpers, validation schemas, architecture checks, hygiene checks and an AI coding guide.
16. **Engineering quality gate** — architecture, quality, production and source-hygiene checks are runnable from npm scripts and CI.

## Security review

### Fixed in this phase

- Closed an accidental `question_public` execution grant regression.
- Added MFA enforcement inside the database permission boundary so direct RPC calls cannot bypass the HTTP-level admin MFA check.
- Added database-level write throttles for question attempts, flashcards, decks, study plans and AI generation jobs.
- Closed the remaining direct-execution gap for flashcard reporting functions.
- Revoked direct execution of the auth trigger helper.
- Added a migration-time normalization that pins `search_path` to an empty path for all `public` `SECURITY DEFINER` functions.
- Added a database security-contract test for the empty `search_path` requirement.
- Added additional HTTP security headers and completed the nonce-based CSP for both scripts and styles.
- Removed misleading non-functional shell controls and centralized route-active navigation.
- Fixed form success-state styling and canonicalized prompt hashing to avoid logically equivalent objects producing different cache/idempotency hashes.
- Added source hygiene checks for common builder/template watermark phrases and TypeScript escape hatches such as `@ts-ignore` / `@ts-nocheck`.

These controls follow current Supabase guidance that RLS and grants are separate authorization layers, that exposed tables need RLS and least-privilege grants, and that `SECURITY DEFINER` functions should use an empty `search_path` and narrowly scoped execution privileges. citeturn737265search0turn737265search1

The project also uses a nonce-based CSP strategy consistent with Next.js security guidance for preventing XSS/clickjacking/code-injection classes of issues. citeturn737265search2turn737265search3

### Security that cannot be proven from source alone

- Supabase production RLS behavior must still be exercised against a real disposable database/project with both allow and deny cases.
- Supabase Security Advisor output must be reviewed on the deployed project.
- Production authentication bot/rate-limit settings are configuration items outside this repository.
- WAF/edge controls, monitoring, backup/restore and external penetration testing are still operational requirements.
- No static audit can prove that a future dependency update contains no undisclosed vulnerability.

## Dependency/runtime posture

Current direct-version checks show:

- Next.js **16.4.0** — current stable version visible today; published security advisories for the 16.x cache/RSC/CSP issues patched them at **16.2.5**, so 16.4.0 is outside those affected ranges. citeturn786943search13turn786943search4turn786943search7turn786943search9
- React **19.3.0** — current stable release. citeturn720440search3
- `@supabase/ssr` **0.12.7** — current stable release. citeturn175902search2turn175902search4
- `@supabase/supabase-js` upgraded to **2.117.3**, matching the current release line visible in the Supabase changelog. citeturn720440search4
- `@playwright/test` upgraded to **1.63.0**, current stable on npm. This is well above the fixed 1.55.1 floor for the 2025 installer certificate vulnerability. citeturn550697search0turn720440search0
- Node runtime is pinned to **22.23.3** in `.nvmrc`. Next.js 16 requires Node 20.9+, while Node 20 has reached EOL; Node 22 remains an LTS line. citeturn653569search0turn905559search0turn905559search9

Major upgrades to TypeScript, ESLint and Vitest were intentionally not forced during this pass because they would increase compatibility risk without a functioning dependency installation/build environment for verification.

## Maintainability assessment

**94/100.**

The core separation is clean:

`app/` → routes and API boundaries

`components/` → UI/client interactions

`lib/server/` → authorization and request infrastructure

`lib/validation/` → input contracts

`lib/content/` → content-domain helpers

`supabase/migrations/` → additive schema evolution

`supabase/tests/` → database security contracts

`scripts/` → operational gates

`docs/` → architecture and safe-AI-editing guidance

The project currently contains approximately **139 files, 91 TypeScript/TSX files and ~2,050 TypeScript/TSX lines**, which is still small enough to refactor aggressively without turning maintenance into a large legacy-code exercise.

The best long-term maintenance properties are the centralized authorization helpers, Zod schemas, stable question codes, additive migrations, database RPC boundaries and automated checks. Future AI-assisted edits should follow the existing `docs/AI-CODING-GUIDE.md` and `docs/AI-MAINTAINABILITY.md` rather than editing database permissions ad hoc.

## UX/UI assessment

**89/100 from source review.**

The application has a coherent product shell, dedicated dashboards, QBank, Flashcards, Knowledge, Analytics, Study Plan and Settings areas, plus a separate admin workspace. The recent pass removed misleading dead controls and made active navigation state real.

I would not claim “Apple/AMBOSS-level visual perfection” solely from static code inspection. The functional structure is strong, but pixel-level visual validation requires running the app in a browser and reviewing mobile/tablet/desktop screenshots.

## Verification performed

PASS — architecture contract

PASS — quality contract

PASS — production static contract

PASS — source hygiene / watermark scan

PASS — TypeScript/TSX syntax parsing: **85 files, 0 syntax diagnostics**

PASS — suspicious-secret / builder-watermark source scan; no actual builder watermark was found in shipped application source

NOT COMPLETED — `npm install` / `npm ci`: registry access timed out in this environment

NOT COMPLETED — real `next build`, `eslint`, Vitest and Playwright runtime tests, because dependencies are not installed here

NOT COMPLETED — live Supabase/RLS behavioral tests, because a disposable Supabase/Postgres runtime is not attached to this audit environment

A `package-lock.json` is still missing. The project therefore does not yet have fully reproducible dependency installation and this remains one of the reasons the score is below 100.

## Readiness score

| Area | Score |
|---|---:|
| Architecture | 95/100 |
| Authentication & authorization | 94/100 |
| Database/RLS security | 93/100 |
| API/request validation | 94/100 |
| AI integration safety | 90/100 |
| Maintainability | 94/100 |
| UX/UI structure | 89/100 |
| Testing/deployment proof | 82/100 |
| **Overall** | **91/100** |

## Final conclusion

MDvoro is no longer a prototype-level codebase. It is a **strong engineering foundation suitable for a controlled beta**, with meaningful production security boundaries and a clear path for future changes.

The two biggest blockers to calling it fully production-verified are not hidden code issues: **a committed dependency lockfile and real runtime/database verification**. After those are completed, the next highest-value step is a real browser pass over every user journey rather than adding more architecture.

**No 100% security guarantee is made.** The project is designed around layered controls so that individual mistakes do not become single catastrophic trust-boundary failures.
