# MDvoro AI / Engineer Coding Guide

This file is the shortest safe briefing for a new engineer or coding agent working on MDvoro.

## Golden rules

1. **Do not invent functionality.** If a backend feature is not implemented, show an explicit empty/coming state.
2. **Never expose answer keys to students.** `questions.answer_key` and `question_versions.answer_key` are server/editor data. Student question delivery goes through RPC/API contracts.
3. **Never trust the client for authorization.** UI visibility is convenience only. Every mutation has a server authorization check and database/RLS protection.
4. **Normal signup always creates `student`.** Never make the first registered user an admin.
5. **Never put service-role/secret keys in browser code.** Server-only scripts and server modules only.
6. **Use stable content codes.** Questions receive codes such as `Q-AB12CD34EF`; use them in support, imports and AI instructions instead of relying on mutable database IDs.
7. **Reuse media.** Create one `media_assets` record and connect it with `question_media`; do not duplicate files.
8. **Content changes are versioned.** Edit → new `question_versions` row → submit for review → approve → publish.
9. **Migrations are additive.** Do not edit an old applied migration. Add `0005_...sql`, `0006_...sql`, etc.
10. **Prefer domain modules over giant files.** Put authorization in `lib/server/authorization.ts`, validation in `lib/validation`, content rules in `lib/content`, and route orchestration in `app/api`.
11. **Keep Supabase calls behind server/domain boundaries when the data is privileged.** Do not scatter answer-key or role logic through React components.
12. **Every new mutation needs:** same-origin check, authentication, authorization, input validation, rate limiting where appropriate, database authorization, audit logging for privileged content changes, and no-store responses for sensitive results.

## Where to change things

| Need | Primary location |
|---|---|
| Question fields | `lib/validation/content.ts` + newest Supabase migration |
| Question workflow | `supabase/migrations/*` + `app/api/admin/questions/*` |
| Admin permissions | `supabase/migrations/*` + `lib/server/authorization.ts` |
| Admin navigation | `components/admin/admin-nav.tsx` |
| Question editor UX | `components/admin/question-form.tsx` |
| Media UX | `components/admin/media-form.tsx` |
| QBank student UX | `components/qbank/qbank-session.tsx` |
| Student answer submission | `app/api/qbank/answer/route.ts` + DB RPC |
| Security headers | `next.config.ts` + `lib/supabase/proxy.ts` |
| Environment validation | `lib/config/env.ts` |
| Database types | `types/database.ts` |
| Architecture decisions | `docs/DECISIONS.md` |

## Safe AI edit protocol

Before changing code, an AI agent should:

1. Read this file and `docs/ARCHITECTURE.md`.
2. Identify the domain and read the relevant route/component/schema/migration.
3. Search for existing helpers before creating a new one.
4. Make the smallest coherent change.
5. Add or update tests for business rules.
6. Add a new migration instead of rewriting applied SQL.
7. Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` in a networked environment.
8. Report any command that could not run. Never claim a successful build without running it.

## Things an AI agent must never do

- Create `isAdmin` from localStorage/cookies supplied by the browser.
- Add `role` to public signup input.
- Query `questions` directly from a student component.
- Return `answer_key` from `/api/qbank/next`.
- Disable RLS to make a feature easier.
- Put a Supabase service-role key in `.env` variables prefixed with `NEXT_PUBLIC_`.
- Store a private medical asset in a public bucket without a deliberate architecture decision.
- Copy copyrighted commercial question banks or medical images without a verified license.
- Change an old production migration in place.
