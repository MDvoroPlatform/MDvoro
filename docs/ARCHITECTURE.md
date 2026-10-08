# MDvoro architecture

## Stack
- Next.js App Router for server/client composition.
- React + strict TypeScript.
- Supabase Auth + Postgres + RLS.
- Zod for input validation.
- Vitest + Playwright for automated verification.

## Boundaries
`app/` owns routing and page composition.
`components/` owns reusable UI.
`lib/` owns infrastructure, validation and security helpers.
`supabase/` owns reproducible database migrations and policy tests.
`types/` owns domain contracts.

## Core principle
A learning event is authoritative only after it is accepted by a protected server/database boundary. Analytics are derived from stored events; they are not editable profile fields.

## Phase 2 — Medical Content Engine

The content model is intentionally relational rather than file-centric:

`question → question_media → media_asset → media_source`

A single medical image/ECG/diagram can therefore be reused by many questions. Question edits are stored as `question_versions`; publication is a reviewer decision. `content_audit_logs` records content operations.

### QBank security boundary

Students receive only the public question projection: stem, options, taxonomy, difficulty and sanitized media. The correct answer and explanation remain in the private `questions`/`question_versions` data path. The browser submits a selected answer to `submit_question_answer()`, which validates entitlement and correctness server-side before recording the attempt.

### Content operations

- Content authors: admin/editor.
- Medical approval: admin/reviewer.
- Support: no content mutation.
- Student: no content mutation and no answer-key access.
- Bulk import: validated JSON, max 2,000 rows, imported as drafts.
- Media: license/copyright metadata is first-class data, not an afterthought.

### Free-first monetization

`questions.access_tier` is `free` by default. This lets MDvoro launch with a free educational library while preserving a clean path to premium question sets later.
## Platform domain map

```text
Experience (Web / Mobile / Admin)
            │
            ▼
       Route Contracts
            │
            ▼
   Domain Services / Rules
            │
       ┌────┴────┐
       ▼         ▼
Learning Core  Content Core
       │         │
       └────┬────┘
            ▼
     Authoritative Events
            │
            ▼
   Rebuildable Projections
            │
            ▼
      Postgres + RLS
```

### Engineering invariants

- Learner roles cannot write authoritative learning-event tables directly.
- Learning mutations are idempotent and return the stored result on exact retry.
- Adaptive delivery reads indexed learner projections rather than scanning the complete raw attempt history for every question.
- User-local daily/streak calculations use the profile timezone with a UTC fallback.
- AI is feature-flagged off by default and is not required for core learning behavior.

## Final engineering invariant

The browser is a presentation/client layer. The database and server are the authorities for identity, entitlement, answer correctness, learning mutations and derived learner state. New privileged database functions are deny-by-default and must be explicitly granted and tested.
