# MDvoro Quality Gate

## Required before merge

1. `npm install --ignore-scripts --no-audit --no-fund`
2. `npm run check:architecture`
3. `npm run check:quality`
4. `npm run lint`
5. `npm run typecheck`
6. `npm run test`
7. `npm run build`
8. `npm run security:audit`

## Database gate

Apply migrations `0001` through the latest migration to a disposable Supabase/Postgres database and run the SQL security tests. The application must not be considered production-ready from static checks alone.

## Security invariants

- Browser code never receives service-role credentials or answer keys.
- Admin routes require the capability contract; admin accounts require AAL2 MFA.
- Question publishing requires an explicit medical review event and separation of duties.
- Flashcard scheduling and review events are server-authoritative.
- Taxonomy writes are atomic RPC operations and audited.
- AI output is a suggestion and cannot publish content automatically.
- Anonymous users cannot execute application RPCs or read internal content projections.
- Mutating browser requests require same-origin validation.
