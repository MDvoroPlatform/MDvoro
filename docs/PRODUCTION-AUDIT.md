# MDvoro Production Audit & 5K Concurrency Gate

This release applies a source-level production hardening pass around the QBank, flashcards, analytics, leaderboard and API boundary.

## Verified in this repository

- 52 API route handlers discovered.
- 38 mutating handlers have a same-origin/CSRF guard.
- 40 public tables pass the source RLS gate.
- TypeScript/TSX syntax parses across the project.
- SQL structure/security-definer gate passes across 43 migrations.
- QBank contract, learning-engine, architecture, quality, hygiene and production static gates pass.
- Rate-limit action names are cross-checked between application code and the latest SQL allow-list.
- Dangerous `eval`, `new Function` and uncontrolled `dangerouslySetInnerHTML` patterns are rejected by the runtime-contract check.
- A heuristic scan found no unreferenced `components/*` modules.

## Hardening included

- Rate limiting now accepts every action actually used by the application, including catalog, break and flashcard-delete flows.
- Late-added `SECURITY DEFINER` functions are forced to `search_path=''`.
- Leaderboard and Board Success reads use learner-level projections rather than repeatedly aggregating raw attempt history.
- Question selection uses bounded indexed candidate sampling instead of `ORDER BY random()` across the entire bank.
- Automatic question-to-flashcard creation uses a transaction advisory lock to prevent duplicate cards caused by concurrent clicks.
- Explicit `MDVORO_APP_ORIGIN` is documented for production CSRF/origin validation.

## 5,000-user requirement

The repository can be engineered for high concurrency, but no source audit can prove that 5,000 users can submit authenticated QBank answers at the exact same second without a production-like load test. Capacity depends on the deployed Next.js runtime, Supabase/Postgres tier, connection pool, database region, network, storage and observability configuration.

Before launch, run the application in a staging environment with production-sized Supabase resources. Start with:

```bash
LOAD_BASE_URL=https://staging.example.com LOAD_PATH=/api/health/live LOAD_CONCURRENCY=5000 LOAD_ROUNDS=1 npm run load:test
```

Then run an authenticated workload against test accounts covering session start, answer, state update, flashcard review, flashcard creation/deletion, dashboard analytics and leaderboard reads. Verify p95/p99 latency, 5xx/429 rates, DB CPU, connection utilization, lock waits and storage bandwidth.

## Required before deployment

Generate and commit the real `package-lock.json`, then run:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run security:audit
```

Apply all Supabase migrations in order to a staging database and run the repository's SQL/RLS/security contracts there. Production deployment should be blocked until the build, tests and authenticated load test are green.
