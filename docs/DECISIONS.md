# MDvoro Architecture Decisions

## ADR-001 — Database is an authorization boundary
RLS and security-definer RPC contracts protect data even when the frontend is modified or bypassed.

## ADR-002 — Questions have a public projection and a private editorial model
Students receive stem/options/media through a narrow API/RPC. Answer keys, explanations and editorial versions stay server-side.

## ADR-003 — Reusable media is normalized
`media_assets` stores the asset once. `question_media` creates relationships. This prevents duplicate storage and makes global asset replacement easy.

## ADR-004 — Content is versioned
A question edit creates a new `question_versions` record. Publishing copies the approved version into the live question projection.

## ADR-005 — Permissions are capability-oriented
Human roles are small (`student`, `editor`, `reviewer`, `support`, `admin`), while `role_permissions` defines capabilities. Code should ask for a permission/capability, not duplicate role checks everywhere.

## ADR-006 — Stable content codes
Questions receive a human-safe `Q-XXXXXXXXXX` code. Support, import/export and AI agents can refer to a question without exposing or depending on raw database IDs.

## ADR-007 — Free-first content
Published questions can be free or premium. The free path must remain usable without a subscription; premium entitlement is checked server-side.

## ADR-008 — Admin is provisioned separately
Normal signup never creates an administrator. The owner account is provisioned from a trusted environment, then MFA is enabled.

## ADR-009 — Additive migrations
Applied migrations are immutable. New schema behavior is introduced by the next numbered migration.
