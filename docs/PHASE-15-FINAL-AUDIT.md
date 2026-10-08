# MDvoro Phase 15 — Final Production Integrity Audit

Date: 2026-10-08

## Scope

This audit reviews the repository as an engineering artifact: application architecture, authorization, Supabase/RLS contracts, request validation, AI provider boundaries, client/server separation, maintainability, UI integrity, source hygiene, test coverage and deployment readiness.

## Material fixes applied

- Added database-level MFA enforcement for admin permissions so privileged RPCs cannot bypass the HTTP `requireRole()` gate.
- Revoked application `CREATE` privilege on the `public` schema to reduce the attack surface of `SECURITY DEFINER` functions.
- Closed an exposure regression where `question_public` had been re-granted to authenticated users in a later migration; the application already uses dedicated student-safe RPC delivery.
- Added database-level write rate guards for question attempts, flashcard creation, deck creation, study-plan mutations and AI generation job creation.
- Centralized primary/mobile navigation and added real active-route state instead of relying on unused CSS.
- Removed non-functional header search/notification controls that presented false affordances.
- Added a distinct success state for authentication messages.
- Made prompt hashing canonical so equivalent JSON objects produce the same AI job hash.
- Reduced duplicated flashcard CSS and normalized shared design variables.
- Added a source-hygiene gate against common builder/template watermark phrases and unsafe TypeScript escape hatches.
- Added automated contracts for the new Phase 15 security controls.

## Current capability set

MDvoro currently contains:

- Student authentication with Supabase Auth and server-side protected routes.
- Exam selection and account personalization.
- QBank delivery with exam/subject/topic filtering and entitlement checks.
- Server-authoritative answer submission; answer keys are not included in the student question payload.
- Question bank overview metrics.
- Question versioning and Draft → In Review → Published → Archived workflow.
- Role/capability-based Content Studio permissions.
- Reviewer separation-of-duties protections.
- Reusable medical media library with licensing metadata, private storage and short-lived signed delivery URLs.
- Bulk JSON/CSV question import with validation and size/batch limits.
- Spaced-retrieval flashcards with server-controlled scheduling.
- Learning analytics and mastery signals.
- Knowledge graph linking taxonomy, questions and knowledge cards.
- Adaptive study planning from exam target, daily time, weak concepts and due memory.
- Server-only AI adapters for OpenAI, Anthropic and Google, with human-review workflow.
- Database-backed rate limiting and content audit logging.

## Maintainability assessment

The repository is small enough to understand quickly (99 project files, roughly 1,900 TypeScript/TSX lines) and uses a clear domain split: routes/components, server/security helpers, validation, migrations and tests. Stable question codes, immutable migrations and RPC contracts make future edits significantly safer than a browser-driven CRUD architecture.

The most important maintainability improvement in this phase is keeping the browser dependent on stable domain contracts instead of internal table layout. Navigation is also now centralized rather than duplicated between desktop and mobile.

## Security assessment

Strong controls are present: RLS is enabled across application tables, direct student writes to authoritative learning events are revoked, privileged content operations are permission-gated, request bodies are bounded, mutations use same-origin checks, admin HTTP access requires MFA, stored media is privately delivered, AI keys stay server-side, and the student question projection omits answer keys. Supabase's current security guidance also recommends RLS on exposed tables, explicit grants, careful handling of `SECURITY DEFINER`, and keeping secret keys server-side.

The Phase 15 database gates add defense-in-depth where the HTTP layer could otherwise be bypassed.

## Watermark / unwanted-builder scan

No common builder/template watermark phrases were found in shipped application source. Functional provider names such as OpenAI/Anthropic/Google are integration identifiers, not visual or vendor-credit watermarks. No `@ts-ignore` or `@ts-nocheck` markers were found in shipped application source.

## Verification performed

Passed in this environment:

- Architecture static contract.
- Quality static contract.
- Production static contract.
- Source-hygiene contract.
- TypeScript/TSX syntax parsing of the repository source.
- Repository tree, route and migration inventory review.
- Static security review of authorization, RLS, storage, AI and mutation boundaries.

Not fully executable in this environment:

- `npm install` / dependency resolution timed out against the package registry.
- Because dependencies could not be installed, a real Next.js production build, ESLint run, Vitest runtime suite and Playwright browser run were not available.
- Supabase SQL security scripts still need to run against a disposable real Postgres/Supabase project because static inspection cannot execute RLS behavior.

## Readiness score

**90/100 engineering readiness** for a controlled production beta, assuming the deployment secrets, Supabase configuration and content review process are correctly configured.

The remaining 10 points are not hidden code defects that can honestly be declared solved from a static repository audit: they are runtime/deployment verification items (dependency lockfile, real build/test execution, Supabase Security Advisor/behavioral RLS test run, WAF/edge configuration, monitoring, backups/restore drill, payment integration when introduced, legal/privacy review and external penetration testing).

This score is intentionally not 100%. A static audit cannot prove zero vulnerabilities, and MDvoro should not make that claim before runtime and external security validation.


## Phase 16 closure

A follow-up security closure was applied after the Phase 15 static audit. It revokes direct Data API execution of the remaining user-facing `SECURITY DEFINER` flashcard reporting functions except for authenticated callers, revokes direct execution of the auth trigger helper, and normalizes the `search_path` for all `public` `SECURITY DEFINER` functions to an empty path at migration time.

This is defense-in-depth against object-shadowing risks and aligns with current Supabase database-function guidance. Runtime database verification is still required in a disposable Supabase/Postgres environment before public launch.
