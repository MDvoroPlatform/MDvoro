# MDvoro

## Current engineering status

MDvoro is a medical learning platform built with Next.js and Supabase. Core learning behavior is rules-based and does not require AI. Answers, entitlements and learner mutations are designed to be enforced by server/database boundaries. See `PRODUCTION_READINESS.md` for the current verification evidence and release blockers.

## Engineering principles

- No fake metrics or fake backend behavior.
- Database authorization is a security boundary.
- Students never receive question answer keys before submission.
- Normal signup always creates `student`.
- Admins are provisioned separately and protected from self-lockout.
- Content is versioned and explicitly reviewed before publication.
- Medical media is reusable and license-aware.
- Privileged mutations are rate limited and audited.
- Migrations are additive and immutable after deployment.
- Server/domain contracts keep React components simple and replaceable.
- Stable question codes make support, imports and AI-assisted maintenance safer.

## Stack

- Next.js App Router + TypeScript strict mode.
- Supabase Auth/Postgres/RLS/Storage.
- Zod validation.
- Vitest + Playwright.
- Server-side RPC contracts for privileged content operations.

## Project map

```text
app/                    Routes, pages and API boundaries
components/             UI and client interactions
lib/server/             Auth, authorization, API infrastructure
lib/content/            Content-domain helpers and import contracts
lib/validation/         Zod request schemas
supabase/migrations/    Immutable database evolution
supabase/tests/         Database security tests
docs/                   Architecture, decisions and AI/engineer guide
scripts/                Trusted operational scripts
```

## Local setup

1. Node.js 22+.
2. `npm install`.
3. Copy `.env.example` to `.env.local` and configure Supabase URL + publishable key.
4. Apply migrations in order: `0001_core.sql` through the latest migration (`0016_security_function_closure.sql`).
5. `npm run typecheck`.
6. `npm run lint`.
7. `npm run test`.
8. `npm run build`.

## First administrator

**Never** implement "first registered user = admin".

1. Create the owner account through normal signup.
2. Enable MFA on the owner account.
3. From a trusted server/terminal, provision that exact Auth user:

```bash
SUPABASE_URL="..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
ADMIN_EMAIL="owner@example.com" \
npm run provision:admin
```

The service-role key is never used by the browser. Store it only in a secure server/CI secret store and never prefix it with `NEXT_PUBLIC_`.

## Content workflow

```text
Draft
  ↓
Send for medical review
  ↓
In review
  ↓
Approve
  ↓
Published
```

Every edit creates a new `question_versions` record. Publishing is an explicit reviewer/admin action.

## Reusable media

`media_assets` stores an asset once. `question_media` connects that asset to any number of questions. This is the intended pattern for repeated ECGs, X-rays, diagrams and other clinical media.

Uploaded assets are kept in the private `medical-media` bucket. Student delivery uses short-lived signed URLs for stored assets.

## Bulk import

The Content Studio supports JSON and a simple CSV format. Maximum batch size is 2,000 questions. All imported content starts as Draft and receives a stable `Q-XXXXXXXXXX` content code.

## Safe editing by engineers or AI agents

Read `docs/AI-CODING-GUIDE.md` before making changes. It defines the project contracts and explicitly lists unsafe changes that must not be made.

## Quality commands

```bash
npm run check:architecture
npm run check:hygiene
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify
```

## Production gate

This repository is an engineering foundation, not a claim of a finished commercial launch. Before accepting real paid users, complete:

- networked CI with a committed lockfile;
- Supabase Security Advisor review;
- behavioral multi-user RLS tests;
- production Auth rate limits/bot protection;
- WAF/edge protection;
- payment webhook signature verification and idempotency;
- monitoring, alerting and backup/restore drills;
- dependency and DAST scanning;
- external penetration testing;
- medical content licensing review;
- privacy/legal review appropriate to the markets served.

Never claim 100% security. The goal is layered controls, measurable tests and fast detection/recovery.

## Phase 3 — Platform architecture hardening

This phase adds:

- capability-based permission matrix (`role_permissions`);
- stable `Q-XXXXXXXXXX` content codes;
- explicit Draft → In Review → Published → Archived workflow;
- dedicated review queue;
- question search/filtering and media search APIs;
- question duplication without copying identity or history;
- immutable version snapshots with a simple editor workflow;
- private media upload with size/type/signature checks;
- database-backed authenticated rate limiting;
- prevention of forged `is_correct` question attempts;
- support-role isolation from private answer keys;
- admin self-lockout/last-admin protection;
- centralized server authorization and API helpers;
- AI/engineer maintenance guide and architecture decisions;
- architecture static checks and CI quality gate.


## Phase 8 — Knowledge Graph
MDvoro now connects taxonomy concepts, published questions and published knowledge cards into a learner-visible graph. The graph is server-derived and entitlement-aware. Question delivery also prioritizes questions linked to weak concepts, while preserving unseen-question priority.

## Phase 10 — Production QBank + AI integrations

- Student QBank now exposes safe published-bank counts by exam.
- Answer submission returns the correct option only after the authenticated answer is recorded.
- Bulk JSON/CSV import remains atomic and draft-only with a 2,000-question transaction cap.
- OpenAI, Anthropic, and Google AI adapters are implemented server-side with provider-specific secret variables.
- `/admin/integrations` reports only whether a key exists; secret values are never returned.
- AI output remains a reviewable suggestion and cannot auto-publish content.
- See `docs/QUESTION-BANK.md` for the content contract.

### Secret configuration

Set in the deployment secret manager, not in source control:

`MDVORO_AI_PROVIDER`, `MDVORO_AI_MODEL`, and one of `MDVORO_OPENAI_API_KEY`, `MDVORO_ANTHROPIC_API_KEY`, or `MDVORO_GOOGLE_API_KEY`.


## Phase 11 — Production Hardening
- Hardened mutation body limits and same-origin protection on study-plan and learner write endpoints.
- Moved bulk import rate limiting before JSON parsing and removed detailed validation internals from API responses.
- Hardened server-side answer submission so only real question options can be recorded.
- Added a safe study-plan uniqueness migration that reconciles historical duplicates before enforcing one active plan per learner.
- Added a database size constraint for AI generation input.
- Added static quality contracts for these production invariants.


## Phase 15 — Production Integrity
- Database-level MFA gating for admin permissions, including direct RPC calls.
- Public-schema CREATE revoked for application roles.
- Student-facing `question_public` view execution revoked after an accidental re-grant regression was identified.
- Defense-in-depth database rate guards protect question attempts, flashcard creation, decks, study plans and AI job creation even when HTTP controls are bypassed.
- Source-hygiene checks prevent common AI/template watermark phrases and unsafe TypeScript escape hatches from entering application code.


## Phase 16 — Security Closure + Production Maintainability
- Closed remaining direct-execution gaps for user-facing `SECURITY DEFINER` reporting functions.
- Pinned `search_path` to an empty path for all public `SECURITY DEFINER` functions during migration.
- Added a database security contract for the function search-path invariant.
- Pinned Node.js to 22.23.3 LTS and centralized the runtime pin in `.nvmrc` and CI.
- Upgraded Supabase JS and Playwright to their current stable release lines verified on 2026-10-08.
- Added `npm run verify` as the single local quality command.

## Production hardening (Phase 34)

The latest release adds projection-backed learner analytics and leaderboard reads, bounded indexed QBank sampling, race-safe automatic flashcard creation, a complete rate-limit action contract, strict security-definer search-path hardening, UI/API runtime contract checks, and a configurable 5K concurrency probe. See `docs/PRODUCTION-AUDIT.md` before deployment.

For production mutation-origin validation, set `MDVORO_APP_ORIGIN` to the exact canonical HTTPS origin used by the application.


## Production release gate

See `docs/PRODUCTION-SECURITY-RELEASE-GATE.md`. The project intentionally makes no numeric security/readiness claim; live DB, dependency-backed build, E2E, SCA and external security validation are explicit release gates.
