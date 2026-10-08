# MDvoro Phase 31 — Competitive Learning Review

## Benchmark sources reviewed
- AMBOSS: QBank + Library + study recommendations + peer comparison + score predictor + Anki integration + learning cards + collections + offline/mobile.
- UWorld: exam-like QBank + ReadyDecks/SmartCards + study planner + self-assessments + My Notebook + Medical Library + mobile sync.
- DrMada: reconstructions, 24 full exams / 6 prior years, ~30,000 practice questions, timed simulation, statistics by question/exam/subject, comments, favorites, multi-device use.
- MedExams: 20,000+ questions, full explanations, peer statistics, question/test sharing, solo/group learning, medical library, summary flashcards, heatmap.
- MedFlash: past-exam questions, timed mocks, mistake review, saved questions, medical terminology with spaced repetition, synced progress, images/tables, post-answer explanations.
- Osmosis: adaptive study schedule, QBank/quiz builder, spaced-repetition flashcards, high-yield notes, visual learning, mobile.

## Implemented in Phase 31

### Learning loop
QBank answer → mistake detection → one-tap flashcard creation → SRS review → readiness/analytics → targeted practice.

### Israel-first reconstruction workflow
- Reconstruction year selector in the QBank.
- Server-side reconstruction-year filtering.
- Reconstruction-aware pool counts.
- Reconstruction metadata stored in the study-session configuration.
- Visible `שחזור + year` badge in the question session.

### Speed / usability
- One-tap Quick Start sessions: Smart 20, Fix Mistakes, Fresh Questions, Saved Questions.
- Private searchable Notebook for all QBank notes.
- Keyboard navigation in QBank: 1–9 answer, Enter submit, M mark, arrow next.
- Responsive layouts and RTL/LTR support remain intact.

### Competitive analytics
- Readiness Index with transparent formula.
- Weekly activity target.
- Confidence calibration gap.
- Privacy-thresholded peer percentile.
- Branch-level accuracy Heatmap.
- Weak-topic and mastery views.

### Security / architecture
- New learning mutations remain server-authoritative through Supabase RPCs.
- Flashcard creation from a question validates publication/access and prevents duplicate cards from the same question for a learner.
- Existing RLS, authorization, rate limits, audit, legal, accessibility, and Under Construction controls remain in the project.

## Deliberate roadmap — not falsely marked as implemented

The following require substantial content/infrastructure to genuinely compete at AMBOSS/UWorld depth and should not be faked with placeholder features:

1. Large original high-quality medical library with clinician-reviewed articles.
2. Clinical calculators and differential-diagnosis tools.
3. Rich image/ECG/pathology learning library and image overlays.
4. Full prebuilt flashcard decks at UWorld/AMBOSS scale.
5. Self-assessment scoring validated against a real psychometric model.
6. True offline/PWA/mobile-native delivery.
7. Group classrooms, instructor assignment and cohort analytics.
8. Question discussions/comments with moderation.
9. Browser extension / global medical term popovers.
10. AI tutor and generation tools when the product is ready for controlled API spending.

## Important content point

A published historical exam question is not automatically public-domain or free to reproduce merely because it is accessible online. MDvoro therefore uses the `שחזור` label and independent-platform disclaimer without claiming official ownership, endorsement, or public-domain status. A rights complaint/removal channel remains part of the launch architecture.
