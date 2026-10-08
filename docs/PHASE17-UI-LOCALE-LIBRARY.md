# MDvoro Phase 17 — UI, Library, Locale & Responsive Layer

Implemented:
- Student Medical Library backed by published `knowledge_cards` with RLS-safe access.
- Library search and article reader with safe, non-HTML markdown block rendering.
- Four UI locales: English, Hebrew, Arabic and Russian.
- Locale persisted in the `mdvoro_locale` cookie and applied to document `lang`/`dir`.
- Dark/light/system theme control with local persistence and system preference support.
- Distinct desktop/mobile shell behavior, touch-first bottom navigation, RTL-safe spacing and controls.
- Mobile navigation exposes Dashboard, QBank, Flashcards, Library and Settings directly.
- Future maintenance stays centralized in `lib/i18n/messages.ts` rather than scattering locale logic.

Database migration:
- `supabase/migrations/0017_library_i18n.sql` grants authenticated learners read access only to published knowledge cards and active taxonomy nodes.

Validation:
- Architecture, quality, hygiene and production static checks pass.
- Full dependency-backed typecheck/build/test could not be executed in this isolated environment because npm dependency installation timed out; no runtime failure is claimed from those checks.
