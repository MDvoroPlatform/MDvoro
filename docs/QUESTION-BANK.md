# MDvoro Question Bank

## Content flow

`Import JSON/CSV → validate → atomic draft import → medical review → publish → QBank delivery → server-side answer validation → learning graph`

### Import format

Required fields:
- `examId` UUID
- `stem`
- `subject`
- `options` array with at least two `{id,text}` objects
- `answerKey`

Optional:
- `topic`
- `explanation`
- `keyLearningPoint`
- `difficulty` 1–5
- `mediaIds`

CSV uses `option_a` through `option_e` and the same semantic fields.

## Safety contract

- Imported content is always `draft`.
- Publishing requires the review workflow.
- Answer keys are never returned by question-delivery RPCs.
- After submission, the correct option may be returned for review.
- Premium delivery is checked server-side.
- Media storage URLs are signed server-side.
- AI-generated questions/explanations are suggestions only and cannot auto-publish.

## Scale boundary

The current import transaction accepts up to 2,000 questions. For larger catalogs, use multiple validated batches rather than a single oversized request.
