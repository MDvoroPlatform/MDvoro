# MDvoro Phase 25 — QBank Enterprise Completion

Implemented in this release:

- Exam-first QBank builder: exam → branch → topics → question count → practice/exam → question pool.
- 1–300 question cap in the learner UI. Full-length exam profiles preserve the configured official wall-clock model; partial exam sessions use scaled block pacing.
- Exam block navigation with server-enforced block locks.
- Exam break bank for full-length USMLE sessions, with server-side start/end enforcement.
- Resume from the exact server-side session position.
- Idempotent answer submission with mutation IDs and database uniqueness.
- Private notes and question marking/bookmarks protected by the same block rules as answers.
- Key-term chips limited to three visible terms and hidden before answer submission in exam mode.
- Post-session result view with score, unanswered/incorrect counts, branch breakdown, full question replay, selected/correct answers, explanations, notes and key terms.
- Quick retry pools: mixed, unseen, unanswered, incorrect, answered and bookmarked.
- Exam-specific subject catalogue for IMLE, USMLE Step 1 and USMLE Step 2.
- Subject-specific topic catalogue returned by the database for the session builder.
- Legacy question endpoints disabled so all learner QBank traffic uses the canonical session engine.
- Liveness and readiness endpoints for deployment orchestration.

## Launch proof still required outside the ZIP

- Install from a committed lockfile and run `npm ci`.
- Run lint, typecheck, unit tests, E2E, production build and dependency audit.
- Apply migrations to a disposable Supabase project and run the RLS/security SQL suites.
- Configure provider-side backups/PITR and execute a restore drill.
- Configure the real payment provider before treating revenue metrics as live financial data.
- Complete legal/privacy review for the operator's actual jurisdiction and publish real DMCA agent details if claiming DMCA safe-harbor procedures.
