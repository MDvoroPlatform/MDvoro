# MDvoro Phase 35 — Signature UI & Security Hardening

## Design
- Replaced text-only branding in the application shell with the supplied MDvoro wordmark.
- Added equal-size light/dark transparent logo assets.
- Introduced a calm Apple-inspired system font stack (`-apple-system`, SF Pro where available) without bundling proprietary Apple fonts.
- Redesigned the authenticated shell, navigation, top bar, dashboard welcome surface, metrics, command center, cards, buttons, and dark mode.
- Added responsive/mobile-first refinements while preserving the existing navigation and learning flows.

## Performance / maintainability
- Removed two dashboard `count(*)` head queries over raw learning tables; the dashboard now uses the existing smart snapshot/projections for these signals.
- Kept visual presentation in CSS instead of scattering inline styles.

## Security
- Added a restrictive baseline Content-Security-Policy with `frame-ancestors 'none'`, `object-src 'none'`, same-origin forms, and explicit Supabase connectivity.
- Preserved existing HSTS, COOP, CORP, Permissions-Policy, X-Content-Type-Options, X-Frame-Options and Referrer-Policy headers.
- Static security gates remain green: architecture, RLS source audit, runtime contracts, production checks, TypeScript parsing and UI contracts.

## Validation limitation
A full `npm ci`, production build, Playwright E2E run, `npm audit`, live Supabase/RLS test and 5,000-concurrent-user load test require the production/staging environment and dependency registry access. This package does not claim those tests were executed here.
