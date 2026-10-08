# Release security gate

## Must pass before paid launch
- [ ] Supabase Security Advisor has no unexplained high-severity findings.
- [x] Every exposed table inspected in the source has RLS enabled; live Security Advisor verification remains required.
- [ ] Every RLS policy has explicit allow/deny tests.
- [x] No service/secret key is reachable from browser source paths by static inspection.
- [ ] Auth rate limits and bot protection are configured.
- [ ] Production redirect URLs are allowlisted.
- [ ] Payment webhooks verify signatures and are idempotent.
- [x] API mutation routes use centralized same-origin checks and server-side authorization patterns.
- [ ] File upload content-type, size and storage policies are tested before enabling uploads.
- [ ] CSP is validated in production and monitored in report-only mode before enforcement changes.
- [ ] Dependency audit and lockfile are clean.
- [ ] DAST and external penetration testing completed.

### Phase 2 content security

- [ ] No authenticated direct SELECT privilege on `public.questions`.
- [ ] `question_public` contains no answer key/explanation columns and only returns published entitled content.
- [ ] QBank answer submission uses `submit_question_answer()`; answer keys are never sent before submission.
- [ ] Content mutations use role-gated RPCs and same-origin API checks.
- [ ] Every media asset records copyright/license status before publication.
- [ ] Media storage bucket is private; student media access is linked to published entitled questions.
- [ ] Question edits create immutable-ish version records and audit events.
- [ ] Reviewer approval is required before publication.
- [ ] First admin is provisioned out-of-band; normal signup always creates `student`.
- [ ] Admin accounts use MFA and a dedicated identity.
- [ ] Test cross-user RLS/IDOR behavior with at least two users before production.

### Phase 3 platform hardening

- [x] Authenticated users cannot directly INSERT forged `question_attempts` or `flashcard_reviews`.
- [ ] Capability checks are centralized in `has_permission()` and server authorization helpers.
- [ ] Support cannot call private question-detail contracts that return answer keys.
- [ ] Last-admin protection is tested.
- [ ] Admin/editor/reviewer mutations are rate limited.
- [ ] Uploaded media passes extension/MIME/signature/size validation and is stored privately.
- [ ] Direct authenticated reads of internal content tables are revoked unless explicitly required.
- [ ] Stable content codes are used in support/import/AI workflows.
- [x] Architecture checks pass locally; CI runtime remains gated on the committed lockfile.
