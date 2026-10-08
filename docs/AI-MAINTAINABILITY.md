# MDvoro AI Maintainability Contract

MDvoro is intentionally designed so a future human developer or coding agent can make small, reviewable changes without rewriting the platform.

## Rules

1. **Database first for durable state.** Never add important state to localStorage or hard-coded arrays.
2. **Server boundary for privileged actions.** Browser code never receives service/secret keys or answer keys.
3. **Authorization is capability-based.** Use `has_permission()` / `lib/server/authorization.ts`; do not scatter role checks.
4. **Validate at boundaries.** Every mutation gets Zod/input validation before the database call.
5. **Use RPC/API contracts.** UI components should call a small stable contract, not know the full database schema.
6. **Migrations are additive.** Prefer new migrations; never silently rewrite production data.
7. **Content is versioned.** Editing a question must preserve its history.
8. **Media is reusable.** Reference assets by ID; never duplicate the same image for convenience.
9. **No fake data.** If a feature is not connected to production state, show an explicit empty/disabled state.
10. **Every new privileged capability needs a test.** Add an allow test and a deny test.

## How to add a feature

1. Write the user-facing contract in one sentence.
2. Add/extend a migration if state is required.
3. Add a Zod schema for external input.
4. Add a server/API/RPC contract.
5. Add authorization at the server boundary.
6. Build the UI against that contract.
7. Add tests for authorization and important validation.
8. Update this documentation if the architecture changes.

## Naming

- UI: `components/<domain>/...`
- Server routes: `app/api/<domain>/...`
- Domain helpers: `lib/<domain>/...`
- Database migrations: `supabase/migrations/NNNN_description.sql`
- Stable content identifiers: human-facing codes such as `Q-XXXXXXXXXX`.

## AI coding agent checklist

Before editing, read `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, this file, and the relevant domain code. Make the smallest coherent change. Do not create duplicate abstractions when an existing contract already solves the problem. Never weaken RLS, CSP, validation, authorization, or audit logging just to make a feature easier.
