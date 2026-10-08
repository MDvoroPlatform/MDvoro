# MDvoro threat model

## Assets

- Student identity and profile data
- Learning history, confidence, timing, mastery and streak data
- Protected question answer keys and explanations
- Medical media and licensing metadata
- Admin/content workflow privileges
- Future AI provider credentials

## Trust boundaries

1. Browser → Next.js Route Handler
2. Route Handler → Supabase Auth/DB
3. Data API → Postgres RLS/grants/RPCs
4. Admin/content workflows → privileged database functions
5. Future AI layer → provider APIs from server-only execution

## Primary threats and controls

| Threat | Control |
|---|---|
| IDOR / cross-user access | RLS, ownership checks, user-scoped RPCs |
| Answer-key leakage | Private question path; server-side answer grading |
| Forged learning events | Direct writes revoked; authoritative RPCs |
| Replay / double-submit | UUID mutation keys + unique indexes + stored result snapshots |
| RPC privilege escalation | Explicit grants + default-deny privileges + MFA checks |
| Search-path hijacking | `search_path = ''` on SECURITY DEFINER functions |
| XSS / unsafe HTML | Static dangerous-pattern scan + framework escaping |
| Secret exposure | Server-only adapters and source scans |
| Open redirects | Local-path-only callback validation |
| Request flooding | Database-backed rate limiting + payload limits |
| Lost offline actions | Planned client mutation ledger and server idempotency boundaries |

## Residual risks

Production Security Advisor, dependency audit, DAST, external penetration testing, and live RLS matrix tests remain release gates.
