# MDvoro security baseline

MDvoro treats the browser as hostile. UI restrictions are never authorization.

## Controls
- Supabase Auth with cookie-based SSR sessions and PKCE.
- Database Row Level Security for every exposed application table.
- Private subscription/question access is server/database enforced.
- User-owned learning events are isolated by `auth.uid()`.
- Elevated Supabase secret keys are backend-only and must never be prefixed with `NEXT_PUBLIC_`.
- Production responses should not expose stack traces or database errors.
- Security headers are configured in `next.config.ts`.
- Input schemas use Zod at the application boundary.

## Threat model
See `docs/THREAT-MODEL.md` for attack classes and mitigations.

## Residual risks before launch
- Configure Supabase Auth rate limits and bot protection.
- Configure production SMTP and verified redirect URLs.
- Configure a production WAF/rate limiter at the deployment edge.
- Run dependency, DAST, and database policy tests in CI.
- Add payment webhook signature verification before subscriptions are activated.
- Complete an external penetration test before handling real paid users.

## Phase 2 RBAC / Admin provisioning

- Public signup always creates `student`; signup input never accepts a role.
- Admin/editor/reviewer/support roles are stored in `profiles.role` and enforced by database policies/RPCs.
- Content mutation uses narrow security-definer RPC contracts rather than exposing the question answer key to the browser.
- Admin access should use a dedicated account and mandatory MFA in the production identity provider.
- The first administrator is provisioned out-of-band, then additional roles are granted by an existing administrator through the privileged role-management path.
- Do not put a Supabase service-role/secret key in browser code or `NEXT_PUBLIC_*` variables.
- Medical media is modeled as reusable assets with license/attribution metadata. Do not import copyrighted question banks or images without a license.
